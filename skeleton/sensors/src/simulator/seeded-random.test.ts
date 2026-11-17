import { describe, expect, it } from 'vitest';
import { createSeededRandom } from './seeded-random';

function take(seed: number, count: number, draw: 'uniform' | 'normal' | 'nextUint32'): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random[draw]());
}

describe('createSeededRandom (D17)', () => {
  it('gives the same sequence for the same seed, bit for bit', () => {
    for (const draw of ['uniform', 'normal', 'nextUint32'] as const) {
      const first = take(20261117, 1000, draw);
      const second = take(20261117, 1000, draw);
      expect(second.every((value, i) => Object.is(value, first[i]))).toBe(true);
    }
  });

  it('gives different sequences for different seeds, including neighbours', () => {
    const base = take(7, 20, 'nextUint32');
    for (const seed of [0, 6, 8, 2 ** 32 - 1]) {
      const other = take(seed, 20, 'nextUint32');
      expect(other.filter((value, i) => value === base[i]).length).toBeLessThan(2);
    }
  });

  it('keeps uniform draws in [0, 1) and integers in [0, 2^32)', () => {
    const random = createSeededRandom(1);
    let outOfRange = 0;
    for (let i = 0; i < 100_000; i += 1) {
      const u = random.uniform();
      if (!(u >= 0 && u < 1)) outOfRange += 1;
      const n = random.nextUint32();
      if (!(Number.isInteger(n) && n >= 0 && n < 2 ** 32)) outOfRange += 1;
    }
    expect(outOfRange).toBe(0);
  });

  it('draws normals with mean near 0 and standard deviation near 1', () => {
    const draws = take(12345, 100_000, 'normal');
    const mean = draws.reduce((sum, x) => sum + x, 0) / draws.length;
    const variance = draws.reduce((sum, x) => sum + (x - mean) ** 2, 0) / draws.length;
    expect(draws.every(Number.isFinite)).toBe(true);
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.01);
  });
});
