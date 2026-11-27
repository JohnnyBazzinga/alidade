// The schematic (Req 22.12, design D26.4): two numbered pins with their legend, the footsteps between
// them marked "At least 1/3 of the distance", the lines of sight to the smoke, its name and the
// visible line under it, no number as a place.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SCHEMATIC_TEXT } from '../../math/texts';
import { Schematic } from './Schematic';

describe('Schematic (Req 22.12, as Mira draws it, D26.4)', () => {
  it('is an image named by the line of Req 22.12, with that line visible under it', () => {
    const { getByRole, getByTestId } = render(<Schematic />);
    const img = getByRole('img');
    expect(img.getAttribute('aria-label')).toBe(SCHEMATIC_TEXT.label);
    const caption = getByTestId('schematic').querySelector<HTMLElement>('figcaption');
    expect(caption?.textContent).toBe(SCHEMATIC_TEXT.label);
    expect(caption?.style.color).toBe('var(--alidade-inkDim)');
    expect(caption?.style.fontSize).toBe('12px');
  });

  it('draws two pins, the footsteps between them, the lines of sight and the smoke', () => {
    const { container } = render(<Schematic />);
    for (const part of ['pin-stood', 'pin-next', 'steps', 'line-of-sight', 'smoke']) {
      expect(container.querySelector(`[data-art="${part}"]`), part).not.toBeNull();
    }
    // The footsteps go sideways, from pin 1 to pin 2: every step lies between the two pins.
    const xs = [...container.querySelectorAll('[data-art="steps"] ellipse')].map((e) =>
      Number(e.getAttribute('cx')),
    );
    expect(xs.length).toBeGreaterThan(4);
    for (const x of xs) {
      expect(x).toBeGreaterThan(60);
      expect(x).toBeLessThan(252);
    }
  });

  it('every label is a string of Req 22.15, the pins are numbered by the legend, and no number stands as a place', () => {
    const { container, getByTestId } = render(<Schematic />);
    const inside = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(inside.sort()).toEqual(
      ['1', '2', SCHEMATIC_TEXT.sight, SCHEMATIC_TEXT.smoke, SCHEMATIC_TEXT.baseline].sort(),
    );
    const legend = getByTestId('schematic').querySelector('[data-part="legend"]')?.textContent;
    expect(legend).toBe(`1${SCHEMATIC_TEXT.stood}2${SCHEMATIC_TEXT.next}`);
    // Beside the pins' numbers, no figure but the 1/3 of the baseline.
    const words = inside.filter((t) => t !== '1' && t !== '2').join(' ');
    expect(words.replace('1/3', '')).not.toMatch(/\d/);
  });
});
