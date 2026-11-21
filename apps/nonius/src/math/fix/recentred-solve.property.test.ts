import { greatCircleDistanceM, type Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { rawTimesArb, truthArb, usableTimes } from '../../test-support/generators';
import { offsetPosition, preparedAt } from '../../test-support/noise-free';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { defaultParameters } from '../parameters';
import { observationsOf } from './altitude-model';
import { recentredSolve } from './recentred-solve';

const params = defaultParameters();

describe('P-5.10: the re-centred solve of noise-free sights (Req 5.10)', () => {
  // Generator: truth latitude in [-80°, 80°]; 2 to 8 times within 24 hours of a start in 2026 to
  // 2029; a start within 100 km of the truth (bearing uniform, distance uniform in [0, 100 km]; 300 km
  // until 2026-11-21, when Req 5.10 was amended: from 300 km due north one set ends in a second
  // minimum 569 km away, kept as an example test in `known-local-minimum.test.ts`).
  // Discarded and counted: a set with the Sun outside [5°, 80°] at a time, or whose largest
  // Angle of cut at the truth is under 20°.
  it('returns a Fix within 0.1 m of the true Position', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.10',
      fc.property(
        truthArb(80),
        rawTimesArb(2, 8, 0.5, 24),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.double({ min: 0, max: 100_000, noNaN: true }),
        (truth, times, bearing, offsetM) => {
          fc.pre(usableTimes(truth, times, 20, params));
          const prepared = preparedAt(truth, times, params);
          const observations = observationsOf(prepared, 'independent', 0);
          if (!observations.ok) throw new Error(observations.reason);
          const start: Position = offsetPosition(
            truth,
            offsetM * Math.sin(bearing),
            offsetM * Math.cos(bearing),
          );
          const fix = recentredSolve(observations.value, start, {}, params);
          if (!fix.ok) throw new Error(`solve failed: ${fix.reason}`);
          const d = greatCircleDistanceM(fix.value.position, truth);
          if (!d.ok) throw new Error(d.reason);
          tracker.record('distance to the truth, m', d.value, '0.1', `n = ${times.length}`);
          expect(d.value).toBeLessThanOrEqual(0.1);
        },
      ),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
  });
});
