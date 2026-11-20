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

  it('draws latitude, longitude and the place of a time in its spread uniformly (checkpoint 7: fc.double drew |lat| < 20° in 94 % of 30 000 cases)', () => {
    const latBands = [0, 0, 0, 0];
    const lonBands = [0, 0, 0, 0];
    fc.assert(
      fc.property(truthArb(80), (p) => {
        latBands[Math.min(3, Math.floor(Math.abs(p.latRad / D) / 20))] += 1;
        lonBands[Math.min(3, Math.floor((p.lonRad / D + 180) / 90))] += 1;
      }),
      { numRuns: 8000, seed: 21 },
    );
    // Uniform: 2 000 a band; four sigma of a binomial of 8 000 at 1/4 is about 155.
    for (const n of [...latBands, ...lonBands]) {
      expect(n).toBeGreaterThan(1800);
      expect(n).toBeLessThan(2200);
    }
    const quarters = [0, 0, 0, 0];
    fc.assert(
      fc.property(rawTimesArb(6, 6, 8, 8), (times) => {
        const spreadMs = 8 * 3_600_000;
        const first = times[0] ?? 0;
        const last = times[times.length - 1] ?? 0;
        // The offsets of the middle sights from the first are uniform up to the spread; their
        // gaps, as a share of the spread, fill the quarters evenly over many draws.
        for (const t of times.slice(1, -1)) {
          const share = (t - first) / Math.max(last - first, 1);
          quarters[Math.min(3, Math.floor(share * 4))] += 1;
        }
        expect(last - first).toBeLessThanOrEqual(spreadMs);
      }),
      { numRuns: 4000, seed: 23 },
    );
    // The order statistics between the first and last of six uniform draws are uniform in that
    // span: 4 000 sets × 4 inner sights = 16 000, so 4 000 a quarter.
    for (const n of quarters) {
      expect(n).toBeGreaterThan(3700);
      expect(n).toBeLessThan(4300);
    }
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
