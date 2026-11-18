import { describe, expect, it } from 'vitest';
import { rss, summariseAltitudes, summariseAzimuths } from './circular-summary';
import { createSeededRandom } from './simulator/seeded-random';
import { angleErrorRad, rad } from './test-support/angle-compare';
import { expectOk } from './test-support/result-helpers';

/** The direct formula that D5 replaces, kept here only to document the counterexample. */
function directSpread(anglesRad: readonly number[]): number {
  let s = 0;
  let c = 0;
  for (const a of anglesRad) {
    s += Math.sin(a);
    c += Math.cos(a);
  }
  const meanResultant = Math.hypot(s, c) / anglesRad.length;
  return meanResultant >= 1 ? 0 : Math.sqrt(-2 * Math.log(meanResultant));
}

describe('summariseAzimuths (D5)', () => {
  it('gives a zero Spread for identical azimuths, where the direct formula does not', () => {
    // The counterexample that D5 exists for: fifty copies of 5.123 rad.
    const copies = Array.from({ length: 50 }, () => 5.123);
    expect(expectOk(summariseAzimuths(copies)).spreadRad).toBeLessThan(1e-12);
    expect(directSpread(copies)).toBeGreaterThan(1e-9);
  });

  it('takes the circular mean across 0 / 2π', () => {
    const summary = expectOk(summariseAzimuths([rad(350), rad(10)]));
    expect(angleErrorRad(summary.meanRad, 0)).toBeLessThanOrEqual(1e-12);
    expect(summary.meanRad >= 0 && summary.meanRad < 2 * Math.PI).toBe(true);
  });

  it('gives the Spread of two angles 20° apart', () => {
    // R̄ = cos 10°, so the Spread is sqrt(-2 ln cos 10°).
    const expected = Math.sqrt(-2 * Math.log(Math.cos(rad(10))));
    expect(
      Math.abs(expectOk(summariseAzimuths([rad(350), rad(10)])).spreadRad - expected),
    ).toBeLessThanOrEqual(1e-12);
  });

  it('fails for opposite angles, an empty set and non-finite angles', () => {
    expect(summariseAzimuths([0, Math.PI])).toEqual({ ok: false, reason: 'undefined_mean' });
    expect(summariseAzimuths([])).toEqual({ ok: false, reason: 'insufficient_samples' });
    expect(summariseAzimuths([0, Number.NaN]).ok).toBe(false);
  });

  // Req 8.16: the Spread of 2000 draws from a wrapped normal of 1-sigma 1° lies within 5 % of 1°.
  // Fixed seed (testing.md); the expected sampling error is about σ/√(2n) ≈ 1.6 %.
  it('recovers the 1-sigma of a wrapped normal (Req 8.16)', () => {
    const random = createSeededRandom(20261117);
    const draws = Array.from({ length: 2000 }, () => rad(350) + rad(1) * random.normal());
    const spreadRad = expectOk(summariseAzimuths(draws)).spreadRad;
    expect(Math.abs(spreadRad / rad(1) - 1)).toBeLessThanOrEqual(0.05);
  });
});

describe('summariseAltitudes (D19)', () => {
  it('gives the arithmetic mean and the standard deviation over n', () => {
    const summary = expectOk(summariseAltitudes([rad(10), rad(12), rad(14)]));
    expect(Math.abs(summary.meanRad - rad(12))).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(summary.stdDevRad - rad(Math.sqrt(8 / 3)))).toBeLessThanOrEqual(1e-15);
    expect(expectOk(summariseAltitudes([0.3, 0.3, 0.3])).stdDevRad).toBe(0);
  });

  it('fails for an empty set and non-finite altitudes', () => {
    expect(summariseAltitudes([])).toEqual({ ok: false, reason: 'insufficient_samples' });
    expect(summariseAltitudes([0, Number.POSITIVE_INFINITY])).toEqual({
      ok: false,
      reason: 'invalid_number',
    });
  });
});

describe('rss', () => {
  it('combines 1-sigmas as the root sum of squares', () => {
    expect(rss(3, 4)).toBe(5);
    expect(rss(2)).toBe(2);
  });
});

describe('the summaries are total (Req 1.10, 11.8, D25)', () => {
  it('gives a zero Spread for identical azimuths of 1e300 rad (the counterexample of D25)', () => {
    // Before the angles were reduced to [0, 2π) first, `wrapPi(1e300 − mean)` and `sin(1e300)`
    // disagreed and this gave a Spread of about 0.76 for identical angles.
    const huge = summariseAzimuths([1e300, 1e300, 1e300]);
    expect(expectOk(huge).spreadRad).toBeLessThan(1e-12);
  });

  it('fails, rather than returning an infinity, when the altitudes overflow', () => {
    expect(summariseAltitudes([1e308, -1e308])).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'altitudesRad',
    });
    expect(summariseAltitudes([Number.NaN]).ok).toBe(false);
    expect(summariseAzimuths([Number.POSITIVE_INFINITY]).ok).toBe(false);
    expect(summariseAzimuths([]).ok).toBe(false);
  });
});
