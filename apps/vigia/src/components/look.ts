// The look of Vigia's screens (design §9, D25.2, D25.8): roles and shapes of the theme the app
// applies (Field, Req 22.3 as amended 2026-11-23), never a colour, so that the 7:1 contrast of
// every text holds by the skeleton's own test of each theme's palette. Styles are inline objects
// built here, so that a component test can read them (jsdom does no layout).
//
// The layout rule learnt on a phone (skeleton-ui Req 13.13, 13.14, 18.11): everything is in the
// page's normal flow, from 320 to 430 CSS pixels wide, with no fixed or absolute layer, no
// horizontal scroll (long codes and links break anywhere) and no text over text.

import {
  BODY_FONT_STACK,
  COLOURS,
  NUMERIC_FONT_STACK,
  ROLE_VARS,
  SIZES,
  toneRole,
  type StatusTone,
} from '@alidade/ui';
import type { CSSProperties } from 'react';

/** The size of explanatory text: design §9, "at least 16 px for the rest". */
export const BODY_TEXT_PX = 16;
/** A title (D25.2: 22 to 24, bold, in the body stack). */
export const TITLE_PX = 22;

/** The theme's shapes, as written on the root by `applyTheme` (skeleton-ui Req 22.4, 22.7). */
export const SHAPE = {
  cardRadius: 'var(--alidade-card-radius)',
  buttonRadius: 'var(--alidade-button-radius)',
  badgeRadius: 'var(--alidade-badge-radius)',
  shadow: 'var(--alidade-shadow)',
  primaryFill: 'var(--alidade-primary-fill)',
  headerFill: 'var(--alidade-header-fill)',
} as const;

const text: CSSProperties = {
  margin: 0,
  fontFamily: BODY_FONT_STACK,
  fontSize: BODY_TEXT_PX,
  lineHeight: 1.4,
  color: COLOURS.ink,
  overflowWrap: 'anywhere',
};

const buttonBase: CSSProperties = {
  minHeight: SIZES.touchPx,
  minWidth: SIZES.touchPx,
  padding: `0 ${SIZES.gapPx * 2}px`,
  fontFamily: BODY_FONT_STACK,
  fontSize: SIZES.labelPx,
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
  gap: SIZES.gapPx,
};

/** A status card: the tone's tint and a bar of 4 in its bright colour (D25.2, skeleton-ui 22.13). */
function statusCard(tone: StatusTone): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    background: toneRole(tone, 'Tint'),
    borderLeft: `4px solid ${toneRole(tone, 'Bar')}`,
    borderRadius: SHAPE.buttonRadius,
  };
}

/** A badge: its tone's tint and ink, its icon and its word (never its colour alone, Req 22.11). */
function badge(tone: StatusTone): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    padding: '4px 12px',
    borderRadius: SHAPE.badgeRadius,
    background: toneRole(tone, 'Tint'),
    color: toneRole(tone, 'Ink'),
    fontFamily: BODY_FONT_STACK,
    fontSize: BODY_TEXT_PX,
    fontWeight: 700,
    lineHeight: 1.5,
  };
}

export const LOOK = {
  /** A column of blocks with the standard gap. */
  stack: { display: 'flex', flexDirection: 'column', gap: SIZES.gapPx } satisfies CSSProperties,
  /** Explanatory text. */
  text,
  /** Text of lesser weight: a time, a source. */
  dim: { ...text, color: COLOURS.inkDim } satisfies CSSProperties,
  /** A sentence that must stay as prominent as a readout: the body stack at the readout's size (D24). */
  statement: { ...text, fontSize: SIZES.labelPx, lineHeight: 1.35 } satisfies CSSProperties,
  /** A readout: the position, a direction, the Emergency text (UI's readout size). */
  readout: {
    ...text,
    fontFamily: NUMERIC_FONT_STACK,
    fontSize: SIZES.labelPx,
    lineHeight: 1.35,
  } satisfies CSSProperties,
  /** A numeral (skeleton-ui Req 13.4: 32, in the numeric stack, tabular digits). */
  numeral: {
    ...text,
    fontFamily: NUMERIC_FONT_STACK,
    fontSize: SIZES.numeralPx,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.2,
    overflowWrap: 'normal',
  } satisfies CSSProperties,
  /** A screen's title (D25.2). */
  title: {
    ...text,
    fontSize: TITLE_PX,
    lineHeight: 1.25,
    fontWeight: 700,
    color: ROLE_VARS.ink,
  } satisfies CSSProperties,
  /** A block of the screen: a card. */
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: SIZES.gapPx * 1.5,
    padding: 16,
    background: ROLE_VARS.card,
    border: `1px solid ${ROLE_VARS.rule}`,
    borderRadius: SHAPE.cardRadius,
    boxShadow: SHAPE.shadow,
  } satisfies CSSProperties,
  /** A card (D25.2): the card colour, its radius, its edge and the theme's shadow. */
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: SIZES.gapPx * 1.5,
    padding: 16,
    background: ROLE_VARS.card,
    border: `1px solid ${ROLE_VARS.rule}`,
    borderRadius: SHAPE.cardRadius,
    boxShadow: SHAPE.shadow,
  } satisfies CSSProperties,
  /** The block that must be read first: a disagreement, a warning (a warning card). */
  alertPanel: statusCard('warning'),
  /** A warning's first sentence (D25.2: the tone's ink, bold, at 20). */
  alertText: {
    ...text,
    fontSize: SIZES.labelPx,
    lineHeight: 1.25,
    fontWeight: 700,
    color: COLOURS.alert,
  } satisfies CSSProperties,
  /** A status card of a tone. */
  statusCard,
  /** A badge of a tone. */
  badge,
  /** A row: a control the width of the screen, raised, at least 48 high (D25.2). */
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: SIZES.gapPx * 1.5,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: SIZES.touchPx,
    padding: '8px 16px',
    background: ROLE_VARS.raised,
    border: `1px solid ${ROLE_VARS.rule}`,
    borderRadius: SHAPE.buttonRadius,
    color: ROLE_VARS.ink,
    fontFamily: BODY_FONT_STACK,
    fontSize: SIZES.labelPx,
    lineHeight: 1.25,
    textAlign: 'start',
    cursor: 'pointer',
  } satisfies CSSProperties,
  /** An answer among equal answers: at least 64, one style for each (Req 22.1 (d), 22.9). */
  optionButton: {
    ...buttonBase,
    ...withIcon,
    justifyContent: 'flex-start',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: SIZES.primaryPx,
    padding: '8px 16px',
    // A soft tint and a light edge (Codex's comparison with the references, 2026-11-23); the
    // words and the icon say what it is.
    border: `1px solid ${ROLE_VARS.rule}`,
    background: ROLE_VARS.infoTint,
    boxShadow: SHAPE.shadow,
    color: ROLE_VARS.ink,
    fontWeight: 700,
    textAlign: 'start',
  } satisfies CSSProperties,
  /** A round tint behind an icon, at the start of a row of words. */
  iconTile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    width: 40,
    height: 40,
    borderRadius: SHAPE.badgeRadius,
    background: ROLE_VARS.infoTint,
    color: ROLE_VARS.infoIcon,
  } satisfies CSSProperties,
  /** The icon tile of an option button: the card colour on the button's tint. */
  optionIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    width: 40,
    height: 40,
    borderRadius: SHAPE.badgeRadius,
    background: ROLE_VARS.card,
    color: ROLE_VARS.infoIcon,
  } satisfies CSSProperties,
  /** The screen's one primary action (design §9: at least 64 px tall). */
  primaryButton: {
    ...buttonBase,
    ...withIcon,
    minHeight: SIZES.primaryPx,
    width: '100%',
    border: `1px solid ${ROLE_VARS.primary}`,
    background: SHAPE.primaryFill,
    boxShadow: SHAPE.shadow,
    color: ROLE_VARS.primaryInk,
    fontWeight: 700,
  } satisfies CSSProperties,
  /** Every other control (at least 48 × 48 px). */
  button: {
    ...buttonBase,
    ...withIcon,
    border: `1px solid ${ROLE_VARS.ruleStrong}`,
    background: ROLE_VARS.raised,
    color: COLOURS.ink,
  } satisfies CSSProperties,
  /** A control that deletes or cannot be undone: the danger tone's fill and ink. */
  dangerButton: {
    ...buttonBase,
    ...withIcon,
    border: `1px solid ${ROLE_VARS.dangerIcon}`,
    background: ROLE_VARS.dangerTint,
    color: ROLE_VARS.dangerInk,
  } satisfies CSSProperties,
  /** A row of controls that wraps instead of scrolling sideways. */
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: SIZES.gapPx,
  } satisfies CSSProperties,
} as const;
