import fc from 'fast-check';
import { describe, it } from 'vitest';
import { declinationAt, trueAzimuthFromMagnetic } from './declination';
import { angleErrorRad } from './test-support/angle-compare';
import { closed, uniform, wmmPositionAndTime } from './test-support/generators';
import { isDeepRun, propertyRuns } from './test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from './test-support/property-report';

describe('Declination properties', () => {
  // P-6.11 — validates Req 6.11: magnetic azimuths in [0, 2π) and Declinations in [-π, π]:
  // converting to true and back with the negated Declination returns the magnetic azimuth within
  // 1e-12 rad (wrapped).
  it('P-6.11: magnetic to true and back is the identity', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-6.11',
      fc.property(
        uniform(0, 2 * Math.PI),
        closed(-Math.PI, Math.PI),
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

  // P-6.12 — validates Req 6.12: for Supported positions and times within WMM2025's validity,
  // `declinationAt` either fails with `declination_unknown` (the blackout zone) or returns a
  // Declination of magnitude at most π, with a 1-sigma in [0.26°, 2.73°], that the conversion of
  // Req 6.1 accepts. The successes are counted; fewer than half would make the property vacuous.
  it('P-6.12: every WMM declination is accepted, with a bounded 1-sigma', () => {
    const tracker = new ErrorTracker();
    const deg = Math.PI / 180;
    let successes = 0;
    let largestDeclinationRad = 0;
    checkProperty(
      'P-6.12',
      fc.property(wmmPositionAndTime(), (draw) => {
        const result = declinationAt({ latRad: draw.latRad, lonRad: draw.lonRad }, draw.timeUtcMs);
        if (!result.ok) return result.reason === 'declination_unknown';
        successes += 1;
        const { declinationRad, sigmaRad } = result.value;
        largestDeclinationRad = Math.max(largestDeclinationRad, Math.abs(declinationRad));
        const where = `lat=${draw.latRad} lon=${draw.lonRad} t=${draw.timeUtcMs}`;
        tracker.record('|declination| − π', Math.abs(declinationRad) - Math.PI, '≤ 0', where);
        tracker.record('0.26° − sigma', 0.26 * deg - sigmaRad, '≤ 0', where);
        tracker.record('sigma − 2.73°', sigmaRad - 2.73 * deg, '≤ 0', where);
        const converted = trueAzimuthFromMagnetic(draw.magneticAzimuthRad, result.value);
        return (
          Math.abs(declinationRad) <= Math.PI &&
          sigmaRad >= 0.26 * deg &&
          sigmaRad <= 2.73 * deg &&
          converted.ok
        );
      }),
      tracker,
    );
    const runs = propertyRuns();
    if (isDeepRun()) {
      console.log(
        `[deep]   successes: ${successes} of ${runs}; largest |declination| ${(largestDeclinationRad / deg).toFixed(2)}°`,
      );
    }
    if (successes < runs / 2)
      throw new Error(`P-6.12: only ${successes} of ${runs} cases succeeded`);
  });
});
