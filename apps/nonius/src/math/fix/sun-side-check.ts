// The Sun side as a check on a place (Req 6.5, design §7.5.1): the compass's reading of where the
// Sun was, compared with where the Sun would have been at the place. Never given to the solver.

import {
  angularDifference,
  initialAzimuthRad,
  isSupportedPosition,
  type Position,
} from '@alidade/core';
import { declinationAt, trueAzimuthFromMagnetic } from '@alidade/sensors';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { PreparedSight } from '../sight/prepare';

export interface SunSideCheck {
  /** How many Sights could be judged (a Sun side, and a Declination if it is magnetic). */
  readonly usable: number;
  /** The id of the first Sight (in the order of the ids) whose Sun side contradicts the place. */
  readonly contradictedBy: string | null;
  /** For that Sight: the measured true azimuth and the one computed at the place. */
  readonly measuredTrueAzimuthRad: number | null;
  readonly computedAzimuthRad: number | null;
  /** The largest difference over the Sights that could be judged; 0 when none. */
  readonly worstDifferenceRad: number;
}

/**
 * Whether the Sun side of any Sight contradicts `fixPosition`: its true azimuth (a `magnetic` one
 * made true with the Declination of Sensors' `declinationAt` at the place and time; a Sight whose
 * Declination fails is left out) differs from the computed azimuth of the Sun at the place by more
 * than `SUN_SIDE_TOLERANCE_RAD`, as a wrapped difference.
 */
export function contradicts(
  fixPosition: Position,
  prepared: readonly PreparedSight[],
  params: NoniusParameters,
): NoniusResult<SunSideCheck> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!isSupportedPosition(fixPosition))
    return err('unsupported_position', { field: 'fixPosition' });
  const sorted = [...prepared].sort((a, b) =>
    a.sight.id < b.sight.id ? -1 : a.sight.id > b.sight.id ? 1 : 0,
  );
  let usable = 0;
  let worst = 0;
  let contradictedBy: string | null = null;
  let measured: number | null = null;
  let computedAt: number | null = null;
  for (const p of sorted) {
    const side = p.sight.sunSide;
    if (side === null || !Number.isFinite(side.azimuthRad)) continue;
    let trueAzimuthRad = side.azimuthRad;
    if (side.northReference === 'magnetic') {
      const declination = declinationAt(fixPosition, p.sight.timeUtcMs);
      if (!declination.ok) continue;
      const converted = trueAzimuthFromMagnetic(side.azimuthRad, declination.value);
      if (!converted.ok) continue;
      trueAzimuthRad = converted.value;
    }
    const computed = initialAzimuthRad(fixPosition, p.subsolar);
    if (!computed.ok) continue;
    const difference = angularDifference(trueAzimuthRad, computed.value);
    if (!difference.ok) continue;
    usable += 1;
    const size = Math.abs(difference.value);
    worst = Math.max(worst, size);
    if (size > params.sunSideToleranceRad && contradictedBy === null) {
      contradictedBy = p.sight.id;
      measured = trueAzimuthRad;
      computedAt = computed.value;
    }
  }
  return ok({
    usable,
    contradictedBy,
    measuredTrueAzimuthRad: measured,
    computedAzimuthRad: computedAt,
    worstDifferenceRad: worst,
  });
}
