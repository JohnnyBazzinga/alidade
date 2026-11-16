// Public API of @alidade/core. Every export goes through this file (Req 11.3).
//
// Failures are values: every fallible function returns a `Result`. The closed sets of
// failure reasons (`Reason`) and warnings (`Warning`) are documented in `result.ts`.
export { err, ok } from './result';
export type { Failure, Reason, Result, Success, Warning } from './result';
export { angularDifference, circularMean, degToRad, radToDeg, wrapPi, wrapTwoPi } from './angle';
