// The header of the four tabs (Req 22.2 as amended 2026-11-27, design D26.2): Mira's row of the
// app's mark (a yellow disc with a dark centre), the word "Vigia", and at its end an outline pill,
// "Fire? Emergency", that opens the Emergency tab. The pill dials nothing and names no number
// (Req 14.5): the number differs by country, and the Emergency tab says what to tell it. The
// header is a row of the page, never a layer over its content (skeleton-ui Requirement 13.13); the
// Sight screen and the views opened from a tab (Share, the QR, the Inbox, the privacy page, the
// question after a capture) have none and say what they are in their own title.

import { BODY_FONT_STACK, DISPLAY_FONT_STACK, Icon, ROLE_VARS } from '@alidade/ui';

/** The header's numbers (Mira: a row of 44 under a margin of 16, the mark 28, the word 22). */
export const HEADER = {
  rowPx: 44,
  topPx: 16,
  markPx: 28,
  wordPx: 22,
} as const;

/** The words of the pill. */
export const FIRE_PILL_TEXT = 'Fire? Emergency';

export function AppMark({ sizePx = HEADER.markPx }: { readonly sizePx?: number }) {
  return (
    <span
      data-part="app-mark"
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        width: sizePx,
        height: sizePx,
        borderRadius: '50%',
        background: ROLE_VARS.primary,
      }}
    >
      <span
        style={{
          width: sizePx * (8 / 28),
          height: sizePx * (8 / 28),
          borderRadius: '50%',
          background: ROLE_VARS.ink,
        }}
      />
    </span>
  );
}

export interface HeaderProps {
  /** Opens the Emergency tab. */
  readonly onEmergency: () => void;
}

export function Header({ onEmergency }: HeaderProps) {
  return (
    <header
      data-testid="app-header"
      data-variant="brand"
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        boxSizing: 'content-box',
        minHeight: HEADER.rowPx,
        padding: `${HEADER.topPx}px 20px 0`,
        background: ROLE_VARS.bg,
        color: ROLE_VARS.ink,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <AppMark />
        <span
          style={{
            fontFamily: DISPLAY_FONT_STACK,
            fontWeight: 800,
            fontSize: HEADER.wordPx,
            letterSpacing: '-0.6px',
            lineHeight: 1.1,
          }}
        >
          Vigia
        </span>
      </span>
      <button
        type="button"
        data-part="fire-pill"
        onClick={onEmergency}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          flex: '0 0 auto',
          boxSizing: 'border-box',
          minHeight: 44,
          padding: '0 16px',
          borderRadius: 22,
          border: `1.5px solid ${ROLE_VARS.ruleStrong}`,
          background: 'transparent',
          color: ROLE_VARS.ink,
          fontFamily: BODY_FONT_STACK,
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        <Icon name="call" style={{ width: 16, height: 16 }} />
        {FIRE_PILL_TEXT}
      </button>
    </header>
  );
}
