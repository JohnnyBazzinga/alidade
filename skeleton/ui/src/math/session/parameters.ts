// The Session parameters (Req 19.2 to 19.4, design §6): every number and limit the Session uses,
// passed in. The record has no Camera calibration and no `tapSigmaPx` (Req 19.3, 4.2, 6.2): the
// `mark` event carries both.

import {
  COARSE_LOCATION_LIMIT_M,
  FRAME_RESET_RETENTION_MS,
  HEADING_SIGMA_RAD,
  POSITION_STALENESS_MS,
  SAMPLE_RETENTION_MS,
  SAMPLE_STALENESS_MS,
  SIGHTING_WINDOW_LENGTH_MS,
  MIN_SAMPLE_COUNT,
  UNCALIBRATED_ALTITUDE,
  YAW_REFERENCE_MAX_AGE_MS,
  type AltitudeCalibration,
} from '@alidade/sensors';
import {
  MAX_MARK_ALTITUDE_RAD,
  READOUT_INTERVAL_MS,
  SCREEN_ANGLE_TOLERANCE_RAD,
  STEADY_BELOW_RAD,
  UNSTEADY_ABOVE_RAD,
} from '../../defaults';
import { err, ok, type UiResult } from '../../result';

export interface SessionParameters {
  /** Length of the Sighting window (Sensors). */
  readonly windowLengthMs: number;
  /** Least number of samples in a Sighting window; an integer of at least 1 (Sensors). */
  readonly minSampleCount: number;
  /** The newest sample of a window may be at most this much older than its end (Sensors). */
  readonly sampleStalenessMs: number;
  /** A Position fix may be at most this old when used (Sensors). */
  readonly positionStalenessMs: number;
  /** A reported accuracy above this is a Coarse location (Sensors). */
  readonly coarseLocationLimitM: number;
  /** A Yaw reference may be used for this long after it was established (Sensors). */
  readonly yawReferenceMaxAgeMs: number;
  /** 1-sigma of a heading, before Declination (Sensors). */
  readonly headingSigmaRad: number;
  /** The Sample history keeps Orientation samples this long. */
  readonly sampleRetentionMs: number;
  /**
   * The Sample history keeps Frame resets this long. At least `yawReferenceMaxAgeMs +
   * windowLengthMs`, so that every reset that could invalidate a usable Yaw reference is held
   * (Req 19.4, 11.9).
   */
  readonly frameResetRetentionMs: number;
  /** Offset added to measured altitudes, and the 1-sigma left after it (Sensors). */
  readonly altitudeCalibration: AltitudeCalibration;
  /** The least time between two publications of the Live readout. */
  readonly readoutIntervalMs: number;
  /** Steadiness: a Spread at or below this is `steady`. */
  readonly steadyBelowRad: number;
  /** Steadiness: a Spread above this is `unsteady`. */
  readonly unsteadyAboveRad: number;
  /** A Screen angle within this of 0 counts as 0 (Req 10.2). */
  readonly screenAngleToleranceRad: number;
  /** A Mark steeper than this has no usable azimuth (Req 12.3). */
  readonly maxMarkAltitudeRad: number;
}

/** The default Session parameters: the constants of Req 19.1 and Sensors' defaults. */
export function defaultSessionParameters(): SessionParameters {
  return {
    windowLengthMs: SIGHTING_WINDOW_LENGTH_MS,
    minSampleCount: MIN_SAMPLE_COUNT,
    sampleStalenessMs: SAMPLE_STALENESS_MS,
    positionStalenessMs: POSITION_STALENESS_MS,
    coarseLocationLimitM: COARSE_LOCATION_LIMIT_M,
    yawReferenceMaxAgeMs: YAW_REFERENCE_MAX_AGE_MS,
    headingSigmaRad: HEADING_SIGMA_RAD,
    sampleRetentionMs: SAMPLE_RETENTION_MS,
    frameResetRetentionMs: FRAME_RESET_RETENTION_MS,
    altitudeCalibration: { ...UNCALIBRATED_ALTITUDE },
    readoutIntervalMs: READOUT_INTERVAL_MS,
    steadyBelowRad: STEADY_BELOW_RAD,
    unsteadyAboveRad: UNSTEADY_ABOVE_RAD,
    screenAngleToleranceRad: SCREEN_ANGLE_TOLERANCE_RAD,
    maxMarkAltitudeRad: MAX_MARK_ALTITUDE_RAD,
  };
}

function isPositive(x: unknown): boolean {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

function isNotNegative(x: unknown): boolean {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

/**
 * Validates the parameters and returns them, or `invalid_number` naming the first invalid one
 * (Req 19.4): `NaN`, infinite, not positive where it must be, a sample count that is not an
 * integer of at least 1, a readout interval under 1 ms, or a Frame reset retention less than the
 * Yaw reference maximum age plus the window length (named `frameResetRetentionMs`).
 */
export function checkSessionParameters(p: SessionParameters): UiResult<SessionParameters> {
  const bad = (field: string) => err('invalid_number', { field });
  if (!isPositive(p.windowLengthMs)) return bad('windowLengthMs');
  if (!Number.isInteger(p.minSampleCount) || p.minSampleCount < 1) return bad('minSampleCount');
  if (!isPositive(p.sampleStalenessMs)) return bad('sampleStalenessMs');
  if (!isPositive(p.positionStalenessMs)) return bad('positionStalenessMs');
  if (!isPositive(p.coarseLocationLimitM)) return bad('coarseLocationLimitM');
  if (!isPositive(p.yawReferenceMaxAgeMs)) return bad('yawReferenceMaxAgeMs');
  if (!isNotNegative(p.headingSigmaRad)) return bad('headingSigmaRad');
  if (!isPositive(p.sampleRetentionMs)) return bad('sampleRetentionMs');
  if (!isPositive(p.frameResetRetentionMs)) return bad('frameResetRetentionMs');
  const calibration = p.altitudeCalibration as AltitudeCalibration | null | undefined;
  if (typeof calibration !== 'object' || calibration === null) return bad('altitudeCalibration');
  if (typeof calibration.offsetRad !== 'number' || !Number.isFinite(calibration.offsetRad)) {
    return bad('altitudeCalibration.offsetRad');
  }
  if (!isNotNegative(calibration.sigmaRad)) return bad('altitudeCalibration.sigmaRad');
  if (!isPositive(p.readoutIntervalMs) || p.readoutIntervalMs < 1) return bad('readoutIntervalMs');
  if (!isPositive(p.steadyBelowRad)) return bad('steadyBelowRad');
  if (!isPositive(p.unsteadyAboveRad)) return bad('unsteadyAboveRad');
  if (!isNotNegative(p.screenAngleToleranceRad)) return bad('screenAngleToleranceRad');
  if (!isPositive(p.maxMarkAltitudeRad)) return bad('maxMarkAltitudeRad');
  if (p.frameResetRetentionMs < p.yawReferenceMaxAgeMs + p.windowLengthMs) {
    return bad('frameResetRetentionMs');
  }
  return ok(p);
}
