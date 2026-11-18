// Result type of @alidade/ui (Req 2.1 to 2.4, design D2, §6).
//
// Expected failures are values, never exceptions. A failure of Sensors or Core is a `UiFailure`
// as it is: its reason is a member of `UiReason` and its details are kept unchanged (Req 2.4).

import type { Success } from '@alidade/core';
import type { UiReason } from './reasons';

/**
 * `field` names the offending input, `id` the offending observation, `reportedAccuracyM` is
 * carried through from Sensors' `coarse_location`, and `errorName` is the `name` of a browser
 * error an Adapter mapped, kept for developers and never shown to the user (Req 2.3).
 */
export interface UiFailure {
  readonly ok: false;
  readonly reason: UiReason;
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;
  readonly errorName?: string;
}

export type UiResult<T> = Success<T> | UiFailure;

/** The details a failure may carry. */
export interface UiFailureDetails {
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;
  readonly errorName?: string;
}

/** Internal: not exported from index.ts, so that `ok(NaN)` cannot be written by a caller. */
export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

/** Internal: not exported from index.ts. */
export function err(reason: UiReason, details: UiFailureDetails = {}): UiFailure {
  return { ok: false, reason, ...details };
}
