// The limits line (Req 13.5, product principle 2): said plainly, beside every result.

import { COLOURS, BODY_FONT_STACK, SIZES } from './theme';

export const LIMITS_TEXT =
  'Phone compasses are off by several degrees. Setting north on the Sun or a landmark reduces the error.';

export function LimitsNote() {
  return (
    <p
      data-testid="limits-note"
      style={{
        margin: 0,
        padding: SIZES.gapPx,
        fontFamily: BODY_FONT_STACK,
        fontSize: SIZES.labelPx,
        // Set, so that a test can count the note's height (Req 13.15's budget).
        lineHeight: 1.25,
        color: COLOURS.inkDim,
        background: COLOURS.panel,
      }}
    >
      {LIMITS_TEXT}
    </p>
  );
}
