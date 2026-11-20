// Core's wrappers as plain numbers for tests (test support, not exported): Core returns a Result
// for a number that is not finite; a test that reaches that has a bug and should throw.

import { wrapPi, wrapTwoPi } from '@alidade/core';

/** `wrapPi` of a finite number, in (-π, π]. */
export function wrapPiN(angleRad: number): number {
  const r = wrapPi(angleRad);
  if (!r.ok) throw new Error(`wrapPi failed for ${angleRad}`);
  return r.value;
}

/** `wrapTwoPi` of a finite number, in [0, 2π). */
export function wrapTwoPiN(angleRad: number): number {
  const r = wrapTwoPi(angleRad);
  if (!r.ok) throw new Error(`wrapTwoPi failed for ${angleRad}`);
  return r.value;
}
