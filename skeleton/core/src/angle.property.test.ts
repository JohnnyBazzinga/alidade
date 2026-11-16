import fc from 'fast-check';
import { describe, it } from 'vitest';
import { expect } from 'vitest';
import {
  TWO_PI_RAD,
  angularDifference,
  circularMean,
  degToRad,
  radToDeg,
  wrapPi,
  wrapTwoPi,
} from './angle';
import { wrappedDifferenceRad } from './test-support/angle-compare';
import { azimuth, clusteredAngles, finiteAngle } from './test-support/generators';
import { unwrapOk } from './test-support/result-helpers';

describe('angle properties', () => {
  // Property P-1.1 (supplementary to the design table): wrapping lands in the stated interval.
  // Validates Requirement 1.1. Domain: every finite double, up to ±1.8e308, with NaN and
  // ±Infinity excluded (example tests cover them).
  it('P-1.1: wrapTwoPi is in [0, 2π) and wrapPi is in (-π, π] for every finite input', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (angleRad) => {
        const twoPiRad = unwrapOk(wrapTwoPi(angleRad));
        expect(twoPiRad).toBeGreaterThanOrEqual(0);
        expect(twoPiRad).toBeLessThan(TWO_PI_RAD);
        const piRad = unwrapOk(wrapPi(angleRad));
        expect(piRad).toBeGreaterThan(-Math.PI);
        expect(piRad).toBeLessThanOrEqual(Math.PI);
      }),
    );
  });

  // Property P-1.2: wrapping is periodic. Validates Requirement 1.2.
  // Domain: |x| ≤ 1e6 rad (finiteAngle) and integers |k| ≤ 1000.
  it('P-1.2: wrapTwoPi(x + 2πk) equals wrapTwoPi(x) within 1e-9 rad', () => {
    fc.assert(
      fc.property(finiteAngle, fc.integer({ min: -1000, max: 1000 }), (xRad, periods) => {
        const shiftedRad = unwrapOk(wrapTwoPi(xRad + TWO_PI_RAD * periods));
        const plainRad = unwrapOk(wrapTwoPi(xRad));
        expect(Math.abs(wrappedDifferenceRad(shiftedRad, plainRad))).toBeLessThan(1e-9);
      }),
    );
  });

  // Property P-1.4: the angular difference is antisymmetric. Validates Requirement 1.4.
  // Domain: a and b with |a|, |b| ≤ 1e6 rad (finiteAngle). Differences within 1e-9 rad of π
  // are excluded as the requirement says; an example test shows why and covers that case.
  it('P-1.4: angularDifference(a, b) is the negative of angularDifference(b, a) within 1e-9', () => {
    fc.assert(
      fc.property(finiteAngle, finiteAngle, (aRad, bRad) => {
        const forwardRad = unwrapOk(angularDifference(aRad, bRad));
        const backwardRad = unwrapOk(angularDifference(bRad, aRad));
        if (Math.abs(forwardRad) >= Math.PI - 1e-9) return;
        expect(Math.abs(forwardRad + backwardRad)).toBeLessThan(1e-9);
      }),
    );
  });

  // Property P-1.5: degree/radian conversion round-trips. Validates Requirement 1.5.
  // Domain: |x| ≤ 1e6 in the starting unit (finiteAngle), both directions.
  // Tolerance: relative 1e-12 as the requirement states, plus an absolute floor of 1e-300.
  // The floor only matters for subnormal inputs below about 1e-312, where the product
  // underflows and no relative accuracy is possible; for every normal number the relative
  // bound alone holds (the actual error is about 4e-16).
  it('P-1.5: converting to the other unit and back returns x within relative 1e-12', () => {
    const absoluteFloor = 1e-300;
    const roundTripsWithin = (backValue: number, startValue: number): boolean =>
      Math.abs(backValue - startValue) <= 1e-12 * Math.abs(startValue) + absoluteFloor;

    fc.assert(
      fc.property(finiteAngle, (startValue) => {
        const viaRadians = unwrapOk(radToDeg(unwrapOk(degToRad(startValue))));
        expect(roundTripsWithin(viaRadians, startValue)).toBe(true);
        const viaDegrees = unwrapOk(degToRad(unwrapOk(radToDeg(startValue))));
        expect(roundTripsWithin(viaDegrees, startValue)).toBe(true);
      }),
    );
  });

  // Property P-1.7: the circular mean is rotation-equivariant. Validates Requirement 1.7.
  // Domain: 1 to 20 angles within π/4 of a common direction (clusteredAngles) and a rotation
  // drawn from [0, 2π) (azimuth). The spread bound keeps the mean defined.
  it('P-1.7: rotating every angle by r rotates the circular mean by r within 1e-9', () => {
    fc.assert(
      fc.property(clusteredAngles, azimuth, (anglesRad, rotationRad) => {
        const meanRad = unwrapOk(circularMean(anglesRad));
        const rotatedMeanRad = unwrapOk(
          circularMean(anglesRad.map((angleRad) => angleRad + rotationRad)),
        );
        expect(Math.abs(wrappedDifferenceRad(rotatedMeanRad, meanRad + rotationRad))).toBeLessThan(
          1e-9,
        );
      }),
    );
  });
});
