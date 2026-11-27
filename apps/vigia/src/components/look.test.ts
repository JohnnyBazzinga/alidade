// The font stacks and the sizes of Vigia (design D24, D26; skeleton-ui D36, Req 22.16): prose and
// the labels of controls in the body font, titles and large numerals in the display font, readings
// and captions in the numeric one, at Mira's sizes (the lead's design of 2026-11-27).

import {
  BODY_FONT_STACK,
  COLOURS,
  DISPLAY_FONT_STACK,
  NUMERIC_FONT_STACK,
  SIZES,
} from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { BODY_TEXT_PX, CARD_TITLE_PX, LOOK, TITLE_PX } from './look';

describe('LOOK (design D24, D26)', () => {
  it('sets text and every control in the body font', () => {
    for (const style of [
      LOOK.text,
      LOOK.dim,
      LOOK.alertText,
      LOOK.button,
      LOOK.primaryButton,
      LOOK.dangerButton,
      LOOK.row,
    ]) {
      expect(style.fontFamily).toBe(BODY_FONT_STACK);
    }
  });

  it('sets titles and large numerals in the display font, extra bold', () => {
    for (const style of [LOOK.title, LOOK.cardTitle, LOOK.numeral]) {
      expect(style.fontFamily).toBe(DISPLAY_FONT_STACK);
      expect(style.fontWeight).toBe(800);
    }
    expect(LOOK.numeral.fontVariantNumeric).toBe('tabular-nums');
  });

  it('sets a readout (a position, a code) and a caption in the numeric font', () => {
    expect(LOOK.readout.fontFamily).toBe(NUMERIC_FONT_STACK);
    expect(LOOK.caption.fontFamily).toBe(NUMERIC_FONT_STACK);
    expect(LOOK.caption.textTransform).toBe('uppercase');
  });

  it('has Mira’s sizes: 15 text, 28 titles, 19 card titles, controls of 50 and the primary of 62', () => {
    expect(BODY_TEXT_PX).toBe(15);
    expect(TITLE_PX).toBe(28);
    expect(CARD_TITLE_PX).toBe(19);
    expect(LOOK.text.fontSize).toBe(15);
    expect(LOOK.button.minHeight).toBe(50);
    expect(LOOK.primaryButton.minHeight).toBe(62);
    expect(LOOK.primaryButton.fontSize).toBe(20);
    // Every control stays at least the touch target of Req 13.7.
    for (const style of [LOOK.button, LOOK.primaryButton, LOOK.dangerButton, LOOK.row]) {
      expect(Number(style.minHeight)).toBeGreaterThanOrEqual(SIZES.touchPx);
    }
    expect(LOOK.text.color).toBe(COLOURS.ink);
    expect(LOOK.alertText.color).toBe(COLOURS.alert);
  });
});

// LOOK is made of roles and shapes, never a colour (Req 22.4, D25.2), as Mira draws them (D26).
describe('LOOK, from roles (Req 22.4, D26)', () => {
  const values = (o: object): string[] =>
    Object.values(o).flatMap((v) =>
      typeof v === 'string' ? [v] : typeof v === 'object' && v !== null ? values(v) : [],
    );

  it('holds no colour literal, only roles and shapes', () => {
    const all = [
      ...values(LOOK),
      ...(['warning', 'danger', 'success', 'info'] as const).flatMap((t) => [
        ...values(LOOK.statusCard(t)),
        ...values(LOOK.badge(t)),
      ]),
    ];
    for (const v of all) expect(v, v).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });

  it('a card: white, the card radius, a light edge, padding 18, no shadow', () => {
    expect(LOOK.card.background).toBe('var(--alidade-card)');
    expect(LOOK.card.borderRadius).toBe('var(--alidade-card-radius)');
    expect(LOOK.card.border).toBe('1px solid var(--alidade-rule)');
    expect(LOOK.card.padding).toBe(18);
    expect('boxShadow' in LOOK.card).toBe(false);
  });

  it('a tile (a row that opens a view): white, the tile radius, a light edge, 14 semibold', () => {
    expect(LOOK.row.background).toBe('var(--alidade-card)');
    expect(LOOK.row.borderRadius).toBe('var(--alidade-tile-radius)');
    expect(LOOK.row.border).toBe('1px solid var(--alidade-rule)');
    expect(LOOK.row.minHeight).toBe(56);
    expect(LOOK.row.fontSize).toBe(14);
    expect(LOOK.row.fontWeight).toBe(600);
  });

  it('a status card and a badge carry the tone by their roles, with no bar', () => {
    expect(LOOK.statusCard('warning').background).toBe('var(--alidade-warnTint)');
    expect(LOOK.statusCard('warning').borderRadius).toBe('var(--alidade-tile-radius)');
    expect('borderLeft' in LOOK.statusCard('warning')).toBe(false);
    expect(LOOK.badge('success').background).toBe('var(--alidade-okTint)');
    expect(LOOK.badge('success').color).toBe('var(--alidade-okInk)');
    expect(LOOK.badge('success').borderRadius).toBe('var(--alidade-badge-radius)');
  });

  it('an option card: one style for every option, white with an edge of 1.5 in ink, the card radius', () => {
    expect(LOOK.optionButton.minHeight).toBe(76);
    expect(LOOK.optionButton.border).toBe('1.5px solid var(--alidade-ruleStrong)');
    expect(LOOK.optionButton.background).toBe('var(--alidade-card)');
    expect(LOOK.optionButton.borderRadius).toBe('var(--alidade-card-radius)');
    expect(LOOK.optionButton.color).toBe('var(--alidade-ink)');
  });

  it('the primary control: the primary fill, its ink, a pill, its own shadow, extra bold', () => {
    expect(LOOK.primaryButton.background).toBe('var(--alidade-primary-fill)');
    expect(LOOK.primaryButton.color).toBe('var(--alidade-primaryInk)');
    expect(LOOK.primaryButton.borderRadius).toBe('var(--alidade-button-radius)');
    expect(LOOK.primaryButton.boxShadow).toBe('var(--alidade-primary-shadow)');
    expect(LOOK.primaryButton.fontWeight).toBe(800);
  });

  it('every other control: an outline pill of 1.5 in ink, no fill', () => {
    expect(LOOK.button.border).toBe('1.5px solid var(--alidade-ruleStrong)');
    expect(LOOK.button.background).toBe('transparent');
    expect(LOOK.button.borderRadius).toBe('var(--alidade-button-radius)');
    expect(LOOK.dangerButton.border).toBe('1.5px solid var(--alidade-dangerIcon)');
    expect(LOOK.dangerButton.color).toBe('var(--alidade-dangerInk)');
  });

  it('a round control is named by its label alone: a circle of 44 with an edge of 1.5', () => {
    expect(LOOK.roundButton.width).toBe(44);
    expect(LOOK.roundButton.height).toBe(44);
    expect(LOOK.roundButton.borderRadius).toBe('50%');
  });

  it('a title: extra bold at 28 in the display font, tight, in ink', () => {
    expect(LOOK.title.fontSize).toBe(28);
    expect(LOOK.title.fontWeight).toBe(800);
    expect(LOOK.title.letterSpacing).toBe('-0.9px');
    expect(LOOK.title.color).toBe('var(--alidade-ink)');
  });
});
