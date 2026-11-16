import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { _wrapPi } from './angle';
import { BearingModel } from './bearing-model';
import type { Fix } from './measurement-model';
import type { Bearing } from './observation';
import { projectToLocalPlane } from './local-plane';
import {
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  type Position,
} from './position';
import { solve } from './solver';
import {
  meridianSet,
  noisySolvableSet,
  outlierSet,
  solvableSet,
  solvableSetWithExtra,
  solvableSetWithScale,
  type SolverScenario,
} from './test-support/generators';
import { unwrapOk } from './test-support/result-helpers';

const model = new BearingModel();
const distanceM = (a: Position, b: Position): number => unwrapOk(greatCircleDistanceM(a, b));

/** The Fix of a scenario's bearings. A failure fails the test (design §8). */
const fixOf = (observations: readonly Bearing[]): Fix => unwrapOk(solve(model, observations));

/**
 * A copy of each observation under an id that cannot collide with any generated id: the
 * generators draw ids from printable characters, and the copy adds U+0001 to the original.
 */
const copiesUnderNewIds = (observations: readonly Bearing[]): Bearing[] =>
  observations.map((observation) => ({ ...observation, id: `${observation.id}\u0001` }));

/** A scenario and a permutation of its observations, drawn as random sort keys. */
const withPermutation = (scenarios: fc.Arbitrary<SolverScenario>) =>
  scenarios.chain((scenario) =>
    fc
      .array(fc.double({ min: 0, max: 1, noNaN: true }), {
        minLength: scenario.observations.length,
        maxLength: scenario.observations.length,
      })
      .map((keys) => ({
        scenario,
        permuted: scenario.observations
          .map((observation, index) => ({ observation, key: keys[index] as number, index }))
          .sort((left, right) => left.key - right.key || left.index - right.index)
          .map((entry) => entry.observation),
      })),
  );

describe('solver properties', () => {
  // Property P-7.4: noise-free recovery. Validates Requirement 7.4.
  // Domain: solvableSet, exactly the Req 7.4 conditions (target within 75° of the equator, 2 to
  // 12 observers 500 m to 100 km away, a pair crossing at 10° or more, cross-track 1-sigmas
  // within a factor of 1e3). It does not filter on solver success: a failure fails the test.
  it('P-7.4: the Fix of a noise-free set is within 0.01 m of the true target', () => {
    fc.assert(
      fc.property(solvableSet, ({ target, observations }) => {
        expect(distanceM(fixOf(observations).position, target)).toBeLessThan(0.01);
      }),
    );
  });

  // Property P-7.5: order independence. Validates Requirement 7.5.
  // Domain: solvableSet with a random permutation of its observations; a failure fails the test.
  it('P-7.5: reordering a noise-free set moves the Fix by less than 1e-3 m', () => {
    fc.assert(
      fc.property(withPermutation(solvableSet), ({ scenario, permuted }) => {
        const original = fixOf(scenario.observations);
        const reordered = fixOf(permuted);
        expect(distanceM(original.position, reordered.position)).toBeLessThan(1e-3);
      }),
    );
  });

  // Property P-7.5, noisy variant. Validates Requirement 7.5.
  // Domain: noisySolvableSet (one azimuth sigma of Gaussian noise) with a random permutation.
  // This is the only solver property that may discard sets: with noise a solve can legitimately
  // fail (for example diverging_bearings). Both orderings must then fail with the same Result;
  // the discards are counted, and the test fails if more than half the cases are discarded.
  it('P-7.5 (noisy): reordering a noisy set gives the same outcome, and Fixes within 1e-3 m', () => {
    let discarded = 0;
    let cases = 0;
    fc.assert(
      fc.property(withPermutation(noisySolvableSet), ({ scenario, permuted }) => {
        cases += 1;
        const original = solve(model, scenario.observations);
        const reordered = solve(model, permuted);
        if (!original.ok || !reordered.ok) {
          discarded += 1;
          expect(reordered).toStrictEqual(original);
          return;
        }
        expect(distanceM(original.value.position, reordered.value.position)).toBeLessThan(1e-3);
      }),
    );
    expect(discarded).toBeLessThan(cases / 2);
  });

  // Property P-7.6: local optimality. Validates Requirement 7.6.
  // Domain: solvableSet; a failure fails the test. Each Effective sigma is held at its value at
  // the Fix (the residual over the normalised residual would be 0/0 for a noise-free set, so it
  // is read from the model at the Fix). The residuals at the four points 1 m east, west, north and
  // south of the Fix are computed here from the spherical azimuth, not by the model.
  it('P-7.6: with sigmas held, the Cost at the Fix does not exceed the Cost 1 m E, W, N or S', () => {
    fc.assert(
      fc.property(solvableSet, ({ observations }) => {
        const fix = fixOf(observations);
        const origin = unwrapOk(model.origin(observations));
        const fixOnPlane = unwrapOk(projectToLocalPlane(origin, fix.position));
        const sigmasRad = observations.map(
          (observation) =>
            unwrapOk(model.evaluate(observation, fixOnPlane, origin)).effectiveSigmaRad,
        );
        const costAt = (point: Position): number =>
          observations.reduce((sum, observation, index) => {
            const predictedRad = unwrapOk(initialAzimuthRad(observation.observer, point));
            const residualRad = _wrapPi(observation.azimuthRad - predictedRad);
            return sum + (residualRad / (sigmasRad[index] as number)) ** 2;
          }, 0);
        const costAtFix = costAt(fix.position);
        for (const towardsRad of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
          const neighbour = unwrapOk(destinationPosition(fix.position, towardsRad, 1));
          expect(costAtFix).toBeLessThanOrEqual(costAt(neighbour));
        }
      }),
    );
  });

  // Property P-7.7: copies under new ids leave the Fix unchanged. Validates Requirement 7.7.
  // Domain: solvableSet, each observation copied once under a fresh unique id; a failure fails
  // the test.
  it('P-7.7: adding a copy of every observation under a new id moves the Fix by less than 1e-3 m', () => {
    fc.assert(
      fc.property(solvableSet, ({ observations }) => {
        const copied = [...observations, ...copiesUnderNewIds(observations)];
        expect(new Set(copied.map((observation) => observation.id)).size).toBe(copied.length);
        expect(distanceM(fixOf(copied).position, fixOf(observations).position)).toBeLessThan(1e-3);
      }),
    );
  });

  // Property P-7.8: determinism. Validates Requirement 7.8.
  // Domain: solvableSet; a failure fails the test. Two calls on the same input must return
  // deeply equal Results, every number and every list included.
  it('P-7.8: two solves of the same input return identical results', () => {
    fc.assert(
      fc.property(solvableSet, ({ observations }) => {
        expect(solve(model, observations)).toStrictEqual(solve(model, observations));
      }),
    );
  });

  // Property P-8.4: uncertainty scales with the input sigmas. Validates Requirement 8.4.
  // Domain: solvableSetWithScale, a solvableSet and a factor k in [0.5, 4] restricted to the
  // factors that keep every scaled observation valid (both ends of that range drawn); a failure
  // fails the test.
  it('P-8.4: scaling every sigma and accuracy by k keeps the Fix and scales both axes by k', () => {
    fc.assert(
      fc.property(solvableSetWithScale, ({ scenario, scale }) => {
        const scaled = scenario.observations.map((observation) => ({
          ...observation,
          azimuthSigmaRad: observation.azimuthSigmaRad * scale,
          positionAccuracyM: observation.positionAccuracyM * scale,
        }));
        const original = fixOf(scenario.observations);
        const rescaled = fixOf(scaled);
        expect(distanceM(original.position, rescaled.position)).toBeLessThan(1e-3);
        for (const axis of ['semiMajorM', 'semiMinorM'] as const) {
          const ratio = rescaled.ellipse[axis] / original.ellipse[axis];
          expect(Math.abs(ratio / scale - 1)).toBeLessThan(1e-5);
        }
      }),
    );
  });

  // Property P-8.5: copies under new ids shrink the ellipse by √2. Validates Requirement 8.5.
  // Domain: solvableSet, each observation copied once under a fresh unique id; a failure fails
  // the test.
  it('P-8.5: adding a copy of every observation under a new id divides both axes by √2', () => {
    fc.assert(
      fc.property(solvableSet, ({ observations }) => {
        const original = fixOf(observations);
        const copied = fixOf([...observations, ...copiesUnderNewIds(observations)]);
        for (const axis of ['semiMajorM', 'semiMinorM'] as const) {
          const ratio = copied.ellipse[axis] / original.ellipse[axis];
          expect(Math.abs(ratio * Math.SQRT2 - 1)).toBeLessThan(1e-5);
        }
      }),
    );
  });

  // Property P-8.6: one more noise-free observation does not grow the covariance. Validates
  // Requirement 8.6.
  // Domain: solvableSetWithExtra, a set that meets Req 7.4 and one more noise-free observation of
  // the same target that keeps those conditions; a failure fails the test.
  it('P-8.6: an extra noise-free observation does not raise det(covariance) by more than 1e-9', () => {
    const determinant = (fix: Fix): number =>
      fix.covariance.varEastM2 * fix.covariance.varNorthM2 - fix.covariance.covEastNorthM2 ** 2;
    fc.assert(
      fc.property(solvableSetWithExtra, ({ observations, extra }) => {
        const before = determinant(fixOf(observations));
        const after = determinant(fixOf([...observations, extra]));
        expect(after).toBeLessThanOrEqual(before * (1 + 1e-9));
      }),
    );
  });

  // Property P-8.7: the covariance is symmetric positive definite. Validates Requirement 8.7.
  // Domain: solvableSet; a failure fails the test. The covariance type stores one off-diagonal
  // entry, so it is symmetric by construction; the property checks that every entry is finite
  // and that the matrix is positive definite (both diagonal entries and the determinant
  // positive, which for a symmetric 2×2 matrix is equivalent to both eigenvalues positive).
  it('P-8.7: the covariance is finite and positive definite', () => {
    fc.assert(
      fc.property(solvableSet, ({ observations }) => {
        const { varEastM2, varNorthM2, covEastNorthM2 } = fixOf(observations).covariance;
        expect([varEastM2, varNorthM2, covEastNorthM2].every(Number.isFinite)).toBe(true);
        expect(varEastM2).toBeGreaterThan(0);
        expect(varNorthM2).toBeGreaterThan(0);
        expect(varEastM2 * varNorthM2 - covEastNorthM2 ** 2).toBeGreaterThan(0);
      }),
    );
  });

  // Property P-9.7: the ±180° meridian does not matter. Validates Requirement 9.7.
  // Domain: meridianSet, a solvableSet with observers on both sides of the ±180° meridian; a
  // failure fails the test. Shifting every observer 90° east is a rotation about the polar axis,
  // which leaves every azimuth unchanged, so the same bearings describe the shifted configuration.
  it('P-9.7: the Fix across the ±180° meridian equals the Fix of the configuration shifted 90°', () => {
    const shifted = (position: Position, byRad: number): Position => ({
      latRad: position.latRad,
      lonRad: _wrapPi(position.lonRad + byRad),
    });
    fc.assert(
      fc.property(meridianSet, ({ observations }) => {
        const straddling = fixOf(observations);
        const moved = fixOf(
          observations.map((observation) => ({
            ...observation,
            observer: shifted(observation.observer, Math.PI / 2),
          })),
        );
        expect(distanceM(shifted(moved.position, -Math.PI / 2), straddling.position)).toBeLessThan(
          0.01,
        );
      }),
    );
  });

  // Property P-10.5: one wrong observation is excluded. Validates Requirement 10.5.
  // Domain: outlierSet (target within 88°, 8 to 12 good observers 5 to 7 km away with no gap over
  // 60° between their directions, sigma 2°, exact positions, one bearing 15° to 45° wrong); a
  // failure fails the test.
  it('P-10.5: with outlier rejection, the Fix is within 1 m and exactly the wrong observation is excluded', () => {
    fc.assert(
      fc.property(outlierSet, ({ target, observations, badId }) => {
        const fix = unwrapOk(solve(model, observations, { outlierRejection: true }));
        expect(fix.excludedIds).toStrictEqual([badId]);
        expect(distanceM(fix.position, target)).toBeLessThan(1);
      }),
    );
  });
});
