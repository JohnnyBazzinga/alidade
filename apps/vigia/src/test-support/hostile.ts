// Hostile but type-correct inputs for P-2.6 (Req 2.6, design §11 `hostile*`). Copied from UI's
// test support (UI D20: test support is not exported across packages), with the limits of this
// package. Any double for a `number`: `NaN`, `±Infinity`, `±0`, subnormals, `±MAX_VALUE`, the
// doubles just either side of every limit of `VigiaParameters`, and huge finite values (|x| from
// 1e6 to 1e308, log-uniform, and the counts and sizes at which a loop or a list becomes too
// long). Strings of 0 to 10 000 characters of the full Basic Multilingual Plane, lone surrogates
// and control characters included.
// Not covered, because the static type would be a lie: values cast with `as` to a type they do
// not have, and objects whose property reads throw.

import fc from 'fast-check';

const T = 1_790_000_000_000;

/**
 * The limits of the package, and the doubles just either side of each: the default values of
 * `VigiaParameters` (Req 19.1) and the bounds the checks of `checkParameters` compare with
 * (design §7.20: 896 characters, `CODE_LENGTH + 'https://a.b/#'.length` = 63), and the ranges of
 * the sighting code (design §8.1). They are copied here as plain numbers on purpose: this file
 * must not import the code whose limits it attacks.
 */
export const LIMITS: readonly number[] = [
  1_800_000, // maxIncidentAgeMs, 30 min
  86_400_000, // incidentRetentionMs, 24 h
  120_000, // clockSkewToleranceMs, 2 min
  32, // maxSightingsPerIncident
  50_000, // plausibleRangeM
  3, // longEllipseRatio; simulationTapSigmaPx
  1.5, // fairEllipseRatio
  2048, // maxCodeLengthChars
  160, // maxLinkLengthChars
  900, // maxEmergencyTextChars
  896, // least maxEmergencyTextChars: the worst case of the Emergency text
  731, // the worst case of the Emergency text with four or more Sightings
  63, // least maxLinkLengthChars
  50, // CODE_LENGTH
  300, // adviceMinDistanceM
  60_000, // expiryCheckIntervalMs
  16, // maxFormerIncidentIds
  0.1, // windGridDeg
  10_800_000, // maxWindAgeMs, 3 h
  1_000_000, // maxResponseBytes
  10_000, // requestTimeoutMs; largest position accuracy
  1, // least count; least ratio
  1_767_225_600_000, // the epoch of the code
  Math.PI / 2,
  Math.PI,
  2 * Math.PI,
  1e-12,
  1e-6,
  T,
];

/** Counts and sizes at which a loop or a list goes wrong, and their neighbours. */
const HUGE = [2 ** 31, 2 ** 32, 2 ** 53, 1e9, 1e12, 1e15, 1e21, 1e100, 1e300];

/** `x`, the doubles next to it and their negatives. */
export function neighbours(x: number): number[] {
  const view = new DataView(new ArrayBuffer(8));
  const step = (value: number, direction: 1n | -1n): number => {
    view.setFloat64(0, value);
    view.setBigInt64(0, view.getBigInt64(0) + direction);
    return view.getFloat64(0);
  };
  return [x, step(x, 1n), step(x, -1n), -x, step(-x, 1n), step(-x, -1n)];
}

const SPECIAL = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  0,
  -0,
  Number.MIN_VALUE,
  -Number.MIN_VALUE,
  2.2250738585072014e-308, // smallest normal
  Number.MAX_VALUE,
  -Number.MAX_VALUE,
  Number.EPSILON,
  1,
  -1,
  ...LIMITS.flatMap(neighbours),
];

/**
 * A finite number of magnitude 1e6 to 1e308 with either sign: half the time log-uniform over that
 * range, half the time one of `HUGE` or a neighbour of it.
 */
export function hugeFinite(): fc.Arbitrary<number> {
  return fc.oneof(
    fc
      .tuple(fc.double({ min: 6, max: 308, noNaN: true }), fc.boolean())
      .map(([exponent, negative]) => (negative ? -1 : 1) * 10 ** exponent),
    fc.constantFrom(...HUGE.flatMap(neighbours)),
  );
}

/**
 * Any double, with the special values, every limit's neighbours and huge finite values drawn
 * often. Weights: 3 special, 2 huge finite, 1 any double, 1 in [-10, 10], 1 near the time of
 * the tests (of 8): at least a quarter of the draws are finite with |x| ≥ 1e6.
 */
export function hostileNumber(): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(...SPECIAL) },
    { weight: 2, arbitrary: hugeFinite() },
    { weight: 1, arbitrary: fc.double() },
    { weight: 1, arbitrary: fc.double({ min: -10, max: 10 }) },
    { weight: 1, arbitrary: fc.double({ min: T - 100_000, max: T + 100_000 }) },
  );
}

/** A character of the Basic Multilingual Plane, any code unit 0 to 0xFFFF (lone surrogates too). */
function bmpChar(): fc.Arbitrary<string> {
  return fc.integer({ min: 0, max: 0xffff }).map((code) => String.fromCharCode(code));
}

/**
 * A string of 0 to 10 000 characters of the full BMP. Domain: 4 in 10 are 0 to 20 characters, 4
 * in 10 are 0 to 300, 2 in 10 are 5 000 to 10 000 characters made by repeating a short random
 * chunk (cheap to draw, and long enough to find a loop or a limit at 2 048 or 10 000).
 */
export function hostileString(): fc.Arbitrary<string> {
  const chars = (maxLength: number) => fc.array(bmpChar(), { maxLength }).map((cs) => cs.join(''));
  const long = fc
    .tuple(
      fc.array(bmpChar(), { minLength: 1, maxLength: 8 }),
      fc.integer({ min: 5000, max: 10_000 }),
    )
    .map(([chunk, length]) =>
      chunk
        .join('')
        .repeat(Math.ceil(length / chunk.length))
        .slice(0, length),
    );
  return fc.oneof(
    { weight: 4, arbitrary: chars(20) },
    { weight: 4, arbitrary: chars(300) },
    { weight: 2, arbitrary: long },
  );
}

/** Every number in a value is finite (functions are skipped). */
export function allFinite(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || value === null || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((child) => allFinite(child, seen));
}

/** A Result is total: a failure with a string reason, or a success whose numbers are all finite. */
export function isTotalResult(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false;
  const ok: unknown = Reflect.get(result, 'ok');
  if (ok === false) return typeof Reflect.get(result, 'reason') === 'string' && allFinite(result);
  if (ok === true) return allFinite(Reflect.get(result, 'value'));
  return false;
}
