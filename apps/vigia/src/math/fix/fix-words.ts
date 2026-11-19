// The Fix in words (Req 6.2, 6.3, 6.7, 5.8, 16.1, 16.4, design D9, §7.8). Every position and
// length comes from `format.ts`, so that a position never reaches a sentence without its metres
// in the same sentence. The words say "probably within" and never claim certainty (Req 6.3).

import {
  ellipse95,
  greatCircleDistanceM,
  initialAzimuthRad,
  POOR_GEOMETRY_CROSSING_RAD,
  type Fix,
} from '@alidade/core';
import { err, ok, type VigiaResult } from '../../result';
import type { Assessment } from '../assessment/assess';
import { ageText } from '../civil-time';
import { toDeg } from '../degrees';
import { checkParameters, type VigiaParameters } from '../parameters';
import { FIX_LIMITS_TEXT } from '../texts';
import { axisWords, lengthText95, lengthTextNearest, positionText } from './format';
import { halfIntervalM } from './from-you';
import { geometryClass, geometrySentence } from './geometry-class';

export interface FixWords {
  /** `Probably here: …, within about R (95 %).`: the position and its uncertainty in one sentence. */
  readonly headline: string;
  /** The 95 % semi-axes and the direction of the long axis. */
  readonly area: string;
  /** How many sightings it rests on, how many were set aside, and their ages. */
  readonly basis: string;
  /** The Geometry class in words. */
  readonly geometry: string;
  readonly warnings: readonly string[];
  /** What the ellipse does and does not say (Req 6.3). */
  readonly limits: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The words of the Fix as one text, in the order of the screen. */
export function fixWordsText(words: FixWords): string {
  return [
    words.headline,
    words.area,
    words.basis,
    words.geometry,
    ...words.warnings,
    words.limits,
  ].join(' ');
}

/**
 * The plausible-range warning (Req 5.8), with the distance's uncertainty in the same sentence (Req
 * 16.4): `null` when the nearest used observer is within the plausible range.
 */
function rangeWarning(
  fix: Fix,
  assessment: Assessment,
  parameters: VigiaParameters,
): VigiaResult<string | null> {
  let nearestM = Number.POSITIVE_INFINITY;
  let nearestObserver = null;
  for (const entry of assessment.used) {
    const distance = greatCircleDistanceM(entry.sighting.bearing.observer, fix.position);
    if (!distance.ok) return distance;
    if (distance.value < nearestM) {
      nearestM = distance.value;
      nearestObserver = entry.sighting.bearing.observer;
    }
  }
  if (nearestObserver === null || nearestM <= parameters.plausibleRangeM) return ok(null);
  const e95 = ellipse95(fix.ellipse);
  if (!e95.ok) return e95;
  const azimuth = initialAzimuthRad(nearestObserver, fix.position);
  if (!azimuth.ok) return azimuth;
  const h = halfIntervalM(e95.value, azimuth.value);
  if (!h.ok) return h;
  const distanceText = lengthTextNearest(nearestM);
  const interval = lengthText95(h.value);
  if (!distanceText.ok) return distanceText;
  if (!interval.ok) return interval;
  return ok(
    `The smoke would be about ${distanceText.value} from the nearest observer, give or take ${interval.value} (95 %), beyond what a phone sighting can place.`,
  );
}

/**
 * The words of `fix` (design §7.8), with the counts and ages of `assessment` at `nowUtcMs`. Fails
 * with Core's failure when the Ellipse cannot be scaled to 95 %, with `insufficient_observations`
 * for fewer than two used Sightings, with `unsupported_position` for a Fix outside the Supported
 * positions, and with `invalid_number` naming `nowUtcMs` or a parameter.
 */
export function fixWords(
  fix: Fix,
  assessment: Assessment,
  nowUtcMs: number,
  parameters: VigiaParameters,
): VigiaResult<FixWords> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
  if (assessment.used.length < 2) return err('insufficient_observations');
  const e95 = ellipse95(fix.ellipse);
  if (!e95.ok) return e95;
  const { semiMajorM: a95, semiMinorM: b95 } = e95.value;

  const position = positionText(fix.position, b95);
  if (!position.ok) return position;
  // The radius of "within about": the 95 % semi-major axis plus the printing bound (Req 6.2).
  const radius = lengthText95(a95 + position.value.printBoundM);
  const major = lengthText95(a95);
  const minor = lengthText95(b95);
  const axis = axisWords(e95.value.azimuthRad);
  if (!radius.ok) return radius;
  if (!major.ok) return major;
  if (!minor.ok) return minor;
  if (!axis.ok) return axis;

  const times = assessment.used.map((e) => e.sighting.bearing.timeUtcMs);
  const n = assessment.used.length;
  const m = assessment.setAside.length;
  const counted = `Based on ${n} ${plural(n, 'sighting', 'sightings')}${m > 0 ? ` (${m} set aside)` : ''}`;
  const basis = `${counted}; newest ${ageText(nowUtcMs - Math.max(...times))}, oldest ${ageText(nowUtcMs - Math.min(...times))}.`;

  const geometry = geometryClass(fix, parameters);
  if (!geometry.ok) return geometry;

  const warnings: string[] = [];
  if (fix.warnings.includes('poor_geometry')) {
    const limitDeg = toDeg(POOR_GEOMETRY_CROSSING_RAD);
    if (!limitDeg.ok) return limitDeg;
    warnings.push(
      `The sightings cross at a narrow angle (under ${Math.round(limitDeg.value)} degrees).`,
    );
  }
  if (fix.warnings.includes('outliers_excluded')) {
    const k = fix.excludedIds.length;
    warnings.push(
      `${k} ${plural(k, 'sighting', 'sightings')} did not agree with the others and ${plural(k, 'was', 'were')} set aside.`,
    );
  }
  const range = rangeWarning(fix, assessment, parameters);
  if (!range.ok) return range;
  if (range.value !== null) warnings.push(range.value);

  return ok({
    headline: `Probably here: ${position.value.text}, within about ${radius.value} (95 %).`,
    area: `The 95 % area is an ellipse with semi-axes ${major.value} and ${minor.value}, long axis ${axis.value}.`,
    basis,
    geometry: geometrySentence(geometry.value),
    warnings,
    limits: FIX_LIMITS_TEXT,
  });
}
