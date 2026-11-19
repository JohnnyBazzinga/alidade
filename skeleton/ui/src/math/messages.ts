// Plain-language Messages, one table keyed by reason (Req 3, design D18, §7.17).
//
// Every part is one sentence of at most 160 characters that ends with a full stop and contains
// none of: the reason's code, an underscore, `NaN`, `Infinity`, `undefined`, `null` or `[object`
// (Req 3.3); `messages.test.ts` and P-3.11 hold the table to that. English only (Req 3.5).
// Wording avoids "e.g." and other full stops inside a sentence, so that one full stop means one
// sentence.

import type { UiFailure } from '../result';
import type { UiReason } from '../reasons';

/** What went wrong and what the user can do next. */
export interface Message {
  readonly whatHappened: string;
  readonly whatToDo: string;
}

/** A Message, or a function of the failure for the few that carry a number (Req 3.4). */
export type MessageSource = Message | ((failure: UiFailure) => Message);

/** Metres shown to the user: nearest 10 m below 1000 m, 0.1 km from 1000 m (Req 3.4). */
function describeAccuracy(accuracyM: number | undefined): string | null {
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM <= 0) return null;
  if (accuracyM >= 1e7) return null; // not a plausible accuracy: show no number
  const roundedM = Math.round(accuracyM / 10) * 10;
  if (roundedM < 1000) return `${roundedM} m`;
  return `${(Math.round(accuracyM / 100) / 10).toFixed(1)} km`;
}

function coarseLocation(failure: UiFailure): Message {
  const accuracy = describeAccuracy(failure.reportedAccuracyM);
  return {
    whatHappened:
      accuracy === null
        ? 'The phone does not know its position precisely enough.'
        : `The phone only knows its position to about ${accuracy}.`,
    whatToDo: 'Move into the open, wait for a better position, or enter the position by hand.',
  };
}

export const MESSAGES: Record<UiReason, MessageSource> = {
  // Core
  invalid_number: {
    whatHappened: 'A number that was entered or measured cannot be used.',
    whatToDo: 'Check the values you typed, then try again.',
  },
  undefined_mean: {
    whatHappened: 'The measured directions cancel each other out, so they have no average.',
    whatToDo: 'Take the sighting again with the phone held steady and pointed at one target.',
  },
  coincident_positions: {
    whatHappened: 'Two positions are at the same place.',
    whatToDo: 'Move to a different spot or choose another target.',
  },
  unsupported_position: {
    whatHappened: 'This position is outside the range the app supports, for instance near a pole.',
    whatToDo: 'Use a position at least one degree away from the poles.',
  },
  invalid_observation: {
    whatHappened: 'One of the sightings is incomplete or does not make sense.',
    whatToDo: 'Remove that sighting and take it again.',
  },
  unsupported_format: {
    whatHappened: 'This data was written by a different version of the app.',
    whatToDo: 'Update the app, then open it again.',
  },
  not_converged: {
    whatHappened: 'A position could not be worked out from these sightings.',
    whatToDo: 'Add a sighting from a different place, then try again.',
  },
  singular_geometry: {
    whatHappened:
      'The sightings point along nearly the same line, so they do not cross at a clear place.',
    whatToDo: 'Take another sighting from a place well to the side of the others.',
  },
  insufficient_observations: {
    whatHappened: 'There are not enough sightings to work out a position.',
    whatToDo: 'Take at least two sightings from different places.',
  },
  colocated_observers: {
    whatHappened: 'Two sightings were taken from the same place.',
    whatToDo: 'Take the next sighting from a different place.',
  },
  diverging_bearings: {
    whatHappened: 'The sightings point away from each other and never cross.',
    whatToDo: 'Check where north was set and take the sightings again.',
  },
  out_of_range: {
    whatHappened: 'A value is outside the range the app can handle.',
    whatToDo: 'Check the value and enter one inside the allowed range.',
  },
  // Sensors
  permission_denied: {
    // Sensors gives this one reason for motion and for location (Sensors Req 7.6, 11.4).
    whatHappened:
      'Access to motion or location was refused, so the app cannot read the phone\u2019s sensors.',
    whatToDo:
      'Allow motion and location access for this site in the browser settings, then start again.',
  },
  permission_required: {
    whatHappened:
      'The browser needs your permission before it shares the phone\u2019s motion sensors.',
    whatToDo: 'Tap the start button and allow motion access when the browser asks.',
  },
  sensor_unavailable: {
    whatHappened: 'The phone\u2019s motion sensors are missing or are not sending data.',
    whatToDo: 'Use a phone with motion sensors and check that the browser allows them.',
  },
  insecure_context: {
    whatHappened:
      'This page was opened over an insecure address, so the browser blocks the camera and motion sensors.',
    whatToDo: 'Open the page from its https address.',
  },
  position_unavailable: {
    whatHappened: 'The phone could not find its position.',
    whatToDo: 'Move into the open and check that location is switched on, then try again.',
  },
  position_timeout: {
    whatHappened: 'The phone took too long to find its position.',
    whatToDo: 'Move into the open, wait a little, then try again.',
  },
  coarse_location: coarseLocation,
  stale_position: {
    whatHappened: 'The last known position is too old to use.',
    whatToDo: 'Wait for a new position from the phone, then try again.',
  },
  invalid_position: {
    whatHappened: 'The position the phone reported cannot be used.',
    whatToDo: 'Wait for a new position or move into the open, then try again.',
  },
  axis_vertical: {
    whatHappened: 'The camera points straight up or down, so it has no compass direction.',
    whatToDo: 'Tilt the phone toward the horizon, then try again.',
  },
  compass_unreliable: {
    whatHappened: 'The phone\u2019s compass reading is not reliable right now.',
    whatToDo:
      'Hold the phone upright in portrait and away from metal and magnets, then set north again.',
  },
  no_yaw_reference: {
    whatHappened: 'The app does not yet know which way north is.',
    whatToDo: 'Set north from the compass, the Sun or a landmark before taking the sighting.',
  },
  stale_yaw_reference: {
    whatHappened: 'The sighting of north is too old to trust.',
    whatToDo: 'Set north again, then take the sighting.',
  },
  frame_reset: {
    whatHappened:
      'The phone may have lost its sense of north, for example after the screen locked or the page was hidden.',
    whatToDo: 'Set north again from the compass, the Sun or a landmark before taking the sighting.',
  },
  declination_unknown: {
    whatHappened:
      'The app cannot turn the compass direction into true north without the local magnetic correction.',
    whatToDo:
      'Allow the location so the correction can be worked out, or set north from the Sun or a landmark.',
  },
  insufficient_samples: {
    whatHappened: 'There are too few recent readings from the sensors.',
    whatToDo: 'Hold the phone steady for a second, then try again.',
  },
  stale_samples: {
    whatHappened: 'The latest sensor readings are too old.',
    whatToDo: 'Keep this page in front and check that the sensors are running, then try again.',
  },
  too_unsteady: {
    whatHappened: 'The phone moved too much during the sighting.',
    whatToDo: 'Hold the phone steady with both hands, then try again.',
  },
  invalid_altitude: {
    whatHappened: 'The corrected altitude is outside the possible range.',
    whatToDo: 'Check the altitude correction, then take the sighting again.',
  },
  // UI
  camera_permission_denied: {
    whatHappened: 'This page is not allowed to use the camera.',
    whatToDo: 'Allow camera access for this site in the browser settings, then start again.',
  },
  camera_unavailable: {
    whatHappened: 'No usable camera was found on this device.',
    whatToDo: 'Use a phone with a rear camera, or switch to the simulator.',
  },
  camera_busy: {
    whatHappened: 'The camera is being used by another app.',
    whatToDo: 'Close the other app that uses the camera, then start again.',
  },
  camera_track_ended: {
    whatHappened: 'The camera stopped sending its image.',
    whatToDo: 'Close other apps that use the camera, then start the camera again.',
  },
  camera_stopped: {
    whatHappened: 'The camera was stopped before it was ready.',
    whatToDo: 'Start the camera again when you are ready to sight.',
  },
  camera_failed: {
    whatHappened: 'The camera could not be started.',
    whatToDo: 'Reload the page and start the camera again.',
  },
  wrong_camera: {
    whatHappened: 'The browser gave the front camera instead of the rear one.',
    whatToDo: 'Choose the rear camera in the browser settings, then start the camera again.',
  },
  calibration_missing: {
    // In simulator mode the field of view is the scene's, and only the tap's accuracy can be
    // missing: the Message names both (design D28.17).
    whatHappened:
      'The camera\u2019s field of view or the accuracy of a tap has not been entered, so a tapped point has no known direction.',
    whatToDo:
      'Enter the field of view, its uncertainty and the tap accuracy, or sight along the crosshair.',
  },
  calibration_mismatch: {
    whatHappened:
      'The camera image has a different shape from the one the field of view was measured with.',
    whatToDo: 'Enter the field of view again for the image the camera shows now.',
  },
  outside_image: {
    whatHappened: 'The tapped point is not on the camera image.',
    whatToDo: 'Tap a point on the image itself.',
  },
  outside_field_of_view: {
    whatHappened:
      'The tapped point is too far from the centre of the image to give a reliable direction.',
    whatToDo: 'Turn the phone so the target is nearer the centre, then tap it.',
  },
  portrait_required: {
    whatHappened: 'The phone is not held upright in portrait.',
    whatToDo: 'Turn the phone to portrait and hold it upright, then try again.',
  },
  action_not_available: {
    whatHappened: 'That action is not available right now.',
    whatToDo: 'Finish the current step first, then try again.',
  },
  tiles_unavailable: {
    whatHappened: 'The map pictures could not be loaded.',
    whatToDo:
      'Check the internet connection, because the sightings are still drawn on a plain background.',
  },
  map_unavailable: {
    whatHappened: 'The map cannot be drawn on this device.',
    whatToDo:
      'The list of sightings and the fix in words still work; a browser with WebGL may draw the map.',
  },
  crosses_antimeridian: {
    whatHappened: 'The points are too far apart to show on one map.',
    whatToDo: 'Show a smaller area, or take the sightings closer together.',
  },
};

/**
 * For the reasons of Req 3.7, the words that must appear in the Message, so that it names the
 * thing the user can act on and is not only "try again" (design D18). Each expression must match
 * the Message's two parts together.
 */
export const MUST_MENTION: Partial<Record<UiReason, readonly RegExp[]>> = {
  camera_permission_denied: [/camera/i],
  camera_unavailable: [/camera/i],
  camera_busy: [/camera/i],
  camera_track_ended: [/camera/i],
  camera_stopped: [/camera/i],
  camera_failed: [/camera/i],
  wrong_camera: [/camera/i],
  permission_denied: [/motion/i, /allow/i],
  permission_required: [/motion/i, /permission/i],
  insecure_context: [/https|secure|address/i],
  sensor_unavailable: [/sensor/i],
  portrait_required: [/portrait/i, /upright/i],
  compass_unreliable: [/compass/i],
  frame_reset: [/north/i],
  stale_yaw_reference: [/north/i],
  coarse_location: [/position/i],
  declination_unknown: [/north/i, /location|declination|magnetic/i],
};

/**
 * The Message for a failure: a pure function of it (Req 3.5). The same failure gives an equal
 * Message; a reason without an entry (impossible for a type-correct failure) gets the Message
 * of `invalid_number` rather than a throw.
 */
export function messageFor(failure: UiFailure): Message {
  const source = Object.hasOwn(MESSAGES, failure.reason) ? MESSAGES[failure.reason] : undefined;
  const resolved = source ?? MESSAGES.invalid_number;
  return typeof resolved === 'function' ? resolved(failure) : resolved;
}
