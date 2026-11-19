// Direction and distance from this phone to the Fix, with the interval of the distance (Req 6.4,
// 6.9, design §7.11). The distance is never produced without its interval: one function builds both.

import {
  ellipse95,
  greatCircleDistanceM,
  initialAzimuthRad,
  isSupportedPosition,
  type Ellipse,
  type Fix,
  type Position,
} from '@alidade/core';
import { err, ok, type VigiaResult } from '../../result';
import { checkParameters, type VigiaParameters } from '../parameters';
import { compassWord8, lengthText95, lengthTextNearest } from './format';

/**
 * `sqrt(a² cos²θ + b² sin²θ)`, with `θ` the angle between the direction and the major axis and
 * `a`, `b` the 95 % semi-axes: the half-width of the 95 % ellipse's shadow on that direction, so
 * a conservative (at least 95 %) interval for the distance. Fails with `invalid_number` naming
 * `ellipse` or `directionRad` for a value that is not finite (or axes that are not positive).
 */
export function halfIntervalM(ellipse95M: Ellipse, directionRad: number): VigiaResult<number> {
  const { semiMajorM: a, semiMinorM: b, azimuthRad } = ellipse95M;
  if (![a, b, azimuthRad].every(Number.isFinite) || !(a > 0 && b > 0)) {
    return err('invalid_number', { field: 'ellipse' });
  }
  if (!Number.isFinite(directionRad)) return err('invalid_number', { field: 'directionRad' });
  const theta = directionRad - azimuthRad;
  const h = Math.sqrt(a * a * Math.cos(theta) ** 2 + b * b * Math.sin(theta) ** 2);
  return Number.isFinite(h) ? ok(h) : err('invalid_number', { field: 'ellipse' });
}

/**
 * `About 3.0 km north of you, give or take 770 m (at least 95 %).` A phone at the estimated
 * position (Core's `coincident_positions`) gets a sentence that gives no distance. Fails with
 * `unsupported_position` for your position, with Core's failure for an Ellipse it refuses, and
 * with `invalid_number` naming a parameter.
 */
export function fromYouWords(
  fix: Fix,
  you: Position,
  parameters: VigiaParameters,
): VigiaResult<string> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!isSupportedPosition(you)) return err('unsupported_position');
  const e95 = ellipse95(fix.ellipse);
  if (!e95.ok) return e95;
  const azimuth = initialAzimuthRad(you, fix.position);
  if (!azimuth.ok) {
    if (azimuth.reason === 'coincident_positions') {
      return ok('You are at the estimated position, so the distance cannot be given.');
    }
    return azimuth;
  }
  const distance = greatCircleDistanceM(you, fix.position);
  if (!distance.ok) return distance;
  const h = halfIntervalM(e95.value, azimuth.value);
  if (!h.ok) return h;
  const distanceText = lengthTextNearest(distance.value);
  const word = compassWord8(azimuth.value);
  const interval = lengthText95(h.value);
  if (!distanceText.ok) return distanceText;
  if (!word.ok) return word;
  if (!interval.ok) return interval;
  return ok(
    `About ${distanceText.value} ${word.value} of you, give or take ${interval.value} (at least 95 %).`,
  );
}
