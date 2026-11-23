// A failure, shown only through Vigia's `messageFor` (Req 2.3, 2.5): what happened, then what to
// do. UI's notice takes only UI's reasons, so Vigia has its own, in UI's look. The reason's code,
// the field, the id and the error name are never shown.

import { BODY_FONT_STACK, ROLE_VARS, SIZES } from '@alidade/ui';
import { messageFor } from '../math/messages';
import type { VigiaFailure } from '../result';
import { InlineIcon } from './cards/parts';
import { LOOK } from './look';

export interface FailureNoticeProps {
  readonly failure: VigiaFailure;
  /** How many saved sightings were left out (`storage_corrupt`, design D4). */
  readonly count?: number;
}

export function FailureNotice({ failure, count }: FailureNoticeProps) {
  const message = messageFor(failure);
  const countText =
    count !== undefined && Number.isInteger(count) && count > 0
      ? ` ${count} saved sighting${count === 1 ? ' was' : 's were'} left out.`
      : '';
  // A warning card (Req 22.6, D25.2, D25.3): what happened, bold in the tone's ink at 20 after the
  // tone's icon, then what to do in ink at 16. The text is the Message's, as before.
  return (
    <div
      role="alert"
      data-testid="failure-notice"
      data-reason={failure.reason}
      style={{
        ...LOOK.statusCard('warning'),
        fontFamily: BODY_FONT_STACK,
        overflowWrap: 'anywhere',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: SIZES.labelPx,
          fontWeight: 700,
          lineHeight: 1.25,
          color: ROLE_VARS.warnInk,
        }}
      >
        <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
        {message.whatHappened}
        {countText}
      </p>{' '}
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.35, color: ROLE_VARS.ink }}>
        {message.whatToDo}
      </p>
    </div>
  );
}
