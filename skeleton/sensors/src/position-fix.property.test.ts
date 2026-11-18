import { degToRad } from '@alidade/core';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { positionFixFromReading } from './position-fix';
import { geolocationReading } from './test-support/generators';
import { checkProperty, ErrorTracker } from './test-support/property-report';

const T = 1_790_000_000_000;

function rad(degrees: number): number {
  const converted = degToRad(degrees);
  return converted.ok ? converted.value : Number.NaN;
}

describe('Position fix properties', () => {
  // P-7.9 — validates Req 7.9: latitudes in [-89°, 89°], longitudes in [-180°, 180°] and reported
  // accuracies in [0, 10 000] m: the fix holds the coordinates within 1e-15 rad of `degToRad` of
  // the input, with -180° taken as 180°, and the reported accuracy unchanged.
  it('P-7.9: the fix keeps the reading', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-7.9',
      fc.property(geolocationReading(), (reading) => {
        const fix = positionFixFromReading(reading, T, 1);
        if (!fix.ok) return false;
        const latError = Math.abs(fix.value.position.latRad - rad(reading.latitudeDeg));
        const expectedLonDeg = reading.longitudeDeg === -180 ? 180 : reading.longitudeDeg;
        const lonError = Math.abs(fix.value.position.lonRad - rad(expectedLonDeg));
        tracker.record('latitude error', latError, '1e-15');
        tracker.record('longitude error', lonError, '1e-15');
        return (
          latError <= 1e-15 &&
          lonError <= 1e-15 &&
          Object.is(fix.value.reportedAccuracyM, reading.accuracyM)
        );
      }),
      tracker,
    );
  });

  // P-7.10 — validates Req 7.10: accuracies in [0, 10 000] m and confidence scales in [0.1, 10]:
  // the 1-sigma equals the accuracy divided by the scale within a relative 1e-15.
  it('P-7.10: the 1-sigma is the accuracy over the scale', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-7.10',
      fc.property(geolocationReading(), (reading) => {
        const fix = positionFixFromReading(reading, T, reading.confidenceScale);
        if (!fix.ok) return false;
        const expected = reading.accuracyM / reading.confidenceScale;
        const relativeError =
          expected === 0
            ? Math.abs(fix.value.sigmaM)
            : Math.abs(fix.value.sigmaM - expected) / expected;
        tracker.record('relative error', relativeError, '1e-15');
        return relativeError <= 1e-15;
      }),
      tracker,
    );
  });
});
