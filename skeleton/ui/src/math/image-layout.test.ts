import { describe, expect, it } from 'vitest';
import { imageLayout } from './image-layout';

const SOURCE = { widthSourcePx: 720, heightSourcePx: 1280 };
const ELEMENT = { widthPx: 390, heightPx: 844 };

function near(a: number, b: number, tolerance = 1e-9): boolean {
  return Math.abs(a - b) <= tolerance;
}

describe('imageLayout (Req 5.1), 720 × 1280 source in a 390 × 844 element, by hand', () => {
  it('cover: scale 844/1280 = 0.659375, 474.75 × 844, left -42.375', () => {
    const result = imageLayout(SOURCE, ELEMENT, 'cover');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const l = result.value;
    expect(near(l.scalePxPerSourcePx, 0.659375)).toBe(true);
    expect(near(l.displayedWidthPx, 474.75)).toBe(true);
    expect(near(l.displayedHeightPx, 844)).toBe(true);
    expect(near(l.leftPx, -42.375)).toBe(true);
    expect(near(l.topPx, 0)).toBe(true);
    expect(l.fit).toBe('cover');
  });

  it('contain: scale 390/720 = 0.541666…, 390 × 693.333…, top 75.333…', () => {
    const result = imageLayout(SOURCE, ELEMENT, 'contain');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const l = result.value;
    expect(near(l.scalePxPerSourcePx, 390 / 720)).toBe(true);
    expect(near(l.displayedWidthPx, 390)).toBe(true);
    expect(near(l.displayedHeightPx, 1280 * (390 / 720))).toBe(true);
    expect(near(l.leftPx, 0)).toBe(true);
    expect(near(l.topPx, (844 - 1280 * (390 / 720)) / 2)).toBe(true);
    expect(near(l.topPx, 75.33333333333333)).toBe(true);
  });

  it('puts the centre of the source at the centre of the element', () => {
    for (const fit of ['cover', 'contain'] as const) {
      const result = imageLayout(SOURCE, ELEMENT, fit);
      if (!result.ok) throw new Error('layout');
      const l = result.value;
      expect(near(l.leftPx + l.displayedWidthPx / 2, 195)).toBe(true);
      expect(near(l.topPx + l.displayedHeightPx / 2, 422)).toBe(true);
    }
  });

  it('names each size that is NaN, infinite or not positive', () => {
    const cases: [object, object, string][] = [
      [{ ...SOURCE, widthSourcePx: Number.NaN }, ELEMENT, 'sourceWidthSourcePx'],
      [{ ...SOURCE, heightSourcePx: 0 }, ELEMENT, 'sourceHeightSourcePx'],
      [SOURCE, { ...ELEMENT, widthPx: -1 }, 'elementWidthPx'],
      [SOURCE, { ...ELEMENT, heightPx: Infinity }, 'elementHeightPx'],
    ];
    for (const [source, element, field] of cases) {
      expect(imageLayout(source as typeof SOURCE, element as typeof ELEMENT, 'cover')).toEqual({
        ok: false,
        reason: 'invalid_number',
        field,
      });
    }
    expect(imageLayout(SOURCE, ELEMENT, 'stretch' as 'cover')).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'fit',
    });
  });

  it('fails instead of returning an infinite scale', () => {
    const result = imageLayout(
      { widthSourcePx: Number.MIN_VALUE, heightSourcePx: Number.MIN_VALUE },
      { widthPx: Number.MAX_VALUE, heightPx: Number.MAX_VALUE },
      'cover',
    );
    expect(result.ok).toBe(false);
  });
});
