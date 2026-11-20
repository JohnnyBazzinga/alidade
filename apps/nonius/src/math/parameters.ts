// The parameters of Nonius as one record (Req 14.2, 14.3, design D21). Each function of the Math
// layer takes the values it needs as an argument and reads no default; `defaultParameters` is
// called once, in `main.tsx`, in the simulation and in tests (a purity rule).

import {
  ADVICE_SCAN_HORIZON_MS,
  ADVICE_SCAN_STEP_MS,
  ADVICE_TURN_RAD,
  AIM_SIGMA_RAD,
  BEST_TIME_HORIZON_MS,
  BEST_TIME_STEP_MS,
  CIRCLE_ARC_HALF_LENGTH_FACTOR,
  CIRCLE_ARC_STEP_RAD,
  CROSSING_COST_MARGIN,
  FAIR_ELLIPSE_RATIO,
  FIRST_WAIT_MS,
  INDEX_ERROR_OLD_MS,
  LOCATION_COARSE_LIMIT_M,
  LONG_ELLIPSE_RATIO,
  MAX_FIX_SEMI_MAJOR_95_M,
  MAX_INDEX_ERROR_RAD,
  MAX_RECENTRE_ROUNDS,
  MAX_SIGHT_ALTITUDE_RAD,
  MAX_SIGHTS,
  MIN_SIGHT_ALTITUDE_RAD,
  PLANE_LIMIT_M,
  RECENTRE_TOLERANCE_M,
  REFRACTION_SIGMA_FRACTION,
  SAME_FIX_DISTANCE_M,
  SENSITIVITY_STEP_RAD,
  SIMULATION_LOCATION_ACCURACY_M,
  SIMULATION_TAP_SIGMA_PX,
  SUN_ALTITUDE_SIGMA_RAD,
  SUN_MODEL_END_UTC_MS,
  SUN_MODEL_START_UTC_MS,
  SUN_SIDE_TOLERANCE_RAD,
} from '../defaults';
import { err, ok, type NoniusResult } from '../result';

export interface NoniusParameters {
  readonly sunModelStartUtcMs: number;
  readonly sunModelEndUtcMs: number;
  readonly minSightAltitudeRad: number;
  readonly maxSightAltitudeRad: number;
  readonly aimSigmaRad: number;
  readonly refractionSigmaFraction: number;
  readonly sunSideToleranceRad: number;
  readonly crossingCostMargin: number;
  readonly sameFixDistanceM: number;
  readonly maxFixSemiMajor95M: number;
  readonly planeLimitM: number;
  readonly recentreToleranceM: number;
  readonly maxRecentreRounds: number;
  readonly sensitivityStepRad: number;
  readonly maxIndexErrorRad: number;
  readonly indexErrorOldMs: number;
  readonly sunAltitudeSigmaRad: number;
  readonly maxSights: number;
  readonly firstWaitMs: number;
  readonly adviceTurnRad: number;
  readonly adviceScanStepMs: number;
  readonly adviceScanHorizonMs: number;
  readonly bestTimeStepMs: number;
  readonly bestTimeHorizonMs: number;
  readonly fairEllipseRatio: number;
  readonly longEllipseRatio: number;
  readonly circleArcHalfLengthFactor: number;
  readonly circleArcStepRad: number;
  readonly locationCoarseLimitM: number;
  readonly simulationTapSigmaPx: number;
  readonly simulationLocationAccuracyM: number;
}

/** The record of the constants of `defaults.ts`. */
export function defaultParameters(): NoniusParameters {
  return Object.freeze({
    sunModelStartUtcMs: SUN_MODEL_START_UTC_MS,
    sunModelEndUtcMs: SUN_MODEL_END_UTC_MS,
    minSightAltitudeRad: MIN_SIGHT_ALTITUDE_RAD,
    maxSightAltitudeRad: MAX_SIGHT_ALTITUDE_RAD,
    aimSigmaRad: AIM_SIGMA_RAD,
    refractionSigmaFraction: REFRACTION_SIGMA_FRACTION,
    sunSideToleranceRad: SUN_SIDE_TOLERANCE_RAD,
    crossingCostMargin: CROSSING_COST_MARGIN,
    sameFixDistanceM: SAME_FIX_DISTANCE_M,
    maxFixSemiMajor95M: MAX_FIX_SEMI_MAJOR_95_M,
    planeLimitM: PLANE_LIMIT_M,
    recentreToleranceM: RECENTRE_TOLERANCE_M,
    maxRecentreRounds: MAX_RECENTRE_ROUNDS,
    sensitivityStepRad: SENSITIVITY_STEP_RAD,
    maxIndexErrorRad: MAX_INDEX_ERROR_RAD,
    indexErrorOldMs: INDEX_ERROR_OLD_MS,
    sunAltitudeSigmaRad: SUN_ALTITUDE_SIGMA_RAD,
    maxSights: MAX_SIGHTS,
    firstWaitMs: FIRST_WAIT_MS,
    adviceTurnRad: ADVICE_TURN_RAD,
    adviceScanStepMs: ADVICE_SCAN_STEP_MS,
    adviceScanHorizonMs: ADVICE_SCAN_HORIZON_MS,
    bestTimeStepMs: BEST_TIME_STEP_MS,
    bestTimeHorizonMs: BEST_TIME_HORIZON_MS,
    fairEllipseRatio: FAIR_ELLIPSE_RATIO,
    longEllipseRatio: LONG_ELLIPSE_RATIO,
    circleArcHalfLengthFactor: CIRCLE_ARC_HALF_LENGTH_FACTOR,
    circleArcStepRad: CIRCLE_ARC_STEP_RAD,
    locationCoarseLimitM: LOCATION_COARSE_LIMIT_M,
    simulationTapSigmaPx: SIMULATION_TAP_SIGMA_PX,
    simulationLocationAccuracyM: SIMULATION_LOCATION_ACCURACY_M,
  });
}

/** The fields in the order of the record, which is the order `checkParameters` reports in. */
const FIELD_ORDER: readonly (keyof NoniusParameters)[] = [
  'sunModelStartUtcMs',
  'sunModelEndUtcMs',
  'minSightAltitudeRad',
  'maxSightAltitudeRad',
  'aimSigmaRad',
  'refractionSigmaFraction',
  'sunSideToleranceRad',
  'crossingCostMargin',
  'sameFixDistanceM',
  'maxFixSemiMajor95M',
  'planeLimitM',
  'recentreToleranceM',
  'maxRecentreRounds',
  'sensitivityStepRad',
  'maxIndexErrorRad',
  'indexErrorOldMs',
  'sunAltitudeSigmaRad',
  'maxSights',
  'firstWaitMs',
  'adviceTurnRad',
  'adviceScanStepMs',
  'adviceScanHorizonMs',
  'bestTimeStepMs',
  'bestTimeHorizonMs',
  'fairEllipseRatio',
  'longEllipseRatio',
  'circleArcHalfLengthFactor',
  'circleArcStepRad',
  'locationCoarseLimitM',
  'simulationTapSigmaPx',
  'simulationLocationAccuracyM',
];

/** Checks a field is a finite number (also for a value that is not a number at run time). */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks the parameters (Req 14.3). Returns `invalid_number` naming the first field, in the
 * order of the record, that is not a finite positive number; then the first inconsistency, in
 * this order: the Sun wrapper's start not before its end; the minimum altitude not below the
 * maximum or not in (0°, 90°), the maximum not below 90°; the Sun side tolerance or the advice
 * turn not below 90°; the largest Index error not below 45°; `maxSights` not an integer from 2
 * to 64; `maxRecentreRounds` not an integer from 2 to 10; a step not below its horizon;
 * `fairEllipseRatio` not above 1; `longEllipseRatio` not above `fairEllipseRatio`. On success
 * the record is returned as it is.
 */
export function checkParameters(parameters: NoniusParameters): NoniusResult<NoniusParameters> {
  for (const field of FIELD_ORDER) {
    const value: unknown = parameters[field];
    if (!isFiniteNumber(value) || value <= 0) return err('invalid_number', { field });
  }
  const p = parameters;
  const right = Math.PI / 2;
  const bad = (field: keyof NoniusParameters) => err('invalid_number', { field });
  if (p.sunModelStartUtcMs >= p.sunModelEndUtcMs) return bad('sunModelStartUtcMs');
  if (p.minSightAltitudeRad >= right || p.minSightAltitudeRad >= p.maxSightAltitudeRad) {
    return bad('minSightAltitudeRad');
  }
  if (p.maxSightAltitudeRad >= right) return bad('maxSightAltitudeRad');
  if (p.sunSideToleranceRad >= right) return bad('sunSideToleranceRad');
  if (p.adviceTurnRad >= right) return bad('adviceTurnRad');
  if (p.maxIndexErrorRad >= right / 2) return bad('maxIndexErrorRad');
  if (!Number.isInteger(p.maxSights) || p.maxSights < 2 || p.maxSights > 64) {
    return bad('maxSights');
  }
  if (
    !Number.isInteger(p.maxRecentreRounds) ||
    p.maxRecentreRounds < 2 ||
    p.maxRecentreRounds > 10
  ) {
    return bad('maxRecentreRounds');
  }
  if (p.adviceScanStepMs >= p.adviceScanHorizonMs) return bad('adviceScanStepMs');
  if (p.bestTimeStepMs >= p.bestTimeHorizonMs) return bad('bestTimeStepMs');
  if (p.fairEllipseRatio <= 1) return bad('fairEllipseRatio');
  if (p.longEllipseRatio <= p.fairEllipseRatio) return bad('longEllipseRatio');
  return ok(parameters);
}
