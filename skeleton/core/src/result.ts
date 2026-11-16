// Result type and the closed sets of failure reasons and warnings (Req 11.4).
//
// Expected failures are values, never exceptions. Every `Reason` below is a machine-readable
// code; the sets are closed, so adding a member is a change to the public API.

/**
 * The closed set of failure reasons.
 *
 * - `invalid_number`: a number is NaN or infinite, or an option is out of range (Req 1.9).
 * - `undefined_mean`: the circular mean does not exist (Req 1.8).
 * - `coincident_positions`: two positions are less than 1e-3 m apart (Req 2.9).
 * - `unsupported_position`: not a Supported position (Req 2.10).
 * - `invalid_observation`: an observation or wire payload is invalid (Req 4.3, 4.8, 9.9, 9.10).
 * - `unsupported_format`: unknown wire format version or kind (Req 4.7).
 * - `not_converged`: the solver did not converge within the iteration limit (Req 7.2).
 * - `singular_geometry`: the geometry cannot determine a position (Req 7.3, 9.3).
 * - `insufficient_observations`: fewer than two observations (Req 9.1).
 * - `colocated_observers`: every pair of observers is under 1 m apart (Req 9.2).
 * - `diverging_bearings`: the best fit lies behind an observer (Req 9.5).
 * - `out_of_range`: the fix is more than 500 km from the Local plane origin (Req 9.6).
 */
export type Reason =
  | 'invalid_number'
  | 'undefined_mean'
  | 'coincident_positions'
  | 'unsupported_position'
  | 'invalid_observation'
  | 'unsupported_format'
  | 'not_converged'
  | 'singular_geometry'
  | 'insufficient_observations'
  | 'colocated_observers'
  | 'diverging_bearings'
  | 'out_of_range';

/**
 * The closed set of warnings a successful Fix can carry.
 *
 * - `poor_geometry`: the largest Crossing angle is between 0.5° and 20° (Req 9.4).
 * - `outliers_excluded`: outlier rejection excluded at least one observation (Req 10.4).
 */
export type Warning = 'poor_geometry' | 'outliers_excluded';

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/** `field` names the offending field and `id` the offending observation, where they apply. */
export interface Failure {
  readonly ok: false;
  readonly reason: Reason;
  readonly field?: string;
  readonly id?: string;
}

export type Result<T> = Success<T> | Failure;

export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

/** Keys that are not supplied are left out, not set to `undefined`. */
export function err(reason: Reason, details: { field?: string; id?: string } = {}): Failure {
  const failure: { ok: false; reason: Reason; field?: string; id?: string } = {
    ok: false,
    reason,
  };
  if (details.field !== undefined) failure.field = details.field;
  if (details.id !== undefined) failure.id = details.id;
  return failure;
}
