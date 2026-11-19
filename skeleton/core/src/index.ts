// Public API of @alidade/core. Every export goes through this file (Req 11.3); nothing from
// `test-support` is exported.
//
// Failures are values: every fallible function returns a `Result`. The closed sets of failure
// reasons (`Reason`) and warnings (`Warning`) are documented in `result.ts`. The helpers that
// build Results (`ok`, `err`) are internal: as exported functions `ok(NaN)` would hand a NaN
// back to the caller, which Req 9.8 forbids.
//
// The two thresholds of the solver that an app's words quote are exported, so that no app keeps a
// copy: `OUTLIER_STUDENTISED_RESIDUAL` (Req 10.1) and `POOR_GEOMETRY_CROSSING_RAD` (Req 9.4).
export type { Failure, Reason, Result, Success, Warning } from './result';
export { angularDifference, circularMean, degToRad, radToDeg, wrapPi, wrapTwoPi } from './angle';
export {
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  isSupportedPosition,
} from './position';
export type { Position } from './position';
export { projectToLocalPlane, unprojectToLocalPlane } from './local-plane';
export type { LocalPoint } from './local-plane';
export { parseBearing, serialiseBearing, validateBearing } from './observation';
export type { Bearing, BearingWire } from './observation';
export { CONFIDENCE_95_SCALE, ellipse95, ellipseFromCovariance } from './ellipse';
export type {
  CovarianceEnM2,
  Ellipse,
  Evaluation,
  Fix,
  MeasurementModel,
  ObservationResidual,
  SolverOptions,
} from './measurement-model';
export { BearingModel, POOR_GEOMETRY_CROSSING_RAD } from './bearing-model';
export { OUTLIER_STUDENTISED_RESIDUAL, solve } from './solver';
