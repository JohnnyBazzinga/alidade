// The Candidates (Req 6.2, design D8, §7.1): the two places where the Circles of the pair of
// Sights with the largest Angle of cut cross, found in closed form with no starting point.

import {
  angularDifference,
  initialAzimuthRad,
  isSupportedPosition,
  type Position,
} from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import { circleCrossings } from '../sphere/circle-crossings';
import type { PreparedSight } from '../sight/prepare';

export interface CandidateSet {
  /** The ids of the pair, in the order of the ids. */
  readonly pairIds: readonly [string, string];
  /** The supported crossings of the pair's Circles, by latitude and then longitude. */
  readonly places: readonly Position[];
  /** The Angle of cut of the pair, which both crossings share. */
  readonly angleOfCutRad: number;
}

/** Two cuts closer than this are a tie, which the order of the ids settles. */
const TIE_RAD = 1e-12;

/**
 * For every pair of Sights (taken in the order of their ids) the crossings of their Circles, a
 * Circle being the places at `π/2 − observed geometric altitude` from the Subsolar point; the
 * pair with the largest Angle of cut (the first in the order of the ids on a tie) gives the
 * Candidates. A crossing that is not a Supported position is dropped. Fails with
 * `circles_do_not_meet` when there is no pair, or no pair has a usable crossing; the parameters
 * are checked first. The result does not depend on the order of `prepared`, and uses no Position
 * but those computed from the Sights.
 */
export function candidates(
  prepared: readonly PreparedSight[],
  params: NoniusParameters,
): NoniusResult<CandidateSet> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const sorted = [...prepared].sort((a, b) =>
    a.sight.id < b.sight.id ? -1 : a.sight.id > b.sight.id ? 1 : 0,
  );
  let best: CandidateSet | null = null;
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      if (a === undefined || b === undefined) continue;
      const crossings = circleCrossings(
        a.subsolar,
        Math.PI / 2 - a.observedGeometricAltitudeRad,
        b.subsolar,
        Math.PI / 2 - b.observedGeometricAltitudeRad,
      );
      if (!crossings.ok) return crossings;
      const places = crossings.value.filter(isSupportedPosition);
      const first = places[0];
      if (first === undefined) continue;
      const azimuthA = initialAzimuthRad(first, a.subsolar);
      const azimuthB = initialAzimuthRad(first, b.subsolar);
      if (!azimuthA.ok || !azimuthB.ok) continue;
      const difference = angularDifference(azimuthA.value, azimuthB.value);
      if (!difference.ok) continue;
      const delta = Math.abs(difference.value);
      const cut = Math.min(delta, Math.PI - delta);
      if (best === null || cut > best.angleOfCutRad + TIE_RAD) {
        best = {
          pairIds: [a.sight.id, b.sight.id],
          places: [...places].sort((p, q) => p.latRad - q.latRad || p.lonRad - q.lonRad),
          angleOfCutRad: cut,
        };
      }
    }
  }
  return best === null ? err('circles_do_not_meet') : ok(best);
}
