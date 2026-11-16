// Shared fast-check generators. Each one states the domain it draws from and what it excludes
// (testing.md rule 4). A degenerate case that a generator excludes has an example test of its
// own, named below.

import fc from 'fast-check';
import { TWO_PI_RAD } from '../angle';

/**
 * Any angle with |x| ≤ 1e6 rad, in radians.
 *
 * Includes: ±0, subnormal values and values at both ends of the range (fast-check biases
 * doubles toward these).
 * Excludes: NaN and ±Infinity (example tests of `invalid_number` cover them) and magnitudes
 * above 1e6 (the property for Req 1.1 draws from the whole finite range separately).
 */
export const finiteAngle: fc.Arbitrary<number> = fc.double({
  min: -1e6,
  max: 1e6,
  noNaN: true,
});

/**
 * An azimuth in [0, 2π) rad, clockwise from true north.
 *
 * Includes: 0. Excludes: 2π itself, NaN and ±Infinity.
 */
export const azimuth: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: TWO_PI_RAD,
  maxExcluded: true,
  noNaN: true,
});

/**
 * A non-empty list of 1 to 20 angles that all lie within π/4 of one common direction.
 *
 * The common direction is drawn from [0, 2π) and each angle is that direction plus an offset
 * drawn from [-π/4, π/4]. The angles themselves are not wrapped, so they range over
 * [-π/4, 2π + π/4]. Because every offset is within π/4, every unit vector has a component of at
 * least cos(π/4) ≈ 0.707 along the common direction, so the mean resultant length is at least
 * 0.707 and the circular mean is always defined.
 *
 * Excludes: lists with a spread wider than π/2 and the undefined-mean case; example tests
 * cover `undefined_mean`.
 */
export const clusteredAngles: fc.Arbitrary<number[]> = fc
  .tuple(
    azimuth,
    fc.array(fc.double({ min: -Math.PI / 4, max: Math.PI / 4, noNaN: true }), {
      minLength: 1,
      maxLength: 20,
    }),
  )
  .map(([commonDirectionRad, offsetsRad]) =>
    offsetsRad.map((offsetRad) => commonDirectionRad + offsetRad),
  );
