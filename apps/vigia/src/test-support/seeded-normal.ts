// A seeded source of standard normal draws for the statistical tests (testing.md: "a fixed seed
// passed in as an argument"; design §10, P-17.9). Test support, not exported. The generator is a
// 32-bit integer generator (mulberry32) with the Box-Muller transform. Draws are dimensionless:
// callers apply the unit, for example `HEADING_SIGMA_RAD * normal.next()`.

export interface SeededNormal {
  /** A standard normal draw (mean 0, standard deviation 1). Always finite. */
  next(): number;
  /** A uniform draw in [0, 1). */
  nextUnit(): number;
}

/** `seed` must be an integer; it is reduced to an unsigned 32-bit value. */
export function createSeededNormal(seed: number): SeededNormal {
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

  function next(): number {
    // 1 - u is in (0, 1], so the logarithm is finite.
    const radiusUnit = 1 - nextUnit();
    const phaseUnit = nextUnit();
    return Math.sqrt(-2 * Math.log(radiusUnit)) * Math.cos(2 * Math.PI * phaseUnit);
  }

  return { next, nextUnit };
}
