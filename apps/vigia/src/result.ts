// Result type of Vigia (Req 2.1, 2.5, design D2, §6).
//
// Expected failures are values, never exceptions. A failure of Core, Sensors or UI is a
// `VigiaFailure` as it is: its reason is a member of `VigiaReason` and its details are kept
// unchanged. `ok` and `err` are internal (nothing re-exports them), so that `ok(NaN)` cannot be
// written by a caller outside the package.

import type { Success } from '@alidade/core';
import type { VigiaReason } from './reasons';

/**
 * `field` names the offending input, `id` the offending Sighting or Bearing, `reportedAccuracyM`
 * is carried through from Sensors' `coarse_location`, and `errorName` is the `name` of a browser
 * error an Adapter mapped, kept for developers and never shown to the user.
 */
export interface VigiaFailure {
  readonly ok: false;
  readonly reason: VigiaReason;
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;
  readonly errorName?: string;
}

export type VigiaResult<T> = Success<T> | VigiaFailure;

/** The details a failure may carry. */
export interface VigiaFailureDetails {
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;
  readonly errorName?: string;
}

export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function err(reason: VigiaReason, details: VigiaFailureDetails = {}): VigiaFailure {
  return { ok: false, reason, ...details };
}
