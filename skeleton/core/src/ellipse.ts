// Error ellipses and the symmetric 2×2 eigenvalue helper (Req 8.2, 8.3).

import { _wrapTwoPi } from './angle';
import type { CovarianceEnM2, Ellipse } from './measurement-model';
import { err, ok, type Result } from './result';

/** The 95% scale of a 1-sigma ellipse: sqrt(5.991), chi-square with 2 degrees of freedom. */
export const CONFIDENCE_95_SCALE = 2.4477;

/** A matrix counts as circular when its eigenvalue spread is below this share of the largest. */
const CIRCULAR_RELATIVE_SPREAD = 1e-12;

/** The eigenvalues of a symmetric 2×2 matrix. Unit-agnostic: the caller knows the units. */
export interface SymmetricEigenvalues {
  readonly largestEigenvalue: number;
  readonly smallestEigenvalue: number;
  /** Half the gap between the eigenvalues: `hypot((a - c) / 2, b)`, never negative. */
  readonly halfSpread: number;
}

/**
 * Eigenvalues of the symmetric matrix [[a, b], [b, c]].
 *
 * It avoids `sqrt(tr² - 4·det)`, whose argument can be negative by rounding for a nearly
 * circular matrix: `h = hypot((a - c) / 2, b)` is never negative, the largest eigenvalue is
 * `(a + c) / 2 + h`, and the smallest is `det / largest`.
 *
 * The result can contain NaN or an infinity if the inputs are non-finite or overflow. Callers
 * test `largest > 0 && smallest > 0` (a test that a NaN fails), they do not test the negation.
 */
export function _symmetricEigenvalues(a: number, b: number, c: number): SymmetricEigenvalues {
  const halfSpread = Math.hypot((a - c) / 2, b);
  const largestEigenvalue = (a + c) / 2 + halfSpread;
  const smallestEigenvalue = (a * c - b * b) / largestEigenvalue;
  return { largestEigenvalue, smallestEigenvalue, halfSpread };
}

/**
 * The 1-sigma error ellipse of a covariance (Req 8.2).
 *
 * Fails with `invalid_number` if an entry is not finite or the matrix is not positive definite
 * (both eigenvalues must be finite and greater than zero). The semi-axes are the square roots of
 * the eigenvalues. The major-axis azimuth is in [0, π); for an ellipse that is circular within
 * rounding, `h ≤ 1e-12 · largest eigenvalue`, it is 0 because the axis is then undefined.
 */
export function ellipseFromCovariance(covariance: CovarianceEnM2): Result<Ellipse> {
  const { varEastM2: a, covEastNorthM2: b, varNorthM2: c } = covariance;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
    return err('invalid_number');
  }
  const { largestEigenvalue, smallestEigenvalue, halfSpread } = _symmetricEigenvalues(a, b, c);
  const positiveDefinite =
    Number.isFinite(largestEigenvalue) &&
    Number.isFinite(smallestEigenvalue) &&
    largestEigenvalue > 0 &&
    smallestEigenvalue > 0;
  if (!positiveDefinite) return err('invalid_number');

  const semiMajorM = Math.sqrt(largestEigenvalue);
  // The smallest eigenvalue cannot exceed the largest; the minimum guards a rounding tie.
  const semiMinorM = Math.min(Math.sqrt(smallestEigenvalue), semiMajorM);

  if (halfSpread <= CIRCULAR_RELATIVE_SPREAD * largestEigenvalue) {
    return ok({ semiMajorM, semiMinorM, azimuthRad: 0 });
  }
  // The major axis points at angle φ = ½·atan2(2b, a - c) counterclockwise from East. Its
  // azimuth, clockwise from North, is π/2 - φ, and an axis has no direction, so reduce modulo π.
  const eastAngleRad = 0.5 * Math.atan2(2 * b, a - c);
  const azimuthRad = _wrapTwoPi(Math.PI / 2 - eastAngleRad) % Math.PI;
  return ok({ semiMajorM, semiMinorM, azimuthRad });
}

/**
 * The 95% ellipse of a 1-sigma ellipse: both semi-axes times 2.4477 (Req 8.3). Fails with
 * `invalid_number` if a number is not finite, an axis is not greater than zero, or the scaled
 * axis overflows.
 */
export function ellipse95(ellipse: Ellipse): Result<Ellipse> {
  const { semiMajorM, semiMinorM, azimuthRad } = ellipse;
  const valid =
    Number.isFinite(semiMajorM) &&
    Number.isFinite(semiMinorM) &&
    Number.isFinite(azimuthRad) &&
    semiMajorM > 0 &&
    semiMinorM > 0;
  if (!valid) return err('invalid_number');

  const scaledMajorM = semiMajorM * CONFIDENCE_95_SCALE;
  const scaledMinorM = semiMinorM * CONFIDENCE_95_SCALE;
  if (!Number.isFinite(scaledMajorM) || !Number.isFinite(scaledMinorM))
    return err('invalid_number');
  return ok({ semiMajorM: scaledMajorM, semiMinorM: scaledMinorM, azimuthRad });
}
