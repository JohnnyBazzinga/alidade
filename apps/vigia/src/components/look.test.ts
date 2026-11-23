// The two font stacks in Vigia (design D24, skeleton-ui D36; task 23.3): prose and the labels of
// controls in the body stack, readings in the numeric one, and no size or colour lowered.

import { BODY_FONT_STACK, COLOURS, NUMERIC_FONT_STACK, SIZES } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { BODY_TEXT_PX, LOOK } from './look';

describe('LOOK (design D24)', () => {
  it('sets text, titles and every control in the body stack', () => {
    for (const style of [
      LOOK.text,
      LOOK.dim,
      LOOK.title,
      LOOK.alertText,
      LOOK.button,
      LOOK.primaryButton,
      LOOK.dangerButton,
    ]) {
      expect(style.fontFamily).toBe(BODY_FONT_STACK);
    }
  });

  it('sets a readout (a position, a direction, a code) in the numeric stack', () => {
    expect(LOOK.readout.fontFamily).toBe(NUMERIC_FONT_STACK);
  });

  it('lowers no size and no colour: 16 px text, 20 px readouts and labels, 48 and 64 px controls', () => {
    expect(BODY_TEXT_PX).toBe(16);
    expect(LOOK.text.fontSize).toBe(16);
    expect(LOOK.readout.fontSize).toBe(20);
    expect(LOOK.button.fontSize).toBe(SIZES.labelPx);
    expect(LOOK.button.minHeight).toBe(48);
    expect(LOOK.primaryButton.minHeight).toBe(64);
    expect(LOOK.text.color).toBe(COLOURS.ink);
    expect(LOOK.alertText.color).toBe(COLOURS.alert);
  });
});

// Task 24.1 (2026-11-22, the lead's new look; design D25.2, D25.8): LOOK is made of roles and
// shapes, never a colour, and gains the parts of the Field look.
describe('LOOK, from roles (Req 22.4, D25.2)', () => {
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

  it('a card: the card colour, the card radius, the shadow, a border of rule, padding 16', () => {
    expect(LOOK.card.background).toBe('var(--alidade-card)');
    expect(LOOK.card.borderRadius).toBe('var(--alidade-card-radius)');
    expect(LOOK.card.boxShadow).toBe('var(--alidade-shadow)');
    expect(LOOK.card.border).toBe('1px solid var(--alidade-rule)');
    expect(LOOK.card.padding).toBe(16);
  });

  it('a row: raised, the button radius, at least 48 high, its words at 20', () => {
    expect(LOOK.row.background).toBe('var(--alidade-raised)');
    expect(LOOK.row.borderRadius).toBe('var(--alidade-button-radius)');
    expect(LOOK.row.minHeight).toBe(48);
    expect(LOOK.row.fontSize).toBe(SIZES.labelPx);
  });

  it('a status card and a badge carry the tone by their roles; a badge has the badge radius', () => {
    expect(LOOK.statusCard('warning').background).toBe('var(--alidade-warnTint)');
    expect(LOOK.statusCard('warning').borderLeft).toBe('4px solid var(--alidade-warnBar)');
    expect(LOOK.badge('success').background).toBe('var(--alidade-okTint)');
    expect(LOOK.badge('success').color).toBe('var(--alidade-okInk)');
    expect(LOOK.badge('success').borderRadius).toBe('var(--alidade-badge-radius)');
  });

  it('an option button: at least 64, one style for every option, an outline that carries meaning', () => {
    expect(LOOK.optionButton.minHeight).toBe(64);
    expect(LOOK.optionButton.border).toBe('2px solid var(--alidade-accent)');
    expect(LOOK.optionButton.background).toBe('var(--alidade-card)');
    expect(LOOK.optionButton.color).toBe('var(--alidade-ink)');
  });

  it('an icon tile: a round tint behind an icon, never beside a numeral', () => {
    expect(LOOK.iconTile.borderRadius).toBe('var(--alidade-badge-radius)');
    expect(LOOK.iconTile.background).toBe('var(--alidade-infoTint)');
    expect(LOOK.iconTile.color).toBe('var(--alidade-infoIcon)');
  });

  it('the primary control: the primary fill, its ink, the button radius, bold', () => {
    expect(LOOK.primaryButton.background).toBe('var(--alidade-primary-fill)');
    expect(LOOK.primaryButton.color).toBe('var(--alidade-primaryInk)');
    expect(LOOK.primaryButton.borderRadius).toBe('var(--alidade-button-radius)');
  });

  it('a title: bold at 22 in the body stack, in ink', () => {
    expect(LOOK.title.fontSize).toBe(22);
    expect(LOOK.title.fontWeight).toBe(700);
    expect(LOOK.title.color).toBe('var(--alidade-ink)');
  });
});
