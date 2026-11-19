// The one module that converts between radians and degrees (Req 1.7). It wraps Core's `degToRad`
// and `radToDeg`. No other module contains a conversion factor. Unlike UI's, these return a
// result and not `NaN` for an angle that is not finite (or whose conversion overflows): no `NaN`
// or infinity leaves a public function (Req 2.1).

import { degToRad, radToDeg } from '@alidade/core';
import type { VigiaResult } from '../result';

/** Degrees to radians. Fails with `invalid_number` if the angle or the result is not finite. */
export function fromDeg(angleDeg: number): VigiaResult<number> {
  return degToRad(angleDeg);
}

/** Radians to degrees. Fails with `invalid_number` if the angle or the result is not finite. */
export function toDeg(angleRad: number): VigiaResult<number> {
  return radToDeg(angleRad);
}
