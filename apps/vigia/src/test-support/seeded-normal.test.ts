import { describe, expect, it } from 'vitest';
import { createSeededNormal } from './seeded-normal';

function draw(seed: number, count: number): number[] {
  const normal = createSeededNormal(seed);
  return Array.from({ length: count }, () => normal.next());
}

describe('createSeededNormal (the seed is an argument)', () => {
  it('gives the same sequence for the same seed and a different one for another', () => {
    expect(draw(42, 50)).toEqual(draw(42, 50));
    expect(draw(42, 50)).not.toEqual(draw(43, 50));
  });

  it('draws a standard normal: mean 0 and standard deviation 1 within the sampling error', () => {
    const n = 40_000;
    const xs = draw(7, n);
    const mean = xs.reduce((s, x) => s + x, 0) / n;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
    // The standard error of the mean is 1/sqrt(n) = 0.005; 0.025 is five of them.
    expect(Math.abs(mean)).toBeLessThan(0.025);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.025);
    // About 4.55 % of a standard normal lies beyond two sigma.
    const beyond2 = xs.filter((x) => Math.abs(x) > 2).length / n;
    expect(beyond2).toBeGreaterThan(0.04);
    expect(beyond2).toBeLessThan(0.051);
  });

  it('only draws finite numbers, also for seeds at the ends of the 32-bit range', () => {
    for (const seed of [0, 1, 2 ** 32 - 1, 2 ** 32, -1]) {
      expect(draw(seed, 10_000).every(Number.isFinite)).toBe(true);
    }
  });

  it('refuses a seed that is not an integer', () => {
    expect(() => createSeededNormal(1.5)).toThrow(RangeError);
    expect(() => createSeededNormal(Number.NaN)).toThrow(RangeError);
  });

  it('draws uniform numbers in [0, 1) from the same stream', () => {
    const source = createSeededNormal(3);
    const us = Array.from({ length: 5000 }, () => source.nextUnit());
    expect(us.every((u) => u >= 0 && u < 1)).toBe(true);
    expect(Math.min(...us)).toBeLessThan(0.01);
    expect(Math.max(...us)).toBeGreaterThan(0.99);
  });
});
