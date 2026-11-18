import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance, type Rgb } from './contrast';

function hex(code: string): Rgb {
  return {
    r: parseInt(code.slice(1, 3), 16),
    g: parseInt(code.slice(3, 5), 16),
    b: parseInt(code.slice(5, 7), 16),
  };
}

function ratio(a: Rgb, b: Rgb): number {
  const result = contrastRatio(a, b);
  if (!result.ok) throw new Error('unexpected failure');
  return result.value;
}

describe('contrast (Req 13.2, 13.10)', () => {
  it('gives 21 for black on white and 1 for equal colours', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(Math.abs(ratio(black, white) - 21)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(ratio(white, black) - 21)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(ratio(white, white) - 1)).toBeLessThanOrEqual(1e-12);
  });

  it('has luminance 0 for black and 1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toEqual({ ok: true, value: 0 });
    const white = relativeLuminance({ r: 255, g: 255, b: 255 });
    expect(white.ok && Math.abs(white.value - 1) <= 1e-12).toBe(true);
  });

  it('reproduces the values of design §7.18 to two decimals', () => {
    const bg = hex('#0C0F12');
    const raised = hex('#1D252C');
    expect(ratio(hex('#ECE8DC'), bg).toFixed(2)).toBe('15.69');
    expect(ratio(hex('#AEB6BD'), raised).toFixed(2)).toBe('7.56');
    expect(ratio(hex('#6A7884'), raised).toFixed(2)).toBe('3.42');
  });

  it('names the channel that is not a finite number in [0, 255]', () => {
    const white = { r: 255, g: 255, b: 255 };
    expect(contrastRatio({ r: Number.NaN, g: 0, b: 0 }, white)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'a.r',
    });
    expect(contrastRatio(white, { r: 0, g: 256, b: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'b.g',
    });
    expect(contrastRatio(white, { r: 0, g: 0, b: -1 }).ok).toBe(false);
    expect(relativeLuminance({ r: Infinity, g: 0, b: 0 }).ok).toBe(false);
  });
});
