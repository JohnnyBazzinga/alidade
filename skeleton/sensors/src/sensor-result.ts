// Result type and the closed set of failure reasons of @alidade/sensors (Req 11.1, design D2).
//
// Expected failures are values, never exceptions. `SensorReason` is every reason of Core, passed
// through unchanged, plus the reasons below. Core is not changed for them.

import type { Reason, Success } from '@alidade/core';

/**
 * The closed set of failure reasons. Core's reasons (`invalid_number`, `unsupported_position`,
 * `invalid_observation`, …) keep their Core meaning. The reasons added here:
 *
 * - `permission_denied`: the user or the browser refused a permission (Req 7.6, 11.4).
 * - `permission_required`: no orientation event arrived, and the browser needs a permission
 *   that has not been requested (Req 11.5).
 * - `sensor_unavailable`: the sensor or its API is missing, sends no data, or failed (Req 2.5,
 *   11.5, 11.6).
 * - `insecure_context`: the page is not a secure context (Req 11.7).
 * - `position_unavailable`: the browser reported the position unavailable (Req 7.6).
 * - `position_timeout`: no position within the position timeout (Req 7.6).
 * - `coarse_location`: the reported accuracy exceeds the caller's limit (Req 7.4).
 * - `stale_position`: the position fix is older than the caller's limit (Req 7.7).
 * - `invalid_position`: the reading is not a valid Supported position (Req 7.5).
 * - `axis_vertical`: the direction has no defined azimuth (Req 2.4).
 * - `compass_unreliable`: no usable compass heading (Req 5.6, 5.7, 5.9).
 * - `no_yaw_reference`: Relative-frame samples and no Yaw reference (Req 5.13).
 * - `stale_yaw_reference`: the Yaw reference is older than the caller's limit (Req 5.12).
 * - `frame_reset`: mixed frames, a frame mismatch, or a Frame reset that invalidates the
 *   reference (Req 5.2, 5.10, 5.11, 5.18, 8.8).
 * - `declination_unknown`: a magnetic azimuth and no usable Declination (Req 6.4, 6.7, 6.8).
 * - `insufficient_samples`: too few samples in the Sighting window (Req 5.9, 8.6, 9.4).
 * - `stale_samples`: the newest sample in the window is too old (Req 5.10, 8.7, 9.4).
 * - `too_unsteady`: the capture's 1-sigma exceeds 45° or its mean is undefined (Req 8.10).
 * - `invalid_altitude`: the calibrated altitude lies outside [-π/2, π/2] (Req 9.6).
 */
export type SensorReason =
  | Reason
  | 'permission_denied'
  | 'permission_required'
  | 'sensor_unavailable'
  | 'insecure_context'
  | 'position_unavailable'
  | 'position_timeout'
  | 'coarse_location'
  | 'stale_position'
  | 'invalid_position'
  | 'axis_vertical'
  | 'compass_unreliable'
  | 'no_yaw_reference'
  | 'stale_yaw_reference'
  | 'frame_reset'
  | 'declination_unknown'
  | 'insufficient_samples'
  | 'stale_samples'
  | 'too_unsteady'
  | 'invalid_altitude';

/** `field` names the offending field and `id` the offending observation, where they apply. */
export interface SensorFailure {
  readonly ok: false;
  readonly reason: SensorReason;
  readonly field?: string;
  readonly id?: string;
  /** Only with `coarse_location`: the accuracy the browser reported, in metres (Req 7.4). */
  readonly reportedAccuracyM?: number;
}

export type SensorResult<T> = Success<T> | SensorFailure;

/** Internal: not exported from index.ts (design D2). */
export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

/** Internal: not exported from index.ts (design D2). */
export function err(
  reason: SensorReason,
  details: {
    readonly field?: string;
    readonly id?: string;
    readonly reportedAccuracyM?: number;
  } = {},
): SensorFailure {
  return { ok: false, reason, ...details };
}
