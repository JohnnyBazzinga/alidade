import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  isSupportedPosition,
} from './position';
import { wrappedDifferenceRad } from './test-support/angle-compare';
import { azimuth, supportedPosition } from './test-support/generators';
import { unwrapOk } from './test-support/result-helpers';

const distanceBetweenM = (minM: number, maxM: number): fc.Arbitrary<number> =>
  fc.double({ min: minM, max: maxM, noNaN: true });

describe('spherical Earth properties', () => {
  // Property P-2.4: moving a distance d lands exactly d away. Validates Requirement 2.4.
  // Domain: Supported A, azimuth in [0, 2π), d in [10 m, 10 000 km]. Destinations that are not
  // Supported positions (within 1° of a pole) are discarded as the requirement says; example
  // tests cover those destinations.
  it('P-2.4: the distance from A to its destination equals d within 1e-4 m', () => {
    fc.assert(
      fc.property(
        supportedPosition,
        azimuth,
        distanceBetweenM(10, 1e7),
        (a, azimuthRad, distanceM) => {
          const b = unwrapOk(destinationPosition(a, azimuthRad, distanceM));
          fc.pre(isSupportedPosition(b));
          expect(Math.abs(unwrapOk(greatCircleDistanceM(a, b)) - distanceM)).toBeLessThan(1e-4);
        },
      ),
    );
  });

  // Property P-2.5: the initial azimuth to the destination is the azimuth travelled.
  // Validates Requirement 2.5. Domain: Supported A, azimuth in [0, 2π), d in [100 m, 10 000 km];
  // destinations that are not Supported positions are discarded.
  it('P-2.5: the initial azimuth from A to its destination equals θ within 1e-9 rad', () => {
    fc.assert(
      fc.property(
        supportedPosition,
        azimuth,
        distanceBetweenM(100, 1e7),
        (a, azimuthRad, distanceM) => {
          const b = unwrapOk(destinationPosition(a, azimuthRad, distanceM));
          fc.pre(isSupportedPosition(b));
          const recoveredRad = unwrapOk(initialAzimuthRad(a, b));
          expect(Math.abs(wrappedDifferenceRad(recoveredRad, azimuthRad))).toBeLessThan(1e-9);
        },
      ),
    );
  });

  // Property P-2.6: distance is symmetric and zero on identity. Validates Requirement 2.6.
  // Domain: any two Supported positions.
  it('P-2.6: d(A, B) equals d(B, A) within 1e-6 m, and d(A, A) is zero', () => {
    fc.assert(
      fc.property(supportedPosition, supportedPosition, (a, b) => {
        const forwardM = unwrapOk(greatCircleDistanceM(a, b));
        const backwardM = unwrapOk(greatCircleDistanceM(b, a));
        expect(Math.abs(forwardM - backwardM)).toBeLessThan(1e-6);
        expect(unwrapOk(greatCircleDistanceM(a, a))).toBe(0);
      }),
    );
  });

  // Property P-2.7: the triangle inequality. Validates Requirement 2.7.
  // Domain: any three Supported positions.
  it('P-2.7: d(A, C) does not exceed d(A, B) + d(B, C) by more than 1e-3 m', () => {
    fc.assert(
      fc.property(supportedPosition, supportedPosition, supportedPosition, (a, b, c) => {
        const directM = unwrapOk(greatCircleDistanceM(a, c));
        const viaBM = unwrapOk(greatCircleDistanceM(a, b)) + unwrapOk(greatCircleDistanceM(b, c));
        expect(directM).toBeLessThanOrEqual(viaBM + 1e-3);
      }),
    );
  });
});
