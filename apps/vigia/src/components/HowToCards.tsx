// Before Start only (Req 22.8, 22.15; design D25.5): the how-to card of three numbered steps and the
// tip card with today's limits line. Once the Session is live they are behind "How to aim" and
// "Details", as the guidance is today.

import { BODY_FONT_STACK, Icon, LIMITS_TEXT, ROLE_VARS, SIZES } from '@alidade/ui';
import { HOW_TO_STEPS, HOW_TO_TITLE, TIP_TITLE } from '../math/texts';
import { InlineIcon } from './cards/parts';
import { LOOK, SHAPE } from './look';

export function HowToCards() {
  return (
    <div
      data-testid="how-to"
      style={{
        ...LOOK.stack,
        gap: SIZES.gapPx * 1.5,
        padding: `${SIZES.gapPx}px ${SIZES.gapPx * 2}px 0`,
      }}
    >
      <section data-part="how-to-card" style={LOOK.card}>
        <h2 style={{ ...LOOK.title, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={LOOK.iconTile}>
            <Icon name="steps" />
          </span>
          {HOW_TO_TITLE}
        </h2>
        <ol style={{ ...LOOK.stack, margin: 0, padding: 0, listStyle: 'none' }}>
          {HOW_TO_STEPS.map((step, i) => (
            <li
              key={step}
              style={{ display: 'flex', alignItems: 'center', gap: SIZES.gapPx * 1.5 }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                  width: 32,
                  height: 32,
                  borderRadius: SHAPE.badgeRadius,
                  background: ROLE_VARS.primary,
                  color: ROLE_VARS.primaryInk,
                  fontFamily: BODY_FONT_STACK,
                  fontSize: 16,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <span style={{ ...LOOK.text, fontSize: SIZES.labelPx, lineHeight: 1.25 }}>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section data-part="tip-card" style={LOOK.statusCard('info')}>
        <h2 style={{ ...LOOK.alertText, color: ROLE_VARS.infoInk }}>
          <InlineIcon name="lightbulb" colour={ROLE_VARS.infoIcon} />
          {TIP_TITLE}
        </h2>
        {/* Today's limits line (Req 16.1), on the tip card's tint. */}
        <p data-testid="limits-note" style={{ ...LOOK.text, color: ROLE_VARS.ink }}>
          {LIMITS_TEXT}
        </p>
      </section>
    </div>
  );
}
