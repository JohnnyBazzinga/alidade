/**
 * The wrapped difference of two angles, in (-π, π], that every angle comparison in the tests uses
 * (testing.md rule 6). Compare its magnitude with a tolerance; never compare angles with `===` or
 * by subtracting them directly.
 *
 * Computed as `atan2(sin(a - b), cos(a - b))`, independently of Core's wrap functions. Exact for
 * differences of a few radians: `sin` and `cos` of a small difference keep its full precision.
 */
export function wrappedDifferenceRad(aRad: number, bRad: number): number {
  const differenceRad = aRad - bRad;
  return Math.atan2(Math.sin(differenceRad), Math.cos(differenceRad));
}

/** The magnitude of the wrapped difference. */
export function angleErrorRad(aRad: number, bRad: number): number {
  return Math.abs(wrappedDifferenceRad(aRad, bRad));
}

/** Degrees to radians for test data, as Core's `degToRad` computes it. */
export function rad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
