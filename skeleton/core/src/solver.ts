// The fix solver (Req 7, 8.1, 9.1, 9.9 to 9.11, 10), design §7.5 steps 0 to 11.
//
// The solver is generic over the observation type `O`: it reaches observations only through a
// `MeasurementModel<O>` (Req 5.4, 5.6, 5.7) and imports nothing specific to bearings. It
// estimates the unknown position on the Local plane of the model's origin by iterative weighted
// least squares (Gauss-Newton with step halving), re-evaluating every Effective sigma at every
// iteration.

import { _symmetricEigenvalues, ellipseFromCovariance } from './ellipse';
import { unprojectToLocalPlane, type LocalPoint } from './local-plane';
import type {
  CovarianceEnM2,
  Evaluation,
  Fix,
  MeasurementModel,
  ObservationResidual,
  SolverOptions,
} from './measurement-model';
import type { Position } from './position';
import { err, ok, type Failure, type Result, type Warning } from './result';

/** Default and largest iteration limit of one solve (Req 7.2). */
export const MAX_ITERATIONS = 50;
/** A solve has converged when an iteration moves the estimate by less than this (Req 7.2). */
export const CONVERGENCE_STEP_M = 1e-4;
/** Times a step that raises the cost is halved before the smallest is taken (design D14). */
export const MAX_STEP_HALVINGS = 8;
/** Above this condition number the normal matrix is singular (Req 7.3). */
export const MAX_CONDITION_NUMBER = 1e12;
/** An observation whose |Normalised residual| exceeds this is an outlier (Req 10.1). */
export const OUTLIER_NORMALISED_RESIDUAL = 3.5;
/** Outlier exclusion runs only while at least this many observations remain (Req 10.1, 10.2). */
const MIN_OBSERVATIONS_FOR_EXCLUSION = 4;

/** The centre of the Local plane whose origin is the Fix (design D19). */
const FIX_CENTRE: LocalPoint = { eastM: 0, northM: 0 };

/** Every evaluation at one candidate, and the weighted normal equations built from them. */
interface Linearisation {
  readonly evaluations: readonly Evaluation[];
  /** JᵀWJ = [[eastEast, eastNorth], [eastNorth, northNorth]], in 1/m². */
  readonly eastEast: number;
  readonly eastNorth: number;
  readonly northNorth: number;
  /** JᵀW r, in 1/m. */
  readonly gradientEast: number;
  readonly gradientNorth: number;
  /** Σ (r / σ)². */
  readonly cost: number;
}

function isFiniteEvaluation(evaluation: Evaluation): boolean {
  return (
    Number.isFinite(evaluation.predictedRad) &&
    Number.isFinite(evaluation.residualRad) &&
    Number.isFinite(evaluation.effectiveSigmaRad) &&
    Number.isFinite(evaluation.partialEastRadPerM) &&
    Number.isFinite(evaluation.partialNorthRadPerM) &&
    evaluation.effectiveSigmaRad > 0
  );
}

/**
 * Evaluates every observation at `candidate` and accumulates JᵀWJ, JᵀW r and the cost, in the
 * canonical order of `observations` (§7.5 step 6, first bullet). A failed evaluation is returned
 * (design D15); a successful one with a non-finite number or an Effective sigma not greater than
 * zero gives `invalid_number` (design D17).
 */
function linearise<O>(
  model: MeasurementModel<O>,
  observations: readonly O[],
  candidate: LocalPoint,
  origin: Position,
): Result<Linearisation> {
  const evaluations: Evaluation[] = [];
  let eastEast = 0;
  let eastNorth = 0;
  let northNorth = 0;
  let gradientEast = 0;
  let gradientNorth = 0;
  let cost = 0;
  for (const observation of observations) {
    const evaluation = model.evaluate(observation, candidate, origin);
    if (!evaluation.ok) return evaluation;
    if (!isFiniteEvaluation(evaluation.value)) return err('invalid_number');
    const { residualRad, effectiveSigmaRad, partialEastRadPerM, partialNorthRadPerM } =
      evaluation.value;
    const weight = 1 / (effectiveSigmaRad * effectiveSigmaRad);
    eastEast += weight * partialEastRadPerM * partialEastRadPerM;
    eastNorth += weight * partialEastRadPerM * partialNorthRadPerM;
    northNorth += weight * partialNorthRadPerM * partialNorthRadPerM;
    gradientEast += weight * partialEastRadPerM * residualRad;
    gradientNorth += weight * partialNorthRadPerM * residualRad;
    cost += (residualRad / effectiveSigmaRad) ** 2;
    evaluations.push(evaluation.value);
  }
  return ok({ evaluations, eastEast, eastNorth, northNorth, gradientEast, gradientNorth, cost });
}

/**
 * The cost at a step-control trial point, with the sigmas of the current iteration held
 * (§7.5 step 6, step control). The trial evaluations supply only the residuals. A failed
 * evaluation is returned as the failure.
 */
function trialCost<O>(
  model: MeasurementModel<O>,
  observations: readonly O[],
  sigmasRad: readonly number[],
  candidate: LocalPoint,
  origin: Position,
): Result<number> {
  let cost = 0;
  for (let index = 0; index < observations.length; index += 1) {
    const evaluation = model.evaluate(observations[index] as O, candidate, origin);
    if (!evaluation.ok) return evaluation;
    cost += (evaluation.value.residualRad / (sigmasRad[index] as number)) ** 2;
  }
  return ok(cost);
}

/**
 * The eigenvalue gate on JᵀWJ, used in the solve loop (§7.5 step 6) and at the Fix (step 9):
 * `singular_geometry` unless both eigenvalues are greater than zero (a positive test, so that a
 * NaN fails it; design D14), then if the condition number exceeds 1e12 (Req 7.3).
 */
function eigenvalueGate(linearisation: Linearisation): Result<void> {
  const { largestEigenvalue, smallestEigenvalue } = _symmetricEigenvalues(
    linearisation.eastEast,
    linearisation.eastNorth,
    linearisation.northNorth,
  );
  if (!(largestEigenvalue > 0 && smallestEigenvalue > 0)) return err('singular_geometry');
  if (largestEigenvalue / smallestEigenvalue > MAX_CONDITION_NUMBER) {
    return err('singular_geometry');
  }
  return ok(undefined);
}

interface Solution {
  readonly candidate: LocalPoint;
  readonly iterations: number;
}

/** The solve loop, §7.5 step 6, from `start` on the Local plane of `origin`. */
function solveLoop<O>(
  model: MeasurementModel<O>,
  observations: readonly O[],
  start: LocalPoint,
  origin: Position,
  maxIterations: number,
): Result<Solution> {
  let candidate = start;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const linearisation = linearise(model, observations, candidate, origin);
    if (!linearisation.ok) return linearisation;
    const { eastEast, eastNorth, northNorth, gradientEast, gradientNorth, cost } =
      linearisation.value;

    const gate = eigenvalueGate(linearisation.value);
    if (!gate.ok) return gate;

    // Δ = (JᵀWJ)⁻¹ JᵀW r, closed form for the symmetric 2×2 matrix.
    const determinant = eastEast * northNorth - eastNorth * eastNorth;
    const stepEastM = (northNorth * gradientEast - eastNorth * gradientNorth) / determinant;
    const stepNorthM = (eastEast * gradientNorth - eastNorth * gradientEast) / determinant;

    // Step control (design D14, D15): the first of Δ, Δ/2, ..., Δ/2⁸ whose cost, with this
    // iteration's sigmas held, does not exceed the cost here. A trial point that fails to
    // evaluate counts as a cost increase. If none qualifies the smallest is taken, unless it
    // failed to evaluate, in which case its failure is returned.
    const sigmasRad = linearisation.value.evaluations.map(
      (evaluation) => evaluation.effectiveSigmaRad,
    );
    let acceptedScale: number | undefined;
    let smallestFailure: Failure | undefined;
    for (let halvings = 0; halvings <= MAX_STEP_HALVINGS; halvings += 1) {
      const scale = 2 ** -halvings;
      const trial = trialCost(
        model,
        observations,
        sigmasRad,
        {
          eastM: candidate.eastM + scale * stepEastM,
          northM: candidate.northM + scale * stepNorthM,
        },
        origin,
      );
      const isSmallest = halvings === MAX_STEP_HALVINGS;
      if (!trial.ok) {
        if (isSmallest) smallestFailure = trial;
        continue;
      }
      if (trial.value <= cost) {
        acceptedScale = scale;
        break;
      }
      if (isSmallest) acceptedScale = scale;
    }
    if (acceptedScale === undefined) {
      // Only reached when the smallest step failed to evaluate.
      return smallestFailure ?? err('invalid_number');
    }

    const acceptedEastM = acceptedScale * stepEastM;
    const acceptedNorthM = acceptedScale * stepNorthM;
    candidate = {
      eastM: candidate.eastM + acceptedEastM,
      northM: candidate.northM + acceptedNorthM,
    };
    if (Math.hypot(acceptedEastM, acceptedNorthM) < CONVERGENCE_STEP_M) {
      return ok({ candidate, iterations: iteration });
    }
  }
  return err('not_converged');
}

/** Lexicographic comparison of two ids, by UTF-16 code unit. */
function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function allFinite(values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

/**
 * Estimates the unknown Position from `observations` with `model` (design §7.5).
 *
 * Returns a Fix with its covariance, 1-sigma error ellipse, residuals, iteration count, warnings
 * and excluded ids (Req 7.9, 8.1, 8.2, 10.4), or a failure. It never throws and never returns a
 * NaN or an infinity for type-correct input (Req 9.8, design D17).
 */
export function solve<O>(
  model: MeasurementModel<O>,
  observations: readonly O[],
  options: SolverOptions = {},
): Result<Fix> {
  // Step 0: options (design D10).
  const outlierRejection = options.outlierRejection ?? false;
  const maxIterations = options.maxIterations ?? MAX_ITERATIONS;
  if (!(Number.isInteger(maxIterations) && maxIterations >= 1 && maxIterations <= MAX_ITERATIONS)) {
    return err('invalid_number', { field: 'maxIterations' });
  }

  // Step 1: canonicalise by id and reject duplicate ids (design D3, Req 9.10).
  const withIds = observations.map((observation) => ({ observation, id: model.idOf(observation) }));
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id } of withIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    const smallestDuplicate = [...duplicates].sort(compareIds)[0] as string;
    return err('invalid_observation', { field: 'id', id: smallestDuplicate });
  }
  const canonical = [...withIds].sort((left, right) => compareIds(left.id, right.id));
  const canonicalObservations = canonical.map((entry) => entry.observation);

  // Step 2: validate every observation; the first failure is returned (design D6, Req 9.9).
  for (const observation of canonicalObservations) {
    const validation = model.validate(observation);
    if (!validation.ok) return validation;
  }

  // Step 3: count (Req 9.1).
  if (canonicalObservations.length < 2) return err('insufficient_observations');

  // Step 4: the pre-solve geometry check; only its failures are acted on (design D5).
  const preSolveGeometry = model.geometryCheck(canonicalObservations);
  if (!preSolveGeometry.ok) return preSolveGeometry;

  // Step 5: the solve origin and the starting estimate.
  const origin = model.origin(canonicalObservations);
  if (!origin.ok) return origin;
  const start = model.startEstimate(canonicalObservations, origin.value);
  if (!start.ok) return start;

  // Step 6: the solve loop.
  let solution = solveLoop(model, canonicalObservations, start.value, origin.value, maxIterations);
  if (!solution.ok) return solution;

  // Step 7: outlier rejection (Req 10.1 to 10.4).
  let remaining = canonical;
  const excludedIds: string[] = [];
  if (outlierRejection) {
    while (remaining.length >= MIN_OBSERVATIONS_FOR_EXCLUSION) {
      const atSolution = linearise(
        model,
        remaining.map((entry) => entry.observation),
        solution.value.candidate,
        origin.value,
      );
      if (!atSolution.ok) return atSolution;
      // The largest |normalised residual|; `>` keeps the first, so a tie goes to the smallest
      // id in the canonical order (design D4).
      let worstIndex = 0;
      let worstMagnitude = -1;
      atSolution.value.evaluations.forEach((evaluation, index) => {
        const magnitude = Math.abs(evaluation.residualRad / evaluation.effectiveSigmaRad);
        if (magnitude > worstMagnitude) {
          worstMagnitude = magnitude;
          worstIndex = index;
        }
      });
      if (!(worstMagnitude > OUTLIER_NORMALISED_RESIDUAL)) break;

      excludedIds.push((remaining[worstIndex] as { id: string }).id);
      remaining = remaining.filter((_entry, index) => index !== worstIndex);
      solution = solveLoop(
        model,
        remaining.map((entry) => entry.observation),
        solution.value.candidate,
        origin.value,
        maxIterations,
      );
      if (!solution.ok) return solution;
    }
  }
  const remainingObservations = remaining.map((entry) => entry.observation);

  // Step 8: the geometry check again, on the observations that remain (design D5, Req 9.11).
  const postExclusionGeometry = model.geometryCheck(remainingObservations);
  if (!postExclusionGeometry.ok) return postExclusionGeometry;

  // Step 9: uncertainty and Fix assembly, at the solution. The covariance is expressed in East
  // and North at the Fix itself (Req 8.1, design D19): the observations are evaluated on the
  // Local plane whose origin is the Fix, at its centre (0, 0), where that plane's axes are true
  // east and true north. The solve origin's plane is turned and stretched at the Fix by meridian
  // convergence and by the projection's scale, so its JᵀWJ would not be in those axes.
  const position = unprojectToLocalPlane(origin.value, solution.value.candidate);
  if (!position.ok) return position;
  const atFix = linearise(model, remainingObservations, FIX_CENTRE, position.value);
  if (!atFix.ok) return atFix;
  const gateAtFix = eigenvalueGate(atFix.value);
  if (!gateAtFix.ok) return gateAtFix;
  const { eastEast, eastNorth, northNorth, evaluations } = atFix.value;
  const determinant = eastEast * northNorth - eastNorth * eastNorth;
  const covariance: CovarianceEnM2 = {
    varEastM2: northNorth / determinant,
    varNorthM2: eastEast / determinant,
    covEastNorthM2: -eastNorth / determinant,
  };
  const ellipse = ellipseFromCovariance(covariance);
  if (!ellipse.ok) return ellipse;
  const residuals: ObservationResidual[] = evaluations.map((evaluation, index) => ({
    id: (remaining[index] as { id: string }).id,
    residualRad: evaluation.residualRad,
    normalisedResidual: evaluation.residualRad / evaluation.effectiveSigmaRad,
  }));

  const warnings: Warning[] = [];
  if (postExclusionGeometry.value.warnings.includes('poor_geometry')) {
    warnings.push('poor_geometry');
  }
  if (excludedIds.length > 0) warnings.push('outliers_excluded');

  const fixNumbers = [
    position.value.latRad,
    position.value.lonRad,
    covariance.varEastM2,
    covariance.varNorthM2,
    covariance.covEastNorthM2,
    ellipse.value.semiMajorM,
    ellipse.value.semiMinorM,
    ellipse.value.azimuthRad,
    ...residuals.flatMap((entry) => [entry.residualRad, entry.normalisedResidual]),
  ];
  if (!allFinite(fixNumbers)) return err('invalid_number');

  const fix: Fix = {
    position: position.value,
    covariance,
    ellipse: ellipse.value,
    residuals,
    iterations: solution.value.iterations,
    warnings,
    excludedIds,
  };

  // Step 10: the post-solve check, on the observations that remain, with the solve origin.
  const postSolve = model.postSolveCheck(fix, origin.value, remainingObservations);
  if (!postSolve.ok) return postSolve;

  // Step 11.
  return ok({ ...fix, warnings: [...warnings, ...postSolve.value.warnings] });
}
