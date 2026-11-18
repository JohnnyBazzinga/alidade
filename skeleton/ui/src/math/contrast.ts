// WCAG 2.1 relative luminance and contrast ratio (Req 13.2, 13.10, design §7.2).
//
// WCAG 2.1 prints the threshold `0.03928` and later texts `0.04045`. No 8-bit value lies between
// them (10/255 = 0.0392 and 11/255 = 0.0431), so the results are identical for 8-bit colours.
// A channel that is not a finite number in [0, 255] is `invalid_number`, never a `NaN` ratio.

import { err, ok, type UiResult } from '../result';

/** An sRGB colour, each channel in [0, 255]. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function checkRgb(colour: Rgb, name: string): UiResult<Rgb> {
  for (const channel of ['r', 'g', 'b'] as const) {
    const value = colour[channel];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 255) {
      return err('invalid_number', { field: `${name}.${channel}` });
    }
  }
  return ok(colour);
}

/** Relative luminance in [0, 1]. */
export function relativeLuminance(colour: Rgb): UiResult<number> {
  const checked = checkRgb(colour, 'colour');
  if (!checked.ok) return checked;
  return ok(0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b));
}

/** The contrast ratio of two colours, in [1, 21]; symmetric in its arguments. */
export function contrastRatio(a: Rgb, b: Rgb): UiResult<number> {
  const checkedA = checkRgb(a, 'a');
  if (!checkedA.ok) return checkedA;
  const checkedB = checkRgb(b, 'b');
  if (!checkedB.ok) return checkedB;
  const la = 0.2126 * linear(a.r) + 0.7152 * linear(a.g) + 0.0722 * linear(a.b);
  const lb = 0.2126 * linear(b.r) + 0.7152 * linear(b.g) + 0.0722 * linear(b.b);
  return ok((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05));
}
