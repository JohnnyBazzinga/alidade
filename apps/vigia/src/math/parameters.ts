// The parameters of Vigia as one record (Req 19.2, 19.3, design D18, §7.20). Each function of the
// Math layer takes the values it needs as an argument and reads no default; `defaultParameters`
// is called once, in `main.tsx`, in the simulation and in tests (a purity rule).

import {
  ADVICE_MIN_DISTANCE_M,
  CLOCK_SKEW_TOLERANCE_MS,
  EXPIRY_CHECK_INTERVAL_MS,
  FAIR_ELLIPSE_RATIO,
  INCIDENT_RETENTION_MS,
  LONG_ELLIPSE_RATIO,
  MAX_CODE_LENGTH_CHARS,
  MAX_EMERGENCY_TEXT_CHARS,
  MAX_INCIDENT_AGE_MS,
  MAX_LINK_LENGTH_CHARS,
  MAX_RESPONSE_BYTES,
  MAX_SIGHTINGS_PER_INCIDENT,
  MAX_WIND_AGE_MS,
  PLAUSIBLE_RANGE_M,
  REQUEST_TIMEOUT_MS,
  SIMULATION_TAP_SIGMA_PX,
  WIND_GRID_DEG,
} from '../defaults';
import { err, ok, type VigiaResult } from '../result';

// Second release, with the hotspot Overlay: hotspotGridDeg 0.5, hotspotMarginCells 1,
// hotspotDayRange 2, maxHotspotAgeMs 24 h, maxHotspotCount 500, maxHotspotBoxDeg2 16.
export interface VigiaParameters {
  readonly maxIncidentAgeMs: number;
  readonly incidentRetentionMs: number;
  readonly clockSkewToleranceMs: number;
  readonly maxSightingsPerIncident: number;
  readonly plausibleRangeM: number;
  readonly longEllipseRatio: number;
  readonly fairEllipseRatio: number;
  readonly maxCodeLengthChars: number;
  readonly maxLinkLengthChars: number;
  readonly maxEmergencyTextChars: number;
  readonly windGridDeg: number;
  readonly maxWindAgeMs: number;
  readonly maxResponseBytes: number;
  readonly requestTimeoutMs: number;
  readonly simulationTapSigmaPx: number;
  readonly adviceMinDistanceM: number;
  readonly expiryCheckIntervalMs: number;
}

/** The record of the constants of `defaults.ts`. */
export function defaultParameters(): VigiaParameters {
  return Object.freeze({
    maxIncidentAgeMs: MAX_INCIDENT_AGE_MS,
    incidentRetentionMs: INCIDENT_RETENTION_MS,
    clockSkewToleranceMs: CLOCK_SKEW_TOLERANCE_MS,
    maxSightingsPerIncident: MAX_SIGHTINGS_PER_INCIDENT,
    plausibleRangeM: PLAUSIBLE_RANGE_M,
    longEllipseRatio: LONG_ELLIPSE_RATIO,
    fairEllipseRatio: FAIR_ELLIPSE_RATIO,
    maxCodeLengthChars: MAX_CODE_LENGTH_CHARS,
    maxLinkLengthChars: MAX_LINK_LENGTH_CHARS,
    maxEmergencyTextChars: MAX_EMERGENCY_TEXT_CHARS,
    windGridDeg: WIND_GRID_DEG,
    maxWindAgeMs: MAX_WIND_AGE_MS,
    maxResponseBytes: MAX_RESPONSE_BYTES,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    simulationTapSigmaPx: SIMULATION_TAP_SIGMA_PX,
    adviceMinDistanceM: ADVICE_MIN_DISTANCE_M,
    expiryCheckIntervalMs: EXPIRY_CHECK_INTERVAL_MS,
  });
}

/** The fields in the order of the record, which is the order `checkParameters` reports in. */
const FIELD_ORDER: readonly (keyof VigiaParameters)[] = [
  'maxIncidentAgeMs',
  'incidentRetentionMs',
  'clockSkewToleranceMs',
  'maxSightingsPerIncident',
  'plausibleRangeM',
  'longEllipseRatio',
  'fairEllipseRatio',
  'maxCodeLengthChars',
  'maxLinkLengthChars',
  'maxEmergencyTextChars',
  'windGridDeg',
  'maxWindAgeMs',
  'maxResponseBytes',
  'requestTimeoutMs',
  'simulationTapSigmaPx',
  'adviceMinDistanceM',
  'expiryCheckIntervalMs',
];

/** The fields that are counts: an integer of at least 1. The others are positive numbers. */
const COUNT_FIELDS: readonly (keyof VigiaParameters)[] = [
  'maxSightingsPerIncident',
  'maxCodeLengthChars',
  'maxLinkLengthChars',
  'maxEmergencyTextChars',
  'maxResponseBytes',
];

/**
 * The least `maxLinkLengthChars` that can hold a link at all: a code of 50 symbols (`CODE_LENGTH`
 * of the code module, which imports this module: a test holds the two equal) and the shortest
 * page address with its `#`, 13 characters (a scheme, a one-letter host, a dot, a one-letter
 * label, a slash and the `#`).
 */
export const LEAST_LINK_LENGTH_CHARS = 63;
/** The worst case of the Emergency text, computed in design §7.12 (task 8.2 builds it). */
const WORST_EMERGENCY_TEXT_CHARS = 740;

/**
 * Checks the parameters (Req 19.3). Returns `invalid_number` naming the first field, in the
 * order of the record, that is not finite, not positive (a count: not an integer of at least 1);
 * then the first inconsistency, in this order: `incidentRetentionMs` not longer than
 * `maxIncidentAgeMs`, `fairEllipseRatio` not above 1, `longEllipseRatio` not above
 * `fairEllipseRatio`, `maxLinkLengthChars` too short for a code and a page address,
 * `maxEmergencyTextChars` below the worst case of the Emergency text. On success the record is
 * returned as it is.
 */
export function checkParameters(parameters: VigiaParameters): VigiaResult<VigiaParameters> {
  for (const field of FIELD_ORDER) {
    const value = parameters[field];
    const isCount = COUNT_FIELDS.includes(field);
    const valid = isCount
      ? Number.isInteger(value) && value >= 1
      : Number.isFinite(value) && value > 0;
    if (!valid) return err('invalid_number', { field });
  }
  if (parameters.incidentRetentionMs <= parameters.maxIncidentAgeMs) {
    return err('invalid_number', { field: 'incidentRetentionMs' });
  }
  if (parameters.fairEllipseRatio <= 1) return err('invalid_number', { field: 'fairEllipseRatio' });
  if (parameters.longEllipseRatio <= parameters.fairEllipseRatio) {
    return err('invalid_number', { field: 'longEllipseRatio' });
  }
  if (parameters.maxLinkLengthChars < LEAST_LINK_LENGTH_CHARS) {
    return err('invalid_number', { field: 'maxLinkLengthChars' });
  }
  if (parameters.maxEmergencyTextChars < WORST_EMERGENCY_TEXT_CHARS) {
    return err('invalid_number', { field: 'maxEmergencyTextChars' });
  }
  return ok(parameters);
}
