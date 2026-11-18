import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hostileNumber, hugeFinite } from './hostile';

describe('hostileNumber draws huge finite values often (design D30)', () => {
  it('a quarter of the draws or more are finite with |x| ≥ 1e6, and some reach 1e300', () => {
    const draws = fc.sample(hostileNumber(), { numRuns: 20_000, seed: 7 });
    const huge = draws.filter((x) => Number.isFinite(x) && Math.abs(x) >= 1e6);
    const fraction = huge.length / draws.length;
    console.log(`[coverage] hostileNumber: ${(100 * fraction).toFixed(1)} % finite with |x| ≥ 1e6`);
    expect(fraction).toBeGreaterThanOrEqual(0.25);
    expect(huge.some((x) => x >= 1e12)).toBe(true);
    expect(huge.some((x) => x <= -1e12)).toBe(true);
    expect(huge.some((x) => Math.abs(x) >= 1e300)).toBe(true);
  });

  it('hugeFinite is always finite and at least 1e6 in magnitude', () => {
    for (const x of fc.sample(hugeFinite(), { numRuns: 5_000, seed: 3 })) {
      expect(Number.isFinite(x) && Math.abs(x) >= 1e6).toBe(true);
    }
  });
});
