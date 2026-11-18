import { declinationAt, createSimulator, type SimulatorScript } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { fromDeg } from '../degrees';
import { sceneFromOffsets, type SceneSpec } from './scene-from-offsets';
import {
  scriptForStation,
  MAX_SCRIPT_ALTITUDE_RAD,
  SCRIPT_START_UTC_MS,
} from './script-for-station';
import { targetDirection } from './target-direction';
import { CATALOGUE_CALIBRATION, CATALOGUE_ORIGIN } from './catalogue';

const SIMULATOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

const SPEC: SceneSpec = {
  id: 'two-posts',
  name: 'Two posts',
  origin: CATALOGUE_ORIGIN,
  calibration: CATALOGUE_CALIBRATION,
  stations: [
    { id: 'west', name: 'West', eastM: -800, northM: 0 },
    { id: 'east', name: 'East', eastM: 800, northM: 0 },
  ],
  targets: [
    { kind: 'landmark', id: 'tower', label: 'Tower', eastM: 0, northM: 3000, heightM: 60 },
    {
      kind: 'sun',
      id: 'sun',
      label: 'Sun',
      azimuthRad: fromDeg(200),
      apparentAltitudeRad: fromDeg(35),
      angularRadiusRad: fromDeg(0.267),
    },
  ],
};

function scene() {
  const built = sceneFromOffsets(SPEC);
  if (!built.ok) throw new Error(built.reason);
  return built.value;
}

function script(stationId = 'west', aimTargetId = 'tower', options = {}): SimulatorScript {
  const made = scriptForStation(scene(), stationId, aimTargetId, options);
  if (!made.ok) throw new Error(`${made.reason} ${made.field ?? ''}`);
  return made.value;
}

describe('scriptForStation: the script of one Station (Req 17.13)', () => {
  it('points at the Target from the Station and holds that pose', () => {
    const s = scene();
    const station = s.stations[0];
    const target = s.targets[0];
    if (station === undefined || target === undefined) throw new Error('scene');
    const direction = targetDirection(station, target);
    if (!direction.ok) throw new Error(direction.reason);
    const made = script('west', 'tower');
    expect(made.pose).toHaveLength(1);
    expect(made.pose[0]).toEqual({
      timeUtcMs: made.startUtcMs,
      azimuthRad: direction.value.azimuthRad,
      apparentAltitudeRad: direction.value.apparentAltitudeRad,
      rollRad: 0,
    });
  });

  it('aims at the Sun by its given direction', () => {
    const made = script('east', 'sun');
    expect(made.pose[0]?.azimuthRad).toBe(fromDeg(200));
    expect(made.pose[0]?.apparentAltitudeRad).toBe(fromDeg(35));
  });

  it("has the catalogue's defaults when given no options", () => {
    const made = script();
    expect(made.startUtcMs).toBe(SCRIPT_START_UTC_MS);
    expect(made.startUtcMs).toBe(1_790_000_000_000);
    expect(made.eventIntervalMs).toBe(50);
    expect(made.orientationNoiseSigmaRad).toBe(0);
    expect(made.altitudeBiasRad).toBe(0);
    expect(made.frame).toEqual({ kind: 'absolute', northErrorRad: 0, resets: [] });
    expect(made.heading).toBeNull();
    expect(made.screenAngleDeg).toBe(0);
    expect(made.orientation).toBe('available');
    expect(made.orientationPermission).toBe('not_required');
    expect(made.secureContext).toBe(true);
    expect(made.position?.kind).toBe('fix');
    if (made.position?.kind === 'fix') {
      expect(made.position.reportedAccuracyM).toBe(5);
      expect(made.position.firstFixDelayMs).toBe(0);
      expect(made.position.fixIntervalMs).toBe(1000);
      expect(made.position.position).toEqual(scene().stations[0]?.position);
    }
  });

  it("sets the Declination of the Station at the script's start", () => {
    const s = scene();
    const station = s.stations[1];
    if (station === undefined) throw new Error('scene');
    const expected = declinationAt(station.position, SCRIPT_START_UTC_MS);
    if (!expected.ok) throw new Error(expected.reason);
    expect(script('east').declinationRad).toBe(expected.value.declinationRad);
  });

  it('carries every option into the script', () => {
    const made = script('west', 'tower', {
      startUtcMs: 1_800_000_000_000,
      orientationNoiseSigmaRad: fromDeg(0.2),
      altitudeBiasRad: fromDeg(-3.3),
      frame: { kind: 'relative', zeroRad: 1.1, resets: [] },
      heading: { biasRad: 0, noiseSigmaRad: fromDeg(0.3), jumps: [], reportedAccuracyDeg: 10 },
      fixAccuracyM: 840,
      eventIntervalMs: 20,
      screenAngleDeg: 90,
      orientationPermission: 'denied',
      orientation: 'missing',
      secureContext: false,
    });
    expect(made.startUtcMs).toBe(1_800_000_000_000);
    expect(made.pose[0]?.timeUtcMs).toBe(1_800_000_000_000);
    expect(made.orientationNoiseSigmaRad).toBe(fromDeg(0.2));
    expect(made.altitudeBiasRad).toBe(fromDeg(-3.3));
    expect(made.frame.kind).toBe('relative');
    expect(made.heading?.reportedAccuracyDeg).toBe(10);
    expect(made.position?.kind === 'fix' && made.position.reportedAccuracyM).toBe(840);
    expect(made.eventIntervalMs).toBe(20);
    expect(made.screenAngleDeg).toBe(90);
    expect(made.orientationPermission).toBe('denied');
    expect(made.orientation).toBe('missing');
    expect(made.secureContext).toBe(false);
  });

  it("lets an option replace the Station's fix (a denied location)", () => {
    const made = script('west', 'tower', {
      position: { kind: 'failure', reason: 'permission_denied' },
    });
    expect(made.position).toEqual({ kind: 'failure', reason: 'permission_denied' });
  });

  it('builds a script the Simulator accepts', () => {
    const created = createSimulator(script(), 1, SIMULATOR_OPTIONS);
    expect(created.ok).toBe(true);
  });
});

describe('scriptForStation: what it refuses (Req 17.13)', () => {
  it('names an unknown Station', () => {
    const r = scriptForStation(scene(), 'north', 'tower');
    expect(r).toMatchObject({ ok: false, reason: 'invalid_number', field: 'stationId' });
  });

  it('names an unknown Target', () => {
    const r = scriptForStation(scene(), 'west', 'chimney');
    expect(r).toMatchObject({ ok: false, reason: 'invalid_number', field: 'aimTargetId' });
  });

  it("passes checkScene's own failure through, naming its field", () => {
    const bad = { ...scene(), name: ' ' };
    const r = scriptForStation(bad, 'west', 'tower');
    expect(r).toMatchObject({ ok: false, reason: 'invalid_number', field: 'name' });
  });

  it('refuses a Target under 1 m away with coincident_positions', () => {
    const built = sceneFromOffsets({
      ...SPEC,
      targets: [
        { kind: 'landmark', id: 'near', label: 'Near', eastM: -800, northM: 0.5, heightM: 5 },
      ],
    });
    if (!built.ok) throw new Error(built.reason);
    const r = scriptForStation(built.value, 'west', 'near');
    expect(r).toMatchObject({ ok: false, reason: 'coincident_positions' });
  });

  it.each([
    ['startUtcMs', { startUtcMs: Number.NaN }, 'startUtcMs'],
    ['fixAccuracyM', { fixAccuracyM: Number.POSITIVE_INFINITY }, 'fixAccuracyM'],
    [
      'orientationNoiseSigmaRad',
      { orientationNoiseSigmaRad: Number.NaN },
      'orientationNoiseSigmaRad',
    ],
    [
      'frame.northErrorRad',
      { frame: { kind: 'absolute', northErrorRad: Number.NaN, resets: [] } },
      'frame.northErrorRad',
    ],
    [
      'frame.zeroRad',
      { frame: { kind: 'relative', zeroRad: Number.NEGATIVE_INFINITY, resets: [] } },
      'frame.zeroRad',
    ],
    [
      'heading.noiseSigmaRad',
      { heading: { biasRad: 0, noiseSigmaRad: Number.NaN, jumps: [], reportedAccuracyDeg: 10 } },
      'heading.noiseSigmaRad',
    ],
  ])('names a number that is not finite: %s', (_label, options, field) => {
    const r = scriptForStation(scene(), 'west', 'tower', options as never);
    expect(r).toMatchObject({ ok: false, reason: 'invalid_number', field });
  });

  it("gives Sensors' failure for a start time the Declination model does not cover", () => {
    const s = scene();
    const station = s.stations[0];
    if (station === undefined) throw new Error('scene');
    const start = 1_500_000_000_000; // 2017: before the model's years
    const expected = declinationAt(station.position, start);
    expect(expected.ok).toBe(false);
    const r = scriptForStation(s, 'west', 'tower', { startUtcMs: start });
    expect(r.ok).toBe(false);
    if (!r.ok && !expected.ok) expect(r.reason).toBe(expected.reason);
  });
});

describe("scriptForStation: the altitude is clamped to the Simulator's limit (Req 17.15)", () => {
  const nearAndHigh = (): ReturnType<typeof sceneFromOffsets> =>
    sceneFromOffsets({
      ...SPEC,
      targets: [
        { kind: 'landmark', id: 'up', label: 'Up', eastM: -800, northM: 1.5, heightM: 4000 },
      ],
    });

  it('is 80° for a Target almost overhead, and the Simulator accepts the script', () => {
    const built = nearAndHigh();
    if (!built.ok) throw new Error(built.reason);
    const station = built.value.stations[0];
    const target = built.value.targets[0];
    if (station === undefined || target === undefined) throw new Error('scene');
    const direction = targetDirection(station, target);
    if (!direction.ok) throw new Error(direction.reason);
    expect(direction.value.apparentAltitudeRad).toBeGreaterThan(fromDeg(80));
    const made = scriptForStation(built.value, 'west', 'up');
    if (!made.ok) throw new Error(made.reason);
    expect(made.value.pose[0]?.apparentAltitudeRad).toBe(MAX_SCRIPT_ALTITUDE_RAD);
    expect(made.value.pose[0]?.azimuthRad).toBe(direction.value.azimuthRad);
    expect(createSimulator(made.value, 1, SIMULATOR_OPTIONS).ok).toBe(true);
  });

  it("is the Simulator's own limit: 80° is accepted and a hair above it is refused", () => {
    expect(Math.abs(MAX_SCRIPT_ALTITUDE_RAD - fromDeg(80))).toBeLessThanOrEqual(1e-15);
    const base = script();
    const at = (altitudeRad: number): SimulatorScript => ({
      ...base,
      pose: [
        {
          ...(base.pose[0] as NonNullable<(typeof base.pose)[0]>),
          apparentAltitudeRad: altitudeRad,
        },
      ],
    });
    expect(createSimulator(at(MAX_SCRIPT_ALTITUDE_RAD), 1, SIMULATOR_OPTIONS).ok).toBe(true);
    expect(createSimulator(at(MAX_SCRIPT_ALTITUDE_RAD + 1e-9), 1, SIMULATOR_OPTIONS).ok).toBe(
      false,
    );
  });

  it('clamps a Target almost straight down to -80°', () => {
    const built = sceneFromOffsets({
      ...SPEC,
      targets: [
        { kind: 'landmark', id: 'pit', label: 'Pit', eastM: -800, northM: 1.5, heightM: -4000 },
      ],
    });
    if (!built.ok) throw new Error(built.reason);
    const made = scriptForStation(built.value, 'west', 'pit');
    if (!made.ok) throw new Error(made.reason);
    expect(made.value.pose[0]?.apparentAltitudeRad).toBe(-MAX_SCRIPT_ALTITUDE_RAD);
  });
});
