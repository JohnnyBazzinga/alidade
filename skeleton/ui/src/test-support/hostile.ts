// Hostile but type-correct inputs for P-2.6 (Req 2.6, design §8 `hostileInput`). Any double for a
// `number`: `NaN`, `±Infinity`, `±0`, subnormals, `±MAX_VALUE`, the doubles just either side of
// every limit of the package, and huge finite values (|x| from 1e6 to 1e308, log-uniform, and the
// counts and sizes at which a loop or a list becomes too long); negative and zero sizes; `null`
// for every nullable field. The huge finite values are drawn often on purpose: a finite number
// that passes `Number.isFinite` and then drives a loop or an allocation is the bug a NaN does
// not find (the panel's tick length, found by the deep run of checkpoint 26, design D30).
// Not covered, because the static type would be a lie: values cast with `as` to a type they do
// not have, and objects whose property reads throw.

import fc from 'fast-check';

const DEG = Math.PI / 180;
const T = 1_790_000_000_000;

/** The limits of the package, and the doubles just either side of each. */
const LIMITS = [
  0.01 * DEG, // least fovSigmaRad
  75 * DEG,
  79 * DEG,
  80 * DEG, // MAX_RAY_OFFSET_RAD, maxMarkAltitudeRad
  150 * DEG,
  Math.PI / 2,
  Math.PI,
  2 * Math.PI,
  1e-12,
  1e-9, // screen-angle tolerance and pixel tolerance
  1e-6,
  1,
  0.01, // 1 % aspect tolerance
  16, // least ellipse vertex count
  64,
  4096,
  8192,
  100,
  500_000, // longest map line
  1000, // coarse-location rounding
  2000,
  T,
  60_000, // MAX_PANEL_TICK_MS
  3_600_000, // MAX_SIMULATOR_ADVANCE_MS
  100_000, // largest vertex and segment count
  10 * 365.25 * 86_400_000, // MAX_PANEL_ELAPSED_MS
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
 * often. Weights: 3 special, 2 huge finite, 1 any double, 1 in [-10, 10], 1 near the scripts'
 * time (of 8): at least a quarter of the draws are finite with |x| ≥ 1e6.
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

export function hostileNullable(): fc.Arbitrary<number | null> {
  return fc.oneof(fc.constant(null), hostileNumber());
}

/** A size in pixels: any hostile double, with zero and negative values drawn often. */
export function hostileSizePx(): fc.Arbitrary<number> {
  return fc.oneof(
    hostileNumber(),
    fc.constantFrom(0, -0, -1, -64, 1, 64, 4096, 8192),
    fc.double({ min: -100, max: 9000 }),
  );
}

export function hostilePixelPoint(): fc.Arbitrary<{ xPx: number; yPx: number }> {
  return fc.record({ xPx: hostileNumber(), yPx: hostileNumber() });
}

export function hostilePixelSize(): fc.Arbitrary<{ widthPx: number; heightPx: number }> {
  return fc.record({ widthPx: hostileSizePx(), heightPx: hostileSizePx() });
}

export function hostileSourceSize(): fc.Arbitrary<{
  widthSourcePx: number;
  heightSourcePx: number;
}> {
  return fc.record({ widthSourcePx: hostileSizePx(), heightSourcePx: hostileSizePx() });
}

export function hostileRayOffset(): fc.Arbitrary<{ rightRad: number; upRad: number }> {
  return fc.record({ rightRad: hostileNumber(), upRad: hostileNumber() });
}

export function hostileCalibration(): fc.Arbitrary<{
  fovRad: number;
  fovAxis: 'width' | 'height' | 'diagonal';
  fovSigmaRad: number;
  imageWidthSourcePx: number;
  imageHeightSourcePx: number;
}> {
  return fc.record({
    fovRad: hostileNumber(),
    fovAxis: fc.constantFrom('width' as const, 'height' as const, 'diagonal' as const),
    fovSigmaRad: hostileNumber(),
    imageWidthSourcePx: hostileSizePx(),
    imageHeightSourcePx: hostileSizePx(),
  });
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
