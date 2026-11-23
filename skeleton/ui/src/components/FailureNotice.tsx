// A failure, shown only through `messageFor` (Req 3.6): what happened and what to do. The reason's
// code, the field and the error name are never shown. It is a warning card (Req 22.13): the
// Message's `whatHappened` is the headline and its `whatToDo` the rest.

import type { UiFailure } from '../result';
import type { UiReason } from '../reasons';
import { messageFor } from '../math/messages';
import { StatusCard } from './StatusCard';

export interface FailureLike {
  readonly reason: UiReason;
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;
  readonly errorName?: string;
}

export function asFailure(f: FailureLike): UiFailure {
  return {
    ok: false,
    reason: f.reason,
    ...(f.field !== undefined ? { field: f.field } : {}),
    ...(f.id !== undefined ? { id: f.id } : {}),
    ...(f.reportedAccuracyM !== undefined ? { reportedAccuracyM: f.reportedAccuracyM } : {}),
    ...(f.errorName !== undefined ? { errorName: f.errorName } : {}),
  };
}

export function FailureNotice({ failure }: { readonly failure: FailureLike }) {
  const message = messageFor(asFailure(failure));
  return (
    <StatusCard tone="warning" role="alert" testId="failure-notice" headline={message.whatHappened}>
      {message.whatToDo}
    </StatusCard>
  );
}
