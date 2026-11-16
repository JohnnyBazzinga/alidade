/**
 * The wrapped difference of two angles, in (-π, π], that every angle comparison in the tests
 * uses (testing.md rule 6). Compare its magnitude with a tolerance; never compare angles with
 * `===` or by subtracting them directly.
 *
 * It is computed as `atan2(sin(a - b), cos(a - b))`, which does not use the wrap functions in
 * `angle.ts`. A test of those functions therefore cannot be satisfied by a bug that the same
 * functions would hide in the comparison. At a difference of exactly ±π the sign of the result
 * is not defined, so compare magnitudes.
 */
export function wrappedDifferenceRad(aRad: number, bRad: number): number {
  const differenceRad = aRad - bRad;
  return Math.atan2(Math.sin(differenceRad), Math.cos(differenceRad));
}
