import fc from 'fast-check';
import { describe, it } from 'vitest';
import { trueAzimuthFromMagnetic } from './declination';
import { angleErrorRad } from './test-support/angle-compare';
import { closed, uniform } from './test-support/generators';
import { checkProperty, ErrorTracker } from './test-support/property-report';

describe('Declination properties', () => {
  // P-6.11 — validates Req 6.11: magnetic azimuths in [0, 2π) and Declinations in [-π/2, π/2]:
  // converting to true and back with the negated Declination returns the magnetic azimuth within
  // 1e-12 rad (wrapped).
  it('P-6.11: magnetic to true and back is the identity', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-6.11',
      fc.property(
        uniform(0, 2 * Math.PI),
        closed(-Math.PI / 2, Math.PI / 2),
        (magneticRad, declinationRad) => {
          const trueRad = trueAzimuthFromMagnetic(magneticRad, { declinationRad, sigmaRad: 0 });
          if (!trueRad.ok) return false;
          const back = trueAzimuthFromMagnetic(trueRad.value, {
            declinationRad: -declinationRad,
            sigmaRad: 0,
          });
          if (!back.ok) return false;
          const error = angleErrorRad(back.value, magneticRad);
          tracker.record(
            'round-trip error',
            error,
            '1e-12',
            `magnetic=${magneticRad} declination=${declinationRad}`,
          );
          return error <= 1e-12;
        },
      ),
      tracker,
    );
  });
});
