import { describe, expect, expectTypeOf, it } from 'vitest';
import { captureAltitude, captureBearing } from '../capture';
import type { FrameResetEvent } from '../frame-reset';
import type { OrientationSample } from '../orientation-sample';
import type { PositionFix } from '../position-fix';
import type { SensorResult } from '../sensor-result';
import type { SensorSource, SensorSourceOptions } from '../sensor-source';
import { angleErrorRad, rad } from '../test-support/angle-compare';
import { expectOk } from '../test-support/result-helpers';
import { baseScript, SCRIPT_START_UTC_MS } from '../test-support/scripts';
import { yawReferenceFromCompass, yawReferenceFromKnownAzimuth } from '../yaw-reference';
import { createSimulator, MAX_SIMULATOR_ADVANCE_MS } from './simulator';
import type { SimulatorScript } from './simulator-script';

const OPTIONS: SensorSourceOptions = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};
const T0 = SCRIPT_START_UTC_MS;

function run(script: SimulatorScript, seed = 1, options: Partial<SensorSourceOptions> = {}) {
  const { source, controls } = expectOk(createSimulator(script, seed, { ...OPTIONS, ...options }));
  const samples: OrientationSample[] = [];
  const failures: SensorResult<OrientationSample>[] = [];
  const resets: FrameResetEvent[] = [];
  const fixes: SensorResult<PositionFix>[] = [];
  const log: string[] = [];
  source.onOrientation((s) => {
    if (s.ok) samples.push(s.value);
    else failures.push(s);
    log.push(s.ok ? `sample@${s.value.timeUtcMs - T0}` : `failure`);
  });
  source.onFrameReset((r) => {
    resets.push(r);
    log.push(`reset:${r.cause}@${r.timeUtcMs - T0}`);
  });
  source.onPosition((f) => fixes.push(f));
  return { source, controls, samples, failures, resets, fixes, log };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

const WINDOW = (endUtcMs: number) => ({
  endUtcMs,
  windowLengthMs: 1000,
  minSampleCount: 10,
  sampleStalenessMs: 500,
});

describe('Simulator: schedule and frames (Req 12.2, 12.3)', () => {
  it('delivers samples on the event grid, stamped with the simulated clock', async () => {
    const sim = run(baseScript());
    const start = sim.source.startOrientation();
    expect(expectOk(sim.controls.advanceTo(T0 + 1000))).toBeUndefined();
    expect(await start).toEqual({ ok: true, value: 'relative' });
    expect(sim.samples.map((s) => s.timeUtcMs - T0)).toEqual(
      Array.from({ length: 21 }, (_, i) => i * 50),
    );
    expect(sim.source.now()).toBe(T0 + 1000);
  });

  it('delivers a reset before the sample at the same time, and a capture across it fails', () => {
    const script = baseScript({
      frame: {
        kind: 'relative',
        zeroRad: rad(30),
        resets: [{ timeUtcMs: T0 + 500, cause: 'blur', newZeroRad: rad(80) }],
      },
    });
    const sim = run(script);
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 1000);
    expect(sim.log.slice(9, 12)).toEqual(['sample@450', 'reset:blur@500', 'sample@500']);
    const reference = expectOk(
      yawReferenceFromKnownAzimuth({
        samples: sim.samples,
        frameResets: [],
        window: { ...WINDOW(T0 + 450), windowLengthMs: 450 },
        knownAzimuthRad: rad(100),
        knownSigmaRad: 0,
        northReference: 'true',
      }),
    );
    const fix = {
      position: { latRad: 0.4, lonRad: 2 },
      reportedAccuracyM: 5,
      sigmaM: 5,
      timeUtcMs: T0 + 1000,
    };
    expect(
      captureBearing({
        id: 'x',
        timeUtcMs: T0 + 1000,
        samples: sim.samples,
        frameResets: sim.resets,
        window: { ...WINDOW(T0 + 1000), windowLengthMs: 450 },
        yawReference: reference,
        yawReferenceMaxAgeMs: 60_000,
        headingSigmaRad: rad(2),
        positionFix: fix,
        positionStalenessMs: 30_000,
        coarseLocationLimitM: 100,
      }),
    ).toEqual({ ok: false, reason: 'frame_reset' });
  });

  it('turns the Relative frame zero at a reset (Req 12.3)', () => {
    const script = baseScript({
      frame: {
        kind: 'relative',
        zeroRad: rad(30),
        resets: [{ timeUtcMs: T0 + 500, cause: 'hidden', newZeroRad: rad(80) }],
      },
    });
    const sim = run(script);
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 1000);
    const before = sim.samples.find((s) => s.timeUtcMs === T0 + 450);
    const after = sim.samples.find((s) => s.timeUtcMs === T0 + 500);
    // The relative azimuth is the true azimuth minus the zero: 70° before, 20° after.
    const relative = (s: OrientationSample | undefined) =>
      s === undefined
        ? Number.NaN
        : expectOk(
            yawReferenceFromKnownAzimuth({
              samples: [s],
              frameResets: [],
              window: {
                endUtcMs: s.timeUtcMs,
                windowLengthMs: 1,
                minSampleCount: 1,
                sampleStalenessMs: 0,
              },
              knownAzimuthRad: 0,
              knownSigmaRad: 0,
              northReference: 'true',
            }),
          ).offsetRad;
    expect(angleErrorRad(-relative(before), rad(70))).toBeLessThanOrEqual(1e-12);
    expect(angleErrorRad(-relative(after), rad(20))).toBeLessThanOrEqual(1e-12);
  });

  it('never moves the clock back when a listener advances it during delivery (Req 12.2)', () => {
    const sim = run(baseScript());
    let reentered = false;
    sim.source.onOrientation(() => {
      if (reentered) return;
      reentered = true;
      expect(sim.controls.advanceTo(T0 + 500).ok).toBe(true);
    });
    void sim.source.startOrientation();
    expect(sim.controls.advanceTo(T0 + 100).ok).toBe(true);
    expect(sim.samples.map((s) => s.timeUtcMs - T0)).toEqual(
      Array.from({ length: 11 }, (_, i) => i * 50),
    );
    expect(sim.source.now()).toBe(T0 + 500);
    // The clock goes on from there: the next advance delivers the events after 500 only.
    sim.controls.advanceTo(T0 + 600);
    expect(sim.samples.map((s) => s.timeUtcMs - T0).slice(-2)).toEqual([550, 600]);
  });

  it('refuses to go backwards, or more than an hour at once', () => {
    const sim = run(baseScript());
    sim.controls.advanceTo(T0 + 100);
    expect(sim.controls.advanceTo(T0 + 99)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'timeUtcMs',
    });
    expect(sim.controls.advanceTo(T0 + 100 + MAX_SIMULATOR_ADVANCE_MS + 1)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'timeUtcMs',
    });
    expect(sim.controls.advanceTo(Number.NaN)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'timeUtcMs',
    });
    expect(sim.controls.advanceTo(T0 + 100).ok).toBe(true);
  });
});

describe('Simulator: permissions, missing sensors, positions (Req 12.3)', () => {
  it('needs the permission to be requested where the script requires it', async () => {
    const silent = run(baseScript({ orientationPermission: 'granted' }));
    const start = silent.source.startOrientation();
    silent.controls.advanceTo(T0 + 3000);
    expect(await start).toEqual({ ok: false, reason: 'permission_required' });
    expect(silent.samples).toEqual([]);

    const asked = run(baseScript({ orientationPermission: 'granted' }));
    expect(await asked.source.requestOrientationPermission()).toEqual({
      ok: true,
      value: 'granted',
    });
    const flowing = asked.source.startOrientation();
    asked.controls.advanceTo(T0 + 100);
    expect(await flowing).toEqual({ ok: true, value: 'relative' });

    const denied = run(baseScript({ orientationPermission: 'denied' }));
    expect(await denied.source.requestOrientationPermission()).toEqual({
      ok: false,
      reason: 'permission_denied',
    });
    expect(await run(baseScript()).source.requestOrientationPermission()).toEqual({
      ok: true,
      value: 'not_required',
    });
  });

  it('reports missing sensors and an insecure page', async () => {
    expect(await run(baseScript({ orientation: 'missing' })).source.startOrientation()).toEqual({
      ok: false,
      reason: 'sensor_unavailable',
    });
    expect(await run(baseScript({ position: null })).source.startPosition()).toEqual({
      ok: false,
      reason: 'sensor_unavailable',
    });
    const insecure = run(baseScript({ secureContext: false }));
    expect(await insecure.source.startOrientation()).toEqual({
      ok: false,
      reason: 'insecure_context',
    });
    expect(await insecure.source.startPosition()).toEqual({
      ok: false,
      reason: 'insecure_context',
    });
    expect(await insecure.source.requestOrientationPermission()).toEqual({
      ok: false,
      reason: 'insecure_context',
    });
  });

  it('delivers fixes after the first delay and then every interval, coarse ones included', async () => {
    const sim = run(
      baseScript({
        position: {
          kind: 'fix',
          position: { latRad: 0.4, lonRad: 2 },
          reportedAccuracyM: 2000,
          firstFixDelayMs: 500,
          fixIntervalMs: 1000,
        },
      }),
    );
    const start = sim.source.startPosition();
    sim.controls.advanceTo(T0 + 2600);
    const first = expectOk(await start);
    expect(first).toMatchObject({ reportedAccuracyM: 2000, sigmaM: 2000, timeUtcMs: T0 + 500 });
    expect(sim.fixes.map((f) => f.ok && f.value.timeUtcMs - T0)).toEqual([500, 1500, 2500]);
  });

  it('reports a scripted failure, and times out in simulated time', async () => {
    const failing = run(
      baseScript({ position: { kind: 'failure', reason: 'position_unavailable' } }),
    );
    const start = failing.source.startPosition();
    failing.controls.advanceTo(T0);
    expect(await start).toEqual({ ok: false, reason: 'position_unavailable' });

    const slow = run(
      baseScript({
        position: {
          kind: 'fix',
          position: { latRad: 0.4, lonRad: 2 },
          reportedAccuracyM: 8,
          firstFixDelayMs: 40_000,
          fixIntervalMs: 1000,
        },
      }),
    );
    const late = slow.source.startPosition();
    slow.controls.advanceTo(T0 + 30_000);
    expect(await late).toEqual({ ok: false, reason: 'position_timeout' });
  });
});

describe('Simulator: the phone it imitates (Req 12.3)', () => {
  it('captures the scripted altitude bias of -3.3° low, within 1e-9', () => {
    const sim = run(baseScript({ altitudeBiasRad: rad(-3.3) }));
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 1000);
    const altitude = expectOk(
      captureAltitude({
        samples: sim.samples,
        window: WINDOW(T0 + 1000),
        calibration: { offsetRad: 0, sigmaRad: 0 },
      }),
    );
    expect(Math.abs(altitude.apparentAltitudeRad - rad(5 - 3.3))).toBeLessThanOrEqual(1e-9);
  });

  it('recovers the true azimuth from a Sun-style reference in the Absolute frame across a hidden reset, without Declination', () => {
    const script = baseScript({
      frame: {
        kind: 'absolute',
        northErrorRad: rad(1.5),
        resets: [{ timeUtcMs: T0 + 3000, cause: 'hidden' }],
      },
      heading: null,
    });
    const sim = run(script);
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 6000);
    // The Sun, computed elsewhere, lies at 100° true along the camera axis.
    const reference = expectOk(
      yawReferenceFromKnownAzimuth({
        samples: sim.samples,
        frameResets: sim.resets,
        window: WINDOW(T0 + 2000),
        knownAzimuthRad: rad(100),
        knownSigmaRad: rad(0.1),
        northReference: 'true',
      }),
    );
    const bearing = expectOk(
      captureBearing({
        id: 'sun',
        timeUtcMs: T0 + 6000,
        samples: sim.samples,
        frameResets: sim.resets,
        window: WINDOW(T0 + 6000),
        yawReference: reference,
        yawReferenceMaxAgeMs: 60_000,
        headingSigmaRad: rad(2),
        positionFix: {
          position: { latRad: 0.4, lonRad: 2 },
          reportedAccuracyM: 5,
          sigmaM: 5,
          timeUtcMs: T0 + 6000,
        },
        positionStalenessMs: 30_000,
        coarseLocationLimitM: 100,
      }),
    );
    expect(sim.resets.map((r) => r.cause)).toEqual(['hidden']);
    expect(angleErrorRad(bearing.azimuthRad, rad(100))).toBeLessThanOrEqual(1e-9);
  });

  it('recovers the true azimuth through the compass and the scripted Declination', () => {
    const sim = run(baseScript());
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 2000);
    const reference = expectOk(
      yawReferenceFromCompass({
        samples: sim.samples,
        frameResets: [],
        window: WINDOW(T0 + 1000),
        headingSigmaRad: rad(2),
      }),
    );
    const bearing = expectOk(
      captureBearing({
        id: 'compass',
        timeUtcMs: T0 + 2000,
        samples: sim.samples,
        frameResets: sim.resets,
        window: WINDOW(T0 + 2000),
        yawReference: reference,
        yawReferenceMaxAgeMs: 60_000,
        headingSigmaRad: rad(2),
        declination: { declinationRad: rad(-4), sigmaRad: rad(0.3) },
        positionFix: {
          position: { latRad: 0.4, lonRad: 2 },
          reportedAccuracyM: 5,
          sigmaM: 5,
          timeUtcMs: T0 + 2000,
        },
        positionStalenessMs: 30_000,
        coarseLocationLimitM: 100,
      }),
    );
    expect(angleErrorRad(bearing.azimuthRad, rad(100))).toBeLessThanOrEqual(1e-9);
  });

  it('reports magnetic azimuths in the Absolute frame, which the scripted Declination corrects', () => {
    const script = baseScript({
      frame: { kind: 'absolute', northErrorRad: 0, resets: [] },
      heading: null,
    });
    const sim = run(script);
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 1000);
    const bearing = expectOk(
      captureBearing({
        id: 'absolute',
        timeUtcMs: T0 + 1000,
        samples: sim.samples,
        frameResets: [],
        window: WINDOW(T0 + 1000),
        yawReferenceMaxAgeMs: 60_000,
        headingSigmaRad: rad(2),
        declination: { declinationRad: rad(-4), sigmaRad: rad(0.3) },
        positionFix: {
          position: { latRad: 0.4, lonRad: 2 },
          reportedAccuracyM: 5,
          sigmaM: 5,
          timeUtcMs: T0 + 1000,
        },
        positionStalenessMs: 30_000,
        coarseLocationLimitM: 100,
      }),
    );
    expect(angleErrorRad(bearing.azimuthRad, rad(100))).toBeLessThanOrEqual(1e-9);
  });

  it('interpolates the azimuth the short way across north', () => {
    const script = baseScript({
      frame: { kind: 'relative', zeroRad: 0, resets: [] },
      pose: [
        { timeUtcMs: T0, azimuthRad: rad(350), apparentAltitudeRad: 0, rollRad: 0 },
        { timeUtcMs: T0 + 1000, azimuthRad: rad(10), apparentAltitudeRad: 0, rollRad: 0 },
      ],
    });
    const sim = run(script);
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 500);
    const middle = sim.samples.find((sample) => sample.timeUtcMs === T0 + 500);
    expect(middle?.magneticHeadingRad).toBeDefined();
    // Heading = true azimuth − declination (−4°): 0° + 4° at the midpoint, not 184°.
    expect(angleErrorRad(middle?.magneticHeadingRad ?? Number.NaN, rad(4))).toBeLessThanOrEqual(
      1e-9,
    );
  });

  it('records the heading accuracy and the Screen angle as scripted', () => {
    const sim = run(baseScript({ screenAngleDeg: 90 }));
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0);
    const sample = sim.samples[0];
    expect(sample?.compassAccuracyRad).toBeCloseTo(rad(10), 14);
    expect(sample?.screenAngleRad).toBeCloseTo(Math.PI / 2, 14);
  });
});

describe('Simulator: starting twice, stopping, listeners (Req 11.9 to 11.11)', () => {
  it('schedules nothing new on a second start and emits restart only after a stop', async () => {
    const sim = run(baseScript());
    const first = sim.source.startOrientation();
    const second = sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 100);
    expect(await first).toEqual({ ok: true, value: 'relative' });
    expect(await second).toEqual({ ok: true, value: 'relative' });
    expect(sim.samples).toHaveLength(3);
    expect(sim.resets).toEqual([]);
    sim.source.stop();
    sim.controls.advanceTo(T0 + 500);
    expect(sim.samples).toHaveLength(3);
    void sim.source.startOrientation();
    void sim.source.startOrientation();
    expect(sim.resets).toEqual([{ timeUtcMs: T0 + 500, cause: 'restart' }]);
  });

  it('settles a pending start when stopped', async () => {
    const sim = run(baseScript({ orientationPermission: 'granted' }));
    const start = sim.source.startOrientation();
    sim.source.stop();
    await flush();
    expect(await start).toEqual({ ok: false, reason: 'sensor_unavailable' });
  });

  it('keeps delivering to the other listeners when one throws, and reports what it threw', () => {
    const errors: unknown[] = [];
    const sim = run(baseScript(), 1, { onListenerError: (error) => errors.push(error) });
    const thrown = new Error('listener');
    sim.source.onOrientation(() => {
      throw thrown;
    });
    void sim.source.startOrientation();
    sim.controls.advanceTo(T0 + 200);
    expect(sim.samples).toHaveLength(5);
    expect(errors).toEqual([thrown, thrown, thrown, thrown, thrown]);
  });
});

describe('Simulator: the Sensor source interface (Req 12.1)', () => {
  it('returns a plain SensorSource, with the controls as a separate object', () => {
    const { source, controls } = expectOk(createSimulator(baseScript(), 1, OPTIONS));
    expectTypeOf(source).toEqualTypeOf<SensorSource>();
    expect(Object.keys(source).sort()).toEqual([
      'now',
      'onFrameReset',
      'onOrientation',
      'onPosition',
      'requestOrientationPermission',
      'startOrientation',
      'startPosition',
      'stop',
    ]);
    expect('advanceTo' in source).toBe(false);
    expect(Object.keys(controls)).toEqual(['advanceTo']);
  });
});

describe('Simulator: seeds and validation (Req 12.4)', () => {
  it('gives three different sequences for three seeds when there is noise', () => {
    const noisy = baseScript({ orientationNoiseSigmaRad: rad(0.5) });
    const alphas = [1, 2, 3].map((seed) => {
      const sim = run(noisy, seed);
      void sim.source.startOrientation();
      sim.controls.advanceTo(T0 + 500);
      return sim.samples.map((s) => s.rotation.alphaRad).join(',');
    });
    expect(new Set(alphas).size).toBe(3);
  });

  it('refuses an invalid script or seed, naming the field', () => {
    const cases: [Partial<SimulatorScript>, string][] = [
      [{ eventIntervalMs: 0.5 }, 'eventIntervalMs'],
      [{ pose: [] }, 'pose'],
      [
        {
          pose: [
            { timeUtcMs: T0, azimuthRad: 0, apparentAltitudeRad: 0, rollRad: 0 },
            { timeUtcMs: T0, azimuthRad: 0, apparentAltitudeRad: 0, rollRad: 0 },
          ],
        },
        'pose',
      ],
      [
        { pose: [{ timeUtcMs: T0, azimuthRad: 0, apparentAltitudeRad: rad(81), rollRad: 0 }] },
        'pose',
      ],
      [{ orientationNoiseSigmaRad: -1 }, 'orientationNoiseSigmaRad'],
      [{ declinationRad: Math.PI + 1e-9 }, 'declinationRad'],
      [{ screenAngleDeg: Number.NaN }, 'screenAngleDeg'],
    ];
    for (const [changes, field] of cases) {
      expect(createSimulator(baseScript(changes), 1, OPTIONS)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field,
      });
    }
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(createSimulator(baseScript(), seed, OPTIONS)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'seed',
      });
    }
  });
});
