import { describe, expect, it } from 'vitest';
import type { FrameResetEvent } from './frame-reset';
import { cameraAxis, directionApparentAltitudeRad, directionAzimuthRad } from './rotation';
import type { OrientationSample } from './orientation-sample';
import type { SightingWindow } from './sighting-window';
import { angleErrorRad, rad } from './test-support/angle-compare';
import { expectOk } from './test-support/result-helpers';
import { pointing, sampleAt, samplesEndingAt } from './test-support/samples';
import {
  applyYawReference,
  yawReferenceFromCompass,
  yawReferenceFromKnownAzimuth,
  type YawReference,
} from './yaw-reference';

const END = 1_790_000_010_000;
const WINDOW: SightingWindow = {
  endUtcMs: END,
  windowLengthMs: 1000,
  minSampleCount: 10,
  sampleStalenessMs: 500,
};
const HEADING_SIGMA = rad(2);
/** The relative frame's zero lies 40° east of magnetic north: heading = relative + 40°. */
const ZERO_OFFSET = rad(40);

function compassSamples(
  count = 10,
  options: {
    altitudeRad?: number;
    accuracyRad?: (i: number) => number | null;
    screenAngleRad?: number | null;
  } = {},
): OrientationSample[] {
  return samplesEndingAt(END, count, (i, t) => {
    const relativeRad = rad(100 + i * 0.1);
    return sampleAt(t, pointing(relativeRad, options.altitudeRad ?? 0), {
      magneticHeadingRad: relativeRad + ZERO_OFFSET,
      compassAccuracyRad: options.accuracyRad?.(i) ?? rad(10),
      screenAngleRad: options.screenAngleRad === undefined ? 0 : options.screenAngleRad,
    });
  });
}

function compass(
  samples: readonly OrientationSample[],
  frameResets: readonly FrameResetEvent[] = [],
) {
  return yawReferenceFromCompass({
    samples,
    frameResets,
    window: WINDOW,
    headingSigmaRad: HEADING_SIGMA,
  });
}

describe('yawReferenceFromCompass (Req 5.1, 5.3 to 5.10)', () => {
  it('finds the zero of the Relative frame, with the Heading 1-sigma', () => {
    const reference = expectOk(compass(compassSamples()));
    expect(angleErrorRad(reference.offsetRad, ZERO_OFFSET)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(reference.sigmaRad - HEADING_SIGMA)).toBeLessThanOrEqual(1e-12);
    expect(reference).toMatchObject({
      northReference: 'magnetic',
      frame: 'relative',
      establishedUtcMs: END,
    });
  });

  it('does not let the reported compass accuracy change the 1-sigma (Req 5.8)', () => {
    const at10 = expectOk(compass(compassSamples(10, { accuracyRad: () => rad(10) })));
    const at50 = expectOk(compass(compassSamples(10, { accuracyRad: () => rad(50) })));
    expect(at50.sigmaRad).toBe(at10.sigmaRad);
    expect(at50.offsetRad).toBe(at10.offsetRad);
  });

  it('excludes a heading with a negative accuracy, and refuses when none is left (Req 5.8, 5.9)', () => {
    const samples = compassSamples(11, { accuracyRad: (i) => (i === 3 ? -1 : rad(10)) });
    // Spoil the excluded sample's heading: if it were used, the offset would move.
    const spoiled = samples.map((s, i) => (i === 3 ? { ...s, magneticHeadingRad: 0 } : s));
    const reference = expectOk(compass(spoiled));
    expect(angleErrorRad(reference.offsetRad, ZERO_OFFSET)).toBeLessThanOrEqual(1e-12);
    expect(compass(compassSamples(10, { accuracyRad: () => -1 }))).toEqual({
      ok: false,
      reason: 'compass_unreliable',
    });
  });

  it('accepts the camera at 30° and refuses it beyond (Req 5.6)', () => {
    // A rotation built for exactly 30° gives back 30° plus about 1e-16 rad of rounding, so the
    // accepted case sits 1e-12 rad inside the limit.
    expect(compass(compassSamples(10, { altitudeRad: rad(30) - 1e-12 })).ok).toBe(true);
    expect(compass(compassSamples(10, { altitudeRad: rad(-30) + 1e-12 })).ok).toBe(true);
    expect(compass(compassSamples(10, { altitudeRad: rad(30.0001) }))).toEqual({
      ok: false,
      reason: 'compass_unreliable',
    });
  });

  it('accepts a Camera altitude of exactly 30° and refuses one that rounds just over (Req 5.6)', () => {
    const limitRad = 30 * (Math.PI / 180);
    // A rotation whose computed Camera altitude is exactly 30° in radians: pins `<=` against `<`.
    const exact = {
      alphaRad: 2.641964239832127,
      betaRad: -2.4484975052199363,
      gammaRad: 0.8632578960821685,
    };
    const exactAltitude = expectOk(directionApparentAltitudeRad(expectOk(cameraAxis(exact))));
    expect(exactAltitude === limitRad).toBe(true);
    // A pose built at exactly -30° (the P-5.14 counterexample) whose computed altitude is one ulp
    // below -30°: refused, because the limit is exact.
    const over = {
      alphaRad: 4.48072343547989,
      betaRad: -0.3785021413203012,
      gammaRad: 1.0026314118313542,
    };
    const overAltitude = expectOk(directionApparentAltitudeRad(expectOk(cameraAxis(over))));
    expect(overAltitude < -limitRad).toBe(true);
    expect(-limitRad - overAltitude).toBeLessThan(1e-15);

    const withRotation = (rotation: typeof exact) =>
      compassSamples().map((s) => {
        const azimuth = expectOk(directionAzimuthRad(expectOk(cameraAxis(rotation))));
        return { ...s, rotation, magneticHeadingRad: azimuth + ZERO_OFFSET };
      });
    const accepted = expectOk(compass(withRotation(exact)));
    expect(angleErrorRad(accepted.offsetRad, ZERO_OFFSET)).toBeLessThanOrEqual(1e-12);
    expect(compass(withRotation(over))).toEqual({ ok: false, reason: 'compass_unreliable' });
  });

  it('refuses headings away from the natural screen orientation (Req 5.7)', () => {
    for (const screenAngleRad of [Math.PI / 2, null]) {
      expect(compass(compassSamples(10, { screenAngleRad }))).toEqual({
        ok: false,
        reason: 'compass_unreliable',
      });
    }
    expect(compass(compassSamples(10, { screenAngleRad: 2 * Math.PI })).ok).toBe(true);
  });

  it('uses Relative samples only, and records the Relative frame (D10, Req 5.9, 5.16)', () => {
    const absolute = compassSamples().map((s) => ({ ...s, frame: 'absolute' as const }));
    expect(compass(absolute)).toEqual({ ok: false, reason: 'insufficient_samples' });
    const mixed = [...compassSamples(), ...absolute.map((s) => ({ ...s, magneticHeadingRad: 0 }))];
    const reference = expectOk(compass(mixed));
    expect(reference.frame).toBe('relative');
    expect(angleErrorRad(reference.offsetRad, ZERO_OFFSET)).toBeLessThanOrEqual(1e-12);
  });

  it('refuses a window with any Frame reset in it (Req 5.10, 5.17)', () => {
    for (const cause of ['hidden', 'blur', 'pagehide', 'restart', 'frame_change'] as const) {
      expect(compass(compassSamples(), [{ timeUtcMs: END - 1000, cause }])).toEqual({
        ok: false,
        reason: 'frame_reset',
      });
    }
    expect(compass(compassSamples(), [{ timeUtcMs: END - 1001, cause: 'hidden' }]).ok).toBe(true);
  });

  it('refuses too few samples and stale samples (Req 5.9, 5.10)', () => {
    expect(compass(compassSamples(9))).toEqual({ ok: false, reason: 'insufficient_samples' });
    // Ten samples whose newest is 501 ms before the end of a 2000 ms window.
    const stale = compassSamples(10).map((s) => ({ ...s, timeUtcMs: s.timeUtcMs - 501 }));
    expect(
      yawReferenceFromCompass({
        samples: stale,
        frameResets: [],
        window: { ...WINDOW, windowLengthMs: 2000 },
        headingSigmaRad: HEADING_SIGMA,
      }),
    ).toEqual({ ok: false, reason: 'stale_samples' });
  });

  it('refuses a negative heading 1-sigma (Req 10.3)', () => {
    expect(
      yawReferenceFromCompass({
        samples: compassSamples(),
        frameResets: [],
        window: WINDOW,
        headingSigmaRad: -1,
      }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'headingSigmaRad',
    });
  });
});

function knownSamples(frame: 'relative' | 'absolute', count = 10): OrientationSample[] {
  return samplesEndingAt(END, count, (_, t) => sampleAt(t, pointing(rad(70)), { frame }));
}

function known(
  samples: readonly OrientationSample[],
  frameResets: readonly FrameResetEvent[] = [],
) {
  return yawReferenceFromKnownAzimuth({
    samples,
    frameResets,
    window: WINDOW,
    knownAzimuthRad: rad(100),
    knownSigmaRad: rad(0.2),
    northReference: 'true',
  });
}

describe('yawReferenceFromKnownAzimuth (Req 5.2, 5.3, 5.16, 5.17)', () => {
  it('works in both frames and records the frame', () => {
    for (const frame of ['relative', 'absolute'] as const) {
      const reference = expectOk(known(knownSamples(frame)));
      expect(reference.frame).toBe(frame);
      expect(angleErrorRad(reference.offsetRad, rad(30))).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(reference.sigmaRad - rad(0.2))).toBeLessThanOrEqual(1e-15);
      expect(reference.northReference).toBe('true');
    }
  });

  it('refuses a window that mixes frames (Req 5.2)', () => {
    const mixed = [...knownSamples('relative', 5), ...knownSamples('absolute', 5)];
    expect(known(mixed)).toEqual({ ok: false, reason: 'frame_reset' });
  });

  it('lets only frame_change invalidate an Absolute window, and any reset a Relative one (Req 5.10, 5.17)', () => {
    const hidden: FrameResetEvent[] = [{ timeUtcMs: END - 500, cause: 'hidden' }];
    const change: FrameResetEvent[] = [{ timeUtcMs: END - 500, cause: 'frame_change' }];
    expect(known(knownSamples('absolute'), hidden).ok).toBe(true);
    expect(known(knownSamples('absolute'), change)).toEqual({ ok: false, reason: 'frame_reset' });
    expect(known(knownSamples('relative'), hidden)).toEqual({ ok: false, reason: 'frame_reset' });
  });

  it('takes the azimuth of an Off-axis ray when an offset is given (Req 3.5)', () => {
    const reference = expectOk(
      yawReferenceFromKnownAzimuth({
        samples: knownSamples('absolute'),
        frameResets: [],
        window: WINDOW,
        knownAzimuthRad: rad(100),
        knownSigmaRad: 0,
        northReference: 'magnetic',
        rayOffset: { rightRad: rad(10), upRad: 0 },
      }),
    );
    // The ray 10° right of a level camera at 70° points at 80°.
    expect(angleErrorRad(reference.offsetRad, rad(20))).toBeLessThanOrEqual(1e-12);
  });

  it('refuses invalid known values', () => {
    const base = {
      samples: knownSamples('relative'),
      frameResets: [],
      window: WINDOW,
      northReference: 'true' as const,
    };
    expect(
      yawReferenceFromKnownAzimuth({ ...base, knownAzimuthRad: Number.NaN, knownSigmaRad: 0 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'knownAzimuthRad',
    });
    expect(
      yawReferenceFromKnownAzimuth({ ...base, knownAzimuthRad: 0, knownSigmaRad: -1 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'knownSigmaRad',
    });
  });
});

describe('applyYawReference (Req 5.5)', () => {
  const reference: YawReference = {
    offsetRad: rad(-30),
    sigmaRad: 0,
    northReference: 'magnetic',
    frame: 'relative',
    establishedUtcMs: 0,
  };

  it('adds the offset, wraps, and labels the North reference', () => {
    const result = expectOk(applyYawReference(rad(10), reference));
    expect(result.northReference).toBe('magnetic');
    if (result.northReference !== 'magnetic') return;
    expect(angleErrorRad(result.magneticAzimuthRad, rad(340))).toBeLessThanOrEqual(1e-12);
    expect(result.magneticAzimuthRad >= 0 && result.magneticAzimuthRad < 2 * Math.PI).toBe(true);
    const trueResult = expectOk(
      applyYawReference(rad(10), { ...reference, northReference: 'true' }),
    );
    expect(trueResult.northReference).toBe('true');
  });

  it('refuses non-finite azimuths', () => {
    expect(applyYawReference(Number.NaN, reference)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'frameAzimuthRad',
    });
  });
});
