// The closed set of failure reasons of @alidade/ui (Req 2.2, design D2).
//
// `UiReason` is every `SensorReason` (which includes every Core reason) unchanged in meaning,
// plus the sixteen of `UI_ONLY_REASONS`. The list of Sensors' reasons is Sensors' own export
// (`SENSOR_REASONS`, Sensors 1.10); this file repeats none of it.

import { SENSOR_REASONS, type SensorReason } from '@alidade/sensors';

/**
 * The reasons added by the UI:
 *
 * - `camera_permission_denied`, `camera_unavailable`, `camera_busy`, `camera_track_ended`,
 *   `camera_stopped`, `camera_failed`, `wrong_camera`: the Camera adapter (Req 7).
 * - `calibration_missing`, `calibration_mismatch`: no Camera calibration, or one whose aspect
 *   ratio is not the Source image's (Req 4.2, 4.4).
 * - `outside_image`, `outside_field_of_view`: a Pixel point off the image, or an offset beyond
 *   `MAX_RAY_OFFSET_RAD` (Req 5.4).
 * - `portrait_required`: the Screen angle is not 0 or is unknown (Req 10.2).
 * - `action_not_available`: an action event in a state that does not offer it, or an operation
 *   on a destroyed adapter (Req 8.4, 15.10).
 * - `tiles_unavailable`, `map_unavailable`: the Map adapter (Req 15).
 * - `crosses_antimeridian`: a set of features that does not fit a box of at most 180° of
 *   longitude (Req 14.6).
 */
const UI_ONLY_REASONS = {
  camera_permission_denied: true,
  camera_unavailable: true,
  camera_busy: true,
  camera_track_ended: true,
  camera_stopped: true,
  camera_failed: true,
  wrong_camera: true,
  calibration_missing: true,
  calibration_mismatch: true,
  outside_image: true,
  outside_field_of_view: true,
  portrait_required: true,
  action_not_available: true,
  tiles_unavailable: true,
  map_unavailable: true,
  crosses_antimeridian: true,
} as const satisfies Record<UiOnlyReason, true>;

export type UiOnlyReason =
  | 'camera_permission_denied'
  | 'camera_unavailable'
  | 'camera_busy'
  | 'camera_track_ended'
  | 'camera_stopped'
  | 'camera_failed'
  | 'wrong_camera'
  | 'calibration_missing'
  | 'calibration_mismatch'
  | 'outside_image'
  | 'outside_field_of_view'
  | 'portrait_required'
  | 'action_not_available'
  | 'tiles_unavailable'
  | 'map_unavailable'
  | 'crosses_antimeridian';

export type UiReason = SensorReason | UiOnlyReason;

/** The UI's own reasons, as a list. `satisfies` above makes the compiler hold it to the type. */
export const UI_ONLY_REASON_LIST: readonly UiOnlyReason[] = Object.freeze(
  Object.keys(UI_ONLY_REASONS) as UiOnlyReason[],
);

/** Every member of `UiReason`: Sensors' list first, then the UI's sixteen (Req 2.2, D2). */
export const UI_REASONS: readonly UiReason[] = Object.freeze([
  ...SENSOR_REASONS,
  ...UI_ONLY_REASON_LIST,
]);
