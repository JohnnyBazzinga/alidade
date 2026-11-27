// The aiming row (Req 3.7, 16.2, 22.8; design D26.4): Mira's row at the top of the Sight screen,
// the one line in view, "Aim at the base of the smoke", and "How to aim" as a white pill whose
// chevron says whether the guidance is open. It is one disclosure: the guidance of Req 16.2 is
// inside it, one tap away from Start on. Before Start the screen's title and the how-to card stand
// in its place (`BeforeYouSight`, `HowToCards`).

import { BODY_FONT_STACK, Icon, ROLE_VARS } from '@alidade/ui';
import { useState } from 'react';
import { AIM_LINE_TEXT, sightingGuidance } from '../math/texts';
import { LOOK } from './look';

export interface GuidanceBlockProps {
  /** A wind reading is shown: the smoke leans downwind (Req 13.5). */
  readonly windShown: boolean;
}

export function GuidanceBlock({ windShown }: GuidanceBlockProps) {
  const [open, setOpen] = useState(false);
  return (
    <section
      data-testid="guidance"
      style={{ flex: '0 0 auto', padding: '16px 20px 0', background: ROLE_VARS.bg }}
    >
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary
          style={{
            minHeight: 44,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
            listStyle: 'none',
            fontFamily: BODY_FONT_STACK,
            color: ROLE_VARS.ink,
            cursor: 'pointer',
          }}
        >
          <span data-part="aim-line" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>
            {AIM_LINE_TEXT}
          </span>
          <span
            data-part="how-to-aim"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              flex: '0 0 auto',
              boxSizing: 'border-box',
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 22,
              border: `1px solid ${ROLE_VARS.rule}`,
              background: ROLE_VARS.card,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            How to aim
            <Icon
              name="chevron-down"
              style={{
                width: 14,
                height: 14,
                color: ROLE_VARS.inkDim,
                transform: open ? 'rotate(180deg)' : 'none',
              }}
            />
          </span>
        </summary>
        <ul
          style={{
            ...LOOK.card,
            gap: 8,
            margin: '10px 0 0',
            padding: '14px 16px 14px 32px',
            borderRadius: 16,
          }}
        >
          {sightingGuidance(windShown).map((sentence) => (
            <li key={sentence} style={{ ...LOOK.text, fontSize: 14 }}>
              {sentence}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The Sight screen's title before Start (Mira): "Before you sight" in small capitals, then the aim. */
export function BeforeYouSight() {
  return (
    <div
      data-testid="before-you-sight"
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '28px 20px 0',
      }}
    >
      <p style={LOOK.caption}>Before you sight</p>
      <h1 style={{ ...LOOK.title, fontSize: 30, lineHeight: 1.08, letterSpacing: '-1px' }}>
        {AIM_LINE_TEXT}
      </h1>
    </div>
  );
}
