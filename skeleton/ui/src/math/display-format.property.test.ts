import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cappedRuns } from '../test-support/fast-check-setup';
import { closed, uniform, uniformInteger } from '../test-support/generators';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { fromDeg, toDeg } from './degrees';
import { formatAzimuthDeg, formatSignedDeg, parseDegrees } from './display-format';

const TWO_PI = 2 * Math.PI;

/** The wrapped difference of two angles in degrees, in [-180, 180]. */
function wrappedDiffDeg(aDeg: number, bDeg: number): number {
  let d = (aDeg - bDeg) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Domain: `decimals` an integer in [0, 4]; an azimuth in [0, 2π) drawn from one of
 *  - uniform over [0, 2π) (ends included: 0 and 2π − 1e-12),
 *  - 360° − δ with δ uniform in [0, 0.5·10^-decimals], values that round up to 360 (and 2π
 *    itself, mapped to 2π − 1e-12 so that the azimuth stays inside [0, 2π)).
 * Excludes: non-finite angles and angles outside [0, 2π) (examples of their own).
 */
function azimuthCase(): fc.Arbitrary<{ azimuthRad: number; decimals: number }> {
  return uniformInteger(0, 4).chain((decimals) =>
    fc
      .oneof(
        { weight: 3, arbitrary: uniform(0, TWO_PI) },
        { weight: 1, arbitrary: fc.constantFrom(0, TWO_PI - 1e-12) },
        {
          weight: 2,
          arbitrary: uniform(0, 0.5 * 10 ** -decimals).map((deltaDeg) => {
            const rad = fromDeg(360 - deltaDeg);
            return rad < TWO_PI ? rad : TWO_PI - 1e-12;
          }),
        },
      )
      .map((azimuthRad) => ({ azimuthRad, decimals })),
  );
}

// P-3.9 (Req 3.9): the formatted azimuth is a number in [0, 360), never 360.0, and its wrapped
// difference from the azimuth in degrees is at most 0.5·10^-d + 1e-9.
describe('P-3.9 formatAzimuthDeg', () => {
  it('prints a number in [0, 360) within half a unit of the last digit', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.9',
      fc.property(azimuthCase(), ({ azimuthRad, decimals }) => {
        const text = formatAzimuthDeg(azimuthRad, decimals);
        const shown = Number(text);
        const toleranceDeg = 0.5 * 10 ** -decimals + 1e-9;
        const errorDeg = Math.abs(wrappedDiffDeg(shown, toDeg(azimuthRad)));
        tracker.record(
          `azimuth error, decimals=${decimals} [deg]`,
          errorDeg,
          `0.5e-${decimals} + 1e-9`,
          text,
        );
        return (
          Number.isFinite(shown) &&
          shown >= 0 &&
          shown < 360 &&
          text.split('.')[1]?.length === (decimals === 0 ? undefined : decimals) &&
          errorDeg <= toleranceDeg
        );
      }),
      tracker,
      { numRuns: cappedRuns(100_000) },
    );
  });
});

/**
 * Domain: `decimals` an integer in [0, 4]; a signed angle in [-π, π] (ends drawn), or within
 * 10^-(decimals+1) degrees of zero (to meet text that rounds to zero). Excludes non-finite and
 * out-of-range angles (examples of their own).
 */
function signedCase(): fc.Arbitrary<{ angleRad: number; decimals: number }> {
  return uniformInteger(0, 4).chain((decimals) =>
    fc
      .oneof(
        { weight: 3, arbitrary: closed(-Math.PI, Math.PI) },
        {
          weight: 2,
          arbitrary: closed(-(10 ** -(decimals + 1)), 10 ** -(decimals + 1)).map(fromDeg),
        },
      )
      .map((angleRad) => ({ angleRad, decimals })),
  );
}

// P-3.10 (Req 3.10): the formatted text parses back to within 0.5·10^-d + 1e-9 degrees, and has
// no minus sign when it rounds to zero.
describe('P-3.10 formatSignedDeg and parseDegrees', () => {
  it('round-trips within half a unit of the last digit and never prints -0', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.10',
      fc.property(signedCase(), ({ angleRad, decimals }) => {
        const text = formatSignedDeg(angleRad, decimals);
        const parsed = parseDegrees(text);
        if (!parsed.ok) return false;
        const errorDeg = Math.abs(toDeg(parsed.value) - toDeg(angleRad));
        tracker.record(
          `round-trip error, decimals=${decimals} [deg]`,
          errorDeg,
          `0.5e-${decimals} + 1e-9`,
          text,
        );
        const noMinusWhenZero = Number(text) !== 0 || !text.startsWith('-');
        return errorDeg <= 0.5 * 10 ** -decimals + 1e-9 && noMinusWhenZero;
      }),
      tracker,
      { numRuns: cappedRuns(100_000) },
    );
  });
});
