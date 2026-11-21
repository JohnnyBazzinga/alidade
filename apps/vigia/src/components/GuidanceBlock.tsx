// How to sight smoke (Req 3.7, 16.2, as amended 2026-11-21): one visible line, "Aim at the base of
// the smoke", and a closed disclosure, "How to aim", that holds all the guidance. The line and the
// disclosure are one row (the summary), at least 48 px tall, the same before and after a capture.

import { BODY_FONT_STACK, COLOURS, SIZES } from '@alidade/ui';
import { AIM_LINE_TEXT, sightingGuidance } from '../math/texts';
import { BODY_TEXT_PX, LOOK } from './look';

export interface GuidanceBlockProps {
  /** A wind reading is shown: the smoke leans downwind (Req 13.5). */
  readonly windShown: boolean;
}

export function GuidanceBlock({ windShown }: GuidanceBlockProps) {
  return (
    <section
      data-testid="guidance"
      style={{ padding: `0 ${SIZES.gapPx}px ${SIZES.gapPx}px`, background: COLOURS.bg }}
    >
      <details style={{ border: `1px solid ${COLOURS.rule}`, background: COLOURS.panel }}>
        <summary
          style={{
            minHeight: SIZES.touchPx,
            boxSizing: 'border-box',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            columnGap: SIZES.gapPx,
            padding: `0 ${SIZES.gapPx}px`,
            fontFamily: BODY_FONT_STACK,
            fontSize: BODY_TEXT_PX,
            lineHeight: 1.25,
            color: COLOURS.ink,
            cursor: 'pointer',
          }}
        >
          <span>{AIM_LINE_TEXT}</span>
          <span style={{ color: COLOURS.brass, textDecoration: 'underline' }}>How to aim</span>
        </summary>
        <ul style={{ ...LOOK.stack, margin: 0, padding: `${SIZES.gapPx}px 20px` }}>
          {sightingGuidance(windShown).map((sentence) => (
            <li key={sentence} style={LOOK.text}>
              {sentence}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
