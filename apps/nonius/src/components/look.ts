// The look of Nonius's screens (design §9): Mira, the author's design of 2026-11-28 for Nonius's
// Fix screen (skeleton-ui Req 22.16; Nonius Req 16), drawn with UI's roles, sizes and fonts and
// nothing else, so that the 7:1 contrast of every text holds by the skeleton's own test of its
// palette. Styles are inline objects built here, so that a component test can read them (jsdom
// does no layout).
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
} from '@alidade/ui';
import type { CSSProperties } from 'react';

/** The size of explanatory text (Mira: 15, and 13 to 14 for what is said in passing). */
export const BODY_TEXT_PX = 15;

/** A page's title (Mira: 28, extra bold, tight). */
export const TITLE_PX = 28;

/** The page's side margin (Mira: 20). */
export const PAGE_MARGIN_PX = 20;

/** The theme's shapes, as written on the root by `applyTheme` (skeleton-ui Req 22.4, 22.16). */
export const SHAPE = {
  cardRadius: 'var(--alidade-card-radius)',
  buttonRadius: 'var(--alidade-button-radius)',
  badgeRadius: 'var(--alidade-badge-radius)',
  tileRadius: 'var(--alidade-tile-radius)',
  primaryShadow: 'var(--alidade-primary-shadow)',
  primaryFill: 'var(--alidade-primary-fill)',
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
  fontWeight: 700,
  lineHeight: 1.2,
  borderRadius: SHAPE.buttonRadius,
  cursor: 'pointer',
  textAlign: 'center',
  overflowWrap: 'anywhere',
};

/** A control's words and icon in a row, centred. */
const withIcon: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

/** A white tile with a light edge (Mira): a row that opens a view. */
const tile: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 54,
  padding: '0 16px',
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

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 16,
  background: ROLE_VARS.card,
  border: `1px solid ${ROLE_VARS.rule}`,
  borderRadius: 20,
};

export const LOOK = {
  /** A column of blocks with the standard gap. */
  stack: { display: 'flex', flexDirection: 'column', gap: 12 } satisfies CSSProperties,
  /** Explanatory text. */
  text,
  /** Text of lesser weight: a time, a source, the second sentence of a card. */
  dim: { ...text, fontSize: 14, color: COLOURS.inkDim } satisfies CSSProperties,
  /** A readout: the position, an altitude, the Calibration in use, in the numeric font. */
  readout: {
    ...text,
    fontFamily: NUMERIC_FONT_STACK,
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  /** Small capitals in the numeric font (Mira's captions). */
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
  /** A screen's title (Mira: 28, extra bold, tight). */
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
  /** A card's or a section's heading (Mira: 19, extra bold). */
  heading: {
    ...text,
    fontFamily: DISPLAY_FONT_STACK,
    fontSize: 19,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: '-0.4px',
    color: ROLE_VARS.ink,
    overflowWrap: 'normal',
  } satisfies CSSProperties,
  /** A card's first sentence (Mira: 15, extra bold, in ink). */
  cardTitle: {
    ...text,
    fontFamily: DISPLAY_FONT_STACK,
    fontSize: 15,
    lineHeight: 1.3,
    fontWeight: 800,
    color: ROLE_VARS.ink,
  } satisfies CSSProperties,
  /** A block of the screen: a white card with a light edge. */
  panel: card,
  /** A card. */
  card,
  /** The block that must be read first: a warning (Mira: the warning tint, a radius of 20). */
  alertPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '14px 16px',
    background: ROLE_VARS.warnTint,
    borderRadius: 20,
  } satisfies CSSProperties,
  /** A warning's words (Mira: in the warning's ink). */
  alertText: {
    ...text,
    fontSize: 14,
    color: COLOURS.alert,
  } satisfies CSSProperties,
  /** A tile: a row that opens a view. */
  tile,
  /** The screen's one primary action (Mira: a yellow pill of 62, extra bold, lifted). */
  primaryButton: {
    ...buttonBase,
    ...withIcon,
    minHeight: 62,
    width: '100%',
    border: 'none',
    background: SHAPE.primaryFill,
    boxShadow: SHAPE.primaryShadow,
    color: ROLE_VARS.primaryInk,
    fontSize: 20,
    fontWeight: 800,
  } satisfies CSSProperties,
  /** Every other control (Mira: an outline pill of 1.5 in ink, at least 46 tall). */
  button: {
    ...buttonBase,
    ...withIcon,
    minHeight: 46,
    border: `1.5px solid ${ROLE_VARS.ruleStrong}`,
    background: 'transparent',
    color: COLOURS.ink,
    fontWeight: 800,
  } satisfies CSSProperties,
  /** A control that deletes or cannot be undone: an outline pill in the danger tone. */
  dangerButton: {
    ...buttonBase,
    ...withIcon,
    minHeight: 46,
    border: `1.5px solid ${ROLE_VARS.dangerIcon}`,
    background: 'transparent',
    color: ROLE_VARS.dangerInk,
  } satisfies CSSProperties,
  /** A row of controls that wraps instead of scrolling sideways. */
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  } satisfies CSSProperties,
} as const;
