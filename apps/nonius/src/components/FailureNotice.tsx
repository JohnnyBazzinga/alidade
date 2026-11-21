// A failure, shown only through Nonius's `messageFor` (Req 2.3, 2.5): what happened, then what to
// do. UI's notice takes only UI's reasons, so Vigia has its own, in UI's look. The reason's code,
// the field, the id and the error name are never shown.

import { BODY_FONT_STACK, COLOURS, SIZES } from '@alidade/ui';
import { messageFor } from '../math/messages';
import type { NoniusFailure } from '../result';

export interface FailureNoticeProps {
  readonly failure: NoniusFailure;
  /** How many saved sightings were left out (`storage_corrupt`, design D4). */
  readonly count?: number;
}

export function FailureNotice({ failure, count }: FailureNoticeProps) {
  const message = messageFor(failure);
  const countText =
    count !== undefined && Number.isInteger(count) && count > 0
      ? ` ${count} saved sighting${count === 1 ? ' was' : 's were'} left out.`
      : '';
  return (
    <div
      role="alert"
      data-testid="failure-notice"
      data-reason={failure.reason}
      style={{
        background: COLOURS.panel,
        borderLeft: `4px solid ${COLOURS.alert}`,
        padding: SIZES.gapPx * 1.5,
        fontFamily: BODY_FONT_STACK,
        fontSize: SIZES.labelPx,
        lineHeight: 1.35,
        overflowWrap: 'anywhere',
      }}
    >
      <span style={{ color: COLOURS.alert }}>
        {message.whatHappened}
        {countText}
      </span>{' '}
      <span style={{ color: COLOURS.ink }}>{message.whatToDo}</span>
    </div>
  );
}
