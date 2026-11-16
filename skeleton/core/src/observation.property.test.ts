import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseBearing, serialiseBearing, validateBearing, type Bearing } from './observation';
import { wrappedDifferenceRad } from './test-support/angle-compare';
import { validBearing } from './test-support/generators';
import { unwrapOk } from './test-support/result-helpers';

/** True when `parsed` equals `original`: angles within 1e-12 rad, every other field identical. */
function matches(original: Bearing, parsed: Bearing): boolean {
  const angleMatches = (originalRad: number, parsedRad: number): boolean =>
    Math.abs(wrappedDifferenceRad(originalRad, parsedRad)) <= 1e-12;
  return (
    parsed.id === original.id &&
    // `===` is the requirement here: these fields must be identical, not merely close. It also
    // treats +0 and -0 as the same, which JSON text does not preserve.
    parsed.positionAccuracyM === original.positionAccuracyM &&
    parsed.timeUtcMs === original.timeUtcMs &&
    angleMatches(original.observer.latRad, parsed.observer.latRad) &&
    angleMatches(original.observer.lonRad, parsed.observer.lonRad) &&
    angleMatches(original.azimuthRad, parsed.azimuthRad) &&
    angleMatches(original.azimuthSigmaRad, parsed.azimuthSigmaRad)
  );
}

describe('observation properties', () => {
  // Property P-4.6: the wire format round-trips. Validates Requirement 4.6.
  // Domain: every valid Bearing (validBearing): ids of 1 to 16 characters, Supported observers,
  // accuracy in [0, 10 000] m, any finite time, azimuth in [0, 2π), sigma in [0.01°, 45°], both
  // ends of every range included. The bearing goes through the wire object directly and through
  // JSON text, which is what is stored and sent.
  it('P-4.6: serialising then parsing returns the bearing, angles within 1e-12 rad', () => {
    fc.assert(
      fc.property(validBearing, (bearing) => {
        expect(validateBearing(bearing).ok).toBe(true);
        const wire = unwrapOk(serialiseBearing(bearing));

        const direct = unwrapOk(parseBearing(wire));
        expect(matches(bearing, direct)).toBe(true);

        const viaText = unwrapOk(parseBearing(JSON.parse(JSON.stringify(wire))));
        expect(matches(bearing, viaText)).toBe(true);
      }),
    );
  });
});
