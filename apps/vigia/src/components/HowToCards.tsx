// Before Start only (Req 22.8, 22.15; design D26.4): Mira's three numbered steps, each a yellow disc
// with its number, and the tip card with today's limits line. Once the Session is live they are
// behind "How to aim" and "Details", as the guidance is today.

import { BODY_FONT_STACK, LIMITS_TEXT, ROLE_VARS } from '@alidade/ui';
import { HOW_TO_STEPS, HOW_TO_TITLE, TIP_TITLE } from '../math/texts';
import { LOOK } from './look';

export function HowToCards() {
  return (
    <div
      data-testid="how-to"
      style={{ ...LOOK.stack, gap: 14, padding: '20px 20px 0', flex: '0 0 auto' }}
    >
      <section data-part="how-to-card" aria-label={HOW_TO_TITLE}>
        <ol style={{ ...LOOK.stack, gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
          {HOW_TO_STEPS.map((step, i) => (
            <li key={step} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: ROLE_VARS.primary,
                  color: ROLE_VARS.primaryInk,
                  fontFamily: BODY_FONT_STACK,
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <span style={{ ...LOOK.text, fontSize: 16, lineHeight: 1.3 }}>{step}</span>
            </li>
          ))}
        </ol>
      </section>
      <section
        data-part="tip-card"
        style={{ ...LOOK.card, gap: 4, padding: '14px 16px', borderRadius: 16 }}
      >
        <h2 style={{ ...LOOK.text, fontSize: 13, fontWeight: 600 }}>{TIP_TITLE}</h2>
        {/* Today's limits line (Req 16.1). */}
        <p data-testid="limits-note" style={{ ...LOOK.dim, fontSize: 13, lineHeight: 1.45 }}>
          {LIMITS_TEXT}
        </p>
      </section>
    </div>
  );
}
