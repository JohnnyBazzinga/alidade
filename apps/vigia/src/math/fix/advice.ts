// The next-sighting advice (Req 7.2 to 7.7, design D10, §7.10): where a further sighting would
// shrink the 95 % ellipse most. The directions are at right angles to the major axis, as seen
// from the Fix; the figures are Core's, from a solve with one hypothetical Bearing added. The
// hypothetical Bearing exists only inside `nextSightingAdvice`: it is never returned, drawn,
// stored or shared (Req 7.6).

import {
  BearingModel,
  destinationPosition,
  ellipse95,
  greatCircleDistanceM,
  initialAzimuthRad,
  solve,
  wrapTwoPi,
  type Bearing,
  type Fix,
} from '@alidade/core';
import { err, ok, type VigiaResult } from '../../result';
import type { Assessment } from '../assessment/assess';
import { hasOnlyFiniteNumbers } from '../incident/incident-state';
import { checkParameters, type VigiaParameters } from '../parameters';
import { compassWord8, lengthTextNearest } from './format';
import { geometryClass, type GeometryClass } from './geometry-class';

export type Advice =
  | { readonly kind: 'none' }
  | { readonly kind: 'one_sighting' }
  | {
      readonly kind: 'fix';
      /** The two advised directions, as seen from the Fix, in `[0, 2π)`. */
      readonly directionsRad: readonly [number, number];
      /** How far from the Fix to stand: a standing distance, not an estimate of the smoke. */
      readonly distanceM: number;
      readonly areaBeforeM2: number;
      /** The smaller of the two areas after the hypothetical sighting; `null` if both solves failed. */
      readonly areaAfterM2: number | null;
      readonly geometry: GeometryClass;
      readonly usedCount: number;
    };

/** The id of the hypothetical Bearing: not a Sighting id (those have nine symbols). */
const HYPOTHETICAL_ID = 'hypothetical';

/** The area of the 95 % ellipse, or `null` when Core refuses the Ellipse or the area overflows. */
function area95M2(fix: Fix): number | null {
  const e = ellipse95(fix.ellipse);
  if (!e.ok) return null;
  const areaM2 = Math.PI * e.value.semiMajorM * e.value.semiMinorM;
  return Number.isFinite(areaM2) ? areaM2 : null;
}

/**
 * The 95 % area after one more Bearing from `directionRad` at `distanceM` from the Fix, with the
 * largest azimuth sigma and position accuracy of the used Bearings, solved with them and no
 * outlier rejection (so that the comparison is of geometry alone); `null` if that solve fails.
 */
function areaAfterOne(
  fix: Fix,
  used: readonly Bearing[],
  directionRad: number,
  distanceM: number,
): number | null {
  const from = destinationPosition(fix.position, directionRad, distanceM);
  if (!from.ok) return null;
  const azimuth = initialAzimuthRad(from.value, fix.position);
  if (!azimuth.ok) return null;
  const hypothetical: Bearing = {
    id: HYPOTHETICAL_ID,
    observer: from.value,
    positionAccuracyM: Math.max(...used.map((b) => b.positionAccuracyM)),
    timeUtcMs: Math.max(...used.map((b) => b.timeUtcMs)),
    azimuthRad: azimuth.value,
    azimuthSigmaRad: Math.max(...used.map((b) => b.azimuthSigmaRad)),
  };
  const after = solve(new BearingModel(), [...used, hypothetical]);
  return after.ok ? area95M2(after.value) : null;
}

/**
 * The advice for an assessment (design §7.10): `none` with no used Sighting; `one_sighting` with
 * one, or when the solve failed (Req 7.5: the screen shows the failure beside it); with a Fix,
 * the two directions at right angles to its major axis, the distance of the nearest used
 * observer clamped to `[adviceMinDistanceM, plausibleRangeM]`, and the areas before and after.
 * Fails with `invalid_number` naming a parameter, and with Core's failure for a Fix whose Ellipse
 * it cannot scale or whose position it cannot use.
 */
export function nextSightingAdvice(
  assessment: Assessment,
  parameters: VigiaParameters,
): VigiaResult<Advice> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (assessment.used.length === 0) return ok({ kind: 'none' });
  if (assessment.fix === null || !assessment.fix.ok) return ok({ kind: 'one_sighting' });
  const fix = assessment.fix.value;
  if (!hasOnlyFiniteNumbers(fix)) return err('invalid_number', { field: 'fix' });
  const used = assessment.used.map((e) => e.sighting.bearing);

  const before = area95M2(fix);
  if (before === null) return err('invalid_number', { field: 'ellipse' });
  const geometry = geometryClass(fix, parameters);
  if (!geometry.ok) return geometry;

  let nearestM = Number.POSITIVE_INFINITY;
  for (const bearing of used) {
    const d = greatCircleDistanceM(bearing.observer, fix.position);
    if (!d.ok) return d;
    nearestM = Math.min(nearestM, d.value);
  }
  const distanceM = Math.min(
    Math.max(nearestM, parameters.adviceMinDistanceM),
    parameters.plausibleRangeM,
  );

  const first = wrapTwoPi(fix.ellipse.azimuthRad + Math.PI / 2);
  const second = wrapTwoPi(fix.ellipse.azimuthRad - Math.PI / 2);
  if (!first.ok) return first;
  if (!second.ok) return second;
  const areas = [first.value, second.value]
    .map((d) => areaAfterOne(fix, used, d, distanceM))
    .filter((x): x is number => x !== null);

  return ok({
    kind: 'fix',
    directionsRad: [first.value, second.value],
    distanceM,
    areaBeforeM2: before,
    areaAfterM2: areas.length === 0 ? null : Math.min(...areas),
    geometry: geometry.value,
    usedCount: used.length,
  });
}

const ONE_SIGHTING_ADVICE =
  'Move sideways, at right angles to the direction of the smoke, by at least a third of the distance you think the smoke is at; farther is better.';
const GOOD_WITH_FEW =
  'The geometry is good; a further sighting from anywhere still helps, because with fewer than four sightings nothing can be checked.';
const GOOD = 'The geometry is good.';
/** With four or more used Sightings things can be checked (Req 7.3). */
const CHECKABLE_COUNT = 4;

/**
 * The advice in words (design §7.10), or `null` when there is no sighting (the statement by count
 * says how to start). The standing distance is a suggestion, not an estimate of where the smoke
 * is (Req 16.4). No place is named.
 */
export function adviceWords(advice: Advice): VigiaResult<string | null> {
  if (advice.kind === 'none') return ok(null);
  if (advice.kind === 'one_sighting') return ok(ONE_SIGHTING_ADVICE);
  if (advice.geometry === 'good' || advice.geometry === 'none') {
    return ok(advice.usedCount < CHECKABLE_COUNT ? GOOD_WITH_FEW : GOOD);
  }
  const w1 = compassWord8(advice.directionsRad[0]);
  const w2 = compassWord8(advice.directionsRad[1]);
  const distance = lengthTextNearest(advice.distanceM);
  if (!w1.ok) return w1;
  if (!w2.ok) return w2;
  if (!distance.ok) return distance;
  return ok(
    `To shrink the area most, take a further sighting from the ${w1.value} or the ${w2.value} of the smoke, about ${distance.value} from it. ` +
      'Move to the side, so that you and the others are not all on one line to the smoke. ' +
      'The app does not know the terrain, roads or access, so choose the place yourself.',
  );
}
