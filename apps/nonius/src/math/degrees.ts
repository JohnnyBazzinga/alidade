// The one module that converts between radians, degrees, arc-minutes and hours (Req 1.7). The
// functions wrap Core's `degToRad` and `radToDeg`; no other module contains a conversion factor.
// Unlike UI's, they return a result and not `NaN` for a number that is not finite (or whose
// conversion overflows): no `NaN` or infinity leaves a public function (Req 2.1). The constants
// are for code that has already checked its input (the defaults, the Sun wrapper's library
// output).

import { degToRad, radToDeg } from '@alidade/core';
import { err, ok, type NoniusResult } from '../result';

/** Radians in one degree. */
export const DEG_TO_RAD = Math.PI / 180;

/** Radians in one arc-minute. */
export const ARCMIN_TO_RAD = DEG_TO_RAD / 60;

/** Degrees of rotation in one hour of sidereal time or of hour angle (24 h = 360°). */
export const HOURS_TO_DEG = 15;

/** Degrees to radians. Fails with `invalid_number` if the angle or the result is not finite. */
export function fromDeg(angleDeg: number): NoniusResult<number> {
  return degToRad(angleDeg);
}

/** Radians to degrees. Fails with `invalid_number` if the angle or the result is not finite. */
export function toDeg(angleRad: number): NoniusResult<number> {
  return radToDeg(angleRad);
}

/** Arc-minutes to radians. Fails with `invalid_number` if the angle or the result is not finite. */
export function fromArcmin(angleArcmin: number): NoniusResult<number> {
  if (!Number.isFinite(angleArcmin)) return err('invalid_number', { field: 'angleArcmin' });
  const angleRad = angleArcmin * ARCMIN_TO_RAD;
  return Number.isFinite(angleRad) ? ok(angleRad) : err('invalid_number', { field: 'angleArcmin' });
}
