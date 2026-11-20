// Generators of the properties of design §11 (test support, not exported). Each states its domain.

import type { Position } from '@alidade/core';
import fc from 'fast-check';
import { DEG_TO_RAD } from '../math/degrees';
import type { NoniusParameters } from '../math/parameters';
import { sunAt } from '../math/sun/sun-at';
import { wrapPiN } from './angles';

/**
 * A true position. Domain: latitude uniform in `[-latDeg, latDeg]` degrees (with `latDeg < 89`,
 * the poles' 1° excluded), longitude uniform in `[-180°, 180°)`. Both as radians.
 */
export function truthArb(latDeg: number): fc.Arbitrary<Position> {
  return fc
    .tuple(
      fc.double({ min: -latDeg, max: latDeg, noNaN: true }),
      fc.double({ min: -180, max: 180, noNaN: true, maxExcluded: true }),
    )
    .map(([latitudeDeg, longitudeDeg]) => ({
      latRad: latitudeDeg * DEG_TO_RAD,
      lonRad: longitudeDeg * DEG_TO_RAD,
    }));
}

/**
 * UTC milliseconds uniform in `[fromYear-01-01, toYear+1-01-01)`, whole milliseconds. Nothing
 * excluded.
 */
export function timeArb(fromYear: number, toYear: number): fc.Arbitrary<number> {
  return fc.integer({ min: Date.UTC(fromYear, 0, 1), max: Date.UTC(toYear + 1, 0, 1) - 1 });
}

/**
 * `n` times (n uniform in `[minCount, maxCount]`) sorted, at one-minute resolution, within
 * `spreadH` hours of a start uniform in 2026 to 2029 (design §11 `sightTimesArb`, before the
 * discard: `usableTimes` says whether a set is kept, and a property counts it with `fc.pre`).
 * Times may repeat; a repeat is a legal Sight set (two sights in the same minute).
 */
export function rawTimesArb(
  minCount: number,
  maxCount: number,
  minSpreadH: number,
  maxSpreadH: number,
): fc.Arbitrary<number[]> {
  const minuteMs = 60_000;
  return fc
    .tuple(
      fc.integer({
        min: Math.floor(Date.UTC(2026, 0, 1) / minuteMs),
        max: Math.floor(Date.UTC(2030, 0, 1) / minuteMs) - 1,
      }),
      fc.integer({ min: minCount, max: maxCount }),
      fc.double({ min: minSpreadH, max: maxSpreadH, noNaN: true }),
    )
    .chain(([startMinute, count, spreadH]) =>
      fc
        .array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: count, maxLength: count })
        .map((fractions) =>
          fractions
            .map((f) => (startMinute + Math.round(f * spreadH * 60)) * minuteMs)
            .sort((a, b) => a - b),
        ),
    );
}

/** The acute angle between two azimuths: `min(|Δ|, π − |Δ|)`, `Δ = wrapPi(a − b)`. */
export function angleOfCutRad(azimuthARad: number, azimuthBRad: number): number {
  const delta = Math.abs(wrapPiN(azimuthARad - azimuthBRad));
  return Math.min(delta, Math.PI - delta);
}

/**
 * Whether a set of times is usable at `truth`: the Sun's apparent altitude there within
 * `[5°, 80°]` at every time (the limits of the parameters), and the largest Angle of cut over
 * pairs at least `minCutDeg`.
 */
export function usableTimes(
  truth: Position,
  times: readonly number[],
  minCutDeg: number,
  params: NoniusParameters,
): boolean {
  const azimuths: number[] = [];
  for (const t of times) {
    const sun = sunAt(truth, t, params);
    if (!sun.ok) return false;
    if (
      sun.value.apparentAltitudeRad < params.minSightAltitudeRad ||
      sun.value.apparentAltitudeRad > params.maxSightAltitudeRad
    ) {
      return false;
    }
    azimuths.push(sun.value.trueAzimuthRad);
  }
  let largest = 0;
  for (let i = 0; i < azimuths.length; i += 1) {
    for (let j = i + 1; j < azimuths.length; j += 1) {
      largest = Math.max(largest, angleOfCutRad(azimuths[i] ?? 0, azimuths[j] ?? 0));
    }
  }
  return largest >= minCutDeg * DEG_TO_RAD;
}
