import { describe, expect, it } from 'vitest';
import { wrappedDifferenceRad } from './angle-compare';

const rad = (angleDeg: number): number => (angleDeg * Math.PI) / 180;

describe('wrappedDifferenceRad', () => {
  it('returns the signed shortest rotation, across the 0/360 boundary', () => {
    expect(wrappedDifferenceRad(rad(10), rad(350))).toBeCloseTo(rad(20), 12);
    expect(wrappedDifferenceRad(rad(350), rad(10))).toBeCloseTo(rad(-20), 12);
    expect(wrappedDifferenceRad(rad(179), rad(-179))).toBeCloseTo(rad(-2), 12);
  });

  it('returns 0 for angles a whole number of turns apart', () => {
    expect(wrappedDifferenceRad(0.3 + 2 * Math.PI, 0.3)).toBeCloseTo(0, 12);
    expect(wrappedDifferenceRad(0.3 - 10 * Math.PI, 0.3)).toBeCloseTo(0, 12);
  });

  it('has magnitude π for opposite directions, whichever sign it returns', () => {
    expect(Math.abs(wrappedDifferenceRad(Math.PI, 0))).toBeCloseTo(Math.PI, 12);
    expect(Math.abs(wrappedDifferenceRad(0, Math.PI))).toBeCloseTo(Math.PI, 12);
  });

  it('never exceeds π in magnitude', () => {
    for (const aRad of [-7, -3.2, 0, 1.5, 3.2, 100]) {
      for (const bRad of [-9, -0.5, 0, 2.5, 6.4]) {
        expect(Math.abs(wrappedDifferenceRad(aRad, bRad))).toBeLessThanOrEqual(Math.PI);
      }
    }
  });
});
