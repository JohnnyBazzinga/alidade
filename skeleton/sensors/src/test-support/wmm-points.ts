// Helpers that turn a published WMM2025 test point into the inputs of `declinationAt`.

import type { Position } from '@alidade/core';
import type { WmmTestPoint } from './fixtures';

/** The UTC instant of a published decimal year, by the inverse of D12's definition. */
export function utcMsFromDecimalYear(decimalYear: number): number {
  const year = Math.floor(decimalYear);
  const startUtcMs = Date.UTC(year, 0, 1);
  const endUtcMs = Date.UTC(year + 1, 0, 1);
  return startUtcMs + (decimalYear - year) * (endUtcMs - startUtcMs);
}

/** The point's position, with its longitude wrapped to (-180°, 180°] (the published 240 is -120). */
export function positionOf(point: WmmTestPoint): Position {
  const longitudeDeg = point.longitudeDeg > 180 ? point.longitudeDeg - 360 : point.longitudeDeg;
  return { latRad: point.latitudeDeg * (Math.PI / 180), lonRad: longitudeDeg * (Math.PI / 180) };
}

/** The error model of Req 6.6, in degrees, computed here from the published `H`, not the source. */
export function expectedSigmaDeg(horizontalIntensityNt: number): number {
  return Math.sqrt(0.26 ** 2 + (5417 / horizontalIntensityNt) ** 2);
}
