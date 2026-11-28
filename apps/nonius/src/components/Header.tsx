// Mira's header (Nonius Req 16.3; the author's design of 2026-11-28): the mark, a yellow disc with
// an ink dot, the word "Nonius", and on the right, in small capitals, the tab and the count of
// sights. It is shown above the three tabs only; the Sight, Index error and How it works screens
// have their own titles and controls.
import { DISPLAY_FONT_STACK, NUMERIC_FONT_STACK, ROLE_VARS } from '@alidade/ui';

/** The header's numbers (Mira: a row of 44 under a margin of 16, the mark 28, the word 22). */
export const HEADER = { rowPx: 44, topPx: 16, markPx: 28, wordPx: 22 } as const;

/**
 * The caption on the right: "FIX · 0 SIGHTS", the tab's name and the count of sights; on the Sights
 * tab, whose name is already the noun, "SIGHTS · 0 TAKEN".
 */
export function headerCaption(tabLabel: string, sightCount: number): string {
  const n = Number.isSafeInteger(sightCount) && sightCount >= 0 ? sightCount : 0;
  const noun = tabLabel === 'Sights' ? 'taken' : n === 1 ? 'sight' : 'sights';
  return `${tabLabel} · ${n} ${noun}`;
}

export interface HeaderProps {
  /** The caption on the right (see `headerCaption`). */
  readonly caption: string;
}

export function Header({ caption }: HeaderProps) {
  return (
    <header
      data-testid="app-header"
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
        <span
          data-part="app-mark"
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            width: HEADER.markPx,
            height: HEADER.markPx,
            borderRadius: '50%',
            background: ROLE_VARS.primary,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: ROLE_VARS.ink }} />
        </span>
        <span
          style={{
            fontFamily: DISPLAY_FONT_STACK,
            fontWeight: 800,
            fontSize: HEADER.wordPx,
            letterSpacing: '-0.6px',
            lineHeight: 1.1,
          }}
        >
          Nonius
        </span>
      </span>
      <span
        data-testid="header-caption"
        style={{
          fontFamily: NUMERIC_FONT_STACK,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: ROLE_VARS.inkDim,
          textAlign: 'end',
        }}
      >
        {caption}
      </span>
    </header>
  );
}
