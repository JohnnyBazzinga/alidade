import { greatCircleDistanceM, type Position } from '@alidade/core';
import type { PositionFix } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { sightOf } from '../../test-support/captures';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { rawTimesArb, truthArb, usableTimes } from '../../test-support/generators';
import { noiseFreeSights } from '../../test-support/noise-free';
import { assess } from '../fix/assess';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { EARTH_RADIUS_M } from '../sphere/earth';
import { refractionRad } from '../sun/refraction';
import { sunAt } from '../sun/sun-at';
import { indexErrorFromSights } from './index-error';

const D = DEG_TO_RAD;
const params = defaultParameters();

describe('P-15.8: the Index error equals the bias, and its sigma the formula (Req 15.8)', () => {
  // Generator: truth latitude in [-80°, 80°], longitude anywhere; 1 to 10 times within 6 hours
  // from a start in 2026 to 2029; a bias b uniform in [-10° + 1e-6, 10° - 1e-6] (the standing
  // rule for limits: 1e-6 inside the limit of Req 15.4; the refusal at the limit has an example
  // test); a position sigma in [0, 2000 m]. Discarded and counted: a set with a time at which the
  // Sun at the truth is outside [5°, 80°] or whose raw altitude (true apparent plus b) is, since
  // the limits apply to the raw altitude (Req 15.3, 4.8).
  it('is b within 1e-9 rad; its sigma is the formula within 1e-12 and at least the Sun altitude sigma', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-15.8',
      fc.property(
        truthArb(80),
        rawTimesArb(1, 10, 0.01, 6),
        fc.double({ min: -10 * D + 1e-6, max: 10 * D - 1e-6, noNaN: true }),
        fc.double({ min: 0, max: 2000, noNaN: true }),
        (truth, times, b, sigmaPosM) => {
          const sights = [];
          for (const [i, t] of times.entries()) {
            const sun = sunAt(truth, t, params);
            fc.pre(sun.ok);
            if (!sun.ok) return;
            fc.pre(
              sun.value.apparentAltitudeRad >= params.minSightAltitudeRad &&
                sun.value.apparentAltitudeRad <= params.maxSightAltitudeRad,
            );
            const raw = sun.value.apparentAltitudeRad + b;
            fc.pre(raw >= params.minSightAltitudeRad && raw <= params.maxSightAltitudeRad);
            sights.push(
              sightOf({
                id: `s${i}`,
                timeUtcMs: t,
                rawApparentAltitudeRad: raw,
                sampleStdDevRad: 0,
              }),
            );
          }
          const fix: PositionFix = {
            position: truth,
            reportedAccuracyM: sigmaPosM,
            sigmaM: sigmaPosM,
            timeUtcMs: times[0] ?? 0,
          };
          const ie = indexErrorFromSights(sights, fix, false, params);
          if (!ie.ok) throw new Error(`refused: ${ie.reason} at b = ${b}`);
          const valueError = Math.abs(ie.value.valueRad - b);
          tracker.record('index error, rad', valueError, '1e-9', `b = ${b}, n = ${sights.length}`);
          if (valueError > 1e-9) throw new Error(`index error off by ${valueError}`);

          const n = sights.length;
          const sigmas = sights.map((s) => {
            const r = refractionRad(s.rawApparentAltitudeRad);
            if (!r.ok) throw new Error('refraction');
            return Math.hypot(0, 0, params.aimSigmaRad, params.refractionSigmaFraction * r.value);
          });
          const rms = Math.sqrt(sigmas.reduce((a, x) => a + x * x, 0) / n);
          // The sample sd of the differences is at most about 1e-9 for noise-free sights, far
          // below the rms of the Independent sigmas (at least the aim sigma of 0.5°).
          const expected = Math.sqrt(
            (rms * rms) / n + (sigmaPosM / EARTH_RADIUS_M) ** 2 + params.sunAltitudeSigmaRad ** 2,
          );
          const sigmaError = Math.abs(ie.value.sigmaRad - expected);
          tracker.record('index error sigma, rad', sigmaError, '1e-12', `n = ${n}`);
          if (sigmaError > 1e-12) throw new Error(`sigma off by ${sigmaError}`);
          if (ie.value.sigmaRad < params.sunAltitudeSigmaRad)
            throw new Error('sigma below the Sun altitude sigma');
        },
      ),
      tracker,
      { numRuns: cappedRuns(5000) },
    );
  });
});

describe('P-15.8: the Fix corrected by that Index error (Req 15.8)', () => {
  // Generator: as above, with 2 to 6 sights for the Fix over 2 to 9 hours (the domain of
  // Req 5.10: a largest Angle of cut at the truth of at least 20°, the others discarded and
  // counted), the bias in [-10° + 1e-6, 10° - 1e-6], and the Index error measured by one noise-free
  // sight at the truth at the first time. The Sun sides are the true azimuths so that the choice
  // between the Candidates is made; a run that ends in Two places is checked on the nearer place.
  it('lies within 0.1 m of the true Position', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-15.8 fix',
      fc.property(
        truthArb(80),
        rawTimesArb(2, 6, 2, 9),
        fc.double({ min: -10 * D + 1e-6, max: 10 * D - 1e-6, noNaN: true }),
        (truth, times, b) => {
          fc.pre(usableTimes(truth, times, 20, params));
          const sights = noiseFreeSights(truth, times, b, true, params);
          fc.pre(
            sights.every(
              (s) =>
                s.rawApparentAltitudeRad >= params.minSightAltitudeRad &&
                s.rawApparentAltitudeRad <= params.maxSightAltitudeRad,
            ),
          );
          const first = sights[0];
          if (first === undefined) return;
          const fix: PositionFix = {
            position: truth,
            reportedAccuracyM: 5,
            sigmaM: 5,
            timeUtcMs: first.timeUtcMs,
          };
          const ie = indexErrorFromSights([first], fix, false, params);
          if (!ie.ok) throw new Error(`index error refused: ${ie.reason}`);
          const a = assess(sights, ie.value, null, params);
          if (!a.ok) throw new Error(a.reason);
          let d: number;
          if (a.value.kind === 'fix') {
            d = distanceM(a.value.fix.position, truth);
          } else if (a.value.kind === 'two_places') {
            d = Math.min(...a.value.places.map((p) => distanceM(p.fix.position, truth)));
          } else {
            throw new Error(
              `no Fix: ${a.value.kind}${a.value.kind === 'failed' ? ` ${a.value.failure.reason}` : ''}`,
            );
          }
          tracker.record('corrected Fix distance, m', d, '0.1', `b = ${b}`);
          if (d > 0.1) throw new Error(`corrected Fix ${d} m from the truth`);
        },
      ),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
  });
});

function distanceM(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}
