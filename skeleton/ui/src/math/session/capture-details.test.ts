// What a captured result carries so that the screen can show what its uncertainty is made of
// (Req 12.6, 13.5): the Spread as Sensors summarises it for that capture, the north part with its
// source, the Declination only when Sensors used it, and the lens-and-tap term as it enters.

import {
  captureAltitude,
  captureBearing,
  directionApparentAltitudeRad,
  MIN_CAPTURE_SIGMA_RAD,
  rayDirection,
  type BearingCaptureInput,
} from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_CALIBRATION,
  FIXTURE_DECLINATION,
  FIXTURE_LAYOUT,
  PARAMETERS,
  T0,
  fixtureScript,
  liveSession,
  run,
} from '../../test-support/session-fixtures';
import { captureFrozen } from './capture';
import type { CapturedResult, FrozenSighting, Session } from './session';
import type { YawSource } from './session-events';
import { step } from './step';

const RELATIVE_SCRIPT = fixtureScript({
  frame: { kind: 'relative', zeroRad: 2, resets: [] },
  heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
  pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.1, rollRad: 0 }],
});
/** A noisy Absolute script, so that the Spread is not 0. */
const NOISY_SCRIPT = fixtureScript({ orientationNoiseSigmaRad: 0.002 });

function frozenAfter(session: Session, endUtcMs: number, yaw: YawSource | null, mark = false) {
  const events = [
    ...(yaw === null ? [] : [{ kind: 'establishYaw' as const, timeUtcMs: endUtcMs, from: yaw }]),
    { kind: 'freeze' as const, timeUtcMs: endUtcMs },
    ...(mark
      ? [
          {
            kind: 'mark' as const,
            timeUtcMs: endUtcMs,
            point: { xPx: 260, yPx: 330 },
            layout: FIXTURE_LAYOUT,
            calibration: FIXTURE_CALIBRATION,
            tapSigmaPx: 4,
          },
        ]
      : []),
  ];
  const s = run(session, events).session;
  if (s.frozen === null) throw new Error(`not frozen: ${s.notice?.reason}`);
  if (yaw !== null && s.yawReference === null) throw new Error('no yaw reference');
  return s;
}

function captured(kind: 'bearing' | 'altitude', frozen: FrozenSighting): CapturedResult {
  const r = captureFrozen(kind, frozen, PARAMETERS);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function sensorsInput(frozen: FrozenSighting): BearingCaptureInput {
  const fix = frozen.history.positionFix;
  if (fix === null) throw new Error('fix');
  return {
    id: 'x',
    timeUtcMs: frozen.frozenAtUtcMs,
    samples: frozen.history.samples,
    frameResets: frozen.history.frameResets,
    window: frozen.window,
    ...(frozen.yawReference === null ? {} : { yawReference: frozen.yawReference }),
    yawReferenceMaxAgeMs: PARAMETERS.yawReferenceMaxAgeMs,
    headingSigmaRad: PARAMETERS.headingSigmaRad,
    ...(frozen.declination === null ? {} : { declination: frozen.declination }),
    positionFix: fix,
    positionStalenessMs: PARAMETERS.positionStalenessMs,
    coarseLocationLimitM: PARAMETERS.coarseLocationLimitM,
  };
}

describe('the captured bearing carries what its sigma is made of (Req 12.6)', () => {
  it('Absolute frame, no Yaw reference: the phone compass with the heading sigma, and the Declination', () => {
    const { session, endUtcMs } = liveSession('bearing', NOISY_SCRIPT);
    const frozen = frozenAfter(session, endUtcMs, null).frozen;
    if (frozen === null) throw new Error('frozen');
    const c = captured('bearing', frozen);
    if (c.kind !== 'bearing') throw new Error('kind');
    expect(c.north).toEqual({ source: 'phone-compass', sigmaRad: PARAMETERS.headingSigmaRad });
    expect(c.declination).toEqual(FIXTURE_DECLINATION);
    expect(c.markSigmaRad).toBeNull();
    expect(c.azimuthSpreadRad).toBeGreaterThan(0);
    // Sensors' sigma is max(floor, rss(Spread, rss(heading, declination))): the carried Spread is
    // the one Sensors used, to the last bit.
    const north = Math.hypot(PARAMETERS.headingSigmaRad, FIXTURE_DECLINATION.sigmaRad);
    expect(
      Object.is(
        c.bearing.azimuthSigmaRad,
        Math.max(MIN_CAPTURE_SIGMA_RAD, Math.hypot(c.azimuthSpreadRad, north)),
      ),
    ).toBe(true);
  });

  it('Relative frame with north from the compass: the source is the compass, with its sigma', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const s = frozenAfter(session, endUtcMs, { kind: 'compass' });
    const frozen = s.frozen;
    const y = s.yawReference;
    if (frozen === null || y === null) throw new Error('frozen');
    expect(s.yawReferenceSource).toBe('compass');
    expect(frozen.yawReferenceSource).toBe('compass');
    const c = captured('bearing', frozen);
    expect(c.north).toEqual({ source: 'compass', sigmaRad: y.sigmaRad });
    // The compass gives a magnetic reference, so the Declination is used.
    expect(y.northReference).toBe('magnetic');
    expect(c.declination).toEqual(FIXTURE_DECLINATION);
  });

  it('a known true azimuth: the source is the known azimuth, and the Declination held is not used', () => {
    const { session, endUtcMs } = liveSession('bearing', NOISY_SCRIPT);
    const s = frozenAfter(session, endUtcMs, {
      kind: 'knownAzimuth',
      azimuthRad: 1,
      sigmaRad: 0.004,
      northReference: 'true',
    });
    const frozen = s.frozen;
    if (frozen === null || s.yawReference === null) throw new Error('frozen');
    expect(frozen.declination).toEqual(FIXTURE_DECLINATION);
    expect(s.yawReferenceSource).toBe('known-azimuth');
    const c = captured('bearing', frozen);
    if (c.kind !== 'bearing') throw new Error('kind');
    expect(c.north).toEqual({ source: 'known-azimuth', sigmaRad: s.yawReference.sigmaRad });
    expect(c.declination).toBeNull();
    expect(
      Object.is(
        c.bearing.azimuthSigmaRad,
        Math.max(MIN_CAPTURE_SIGMA_RAD, Math.hypot(c.azimuthSpreadRad, s.yawReference.sigmaRad)),
      ),
    ).toBe(true);
  });

  it('with a Mark: the Spread of the Off-axis rays and the lens-and-tap term ε / cos h', () => {
    const { session, endUtcMs } = liveSession('bearing', NOISY_SCRIPT);
    const frozen = frozenAfter(session, endUtcMs, null, true).frozen;
    const mark = frozen?.mark;
    if (frozen == null || mark == null) throw new Error('mark');
    const c = captured('bearing', frozen);
    if (c.kind !== 'bearing') throw new Error('kind');
    const newest = frozen.history.samples[frozen.history.samples.length - 1];
    if (newest === undefined) throw new Error('sample');
    const ray = rayDirection(newest.rotation, mark.offset);
    if (!ray.ok) throw new Error('ray');
    const h = directionApparentAltitudeRad(ray.value);
    if (!h.ok) throw new Error('h');
    expect(c.markSigmaRad).toBe(mark.imageSigmaRad / Math.cos(h.value));
    const sensors = captureBearing({ ...sensorsInput(frozen), rayOffset: mark.offset });
    if (!sensors.ok) throw new Error(sensors.reason);
    const north = Math.hypot(PARAMETERS.headingSigmaRad, FIXTURE_DECLINATION.sigmaRad);
    expect(
      Object.is(
        sensors.value.azimuthSigmaRad,
        Math.max(MIN_CAPTURE_SIGMA_RAD, Math.hypot(c.azimuthSpreadRad, north)),
      ),
    ).toBe(true);
    expect(
      Object.is(
        c.bearing.azimuthSigmaRad,
        Math.hypot(sensors.value.azimuthSigmaRad, c.markSigmaRad ?? NaN),
      ),
    ).toBe(true);
  });
});

describe('the captured altitude carries what its sigma is made of (Req 12.6)', () => {
  it('the standard deviation Sensors computed, no north, no Declination, and ε for the lens and tap', () => {
    const { session, endUtcMs } = liveSession('altitude', NOISY_SCRIPT);
    const plain = frozenAfter(session, endUtcMs, null).frozen;
    const marked = frozenAfter(session, endUtcMs, null, true).frozen;
    const mark = marked?.mark;
    if (plain === null || marked == null || mark == null) throw new Error('frozen');
    const a = captured('altitude', plain);
    const b = captured('altitude', marked);
    if (a.kind !== 'altitude' || b.kind !== 'altitude') throw new Error('kind');
    const sensors = captureAltitude({
      samples: marked.history.samples,
      window: marked.window,
      calibration: PARAMETERS.altitudeCalibration,
      rayOffset: mark.offset,
    });
    if (!sensors.ok) throw new Error(sensors.reason);
    expect(a.altitudeStdDevRad).toBe(a.altitude.sampleStdDevRad);
    expect(b.altitudeStdDevRad).toBe(sensors.value.sampleStdDevRad);
    expect(a.altitudeStdDevRad).toBeGreaterThan(0);
    expect([a.north, a.declination, a.markSigmaRad]).toEqual([null, null, null]);
    expect(b.markSigmaRad).toBe(mark.imageSigmaRad);
  });
});

describe('the source of the Yaw reference in the Session (Req 13.5)', () => {
  it('is null with no reference, follows each establishYaw, and survives a restart', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    expect(session.yawReferenceSource).toBeNull();
    const compass = step(
      session,
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      PARAMETERS,
    ).session;
    expect(compass.yawReferenceSource).toBe('compass');
    const known = step(
      compass,
      {
        kind: 'establishYaw',
        timeUtcMs: endUtcMs,
        from: { kind: 'knownAzimuth', azimuthRad: 2, sigmaRad: 0.01, northReference: 'true' },
      },
      PARAMETERS,
    ).session;
    expect(known.yawReferenceSource).toBe('known-azimuth');
    const failed = run(known, [
      {
        kind: 'camera',
        timeUtcMs: endUtcMs,
        result: { ok: false, reason: 'camera_track_ended' },
      },
      { kind: 'restart', timeUtcMs: endUtcMs },
    ]).session;
    expect(failed.state).toBe('permission');
    expect(failed.yawReference).toBe(known.yawReference);
    expect(failed.yawReferenceSource).toBe('known-azimuth');
  });

  it('a refused establishYaw keeps the source of the reference held', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const compass = step(
      session,
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      PARAMETERS,
    ).session;
    const refused = step(
      compass,
      {
        kind: 'establishYaw',
        timeUtcMs: endUtcMs,
        from: { kind: 'knownAzimuth', azimuthRad: 2, sigmaRad: Number.NaN, northReference: 'true' },
      },
      PARAMETERS,
    ).session;
    expect(refused.notice).not.toBeNull();
    expect(refused.yawReferenceSource).toBe('compass');
  });

  it('in frozen, a known azimuth replaces the source of the Frozen sighting too', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const s = frozenAfter(session, endUtcMs, { kind: 'compass' });
    const after = step(
      s,
      {
        kind: 'establishYaw',
        timeUtcMs: endUtcMs,
        from: { kind: 'knownAzimuth', azimuthRad: 2, sigmaRad: 0.01, northReference: 'true' },
      },
      PARAMETERS,
    ).session;
    expect(after.frozen?.yawReferenceSource).toBe('known-azimuth');
    expect(after.yawReferenceSource).toBe('known-azimuth');
    const c = captured('bearing', after.frozen as FrozenSighting);
    expect(c.north?.source).toBe('known-azimuth');
  });
});
