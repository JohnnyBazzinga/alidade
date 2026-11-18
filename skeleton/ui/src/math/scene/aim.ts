// Aiming the simulated camera by dragging (Req 17.10, 17.12, design §7.13).

import { wrapTwoPi } from '@alidade/core';
import type { TruePose } from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';
import { fromDeg } from '../degrees';

/** The pose's altitude limit, as the Simulator's (Sensors 12.10): 80°. */
export const MAX_AIM_ALTITUDE_RAD = fromDeg(80);

/**
 * The pose after a drag of `(dxPx, dyPx)` CSS pixels at focal length `focalPx`: the azimuth
 * decreases by `atan(dx / F) / cos(h)` (so the scene follows the pointer at any altitude, to first
 * order with the roll near 0), wrapped to [0, 2π); the altitude increases by `atan(dy / F)`,
 * limited to ±80°; the roll is unchanged. `cos(h) ≥ cos 80°`, so the division is bounded.
 */
export function aimAfterDrag(
  pose: TruePose,
  dxPx: number,
  dyPx: number,
  focalPx: number,
): UiResult<TruePose> {
  for (const [field, value] of [
    ['azimuthRad', pose.azimuthRad],
    ['apparentAltitudeRad', pose.apparentAltitudeRad],
    ['rollRad', pose.rollRad],
    ['dxPx', dxPx],
    ['dyPx', dyPx],
    ['focalPx', focalPx],
  ] as const) {
    if (!Number.isFinite(value)) return err('invalid_number', { field });
  }
  if (!(focalPx > 0)) return err('invalid_number', { field: 'focalPx' });
  if (Math.abs(pose.apparentAltitudeRad) > MAX_AIM_ALTITUDE_RAD)
    return err('invalid_number', { field: 'apparentAltitudeRad' });
  const azimuth = wrapTwoPi(
    pose.azimuthRad - Math.atan(dxPx / focalPx) / Math.cos(pose.apparentAltitudeRad),
  );
  if (!azimuth.ok) return azimuth;
  const altitude = Math.min(
    MAX_AIM_ALTITUDE_RAD,
    Math.max(-MAX_AIM_ALTITUDE_RAD, pose.apparentAltitudeRad + Math.atan(dyPx / focalPx)),
  );
  return ok({ azimuthRad: azimuth.value, apparentAltitudeRad: altitude, rollRad: pose.rollRad });
}
