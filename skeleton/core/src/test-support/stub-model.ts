// A configurable MeasurementModel for testing the solver's generic behaviour (task 12.1). Its
// observations are linear in the East and North of a fixed reference plane, the Local plane of
// the stub's own origin: an observation predicts `partialEastRadPerM·eastM +
// partialNorthRadPerM·northM` radians there, so a solve has a known answer. Every other part of
// the model can be scripted to fail, warn, lie or count calls. It proves the solver reaches
// observations only through the MeasurementModel interface (Req 5.4, 5.6).
//
// Like any model, it describes positions, not plane coordinates (Req 5.2): a candidate on the
// plane of another origin, such as the Fix of design D19, is unprojected to its position and
// re-projected onto the reference plane, and the partials are carried across by the Jacobian
// between the two planes.

import { projectToLocalPlane, unprojectToLocalPlane, type LocalPoint } from '../local-plane';
import type { Evaluation, Fix, MeasurementModel } from '../measurement-model';
import type { Position } from '../position';
import { err, ok, type Failure, type Result, type Warning } from '../result';

/** A linear observation: it measures `measuredRad` of `east·partialEast + north·partialNorth`. */
export interface StubObservation {
  readonly id: string;
  readonly partialEastRadPerM: number;
  readonly partialNorthRadPerM: number;
  readonly measuredRad: number;
  readonly sigmaRad: number;
}

/** The linear observation that reads exactly what it predicts at `truth`. */
export function stubObservation(
  id: string,
  partialEastRadPerM: number,
  partialNorthRadPerM: number,
  truth: LocalPoint,
  sigmaRad = 0.01,
): StubObservation {
  return {
    id,
    partialEastRadPerM,
    partialNorthRadPerM,
    measuredRad: partialEastRadPerM * truth.eastM + partialNorthRadPerM * truth.northM,
    sigmaRad,
  };
}

export interface StubModelOptions {
  /** The Local plane origin. Default the equator at 0°. */
  readonly origin?: Result<Position>;
  /** The starting estimate. Default (0, 0). */
  readonly start?: Result<LocalPoint>;
  /** Failures for `validate`, keyed by observation id: the field to name. */
  readonly invalidFields?: Readonly<Record<string, string>>;
  /** The geometry check. `call` counts from 1: 1 is the pre-solve run, 2 the post-exclusion one. */
  readonly geometryCheck?: (
    observations: readonly StubObservation[],
    call: number,
  ) => Result<{ readonly warnings: readonly Warning[] }>;
  /** The post-solve check. Default success with no warnings. */
  readonly postSolveCheck?: (
    fix: Fix,
    origin: Position,
    observations: readonly StubObservation[],
  ) => Result<{ readonly warnings: readonly Warning[] }>;
  /**
   * Multiplies the partial derivatives the model reports, not the ones it uses to predict. A
   * value other than 1 is a model whose Jacobian is wrong by that factor, so the Gauss-Newton
   * step is 1/factor times too long: 0.4 overshoots to 2.5 times the step.
   */
  readonly reportedPartialScale?: number;
  /**
   * A failure to return for `evaluate` at this point of the reference plane, or undefined to
   * evaluate normally.
   */
  readonly failAt?: (candidate: LocalPoint) => Failure | undefined;
  /**
   * A failure to return for `evaluate` of this observation at this point of the reference plane,
   * or undefined to evaluate normally (for leaving one out, Req 10.7).
   */
  readonly failFor?: (observation: StubObservation, point: LocalPoint) => Failure | undefined;
  /**
   * Replaces the evaluation with arbitrary, possibly hostile, numbers. `point` is where the
   * candidate lies on the reference plane, whatever origin it was given on.
   */
  readonly overrideEvaluation?: (
    observation: StubObservation,
    candidate: LocalPoint,
    normal: Evaluation,
    point: LocalPoint,
  ) => Evaluation;
}

export interface StubCalls {
  validate: number;
  idOf: number;
  origin: number;
  startEstimate: number;
  geometryCheck: number;
  evaluate: number;
  postSolveCheck: number;
  /** The arguments of each postSolveCheck call. */
  readonly postSolveArguments: {
    fix: Fix;
    origin: Position;
    observationIds: readonly string[];
  }[];
  /** The candidates `evaluate` was called with, in order, as given (on the plane of `origin`). */
  readonly evaluatedCandidates: LocalPoint[];
  /** The origins `evaluate` was called with, in order. */
  readonly evaluatedOrigins: Position[];
}

export interface StubModel extends MeasurementModel<StubObservation> {
  readonly calls: StubCalls;
}

export function createStubModel(options: StubModelOptions = {}): StubModel {
  const calls: StubCalls = {
    validate: 0,
    idOf: 0,
    origin: 0,
    startEstimate: 0,
    geometryCheck: 0,
    evaluate: 0,
    postSolveCheck: 0,
    postSolveArguments: [],
    evaluatedCandidates: [],
    evaluatedOrigins: [],
  };
  const reportedPartialScale = options.reportedPartialScale ?? 1;
  const referenceOrigin: Result<Position> = options.origin ?? ok({ latRad: 0, lonRad: 0 });

  /** The point of the reference plane at `candidate` on the plane of `origin`. */
  const toReference = (candidate: LocalPoint, origin: Position): Result<LocalPoint> => {
    if (!referenceOrigin.ok || origin === referenceOrigin.value) return ok(candidate);
    const position = unprojectToLocalPlane(origin, candidate);
    if (!position.ok) return position;
    return projectToLocalPlane(referenceOrigin.value, position.value);
  };

  /**
   * ∂(reference east, north)/∂(east, north) on the plane of `origin`, by central differences
   * with a 1 m step: the identity when `origin` is the reference itself. The map between two
   * Local planes is nearly linear (its curvature is of order 1/R), so a 1 m step has a
   * truncation error near (1 m / R)² ≈ 2.5e-14 and a rounding error near 1e-14.
   */
  const jacobianToReference = (
    candidate: LocalPoint,
    origin: Position,
  ): Result<readonly [number, number, number, number]> => {
    if (!referenceOrigin.ok || origin === referenceOrigin.value) return ok([1, 0, 0, 1]);
    const stepM = 1;
    const at = (eastM: number, northM: number) => toReference({ eastM, northM }, origin);
    const east = [
      at(candidate.eastM + stepM, candidate.northM),
      at(candidate.eastM - stepM, candidate.northM),
    ];
    const north = [
      at(candidate.eastM, candidate.northM + stepM),
      at(candidate.eastM, candidate.northM - stepM),
    ];
    for (const point of [...east, ...north]) if (!point.ok) return point;
    const [eastPlus, eastMinus] = east.map((point) => (point as { value: LocalPoint }).value) as [
      LocalPoint,
      LocalPoint,
    ];
    const [northPlus, northMinus] = north.map(
      (point) => (point as { value: LocalPoint }).value,
    ) as [LocalPoint, LocalPoint];
    return ok([
      (eastPlus.eastM - eastMinus.eastM) / (2 * stepM),
      (northPlus.eastM - northMinus.eastM) / (2 * stepM),
      (eastPlus.northM - eastMinus.northM) / (2 * stepM),
      (northPlus.northM - northMinus.northM) / (2 * stepM),
    ]);
  };

  return {
    calls,
    validate(observation) {
      calls.validate += 1;
      const field = options.invalidFields?.[observation.id];
      return field === undefined
        ? ok(undefined)
        : err('invalid_observation', { field, id: observation.id });
    },
    idOf(observation) {
      calls.idOf += 1;
      return observation.id;
    },
    origin() {
      calls.origin += 1;
      return referenceOrigin;
    },
    startEstimate() {
      calls.startEstimate += 1;
      return options.start ?? ok({ eastM: 0, northM: 0 });
    },
    geometryCheck(observations) {
      calls.geometryCheck += 1;
      return options.geometryCheck
        ? options.geometryCheck(observations, calls.geometryCheck)
        : ok({ warnings: [] });
    },
    evaluate(observation, candidate, origin) {
      calls.evaluate += 1;
      calls.evaluatedCandidates.push(candidate);
      calls.evaluatedOrigins.push(origin);
      const point = toReference(candidate, origin);
      if (!point.ok) return point;
      const failure = options.failAt?.(point.value) ?? options.failFor?.(observation, point.value);
      if (failure) return failure;
      const jacobian = jacobianToReference(candidate, origin);
      if (!jacobian.ok) return jacobian;
      const [eastFromEast, eastFromNorth, northFromEast, northFromNorth] = jacobian.value;
      const predictedRad =
        observation.partialEastRadPerM * point.value.eastM +
        observation.partialNorthRadPerM * point.value.northM;
      const normal: Evaluation = {
        predictedRad,
        residualRad: observation.measuredRad - predictedRad,
        effectiveSigmaRad: observation.sigmaRad,
        partialEastRadPerM:
          (observation.partialEastRadPerM * eastFromEast +
            observation.partialNorthRadPerM * northFromEast) *
          reportedPartialScale,
        partialNorthRadPerM:
          (observation.partialEastRadPerM * eastFromNorth +
            observation.partialNorthRadPerM * northFromNorth) *
          reportedPartialScale,
      };
      return ok(
        options.overrideEvaluation?.(observation, candidate, normal, point.value) ?? normal,
      );
    },
    postSolveCheck(fix, origin, observations) {
      calls.postSolveCheck += 1;
      calls.postSolveArguments.push({
        fix,
        origin,
        observationIds: observations.map((observation) => observation.id),
      });
      return options.postSolveCheck
        ? options.postSolveCheck(fix, origin, observations)
        : ok({ warnings: [] });
    },
  };
}
