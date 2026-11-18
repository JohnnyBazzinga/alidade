// The true direction of a Target from a Station (Req 16.2, 16.10).

import { greatCircleDistanceM, initialAzimuthRad, wrapTwoPi } from '@alidade/core';
import { err, ok, type UiResult } from '../../result';
import type { Station, Target } from './scene';

export interface TrueDirection {
  /** True azimuth, in [0, 2π). */
  readonly azimuthRad: number;
  /** In [-π/2, π/2]. */
  readonly apparentAltitudeRad: number;
}

/** A Target under 1 m away cannot be sighted: `coincident_positions` (Req 16.2). */
export const MIN_TARGET_DISTANCE_M = 1;

/**
 * A landmark: Core's `initialAzimuthRad` and `atan2(heightM, distanceM)` with Core's
 * `greatCircleDistanceM`. The Sun: its given direction, the azimuth wrapped to [0, 2π).
 */
export function targetDirection(station: Station, target: Target): UiResult<TrueDirection> {
  if (target.kind === 'sun') {
    const azimuth = wrapTwoPi(target.azimuthRad);
    if (!azimuth.ok) return azimuth;
    const h = target.apparentAltitudeRad;
    if (!Number.isFinite(h) || Math.abs(h) > Math.PI / 2)
      return err('invalid_number', { field: 'apparentAltitudeRad' });
    return ok({ azimuthRad: azimuth.value, apparentAltitudeRad: h });
  }
  if (!Number.isFinite(target.heightM)) return err('invalid_number', { field: 'heightM' });
  const distance = greatCircleDistanceM(station.position, target.position);
  if (!distance.ok) return distance;
  if (distance.value < MIN_TARGET_DISTANCE_M) return err('coincident_positions', { id: target.id });
  const azimuth = initialAzimuthRad(station.position, target.position);
  if (!azimuth.ok) return azimuth;
  return ok({
    azimuthRad: azimuth.value,
    apparentAltitudeRad: Math.atan2(target.heightM, distance.value),
  });
}
