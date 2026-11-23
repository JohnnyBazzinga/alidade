// The header (Req 22.2, design D25.4): a row of the page, never a layer, in the theme's header
// colour (or its gradient), with the app mark and the landscape. The full header (the Smoke tab):
// the mark, "Vigia" and the tagline, at most 112 high. The compact header (the other tabs and the
// views opened from them): the mark and a title, at most 64. Its text sits on the solid colour,
// above the landscape, never on it; the landscape's last ridge is the page's colour.

import { BODY_FONT_STACK, ROLE_VARS } from '@alidade/ui';
import { TAGLINE_TEXT } from '../../math/texts';
import { SHAPE } from '../look';
import { AppMark } from './AppMark';
import { Landscape } from './Landscape';

/** The heights of D25.4, which the header test counts from these styles. */
export const HEADER = {
  full: {
    padTopPx: 10,
    markPx: 32,
    titlePx: 24,
    taglinePx: 16,
    taglineGapPx: 2,
    landscapeGapPx: 6,
  },
  compact: { padTopPx: 8, markPx: 28, titlePx: 22, landscapeGapPx: 6 },
  maxPx: { full: 112, compact: 64 },
} as const;

export type HeaderProps =
  { readonly variant: 'full' } | { readonly variant: 'compact'; readonly title: string };

export function Header(props: HeaderProps) {
  const full = props.variant === 'full';
  const h = full ? HEADER.full : HEADER.compact;
  return (
    <header
      data-testid="app-header"
      data-variant={props.variant}
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        padding: `${h.padTopPx}px 16px 0`,
        background: SHAPE.headerFill,
        color: ROLE_VARS.headerInk,
        fontFamily: BODY_FONT_STACK,
      }}
    >
      <div
        data-part="header-row"
        style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: h.markPx }}
      >
        <AppMark sizePx={h.markPx} />
        {full ? (
          <h1
            style={{
              margin: 0,
              fontSize: HEADER.full.titlePx,
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: '0.01em',
              color: ROLE_VARS.headerInk,
            }}
          >
            Vigia
          </h1>
        ) : (
          <h1
            style={{
              margin: 0,
              fontSize: HEADER.compact.titlePx,
              fontWeight: 700,
              lineHeight: 1.25,
              color: ROLE_VARS.headerInk,
              overflowWrap: 'anywhere',
            }}
          >
            {props.title}
          </h1>
        )}
      </div>
      {full && (
        <p
          data-part="tagline"
          style={{
            margin: `${HEADER.full.taglineGapPx}px 0 0`,
            fontSize: HEADER.full.taglinePx,
            lineHeight: 1.25,
            color: ROLE_VARS.headerDim,
          }}
        >
          {TAGLINE_TEXT}
        </p>
      )}
      <div style={{ marginTop: h.landscapeGapPx }}>
        <Landscape variant={props.variant} />
      </div>
    </header>
  );
}
