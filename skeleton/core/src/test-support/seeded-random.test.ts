import { describe, expect, it } from 'vitest';
import { createSeededRandom } from './seeded-random';

function draw(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random.nextUnit());
}

describe('createSeededRandom', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draw(12345, 1000)).toEqual(draw(12345, 1000));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw(1, 20)).not.toEqual(draw(2, 20));
  });

  it('matches the mulberry32 reference values for seeds 1 and 2', () => {
    // Reference values computed with an independent Python implementation of mulberry32.
    // Changing the generator changes every seeded test, so these pin it.
    expect(draw(1, 3)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    expect(draw(2, 3)).toEqual([0.7342509443406016, 0.32499843230471015, 0.28529605525545776]);
  });

  it('draws unit values in [0, 1)', () => {
    for (const value of draw(7, 10000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('draws uniform values inside the requested range and fills it', () => {
    const random = createSeededRandom(99);
    const values = Array.from({ length: 10000 }, () => random.nextUniform(-3, 5));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-3);
    expect(Math.max(...values)).toBeLessThan(5);
    // A range this size with 10000 draws leaves no gap wider than 0.1 at either end.
    expect(Math.min(...values)).toBeLessThan(-2.9);
    expect(Math.max(...values)).toBeGreaterThan(4.9);
  });

  it('draws Gaussian values with mean near 0 and standard deviation near 1', () => {
    const random = createSeededRandom(2026);
    const sampleCount = 100000;
    const values = Array.from({ length: sampleCount }, () => random.nextGaussian(0, 1));
    const meanValue = values.reduce((sum, value) => sum + value, 0) / sampleCount;
    const varianceValue =
      values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / (sampleCount - 1);
    // Standard error of the mean is 1/sqrt(100000) = 0.0032; the bound is about six of them.
    expect(Math.abs(meanValue)).toBeLessThan(0.02);
    expect(Math.abs(Math.sqrt(varianceValue) - 1)).toBeLessThan(0.02);
    // A normal distribution has 95% of its mass within 1.96 standard deviations. This
    // catches a wrong transform that still has the right mean and variance.
    const insideCount = values.filter((value) => Math.abs(value) < 1.96).length;
    expect(Math.abs(insideCount / sampleCount - 0.95)).toBeLessThan(0.005);
  });

  it('scales and shifts Gaussian draws by the mean and standard deviation', () => {
    const random = createSeededRandom(5);
    const sampleCount = 50000;
    const values = Array.from({ length: sampleCount }, () => random.nextGaussian(10, 3));
    const meanValue = values.reduce((sum, value) => sum + value, 0) / sampleCount;
    const varianceValue =
      values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / (sampleCount - 1);
    expect(Math.abs(meanValue - 10)).toBeLessThan(0.1);
    expect(Math.abs(Math.sqrt(varianceValue) - 3)).toBeLessThan(0.06);
  });

  it('rejects a seed that is not an integer', () => {
    expect(() => createSeededRandom(1.5)).toThrow(RangeError);
    expect(() => createSeededRandom(Number.NaN)).toThrow(RangeError);
  });
});
