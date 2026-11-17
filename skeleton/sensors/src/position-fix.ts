// Position fixes (Req 7, design §7.8, D13). A fix never exists without its 1-sigma: the reported
// accuracy is divided by the caller's confidence scale when the fix is made.

import { degToRad, isSupportedPosition, type Position } from '@alidade/core';
import { checkDurationMs, checkLimitM, checkScale, checkTimeUtcMs } from './parameters';
import { err, ok, type SensorResult } from './sensor-result';

/** A plain copy of `GeolocationCoordinates`, in degrees and metres as the browser gives them. */
export interface GeolocationReading {
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly accuracyM: number;
}

export interface PositionFix {
  /** A Supported position (Core). */
  readonly position: Position;
  /** The accuracy as the browser reported it, in metres (Req 7.8). */
  readonly reportedAccuracyM: number;
  /** The 1-sigma accuracy: the reported accuracy divided by the confidence scale (Req 7.3). */
  readonly sigmaM: number;
  /** When the Adapter received the reading, from its injected Clock (Req 1.4). */
  readonly timeUtcMs: number;
}

/**
 * A Position fix from a geolocation reading (Req 7.2, 7.3). Coordinates are converted with Core's
 * `degToRad`. Fails with `invalid_number` for a bad scale or time, and `invalid_position` for
 * non-finite coordinates, a non-finite or negative accuracy, or a position that is not Supported
 * (Req 7.5). A longitude of exactly -180° converts to -π, which is not Supported (Core's longitude
 * range is (-π, π]), so it is refused; the browser reports that meridian as +180°.
 */
export function positionFixFromReading(
  reading: GeolocationReading,
  timeUtcMs: number,
  confidenceScale: number,
): SensorResult<PositionFix> {
  const scale = checkScale(confidenceScale, 'confidenceScale');
  if (!scale.ok) return scale;
  const time = checkTimeUtcMs(timeUtcMs, 'timeUtcMs');
  if (!time.ok) return time;
  const accuracyM = reading.accuracyM;
  if (!Number.isFinite(accuracyM) || accuracyM < 0)
    return err('invalid_position', { field: 'accuracyM' });
  const latRad = degToRad(reading.latitudeDeg);
  const lonRad = degToRad(reading.longitudeDeg);
  if (!latRad.ok) return err('invalid_position', { field: 'latitudeDeg' });
  if (!lonRad.ok) return err('invalid_position', { field: 'longitudeDeg' });
  const position = { latRad: latRad.value, lonRad: lonRad.value };
  if (!isSupportedPosition(position)) return err('invalid_position', { field: 'position' });
  return ok({ position, reportedAccuracyM: accuracyM, sigmaM: accuracyM / scale.value, timeUtcMs });
}

export interface PositionFixLimits {
  /** The time the fix is used at. */
  readonly atUtcMs: number;
  readonly positionStalenessMs: number;
  readonly coarseLocationLimitM: number;
}

/**
 * Checks a fix before it is used (§7.8). The fix may come from anywhere, so it is validated again
 * (`invalid_position`). Then `stale_position` if it is older than the limit at `atUtcMs` (Req 7.7),
 * then `coarse_location`, carrying the reported accuracy, if that exceeds the limit (Req 7.4). The
 * Coarse location test uses the reported accuracy: it is the figure the browser shows.
 */
export function checkPositionFix(
  fix: PositionFix,
  limits: PositionFixLimits,
): SensorResult<PositionFix> {
  const at = checkTimeUtcMs(limits.atUtcMs, 'atUtcMs');
  if (!at.ok) return at;
  const staleness = checkDurationMs(limits.positionStalenessMs, 'positionStalenessMs');
  if (!staleness.ok) return staleness;
  const coarse = checkLimitM(limits.coarseLocationLimitM, 'coarseLocationLimitM');
  if (!coarse.ok) return coarse;
  if (
    !isSupportedPosition(fix.position) ||
    !Number.isFinite(fix.reportedAccuracyM) ||
    fix.reportedAccuracyM < 0 ||
    !Number.isFinite(fix.sigmaM) ||
    fix.sigmaM < 0 ||
    !Number.isFinite(fix.timeUtcMs)
  ) {
    return err('invalid_position');
  }
  if (limits.atUtcMs - fix.timeUtcMs > limits.positionStalenessMs) return err('stale_position');
  if (fix.reportedAccuracyM > limits.coarseLocationLimitM) {
    return err('coarse_location', { reportedAccuracyM: fix.reportedAccuracyM });
  }
  return ok(fix);
}
