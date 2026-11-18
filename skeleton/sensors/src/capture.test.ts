import { validateBearing, type Bearing } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import {
  captureAltitude,
  captureBearing,
  MAX_CAPTURE_SIGMA_RAD,
  MIN_CAPTURE_SIGMA_RAD,
  type AltitudeCaptureInput,
  type BearingCaptureInput,
} from './capture';
import { declinationAt } from './declination';
import { UNCALIBRATED_ALTITUDE } from './defaults';
import type { FrameResetEvent } from './frame-reset';
import type { OrientationSample } from './orientation-sample';
import { positionFixFromReading } from './position-fix';
import { cameraAxis, directionApparentAltitudeRad } from './rotation';
import { rotationFromDirection } from './simulator/direction-to-rotation';
import { angleErrorRad, rad } from './test-support/angle-compare';
import { expectOk } from './test-support/result-helpers';
import { pointing, sampleAt, samplesEndingAt } from './test-support/samples';
import { expectedSigmaDeg } from './test-support/wmm-points';
import type { YawReference } from './yaw-reference';

const END = 1_790_000_010_000;
const READING = { latitudeDeg: 24.5, longitudeDeg: 118.1, accuracyM: 12 };
const FIX = expectOk(positionFixFromReading(READING, END - 1000, 1));

/** Ten level samples 100 ms apart, ending at END, the camera at 70° in its frame. */
function samples(
  frame: 'relative' | 'absolute' = 'relative',
  count = 10,
  azimuthDeg = 70,
): OrientationSample[] {
  return samplesEndingAt(END, count, (_, t) => sampleAt(t, pointing(rad(azimuthDeg)), { frame }));
}

const RELATIVE_TRUE_REFERENCE: YawReference = {
  offsetRad: rad(30),
  sigmaRad: rad(1),
  northReference: 'true',
  frame: 'relative',
  establishedUtcMs: END - 5000,
};

const BASE: BearingCaptureInput = {
  id: 'observer-1',
  timeUtcMs: END,
  samples: samples(),
  frameResets: [],
  window: { endUtcMs: END, windowLengthMs: 1000, minSampleCount: 10, sampleStalenessMs: 500 },
  yawReference: RELATIVE_TRUE_REFERENCE,
  yawReferenceMaxAgeMs: 60_000,
  headingSigmaRad: rad(2),
  positionFix: FIX,
  positionStalenessMs: 30_000,
  coarseLocationLimitM: 100,
};

function capture(changes: Partial<BearingCaptureInput>) {
  return captureBearing({ ...BASE, ...changes });
}

function bearing(changes: Partial<BearingCaptureInput>): Bearing {
  return expectOk(capture(changes));
}

function resetAt(timeUtcMs: number, cause: FrameResetEvent['cause'] = 'hidden'): FrameResetEvent {
  return { timeUtcMs, cause };
}

describe('captureBearing: a Relative capture (Req 8.1 to 8.4)', () => {
  it('gives the true azimuth through the Yaw reference, with its 1-sigma and the fix', () => {
    const result = bearing({});
    expect(angleErrorRad(result.azimuthRad, rad(100))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(result.azimuthSigmaRad - rad(1))).toBeLessThanOrEqual(1e-12);
    expect(result).toMatchObject({ id: 'observer-1', timeUtcMs: END, positionAccuracyM: 12 });
    expect(result.observer).toEqual(FIX.position);
  });

  it('floors the 1-sigma at 0.01° (Req 8.3)', () => {
    const result = bearing({ yawReference: { ...RELATIVE_TRUE_REFERENCE, sigmaRad: 0 } });
    expect(result.azimuthSigmaRad).toBe(MIN_CAPTURE_SIGMA_RAD);
  });

  it('takes the azimuth of an Off-axis ray when an offset is given (Req 3.5)', () => {
    const result = bearing({ rayOffset: { rightRad: rad(10), upRad: 0 } });
    expect(angleErrorRad(result.azimuthRad, rad(110))).toBeLessThanOrEqual(1e-12);
  });

  it('combines the Spread with the North-reference 1-sigma', () => {
    // Five samples at 69°, five at 71°: the Spread is sqrt(-2 ln cos 1°).
    const spread = samplesEndingAt(END, 10, (i, t) => sampleAt(t, pointing(rad(i < 5 ? 69 : 71))));
    const result = bearing({ samples: spread });
    const spreadRad = Math.sqrt(-2 * Math.log(Math.cos(rad(1))));
    expect(angleErrorRad(result.azimuthRad, rad(100))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(result.azimuthSigmaRad - Math.hypot(spreadRad, rad(1)))).toBeLessThanOrEqual(
      1e-12,
    );
  });
});

describe('captureBearing: each failure, one at a time (D8)', () => {
  it('names each invalid parameter (Req 10.3)', () => {
    const cases: [Partial<BearingCaptureInput>, string][] = [
      [{ window: { ...BASE.window, windowLengthMs: 0 } }, 'windowLengthMs'],
      [{ window: { ...BASE.window, minSampleCount: 2.5 } }, 'minSampleCount'],
      [{ window: { ...BASE.window, sampleStalenessMs: -1 } }, 'sampleStalenessMs'],
      [{ headingSigmaRad: Number.NaN }, 'headingSigmaRad'],
      [{ coarseLocationLimitM: -1 }, 'coarseLocationLimitM'],
      [{ positionStalenessMs: -1 }, 'positionStalenessMs'],
      [{ yawReferenceMaxAgeMs: Number.POSITIVE_INFINITY }, 'yawReferenceMaxAgeMs'],
      [{ timeUtcMs: Number.NaN }, 'timeUtcMs'],
      [{ rayOffset: { rightRad: rad(81), upRad: 0 } }, 'rightRad'],
      [{ declination: { declinationRad: Math.PI + 1e-12, sigmaRad: 0 } }, 'declinationRad'],
      [{ yawReference: { ...RELATIVE_TRUE_REFERENCE, sigmaRad: -1 } }, 'yawSigmaRad'],
    ];
    for (const [changes, field] of cases) {
      expect(capture(changes)).toEqual({ ok: false, reason: 'invalid_number', field });
    }
  });

  it('refuses a stale fix and a coarse fix (Req 8.5)', () => {
    const old = expectOk(positionFixFromReading(READING, END - 30_001, 1));
    expect(capture({ positionFix: old })).toEqual({ ok: false, reason: 'stale_position' });
    const coarse = expectOk(positionFixFromReading({ ...READING, accuracyM: 2000 }, END, 1));
    expect(capture({ positionFix: coarse })).toEqual({
      ok: false,
      reason: 'coarse_location',
      reportedAccuracyM: 2000,
    });
  });

  it('checks the position before the samples', () => {
    const old = expectOk(positionFixFromReading(READING, END - 30_001, 1));
    expect(capture({ positionFix: old, samples: samples('relative', 9) })).toEqual({
      ok: false,
      reason: 'stale_position',
    });
  });

  it('refuses too few samples and stale samples (Req 8.6, 8.7)', () => {
    expect(capture({ samples: samples('relative', 9) })).toEqual({
      ok: false,
      reason: 'insufficient_samples',
    });
    const late = samples().map((s) => ({ ...s, timeUtcMs: s.timeUtcMs - 501 }));
    expect(capture({ samples: late, window: { ...BASE.window, windowLengthMs: 2000 } })).toEqual({
      ok: false,
      reason: 'stale_samples',
    });
  });

  it('refuses mixed frames and resets that invalidate the reference (Req 8.8, 5.11)', () => {
    const mixed = samplesEndingAt(END, 10, (i, t) =>
      sampleAt(t, pointing(rad(70)), { frame: i % 2 === 0 ? 'relative' : 'absolute' }),
    );
    expect(capture({ samples: mixed })).toEqual({ ok: false, reason: 'frame_reset' });
    // In the window.
    expect(capture({ frameResets: [resetAt(END - 500)] })).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
    // Between the reference (END - 5000) and the window.
    expect(capture({ frameResets: [resetAt(END - 3000)] })).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
    expect(capture({ frameResets: [resetAt(END - 5000)] })).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
    expect(capture({ frameResets: [resetAt(END - 5001)] }).ok).toBe(true);
    // A reference established after the window (the frozen-image flow), and a reset between them.
    const later = { ...RELATIVE_TRUE_REFERENCE, establishedUtcMs: END + 4000 };
    expect(capture({ yawReference: later }).ok).toBe(true);
    expect(capture({ yawReference: later, frameResets: [resetAt(END + 2000)] })).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
  });

  it('needs a Yaw reference for Relative samples (Req 5.13)', () => {
    expect(capture({ yawReference: undefined })).toEqual({ ok: false, reason: 'no_yaw_reference' });
    expect(capture({ yawReference: undefined, frameResets: [resetAt(END - 10)] })).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
  });

  it('refuses a Yaw reference older than the limit, on either side (Req 5.12)', () => {
    const at = (establishedUtcMs: number) =>
      capture({ yawReference: { ...RELATIVE_TRUE_REFERENCE, establishedUtcMs } });
    expect(at(END - 60_000).ok).toBe(true);
    expect(at(END - 60_001)).toEqual({ ok: false, reason: 'stale_yaw_reference' });
    expect(at(END + 60_000).ok).toBe(true);
    expect(at(END + 60_001)).toEqual({ ok: false, reason: 'stale_yaw_reference' });
  });

  it('returns axis_vertical for one vertical sample among ten, never dropping it (Req 8.9)', () => {
    const withFlat = samples().map((s, i) =>
      i === 4 ? { ...s, rotation: { alphaRad: 0, betaRad: 0, gammaRad: 0 } } : s,
    );
    expect(capture({ samples: withFlat })).toEqual({ ok: false, reason: 'axis_vertical' });
  });

  it('refuses an Absolute capture with neither a Yaw reference nor a Declination (Req 6.4)', () => {
    expect(capture({ samples: samples('absolute'), yawReference: undefined })).toEqual({
      ok: false,
      reason: 'declination_unknown',
    });
  });

  it('refuses an unsteady sighting, with an undefined mean or a 1-sigma above 45° (Req 8.10)', () => {
    const opposite = samplesEndingAt(END, 10, (i, t) =>
      sampleAt(t, pointing(rad(i < 5 ? 0 : 180))),
    );
    expect(capture({ samples: opposite })).toEqual({ ok: false, reason: 'too_unsteady' });
    // Two groups 100° apart: the Spread is sqrt(-2 ln cos 50°) ≈ 54°.
    const wide = samplesEndingAt(END, 10, (i, t) => sampleAt(t, pointing(rad(i < 5 ? 20 : 120))));
    expect(capture({ samples: wide })).toEqual({ ok: false, reason: 'too_unsteady' });
  });

  it("passes Core's failure through for an observer accuracy beyond 10 000 m (Req 8.4)", () => {
    // Reported 50 m (not coarse) over a scale of 0.004: a 1-sigma of 12 500 m, which Core refuses.
    const scaled = expectOk(positionFixFromReading({ ...READING, accuracyM: 50 }, END, 0.004));
    expect(capture({ positionFix: scaled })).toEqual({
      ok: false,
      reason: 'invalid_observation',
      field: 'positionAccuracyM',
      id: 'observer-1',
    });
  });
});

describe('captureBearing: Absolute frame and Yaw references in both frames (Req 8.2, 8.3, 5.18)', () => {
  const absolute = samples('absolute');
  /** The published point at 2025.0, 0°, 120°: D = -0.16°, H = 39 677.9 nT. */
  const PUBLISHED = { declinationRad: rad(-0.16), sigmaRad: rad(0.293665) };

  it('uses the Heading 1-sigma and the Declination without a reference', () => {
    const result = bearing({ samples: absolute, yawReference: undefined, declination: PUBLISHED });
    expect(angleErrorRad(result.azimuthRad, rad(70 - 0.16))).toBeLessThanOrEqual(1e-12);
    expect(
      Math.abs(result.azimuthSigmaRad - Math.hypot(rad(2), rad(0.293665))),
    ).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(result.azimuthSigmaRad - rad(2.021445))).toBeLessThan(rad(1e-6));
  });

  it('gives the same through declinationAt at the published point', () => {
    const point = { latRad: 0, lonRad: rad(120) };
    const declination = expectOk(declinationAt(point, Date.UTC(2025, 0, 1)));
    const result = bearing({ samples: absolute, yawReference: undefined, declination });
    expect(result.azimuthSigmaRad).toBeGreaterThanOrEqual(
      Math.hypot(rad(2), rad(expectedSigmaDeg(39_677.9 + 0.1))),
    );
    expect(result.azimuthSigmaRad).toBeLessThanOrEqual(
      Math.hypot(rad(2), rad(expectedSigmaDeg(39_677.9 - 0.1))),
    );
  });

  it('needs no Declination and no Heading 1-sigma with a true Absolute reference', () => {
    const reference: YawReference = {
      ...RELATIVE_TRUE_REFERENCE,
      frame: 'absolute',
      sigmaRad: rad(0.3),
    };
    const a = bearing({ samples: absolute, yawReference: reference, headingSigmaRad: rad(2) });
    const b = bearing({ samples: absolute, yawReference: reference, headingSigmaRad: rad(40) });
    expect(angleErrorRad(a.azimuthRad, rad(100))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(a.azimuthSigmaRad - rad(0.3))).toBeLessThanOrEqual(1e-12);
    expect(b.azimuthSigmaRad).toBe(a.azimuthSigmaRad);
  });

  it('does not apply a Declination given with a true reference, in either frame', () => {
    const absoluteReference: YawReference = {
      ...RELATIVE_TRUE_REFERENCE,
      frame: 'absolute',
      sigmaRad: rad(0.3),
    };
    const absoluteResult = bearing({
      samples: absolute,
      yawReference: absoluteReference,
      declination: PUBLISHED,
    });
    expect(angleErrorRad(absoluteResult.azimuthRad, rad(100))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(absoluteResult.azimuthSigmaRad - rad(0.3))).toBeLessThanOrEqual(1e-12);
    const relativeResult = bearing({ declination: { declinationRad: rad(-20), sigmaRad: rad(5) } });
    expect(angleErrorRad(relativeResult.azimuthRad, rad(100))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(relativeResult.azimuthSigmaRad - rad(1))).toBeLessThanOrEqual(1e-12);
  });

  it('needs a Declination with a magnetic Absolute reference', () => {
    const reference: YawReference = {
      ...RELATIVE_TRUE_REFERENCE,
      frame: 'absolute',
      northReference: 'magnetic',
    };
    expect(capture({ samples: absolute, yawReference: reference })).toEqual({
      ok: false,
      reason: 'declination_unknown',
    });
    const result = bearing({ samples: absolute, yawReference: reference, declination: PUBLISHED });
    expect(angleErrorRad(result.azimuthRad, rad(100 - 0.16))).toBeLessThanOrEqual(1e-12);
    expect(
      Math.abs(result.azimuthSigmaRad - Math.hypot(rad(1), rad(0.293665))),
    ).toBeLessThanOrEqual(1e-12);
  });

  it('refuses a reference of the other frame, in both directions (Req 5.18)', () => {
    expect(capture({ samples: absolute, declination: PUBLISHED })).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
    const absoluteReference: YawReference = { ...RELATIVE_TRUE_REFERENCE, frame: 'absolute' };
    expect(capture({ yawReference: absoluteReference })).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
  });

  it('keeps an Absolute reference across page events, not across a frame change (Req 5.17)', () => {
    const reference: YawReference = { ...RELATIVE_TRUE_REFERENCE, frame: 'absolute' };
    for (const cause of ['hidden', 'blur', 'pagehide', 'restart'] as const) {
      expect(
        capture({
          samples: absolute,
          yawReference: reference,
          frameResets: [resetAt(END - 3000, cause)],
        }).ok,
      ).toBe(true);
    }
    expect(
      capture({
        samples: absolute,
        yawReference: reference,
        frameResets: [resetAt(END - 3000, 'frame_change')],
      }),
    ).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
    // The same hidden reset invalidates a Relative reference.
    expect(capture({ frameResets: [resetAt(END - 3000, 'hidden')] })).toEqual({
      ok: false,
      reason: 'frame_reset',
    });
  });

  it('captures Absolute samples without a reference across a hidden reset in the window', () => {
    const result = capture({
      samples: absolute,
      yawReference: undefined,
      declination: PUBLISHED,
      frameResets: [resetAt(END - 500, 'hidden')],
    });
    expect(result.ok).toBe(true);
  });
});

describe("the capture's limits agree with Core's", () => {
  /** The next double above or below `x`. */
  function nextAfter(x: number, direction: 1 | -1): number {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, x);
    view.setBigInt64(0, view.getBigInt64(0) + BigInt(direction));
    return view.getFloat64(0);
  }

  it('accepts 0.01° and 45° and refuses the next values outside them', () => {
    const base = bearing({});
    const withSigma = (azimuthSigmaRad: number) => validateBearing({ ...base, azimuthSigmaRad }).ok;
    expect(withSigma(MIN_CAPTURE_SIGMA_RAD)).toBe(true);
    expect(withSigma(MAX_CAPTURE_SIGMA_RAD)).toBe(true);
    expect(withSigma(nextAfter(MIN_CAPTURE_SIGMA_RAD, -1))).toBe(false);
    expect(withSigma(nextAfter(MAX_CAPTURE_SIGMA_RAD, 1))).toBe(false);
  });
});

describe('captureAltitude (Req 9)', () => {
  const window = {
    endUtcMs: END,
    windowLengthMs: 1000,
    minSampleCount: 10,
    sampleStalenessMs: 500,
  };
  function altitudeSamples(altitudesDeg: (i: number) => number, count = 10): OrientationSample[] {
    return samplesEndingAt(END, count, (i, t) =>
      sampleAt(t, pointing(rad(200), rad(altitudesDeg(i)), rad(15))),
    );
  }
  const base: AltitudeCaptureInput = {
    samples: altitudeSamples(() => 25),
    window,
    calibration: UNCALIBRATED_ALTITUDE,
  };

  it('gives 3.5° uncalibrated for a still hand (Req 9.2, 9.3)', () => {
    const result = expectOk(captureAltitude(base));
    expect(Math.abs(result.apparentAltitudeRad - rad(25))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(result.sigmaRad - rad(3.5))).toBeLessThanOrEqual(1e-12);
    expect(result.sampleStdDevRad).toBeLessThanOrEqual(1e-15);
    expect(result).toMatchObject({ calibration: UNCALIBRATED_ALTITUDE, sampleCount: 10 });
  });

  it('adds the offset and combines the spread of the samples with the calibration sigma', () => {
    const spread = altitudeSamples((i) => (i < 5 ? 24 : 26));
    const result = expectOk(
      captureAltitude({
        ...base,
        samples: spread,
        calibration: { offsetRad: rad(3.3), sigmaRad: rad(0.5) },
      }),
    );
    expect(Math.abs(result.apparentAltitudeRad - rad(28.3))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(result.sampleStdDevRad - rad(1))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(result.sigmaRad - Math.hypot(rad(1), rad(0.5)))).toBeLessThanOrEqual(1e-12);
  });

  it('takes the altitude of an Off-axis ray (Req 3.5)', () => {
    const level = {
      ...base,
      samples: samplesEndingAt(END, 10, (_, t) => sampleAt(t, pointing(rad(200), 0, 0))),
    };
    const result = expectOk(
      captureAltitude({ ...level, rayOffset: { rightRad: 0, upRad: rad(10) } }),
    );
    expect(Math.abs(result.apparentAltitudeRad - rad(10))).toBeLessThanOrEqual(1e-12);
  });

  it('keeps the shrunk P-9.7 counterexample at the -90° corner (Req 9.7, 9.10)', () => {
    // 199 identical samples whose computed altitude is -80° + 1 ulp, and an offset of -10°. Summing
    // them drifted the mean 4 ulps below -80°, and the capture fell past -π/2 (invalid_altitude).
    const rotation = expectOk(
      rotationFromDirection(5.925836739947427, -1.3962634015954636, 2.3828897787117436),
    );
    const altitudeRad = expectOk(directionApparentAltitudeRad(expectOk(cameraAxis(rotation))));
    expect(altitudeRad >= -80 * (Math.PI / 180)).toBe(true);
    const corner = samplesEndingAt(END, 199, (_, t) => sampleAt(t, rotation)).map((s, i) => ({
      ...s,
      timeUtcMs: END - i * 5,
    }));
    const result = expectOk(
      captureAltitude({
        samples: corner,
        window: { ...window, minSampleCount: 2 },
        calibration: { offsetRad: -0.17453292519943295, sigmaRad: 0 },
      }),
    );
    expect(result.apparentAltitudeRad).toBe(altitudeRad + -0.17453292519943295);
    expect(result.sigmaRad).toBe(0);
  });

  it('refuses an altitude beyond the zenith after calibration (Req 9.6)', () => {
    const high = { ...base, samples: altitudeSamples(() => 89) };
    expect(captureAltitude({ ...high, calibration: { offsetRad: rad(2), sigmaRad: 0 } })).toEqual({
      ok: false,
      reason: 'invalid_altitude',
    });
    expect(
      captureAltitude({ ...high, calibration: { offsetRad: rad(1) - 1e-9, sigmaRad: 0 } }).ok,
    ).toBe(true);
  });

  it('refuses an invalid calibration (Req 9.5)', () => {
    expect(
      captureAltitude({ ...base, calibration: { offsetRad: Number.NaN, sigmaRad: 0 } }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'calibrationOffsetRad',
    });
    expect(captureAltitude({ ...base, calibration: { offsetRad: 0, sigmaRad: -1 } })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'calibrationSigmaRad',
    });
  });

  it('refuses too few samples and stale samples (Req 9.4)', () => {
    expect(captureAltitude({ ...base, samples: altitudeSamples(() => 25, 9) })).toEqual({
      ok: false,
      reason: 'insufficient_samples',
    });
    const late = base.samples.map((s) => ({ ...s, timeUtcMs: s.timeUtcMs - 501 }));
    expect(
      captureAltitude({ ...base, samples: late, window: { ...window, windowLengthMs: 2000 } }),
    ).toEqual({
      ok: false,
      reason: 'stale_samples',
    });
  });
});
