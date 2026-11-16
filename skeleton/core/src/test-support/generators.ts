// Shared fast-check generators. Each one states the domain it draws from and what it excludes
// (testing.md rule 4). A degenerate case that a generator excludes has an example test of its
// own, named below.
//
// Spread. `fc.double({ min, max })` is not uniform: doubles are dense near zero and fast-check
// biases further toward zero and the ends, so a plain double over [0, 2π) puts about 90% of its
// draws below 0.1. Every generator of a continuous quantity here therefore mixes those
// edge-biased draws (they supply 0, tiny values and the range ends) with unbiased uniform draws
// over the real domain. `generators.test.ts` checks the spread.

import fc from 'fast-check';
import { TWO_PI_RAD } from '../angle';
import {
  MAX_AZIMUTH_SIGMA_RAD,
  MAX_POSITION_ACCURACY_M,
  MIN_AZIMUTH_SIGMA_RAD,
  type Bearing,
} from '../observation';
import {
  EARTH_RADIUS_M,
  MAX_SUPPORTED_LAT_RAD,
  destinationPosition,
  isSupportedPosition,
  type Position,
} from '../position';
import { unwrapOk } from './result-helpers';

const FRACTION_STEPS = 2 ** 52;

/** An unbiased fraction in [0, 1) on a grid of 2^52 steps. */
const unitFraction: fc.Arbitrary<number> = fc
  .noBias(fc.integer({ min: 0, max: FRACTION_STEPS - 1 }))
  .map((step) => step / FRACTION_STEPS);

/**
 * An unbiased uniform draw from [lowerBound, upperBound).
 *
 * Includes: every part of the range with equal probability. Excludes: the upper bound, and
 * (by being unbiased) any special treatment of 0 or the ends; pair it with an edge-biased
 * generator when the ends matter.
 */
export function uniformBetween(lowerBound: number, upperBound: number): fc.Arbitrary<number> {
  return unitFraction
    .map((fraction) => lowerBound + (upperBound - lowerBound) * fraction)
    .filter((value) => value < upperBound);
}

/**
 * An unbiased draw whose base-10 logarithm is uniform on [log10(lowerBound), log10(upperBound)).
 * Every decade in the range gets the same share of the draws. Both bounds must be positive.
 */
export function logUniformBetween(lowerBound: number, upperBound: number): fc.Arbitrary<number> {
  return uniformBetween(Math.log10(lowerBound), Math.log10(upperBound)).map(
    (exponent) => 10 ** exponent,
  );
}

/**
 * Any angle with |x| ≤ 1e6 rad, in radians.
 *
 * Draws: edge-biased doubles (±0, subnormals, the range ends), unbiased uniform over
 * [-1e6, 1e6], and unbiased uniform over [-4π, 4π] so that the wrap boundaries at ±π and ±2π
 * are crossed often.
 * Excludes: NaN and ±Infinity (example tests of `invalid_number` cover them) and magnitudes
 * above 1e6 (the property for Req 1.1 draws from the whole finite range separately).
 */
export const finiteAngle: fc.Arbitrary<number> = fc.oneof(
  fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  uniformBetween(-1e6, 1e6),
  uniformBetween(-4 * Math.PI, 4 * Math.PI),
);

/**
 * An azimuth in [0, 2π) rad, clockwise from true north.
 *
 * Draws: edge-biased doubles (0, tiny values, values just below 2π) and unbiased uniform over
 * [0, 2π). Excludes 2π itself, NaN and ±Infinity.
 */
export const azimuth: fc.Arbitrary<number> = fc.oneof(
  { weight: 1, arbitrary: fc.double({ min: 0, max: TWO_PI_RAD, maxExcluded: true, noNaN: true }) },
  { weight: 4, arbitrary: uniformBetween(0, TWO_PI_RAD) },
);

/**
 * A non-empty list of 1 to 20 angles that all lie within π/4 of one common direction.
 *
 * The common direction is an `azimuth` and each angle is that direction plus an offset drawn
 * from [-π/4, π/4] (edge-biased and unbiased uniform draws). The angles themselves are not
 * wrapped, so they range over [-π/4, 2π + π/4]. Because every offset is within π/4, every unit
 * vector has a component of at least cos(π/4) ≈ 0.707 along the common direction, so the mean
 * resultant length is at least 0.707 and the circular mean is always defined.
 *
 * Excludes: lists with a spread wider than π/2 and the undefined-mean case; example tests
 * cover `undefined_mean`.
 */
export const clusteredAngles: fc.Arbitrary<number[]> = fc
  .tuple(
    azimuth,
    fc.array(
      fc.oneof(
        fc.double({ min: -Math.PI / 4, max: Math.PI / 4, noNaN: true }),
        uniformBetween(-Math.PI / 4, Math.PI / 4),
        uniformBetween(-Math.PI / 4, Math.PI / 4),
      ),
      { minLength: 1, maxLength: 20 },
    ),
  )
  .map(([commonDirectionRad, offsetsRad]) =>
    offsetsRad.map((offsetRad) => commonDirectionRad + offsetRad),
  );

/**
 * A Supported position: latitude in [-89°, 89°] and longitude in (-π, π].
 *
 * Draws: edge-biased doubles (the equator, the 89° limits, longitude π) and unbiased uniform
 * over the whole range, which covers both sides of the ±180° meridian and the high latitudes.
 * Excludes: positions within 1° of a pole, longitude -π (the same meridian as π, which the
 * range (-π, π] represents as π), NaN and ±Infinity. Example tests of `unsupported_position`
 * cover the excluded positions.
 */
export const supportedPosition: fc.Arbitrary<Position> = fc.record({
  latRad: fc.oneof(
    fc.double({ min: -MAX_SUPPORTED_LAT_RAD, max: MAX_SUPPORTED_LAT_RAD, noNaN: true }),
    uniformBetween(-MAX_SUPPORTED_LAT_RAD, MAX_SUPPORTED_LAT_RAD),
    uniformBetween(-MAX_SUPPORTED_LAT_RAD, MAX_SUPPORTED_LAT_RAD),
  ),
  lonRad: fc.oneof(
    fc.double({ min: -Math.PI, max: Math.PI, minExcluded: true, noNaN: true }),
    // π - u for u in [0, 2π) is uniform over (-π, π].
    uniformBetween(0, TWO_PI_RAD).map((offsetRad) => Math.PI - offsetRad),
    uniformBetween(0, TWO_PI_RAD).map((offsetRad) => Math.PI - offsetRad),
  ),
});

/**
 * A valid Bearing (Req 4.1, 4.2).
 *
 * Draws: a non-empty id of 1 to 16 printable ASCII characters; a Supported observer
 * (`supportedPosition`); a position accuracy in [0, 10 000] m (edge-biased, so 0 and 10 000 are
 * drawn, and unbiased uniform); a finite time (integer milliseconds from 1970 to about 2100, or
 * any finite double up to ±1.8e308); an `azimuth` in [0, 2π); an azimuth 1-sigma in
 * [0.01°, 45°] (edge-biased, so both ends are drawn, and unbiased uniform).
 * Excludes: everything `validateBearing` rejects. Example tests cover each rejection.
 */
export const validBearing: fc.Arbitrary<Bearing> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 16 }),
  observer: supportedPosition,
  positionAccuracyM: fc.oneof(
    fc.double({ min: 0, max: MAX_POSITION_ACCURACY_M, noNaN: true }),
    uniformBetween(0, MAX_POSITION_ACCURACY_M),
  ),
  timeUtcMs: fc.oneof(
    fc.integer({ min: 0, max: 4_102_444_800_000 }),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
  ),
  azimuthRad: azimuth,
  azimuthSigmaRad: fc.oneof(
    fc.double({ min: MIN_AZIMUTH_SIGMA_RAD, max: MAX_AZIMUTH_SIGMA_RAD, noNaN: true }),
    uniformBetween(MIN_AZIMUTH_SIGMA_RAD, MAX_AZIMUTH_SIGMA_RAD),
  ),
});

/** An observer, the true target it sights, and a Local plane origin. All Supported positions. */
export interface BearingGeometry {
  readonly observer: Position;
  readonly target: Position;
  readonly origin: Position;
}

/** How far inside the 89° Supported latitude limit a candidate target must lie (Req 6.5, 6.6). */
export const TARGET_LIMIT_MARGIN_M = 10;

/** A Supported position 10 m to 10 km inside the 89° latitude limit, in either hemisphere. */
const targetNearLimit: fc.Arbitrary<Position> = fc
  .tuple(
    logUniformBetween(TARGET_LIMIT_MARGIN_M, 10_000),
    fc.boolean(),
    uniformBetween(0, TWO_PI_RAD).map((offsetRad) => Math.PI - offsetRad),
  )
  .map(([marginM, isNorth, lonRad]) => {
    const latRad = MAX_SUPPORTED_LAT_RAD - marginM / EARTH_RADIUS_M;
    return { latRad: isNorth ? latRad : -latRad, lonRad };
  });

/**
 * An observer and a target between 50 m and 200 km apart, and a Local plane origin near the
 * target (Req 6.5, 6.6).
 *
 * The target is a `supportedPosition` (weight 3) or, so that the edge of the domain is reached on
 * every run, a target 10 m to 10 km inside the 89° limit of either hemisphere, its distance from
 * the limit drawn log-uniformly (weight 1). The observer is reached from the target along an
 * `azimuth` at a distance drawn log-uniformly from 50 m to 200 km. The origin is the target
 * itself or is reached from it along an `azimuth` at a distance drawn from one of three bands,
 * so every run exercises each branch of the partial derivatives:
 * - 0 m, the candidate at the origin, where the tangent-plane limit of design D16 is used
 *   (weight 1);
 * - 1e-9 m to 1e-3 m, the polar chain rule just above the projection's collapse (weight 1);
 * - 1e-3 m to 1000 km, the polar chain rule farther out (weight 2).
 *
 * Excludes, by discarding the draw:
 * - targets less than 10 m inside the 89° latitude limit (Req 6.5, 6.6). Within that band the
 *   1 m finite-difference step, or the rounding of the plane round trip (about 1e-7 m there),
 *   can leave the Supported region, where the model must fail. Example tests in
 *   `bearing-model.test.ts` cover the excluded band: `evaluate` returns `unsupported_position`;
 * - observers or origins that are not Supported positions. The 10 m margin applies to the target
 *   only, so an observer may lie anywhere up to the limit; observers within 1 km of it are drawn
 *   on every run.
 */
export const bearingGeometry: fc.Arbitrary<BearingGeometry> = fc
  .tuple(
    fc.oneof(
      { weight: 3, arbitrary: supportedPosition },
      { weight: 1, arbitrary: targetNearLimit },
    ),
    azimuth,
    logUniformBetween(50, 2e5),
    azimuth,
    fc.oneof(
      { weight: 1, arbitrary: fc.constant(0) },
      { weight: 1, arbitrary: logUniformBetween(1e-9, 1e-3) },
      { weight: 2, arbitrary: logUniformBetween(1e-3, 1e6) },
    ),
  )
  .filter(
    ([target]) =>
      (MAX_SUPPORTED_LAT_RAD - Math.abs(target.latRad)) * EARTH_RADIUS_M >= TARGET_LIMIT_MARGIN_M,
  )
  .map(([target, observerAzimuthRad, rangeM, originAzimuthRad, originOffsetM]) => ({
    target,
    observer: unwrapOk(destinationPosition(target, observerAzimuthRad, rangeM)),
    origin: unwrapOk(destinationPosition(target, originAzimuthRad, originOffsetM)),
  }))
  .filter(({ observer, origin }) => isSupportedPosition(observer) && isSupportedPosition(origin));
