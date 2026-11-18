import { describe, expect, it } from 'vitest';
import type { FrameResetEvent } from '../frame-reset';
import type { OrientationSample } from '../orientation-sample';
import type { PositionFix } from '../position-fix';
import type { SensorResult } from '../sensor-result';
import type { SensorSource, SensorSourceOptions } from '../sensor-source';
import {
  FakeBrowserEnvironment,
  orientationEvent,
  type FakeBrowserOptions,
} from '../test-support/fake-browser';
import { expectOk } from '../test-support/result-helpers';
import { createBrowserSensorSource } from './browser-sensor-source';

const OPTIONS: SensorSourceOptions = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};
const UPRIGHT = orientationEvent({ alpha: 10, beta: 90, gamma: 0 });

function setup(fake: FakeBrowserOptions = {}, options: Partial<SensorSourceOptions> = {}) {
  const env = new FakeBrowserEnvironment(fake);
  const source = expectOk(createBrowserSensorSource(env, env.clock, { ...OPTIONS, ...options }));
  const samples: SensorResult<OrientationSample>[] = [];
  const resets: FrameResetEvent[] = [];
  const fixes: SensorResult<PositionFix>[] = [];
  const log: string[] = [];
  source.onOrientation((s) => {
    samples.push(s);
    log.push(s.ok ? `sample:${s.value.frame}` : `sample-failure:${s.reason}`);
  });
  source.onFrameReset((r) => {
    resets.push(r);
    log.push(`reset:${r.cause}`);
  });
  source.onPosition((f) => fixes.push(f));
  return { env, source, samples, resets, fixes, log };
}

/** Lets settled promises run their continuations. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

/** Records when a promise settles, so a test can check that it has not yet. */
function track<T>(promise: Promise<T>): { settled: () => boolean; value: () => T | undefined } {
  let done = false;
  let result: T | undefined;
  void promise.then((value) => {
    done = true;
    result = value;
  });
  return { settled: () => done, value: () => result };
}

const SENSOR_CALLS = [
  'addWindowListener',
  'addVisibilityListener',
  'watchPosition',
  'requestPermission',
  'setTimer',
  'screenAngleDeg',
];

describe('browser Adapter: secure context, missing sensors, permission (Req 11.2 to 11.7)', () => {
  it('refuses an insecure page before touching any sensor API (Req 11.7)', async () => {
    const { env, source } = setup({ isSecureContext: false, permission: 'granted' });
    expect(await source.startOrientation()).toEqual({ ok: false, reason: 'insecure_context' });
    expect(await source.startPosition()).toEqual({ ok: false, reason: 'insecure_context' });
    expect(await source.requestOrientationPermission()).toEqual({
      ok: false,
      reason: 'insecure_context',
    });
    expect(env.calls.filter((call) => SENSOR_CALLS.some((name) => call.startsWith(name)))).toEqual(
      [],
    );
  });

  it('reports missing sensors (Req 11.6)', async () => {
    expect(await setup({ hasDeviceOrientation: false }).source.startOrientation()).toEqual({
      ok: false,
      reason: 'sensor_unavailable',
    });
    expect(await setup({ hasGeolocation: false }).source.startPosition()).toEqual({
      ok: false,
      reason: 'sensor_unavailable',
    });
  });

  it('reports sensor_unavailable when only null angles arrive within the timeout, as desktop Chrome sends (Req 11.5)', async () => {
    const { env, source, samples } = setup();
    const start = track(source.startOrientation());
    env.dispatch('deviceorientation', orientationEvent({ alpha: null, beta: null, gamma: null }));
    env.advance(2999);
    await flush();
    expect(start.settled()).toBe(false);
    env.advance(1);
    await flush();
    expect(start.value()).toEqual({ ok: false, reason: 'sensor_unavailable' });
    expect(samples).toEqual([{ ok: false, reason: 'sensor_unavailable', field: 'alphaDeg' }]);
  });

  it('reports sensor_unavailable when an environment call throws (D20)', async () => {
    const { source } = setup({ throwOn: ['addWindowListener:deviceorientation'] });
    expect(await source.startOrientation()).toEqual({ ok: false, reason: 'sensor_unavailable' });
    const watching = setup({ throwOn: ['watchPosition'] });
    expect(await watching.source.startPosition()).toEqual({
      ok: false,
      reason: 'sensor_unavailable',
    });
  });

  it('refuses a Clock that does not work when the source is made', () => {
    const env = new FakeBrowserEnvironment();
    expect(createBrowserSensorSource(env, () => Number.NaN, OPTIONS)).toEqual({
      ok: false,
      reason: 'sensor_unavailable',
      field: 'clock',
    });
    expect(
      createBrowserSensorSource(env, env.clock, { ...OPTIONS, listeningTimeoutMs: -1 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'listeningTimeoutMs',
    });
  });

  it('asks for the orientation permission only when told to (Req 11.2 to 11.4)', async () => {
    expect(await setup().source.requestOrientationPermission()).toEqual({
      ok: true,
      value: 'not_required',
    });
    const granted = setup({ permission: 'granted' });
    expect(await granted.source.requestOrientationPermission()).toEqual({
      ok: true,
      value: 'granted',
    });
    expect(granted.env.count('requestPermission')).toBe(1);
    for (const permission of ['denied', 'reject'] as const) {
      expect(await setup({ permission }).source.requestOrientationPermission()).toEqual({
        ok: false,
        reason: 'permission_denied',
      });
    }
    const silent = setup({ permission: 'granted' });
    void silent.source.startOrientation();
    silent.env.advance(5000);
    expect(silent.env.count('requestPermission')).toBe(0);
  });

  it('reports permission_required after silence when the permission was never granted (Req 11.5)', async () => {
    const ios = setup({ permission: 'granted' });
    const start = track(ios.source.startOrientation());
    ios.env.advance(3000);
    await flush();
    expect(start.value()).toEqual({ ok: false, reason: 'permission_required' });

    const grantedButSilent = setup({ permission: 'granted' });
    await grantedButSilent.source.requestOrientationPermission();
    const after = track(grantedButSilent.source.startOrientation());
    grantedButSilent.env.advance(3000);
    await flush();
    expect(after.value()).toEqual({ ok: false, reason: 'sensor_unavailable' });

    const android = setup();
    const androidStart = track(android.source.startOrientation());
    android.env.advance(3000);
    await flush();
    expect(androidStart.value()).toEqual({ ok: false, reason: 'sensor_unavailable' });
  });

  it('delivers samples after a late grant, keeping its listeners after the timeout', async () => {
    const { env, source, samples } = setup({ permission: 'granted' });
    const start = track(source.startOrientation());
    env.advance(3000);
    await flush();
    expect(start.value()).toEqual({ ok: false, reason: 'permission_required' });
    env.dispatch('deviceorientation', UPRIGHT);
    expect(samples).toHaveLength(1);
  });
});

describe('browser Adapter: frames and samples (Req 4)', () => {
  it('listens only to deviceorientationabsolute where it exists (Req 4.2)', async () => {
    const { env, source, samples } = setup({ supportsAbsoluteOrientation: true });
    const start = source.startOrientation();
    expect(env.liveListeners('deviceorientationabsolute')).toBe(1);
    expect(env.liveListeners('deviceorientation')).toBe(0);
    env.dispatch('deviceorientation', UPRIGHT);
    expect(samples).toEqual([]);
    env.dispatch('deviceorientationabsolute', UPRIGHT);
    expect(await start).toEqual({ ok: true, value: 'absolute' });
    expect(samples[0]?.ok && samples[0].value.frame).toBe('absolute');
  });

  it('takes the frame from the event elsewhere; only a real true is absolute (Req 4.3)', async () => {
    const { env, source, samples } = setup();
    const start = source.startOrientation();
    env.dispatch('deviceorientation', { ...UPRIGHT, absolute: 1 });
    env.dispatch('deviceorientation', { ...UPRIGHT, absolute: 'true' });
    env.dispatch('deviceorientation', { ...UPRIGHT, absolute: true });
    expect(await start).toEqual({ ok: true, value: 'relative' });
    expect(samples.map((s) => s.ok && s.value.frame)).toEqual(['relative', 'relative', 'absolute']);
  });

  it('emits frame_change before a sample in a new frame (Req 4.8)', () => {
    const { env, source, log } = setup();
    void source.startOrientation();
    env.dispatch('deviceorientation', UPRIGHT);
    env.dispatch('deviceorientation', { ...UPRIGHT, absolute: true });
    env.dispatch('deviceorientation', { ...UPRIGHT, absolute: true });
    expect(log).toEqual([
      'sample:relative',
      'reset:frame_change',
      'sample:absolute',
      'sample:absolute',
    ]);
  });

  it('stamps samples with the injected Clock at dispatch, not the event time (Req 1.4)', () => {
    const { env, source, samples } = setup();
    void source.startOrientation();
    env.advance(1234);
    env.dispatch('deviceorientation', { ...UPRIGHT, timeStamp: 5 });
    expect(samples[0]?.ok && samples[0].value.timeUtcMs).toBe(env.nowUtcMs);
  });

  it('records the heading, its accuracy and the Screen angle (Req 4.5, 4.9)', () => {
    const { env, source, samples } = setup({ screenAngleDeg: 90 });
    void source.startOrientation();
    env.dispatch('deviceorientation', {
      ...UPRIGHT,
      webkitCompassHeading: 45,
      webkitCompassAccuracy: 10,
    });
    const sample = samples[0];
    expect(sample?.ok).toBe(true);
    if (!sample?.ok) return;
    expect(sample.value.magneticHeadingRad).toBeCloseTo(Math.PI / 4, 14);
    expect(sample.value.compassAccuracyRad).toBeCloseTo((10 * Math.PI) / 180, 14);
    expect(sample.value.screenAngleRad).toBeCloseTo(Math.PI / 2, 14);
  });

  it('emits a Frame reset for each page event, with its cause (Req 4.7)', () => {
    const { env, source, resets } = setup();
    void source.startOrientation();
    env.setVisibility('hidden');
    env.setVisibility('visible');
    env.dispatch('blur');
    env.dispatch('pagehide');
    expect(resets.map((r) => r.cause)).toEqual(['hidden', 'blur', 'pagehide']);
    expect(resets.every((r) => r.timeUtcMs === env.nowUtcMs)).toBe(true);
  });

  it('emits restart on a start after a stop, and only then (Req 4.7, 11.10)', async () => {
    const { env, source, resets } = setup();
    void source.startOrientation();
    void source.startOrientation();
    expect(resets).toEqual([]);
    source.stop();
    void source.startOrientation();
    void source.startOrientation();
    expect(resets.map((r) => r.cause)).toEqual(['restart']);
    env.dispatch('deviceorientation', UPRIGHT);
    await flush();
  });
});

describe('browser Adapter: starting twice (Req 11.10, D21)', () => {
  it('adds no second listener or timer, and settles both starts with the next sample', async () => {
    const { env, source, resets } = setup();
    const first = source.startOrientation();
    const second = source.startOrientation();
    expect(env.count('addWindowListener:deviceorientation')).toBe(1);
    expect(env.count('addWindowListener:blur')).toBe(1);
    expect(env.count('addWindowListener:pagehide')).toBe(1);
    expect(env.count('addVisibilityListener')).toBe(1);
    expect(env.liveTimers).toBe(1);
    expect(resets).toEqual([]);
    env.dispatch('deviceorientation', UPRIGHT);
    expect(await first).toEqual({ ok: true, value: 'relative' });
    expect(await second).toEqual({ ok: true, value: 'relative' });
    expect(env.liveTimers).toBe(0);
  });

  it('arms one timer again for a start after the first timed out', async () => {
    const { env, source } = setup();
    const first = track(source.startOrientation());
    env.advance(3000);
    await flush();
    expect(first.value()).toEqual({ ok: false, reason: 'sensor_unavailable' });
    const second = track(source.startOrientation());
    expect(env.liveTimers).toBe(1);
    expect(env.count('addWindowListener:deviceorientation')).toBe(1);
    env.advance(2999);
    await flush();
    expect(second.settled()).toBe(false);
    env.dispatch('deviceorientation', UPRIGHT);
    await flush();
    expect(second.value()).toEqual({ ok: true, value: 'relative' });
  });

  it('watches once for two position starts and settles both with the next fix', async () => {
    const { env, source } = setup();
    const first = source.startPosition();
    const second = source.startPosition();
    expect(env.count('watchPosition')).toBe(1);
    env.deliverPosition(24.5, 118.1, 12);
    expect((await first).ok).toBe(true);
    expect(await second).toEqual(await first);
  });

  it('ends the watch after a denial, so a later start asks again', async () => {
    const { env, source } = setup();
    const first = source.startPosition();
    env.deliverPositionError(1);
    expect(await first).toEqual({ ok: false, reason: 'permission_denied' });
    expect(env.liveWatches).toBe(0);
    void source.startPosition();
    expect(env.count('watchPosition')).toBe(2);
  });
});

describe('browser Adapter: positions (Req 7.1, 7.2, 7.6)', () => {
  it('watches with high accuracy, no cached reading, and no browser timeout (D13)', () => {
    const { env, source } = setup();
    void source.startPosition();
    expect(env.watchOptions).toEqual([{ enableHighAccuracy: true, maximumAge: 0 }]);
  });

  it('starts geolocation only when asked (Req 7.1)', () => {
    const { env, source } = setup();
    void source.startOrientation();
    expect(env.count('watchPosition')).toBe(0);
  });

  it('maps the error codes (Req 7.6)', async () => {
    const reasons = [
      'permission_denied',
      'position_unavailable',
      'position_timeout',
      'position_unavailable',
    ];
    for (const [index, code] of [1, 2, 3, 99].entries()) {
      const { env, source, fixes } = setup();
      const start = source.startPosition();
      env.deliverPositionError(code);
      expect(await start).toEqual({ ok: false, reason: reasons[index] });
      expect(fixes).toEqual([{ ok: false, reason: reasons[index] }]);
    }
  });

  it('delivers a coarse reading with its accuracy, and takes -180° as 180° (Req 7.2, 7.8)', async () => {
    const { env, source } = setup();
    const start = source.startPosition();
    env.deliverPosition(24.5, -180, 2000);
    const fix = expectOk(await start);
    expect(fix).toMatchObject({ reportedAccuracyM: 2000, sigmaM: 2000, timeUtcMs: env.nowUtcMs });
    expect(fix.position.lonRad).toBe(Math.PI);
  });

  it('measures the position timeout itself, with no browser callback (Req 7.6)', async () => {
    const { env, source } = setup();
    const first = track(source.startPosition());
    env.advance(29_999);
    await flush();
    expect(first.settled()).toBe(false);
    env.advance(1);
    await flush();
    expect(first.value()).toEqual({ ok: false, reason: 'position_timeout' });

    // A second start after the timeout, again with no browser callback, settles from its own deadline.
    const second = track(source.startPosition());
    expect(env.count('watchPosition')).toBe(1);
    env.advance(29_999);
    await flush();
    expect(second.settled()).toBe(false);
    env.advance(1);
    await flush();
    expect(second.value()).toEqual({ ok: false, reason: 'position_timeout' });
  });

  it('settles two starts 10 000 ms apart at 30 000 and 40 000 ms, with one timer at a time', async () => {
    const { env, source, fixes } = setup();
    const t0 = env.nowUtcMs;
    const settledAt: number[] = [];
    void source.startPosition().then(() => settledAt.push(env.nowUtcMs - t0));
    env.advance(10_000);
    void source.startPosition().then(() => settledAt.push(env.nowUtcMs - t0));
    let mostTimers = env.liveTimers;
    for (let i = 0; i < 40; i += 1) {
      env.advance(1000);
      await flush();
      mostTimers = Math.max(mostTimers, env.liveTimers);
    }
    expect(settledAt).toEqual([30_000, 40_000]);
    expect(mostTimers).toBe(1);
    // A fix after the timeouts still reaches the listeners.
    env.deliverPosition(1, 2, 3);
    expect(fixes).toHaveLength(1);
  });
});

describe('browser Adapter: plain data (Req 1.5)', () => {
  it('hands out only plain objects, never a browser event', () => {
    const { env, source, samples, resets, fixes } = setup();
    void source.startOrientation();
    void source.startPosition();
    const event = Object.assign(Object.create({ preventDefault() {} }), UPRIGHT, { target: {} });
    env.dispatch('deviceorientation', event);
    env.dispatch('blur', event);
    env.deliverPosition(24.5, 118.1, 12);
    const out: unknown[] = [...samples, ...resets, ...fixes];
    expect(out).toHaveLength(3);
    const plain = (value: unknown): boolean => {
      if (value === null || typeof value !== 'object') return typeof value !== 'function';
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
      return Object.values(value).every(plain);
    };
    expect(out.every(plain)).toBe(true);
    expect(out.map((value) => structuredClone(value))).toEqual(out);
  });
});

describe('browser Adapter: stop (Req 11.9)', () => {
  it('leaves no listener, watch or timer, and settles pending starts', async () => {
    const { env, source } = setup();
    const orientation = source.startOrientation();
    const position = source.startPosition();
    source.stop();
    expect(env.liveWindowListeners).toBe(0);
    expect(env.liveVisibilityListeners).toBe(0);
    expect(env.liveWatches).toBe(0);
    expect(env.liveTimers).toBe(0);
    expect(await orientation).toEqual({ ok: false, reason: 'sensor_unavailable' });
    expect(await position).toEqual({ ok: false, reason: 'sensor_unavailable' });
  });
});

describe('browser Adapter: throwing listeners (Req 11.11, D22)', () => {
  function withThrowingListeners(source: SensorSource, received: string[]) {
    source.onOrientation(() => {
      throw new Error('orientation');
    });
    source.onOrientation(() => received.push('orientation'));
    source.onFrameReset(() => {
      throw new Error('reset');
    });
    source.onFrameReset(() => received.push('reset'));
    source.onPosition(() => {
      throw new Error('position');
    });
    source.onPosition(() => received.push('position'));
  }

  for (const variant of [
    'with a callback',
    'without a callback',
    'with a callback that throws',
  ] as const) {
    it(`keeps delivering to the others, ${variant}`, () => {
      const errors: unknown[] = [];
      const onListenerError =
        variant === 'with a callback'
          ? (error: unknown) => errors.push(error)
          : variant === 'with a callback that throws'
            ? () => {
                throw new Error('callback');
              }
            : undefined;
      const { env, source } = setup({}, onListenerError === undefined ? {} : { onListenerError });
      const received: string[] = [];
      withThrowingListeners(source, received);
      void source.startOrientation();
      void source.startPosition();
      for (let i = 0; i < 5; i += 1) env.dispatch('deviceorientation', UPRIGHT);
      env.dispatch('blur');
      env.deliverPosition(1, 2, 3);
      expect(received.filter((r) => r === 'orientation')).toHaveLength(5);
      expect(received.filter((r) => r === 'reset')).toHaveLength(1);
      expect(received.filter((r) => r === 'position')).toHaveLength(1);
      if (variant === 'with a callback') {
        expect(errors.map((e) => (e instanceof Error ? e.message : ''))).toEqual([
          ...Array.from({ length: 5 }, () => 'orientation'),
          'reset',
          'position',
        ]);
      }
    });
  }
});
