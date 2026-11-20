import { projectToLocalPlane, solve, type CovarianceEnM2, type Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import {
  closedForm,
  createLinearModel,
  type LinearObservation,
} from '../../test-support/linear-model';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { EARTH_RADIUS_M } from '../sphere/earth';
import { defaultParameters } from '../parameters';
import { sharedErrorCovariance } from './shared-error';

const D = DEG_TO_RAD;
const params = defaultParameters();
const ORIGIN: Position = { latRad: 10 * D, lonRad: 20 * D };

/**
 * Generator `linearModelArb` (design §11): 2 to 8 rows, each of East and North coefficients
 * uniform in [-1, 1] (on a grid of 1e-5, because `fc.double` is biased to 0 and to the ends, and a
 * first run drew rows of 1e-75) and scaled by 1 / EARTH_RADIUS_M (radians of prediction per metre, as for the
 * altitude); Independent sigmas in [0.1°, 2°]; a Common sigma in [0°, 3.5°]; the observed values
 * are made from a true offset of up to 5 km so that the solve has something to do. Discarded and
 * counted: sets whose normal matrix is badly conditioned (`det / trace² < 1e-3`, nearly parallel
 * rows), where the solver's own rounding, not the method, would be measured, and sets with a row
 * shorter than 0.1 (a row of 1e-75 gave a solution of 1e75 m and an overflow in the solver: found
 * by the first run, seed -706094599; the example test below keeps that counterexample). The
 * narrowing was made before stopping, and accepted by the lead after the fact at checkpoint 7
 * (2026-11-20): rows of 1e-75 are not the Jacobian of any sight (an altitude moves by about
 * 1 / EARTH_RADIUS_M per metre), and Core refuses the overflow with a failure, not a number.
 */
const uniform = (min: number, max: number): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 100_000 }).map((k) => min + ((max - min) * k) / 100_000);

const caseArb = fc.record({
  rows: fc.array(
    fc.record({
      east: uniform(-1, 1),
      north: uniform(-1, 1),
      sigmaDeg: uniform(0.1, 2),
    }),
    { minLength: 2, maxLength: 8 },
  ),
  commonSigmaDeg: uniform(0, 3.5),
  trueEastM: uniform(-5000, 5000),
  trueNorthM: uniform(-5000, 5000),
});

function relativeError(actual: number, expected: number, scale: number): number {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), scale);
}

describe('P-7.9: the shared-error covariance equals the linear closed form (Req 7.9)', () => {
  it('is (JᵀWJ)⁻¹ + σc² (A·1)(A·1)ᵀ within a relative 1e-6 in each entry', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-7.9',
      fc.property(caseArb, (c) => {
        const observations: LinearObservation[] = c.rows.map((r, i) => {
          const east = r.east / EARTH_RADIUS_M;
          const north = r.north / EARTH_RADIUS_M;
          return {
            id: `r${i}`,
            eastRadPerM: east,
            northRadPerM: north,
            observedRad: east * c.trueEastM + north * c.trueNorthM,
            sigmaRad: r.sigmaDeg * D,
          };
        });
        const commonSigmaRad = c.commonSigmaDeg * D;
        const closed = closedForm(observations, commonSigmaRad);
        fc.pre(closed.conditioning > 1e-3);
        fc.pre(c.rows.every((r) => Math.hypot(r.east, r.north) >= 0.1));
        // Every solve of the app is re-centred (Req 7.8): the model is made at the Fix, so that
        // the plane of the solve is the plane of the Fix. The test does the same: the first
        // solve gives the Fix, the observations are re-expressed from the Fix (the linear model
        // is linear in the coordinates of the plane it is evaluated on), and the base and shifted
        // solves are made from there.
        const first = solve(createLinearModel(ORIGIN), observations, {});
        if (!first.ok) throw new Error(`first solve failed: ${first.reason}`);
        const x0 = projectToLocalPlane(ORIGIN, first.value.position);
        if (!x0.ok) throw new Error(x0.reason);
        const atFix = observations.map((o) => ({
          ...o,
          observedRad:
            o.observedRad - (o.eastRadPerM * x0.value.eastM + o.northRadPerM * x0.value.northM),
        }));
        const model = createLinearModel(first.value.position);
        const base = solve(model, atFix, {});
        if (!base.ok) throw new Error(`base solve failed: ${base.reason}`);
        const shiftedFix = (sign: 1 | -1) =>
          solve(
            createLinearModel(base.value.position),
            atFix.map((o) => ({
              ...o,
              observedRad: o.observedRad + sign * params.sensitivityStepRad,
            })),
            {},
          );
        const method = sharedErrorCovariance(
          base.value.covariance,
          base.value.position,
          shiftedFix,
          commonSigmaRad,
          params.sensitivityStepRad,
        );
        if (!method.ok) throw new Error(`method failed: ${method.reason}`);
        const m: CovarianceEnM2 = method.value;
        // An entry is compared relative to itself, with the floor of 1e-9 of the geometric mean
        // of the variances for an off-diagonal entry that is nearly zero.
        const floor = 1e-9 * Math.sqrt(closed.varEastM2 * closed.varNorthM2);
        const errors = [
          relativeError(m.varEastM2, closed.varEastM2, 0),
          relativeError(m.varNorthM2, closed.varNorthM2, 0),
          relativeError(m.covEastNorthM2, closed.covEastNorthM2, floor),
        ];
        const worst = Math.max(...errors);
        tracker.record('covariance entry, relative', worst, '1e-6', `n = ${observations.length}`);
        expect(worst).toBeLessThanOrEqual(1e-6);
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
  });

  it('keeps the counterexample of the first run: rows of 1e-75 overflow Core\u2019s solver and give a failure, not a number', () => {
    const rows: LinearObservation[] = [
      { id: 'a', eastRadPerM: 0, northRadPerM: 5.4e-82, observedRad: 0, sigmaRad: 0.1 * D },
      { id: 'b', eastRadPerM: 4.3e-80, northRadPerM: 0, observedRad: 0, sigmaRad: 0.25 * D },
      { id: 'c', eastRadPerM: 0, northRadPerM: 0, observedRad: 0, sigmaRad: 0.1 * D },
    ];
    const r = solve(createLinearModel(ORIGIN), rows, {});
    expect(r.ok).toBe(false);
  });

  it('has an example of the case the generator discards: parallel rows give no closed form', () => {
    const row: LinearObservation = {
      id: 'a',
      eastRadPerM: 1e-7,
      northRadPerM: 1e-7,
      observedRad: 0,
      sigmaRad: 0.01,
    };
    expect(closedForm([row, { ...row, id: 'b' }], 0.02).conditioning).toBeLessThan(1e-12);
  });
});
