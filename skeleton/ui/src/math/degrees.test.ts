import { describe, expect, it } from 'vitest';
import { fromDeg, toDeg } from './degrees';

describe('degrees (Req 1.10)', () => {
  it('converts known values', () => {
    expect(Math.abs(fromDeg(180) - Math.PI)).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(fromDeg(90) - Math.PI / 2)).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(toDeg(Math.PI / 4) - 45)).toBeLessThanOrEqual(1e-13);
    expect(Object.is(fromDeg(0), 0)).toBe(true);
  });

  it('passes NaN on for a non-finite argument and never throws', () => {
    for (const x of [Number.NaN, Infinity, -Infinity]) {
      expect(Number.isNaN(fromDeg(x))).toBe(true);
      expect(Number.isNaN(toDeg(x))).toBe(true);
    }
    // Converting to degrees overflows here, which is a failure too, never an infinity.
    expect(Number.isNaN(toDeg(Number.MAX_VALUE))).toBe(true);
    expect(Number.isFinite(fromDeg(Number.MAX_VALUE))).toBe(true);
  });
});
