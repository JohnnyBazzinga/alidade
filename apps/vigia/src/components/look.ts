// The look of Vigia's screens (design §9, D25.2, D26): roles and shapes of the theme the app applies
// (Mira, Req 22.3 as amended 2026-11-27), never a colour, so that the 7:1 contrast of every text
// holds by the skeleton's own test of each theme's palette. Styles are inline objects built here,
// so that a component test can read them (jsdom does no layout).
//
// Mira, the lead's design of 2026-11-27: Sora for prose, titles and large numerals, IBM Plex Mono in
// small capitals for captions and codes; white tiles with a light edge, cards of 24, pill controls
// (the primary yellow, the others an outline of 1.5 in ink); the sizes are the design's.
//
// The layout rule learnt on a phone (skeleton-ui Req 13.13, 13.14, 18.11): everything is in the
// page's normal flow, from 320 to 430 CSS pixels wide, with no fixed or absolute layer, no
// horizontal scroll (long codes and links break anywhere) and no text over text.

import {
  BODY_FONT_STACK,
  COLOURS,
  DISPLAY_FONT_STACK,
  NUMERIC_FONT_STACK,
  ROLE_VARS,
  SIZES,
  toneRole,
  type StatusTone,
} from '@alidade/ui';
import type { CSSProperties } from 'react';

/** The size of explanatory text (Mira: 15, and 13 to 14 for what is said in passing). */
export const BODY_TEXT_PX = 15;
/** A page's title (Mira: 28 to 34, extra bold, tight). */
export const TITLE_PX = 28;
/** A card's title (Mira: 19). */
export const CARD_TITLE_PX = 19;
/** The page's side margin (Mira: 20). */
export const PAGE_MARGIN_PX = 20;

/** The theme's shapes, as written on the root by `applyTheme` (skeleton-ui Req 22.4, 22.7, 22.16). */
export const SHAPE = {
  cardRadius: 'var(--alidade-card-radius)',
  buttonRadius: 'var(--alidade-button-radius)',
  badgeRadius: 'var(--alidade-badge-radius)',
  tileRadius: 'var(--alidade-tile-radius)',
  shadow: 'var(--alidade-shadow)',
  primaryShadow: 'var(--alidade-primary-shadow)',
  primaryFill: 'var(--alidade-primary-fill)',
  headerFill: 'var(--alidade-header-fill)',
} as const;

const text: CSSProperties = {
  margin: 0,
  fontFamily: BODY_FONT_STACK,
  fontSize: BODY_TEXT_PX,
  lineHeight: 1.45,
  color: COLOURS.ink,
  overflowWrap: 'anywhere',
};

const buttonBase: CSSProperties = {
  boxSizing: 'border-box',
  minHeight: 50,
  minWidth: SIZES.touchPx,
  padding: '0 20px',
  fontFamily: BODY_FONT_STACK,
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.2,
  borderRadius: SHAPE.buttonRadius,
  cursor: 'pointer',
  textAlign: 'center',
  overflowWrap: 'anywhere',
};

/** A control's words and icon in a row, centred (an icon always beside its words, Req 22.11). */
const withIcon: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
};

/** A status card (Mira): the tone's tint, a radius of 16, no bar. */
function statusCard(tone: StatusTone): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    background: toneRole(tone, 'Tint'),
    borderRadius: SHAPE.tileRadius,
  };
}

/** A badge: its tone's tint and ink, its icon and its word (never its colour alone, Req 22.11). */
function badge(tone: StatusTone): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    flex: '0 0 auto',
    minHeight: 28,
    padding: '0 10px',
    borderRadius: SHAPE.badgeRadius,
    background: toneRole(tone, 'Tint'),
    color: toneRole(tone, 'Ink'),
    fontFamily: BODY_FONT_STACK,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.5,
  };
}

/** A white tile with a light edge (Mira): a row that opens a view, a disclosure's summary. */
const tile: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 56,
  padding: '8px 16px',
  background: ROLE_VARS.card,
  border: `1px solid ${ROLE_VARS.rule}`,
  borderRadius: SHAPE.tileRadius,
  color: ROLE_VARS.ink,
  fontFamily: BODY_FONT_STACK,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.25,
  textAlign: 'start',
  cursor: 'pointer',
};

export const LOOK = {
  /** A column of blocks with the standard gap. */
  stack: { display: 'flex', flexDirection: 'column', gap: 12 } satisfies CSSProperties,
  /** Explanatory text. */
  text,
  /** Text of lesser weight: a time, a source. */
  dim: { ...text, fontSize: 14, lineHeight: 1.45, color: COLOURS.inkDim } satisfies CSSProperties,
  /** A sentence that must stay prominent: extra bold, in the display font. */
  statement: {
    ...text,
    fontFamily: DISPLAY_FONT_STACK,
    fontSize: 17,
    fontWeight: 700,
    lineHeight: 1.3,
  } satisfies CSSProperties,
  /** A readout: the position, a direction, the Emergency text, in the numeric font. */
  readout: {
    ...text,
    fontFamily: NUMERIC_FONT_STACK,
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  /** A numeral (Mira): the display font, extra bold, tight, tabular digits. */
  numeral: {
    ...text,
    fontFamily: DISPLAY_FONT_STACK,
    fontSize: 44,
    fontWeight: 800,
    letterSpacing: '-1.6px',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    overflowWrap: 'normal',
  } satisfies CSSProperties,
  /** Small capitals in the numeric font (Mira's captions): above a title, under a numeral. */
  caption: {
    margin: 0,
    fontFamily: NUMERIC_FONT_STACK,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '1px',
    lineHeight: 1.45,
    textTransform: 'uppercase',
    color: ROLE_VARS.inkDim,
    overflowWrap: 'anywhere',
  } satisfies CSSProperties,
  /** A page's title (Mira: 28, extra bold, tight). */
  title: {
    ...text,
    fontFamily: DISPLAY_FONT_STACK,
    fontSize: TITLE_PX,
    lineHeight: 1.1,
    fontWeight: 800,
    letterSpacing: '-0.9px',
    color: ROLE_VARS.ink,
    overflowWrap: 'normal',
  } satisfies CSSProperties,
  /** A card's title (Mira: 19, extra bold). */
  cardTitle: {
    ...text,
    fontFamily: DISPLAY_FONT_STACK,
    fontSize: CARD_TITLE_PX,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: '-0.4px',
    color: ROLE_VARS.ink,
    overflowWrap: 'normal',
  } satisfies CSSProperties,
  /** A block of the screen: a card. */
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 18,
    background: ROLE_VARS.card,
    border: `1px solid ${ROLE_VARS.rule}`,
    borderRadius: SHAPE.cardRadius,
  } satisfies CSSProperties,
  /** A card (Mira): white, a light edge, a radius of 24, no shadow. */
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 18,
    background: ROLE_VARS.card,
    border: `1px solid ${ROLE_VARS.rule}`,
    borderRadius: SHAPE.cardRadius,
  } satisfies CSSProperties,
  /** The block that must be read first: a disagreement, a warning (a warning card). */
  alertPanel: statusCard('warning'),
  /** A warning's first sentence (Mira: extra bold, 15, in the tone's ink). */
  alertText: {
    ...text,
    fontSize: 15,
    lineHeight: 1.3,
    fontWeight: 800,
    color: COLOURS.alert,
  } satisfies CSSProperties,
  /** A status card of a tone. */
  statusCard,
  /** A badge of a tone. */
  badge,
  /** A tile: a row that opens a view (Mira: white, an edge of 1, a radius of 16, 14 semibold). */
  row: tile,
  /** A tile, for a grid of two. */
  tile,
  /** An answer among equal answers: one style for each (Req 22.1 (d), 22.9), Mira's option card. */
  optionButton: {
    ...buttonBase,
    ...withIcon,
    justifyContent: 'flex-start',
    gap: 14,
    width: '100%',
    minHeight: 76,
    padding: '10px 18px',
    border: `1.5px solid ${ROLE_VARS.ruleStrong}`,
    borderRadius: SHAPE.cardRadius,
    background: ROLE_VARS.card,
    color: ROLE_VARS.ink,
    fontFamily: DISPLAY_FONT_STACK,
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '-0.4px',
    textAlign: 'start',
  } satisfies CSSProperties,
  /** An icon at the start of a row of words (Mira: bare, in the dim ink). */
  iconTile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    width: 32,
    height: 32,
    color: ROLE_VARS.inkDim,
  } satisfies CSSProperties,
  /** The icon of an option card: bare, in ink. */
  optionIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    width: 34,
    height: 34,
    color: ROLE_VARS.ink,
  } satisfies CSSProperties,
  /** The screen's one primary action (Mira: a yellow pill of 62, extra bold, lifted). */
  primaryButton: {
    ...buttonBase,
    ...withIcon,
    gap: 12,
    minHeight: 62,
    width: '100%',
    border: 'none',
    background: SHAPE.primaryFill,
    boxShadow: SHAPE.primaryShadow,
    color: ROLE_VARS.primaryInk,
    fontFamily: BODY_FONT_STACK,
    fontSize: 20,
    fontWeight: 800,
  } satisfies CSSProperties,
  /** Every other control (Mira: an outline pill of 1.5 in ink, at least 50 tall). */
  button: {
    ...buttonBase,
    ...withIcon,
    border: `1.5px solid ${ROLE_VARS.ruleStrong}`,
    background: 'transparent',
    color: COLOURS.ink,
  } satisfies CSSProperties,
  /** A control that deletes or cannot be undone: an outline pill in the danger tone. */
  dangerButton: {
    ...buttonBase,
    ...withIcon,
    border: `1.5px solid ${ROLE_VARS.dangerIcon}`,
    background: 'transparent',
    color: ROLE_VARS.dangerInk,
  } satisfies CSSProperties,
  /** A dark pill (Mira's Close). */
  darkButton: {
    ...buttonBase,
    ...withIcon,
    minHeight: 58,
    padding: '0 26px',
    border: 'none',
    background: ROLE_VARS.ink,
    color: ROLE_VARS.card,
    fontSize: 16,
    fontWeight: 800,
  } satisfies CSSProperties,
  /** A round control with an icon only, named by `aria-label` (Mira's Back, 44 or 62). */
  roundButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    boxSizing: 'border-box',
    width: 44,
    height: 44,
    minHeight: 44,
    padding: 0,
    borderRadius: '50%',
    border: `1.5px solid ${ROLE_VARS.ruleStrong}`,
    background: 'transparent',
    color: ROLE_VARS.ink,
    cursor: 'pointer',
  } satisfies CSSProperties,
  /** A row of controls that wraps instead of scrolling sideways. */
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  } satisfies CSSProperties,
  /** Two tiles side by side. */
  pair: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
  } satisfies CSSProperties,
} as const;
