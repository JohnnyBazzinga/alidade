import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BearingModel } from './bearing-model';
import { projectToLocalPlane } from './local-plane';
import { initialAzimuthRad } from './position';
import { makeBearing } from './test-support/bearings';
import { centralDifferencePartials } from './test-support/finite-differences';
import { bearingGeometry } from './test-support/generators';
import { unwrapOk } from './test-support/result-helpers';

const model = new BearingModel();

describe('bearing model properties', () => {
  // Property P-6.5: the analytic partial derivatives match central finite differences.
  // Validates Requirement 6.5.
  // Domain: bearingGeometry. An observer and the candidate target 50 m to 200 km apart (log-
  // uniform), the target at least 10 m inside the 89° latitude limit, and a Local plane origin
  // that is the target itself (the tangent-plane limit of design D16), within 1e-9 m to 1e-3 m
  // of it, or 1e-3 m to 1000 km from it (the polar chain rule). Observers and origins that
  // are not Supported positions are discarded. Example tests cover the excluded band.
  // Tolerance, from the requirement: relative 1e-2 or absolute 1e-10 rad/m, step 1 m.
  it('P-6.5: the partials agree with central finite differences (step 1 m) within 1e-2 relative or 1e-10 rad/m', () => {
    const agrees = (analyticValue: number, numericValue: number): boolean =>
      Math.abs(analyticValue - numericValue) <= 1e-2 * Math.abs(numericValue) ||
      Math.abs(analyticValue - numericValue) <= 1e-10;

    fc.assert(
      fc.property(bearingGeometry, ({ observer, target, origin }) => {
        const candidate = unwrapOk(projectToLocalPlane(origin, target));
        const observation = makeBearing({
          id: 'a',
          observer,
          azimuthRad: unwrapOk(initialAzimuthRad(observer, target)),
        });
        const analytic = unwrapOk(model.evaluate(observation, candidate, origin));
        const numeric = centralDifferencePartials(model, observation, candidate, origin, 1);
        expect(agrees(analytic.partialEastRadPerM, numeric.partialEastRadPerM)).toBe(true);
        expect(agrees(analytic.partialNorthRadPerM, numeric.partialNorthRadPerM)).toBe(true);
      }),
    );
  });

  // Property P-6.6: a noise-free bearing has zero residual at the true target.
  // Validates Requirement 6.6.
  // Domain: bearingGeometry, as for P-6.5, so the target is at least 10 m inside the 89°
  // latitude limit. The bearing's azimuth is the initial azimuth from the
  // observer to the true target. The candidate is the target projected onto the Local plane of
  // the origin, so the model reaches the target through the projection and its inverse, a path
  // independent of the one that produced the azimuth.
  it('P-6.6: the residual at the true target has magnitude below 1e-9 rad', () => {
    fc.assert(
      fc.property(bearingGeometry, ({ observer, target, origin }) => {
        const candidate = unwrapOk(projectToLocalPlane(origin, target));
        const observation = makeBearing({
          id: 'a',
          observer,
          azimuthRad: unwrapOk(initialAzimuthRad(observer, target)),
        });
        const evaluation = unwrapOk(model.evaluate(observation, candidate, origin));
        expect(Math.abs(evaluation.residualRad)).toBeLessThan(1e-9);
      }),
    );
  });
});
