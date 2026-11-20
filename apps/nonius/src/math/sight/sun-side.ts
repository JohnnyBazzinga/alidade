// The Sun side of a sight (Req 4.6, design §6.3): the circular mean of the Camera azimuths over the
// Frozen window, computed with Sensors' functions only, in the North reference of the sighting.

import {
  applyYawReference,
  directionAzimuthRad,
  rayDirection,
  selectWindow,
  summariseAzimuths,
} from '@alidade/sensors';
import type { FrozenSighting } from '@alidade/ui';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { SunSide } from './sight';

/**
 * The Camera azimuth over the Frozen window, with its North reference: the Yaw reference's when
 * the Frozen sighting holds one of the samples' frame, `magnetic` for an Absolute frame without
 * one, and `null` for a Relative frame without one, or when Sensors returns any failure (too few
 * or stale samples, the camera axis vertical, a frame that changes inside the window, a bad
 * number). A Mark's Ray offset is used when there is one. The parameters are checked first.
 */
export function sunSideFromFrozen(
  frozen: FrozenSighting,
  params: NoniusParameters,
): SunSide | null {
  if (!checkParameters(params).ok) return null;
  const selected = selectWindow(frozen.history.samples, frozen.window);
  if (!selected.ok) return null;
  const offset = frozen.mark === null ? undefined : frozen.mark.offset;
  const frame = selected.value[0]?.frame;
  if (frame === undefined) return null;
  const yaw =
    frozen.yawReference !== null && frozen.yawReference.frame === frame
      ? frozen.yawReference
      : null;
  if (frame === 'relative' && yaw === null) return null;
  const azimuthsRad: number[] = [];
  let northReference: 'magnetic' | 'true' = 'magnetic';
  for (const sample of selected.value) {
    if (sample.frame !== frame) return null;
    const direction = rayDirection(sample.rotation, offset);
    if (!direction.ok) return null;
    const azimuth = directionAzimuthRad(direction.value);
    if (!azimuth.ok) return null;
    if (yaw === null) {
      azimuthsRad.push(azimuth.value);
      continue;
    }
    const referenced = applyYawReference(azimuth.value, yaw);
    if (!referenced.ok) return null;
    northReference = referenced.value.northReference;
    azimuthsRad.push(
      referenced.value.northReference === 'true'
        ? referenced.value.azimuthRad
        : referenced.value.magneticAzimuthRad,
    );
  }
  const summary = summariseAzimuths(azimuthsRad);
  if (!summary.ok) return null;
  return { azimuthRad: summary.value.meanRad, northReference };
}
