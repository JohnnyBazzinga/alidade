// The schematic (Req 22.12, design D25.4, task 24.2): two pins, the baseline marked "At least 1/3 of
// the distance", the line of sight to the smoke, its name and the visible line under it, no number.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCHEMATIC_TEXT } from '../../math/texts';
import { Schematic } from './Schematic';

describe('Schematic (Req 22.12)', () => {
  it('is an image named by the line of Req 22.12, with that line visible under it', () => {
    const { getByRole, getByTestId } = render(<Schematic />);
    const img = getByRole('img');
    expect(img.getAttribute('aria-label')).toBe(SCHEMATIC_TEXT.label);
    const caption = getByTestId('schematic').querySelector<HTMLElement>('figcaption');
    expect(caption?.textContent).toBe(SCHEMATIC_TEXT.label);
    expect(caption?.style.color).toBe('var(--alidade-inkDim)');
    expect(caption?.style.fontSize).toBe('16px');
  });

  it('draws two pins, the baseline, the line of sight and the smoke', () => {
    const { container } = render(<Schematic />);
    for (const part of ['pin-stood', 'pin-next', 'baseline', 'line-of-sight', 'smoke']) {
      expect(container.querySelector(`[data-art="${part}"]`), part).not.toBeNull();
    }
    // The baseline is at a right angle to the line of sight.
    const base = container.querySelector('[data-art="baseline"]') as SVGLineElement;
    const sight = container.querySelector('[data-art="line-of-sight"]') as SVGLineElement;
    const v = (l: SVGLineElement) => [
      Number(l.getAttribute('x2')) - Number(l.getAttribute('x1')),
      Number(l.getAttribute('y2')) - Number(l.getAttribute('y1')),
    ];
    const [bx, by] = v(base);
    const [sx, sy] = v(sight);
    expect((bx ?? 0) * (sx ?? 0) + (by ?? 0) * (sy ?? 0)).toBe(0);
  });

  it('every label is a string of Req 22.15, and no number stands as a place', () => {
    const { container } = render(<Schematic />);
    const texts = [...container.querySelectorAll('svg > text')].map((t) => t.textContent);
    expect(texts.sort()).toEqual(
      [
        SCHEMATIC_TEXT.sight,
        SCHEMATIC_TEXT.smoke,
        SCHEMATIC_TEXT.baseline,
        SCHEMATIC_TEXT.stood,
        SCHEMATIC_TEXT.next,
      ].sort(),
    );
    const words = container.querySelector('svg')?.textContent ?? '';
    expect(words.replace('1/3', '')).not.toMatch(/\d/);
  });
});
