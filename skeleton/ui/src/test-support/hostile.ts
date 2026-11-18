// Hostile but type-correct inputs for P-2.6 (Req 2.6, design §8 `hostileInput`). Any double for a
// `number`: `NaN`, `±Infinity`, `±0`, subnormals, `±MAX_VALUE`, and the doubles just either side
// of every limit of the package; negative and zero sizes; `null` for every nullable field.
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
];

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

/** Any double, with the special values and every limit's neighbours drawn often. */
export function hostileNumber(): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(...SPECIAL) },
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
