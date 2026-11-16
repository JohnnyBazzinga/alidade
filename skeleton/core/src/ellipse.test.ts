import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_95_SCALE,
  _symmetricEigenvalues,
  ellipse95,
  ellipseFromCovariance,
} from './ellipse';
import type { CovarianceEnM2 } from './measurement-model';
import { err } from './result';
import { unwrapOk } from './test-support/result-helpers';

const rad = (angleDeg: number): number => (angleDeg * Math.PI) / 180;
const covariance = (
  varEastM2: number,
  varNorthM2: number,
  covEastNorthM2: number,
): CovarianceEnM2 => ({ varEastM2, varNorthM2, covEastNorthM2 });

/**
 * The covariance whose major axis (variance `majorVarianceM2`) points at azimuth `azimuthRad`
 * and whose minor axis has variance `minorVarianceM2`. Built from the axis directions, not from
 * the formulas under test: the major axis is (sin α, cos α) in (East, North).
 */
function covarianceWithMajorAxis(
  azimuthRad: number,
  majorVarianceM2: number,
  minorVarianceM2: number,
): CovarianceEnM2 {
  const sinAzimuth = Math.sin(azimuthRad);
  const cosAzimuth = Math.cos(azimuthRad);
  return covariance(
    majorVarianceM2 * sinAzimuth ** 2 + minorVarianceM2 * cosAzimuth ** 2,
    majorVarianceM2 * cosAzimuth ** 2 + minorVarianceM2 * sinAzimuth ** 2,
    (majorVarianceM2 - minorVarianceM2) * sinAzimuth * cosAzimuth,
  );
}

describe('_symmetricEigenvalues', () => {
  it('finds the eigenvalues of [[3, 1], [1, 3]] as 4 and 2', () => {
    const eigenvalues = _symmetricEigenvalues(3, 1, 3);
    expect(eigenvalues.largestEigenvalue).toBeCloseTo(4, 12);
    expect(eigenvalues.smallestEigenvalue).toBeCloseTo(2, 12);
    expect(eigenvalues.halfSpread).toBeCloseTo(1, 12);
  });

  it('has both eigenvalues above zero for a positive-definite matrix', () => {
    const eigenvalues = _symmetricEigenvalues(4, 1, 9);
    expect(eigenvalues.largestEigenvalue).toBeGreaterThan(0);
    expect(eigenvalues.smallestEigenvalue).toBeGreaterThan(0);
  });

  it('has a smallest eigenvalue of exactly 0 for the singular matrix [[1, 1], [1, 1]]', () => {
    const eigenvalues = _symmetricEigenvalues(1, 1, 1);
    expect(eigenvalues.largestEigenvalue).toBeCloseTo(2, 12);
    expect(eigenvalues.smallestEigenvalue).toBe(0);
    expect(eigenvalues.smallestEigenvalue > 0).toBe(false);
  });

  it('has a negative smallest eigenvalue for an indefinite matrix', () => {
    expect(_symmetricEigenvalues(1, 2, 1).smallestEigenvalue).toBeCloseTo(-1, 12);
  });

  it('produces values that fail the positive test when an entry is NaN', () => {
    const eigenvalues = _symmetricEigenvalues(Number.NaN, 0, 1);
    expect(eigenvalues.largestEigenvalue > 0 && eigenvalues.smallestEigenvalue > 0).toBe(false);
  });
});

describe('ellipseFromCovariance', () => {
  it('gives a major axis due east for a diagonal covariance with the larger variance in East', () => {
    const ellipse = unwrapOk(ellipseFromCovariance(covariance(4, 1, 0)));
    expect(ellipse.semiMajorM).toBeCloseTo(2, 12);
    expect(ellipse.semiMinorM).toBeCloseTo(1, 12);
    expect(ellipse.azimuthRad).toBeCloseTo(Math.PI / 2, 12);
  });

  it('gives a major axis due north for a diagonal covariance with the larger variance in North', () => {
    const ellipse = unwrapOk(ellipseFromCovariance(covariance(1, 9, 0)));
    expect(ellipse.semiMajorM).toBeCloseTo(3, 12);
    expect(ellipse.semiMinorM).toBeCloseTo(1, 12);
    expect(ellipse.azimuthRad).toBeCloseTo(0, 12);
  });

  it('gives azimuth 0, not π, when the covariance is -0 off the diagonal and North is larger', () => {
    const ellipse = unwrapOk(ellipseFromCovariance(covariance(1, 9, -0)));
    expect(ellipse.azimuthRad).toBe(0);
  });

  it('points north-east for equal variances with positive covariance', () => {
    const ellipse = unwrapOk(ellipseFromCovariance(covariance(5, 5, 3)));
    expect(ellipse.semiMajorM).toBeCloseTo(Math.sqrt(8), 12);
    expect(ellipse.semiMinorM).toBeCloseTo(Math.sqrt(2), 12);
    expect(ellipse.azimuthRad).toBeCloseTo(rad(45), 12);
  });

  it.each([0, 10, 30, 45, 90, 120, 170, 179.9999])(
    'recovers a major axis at %s° from a covariance rotated by that angle',
    (azimuthDeg) => {
      const ellipse = unwrapOk(
        ellipseFromCovariance(covarianceWithMajorAxis(rad(azimuthDeg), 25, 4)),
      );
      expect(ellipse.semiMajorM).toBeCloseTo(5, 10);
      expect(ellipse.semiMinorM).toBeCloseTo(2, 10);
      expect(ellipse.azimuthRad).toBeCloseTo(rad(azimuthDeg), 10);
    },
  );

  it('folds a major axis given by its opposite direction into [0, π)', () => {
    // An axis at 300° is the same line as one at 120°.
    const ellipse = unwrapOk(ellipseFromCovariance(covarianceWithMajorAxis(rad(300), 25, 4)));
    expect(ellipse.azimuthRad).toBeCloseTo(rad(120), 10);
  });

  it('always returns an azimuth in [0, π)', () => {
    for (let azimuthDeg = 0; azimuthDeg < 360; azimuthDeg += 7.5) {
      const ellipse = unwrapOk(
        ellipseFromCovariance(covarianceWithMajorAxis(rad(azimuthDeg), 9, 1)),
      );
      expect(ellipse.azimuthRad).toBeGreaterThanOrEqual(0);
      expect(ellipse.azimuthRad).toBeLessThan(Math.PI);
    }
  });

  it('gives azimuth 0 for a circular covariance', () => {
    const ellipse = unwrapOk(ellipseFromCovariance(covariance(2, 2, 0)));
    expect(ellipse.semiMajorM).toBeCloseTo(Math.SQRT2, 12);
    expect(ellipse.semiMinorM).toBeCloseTo(Math.SQRT2, 12);
    expect(ellipse.azimuthRad).toBe(0);
  });

  // For this covariance the naive discriminant tr² - 4·det is negative by rounding, so a
  // formula built on its square root returns NaN. It is a near-circular matrix: the entries
  // differ by about 1e-16.
  it('still gives real axes where sqrt(tr² - 4·det) would be NaN', () => {
    const a = 1.0612080572173;
    const b = -4.712710476161508e-16;
    const c = 1.0612080572172993;
    expect((a + c) ** 2 - 4 * (a * c - b * b)).toBeLessThan(0);

    const ellipse = unwrapOk(ellipseFromCovariance(covariance(a, c, b)));
    expect(ellipse.semiMajorM).toBeCloseTo(Math.sqrt(a), 12);
    expect(ellipse.semiMinorM).toBeCloseTo(Math.sqrt(a), 12);
    expect(ellipse.semiMajorM).toBeGreaterThanOrEqual(ellipse.semiMinorM);
    expect(ellipse.azimuthRad).toBe(0);
  });

  it('keeps the semi-major axis at least the semi-minor axis', () => {
    for (const entries of [
      covariance(1, 1 + 1e-15, 0),
      covariance(3, 3, 1e-14),
      covariance(2, 5, 1),
    ]) {
      const ellipse = unwrapOk(ellipseFromCovariance(entries));
      expect(ellipse.semiMajorM).toBeGreaterThanOrEqual(ellipse.semiMinorM);
      expect(ellipse.semiMinorM).toBeGreaterThan(0);
    }
  });

  describe('invalid_number', () => {
    it.each([
      ['a NaN entry', covariance(Number.NaN, 1, 0)],
      ['a NaN off-diagonal entry', covariance(1, 1, Number.NaN)],
      ['an infinite entry', covariance(1, Number.POSITIVE_INFINITY, 0)],
      ['an indefinite matrix', covariance(1, 1, 2)],
      ['a singular matrix', covariance(1, 1, 1)],
      ['a zero matrix', covariance(0, 0, 0)],
      ['a negative diagonal', covariance(-1, -1, 0)],
      ['one negative variance', covariance(4, -1, 0)],
      ['entries that overflow', covariance(1e308, 1e308, 0)],
    ])('is returned for %s', (_description, entries) => {
      expect(ellipseFromCovariance(entries)).toStrictEqual(err('invalid_number'));
    });
  });
});

describe('ellipse95', () => {
  it('uses the scale sqrt(5.991) rounded to 2.4477', () => {
    expect(CONFIDENCE_95_SCALE).toBe(2.4477);
    expect(Math.abs(CONFIDENCE_95_SCALE - Math.sqrt(5.991))).toBeLessThan(1e-4);
  });

  it('multiplies both axes by 2.4477 and leaves the azimuth unchanged', () => {
    const ellipse = unwrapOk(ellipse95({ semiMajorM: 10, semiMinorM: 4, azimuthRad: 1.25 }));
    expect(ellipse.semiMajorM).toBeCloseTo(24.477, 12);
    expect(ellipse.semiMinorM).toBeCloseTo(9.7908, 12);
    expect(ellipse.azimuthRad).toBe(1.25);
  });

  it.each([
    ['a NaN axis', { semiMajorM: Number.NaN, semiMinorM: 1, azimuthRad: 0 }],
    ['an infinite axis', { semiMajorM: Number.POSITIVE_INFINITY, semiMinorM: 1, azimuthRad: 0 }],
    ['a zero axis', { semiMajorM: 2, semiMinorM: 0, azimuthRad: 0 }],
    ['a negative axis', { semiMajorM: -2, semiMinorM: 1, azimuthRad: 0 }],
    ['a NaN azimuth', { semiMajorM: 2, semiMinorM: 1, azimuthRad: Number.NaN }],
    ['an axis that overflows when scaled', { semiMajorM: 1e308, semiMinorM: 1, azimuthRad: 0 }],
  ])('returns invalid_number for %s', (_description, ellipse) => {
    expect(ellipse95(ellipse)).toStrictEqual(err('invalid_number'));
  });
});
