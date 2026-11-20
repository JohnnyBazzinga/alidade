// Generators of the properties of design §11 (test support, not exported). Each states its domain.

import type { Position } from '@alidade/core';
import fc from 'fast-check';
import { DEG_TO_RAD } from '../math/degrees';
import type { NoniusParameters } from '../math/parameters';
import { sunAt } from '../math/sun/sun-at';
import { wrapPiN } from './angles';

/** Steps of the grids the generators draw on: 1e-6 degree of latitude and longitude. */
const MICRO_DEGREES_PER_DEGREE = 1_000_000;

/**
 * An integer drawn uniformly in `[min, max]`: `fc.integer` without fast-check's bias toward zero
 * and the ends of the range (`fc.noBias`). fast-check's `fc.double` is biased the same way, which
 * drew |latitude| under 20° in 94 % of the cases before checkpoint 7's correction.
 */
function uniformInteger(min: number, max: number): fc.Arbitrary<number> {
  return fc.noBias(fc.integer({ min, max }));
}

/**
 * A true position. Domain: latitude uniform in `[-latDeg, latDeg]` degrees (with `latDeg < 89`,
 * the poles' 1° excluded), longitude uniform in `[-180°, 180°)`; both on a grid of 1e-6 degree
 * (0.11 m), drawn without bias. Both as radians.
 */
export function truthArb(latDeg: number): fc.Arbitrary<Position> {
  const latSteps = Math.round(latDeg * MICRO_DEGREES_PER_DEGREE);
  const lonSteps = 180 * MICRO_DEGREES_PER_DEGREE;
  return fc
    .tuple(uniformInteger(-latSteps, latSteps), uniformInteger(-lonSteps, lonSteps - 1))
    .map(([latMicro, lonMicro]) => ({
      latRad: (latMicro / MICRO_DEGREES_PER_DEGREE) * DEG_TO_RAD,
      lonRad: (lonMicro / MICRO_DEGREES_PER_DEGREE) * DEG_TO_RAD,
    }));
}

/**
 * UTC milliseconds uniform in `[fromYear-01-01, toYear+1-01-01)`, whole milliseconds, drawn
 * without bias. Nothing excluded.
 */
export function timeArb(fromYear: number, toYear: number): fc.Arbitrary<number> {
  return uniformInteger(Date.UTC(fromYear, 0, 1), Date.UTC(toYear + 1, 0, 1) - 1);
}

/**
 * `n` times (n uniform in `[minCount, maxCount]`) sorted, at one-minute resolution: a start
 * uniform in 2026 to 2029 (whole minutes), a spread uniform in `[minSpreadH, maxSpreadH]` hours
 * (whole minutes), and each time uniform in `[start, start + spread]` (whole minutes); every
 * draw without bias (design §11 `sightTimesArb`, before the discard: `usableTimes` says whether a
 * set is kept, and a property counts it with `fc.pre`). Times may repeat; a repeat is a legal
 * Sight set (two sights in the same minute).
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
      uniformInteger(
        Math.floor(Date.UTC(2026, 0, 1) / minuteMs),
        Math.floor(Date.UTC(2030, 0, 1) / minuteMs) - 1,
      ),
      uniformInteger(minCount, maxCount),
      uniformInteger(Math.round(minSpreadH * 60), Math.round(maxSpreadH * 60)),
    )
    .chain(([startMinute, count, spreadMinutes]) =>
      fc
        .array(uniformInteger(0, spreadMinutes), { minLength: count, maxLength: count })
        .map((offsets) => offsets.map((m) => (startMinute + m) * minuteMs).sort((a, b) => a - b)),
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
