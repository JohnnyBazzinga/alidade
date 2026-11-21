// What a tool handler returns (design D9, D10): a value, never an exception. Every number in it is
// finite (Req 6.6).

import type { Json } from './json-rpc.ts';
import { messageFor, type AnyReason } from './messages.ts';

export interface SuccessOutcome {
  readonly ok: true;
  readonly [key: string]: Json;
}

export interface FailureOutcome {
  readonly ok: false;
  readonly reason: string;
  readonly message: string;
  readonly field?: string;
  readonly id?: string;
}

export type Outcome = SuccessOutcome | FailureOutcome;

/** A failure with the words of its reason; `field` and `id` only when they are given and not empty. */
export function failure(
  reason: AnyReason,
  details: { readonly field?: string | undefined; readonly id?: string | undefined } = {},
): FailureOutcome {
  return {
    ok: false,
    reason,
    message: messageFor(reason),
    ...(details.field === undefined || details.field === '' ? {} : { field: details.field }),
    ...(details.id === undefined ? {} : { id: details.id }),
  };
}

/** True when a number anywhere in the value is NaN or infinite (a walk with its own stack). */
export function findNonFinite(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) return true;
    } else if (Array.isArray(current)) {
      pending.push(...current);
    } else if (typeof current === 'object' && current !== null) {
      pending.push(...Object.values(current));
    }
  }
  return false;
}

/** The outcome itself, or the `non_finite_result` failure when it holds a non-finite number. */
export function finiteOrFailure(outcome: Outcome): Outcome {
  return findNonFinite(outcome) ? failure('non_finite_result') : outcome;
}
