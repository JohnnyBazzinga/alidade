// A failure, shown only through `messageFor` (Req 3.6): what happened and what to do. The reason's
// code, the field and the error name are never shown.

import type { UiFailure } from '../result';
import type { UiReason } from '../reasons';
import { messageFor } from '../math/messages';
import { COLOURS, BODY_FONT_STACK, SIZES } from './theme';

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
    <div
      role="alert"
      data-testid="failure-notice"
      style={{
        background: COLOURS.panel,
        borderLeft: `3px solid ${COLOURS.alert}`,
        padding: SIZES.gapPx,
        fontFamily: BODY_FONT_STACK,
        fontSize: SIZES.labelPx,
      }}
    >
      <p style={{ margin: 0, color: COLOURS.alert }}>{message.whatHappened}</p>
      <p style={{ margin: 0, color: COLOURS.ink }}>{message.whatToDo}</p>
    </div>
  );
}
