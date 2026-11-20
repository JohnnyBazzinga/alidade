// The difference of one calibration sight (Req 15.3): `dₖ = measured − computed`, both apparent
// altitudes. `indexErrorFromSights` takes the mean of these; the Index error screen shows each as
// it is taken.

import type { Position } from '@alidade/core';
import { ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import { sunAt } from '../sun/sun-at';
import { checkSight, type Sight } from './sight';

/** Fails with `invalid_observation` for a Sight that cannot be used, and with the failure of `sunAt`. */
export function calibrationDifferenceRad(
  sight: Sight,
  place: Position,
  params: NoniusParameters,
): NoniusResult<number> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const bad = checkSight(sight);
  if (bad !== null) return bad;
  const sun = sunAt(place, sight.timeUtcMs, params);
  if (!sun.ok) return { ...sun, id: sight.id };
  return ok(sight.rawApparentAltitudeRad - sun.value.apparentAltitudeRad);
}
