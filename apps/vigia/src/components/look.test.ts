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
