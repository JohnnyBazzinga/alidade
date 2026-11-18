// Hostile but type-correct inputs for P-11.8 (Req 11.8, design §8 `hostileInput`). Any double for
// a `number` — NaN, ±Infinity, ±0, subnormals, ±MAX_VALUE and the values just past every limit of
// the package — `null` for every nullable field, arrays from empty to 300 items. Not covered,
// because the static type would be a lie: values cast with `as` to a type they do not have, and
// objects whose property reads throw.

import fc from 'fast-check';
import type { FrameResetCause, FrameResetEvent } from '../frame-reset';
import type { OrientationSample } from '../orientation-sample';
import type { PositionFix } from '../position-fix';
import type { DeviceRotation } from '../rotation';
import type { SightingWindow } from '../sighting-window';
import type { YawReference } from '../yaw-reference';

const DEG = Math.PI / 180;
const T = 1_790_000_000_000;
const WMM_FROM = Date.UTC(2025, 0, 1);
const WMM_UNTIL = Date.UTC(2030, 0, 1);

/** The limits of the package, and the doubles just either side of each. */
const LIMITS = [
  80 * DEG,
  30 * DEG,
  45 * DEG,
  0.01 * DEG,
  Math.PI / 2,
  Math.PI,
  2 * Math.PI,
  1e-6,
  1e-12,
  2000,
  10_000,
  WMM_FROM,
  WMM_UNTIL,
  3_600_000,
  T,
];

function neighbours(x: number): number[] {
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

export function hostileRotation(): fc.Arbitrary<DeviceRotation> {
  return fc.record({
    alphaRad: hostileNumber(),
    betaRad: hostileNumber(),
    gammaRad: hostileNumber(),
  });
}

const CAUSES: readonly FrameResetCause[] = [
  'hidden',
  'blur',
  'pagehide',
  'restart',
  'frame_change',
];

export function hostileSample(): fc.Arbitrary<OrientationSample> {
  return fc.record({
    timeUtcMs: fc.oneof(hostileNumber(), fc.integer({ min: T - 3000, max: T + 10 })),
    frame: fc.constantFrom('absolute' as const, 'relative' as const),
    rotation: fc.oneof(
      hostileRotation(),
      fc.record({
        alphaRad: fc.double({ min: 0, max: 6 }),
        betaRad: fc.double({ min: -3, max: 3 }),
        gammaRad: fc.double({ min: -1.5, max: 1.5 }),
      }),
    ),
    screenAngleRad: hostileNullable(),
    magneticHeadingRad: hostileNullable(),
    compassAccuracyRad: hostileNullable(),
  });
}

export function hostileSamples(): fc.Arbitrary<OrientationSample[]> {
  return fc.oneof(
    fc.constant<OrientationSample[]>([]),
    fc.array(hostileSample(), { maxLength: 20 }),
    // Many samples at the same instant, and a long list.
    hostileSample().map((s) => Array.from({ length: 300 }, () => s)),
  );
}

export function hostileResets(): fc.Arbitrary<FrameResetEvent[]> {
  return fc.array(fc.record({ timeUtcMs: hostileNumber(), cause: fc.constantFrom(...CAUSES) }), {
    maxLength: 5,
  });
}

export function hostileWindow(): fc.Arbitrary<SightingWindow> {
  return fc.oneof(
    fc.record({
      endUtcMs: hostileNumber(),
      windowLengthMs: hostileNumber(),
      minSampleCount: hostileNumber(),
      sampleStalenessMs: hostileNumber(),
    }),
    // A plausible window, so that the later steps are reached too.
    fc.record({
      endUtcMs: fc.constant(T),
      windowLengthMs: fc.constantFrom(1000, 3000),
      minSampleCount: fc.constantFrom(1, 2),
      sampleStalenessMs: fc.constantFrom(500, Number.MAX_VALUE),
    }),
  );
}

export function hostileYawReference(): fc.Arbitrary<YawReference | undefined> {
  return fc.option(
    fc.record({
      offsetRad: hostileNumber(),
      sigmaRad: hostileNumber(),
      northReference: fc.constantFrom('true' as const, 'magnetic' as const),
      frame: fc.constantFrom('absolute' as const, 'relative' as const),
      establishedUtcMs: fc.oneof(hostileNumber(), fc.constant(T)),
    }),
    { nil: undefined },
  );
}

export function hostilePosition(): fc.Arbitrary<{ latRad: number; lonRad: number }> {
  return fc.oneof(
    fc.record({ latRad: hostileNumber(), lonRad: hostileNumber() }),
    fc.record({
      latRad: fc.double({ min: -1.55, max: 1.55 }),
      lonRad: fc.double({ min: -3.1, max: 3.1 }),
    }),
  );
}

export function hostileFix(): fc.Arbitrary<PositionFix> {
  return fc.record({
    position: hostilePosition(),
    reportedAccuracyM: hostileNumber(),
    sigmaM: hostileNumber(),
    timeUtcMs: fc.oneof(hostileNumber(), fc.constant(T)),
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
