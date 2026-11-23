// The aiming row (Req 3.7, 16.2, 22.8; design D25.5): the crosshair, the one line in view, "Aim at
// the base of the smoke", and "How to aim" as a pill of `accent` on `infoTint` whose chevron says
// whether the guidance is open. It is one disclosure: the guidance of Req 16.2 is inside it, one tap
// away in every state of the Sight screen. The row takes at most 71 CSS pixels at 375 (the slack of
// skeleton-ui D37.11), counted by `sight-first-screen.test.tsx`.

import { BODY_FONT_STACK, Icon, ROLE_VARS, SIZES } from '@alidade/ui';
import { useState } from 'react';
import { AIM_LINE_TEXT, sightingGuidance } from '../math/texts';
import { BODY_TEXT_PX, LOOK, SHAPE } from './look';

export interface GuidanceBlockProps {
  /** A wind reading is shown: the smoke leans downwind (Req 13.5). */
  readonly windShown: boolean;
}

export function GuidanceBlock({ windShown }: GuidanceBlockProps) {
  const [open, setOpen] = useState(false);
  return (
    <section
      data-testid="guidance"
      style={{ padding: `0 ${SIZES.gapPx}px ${SIZES.gapPx}px`, background: ROLE_VARS.bg }}
    >
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary
          style={{
            minHeight: SIZES.touchPx,
            boxSizing: 'border-box',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            columnGap: SIZES.gapPx,
            rowGap: 4,
            padding: `2px ${SIZES.gapPx}px`,
            listStyle: 'none',
            fontFamily: BODY_FONT_STACK,
            fontSize: BODY_TEXT_PX,
            lineHeight: 1.25,
            color: ROLE_VARS.ink,
            cursor: 'pointer',
          }}
        >
          <span
            data-part="aim-line"
            style={{ display: 'inline-flex', alignItems: 'center', gap: SIZES.gapPx }}
          >
            <Icon name="crosshair" style={{ color: ROLE_VARS.accent }} />
            <span>{AIM_LINE_TEXT}</span>
          </span>
          <span
            data-part="how-to-aim"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginLeft: 'auto',
              padding: '2px 4px 2px 12px',
              borderRadius: SHAPE.badgeRadius,
              background: ROLE_VARS.infoTint,
              color: ROLE_VARS.accent,
              fontWeight: 700,
            }}
          >
            How to aim
            <Icon name={open ? 'chevron-up' : 'chevron-down'} />
          </span>
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
