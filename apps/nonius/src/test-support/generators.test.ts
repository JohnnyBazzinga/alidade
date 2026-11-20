import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { angleOfCutRad, rawTimesArb, timeArb, truthArb, usableTimes } from './generators';

const D = DEG_TO_RAD;

describe('generators (test support)', () => {
  it('truthArb stays inside its latitude band and the longitude range, and reaches both ends', () => {
    let low = 0;
    let high = 0;
    fc.assert(
      fc.property(truthArb(70), (p) => {
        expect(Math.abs(p.latRad)).toBeLessThanOrEqual(70 * D);
        expect(p.lonRad).toBeGreaterThanOrEqual(-Math.PI);
        expect(p.lonRad).toBeLessThan(Math.PI);
        if (p.latRad < -60 * D) low += 1;
        if (p.latRad > 60 * D) high += 1;
      }),
      { numRuns: 2000, seed: 11 },
    );
    expect(low).toBeGreaterThan(50);
    expect(high).toBeGreaterThan(50);
  });

  it('timeArb stays inside the years', () => {
    fc.assert(
      fc.property(timeArb(2026, 2029), (t) => {
        expect(t).toBeGreaterThanOrEqual(Date.UTC(2026, 0, 1));
        expect(t).toBeLessThan(Date.UTC(2030, 0, 1));
      }),
      { numRuns: 500, seed: 12 },
    );
  });

  it('rawTimesArb gives sorted whole minutes, within the spread, in the count range', () => {
    fc.assert(
      fc.property(rawTimesArb(2, 6, 2, 9), (times) => {
        expect(times.length).toBeGreaterThanOrEqual(2);
        expect(times.length).toBeLessThanOrEqual(6);
        for (let i = 1; i < times.length; i += 1) {
          expect(times[i] ?? 0).toBeGreaterThanOrEqual(times[i - 1] ?? 0);
        }
        for (const t of times) expect(t % 60_000).toBe(0);
        expect((times[times.length - 1] ?? 0) - (times[0] ?? 0)).toBeLessThanOrEqual(
          9 * 3_600_000 + 60_000,
        );
      }),
      { numRuns: 500, seed: 13 },
    );
  });

  it('angleOfCutRad is the acute angle', () => {
    expect(angleOfCutRad(10 * D, 80 * D)).toBeCloseTo(70 * D, 12);
    expect(angleOfCutRad(10 * D, 190 * D)).toBeCloseTo(0, 12);
    expect(angleOfCutRad(350 * D, 10 * D)).toBeCloseTo(20 * D, 12);
  });

  it('usableTimes says yes for a morning and an afternoon at 30° N, and no for night or a single instant', () => {
    const truth = { latRad: 30 * D, lonRad: -40 * D };
    const params = defaultParameters();
    const morning = Date.UTC(2026, 2, 20, 12, 0);
    const afternoon = Date.UTC(2026, 2, 20, 17, 0);
    expect(usableTimes(truth, [morning, afternoon], 20, params)).toBe(true);
    expect(usableTimes(truth, [morning, morning], 20, params)).toBe(false);
    expect(usableTimes(truth, [morning, Date.UTC(2026, 2, 20, 2, 0)], 20, params)).toBe(false);
    expect(usableTimes(truth, [morning, afternoon], 120, params)).toBe(false);
  });
});
