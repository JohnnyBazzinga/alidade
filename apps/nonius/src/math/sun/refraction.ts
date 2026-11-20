// Refraction and its inverse (Req 4.7, 4.11, design D4, §6.2).

import { err, ok, type NoniusResult } from '../../result';
import { ARCMIN_TO_RAD, DEG_TO_RAD } from '../degrees';

const LOWEST_APPARENT_RAD = -1 * DEG_TO_RAD;
const HIGHEST_APPARENT_RAD = 90 * DEG_TO_RAD;
const BISECTION_ROUNDS = 64;

/**
 * Bennett's formula (G. G. Bennett, 1982, as in Meeus, Astronomical Algorithms, chapter 16):
 * `R = cot(h + 7.31 / (h + 4.4))` arc-minutes, `h` the apparent altitude in degrees; stated
 * accuracy 0.07′ from 0° to 90° in standard conditions (10 °C, 1010 hPa). Defined for apparent
 * altitudes in [−1°, 90°]; outside, `invalid_number`.
 */
export function refractionRad(apparentRad: number): NoniusResult<number> {
  if (
    !Number.isFinite(apparentRad) ||
    apparentRad < LOWEST_APPARENT_RAD ||
    apparentRad > HIGHEST_APPARENT_RAD
  ) {
    return err('invalid_number', { field: 'apparentRad' });
  }
  const h = apparentRad / DEG_TO_RAD;
  const argumentRad = (h + 7.31 / (h + 4.4)) * DEG_TO_RAD;
  const radius = (1 / Math.tan(argumentRad)) * ARCMIN_TO_RAD;
  return Number.isFinite(radius) ? ok(radius) : err('invalid_number', { field: 'apparentRad' });
}

/** `a − R(a)` for an apparent altitude already known to be inside the domain. */
function geometricOf(apparentRad: number): number {
  const r = refractionRad(apparentRad);
  return r.ok ? apparentRad - r.value : Number.NaN;
}

/**
 * The apparent altitude whose geometric altitude (the apparent less its refraction) is
 * `geometricRad`, by 64 bisections on `[g, g + 1°]` clipped to the domain of the formula:
 * `a − R(a)` is increasing and `R` is under 1° for `a ≥ −1°`, so the root is in the bracket and
 * 64 halvings reach below `1e-19` rad. Deterministic and total; `invalid_number` when no
 * apparent altitude in [−1°, 90°] has that geometric altitude.
 */
export function apparentFromGeometricRad(geometricRad: number): NoniusResult<number> {
  if (!Number.isFinite(geometricRad)) return err('invalid_number', { field: 'geometricRad' });
  let low = Math.max(geometricRad, LOWEST_APPARENT_RAD);
  let high = Math.min(geometricRad + DEG_TO_RAD, HIGHEST_APPARENT_RAD);
  if (!(low <= high) || geometricOf(low) > geometricRad || geometricOf(high) < geometricRad) {
    return err('invalid_number', { field: 'geometricRad' });
  }
  for (let round = 0; round < BISECTION_ROUNDS; round += 1) {
    const middle = (low + high) / 2;
    if (geometricOf(middle) < geometricRad) low = middle;
    else high = middle;
  }
  return ok((low + high) / 2);
}
