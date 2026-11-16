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
import { TWO_PI_RAD, _wrapPi, _wrapTwoPi } from '../angle';
import type { LocalPoint } from '../local-plane';
import type { CovarianceEnM2, Ellipse, Fix } from '../measurement-model';
import {
  MAX_AZIMUTH_SIGMA_RAD,
  MAX_POSITION_ACCURACY_M,
  MIN_AZIMUTH_SIGMA_RAD,
  serialiseBearing,
  type Bearing,
} from '../observation';
import {
  EARTH_RADIUS_M,
  MAX_SUPPORTED_LAT_RAD,
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
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
 *   1 m finite-difference step can leave the Supported region, where the model must fail. The
 *   plane round trip is not the concern: with the atan2 destination latitude it moves a target
 *   near the limit by at most about 1.4e-9 m (measured over 258 000 targets 1e-6 m to 10 km
 *   inside it, none of which left the Supported region). Example tests in
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

// ---------------------------------------------------------------------------------------------
// Solver scenarios (tasks 12.6, 12.8 to 12.18). None of these generators calls the solver, and
// none filters on whether the solver succeeds: a property that uses them treats a solve failure
// as a test failure (design §8). Their domains are built by construction where possible; the few
// conditions that are filtered say so, and `generators.test.ts` measures their discard rates.
// ---------------------------------------------------------------------------------------------

const DEG = Math.PI / 180;

/**
 * How many draws each filter of the solver generators has seen and kept, for measuring discard
 * rates. Sampling a generator updates them; nothing else reads them.
 */
export const filterCounts = {
  crossingAngle: { seen: 0, kept: 0 },
  meridianSides: { seen: 0, kept: 0 },
  extraCrossingAngle: { seen: 0, kept: 0 },
  outlierDirectionGap: { seen: 0, kept: 0 },
};

/** A filter predicate that also counts what it sees and keeps. */
function counted<T>(
  counts: { seen: number; kept: number },
  predicate: (value: T) => boolean,
): (value: T) => boolean {
  return (value) => {
    counts.seen += 1;
    const keep = predicate(value);
    if (keep) counts.kept += 1;
    return keep;
  };
}

/** A set of bearings that all sight `target`. */
export interface SolverScenario {
  readonly target: Position;
  readonly observations: readonly Bearing[];
}

/** A `SolverScenario` with one deliberately wrong observation (Req 10.5). */
export interface OutlierScenario extends SolverScenario {
  readonly badId: string;
}

/** A `SolverScenario` and one more noise-free observation of the same target (Req 8.6). */
export interface ExtendedScenario extends SolverScenario {
  readonly extra: Bearing;
}

/**
 * The acute angle between two bearing lines (the Crossing angle of the glossary), computed here
 * without the bearing model so that a generator does not depend on the code under test.
 */
export function crossingAngleBetweenRad(firstAzimuthRad: number, secondAzimuthRad: number): number {
  const differenceRad = Math.abs(_wrapPi(firstAzimuthRad - secondAzimuthRad));
  return Math.min(differenceRad, Math.PI - differenceRad);
}

/** The largest Crossing angle over all pairs of `observations`. */
export function largestCrossingAngleRad(observations: readonly Bearing[]): number {
  let largestRad = 0;
  for (let i = 0; i < observations.length; i += 1) {
    for (let j = i + 1; j < observations.length; j += 1) {
      largestRad = Math.max(
        largestRad,
        crossingAngleBetweenRad(
          (observations[i] as Bearing).azimuthRad,
          (observations[j] as Bearing).azimuthRad,
        ),
      );
    }
  }
  return largestRad;
}

/**
 * The cross-track 1-sigma of an observation in metres (Req 7.4): its Effective sigma at the
 * target times the range, `hypot(sigma · range, accuracy)`, the range floored at 1 m as in the
 * Effective sigma. Computed here, not by the bearing model.
 */
export function crossTrackSigmaM(observation: Bearing, target: Position): number {
  const rangeM = Math.max(unwrapOk(greatCircleDistanceM(observation.observer, target)), 1);
  return Math.hypot(observation.azimuthSigmaRad * rangeM, observation.positionAccuracyM);
}

/** The largest over the smallest cross-track 1-sigma of `observations` (Req 7.4). */
export function crossTrackSigmaRatio(observations: readonly Bearing[], target: Position): number {
  const sigmasM = observations.map((observation) => crossTrackSigmaM(observation, target));
  return Math.max(...sigmasM) / Math.min(...sigmasM);
}

/** The largest gap between neighbouring directions around the full circle. */
export function largestDirectionGapRad(directionsRad: readonly number[]): number {
  const sorted = directionsRad
    .map((directionRad) => _wrapTwoPi(directionRad))
    .sort((a, b) => a - b);
  let largestGapRad = TWO_PI_RAD - ((sorted[sorted.length - 1] as number) - (sorted[0] as number));
  for (let index = 1; index < sorted.length; index += 1) {
    largestGapRad = Math.max(
      largestGapRad,
      (sorted[index] as number) - (sorted[index - 1] as number),
    );
  }
  return largestGapRad;
}

/** A fraction in [0, 1]: exactly 0 or 1 (weight 1 each) or unbiased in between (weight 4). */
const edgeFraction: fc.Arbitrary<number> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(0) },
  { weight: 1, arbitrary: fc.constant(1) },
  { weight: 4, arbitrary: unitFraction },
);

/** The point a fraction `fraction` of the way from `lower` to `upper` on a logarithmic scale. */
function logInterpolate(lower: number, upper: number, fraction: number): number {
  if (fraction <= 0) return lower;
  if (fraction >= 1) return upper;
  return lower * (upper / lower) ** fraction;
}

/** A latitude in [-limit, limit]: edge-biased (both limits and 0 drawn) and unbiased uniform. */
function latitudeUpTo(limitRad: number): fc.Arbitrary<number> {
  return fc.oneof(
    fc.double({ min: -limitRad, max: limitRad, noNaN: true }),
    uniformBetween(-limitRad, limitRad),
    uniformBetween(-limitRad, limitRad),
  );
}

/** A longitude in (-π, π]: edge-biased (π drawn) and unbiased uniform. */
const longitude: fc.Arbitrary<number> = fc.oneof(
  fc.double({ min: -Math.PI, max: Math.PI, minExcluded: true, noNaN: true }),
  uniformBetween(0, TWO_PI_RAD).map((offsetRad) => Math.PI - offsetRad),
  uniformBetween(0, TWO_PI_RAD).map((offsetRad) => Math.PI - offsetRad),
);

/** The largest target latitude of Req 7.4: 75°. */
export const SOLVABLE_MAX_LAT_RAD = 75 * DEG;
/** The largest ratio of cross-track 1-sigmas within a set (Req 7.4). */
export const MAX_CROSS_TRACK_RATIO = 1e3;
/**
 * The window of cross-track 1-sigmas is built 1 part in 1e9 narrower than 1e3, so that the
 * rounding of the realised ranges cannot carry a ratio drawn at the edge just over 1e3.
 */
const CROSS_TRACK_WINDOW_RATIO = MAX_CROSS_TRACK_RATIO * (1 - 1e-9);

/** The noise-free bearing of `target` from `observer`. */
function noiseFreeBearingFrom(
  observer: Position,
  target: Position,
  fields: { id: string; azimuthSigmaRad: number; positionAccuracyM: number; timeUtcMs: number },
): Bearing {
  return { ...fields, observer, azimuthRad: unwrapOk(initialAzimuthRad(observer, target)) };
}

interface Placement {
  readonly fromTargetRad: number;
  readonly rangeM: number;
  /** Where the observer's cross-track 1-sigma falls inside its window (see below). */
  readonly crossTrackFraction: number;
  /** How the cross-track 1-sigma is split between the azimuth sigma and the accuracy. */
  readonly splitFraction: number;
  readonly timeUtcMs: number;
}

const placement: fc.Arbitrary<Placement> = fc.record({
  fromTargetRad: azimuth,
  rangeM: logUniformBetween(500, 1e5),
  crossTrackFraction: edgeFraction,
  splitFraction: edgeFraction,
  timeUtcMs: fc.integer({ min: 0, max: 4_102_444_800_000 }),
});

/**
 * Observers placed around `target` whose cross-track 1-sigmas lie within a factor of 1e3, by
 * construction (Req 7.4).
 *
 * An observer at range r can have any cross-track 1-sigma c = hypot(σ·r, a) from σ_min·r to
 * hypot(σ_max·r, a_max), with σ in [0.01°, 45°] and a in [0, 10 000] m. A common lower bound W
 * is drawn log-uniformly over the values for which [W, 1e3·W] meets every observer's range;
 * that set is never empty here, because σ_min·r ≤ 17.5 m and hypot(σ_max·r, a_max) ≥ 10 km for
 * r in [500 m, 100 km]. Each c is then drawn log-uniformly from its observer's part of the
 * window, and split between σ·r and a, again log-uniformly over the split that keeps both valid.
 * Fractions of exactly 0 and 1 are drawn too, so W, c and the split reach their ends (σ_min,
 * σ_max, a = 0 and a = a_max all occur). Every set with a ratio up to 1e3 can be drawn.
 */
function observersAround(
  target: Position,
  ids: readonly string[],
  placements: readonly Placement[],
  windowFraction: number,
): Bearing[] {
  const observers = placements.map((entry) =>
    unwrapOk(destinationPosition(target, entry.fromTargetRad, entry.rangeM)),
  );
  const lowerBounds = placements.map((entry) => MIN_AZIMUTH_SIGMA_RAD * entry.rangeM);
  const upperBounds = placements.map((entry) =>
    Math.hypot(MAX_AZIMUTH_SIGMA_RAD * entry.rangeM, MAX_POSITION_ACCURACY_M),
  );
  const windowLow = Math.max(
    Math.min(...lowerBounds),
    Math.max(...lowerBounds) / CROSS_TRACK_WINDOW_RATIO,
  );
  const windowHigh = Math.min(...upperBounds);
  const window = logInterpolate(windowLow, windowHigh, windowFraction);

  return placements.map((entry, index) => {
    const crossTrackM = logInterpolate(
      Math.max(window, lowerBounds[index] as number),
      Math.min(window * CROSS_TRACK_WINDOW_RATIO, upperBounds[index] as number),
      entry.crossTrackFraction,
    );
    // σ·r ranges over [max(σ_min·r, sqrt(c² - a_max²)), min(σ_max·r, c)]; a follows.
    const angularPartM = logInterpolate(
      Math.max(
        MIN_AZIMUTH_SIGMA_RAD * entry.rangeM,
        Math.sqrt(Math.max(0, crossTrackM ** 2 - MAX_POSITION_ACCURACY_M ** 2)),
      ),
      Math.min(MAX_AZIMUTH_SIGMA_RAD * entry.rangeM, crossTrackM),
      entry.splitFraction,
    );
    const azimuthSigma = Math.min(
      Math.max(angularPartM / entry.rangeM, MIN_AZIMUTH_SIGMA_RAD),
      MAX_AZIMUTH_SIGMA_RAD,
    );
    const accuracyM = Math.min(
      Math.sqrt(Math.max(0, crossTrackM ** 2 - angularPartM ** 2)),
      MAX_POSITION_ACCURACY_M,
    );
    return noiseFreeBearingFrom(observers[index] as Position, target, {
      id: ids[index] as string,
      azimuthSigmaRad: azimuthSigma,
      positionAccuracyM: accuracyM,
      timeUtcMs: entry.timeUtcMs,
    });
  });
}

/**
 * Noise-free scenarios around targets from `targets`, with `minCount` to `maxCount` observers
 * (the Req 7.4 conditions). Filters only on the largest Crossing angle being at least 10°.
 */
function noiseFreeScenarios(
  targets: fc.Arbitrary<Position>,
  minCount: number,
  maxCount: number,
): fc.Arbitrary<SolverScenario> {
  return fc
    .tuple(targets, fc.integer({ min: minCount, max: maxCount }))
    .chain(([target, count]) =>
      fc
        .tuple(
          fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), {
            minLength: count,
            maxLength: count,
          }),
          fc.array(placement, { minLength: count, maxLength: count }),
          edgeFraction,
        )
        .map(([ids, placements, windowFraction]) => ({
          target,
          observations: observersAround(target, ids, placements, windowFraction),
        })),
    )
    .filter(
      counted(
        filterCounts.crossingAngle,
        (scenario: SolverScenario) => largestCrossingAngleRad(scenario.observations) >= 10 * DEG,
      ),
    );
}

/** A target as Req 7.4 allows: latitude within 75° of the equator, any longitude. */
const solvableTarget: fc.Arbitrary<Position> = fc.record({
  latRad: latitudeUpTo(SOLVABLE_MAX_LAT_RAD),
  lonRad: longitude,
});

/**
 * A noise-free observation set satisfying exactly the conditions of Req 7.4.
 *
 * Built by construction: a target with latitude in [-75°, 75°] and any longitude (edge-biased,
 * so ±75°, 0 and π are drawn); 2 to 12 observers, each reached from the target along an
 * `azimuth` at a distance drawn log-uniformly from 500 m to 100 km; distinct ids of 1 to 8
 * characters; azimuth sigmas and position accuracies whose cross-track 1-sigmas lie within a
 * factor of 1e3 (see `observersAround`); times from 1970 to about 2100; each azimuth the exact
 * initial azimuth from the observer to the target. Every observer is a Supported position by
 * construction (at most 75.9° from the equator).
 * Filtered: sets whose largest Crossing angle is below 10° are discarded. It never calls the
 * solver.
 */
export const solvableSet: fc.Arbitrary<SolverScenario> = noiseFreeScenarios(solvableTarget, 2, 12);

/** A standard normal draw, by Box-Muller from two unbiased fractions. */
const standardNormal: fc.Arbitrary<number> = fc
  .tuple(unitFraction, unitFraction)
  .map(
    ([radiusFraction, phaseFraction]) =>
      Math.sqrt(-2 * Math.log(1 - radiusFraction)) * Math.cos(2 * Math.PI * phaseFraction),
  );

/**
 * A `solvableSet` whose azimuths carry Gaussian noise: each azimuth plus its own
 * `azimuthSigmaRad` times a standard normal draw, wrapped to [0, 2π). It is the only solver
 * generator whose properties may discard sets the solver does not solve (design §8); a property
 * that does so says so and counts the discards.
 */
export const noisySolvableSet: fc.Arbitrary<SolverScenario> = solvableSet.chain((scenario) =>
  fc
    .array(standardNormal, {
      minLength: scenario.observations.length,
      maxLength: scenario.observations.length,
    })
    .map((noise) => ({
      target: scenario.target,
      observations: scenario.observations.map((observation, index) => ({
        ...observation,
        azimuthRad: _wrapTwoPi(
          observation.azimuthRad + observation.azimuthSigmaRad * (noise[index] as number),
        ),
      })),
    })),
);

/**
 * A `solvableSet` around a target within 1° of longitude of the ±180° meridian, kept only if it
 * has observers on both sides of the meridian (Req 9.7).
 *
 * Built by construction: the target's latitude as for `solvableSet` (within 75°); its longitude
 * 180° plus an offset drawn uniformly from [-1°, 1°], normalised to (-π, π]; the observers as
 * for `solvableSet`. Filtered: sets with no observer east of the meridian (longitude below -90°)
 * or none west of it (above 90°) are discarded, as well as those `solvableSet` discards.
 */
export const meridianSet: fc.Arbitrary<SolverScenario> = noiseFreeScenarios(
  fc
    .tuple(latitudeUpTo(SOLVABLE_MAX_LAT_RAD), uniformBetween(-1 * DEG, 1 * DEG))
    .map(([latRad, offsetRad]) => ({ latRad, lonRad: _wrapPi(Math.PI + offsetRad) })),
  2,
  12,
).filter(
  counted(
    filterCounts.meridianSides,
    (scenario: SolverScenario) =>
      scenario.observations.some((observation) => observation.observer.lonRad > Math.PI / 2) &&
      scenario.observations.some((observation) => observation.observer.lonRad < -Math.PI / 2),
  ),
);

/**
 * A `solvableSet` and one more noise-free observation of the same target that keeps the Req 7.4
 * conditions (Req 8.6).
 *
 * Built as a `solvableSet` of 3 to 12 observers, from which the last one drawn is held out as
 * the extra. The full set meets Req 7.4, and so does the extended set the property solves. The
 * cross-track ratio of the smaller set is at most that of the full set.
 * Filtered: draws whose smaller set has a largest Crossing angle below 10° are discarded.
 */
export const solvableSetWithExtra: fc.Arbitrary<ExtendedScenario> = noiseFreeScenarios(
  solvableTarget,
  3,
  12,
)
  .map((scenario) => ({
    target: scenario.target,
    observations: scenario.observations.slice(0, -1),
    extra: scenario.observations[scenario.observations.length - 1] as Bearing,
  }))
  .filter(
    counted(
      filterCounts.extraCrossingAngle,
      (scenario: ExtendedScenario) => largestCrossingAngleRad(scenario.observations) >= 10 * DEG,
    ),
  );

/**
 * The factors k in [0.5, 4] for which every observation of `observations`, with its azimuth
 * sigma and position accuracy multiplied by k, is still valid (Req 8.4). The range always
 * contains 1.
 */
export function validScaleRange(observations: readonly Bearing[]): {
  readonly lowest: number;
  readonly highest: number;
} {
  let lowest = 0.5;
  let highest = 4;
  for (const observation of observations) {
    lowest = Math.max(lowest, MIN_AZIMUTH_SIGMA_RAD / observation.azimuthSigmaRad);
    highest = Math.min(highest, MAX_AZIMUTH_SIGMA_RAD / observation.azimuthSigmaRad);
    if (observation.positionAccuracyM > 0) {
      highest = Math.min(highest, MAX_POSITION_ACCURACY_M / observation.positionAccuracyM);
    }
  }
  // A bound from a division can be one rounding step too far: σ · (σ_max / σ) may exceed σ_max
  // by one ulp. Step each bound inward by one ulp at a time until every product is valid.
  const scaledIsValid = (scale: number): boolean =>
    observations.every(
      (observation) =>
        observation.azimuthSigmaRad * scale >= MIN_AZIMUTH_SIGMA_RAD &&
        observation.azimuthSigmaRad * scale <= MAX_AZIMUTH_SIGMA_RAD &&
        observation.positionAccuracyM * scale <= MAX_POSITION_ACCURACY_M,
    );
  while (!scaledIsValid(highest)) highest *= 1 - Number.EPSILON;
  while (!scaledIsValid(lowest)) lowest *= 1 + Number.EPSILON;
  return { lowest, highest };
}

/**
 * A `solvableSet` and a factor k drawn from the factors that keep every scaled observation
 * valid (Req 8.4): uniform over that range, with both of its ends drawn too. Built by
 * construction; nothing is discarded beyond what `solvableSet` discards.
 */
export const solvableSetWithScale: fc.Arbitrary<{
  readonly scenario: SolverScenario;
  readonly scale: number;
}> = solvableSet.chain((scenario) => {
  const { lowest, highest } = validScaleRange(scenario.observations);
  return edgeFraction.map((fraction) => ({
    scenario,
    // The product keeps k within the range even at its ends.
    scale: Math.min(Math.max(lowest + (highest - lowest) * fraction, lowest), highest),
  }));
});

/** The largest target latitude of Req 10.5: 88°. */
export const OUTLIER_MAX_LAT_RAD = 88 * DEG;
/** The largest gap between neighbouring directions of Req 10.5: 60°. */
export const OUTLIER_MAX_DIRECTION_GAP_RAD = 60 * DEG;

/**
 * Directions for `count` observers around a point, with no gap greater than 60° between
 * neighbours around the full circle, by construction (Req 10.5).
 *
 * The gaps start as a uniform draw from the simplex of gap vectors that sum to 360°
 * (d_i = 360° · u_i / Σu), which reaches every arrangement. They are then blended with even
 * spacing, g = λ · 360°/count + (1 - λ) · d, which keeps the sum at 360°. The largest gap is
 * λ · 360°/count + (1 - λ) · max(d), at most 60° exactly when λ ≥ λ_min =
 * max(0, (max(d) - 60°) / (max(d) - 360°/count)); λ is drawn uniformly from [λ_min, 1], with
 * both ends drawn, so the largest gap ranges from even spacing (30° to 45°) up to the 60° limit,
 * and an arrangement that already fits can be drawn unchanged (λ = 0). The 60° is taken 1 part
 * in 1e12 smaller so that rounding cannot carry a gap over it. The first direction is a uniform
 * base. Nothing is discarded.
 */
function directionsFor(count: number): fc.Arbitrary<number[]> {
  const evenGapRad = TWO_PI_RAD / count;
  const maxGapRad = OUTLIER_MAX_DIRECTION_GAP_RAD * (1 - 1e-12);
  return fc
    .tuple(
      azimuth,
      // 1 - u is in (0, 1], so the gaps cannot all be zero.
      fc.array(
        unitFraction.map((fraction) => 1 - fraction),
        { minLength: count, maxLength: count },
      ),
      edgeFraction,
    )
    .map(([baseRad, weights, blendFraction]) => {
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const simplexGapsRad = weights.map((weight) => (TWO_PI_RAD * weight) / total);
      const largestRad = Math.max(...simplexGapsRad);
      const lowestBlend =
        largestRad > maxGapRad ? (largestRad - maxGapRad) / (largestRad - evenGapRad) : 0;
      const blend = lowestBlend + (1 - lowestBlend) * blendFraction;
      const directionsRad: number[] = [];
      let directionRad = baseRad;
      for (const simplexGapRad of simplexGapsRad) {
        directionsRad.push(directionRad);
        directionRad += blend * evenGapRad + (1 - blend) * simplexGapRad;
      }
      return directionsRad;
    });
}

/**
 * The outlier scenario of Req 10.5.
 *
 * Built by construction: a target with latitude in [-88°, 88°] and any longitude; 8 to 12 good
 * observers at distances drawn uniformly from 5 km to 7 km, in directions from `directionsFor`
 * (no gap over 60°);
 * one more observer, the bad one, in any direction and in the same range band; every observer
 * exact (position accuracy 0) with an azimuth 1-sigma of 2°. The good azimuths are noise-free;
 * the bad one is noise-free plus or minus an error drawn uniformly from 15° to 45°. Ids are
 * distinct strings of 1 to 8 characters; `badId` names the bad observation. Every observer is a
 * Supported position by construction (at most 88.07° from the equator). Nothing is discarded,
 * except the rare draw that rounding leaves with a gap a hair over 60°.
 */
export const outlierSet: fc.Arbitrary<OutlierScenario> = fc
  .tuple(
    fc.record({ latRad: latitudeUpTo(OUTLIER_MAX_LAT_RAD), lonRad: longitude }),
    fc.integer({ min: 8, max: 12 }),
  )
  .chain(([target, goodCount]) =>
    fc
      .tuple(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), {
          minLength: goodCount + 1,
          maxLength: goodCount + 1,
        }),
        directionsFor(goodCount),
        fc.array(uniformBetween(5000, 7000), { minLength: goodCount, maxLength: goodCount }),
        fc.tuple(
          azimuth,
          uniformBetween(5000, 7000),
          uniformBetween(15 * DEG, 45 * DEG),
          fc.boolean(),
        ),
      )
      .filter(
        counted(
          filterCounts.outlierDirectionGap,
          ([, directionsRad]: readonly [unknown, number[], ...unknown[]]) =>
            largestDirectionGapRad(directionsRad) <= OUTLIER_MAX_DIRECTION_GAP_RAD,
        ),
      )
      .map(
        ([ids, directionsRad, rangesM, [badFromTargetRad, badRangeM, badErrorRad, positive]]) => {
          const fields = (id: string) => ({
            id,
            azimuthSigmaRad: 2 * DEG,
            positionAccuracyM: 0,
            timeUtcMs: 1_763_193_600_000,
          });
          const good = directionsRad.map((directionRad, index) =>
            noiseFreeBearingFrom(
              unwrapOk(destinationPosition(target, directionRad, rangesM[index] as number)),
              target,
              fields(ids[index] as string),
            ),
          );
          const badId = ids[goodCount] as string;
          const badTruth = noiseFreeBearingFrom(
            unwrapOk(destinationPosition(target, badFromTargetRad, badRangeM)),
            target,
            fields(badId),
          );
          const bad = {
            ...badTruth,
            azimuthRad: _wrapTwoPi(badTruth.azimuthRad + (positive ? 1 : -1) * badErrorRad),
          };
          return { target, observations: [...good, bad], badId };
        },
      ),
  );

// ---------------------------------------------------------------------------------------------
// Hostile input (task 14.1, Req 9.8). Every value below passes type checking: a `number` may be
// any double, a `string` any string, an array any length. Not generated, because the static type
// would be a lie: sparse arrays (holes read as undefined), objects whose property reads throw
// (getters, Proxies), and values cast with `as` to a type they do not have.
// ---------------------------------------------------------------------------------------------

/** The next double above `value`. */
function nextUp(value: number): number {
  return value + Math.abs(value) * Number.EPSILON;
}

/**
 * Any double, with the special ones and the values at and just past every limit of the package
 * drawn often: NaN, ±Infinity, ±0, subnormals, ±MAX_VALUE, π, 2π, the 89° latitude limit, the
 * sigma and accuracy limits, the 1e-9 m and 1e-3 m thresholds, and maxIterations 50 and 51.
 */
export const hostileNumber: fc.Arbitrary<number> = fc.oneof(
  fc.double(),
  fc.constantFrom(
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
    1e-300,
    1e300,
    1e-9,
    1e-3,
    Math.PI,
    -Math.PI,
    nextUp(Math.PI),
    TWO_PI_RAD,
    MAX_SUPPORTED_LAT_RAD,
    nextUp(MAX_SUPPORTED_LAT_RAD),
    -MAX_SUPPORTED_LAT_RAD,
    MIN_AZIMUTH_SIGMA_RAD,
    MAX_AZIMUTH_SIGMA_RAD,
    nextUp(MAX_AZIMUTH_SIGMA_RAD),
    MAX_POSITION_ACCURACY_M,
    nextUp(MAX_POSITION_ACCURACY_M),
    50,
    51,
    2.5,
  ),
  fc.integer({ min: -100, max: 100 }),
);

/** A Supported position, a position built from `hostileNumber`, or one just past a limit. */
export const hostilePosition: fc.Arbitrary<Position> = fc.oneof(
  supportedPosition,
  fc.record({ latRad: hostileNumber, lonRad: hostileNumber }),
  fc.record({
    latRad: fc.constantFrom(nextUp(MAX_SUPPORTED_LAT_RAD), Math.PI / 2, -Math.PI / 2),
    lonRad: fc.constantFrom(-Math.PI, Math.PI, nextUp(Math.PI), 0),
  }),
);

/** A point on a Local plane built from `hostileNumber`, or near the 1e-9 m collapse. */
export const hostileLocalPoint: fc.Arbitrary<LocalPoint> = fc.oneof(
  fc.record({ eastM: hostileNumber, northM: hostileNumber }),
  fc.record({
    eastM: fc.double({ min: -1e-8, max: 1e-8, noNaN: true }),
    northM: fc.double({ min: -1e-8, max: 1e-8, noNaN: true }),
  }),
);

/** Any string: empty, short, or any sequence of UTF-16 code units, lone surrogates included. */
const hostileId: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constantFrom('a', 'b', 'a'),
  fc.string({ unit: 'binary', maxLength: 12 }),
);

const BEARING_NUMBER_FIELDS = [
  'positionAccuracyM',
  'timeUtcMs',
  'azimuthRad',
  'azimuthSigmaRad',
] as const;

/**
 * A Bearing that passes type checking: a valid one, a valid one with one field replaced by a
 * hostile value, or one with every field hostile.
 */
export const hostileBearing: fc.Arbitrary<Bearing> = fc.oneof(
  validBearing,
  fc
    .tuple(validBearing, fc.constantFrom(...BEARING_NUMBER_FIELDS), hostileNumber)
    .map(([bearing, field, value]) => ({ ...bearing, [field]: value })),
  fc.tuple(validBearing, hostilePosition).map(([bearing, observer]) => ({ ...bearing, observer })),
  fc.tuple(validBearing, hostileId).map(([bearing, id]) => ({ ...bearing, id })),
  fc.record({
    id: hostileId,
    observer: hostilePosition,
    positionAccuracyM: hostileNumber,
    timeUtcMs: hostileNumber,
    azimuthRad: hostileNumber,
    azimuthSigmaRad: hostileNumber,
  }),
);

/** A bearing with only the given fields chosen; the rest valid and fixed. */
const plainBearing = (id: string, observer: Position, azimuthRad: number): Bearing => ({
  id,
  observer,
  azimuthRad: _wrapTwoPi(azimuthRad),
  azimuthSigmaRad: 2 * DEG,
  positionAccuracyM: 0,
  timeUtcMs: 0,
});

/**
 * Sets of observations, of every length from 0 up, that pass type checking: arrays of
 * `hostileBearing`; valid and noisy solvable sets; and the degenerate geometries the solver must
 * refuse without throwing (design §8 `hostileInput`): duplicate ids, all bearings parallel,
 * colocated observers, observers at 88.5° whose bearings cross beyond 89°, two observers on one
 * meridian where one sights the other, observers whose centroid is undefined or at the pole,
 * and valid bearings scattered anywhere on the Earth.
 */
export const hostileObservationSet: fc.Arbitrary<Bearing[]> = fc.oneof(
  fc.array(hostileBearing, { maxLength: 8 }),
  fc.constant<Bearing[]>([]),
  validBearing.map((bearing) => [bearing]),
  solvableSet.map((scenario) => [...scenario.observations]),
  noisySolvableSet.map((scenario) => [...scenario.observations]),
  solvableSet.map((scenario) => {
    const [first] = scenario.observations;
    return first ? [...scenario.observations, { ...first }] : [...scenario.observations];
  }),
  fc
    .tuple(supportedPosition, azimuth, fc.integer({ min: 2, max: 6 }))
    .map(([start, azimuthRad, count]) =>
      Array.from({ length: count }, (_unused, index) =>
        plainBearing(
          `p${index}`,
          unwrapOk(destinationPosition(start, azimuthRad + Math.PI / 2, 1000 * index)),
          azimuthRad,
        ),
      ),
    ),
  fc
    .tuple(supportedPosition, fc.array(azimuth, { minLength: 2, maxLength: 5 }))
    .map(([observer, azimuthsRad]) =>
      azimuthsRad.map((azimuthRad, index) => plainBearing(`c${index}`, observer, azimuthRad)),
    ),
  fc
    .tuple(fc.boolean(), longitude)
    .map(([isNorth, lonRad]) => [
      plainBearing(
        'a',
        { latRad: (isNorth ? 1 : -1) * 88.5 * DEG, lonRad },
        (isNorth ? 1 : 179) * DEG,
      ),
      plainBearing(
        'b',
        { latRad: (isNorth ? 1 : -1) * 88.5 * DEG, lonRad: _wrapPi(lonRad + 3 * DEG) },
        (isNorth ? 359 : 181) * DEG,
      ),
    ]),
  fc
    .tuple(latitudeUpTo(80 * DEG), longitude, uniformBetween(500, 50_000))
    .map(([latRad, lonRad, separationM]) => {
      const a: Position = { latRad, lonRad };
      const b = unwrapOk(destinationPosition(a, Math.PI, separationM));
      return [
        plainBearing('a', a, 45 * DEG),
        plainBearing('b', b, unwrapOk(initialAzimuthRad(b, a))),
      ];
    }),
  fc
    .tuple(supportedPosition, azimuth, azimuth)
    .map(([position, first, second]) => [
      plainBearing('a', position, first),
      plainBearing(
        'b',
        { latRad: -position.latRad, lonRad: _wrapPi(position.lonRad + Math.PI) },
        second,
      ),
    ]),
  fc
    .tuple(longitude, azimuth, azimuth)
    .map(([lonRad, first, second]) => [
      plainBearing('a', { latRad: 88.95 * DEG, lonRad }, first),
      plainBearing('b', { latRad: 88.95 * DEG, lonRad: _wrapPi(lonRad + Math.PI) }, second),
    ]),
  fc
    .array(validBearing, { minLength: 2, maxLength: 8 })
    .map((bearings) => bearings.map((bearing, index) => ({ ...bearing, id: `s${index}` }))),
);

/** SolverOptions that pass type checking, each field present or absent. */
export const hostileSolverOptions: fc.Arbitrary<{
  outlierRejection?: boolean;
  maxIterations?: number;
}> = fc.record(
  { outlierRejection: fc.boolean(), maxIterations: hostileNumber },
  { requiredKeys: [] },
);

/** A covariance built from `hostileNumber`, or a valid, nearly singular or circular one. */
export const hostileCovariance: fc.Arbitrary<CovarianceEnM2> = fc.oneof(
  fc.record({ varEastM2: hostileNumber, varNorthM2: hostileNumber, covEastNorthM2: hostileNumber }),
  fc
    .tuple(logUniformBetween(1e-20, 1e20), logUniformBetween(1e-20, 1e20), uniformBetween(-1, 1))
    .map(([varEastM2, varNorthM2, correlation]) => ({
      varEastM2,
      varNorthM2,
      covEastNorthM2: correlation * Math.sqrt(varEastM2 * varNorthM2),
    })),
);

/** An ellipse built from `hostileNumber`. */
export const hostileEllipse: fc.Arbitrary<Ellipse> = fc.record({
  semiMajorM: hostileNumber,
  semiMinorM: hostileNumber,
  azimuthRad: hostileNumber,
});

/** A Fix that passes type checking, for calling `postSolveCheck` directly. */
export const hostileFix: fc.Arbitrary<Fix> = fc.record({
  position: hostilePosition,
  covariance: hostileCovariance,
  ellipse: hostileEllipse,
  residuals: fc.array(
    fc.record({ id: hostileId, residualRad: hostileNumber, normalisedResidual: hostileNumber }),
    { maxLength: 6 },
  ),
  iterations: hostileNumber,
  warnings: fc.subarray(['poor_geometry', 'outliers_excluded'] as const),
  excludedIds: fc.array(hostileId, { maxLength: 3 }),
});

/**
 * A `postSolveCheck` call whose Fix carries a residual for each observation, so that the check
 * reaches its residual and range tests rather than failing on a missing residual.
 */
export const hostileFixForObservations: fc.Arbitrary<{ fix: Fix; observations: Bearing[] }> = fc
  .tuple(hostileFix, hostileObservationSet)
  .chain(([fix, observations]) =>
    fc
      .array(hostileNumber, { minLength: observations.length, maxLength: observations.length })
      .map((residualsRad) => ({
        fix: {
          ...fix,
          residuals: observations.map((observation, index) => ({
            id: observation.id,
            residualRad: residualsRad[index] as number,
            normalisedResidual: 0,
          })),
        },
        observations,
      })),
  );

/**
 * Anything at all, for `parseBearing(wire: unknown)`: null, undefined and other bare values
 * drawn often; values from `fc.anything` with boxed values, maps, sets, bigints, dates, typed
 * arrays, null-prototype objects and sparse arrays; and valid wire objects with one field, or
 * the observer, replaced by anything (null included).
 */
export const hostileWire: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(null, undefined, [], {}, 0, '', Number.NaN),
  validBearing.map((bearing) => ({ ...unwrapOk(serialiseBearing(bearing)), observer: null })),
  fc.anything({
    withBoxedValues: true,
    withMap: true,
    withSet: true,
    withBigInt: true,
    withDate: true,
    withTypedArray: true,
    withNullPrototype: true,
    withObjectString: true,
    withSparseArray: true,
  }),
  fc
    .tuple(
      validBearing,
      fc.constantFrom(
        'v',
        'kind',
        'id',
        'observer',
        'positionAccuracyM',
        'timeUtcMs',
        'azimuthDeg',
        'azimuthSigmaDeg',
      ),
      fc.anything({ withBigInt: true, withBoxedValues: true }),
    )
    .map(([bearing, field, value]) => ({ ...unwrapOk(serialiseBearing(bearing)), [field]: value })),
  fc
    .tuple(validBearing, fc.record({ latDeg: hostileNumber, lonDeg: hostileNumber }))
    .map(([bearing, observer]) => ({ ...unwrapOk(serialiseBearing(bearing)), observer })),
);
