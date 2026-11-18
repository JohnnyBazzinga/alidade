// Formatting and parsing of angles for display (Req 3.8, design §7.1). Degrees exist only at
// the screen; the conversions come from `degrees.ts`.

import { wrapTwoPi } from '@alidade/core';
import { fromDeg, toDeg } from './degrees';
import { err, ok, type UiResult } from '../result';

/** What is shown for an angle that is not a finite number: never `NaN` (Req 2.1). */
export const NO_VALUE_TEXT = '—';

/** `decimals` as the number of fraction digits used: an integer in [0, 4]; others are clamped. */
function digitsOf(decimals: number): number {
  if (!Number.isFinite(decimals)) return 1;
  return Math.min(4, Math.max(0, Math.round(decimals)));
}

/**
 * An azimuth in degrees in `[0, 360)`, with `decimals` fraction digits (0 to 4). A value that
 * rounds up to 360 prints as 0, never `360.0`. A non-finite angle prints as `—`.
 */
export function formatAzimuthDeg(azimuthRad: number, decimals: number): string {
  const wrapped = wrapTwoPi(azimuthRad);
  if (!wrapped.ok) return NO_VALUE_TEXT;
  const d = digitsOf(decimals);
  const scale = 10 ** d;
  let roundedDeg = Math.round(toDeg(wrapped.value) * scale) / scale;
  if (roundedDeg >= 360) roundedDeg -= 360;
  return (roundedDeg === 0 ? 0 : roundedDeg).toFixed(d);
}

/**
 * A signed angle (an altitude, a difference) in degrees in `[-180, 180]`, with `decimals`
 * fraction digits. It never prints `-0` or a minus sign for a value that rounds to zero.
 */
export function formatSignedDeg(angleRad: number, decimals: number): string {
  if (!Number.isFinite(angleRad)) return NO_VALUE_TEXT;
  const d = digitsOf(decimals);
  const scale = 10 ** d;
  const valueDeg = Math.min(180, Math.max(-180, toDeg(angleRad)));
  if (!Number.isFinite(valueDeg)) return NO_VALUE_TEXT;
  const roundedDeg = Math.round(valueDeg * scale) / scale;
  return (roundedDeg === 0 ? 0 : roundedDeg).toFixed(d);
}

const DEGREES_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)°?$/;

/**
 * Parses a number of degrees typed by the user into radians. Accepts an optional sign, digits
 * with an optional decimal point and an optional `°`; nothing else (no exponent, no `Infinity`,
 * no thousands separator, no comma). Anything else is `invalid_number` naming `text`.
 */
export function parseDegrees(text: string): UiResult<number> {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!DEGREES_TEXT.test(trimmed)) return err('invalid_number', { field: 'text' });
  const valueDeg = Number(trimmed.endsWith('°') ? trimmed.slice(0, -1) : trimmed);
  const valueRad = fromDeg(valueDeg);
  if (!Number.isFinite(valueDeg) || !Number.isFinite(valueRad)) {
    return err('invalid_number', { field: 'text' });
  }
  return ok(valueRad + 0); // turns -0 into 0
}
