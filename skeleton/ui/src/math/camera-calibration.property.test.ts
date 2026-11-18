import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { propertyRuns } from '../test-support/fast-check-setup';
import { closed, sourceSize, uniform, uniformInteger } from '../test-support/generators';
import { hostileNumber } from '../test-support/hostile';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import {
  checkCalibration,
  focalLengthSourcePx,
  type CameraCalibration,
  type FovAxis,
} from './camera-calibration';

const DEG = Math.PI / 180;

/**
 * Domain (valid): Source image sizes (integers) in [64, 8192] per side, `fovRad` in
 * [20°, 150°], `fovSigmaRad` in [0.01°, 5°] (ends drawn), `fovAxis` each of the three. All of
 * these satisfy Req 4.1 (fov ± sigma stays inside (0, π)). Excludes everything else, which
 * `invalidCase` draws.
 */
const validCalibration: fc.Arbitrary<CameraCalibration> = fc
  .tuple(
    sourceSize(),
    closed(20 * DEG, 150 * DEG),
    closed(0.01 * DEG, 5 * DEG),
    fc.constantFrom<FovAxis>('width', 'height', 'diagonal'),
  )
  .map(([size, fovRad, fovSigmaRad, fovAxis]) => ({
    fovRad,
    fovAxis,
    fovSigmaRad,
    imageWidthSourcePx: size.widthSourcePx,
    imageHeightSourcePx: size.heightSourcePx,
  }));

const FIELDS = [
  'fovRad',
  'fovAxis',
  'fovSigmaRad',
  'fovSigmaRad', // fov - sigma not above 0, or fov + sigma not below π
  'imageWidthSourcePx',
  'imageHeightSourcePx',
] as const;

/** A value that is not a valid size: not finite, zero or negative. */
const badSize = fc.oneof(
  fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, -0, -1, -64),
  uniform(-10_000, 0),
);

/**
 * Domain (invalid): one invalid draw per case of Req 4.1, indexed 0 to 5 in the order of its
 * fields. The fields before the invalid one are valid; the fields after it are valid or
 * hostile (any double, a wrong axis), so that the order of the checks is part of the property.
 */
const invalidCase: fc.Arbitrary<{ calibration: CameraCalibration; expectedField: string }> = fc
  .record({
    base: validCalibration,
    kind: uniformInteger(0, 5),
    hostileAfter: fc.boolean(),
    hostile: hostileNumber(),
    hostileAxis: fc.string({ maxLength: 8 }),
    badFov: fc.oneof(
      fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, -0, Math.PI),
      uniform(-5, 0),
      uniform(Math.PI, 10),
    ),
    badAxis: fc
      .string({ maxLength: 10 })
      .filter((s) => s !== 'width' && s !== 'height' && s !== 'diagonal'),
    badSigma: fc.oneof(
      fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, -0),
      uniform(-1, 0),
      uniform(0, 0.0099 * DEG),
    ),
    tooWide: fc.boolean(),
    margin: uniform(1e-6, 0.5),
    size: badSize,
  })
  .map((r) => {
    let c: CameraCalibration = r.base;
    const after = (i: number) => r.kind < i && r.hostileAfter;
    const mutated = (patch: Partial<Record<keyof CameraCalibration, unknown>>) =>
      (c = { ...c, ...patch } as CameraCalibration);
    if (r.kind === 0) mutated({ fovRad: r.badFov });
    if (r.kind === 1) mutated({ fovAxis: r.badAxis });
    if (r.kind === 2) mutated({ fovSigmaRad: r.badSigma });
    if (r.kind === 3) {
      // fov - sigma <= 0 (a small fov and a sigma at least as large), or fov + sigma >= π.
      if (r.tooWide) {
        const fovRad = Math.PI - 0.01 * DEG - r.margin * 0.01;
        mutated({ fovRad, fovSigmaRad: Math.max(0.01 * DEG, Math.PI - fovRad) + 1e-6 });
      } else {
        const fovRad = 0.02 * DEG + r.margin * 0.1;
        mutated({ fovRad, fovSigmaRad: fovRad + 1e-6 + 0.01 * DEG });
      }
    }
    if (r.kind === 4) mutated({ imageWidthSourcePx: r.size });
    if (r.kind === 5) mutated({ imageHeightSourcePx: r.size });
    // Hostile values in the fields after the invalid one.
    if (after(1)) mutated({ fovAxis: r.hostileAxis });
    if (after(2)) mutated({ fovSigmaRad: r.hostile });
    if (after(4)) mutated({ imageWidthSourcePx: r.hostile });
    if (after(5)) mutated({ imageHeightSourcePx: r.hostile });
    return { calibration: c, expectedField: FIELDS[r.kind] ?? 'fovRad' };
  });

// P-4.6 (Req 4.6): a valid calibration is accepted unchanged; each invalid case of Req 4.1 fails
// with `invalid_number` naming the first invalid field in the order of Req 4.1.
describe('P-4.6 checkCalibration', () => {
  it('accepts every valid calibration unchanged', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-4.6 valid',
      fc.property(validCalibration, (calibration) => {
        const result = checkCalibration(calibration);
        tracker.record('rejected valid calibrations', result.ok ? 0 : 1, '0');
        return result.ok && result.value === calibration;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });

  it('names the first invalid field for every invalid case', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-4.6 invalid',
      fc.property(invalidCase, ({ calibration, expectedField }) => {
        const result = checkCalibration(calibration);
        const right =
          !result.ok && result.reason === 'invalid_number' && result.field === expectedField;
        tracker.record('wrongly named or accepted', right ? 0 : 1, '0', expectedField);
        return right;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });

  it('draws every one of the six invalid cases (the property is not vacuous)', () => {
    const kinds = new Set<string>();
    const seen = fc.sample(invalidCase, { numRuns: 400, seed: 3 });
    for (const { expectedField, calibration } of seen) {
      const result = checkCalibration(calibration);
      if (!result.ok && result.field === 'fovSigmaRad') {
        kinds.add(calibration.fovRad + calibration.fovSigmaRad >= Math.PI ? 'sigma-wide' : 'sigma');
      } else {
        kinds.add(expectedField);
      }
    }
    expect(kinds).toEqual(
      new Set([
        'fovRad',
        'fovAxis',
        'sigma',
        'sigma-wide',
        'imageWidthSourcePx',
        'imageHeightSourcePx',
      ]),
    );
  });
});

/**
 * Domain (P-4.7): a Source image size in [64, 8192] per side, `fovRad` in [20°, 150°] on the
 * `diagonal`, and a `fovSigmaRad` in [0.01°, 0.07°] shared by the three calibrations (the least
 * equivalent width or height field of view, at the 128:1 aspect ratio and 20°, is 0.158°, and
 * `fov - sigma` must stay above 0; the sigma plays no part in the focal length).
 */
const equivalentCase = fc.tuple(
  sourceSize(),
  closed(20 * DEG, 150 * DEG),
  closed(0.01 * DEG, 0.07 * DEG),
);

// P-4.7 (Req 4.7): the focal length of a diagonal calibration equals that of the width and the
// height calibrations with fov' = 2·atan((side / diagonal)·tan(fov / 2)), within a relative 1e-12.
describe('P-4.7 focalLengthSourcePx', () => {
  it('is the same for the diagonal, width and height equivalents', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-4.7',
      fc.property(equivalentCase, ([size, fovRad, fovSigmaRad]) => {
        const w = size.widthSourcePx;
        const h = size.heightSourcePx;
        const diagonal = Math.hypot(w, h);
        const base = { fovSigmaRad, imageWidthSourcePx: w, imageHeightSourcePx: h };
        const viaDiagonal = focalLengthSourcePx({ ...base, fovRad, fovAxis: 'diagonal' });
        const viaWidth = focalLengthSourcePx({
          ...base,
          fovRad: 2 * Math.atan((w / diagonal) * Math.tan(fovRad / 2)),
          fovAxis: 'width',
        });
        const viaHeight = focalLengthSourcePx({
          ...base,
          fovRad: 2 * Math.atan((h / diagonal) * Math.tan(fovRad / 2)),
          fovAxis: 'height',
        });
        if (!viaDiagonal.ok || !viaWidth.ok || !viaHeight.ok) return false;
        const errorWidth = Math.abs(viaWidth.value - viaDiagonal.value) / viaDiagonal.value;
        const errorHeight = Math.abs(viaHeight.value - viaDiagonal.value) / viaDiagonal.value;
        tracker.record('relative error, width vs diagonal', errorWidth, '1e-12');
        tracker.record('relative error, height vs diagonal', errorHeight, '1e-12');
        return errorWidth <= 1e-12 && errorHeight <= 1e-12;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});
