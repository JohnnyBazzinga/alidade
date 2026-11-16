// Seeded random source for statistical tests (Req 8.8, testing.md: "Statistical tests use a
// fixed seed passed in as an argument"). @alidade/core itself generates no randomness
// (Req 11.2); this file is test code and no source file imports it.
//
// The generator is mulberry32. Draws are dimensionless: callers apply the unit, for example
// `nextGaussian(0, azimuthSigmaRad)`.

export interface SeededRandom {
  /** Uniform draw in [0, 1). */
  nextUnit(): number;
  /** Uniform draw in [lowerBound, upperBound). */
  nextUniform(lowerBound: number, upperBound: number): number;
  /** Normal draw with the given mean and standard deviation (Box-Muller). */
  nextGaussian(meanValue: number, sigmaValue: number): number;
}

/** `seed` must be a finite integer; it is reduced to an unsigned 32-bit value. */
export function createSeededRandom(seed: number): SeededRandom {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`seed must be an integer, received ${seed}`);
  }
  let state = seed >>> 0;

  function nextUnit(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  function nextUniform(lowerBound: number, upperBound: number): number {
    return lowerBound + (upperBound - lowerBound) * nextUnit();
  }

  function nextGaussian(meanValue: number, sigmaValue: number): number {
    // 1 - u is in (0, 1], so the logarithm is finite.
    const radiusUnit = 1 - nextUnit();
    const phaseUnit = nextUnit();
    const standardNormal = Math.sqrt(-2 * Math.log(radiusUnit)) * Math.cos(2 * Math.PI * phaseUnit);
    return meanValue + sigmaValue * standardNormal;
  }

  return { nextUnit, nextUniform, nextGaussian };
}
