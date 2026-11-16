// Guarded inverse trigonometry (math-conventions "Numbers"). Not part of the public API.

import { err, ok, type Result } from './result';

/** Excess over 1 that is accepted as rounding error. A larger excess is a bug and surfaces. */
const MAX_ROUNDING_EXCESS = 1e-12;

/**
 * `asin` of a value that is mathematically in [-1, 1].
 *
 * A value outside [-1, 1] by less than 1e-12 is rounding error and is clamped. A larger excess
 * is not rounding error, so it is returned as a failure and never clamped. NaN and infinite
 * values fail too.
 */
export function _asinChecked(value: number): Result<number> {
  if (!Number.isFinite(value)) return err('invalid_number');
  if (value > 1) {
    return value - 1 < MAX_ROUNDING_EXCESS ? ok(Math.PI / 2) : err('invalid_number');
  }
  if (value < -1) {
    return -1 - value < MAX_ROUNDING_EXCESS ? ok(-Math.PI / 2) : err('invalid_number');
  }
  return ok(Math.asin(value));
}
