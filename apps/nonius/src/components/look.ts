// The look of Nonius's screens (design §9): UI's palette, sizes and font, and nothing else, so that
// the 7:1 contrast of every text holds by the skeleton's own test of its palette. Styles are
// inline objects built here, so that a component test can read them (jsdom does no layout).
//
// The layout rule learnt on a phone (skeleton-ui Req 13.13, 13.14, 18.11): everything is in the
// page's normal flow, from 320 to 430 CSS pixels wide, with no fixed or absolute layer, no
// horizontal scroll (long codes and links break anywhere) and no text over text.

import { COLOURS, FONT_STACK, SIZES } from '@alidade/ui';
import type { CSSProperties } from 'react';

/** The size of explanatory text: design §9, "at least 16 px for the rest". */
export const BODY_TEXT_PX = 16;

const text: CSSProperties = {
  margin: 0,
  fontFamily: FONT_STACK,
  fontSize: BODY_TEXT_PX,
  lineHeight: 1.4,
  color: COLOURS.ink,
  overflowWrap: 'anywhere',
};

const buttonBase: CSSProperties = {
  minHeight: SIZES.touchPx,
  minWidth: SIZES.touchPx,
  padding: `0 ${SIZES.gapPx * 2}px`,
  fontFamily: FONT_STACK,
  fontSize: SIZES.labelPx,
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'center',
  overflowWrap: 'anywhere',
};

export const LOOK = {
  /** A column of blocks with the standard gap. */
  stack: { display: 'flex', flexDirection: 'column', gap: SIZES.gapPx } satisfies CSSProperties,
  /** Explanatory text. */
  text,
  /** Text of lesser weight: a time, a source. */
  dim: { ...text, color: COLOURS.inkDim } satisfies CSSProperties,
  /** A readout: the position, a direction, the Emergency text (UI's readout size). */
  readout: { ...text, fontSize: SIZES.labelPx, lineHeight: 1.35 } satisfies CSSProperties,
  /** A screen's title. */
  title: {
    ...text,
    fontSize: SIZES.labelPx,
    fontWeight: 700,
    color: COLOURS.brass,
  } satisfies CSSProperties,
  /** A block of the screen. */
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: SIZES.gapPx,
    padding: SIZES.gapPx * 1.5,
    background: COLOURS.panel,
    border: `1px solid ${COLOURS.rule}`,
  } satisfies CSSProperties,
  /** The block that must be read first: a disagreement, a warning. */
  alertPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: SIZES.gapPx,
    padding: SIZES.gapPx * 1.5,
    background: COLOURS.panel,
    border: `2px solid ${COLOURS.alert}`,
  } satisfies CSSProperties,
  alertText: { ...text, fontSize: SIZES.labelPx, color: COLOURS.alert } satisfies CSSProperties,
  /** The screen's one primary action (design §9: at least 64 px tall). */
  primaryButton: {
    ...buttonBase,
    minHeight: SIZES.primaryPx,
    width: '100%',
    border: `1px solid ${COLOURS.brass}`,
    background: COLOURS.brass,
    color: COLOURS.brassInk,
    fontWeight: 700,
  } satisfies CSSProperties,
  /** Every other control (at least 48 × 48 px). */
  button: {
    ...buttonBase,
    border: `1px solid ${COLOURS.rule}`,
    background: COLOURS.raised,
    color: COLOURS.ink,
  } satisfies CSSProperties,
  /** A control that deletes or cannot be undone. */
  dangerButton: {
    ...buttonBase,
    border: `1px solid ${COLOURS.alert}`,
    background: COLOURS.raised,
    color: COLOURS.alert,
  } satisfies CSSProperties,
  /** A row of controls that wraps instead of scrolling sideways. */
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: SIZES.gapPx,
  } satisfies CSSProperties,
} as const;
