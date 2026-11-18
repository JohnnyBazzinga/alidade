import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../math/contrast';
import { MAP_DARK, MAP_FIX, MAP_LIGHT } from '../math/map/map-style';
import {
  COLOURS,
  HAIRLINE_MIN_RATIO,
  MAP_FIX_COLOUR,
  PALETTE_PAIRS,
  SIZES,
  hexToRgb,
  type PalettePair,
} from './theme';
import { MIN_CONTRAST_RATIO, MIN_READOUT_FONT_PX } from '../defaults';

function ratio(foreground: string, background: string): number {
  const r = contrastRatio(hexToRgb(foreground), hexToRgb(background));
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

/** The pairs below the minimum: what the test of Req 13.11 fails on. */
function belowMinimum(pairs: readonly PalettePair[]): string[] {
  return pairs
    .filter((p) => ratio(p.foreground, p.background) < MIN_CONTRAST_RATIO)
    .map((p) => p.label);
}

describe('the palette (Req 13.2, 13.11, design §7.18)', () => {
  it('holds 7:1 for every pair', () => {
    expect(belowMinimum(PALETTE_PAIRS)).toEqual([]);
  });

  it('fails when a pair below 7:1 is added', () => {
    const bad: PalettePair = {
      label: 'rule on raised',
      foreground: COLOURS.rule,
      background: COLOURS.raised,
    };
    expect(belowMinimum([...PALETTE_PAIRS, bad])).toEqual(['rule on raised']);
  });

  it('gives the ratios of design §7.18 to two decimals', () => {
    expect(ratio(COLOURS.ink, COLOURS.bg).toFixed(2)).toBe('15.69');
    expect(ratio(COLOURS.inkDim, COLOURS.raised).toFixed(2)).toBe('7.56');
    expect(ratio(COLOURS.rule, COLOURS.raised).toFixed(2)).toBe('3.42');
  });

  it('holds the hairline to 3:1 against every surface', () => {
    for (const surface of [COLOURS.bg, COLOURS.panel, COLOURS.raised]) {
      expect(ratio(COLOURS.rule, surface)).toBeGreaterThanOrEqual(HAIRLINE_MIN_RATIO);
    }
  });

  it('uses the map tokens of the Math layer (design D27.16)', () => {
    expect(COLOURS.outline).toBe(MAP_DARK);
    expect(COLOURS.mapInk).toBe(MAP_LIGHT);
    expect(COLOURS.brass).toBe(MAP_FIX);
    expect(MAP_FIX_COLOUR).toBe(COLOURS.brass);
  });

  it('keeps the sizes of Req 13 and 19', () => {
    expect(SIZES.labelPx).toBeGreaterThanOrEqual(MIN_READOUT_FONT_PX);
    expect(SIZES.touchPx).toBe(48);
    expect(SIZES.primaryPx).toBe(64);
    expect(SIZES.gapPx).toBe(8);
  });
});
