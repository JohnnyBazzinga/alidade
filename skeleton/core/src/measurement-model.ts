// The Measurement model interface the solver depends on (Req 5), and the types a solve returns
// (Req 7.9, 8.1, 8.2, 10.4). Nothing here is specific to one kind of observation: the solver
// sees observations only as the opaque type `O` and reaches them through a `MeasurementModel<O>`.

import type { LocalPoint } from './local-plane';
import type { Position } from './position';
import type { Result, Warning } from './result';

/** Symmetric 2×2 covariance of an East-North position, in square metres (Req 8.1). */
export interface CovarianceEnM2 {
  readonly varEastM2: number;
  readonly varNorthM2: number;
  readonly covEastNorthM2: number;
}

/**
 * An error ellipse (Req 8.2): 1-sigma semi-axes in metres (`semiMajorM ≥ semiMinorM > 0`) and the
 * azimuth of the major axis, clockwise from north, in [0, π). A circular ellipse has azimuth 0.
 */
export interface Ellipse {
  readonly semiMajorM: number;
  readonly semiMinorM: number;
  readonly azimuthRad: number;
}

/** The residual of one observation at the Fix (Req 7.9). */
export interface ObservationResidual {
  readonly id: string;
  /** `wrapPi(measured - predicted)`, in radians. */
  readonly residualRad: number;
  /** The residual divided by the observation's Effective sigma. */
  readonly normalisedResidual: number;
}

/** The solver's estimate of the unknown Position, always with its uncertainty (Req 7.9, 8.1). */
export interface Fix {
  readonly position: Position;
  readonly covariance: CovarianceEnM2;
  /** The 1-sigma error ellipse of `covariance`. Use `ellipse95` for the 95% ellipse. */
  readonly ellipse: Ellipse;
  /** One entry per observation that was used, not per excluded one. */
  readonly residuals: readonly ObservationResidual[];
  /** Iterations of the final solve. */
  readonly iterations: number;
  readonly warnings: readonly Warning[];
  /** Ids of observations excluded as outliers, empty when none. */
  readonly excludedIds: readonly string[];
}

export interface SolverOptions {
  /** Exclude outliers (Req 10.1). Default false. */
  readonly outlierRejection?: boolean;
  /** Iteration limit of one solve: an integer in [1, 50]. Default 50 (Req 7.2). */
  readonly maxIterations?: number;
}

/** What a model returns for one observation at one candidate state (Req 5.2). */
export interface Evaluation {
  /** The measurement the observation should read at the candidate, in radians. */
  readonly predictedRad: number;
  /** `wrapPi(measured - predicted)`, in radians. */
  readonly residualRad: number;
  /** The 1-sigma that weights this observation, in radians, greater than zero. */
  readonly effectiveSigmaRad: number;
  /** Partial derivative of the prediction with respect to East, radians per metre. */
  readonly partialEastRadPerM: number;
  /** Partial derivative of the prediction with respect to North, radians per metre. */
  readonly partialNorthRadPerM: number;
}

/**
 * A kind of observation, as the solver sees it. `O` is the observation type.
 *
 * Every method returns a Result or a plain value, never throws, and never returns NaN or an
 * infinity (design D17).
 */
export interface MeasurementModel<O> {
  /** Validates one observation. A failure names the observation id and the field (Req 5.7, 9.9). */
  validate(observation: O): Result<void>;
  /** The id used to put observations in a canonical order and to detect duplicates (Req 5.7). */
  idOf(observation: O): string;

  /** The Local plane origin, computed from the full set of observations (Req 5.1). */
  origin(observations: readonly O[]): Result<Position>;
  /** The starting estimate on the Local plane of `origin` (Req 5.1). */
  startEstimate(observations: readonly O[], origin: Position): Result<LocalPoint>;
  /**
   * The geometry check (Req 5.1, 9.2, 9.3, 9.4, 9.11). A failure rejects the set; a success may
   * carry the `poor_geometry` warning. The solver runs it before solving and again on the
   * observations that remain after outlier exclusion.
   */
  geometryCheck(observations: readonly O[]): Result<{ readonly warnings: readonly Warning[] }>;

  /**
   * What `observation` should read at `candidate` on the Local plane of `origin`, how far the
   * measurement is from that, its Effective sigma and the partial derivatives (Req 5.2). Fails
   * when the candidate is not a valid state for this observation (design D15).
   *
   * The candidate is a point on the plane of `origin`, so a model must describe the same
   * position whatever the origin: the solver evaluates on the solve origin's plane during the
   * solve, and on the Fix's own plane at the Fix, where its axes are East and North (design D19).
   */
  evaluate(observation: O, candidate: LocalPoint, origin: Position): Result<Evaluation>;

  /**
   * The post-solve plausibility check (Req 5.3), run on the observations that remain. It can
   * reject the Fix with a failure or attach warnings. `origin` is the origin the Fix was solved
   * in (design D7).
   */
  postSolveCheck(
    fix: Fix,
    origin: Position,
    observations: readonly O[],
  ): Result<{ readonly warnings: readonly Warning[] }>;
}
