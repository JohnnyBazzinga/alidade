import { describe, expect, it } from 'vitest';
import { TWO_PI_RAD, _wrapTwoPi } from './angle';
import { BearingModel } from './bearing-model';
import { CONFIDENCE_95_SCALE, ellipse95 } from './ellipse';
import { projectToLocalPlane } from './local-plane';
import type { Bearing } from './observation';
import { destinationPosition, initialAzimuthRad, type Position } from './position';
import type { Reason } from './result';
import { solve } from './solver';
import { crossingAngleBetweenRad } from './test-support/generators';
import { unwrapOk } from './test-support/result-helpers';
import { createSeededRandom } from './test-support/seeded-random';

const DEG = Math.PI / 180;
const SIGMA_RAD = 2 * DEG;
const TRIALS = 1000;

interface CalibrationResult {
  readonly trials: number;
  readonly contained: number;
  readonly failedSolves: number;
  readonly failuresByReason: Readonly<Partial<Record<Reason, number>>>;
  /** Trials where the ellipse test and the Mahalanobis test from the covariance disagree. */
  readonly ellipseCovarianceDisagreements: number;
}

/**
 * The calibration experiment of Req 8.8, from `seed` (testing.md: statistical tests take a fixed
 * seed as an argument).
 *
 * Each trial draws a target with latitude within 75° and any longitude, and three observers,
 * each 1 km to 20 km from it in a uniform direction, redrawn until every pair of their
 * noise-free bearings crosses at 30° or more. The observers are exact (position accuracy 0)
 * with an azimuth 1-sigma of 2°, and each measured azimuth is the noise-free one plus 2° times
 * a standard normal draw. A trial counts as contained when the solve succeeds and the true
 * target lies inside the 95% ellipse, tested in the tangent plane at the Fix, which is the
 * frame of the ellipse (design D19). A failed solve counts as not contained.
 */
function runCalibration(seed: number, trials = TRIALS): CalibrationResult {
  const random = createSeededRandom(seed);
  const model = new BearingModel();
  let contained = 0;
  let failedSolves = 0;
  let disagreements = 0;
  const failuresByReason: Partial<Record<Reason, number>> = {};

  for (let trial = 0; trial < trials; trial += 1) {
    const target: Position = {
      latRad: random.nextUniform(-75 * DEG, 75 * DEG),
      lonRad: Math.PI - random.nextUniform(0, TWO_PI_RAD),
    };
    let observers: Position[];
    let trueAzimuthsRad: number[];
    do {
      observers = [0, 1, 2].map(() =>
        unwrapOk(
          destinationPosition(
            target,
            random.nextUniform(0, TWO_PI_RAD),
            random.nextUniform(1000, 20_000),
          ),
        ),
      );
      trueAzimuthsRad = observers.map((observer) => unwrapOk(initialAzimuthRad(observer, target)));
    } while (!(
      crossingAngleBetweenRad(trueAzimuthsRad[0] as number, trueAzimuthsRad[1] as number) >=
        30 * DEG &&
      crossingAngleBetweenRad(trueAzimuthsRad[0] as number, trueAzimuthsRad[2] as number) >=
        30 * DEG &&
      crossingAngleBetweenRad(trueAzimuthsRad[1] as number, trueAzimuthsRad[2] as number) >=
        30 * DEG
    ));
    const observations: Bearing[] = observers.map((observer, index) => ({
      id: `o${index}`,
      observer,
      positionAccuracyM: 0,
      timeUtcMs: 0,
      azimuthRad: _wrapTwoPi(
        (trueAzimuthsRad[index] as number) + random.nextGaussian(0, SIGMA_RAD),
      ),
      azimuthSigmaRad: SIGMA_RAD,
    }));

    const result = solve(model, observations);
    if (!result.ok) {
      failedSolves += 1;
      failuresByReason[result.reason] = (failuresByReason[result.reason] ?? 0) + 1;
      continue;
    }
    const fix = result.value;
    // The target in East and North metres at the Fix.
    const offset = unwrapOk(projectToLocalPlane(fix.position, target));
    const { semiMajorM, semiMinorM, azimuthRad } = unwrapOk(ellipse95(fix.ellipse));
    const alongMajorM = offset.eastM * Math.sin(azimuthRad) + offset.northM * Math.cos(azimuthRad);
    const acrossMajorM = offset.eastM * Math.cos(azimuthRad) - offset.northM * Math.sin(azimuthRad);
    const insideEllipse = (alongMajorM / semiMajorM) ** 2 + (acrossMajorM / semiMinorM) ** 2 <= 1;

    // The same test from the covariance: d² = xᵀ C⁻¹ x against 2.4477².
    const { varEastM2, varNorthM2, covEastNorthM2 } = fix.covariance;
    const determinant = varEastM2 * varNorthM2 - covEastNorthM2 ** 2;
    const mahalanobisSquared =
      (varNorthM2 * offset.eastM ** 2 -
        2 * covEastNorthM2 * offset.eastM * offset.northM +
        varEastM2 * offset.northM ** 2) /
      determinant;
    const insideByCovariance = mahalanobisSquared <= CONFIDENCE_95_SCALE ** 2;
    if (insideEllipse !== insideByCovariance) disagreements += 1;

    if (insideEllipse) contained += 1;
  }
  return {
    trials,
    contained,
    failedSolves,
    failuresByReason,
    ellipseCovarianceDisagreements: disagreements,
  };
}

describe('calibration (Req 8.8)', () => {
  // Statistical test with a fixed seed (testing.md). 1000 trials as Req 8.8 states.
  const SEED = 20_261_115;

  it('contains the true target in 90% to 99% of 1000 trials, counting failed solves as misses', () => {
    const result = runCalibration(SEED);
    expect(result.trials).toBe(1000);
    expect(result.contained / result.trials).toBeGreaterThanOrEqual(0.9);
    expect(result.contained / result.trials).toBeLessThanOrEqual(0.99);
    // The ellipse and the covariance it came from agree on every trial.
    expect(result.ellipseCovarianceDisagreements).toBe(0);
  });

  it('gives the identical result when run twice with the same seed', () => {
    expect(runCalibration(SEED)).toStrictEqual(runCalibration(SEED));
  });

  it('gives a different sample with a different seed', () => {
    expect(runCalibration(SEED + 1, 100)).not.toStrictEqual(runCalibration(SEED, 100));
  });
});
