import { _wrapPi } from '../angle';

/**
 * The wrapped difference `wrapPi(aRad - bRad)` that every angle comparison in the tests uses
 * (testing.md rule 6). Compare its magnitude with a tolerance; never compare angles with `===`
 * or by subtracting them directly.
 */
export function wrappedDifferenceRad(aRad: number, bRad: number): number {
  return _wrapPi(aRad - bRad);
}
