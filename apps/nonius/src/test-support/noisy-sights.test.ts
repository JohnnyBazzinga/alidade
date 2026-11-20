import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { sunAt } from '../math/sun/sun-at';
import { noisySights } from './noisy-sights';

const D = DEG_TO_RAD;
const params = defaultParameters();
const TRUTH = { latRad: 30 * D, lonRad: -40 * D };
const TIMES = [Date.UTC(2026, 11, 21, 11), Date.UTC(2026, 11, 21, 14), Date.UTC(2026, 11, 21, 17)];
const OPTIONS = { commonSigmaRad: 1 * D, independentSigmaRad: 0.5 * D, sunSideSigmaRad: 5 * D };

function noise(seed: number): { shared: number; independent: number[] } {
  const r = noisySights(TRUTH, TIMES, seed, OPTIONS, params);
  const independent = r.sights.map((s, i) => {
    const sun = sunAt(TRUTH, TIMES[i] ?? 0, params);
    if (!sun.ok) throw new Error('sun');
    return s.rawApparentAltitudeRad - sun.value.apparentAltitudeRad - r.sharedErrorRad;
  });
  return { shared: r.sharedErrorRad, independent };
}

describe('noisySights (test support)', () => {
  it('is deterministic in the seed and different for another seed', () => {
    expect(noisySights(TRUTH, TIMES, 5, OPTIONS, params)).toEqual(
      noisySights(TRUTH, TIMES, 5, OPTIONS, params),
    );
    expect(noisySights(TRUTH, TIMES, 5, OPTIONS, params)).not.toEqual(
      noisySights(TRUTH, TIMES, 6, OPTIONS, params),
    );
  });

  it('draws the shared error with the Common sigma and the independent errors with theirs', () => {
    const shared: number[] = [];
    const independent: number[] = [];
    for (let seed = 0; seed < 2000; seed += 1) {
      const n = noise(seed);
      shared.push(n.shared);
      independent.push(...n.independent);
    }
    const sd = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
    expect(sd(shared) / D).toBeGreaterThan(0.93);
    expect(sd(shared) / D).toBeLessThan(1.07);
    expect(sd(independent) / D).toBeGreaterThan(0.46);
    expect(sd(independent) / D).toBeLessThan(0.54);
  });

  it('adds the shared error to every Sight alike', () => {
    const r = noisySights(
      TRUTH,
      TIMES,
      3,
      { ...OPTIONS, independentSigmaRad: 0, sunSideSigmaRad: null },
      params,
    );
    r.sights.forEach((s, i) => {
      const sun = sunAt(TRUTH, TIMES[i] ?? 0, params);
      if (!sun.ok) throw new Error('sun');
      expect(s.rawApparentAltitudeRad - sun.value.apparentAltitudeRad).toBeCloseTo(
        r.sharedErrorRad,
        12,
      );
      expect(s.sunSide).toBeNull();
    });
  });

  it('adds a wrong Sight\u2019s error to that Sight alone, and gives the Sun side a true North reference', () => {
    const base = noisySights(TRUTH, TIMES, 9, OPTIONS, params);
    const wrong = noisySights(
      TRUTH,
      TIMES,
      9,
      { ...OPTIONS, wrong: { index: 1, errorRad: 0.1 } },
      params,
    );
    expect(wrong.sights[0]).toEqual(base.sights[0]);
    expect(
      (wrong.sights[1]?.rawApparentAltitudeRad ?? 0) -
        (base.sights[1]?.rawApparentAltitudeRad ?? 0),
    ).toBeCloseTo(0.1, 12);
    expect(base.sights.every((s) => s.sunSide?.northReference === 'true')).toBe(true);
  });
});
