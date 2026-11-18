import { greatCircleDistanceM, wrapPi } from '@alidade/core';
import { createSimulator, declinationAt, type SensorSource } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { checkCalibration } from '../math/camera-calibration';
import { fromDeg } from '../math/degrees';
import { messageFor } from '../math/messages';
import {
  buildCatalogue,
  CATALOGUE_CALIBRATION,
  CATALOGUE_ORIGIN,
  CATALOGUE_START_UTC_MS,
  type CatalogueScene,
} from '../math/scene/catalogue';
import { targetDirection } from '../math/scene/target-direction';
import type { Session } from '../math/session/session';
import { FakeTimer } from '../test-support/fake-timer';
import { PARAMETERS } from '../test-support/session-fixtures';
import { createSessionDriver } from './session-driver';

const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

const built = buildCatalogue();
if (!built.ok) throw new Error(built.reason);
const CATALOGUE = built.value;

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/** Drives a scene's first Station through the real driver and returns the Sessions it showed. */
async function drive(entry: CatalogueScene): Promise<{ sessions: Session[]; last: Session }> {
  const station = entry.scene.stations[0];
  if (station === undefined) throw new Error('station');
  const script = entry.scripts[station.id];
  if (script === undefined) throw new Error('script');
  const created = createSimulator(script, 1, OPTIONS);
  if (!created.ok) throw new Error(created.reason);
  const { source, controls } = created.value;
  const timer = new FakeTimer();
  const sessions: Session[] = [];
  const driver = createSessionDriver({
    source,
    kind: entry.kind,
    parameters: PARAMETERS,
    timer,
    onSession: (s) => sessions.push(s),
  });
  if (!driver.ok) throw new Error(driver.reason);
  const d = driver.value;
  const advanceTo = async (offsetMs: number) => {
    while (source.now() < script.startUtcMs + offsetMs) {
      controls.advanceTo(Math.min(source.now() + 50, script.startUtcMs + offsetMs));
      timer.advance(50);
      await flush();
    }
  };
  await d.requestPermission();
  await flush();
  await advanceTo(1500);
  if (entry.scene.id === 'compass-jumps' || entry.scene.id === 'frame-reset') {
    d.dispatch({ kind: 'establishYaw', from: { kind: 'compass' } });
  }
  if (entry.scene.id === 'frame-reset') await advanceTo(4500);
  d.dispatch({ kind: 'freeze' });
  d.dispatch({ kind: 'capture' });
  d.stop();
  return { sessions, last: d.session() };
}

/** The failure the screen shows last: the Session's failure, or its Notice. */
function shown(s: Session): string | null {
  return s.failure?.reason ?? s.notice?.reason ?? null;
}

describe('the catalogue (Req 17.1 to 17.3, D16)', () => {
  it('holds the eleven scenes of Req 17.2, each with at least two Stations', () => {
    expect(CATALOGUE.map((c) => c.scene.id)).toEqual([
      'steady',
      'iphone',
      'compass-jumps',
      'frame-reset',
      'coarse',
      'location-denied',
      'permission-required',
      'permission-denied',
      'sensor-missing',
      'insecure',
      'sun',
    ]);
    for (const c of CATALOGUE) expect(c.scene.stations.length).toBeGreaterThanOrEqual(2);
  });

  it('builds every Position within 50 km of a synthetic origin inside the WMM window and outside the blackout zone', () => {
    expect(declinationAt(CATALOGUE_ORIGIN, CATALOGUE_START_UTC_MS).ok).toBe(true);
    for (const c of CATALOGUE) {
      const positions = [
        ...c.scene.stations.map((s) => s.position),
        ...c.scene.targets.flatMap((t) => (t.kind === 'landmark' ? [t.position] : [])),
      ];
      for (const p of positions) {
        const d = greatCircleDistanceM(CATALOGUE_ORIGIN, p);
        expect(d.ok && d.value).toBeLessThan(50_000);
      }
    }
  });

  for (const c of CATALOGUE) {
    it(`${c.scene.id}: every script validates, starts on its Target and holds the pose for 10 s, with the scene's calibration`, () => {
      expect(c.scene.calibration).toEqual(CATALOGUE_CALIBRATION);
      expect(checkCalibration(c.scene.calibration).ok).toBe(true);
      const target = c.scene.targets.find((t) => t.id === c.aimTargetId);
      if (target === undefined) throw new Error('target');
      for (const station of c.scene.stations) {
        const script = c.scripts[station.id];
        if (script === undefined) throw new Error('script');
        const created = createSimulator(script, 7, OPTIONS);
        if (!created.ok) throw new Error(created.reason);
        const direction = targetDirection(station, target);
        if (!direction.ok) throw new Error(direction.reason);
        for (const offsetMs of [0, 10_000]) {
          created.value.controls.advanceTo(script.startUtcMs + offsetMs);
          const pose = created.value.controls.truePose();
          const az = wrapPi(pose.azimuthRad - direction.value.azimuthRad);
          expect(az.ok && Math.abs(az.value)).toBeLessThan(1e-12);
          expect(
            Math.abs(pose.apparentAltitudeRad - direction.value.apparentAltitudeRad),
          ).toBeLessThan(1e-12);
        }
        // The declination of the script is WMM2025's at the Station (D16).
        const declination = declinationAt(station.position, script.startUtcMs);
        expect(declination.ok && declination.value.declinationRad).toBe(script.declinationRad);
      }
    });
  }
});

describe('each scene shows a different Message when its failure is reached (Req 17.2)', () => {
  it('drives every scene through the driver', async () => {
    const reached = new Map<string, string | null>();
    for (const c of CATALOGUE) {
      if (c.scene.id === 'permission-required') continue;
      const { last } = await drive(c);
      reached.set(c.scene.id, shown(last));
      if (c.failure === null) {
        expect(last.state, c.scene.id).toBe('captured');
        expect(shown(last), c.scene.id).toBeNull();
      } else {
        expect(shown(last), c.scene.id).toBe(c.failure);
      }
    }
    // Permission required: started without the user's tap (as a page that never asks), the
    // source sends nothing and the start fails with permission_required.
    const scene = CATALOGUE.find((c) => c.scene.id === 'permission-required');
    const station = scene?.scene.stations[0];
    const script = station === undefined ? undefined : scene?.scripts[station.id];
    if (script === undefined) throw new Error('scene');
    const created = createSimulator(script, 1, OPTIONS);
    if (!created.ok) throw new Error('simulator');
    const source: SensorSource = created.value.source;
    let result: string | null = null;
    void source.startOrientation().then((r) => (result = r.ok ? null : r.reason));
    created.value.controls.advanceTo(script.startUtcMs + 3100);
    await flush();
    expect(result).toBe('permission_required');
    reached.set('permission-required', result);

    const failures = CATALOGUE.filter((c) => c.failure !== null);
    const messages = failures.map((c) =>
      JSON.stringify(
        messageFor({ ok: false, reason: c.failure ?? 'invalid_number', reportedAccuracyM: 840 }),
      ),
    );
    expect(new Set(messages).size).toBe(failures.length);
    expect(failures).toHaveLength(9);
  });

  it('the steady scene captures the Tower within a few hundredths of a degree, the Sun scene its altitude', async () => {
    for (const id of ['steady', 'sun']) {
      const c = CATALOGUE.find((x) => x.scene.id === id);
      if (c === undefined) throw new Error(id);
      const { last } = await drive(c);
      const station = c.scene.stations[0];
      const target = c.scene.targets.find((t) => t.id === c.aimTargetId);
      if (station === undefined || target === undefined) throw new Error('scene');
      const direction = targetDirection(station, target);
      if (!direction.ok) throw new Error('direction');
      if (last.captured?.kind === 'bearing') {
        const d = wrapPi(last.captured.bearing.azimuthRad - direction.value.azimuthRad);
        expect(d.ok && Math.abs(d.value)).toBeLessThan(fromDeg(0.05));
      } else if (last.captured?.kind === 'altitude') {
        expect(
          Math.abs(
            last.captured.altitude.apparentAltitudeRad - direction.value.apparentAltitudeRad,
          ),
        ).toBeLessThan(fromDeg(0.05));
      } else {
        throw new Error(`${id}: ${shown(last)}`);
      }
    }
  });
});
