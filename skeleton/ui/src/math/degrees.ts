// The one module that converts between radians and degrees (Req 1.10). It wraps Core's `degToRad`
// and `radToDeg`. No other module contains a conversion factor, and a literal in degrees appears
// elsewhere only as the argument of `fromDeg`.

import { degToRad, radToDeg } from '@alidade/core';

/** Degrees to radians. A non-finite argument gives `NaN`, which callers check, never a throw. */
export function fromDeg(angleDeg: number): number {
  const result = degToRad(angleDeg);
  return result.ok ? result.value : Number.NaN;
}

/** Radians to degrees. A non-finite argument gives `NaN`. */
export function toDeg(angleRad: number): number {
  const result = radToDeg(angleRad);
  return result.ok ? result.value : Number.NaN;
}
