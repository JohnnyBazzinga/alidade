// Hostile but type-correct inputs for P-2.6 (Req 2.6, design §11 `hostile*`). Copied from UI's
// test support (UI D20: test support is not exported across packages), with the limits of this
// package. Any double for a `number`: `NaN`, `±Infinity`, `±0`, subnormals, `±MAX_VALUE`, the
// doubles just either side of every limit of `NoniusParameters`, and huge finite values (|x| from
// 1e6 to 1e308, log-uniform, and the counts and sizes at which a loop or a list becomes too
// long). Strings of 0 to 10 000 characters of the full Basic Multilingual Plane, lone surrogates
// and control characters included.
// Not covered, because the static type would be a lie: values cast with `as` to a type they do
// not have, and objects whose property reads throw.

import fc from 'fast-check';

const T = 1_790_000_000_000;

/**
 * The limits of the package, and the doubles just either side of each: the default values of
 * `NoniusParameters` (Req 14.1) and the bounds `checkParameters` compares with (Req 14.3). They
 * are copied here as plain numbers on purpose: this file must not import the code whose limits
 * it attacks. Angles are in radians (degrees written as `d * Math.PI / 180`).
 */
const DEG = Math.PI / 180;
export const LIMITS: readonly number[] = [
  946_684_800_000, // SUN_MODEL_START_UTC_MS
  2_524_608_000_000, // SUN_MODEL_END_UTC_MS
  5 * DEG, // MIN_SIGHT_ALTITUDE_RAD
  80 * DEG, // MAX_SIGHT_ALTITUDE_RAD
  0.5 * DEG, // AIM_SIGMA_RAD; singular geometry
  0.1, // REFRACTION_SIGMA_FRACTION
  30 * DEG, // SUN_SIDE_TOLERANCE_RAD
  9, // CROSSING_COST_MARGIN
  1000, // SAME_FIX_DISTANCE_M
  2_000_000, // MAX_FIX_SEMI_MAJOR_95_M
  1_000_000, // PLANE_LIMIT_M
  1, // RECENTRE_TOLERANCE_M
  4, // MAX_RECENTRE_ROUNDS
  0.01 * DEG, // SENSITIVITY_STEP_RAD
  10 * DEG, // MAX_INDEX_ERROR_RAD
  604_800_000, // INDEX_ERROR_OLD_MS
  (1.8 / 60) * DEG, // SUN_ALTITUDE_SIGMA_RAD
  24, // MAX_SIGHTS
  7_200_000, // FIRST_WAIT_MS
  40 * DEG, // ADVICE_TURN_RAD
  300_000, // ADVICE_SCAN_STEP_MS
  43_200_000, // ADVICE_SCAN_HORIZON_MS
  600_000, // BEST_TIME_STEP_MS
  86_400_000, // BEST_TIME_HORIZON_MS
  1.5, // FAIR_ELLIPSE_RATIO
  3, // LONG_ELLIPSE_RATIO; SIMULATION_TAP_SIGMA_PX
  2, // CIRCLE_ARC_HALF_LENGTH_FACTOR
  0.25 * DEG, // CIRCLE_ARC_STEP_RAD
  10_000, // LOCATION_COARSE_LIMIT_M
  5, // SIMULATION_LOCATION_ACCURACY_M
  45 * DEG, // largest MAX_INDEX_ERROR_RAD; largest sigma
  0.01 * DEG, // least sigma
  90 * DEG,
  64, // largest MAX_SIGHTS
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
