// A configurable MeasurementModel for testing the solver's generic behaviour (task 12.1). Its
// observations are linear: an observation predicts `partialEastRadPerM·eastM +
// partialNorthRadPerM·northM` radians, so a solve has a known answer, and every other part of
// the model can be scripted to fail, warn, lie or count calls. It proves the solver reaches
// observations only through the MeasurementModel interface (Req 5.4, 5.6).

import type { LocalPoint } from '../local-plane';
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
  /** A failure to return for `evaluate` at this candidate, or undefined to evaluate normally. */
  readonly failAt?: (candidate: LocalPoint) => Failure | undefined;
  /** Replaces the evaluation with arbitrary, possibly hostile, numbers. */
  readonly overrideEvaluation?: (
    observation: StubObservation,
    candidate: LocalPoint,
    normal: Evaluation,
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
  /** The candidates `evaluate` was called with, in order. */
  readonly evaluatedCandidates: LocalPoint[];
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
  };
  const reportedPartialScale = options.reportedPartialScale ?? 1;

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
      return options.origin ?? ok({ latRad: 0, lonRad: 0 });
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
    evaluate(observation, candidate) {
      calls.evaluate += 1;
      calls.evaluatedCandidates.push(candidate);
      const failure = options.failAt?.(candidate);
      if (failure) return failure;
      const predictedRad =
        observation.partialEastRadPerM * candidate.eastM +
        observation.partialNorthRadPerM * candidate.northM;
      const normal: Evaluation = {
        predictedRad,
        residualRad: observation.measuredRad - predictedRad,
        effectiveSigmaRad: observation.sigmaRad,
        partialEastRadPerM: observation.partialEastRadPerM * reportedPartialScale,
        partialNorthRadPerM: observation.partialNorthRadPerM * reportedPartialScale,
      };
      return ok(options.overrideEvaluation?.(observation, candidate, normal) ?? normal);
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
