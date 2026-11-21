// The words of every failure (Req 6.5): plain sentences that say what to check. The table is typed
// by the skeleton's own sets of reasons, so a reason added there without words here does not
// compile. No code, no underscore and no `NaN` in a message.

import type { SensorReason } from '@alidade/sensors';

/** The two reasons that belong to this server. */
export type McpReason = 'invalid_arguments' | 'non_finite_result';

export type AnyReason = SensorReason | McpReason;

export const MESSAGES: Readonly<Record<AnyReason, string>> = {
  // Core's reasons.
  invalid_number:
    'A number in the request is missing, is not finite, or is outside the range the tool accepts. Check every value and its unit.',
  undefined_mean:
    'The directions given cancel each other out, so they have no average direction. Check the angles.',
  coincident_positions:
    'Two positions are the same place, so the direction between them has no meaning. Use two different places.',
  unsupported_position:
    'A position is within 1 degree of a pole, which the skeleton does not support. Use a position at a lower latitude.',
  invalid_observation:
    'A bearing has a value that is not allowed: an azimuth outside 0 to 360 degrees, an azimuth sigma outside 0.01 to 45 degrees, a position accuracy outside 0 to 10 000 metres, an observer near a pole, or an id used twice. The failure names the bearing and the field.',
  unsupported_format: 'The data is in a format version that this tool does not read.',
  not_converged:
    'The solver did not settle on a position. The bearings may disagree strongly; check them one by one.',
  singular_geometry:
    'The lines of sight are parallel or nearly so, so they do not fix a position. Add a bearing from a post at a different angle.',
  insufficient_observations: 'At least two usable bearings are needed to fix a position.',
  colocated_observers:
    'Two observers stand at the same place, within 1 metre, so their bearings cannot cross. Use posts that are apart.',
  diverging_bearings:
    'The lines of sight point away from each other, so they do not meet. Check the azimuths, which are measured clockwise from true north.',
  out_of_range:
    'The position found is more than 500 kilometres from the observers, so it is not trusted. Check the bearings.',
  // Sensors' extra reasons. They concern a phone, so a call to these tools rarely meets them.
  permission_denied: 'A permission that the sensor needs was refused.',
  permission_required: 'A permission that the sensor needs has not been asked for.',
  sensor_unavailable: 'The sensor is missing, sends no data, or failed.',
  insecure_context: 'The page is not served over a secure connection, so the sensor is closed.',
  position_unavailable: 'The device reported that its position is unavailable.',
  position_timeout: 'No position arrived within the time allowed.',
  coarse_location: 'The reported position is less accurate than the limit that was set.',
  stale_position: 'The position fix is older than the limit that was set.',
  invalid_position:
    'The position reading is not a valid position on the supported part of the Earth.',
  axis_vertical: 'The direction points straight up or down, so it has no azimuth.',
  compass_unreliable: 'The compass heading is not usable.',
  no_yaw_reference:
    'Samples in a relative frame need a reference to true north, and there is none.',
  stale_yaw_reference: 'The reference to true north is older than the limit that was set.',
  frame_reset: 'The orientation frame was reset between the samples, so they cannot be combined.',
  declination_unknown:
    'The magnetic declination is not known here: the date is outside the dates of the magnetic model, or the place is in the model’s blackout zone near a magnetic pole.',
  insufficient_samples: 'There are too few samples in the sighting period to give a reading.',
  stale_samples: 'The newest sample is older than the limit that was set.',
  too_unsteady: 'The readings vary too much to give a direction.',
  invalid_altitude: 'The altitude is outside the range of minus 90 to plus 90 degrees.',
  // This server's own reasons.
  invalid_arguments:
    'An argument is missing, has the wrong type, is out of range, or is not known to the tool. The field names the argument. Check its name, its type and its unit.',
  non_finite_result:
    'The calculation gave a number that is not finite, so no answer is returned. Check that the inputs are in range.',
};

export function messageFor(reason: AnyReason): string {
  return MESSAGES[reason];
}
