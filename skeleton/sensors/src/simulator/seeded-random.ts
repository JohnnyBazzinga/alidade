// A small seeded random source for the Simulator (design D17). `sfc32` (Chris Doty-Humphrey's
// Small Fast Counting generator, 32-bit variant) gives uniform integers; uniform doubles take 53
// bits from two outputs; normal draws use the Box–Muller transform. Writing this follows the
// tech.md rule against a dependency for under 30 lines.
//
// Determinism: the integer stream is exact on every engine. The normal draws use `Math.log`,
// `Math.sqrt` and `Math.cos`, which an engine may round differently in the last bit, so the
// Simulator promises identical output on one engine only (Req 12.4).

const TWO_POW_26 = 2 ** 26;
const TWO_POW_53 = 2 ** 53;

/** A seeded stream. Each call advances it. */
export interface SeededRandom {
  /** An integer in [0, 2³²). */
  nextUint32(): number;
  /** A double in [0, 1), with 53 random bits. */
  uniform(): number;
  /** A draw from the standard normal distribution: one Box–Muller value per call. */
  normal(): number;
}

/**
 * A stream from a seed. The caller validates the seed as an integer in [0, 2³²) (the Simulator
 * does so, design §7.12); `>>> 0` here only fixes the representation.
 */
export function createSeededRandom(seed: number): SeededRandom {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed >>> 0;

  const nextUint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Discard the first outputs so that nearby seeds give unrelated streams.
  for (let i = 0; i < 15; i += 1) nextUint32();

  const uniform = (): number => {
    const high = nextUint32() >>> 5; // 27 bits
    const low = nextUint32() >>> 6; // 26 bits
    return (high * TWO_POW_26 + low) / TWO_POW_53;
  };

  const normal = (): number => {
    const u1 = 1 - uniform(); // in (0, 1], so the logarithm is finite
    const u2 = uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  return { nextUint32, uniform, normal };
}
