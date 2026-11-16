// Public API of @alidade/core. Every export goes through this file (Req 11.3).
//
// Failures are values: every fallible function returns a `Result`. The closed sets of
// failure reasons (`Reason`) and warnings (`Warning`) are documented in `result.ts`.
export { err, ok } from './result';
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
export { BearingModel } from './bearing-model';
export { solve } from './solver';
