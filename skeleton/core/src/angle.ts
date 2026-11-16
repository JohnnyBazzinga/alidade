// Angle primitives (Req 1). All angles are radians unless the name ends in `Deg`.
//
// The public functions return a Result and fail with `invalid_number` instead of letting
// NaN or an infinity through (Req 1.9, design D1, D17). Code inside this package that already
// knows its inputs are finite uses the unchecked helpers `_wrapTwoPi` and `_wrapPi`; they are
// exported from this file for sibling modules and are not part of the public API.

import { err, ok, type Result } from './result';

export const TWO_PI_RAD = 2 * Math.PI;
const RAD_PER_DEG = Math.PI / 180;
const DEG_PER_RAD = 180 / Math.PI;
/** Below this mean resultant length the circular mean is undefined (Req 1.8). */
const MIN_MEAN_RESULTANT_LENGTH = 1e-9;

/**
 * Wraps a finite angle to [0, 2π). Unchecked: the caller guarantees `angleRad` is finite.
 *
 * `%` is exact in IEEE arithmetic, so the remainder keeps every bit of a small angle. 2π is added
 * only to a negative remainder; adding it to every value, as `(x % 2π + 2π) % 2π` does, would
 * round a small result to a multiple of ulp(2π) ≈ 8.9e-16 rad. A negative remainder too small to
 * survive the addition rounds to 2π, which is mapped to 0. Adding 0 turns -0 into +0.
 */
export function _wrapTwoPi(angleRad: number): number {
  const remainderRad = angleRad % TWO_PI_RAD;
  const wrappedRad = remainderRad < 0 ? remainderRad + TWO_PI_RAD : remainderRad;
  return (wrappedRad >= TWO_PI_RAD ? 0 : wrappedRad) + 0;
}

/**
 * Wraps a finite angle to (-π, π]. Unchecked: the caller guarantees `angleRad` is finite.
 *
 * The remainder is in (-2π, 2π) with the sign of the input, and 2π is added or subtracted only
 * when it falls outside (-π, π], so small angles keep full precision (see `_wrapTwoPi`).
 */
export function _wrapPi(angleRad: number): number {
  const remainderRad = angleRad % TWO_PI_RAD;
  if (remainderRad > Math.PI) return remainderRad - TWO_PI_RAD;
  if (remainderRad <= -Math.PI) return remainderRad + TWO_PI_RAD;
  return remainderRad + 0;
}

/** Wraps an angle to [0, 2π) (Req 1.1). */
export function wrapTwoPi(angleRad: number): Result<number> {
  if (!Number.isFinite(angleRad)) return err('invalid_number');
  return ok(_wrapTwoPi(angleRad));
}

/** Wraps an angle to (-π, π] (Req 1.1). */
export function wrapPi(angleRad: number): Result<number> {
  if (!Number.isFinite(angleRad)) return err('invalid_number');
  return ok(_wrapPi(angleRad));
}

/**
 * The angular difference `wrapPi(aRad - bRad)` (Req 1.3).
 *
 * Each argument is wrapped to (-π, π] before the subtraction. That gives the same result modulo
 * 2π, keeps full precision for large arguments and for small ones, and cannot overflow for
 * finite arguments near the limit of the double range, where `aRad - bRad` itself would become
 * infinite.
 */
export function angularDifference(aRad: number, bRad: number): Result<number> {
  if (!Number.isFinite(aRad) || !Number.isFinite(bRad)) return err('invalid_number');
  return ok(_wrapPi(_wrapPi(aRad) - _wrapPi(bRad)));
}

/** Converts degrees to radians (Req 1.5). Fails if the input or the result is not finite. */
export function degToRad(angleDeg: number): Result<number> {
  const angleRad = angleDeg * RAD_PER_DEG;
  if (!Number.isFinite(angleDeg) || !Number.isFinite(angleRad)) return err('invalid_number');
  return ok(angleRad);
}

/** Converts radians to degrees (Req 1.5). Fails if the input or the result is not finite. */
export function radToDeg(angleRad: number): Result<number> {
  const angleDeg = angleRad * DEG_PER_RAD;
  if (!Number.isFinite(angleRad) || !Number.isFinite(angleDeg)) return err('invalid_number');
  return ok(angleDeg);
}

/**
 * The circular mean `atan2(Σ sin, Σ cos)`, wrapped to [0, 2π) (Req 1.6).
 *
 * Fails with `invalid_number` if any angle is not finite, and with `undefined_mean` if the mean
 * resultant length is below 1e-9 (Req 1.8). An empty list has no mean, so it also fails with
 * `undefined_mean`.
 */
export function circularMean(anglesRad: readonly number[]): Result<number> {
  if (!anglesRad.every((angleRad) => Number.isFinite(angleRad))) return err('invalid_number');
  if (anglesRad.length === 0) return err('undefined_mean');

  let sineSum = 0;
  let cosineSum = 0;
  for (const angleRad of anglesRad) {
    sineSum += Math.sin(angleRad);
    cosineSum += Math.cos(angleRad);
  }
  const meanResultantLength = Math.hypot(sineSum, cosineSum) / anglesRad.length;
  if (meanResultantLength < MIN_MEAN_RESULTANT_LENGTH) return err('undefined_mean');

  return ok(_wrapTwoPi(Math.atan2(sineSum, cosineSum)));
}
