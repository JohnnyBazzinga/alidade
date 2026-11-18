import { describe, expect, it } from 'vitest';
import { fromDeg } from './degrees';
import { formatAzimuthDeg, formatSignedDeg, NO_VALUE_TEXT, parseDegrees } from './display-format';

describe('formatAzimuthDeg (Req 3.8, 3.9)', () => {
  it('prints a value that rounds up to 360 as 0', () => {
    expect(formatAzimuthDeg(2 * Math.PI - 1e-9, 1)).toBe('0.0');
    expect(formatAzimuthDeg(fromDeg(359.96), 1)).toBe('0.0');
    expect(formatAzimuthDeg(fromDeg(359.94), 1)).toBe('359.9');
    expect(formatAzimuthDeg(2 * Math.PI - 1e-12, 0)).toBe('0');
  });

  it('formats known azimuths', () => {
    expect(formatAzimuthDeg(0, 1)).toBe('0.0');
    expect(formatAzimuthDeg(Math.PI / 2, 1)).toBe('90.0');
    expect(formatAzimuthDeg(Math.PI, 2)).toBe('180.00');
    expect(formatAzimuthDeg(fromDeg(12.345), 2)).toBe('12.35');
    expect(formatAzimuthDeg(fromDeg(12.3456), 4)).toBe('12.3456');
  });

  it('wraps an azimuth outside [0, 2π)', () => {
    expect(formatAzimuthDeg(-Math.PI / 2, 0)).toBe('270');
    expect(formatAzimuthDeg(5 * Math.PI, 0)).toBe('180');
  });

  it('prints the dash for a non-finite angle', () => {
    for (const x of [Number.NaN, Infinity, -Infinity])
      expect(formatAzimuthDeg(x, 1)).toBe(NO_VALUE_TEXT);
  });

  it('keeps the digits to 0 to 4 whatever the argument', () => {
    expect(formatAzimuthDeg(1, 99)).toBe(formatAzimuthDeg(1, 4));
    expect(formatAzimuthDeg(1, -3)).toBe(formatAzimuthDeg(1, 0));
    expect(formatAzimuthDeg(1, Number.NaN)).toBe(formatAzimuthDeg(1, 1));
  });
});

describe('formatSignedDeg (Req 3.8, 3.10)', () => {
  it('has no minus sign when the angle rounds to zero', () => {
    expect(formatSignedDeg(fromDeg(-0.04), 1)).toBe('0.0');
    expect(formatSignedDeg(-0, 1)).toBe('0.0');
    expect(formatSignedDeg(-1e-12, 3)).toBe('0.000');
    expect(formatSignedDeg(fromDeg(-0.06), 1)).toBe('-0.1');
  });

  it('formats known angles', () => {
    expect(formatSignedDeg(Math.PI / 2, 1)).toBe('90.0');
    expect(formatSignedDeg(-Math.PI, 0)).toBe('-180');
    expect(formatSignedDeg(Math.PI, 0)).toBe('180');
    expect(formatSignedDeg(fromDeg(-3.3), 1)).toBe('-3.3');
  });

  it('clamps to [-180, 180] and prints the dash for a non-finite angle', () => {
    expect(formatSignedDeg(10, 0)).toBe('180');
    expect(formatSignedDeg(-10, 0)).toBe('-180');
    expect(formatSignedDeg(Number.NaN, 1)).toBe(NO_VALUE_TEXT);
    expect(formatSignedDeg(Infinity, 1)).toBe(NO_VALUE_TEXT);
  });
});

describe('parseDegrees (Req 3.8)', () => {
  it('parses what a user types', () => {
    const cases: [string, number][] = [
      ['12.5°', fromDeg(12.5)],
      [' -3 ', fromDeg(-3)],
      ['+7', fromDeg(7)],
      ['.5', fromDeg(0.5)],
      ['5.', fromDeg(5)],
      ['90', Math.PI / 2],
    ];
    for (const [text, expected] of cases) {
      const result = parseDegrees(text);
      expect(result.ok).toBe(true);
      if (result.ok) expect(Math.abs(result.value - expected)).toBeLessThanOrEqual(1e-15);
    }
  });

  it('never returns -0', () => {
    const result = parseDegrees('-0');
    expect(result.ok && Object.is(result.value, 0)).toBe(true);
  });

  it('fails with invalid_number naming text for anything else', () => {
    for (const text of [
      '1e3',
      'Infinity',
      '',
      '1,5',
      '  ',
      'NaN',
      '--1',
      '1 2',
      '°',
      '1°°',
      '0x10',
      '1_0',
      '١٢',
    ]) {
      expect(parseDegrees(text)).toEqual({ ok: false, reason: 'invalid_number', field: 'text' });
    }
  });

  it('fails for a number too long to be finite', () => {
    expect(parseDegrees('9'.repeat(400))).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'text',
    });
  });

  it('does not throw on a non-string', () => {
    expect(parseDegrees(undefined as unknown as string).ok).toBe(false);
  });
});
