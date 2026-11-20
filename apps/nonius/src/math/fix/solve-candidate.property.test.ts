import { CONFIDENCE_95_SCALE, ellipse95, type Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { rawTimesArb, truthArb, usableTimes } from '../../test-support/generators';
import { noisySights } from '../../test-support/noisy-sights';
import { preparedOf } from '../../test-support/noise-free';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationInUse } from '../sight/index-error';
import { candidates } from './candidates';
import { checkSolve, placeFix } from './solve-candidate';
import { greatCircleDistanceM } from '@alidade/core';

const D = DEG_TO_RAD;
const params = defaultParameters();
const BANDS_RAD = [0, 0.25 * D, 1 * D, 3.5 * D];

describe('P-7.7: the Shown Fix\u2019s ellipse and covariance (Req 7.7)', () => {
  // Generator: as P-7.3: truth latitude in [-70°, 70°], 2 to 6 times spread over 2 to 9 hours
  // from a start in 2026 to 2029, a Common sigma from the four bands, a seed. The Candidate
  // nearer the truth is used (the choice between Candidates is not under test here). Discarded
  // and counted: a set with the Sun outside [5°, 80°] at a time, and a run that ends in a failure
  // (no Fix is shown, so there is nothing to check).
  it('has ellipse95 equal to the scale times the 1-sigma axes, and a symmetric positive definite covariance', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-7.7',
      fc.property(
        truthArb(70),
        rawTimesArb(2, 6, 2, 9),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (truth, times, band, seed) => {
          fc.pre(usableTimes(truth, times, 0, params));
          const commonSigmaRad = BANDS_RAD[band] ?? 0;
          const noisy = noisySights(
            truth,
            times,
            seed,
            { commonSigmaRad, independentSigmaRad: params.aimSigmaRad, sunSideSigmaRad: null },
            params,
          );
          const calibration = calibrationInUse({
            valueRad: 0,
            sigmaRad: commonSigmaRad,
            sightCount: 3,
            measuredUtcMs: times[0] ?? 0,
            simulated: false,
          });
          const prepared = preparedOf(noisy.sights, calibration, params);
          fc.pre(prepared.length === times.length);
          const places = candidates(prepared, params);
          fc.pre(places.ok);
          if (!places.ok) return;
          const nearest = [...places.value.places].sort(
            (p: Position, q: Position) => dist(p, truth) - dist(q, truth),
          )[0];
          if (nearest === undefined) return;
          const check = checkSolve(prepared, nearest, params);
          fc.pre(check.ok);
          if (!check.ok) return;
          const shown = placeFix(prepared, check.value, params);
          fc.pre(shown.ok);
          if (!shown.ok) return;
          const { covariance, ellipse } = shown.value;
          const e95 = ellipse95(ellipse);
          if (!e95.ok) throw new Error(e95.reason);
          const scaleError = Math.max(
            Math.abs(e95.value.semiMajorM / ellipse.semiMajorM - CONFIDENCE_95_SCALE),
            Math.abs(e95.value.semiMinorM / ellipse.semiMinorM - CONFIDENCE_95_SCALE),
          );
          tracker.record('ellipse95 scale error', scaleError, '1e-12');
          expect(scaleError).toBeLessThanOrEqual(1e-12);
          expect(covariance.varEastM2).toBeGreaterThan(0);
          expect(covariance.varNorthM2).toBeGreaterThan(0);
          expect(
            covariance.varEastM2 * covariance.varNorthM2 - covariance.covEastNorthM2 ** 2,
          ).toBeGreaterThan(0);
          // The 1-sigma ellipse is that of the covariance: its axes' squares are the eigenvalues.
          const trace = covariance.varEastM2 + covariance.varNorthM2;
          const sumOfSquares = ellipse.semiMajorM ** 2 + ellipse.semiMinorM ** 2;
          tracker.record('trace relative error', Math.abs(sumOfSquares - trace) / trace, '1e-9');
          expect(Math.abs(sumOfSquares - trace) / trace).toBeLessThanOrEqual(1e-9);
          expect(ellipse.semiMajorM).toBeGreaterThanOrEqual(ellipse.semiMinorM);
        },
      ),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
  });
});

function dist(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}
