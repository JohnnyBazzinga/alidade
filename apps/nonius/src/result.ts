// Result type of Nonius (Req 2.1, 2.5, design D2).
//
// Expected failures are values, never exceptions. `ok` and `err` are internal (nothing
// re-exports them), so that `ok(NaN)` cannot be written by a caller outside the package.

import type { Success } from '@alidade/core';
import type { NoniusReason } from './reasons';

/**
 * `field` names the offending input, `id` the offending Sight, `reportedAccuracyM` is carried
 * through from Sensors' `coarse_location`, and `errorName` is the `name` of a browser error an
 * Adapter mapped, kept for developers and never shown to the user.
 */
export interface NoniusFailure {
  readonly ok: false;
  readonly reason: NoniusReason;
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;
  readonly errorName?: string;
}

export type NoniusResult<T> = Success<T> | NoniusFailure;

/** The details a failure may carry. */
export interface NoniusFailureDetails {
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;
  readonly errorName?: string;
}

export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function err(reason: NoniusReason, details: NoniusFailureDetails = {}): NoniusFailure {
  return { ok: false, reason, ...details };
}
