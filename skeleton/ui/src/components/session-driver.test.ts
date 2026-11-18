import {
  createSimulator,
  type SensorSource,
  type SimulatorControls,
  type SimulatorScript,
} from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import type { Session } from '../math/session/session';
import { FakeTimer } from '../test-support/fake-timer';
import {
  FIXTURE_DECLINATION,
  PARAMETERS,
  T0,
  fixtureScript,
} from '../test-support/session-fixtures';
import { createSessionDriver, type SessionDriver } from './session-driver';

const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

const RELATIVE: Partial<SimulatorScript> = {
  frame: { kind: 'relative', zeroRad: 2, resets: [] },
  heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
  pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.1, rollRad: 0 }],
};

/** Lets every pending promise settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

interface Harness {
  driver: SessionDriver;
  controls: SimulatorControls;
  source: SensorSource;
  timer: FakeTimer;
  sessions: Session[];
  subscriptions: { count: number; live: number };
  advance(ms: number): Promise<void>;
}

function harness(
  script: SimulatorScript,
  kind: 'bearing' | 'altitude' = 'bearing',
  over: { wrap?: (s: SensorSource) => SensorSource; onSession?: (s: Session) => void } = {},
): Harness {
  const created = createSimulator(script, 1, OPTIONS);
  if (!created.ok) throw new Error(created.reason);
  const { controls } = created.value;
  const subscriptions = { count: 0, live: 0 };
  const counted = (add: (l: never) => () => void) => (listener: never) => {
    subscriptions.count += 1;
    subscriptions.live += 1;
    const remove = add(listener);
    let removed = false;
    return () => {
      if (!removed) subscriptions.live -= 1;
      removed = true;
      remove();
    };
  };
  const base = created.value.source;
  const countedSource: SensorSource = {
    ...base,
    onOrientation: counted(base.onOrientation as (l: never) => () => void),
    onFrameReset: counted(base.onFrameReset as (l: never) => () => void),
    onPosition: counted(base.onPosition as (l: never) => () => void),
  };
  const source = over.wrap ? over.wrap(countedSource) : countedSource;
  const timer = new FakeTimer();
  const sessions: Session[] = [];
  const driver = createSessionDriver({
    source,
    kind,
    parameters: PARAMETERS,
    timer,
    onSession: (s) => {
      sessions.push(s);
      over.onSession?.(s);
    },
  });
  if (!driver.ok) throw new Error(driver.reason);
  return {
    driver: driver.value,
    controls,
    source,
    timer,
    sessions,
    subscriptions,
    async advance(ms: number) {
      for (let done = 0; done < ms; done += 50) {
        controls.advanceTo(source.now() + Math.min(50, ms - done));
        timer.advance(Math.min(50, ms - done));
        await flush();
      }
    },
  };
}

async function toLive(h: Harness): Promise<void> {
  await h.driver.requestPermission();
  await flush();
  await h.advance(1500);
}

describe('createSessionDriver (Req 9.7, 9.8, 9.12)', () => {
  it('refuses invalid parameters, naming them', () => {
    const created = createSimulator(fixtureScript(), 1, OPTIONS);
    if (!created.ok) throw new Error('simulator');
    const driver = createSessionDriver({
      source: created.value.source,
      kind: 'bearing',
      parameters: { ...PARAMETERS, readoutIntervalMs: 0 },
      timer: new FakeTimer(),
      onSession: () => undefined,
    });
    expect(driver).toEqual({ ok: false, reason: 'invalid_number', field: 'readoutIntervalMs' });
  });

  it('does nothing until requestPermission: no subscription, no Timer', () => {
    const h = harness(fixtureScript());
    expect(h.subscriptions.count).toBe(0);
    expect(h.timer.running()).toBe(0);
    expect(h.driver.session().state).toBe('permission');
  });

  it('a start that settles: permission, start, live, readouts at the Readout interval', async () => {
    const h = harness(fixtureScript());
    await toLive(h);
    const s = h.driver.session();
    expect(s.state).toBe('live');
    expect(s.history.samples.length).toBeGreaterThan(10);
    expect(s.history.positionFix).not.toBeNull();
    expect(s.readout?.azimuth.ok).toBe(true);
    // Every event is stamped with the source's Clock.
    expect(s.nowUtcMs).toBe(h.source.now());
    // The readout is republished by the Timer's tick.
    expect(s.lastReadoutUtcMs).not.toBeNull();
    const stamps = new Set(h.sessions.map((x) => x.lastReadoutUtcMs));
    expect(stamps.size).toBeGreaterThan(3);
  });

  it('computes the Declination on every Position fix of a bearing Session, and none for altitude', async () => {
    const computed: number[] = [];
    const created = createSimulator(fixtureScript(), 1, OPTIONS);
    if (!created.ok) throw new Error('simulator');
    const timer = new FakeTimer();
    const driver = createSessionDriver({
      source: created.value.source,
      kind: 'bearing',
      parameters: PARAMETERS,
      timer,
      onSession: () => undefined,
      computeDeclination: (_position, timeUtcMs) => {
        computed.push(timeUtcMs);
        return { ok: true, value: FIXTURE_DECLINATION };
      },
    });
    if (!driver.ok) throw new Error('driver');
    await driver.value.requestPermission();
    for (let t = 0; t < 3000; t += 100) {
      created.value.controls.advanceTo(T0 + t + 100);
      await flush();
    }
    // The script gives a fix every 1000 ms from the start: at 0, 1000, 2000 and 3000 ms.
    expect(computed).toEqual([T0, T0 + 1000, T0 + 2000, T0 + 3000]);
    expect(driver.value.session().declination).toEqual(FIXTURE_DECLINATION);
    // An altitude Session never asks for a Declination (Req 8.13): none is computed.
    const altitudeCalls: number[] = [];
    const altitudeSim = createSimulator(fixtureScript(), 1, OPTIONS);
    if (!altitudeSim.ok) throw new Error('simulator');
    const altitudeDriver = createSessionDriver({
      source: altitudeSim.value.source,
      kind: 'altitude',
      parameters: PARAMETERS,
      timer: new FakeTimer(),
      onSession: () => undefined,
      computeDeclination: (_p, t) => {
        altitudeCalls.push(t);
        return { ok: true, value: FIXTURE_DECLINATION };
      },
    });
    if (!altitudeDriver.ok) throw new Error('driver');
    await altitudeDriver.value.requestPermission();
    // Even when something else starts positions on the shared source.
    void altitudeSim.value.source.startPosition();
    altitudeSim.value.controls.advanceTo(T0 + 3000);
    await flush();
    expect(altitudeCalls).toEqual([]);
    const altitude = harness(fixtureScript(), 'altitude');
    await toLive(altitude);
    expect(altitude.driver.session().declination).toBeNull();
    expect(altitude.driver.session().history.positionFix).toBeNull();
  });

  it('permission denied: failed with permission_denied', async () => {
    const h = harness(fixtureScript({ orientationPermission: 'denied' }));
    await h.driver.requestPermission();
    await flush();
    expect(h.driver.session().state).toBe('failed');
    expect(h.driver.session().failure?.reason).toBe('permission_denied');
  });

  it('permission required: a source that skips the request fails with permission_required', async () => {
    const h = harness(fixtureScript({ orientationPermission: 'granted' }), 'bearing', {
      wrap: (source) => ({
        ...source,
        requestOrientationPermission: () => Promise.resolve({ ok: true, value: 'not_required' }),
      }),
    });
    await h.driver.requestPermission();
    await flush();
    expect(h.driver.session().state).toBe('starting');
    await h.advance(3100);
    expect(h.driver.session().state).toBe('failed');
    expect(h.driver.session().failure?.reason).toBe('permission_required');
  });

  it('sensor missing: failed with sensor_unavailable', async () => {
    const h = harness(fixtureScript({ orientation: 'missing' }));
    await h.driver.requestPermission();
    await flush();
    expect(h.driver.session().failure?.reason).toBe('sensor_unavailable');
  });

  it('insecure context: failed with insecure_context before anything starts', async () => {
    const h = harness(fixtureScript({ secureContext: false }));
    await h.driver.requestPermission();
    await flush();
    expect(h.driver.session().state).toBe('failed');
    expect(h.driver.session().failure?.reason).toBe('insecure_context');
  });

  it('a failing start result delivered in live is a Notice, and the Session stays live', async () => {
    const h = harness(
      fixtureScript({ position: { kind: 'failure', reason: 'position_unavailable' } }),
    );
    await toLive(h);
    expect(h.driver.session().state).toBe('live');
    const notices = h.sessions.map((s) => s.notice?.reason).filter((r) => r !== undefined);
    expect(notices).toContain('position_unavailable');
  });

  it("a restart invalidates the Yaw reference through the source's restart reset", async () => {
    const h = harness(fixtureScript(RELATIVE));
    await toLive(h);
    h.driver.dispatch({ kind: 'establishYaw', from: { kind: 'compass' } });
    const y = h.driver.session().yawReference;
    expect(y).not.toBeNull();
    h.driver.camera({ ok: false, reason: 'camera_track_ended' });
    expect(h.driver.session().state).toBe('failed');
    h.driver.dispatch({ kind: 'restart' });
    await flush();
    await h.advance(1500);
    const s = h.driver.session();
    expect(s.state).toBe('live');
    expect(s.yawReference).toEqual(y);
    expect(s.history.frameResets.map((r) => r.cause)).toContain('restart');
    // The readout no longer trusts the reference: the azimuth is relative again.
    expect(s.readout?.azimuth.ok && s.readout.azimuth.value.northReference).toBe('relative');
    h.driver.dispatch({ kind: 'freeze' });
    h.driver.dispatch({ kind: 'capture' });
    expect(h.driver.session().notice?.reason).toBe('frame_reset');
  });

  it('starting twice subscribes once', async () => {
    const h = harness(fixtureScript());
    await h.driver.requestPermission();
    await h.driver.requestPermission();
    expect(h.subscriptions.count).toBe(3);
    expect(h.timer.running()).toBe(1);
  });

  it('stop removes every listener and Timer, ignores later settlements, and is idempotent', async () => {
    const h = harness(fixtureScript());
    await toLive(h);
    const count = h.sessions.length;
    const before = h.driver.session();
    h.driver.stop();
    h.driver.stop();
    expect(h.subscriptions.live).toBe(0);
    expect(h.timer.running()).toBe(0);
    await h.advance(2000);
    h.driver.dispatch({ kind: 'freeze' });
    await h.driver.requestPermission();
    expect(h.sessions.length).toBe(count);
    expect(h.driver.session()).toBe(before);
  });

  it('a throwing onSession does not stop the driver', async () => {
    const h = harness(fixtureScript(), 'bearing', {
      onSession: () => {
        throw new Error('listener');
      },
    });
    await toLive(h);
    expect(h.driver.session().state).toBe('live');
  });
});

describe('every transition of Req 8.3 through the driver (Req 21.4)', () => {
  it('permission -> starting -> live -> frozen -> live -> frozen -> captured -> live', async () => {
    const h = harness(fixtureScript());
    const states: string[] = [];
    const record = () => states.push(h.driver.session().state);
    record();
    await h.driver.requestPermission();
    record();
    await h.advance(1500);
    record();
    h.driver.dispatch({ kind: 'freeze' });
    record();
    h.driver.dispatch({ kind: 'unfreeze' });
    record();
    await h.advance(100);
    h.driver.dispatch({ kind: 'freeze' });
    record();
    h.driver.dispatch({ kind: 'capture' });
    record();
    h.driver.dispatch({ kind: 'again' });
    record();
    expect(states).toEqual([
      'permission',
      'starting',
      'live',
      'frozen',
      'live',
      'frozen',
      'captured',
      'live',
    ]);
  });

  it('permission -> failed -> permission; starting -> failed; camera failures', async () => {
    const denied = harness(fixtureScript({ orientationPermission: 'denied' }));
    await denied.driver.requestPermission();
    await flush();
    expect(denied.driver.session().state).toBe('failed');
    denied.driver.dispatch({ kind: 'restart' });
    expect(denied.driver.session().state).toBe('permission');
    await flush();
    expect(denied.driver.session().state).toBe('failed');

    const missing = harness(
      fixtureScript({ orientation: 'missing', orientationPermission: 'granted' }),
    );
    await missing.driver.requestPermission();
    await flush();
    expect(missing.sessions.map((x) => x.state)).toEqual(['starting', 'failed']);

    for (const target of ['live', 'frozen', 'captured'] as const) {
      const h = harness(fixtureScript());
      await toLive(h);
      if (target !== 'live') h.driver.dispatch({ kind: 'freeze' });
      if (target === 'captured') h.driver.dispatch({ kind: 'capture' });
      expect(h.driver.session().state).toBe(target);
      h.driver.camera({ ok: false, reason: 'camera_busy' });
      expect(h.driver.session().state).toBe(target === 'captured' ? 'captured' : 'failed');
      if (target === 'captured') expect(h.driver.session().notice?.reason).toBe('camera_busy');
    }
  });
});
