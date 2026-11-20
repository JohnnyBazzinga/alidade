import {
  angularDifference,
  greatCircleDistanceM,
  initialAzimuthRad,
  type Position,
} from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deepSame } from '../../test-support/deep-same';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { rawTimesArb, truthArb, usableTimes } from '../../test-support/generators';
import { noiseFreeSights } from '../../test-support/noise-free';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { defaultParameters } from '../parameters';
import type { IndexError } from '../sight/index-error';
import { assess } from './assess';

const params = defaultParameters();
/** Common sigma 0, as Req 6.9 says; the Independent sigma is the aim sigma of 0.5° and above. */
const EXACT: IndexError = {
  valueRad: 0,
  sigmaRad: 0,
  sightCount: 3,
  measuredUtcMs: 0,
  simulated: false,
};

function dist(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

/**
 * Generator of P-6.9 and P-6.10: the domain of Req 5.10: truth latitude in [-80°, 80°]; 2 to 8
 * noise-free sights within 24 hours from a start in 2026 to 2029; the Sun at the truth within
 * [5°, 80°] at every time, a largest Angle of cut at the truth of at least 20° (the others are
 * discarded and counted); each sight's Sun side the true azimuth or none, at random.
 */
const caseArb = fc.tuple(
  truthArb(80),
  rawTimesArb(2, 8, 0.5, 24),
  fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
);

describe('P-6.9: never the other place alone (Req 6.9)', () => {
  it('shows a Shown Fix at the truth, or Two places one of which is the truth; the Shown Fix whenever a Sun side separates the places by more than twice its tolerance', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-6.9',
      fc.property(caseArb, ([truth, times, sides]) => {
        fc.pre(usableTimes(truth, times, 20, params));
        const sights = noiseFreeSights(truth, times, 0, sides.slice(0, times.length), params);
        const r = assess(sights, EXACT, null, params);
        if (!r.ok) throw new Error(r.reason);
        const a = r.value;
        if (a.kind === 'fix') {
          const d = dist(a.fix.position, truth);
          tracker.record('shown fix distance, m', d, '0.1');
          expect(d).toBeLessThanOrEqual(0.1);
        } else if (a.kind === 'two_places') {
          const d = Math.min(
            dist(a.places[0].fix.position, truth),
            dist(a.places[1].fix.position, truth),
          );
          tracker.record('nearer place distance, m', d, '0.1');
          expect(d).toBeLessThanOrEqual(0.1);
          // Two places remained: no Sight with a Sun side may have separated them by more than
          // twice the tolerance (otherwise the Shown Fix was due).
          for (const s of sights) {
            if (s.sunSide === null) continue;
            const azimuths = a.places.map((p) => {
              const subsolar = a.used.find((u) => u.sight.id === s.id)?.subsolar;
              if (subsolar === undefined) throw new Error('no subsolar');
              const az = initialAzimuthRad(p.fix.position, subsolar);
              if (!az.ok) throw new Error(az.reason);
              return az.value;
            });
            const difference = angularDifference(azimuths[0] ?? 0, azimuths[1] ?? 0);
            if (!difference.ok) throw new Error(difference.reason);
            expect(Math.abs(difference.value)).toBeLessThanOrEqual(
              2 * params.sunSideToleranceRad + 1e-9,
            );
          }
        } else {
          throw new Error(`unexpected kind ${a.kind}`);
        }
      }),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
  });
});

describe('P-6.10: the order of the sights does not matter (Req 6.10)', () => {
  it('gives the same Candidates, choice and Shown Fix for every permutation', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-6.10',
      fc.property(
        caseArb,
        fc.integer({ min: 0, max: 2 ** 30 }),
        ([truth, times, sides], shuffleSeed) => {
          fc.pre(usableTimes(truth, times, 20, params));
          const sights = noiseFreeSights(truth, times, 0, sides.slice(0, times.length), params);
          // A permutation from a seed: Fisher-Yates over a small linear congruential generator.
          const order = sights.map((_, i) => i);
          let state = shuffleSeed >>> 0;
          for (let i = order.length - 1; i > 0; i -= 1) {
            state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
            const j = state % (i + 1);
            [order[i], order[j]] = [order[j] as number, order[i] as number];
          }
          const permuted = order.map((i) => sights[i] as (typeof sights)[number]);
          const a = assess(sights, EXACT, null, params);
          const b = assess(permuted, EXACT, null, params);
          expect(deepSame(a, b)).toBe(true);
        },
      ),
      tracker,
      { numRuns: cappedRuns(1000) },
    );
  });
});
