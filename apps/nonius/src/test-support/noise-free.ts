// Noise-free Sights and their preparation, for tests (test support, not exported).

import { unprojectToLocalPlane, type Position } from '@alidade/core';
import type { NoniusParameters } from '../math/parameters';
import { calibrationInUse, type CalibrationInUse } from '../math/sight/index-error';
import { prepareSights, type PreparedSight } from '../math/sight/prepare';
import type { Sight } from '../math/sight/sight';
import { sunAt } from '../math/sun/sun-at';

/**
 * Sights of `truth` at `times`: raw altitude the true apparent altitude plus `biasRad`, sample
 * standard deviation 0, no Mark, the Sun side the true azimuth (`true`) when `withSunSide`. Ids
 * `s00`, `s01` … in the order of the times. Throws when the Sun cannot be computed.
 */
export function noiseFreeSights(
  truth: Position,
  times: readonly number[],
  biasRad: number,
  withSunSide: boolean | readonly boolean[],
  params: NoniusParameters,
): Sight[] {
  return times.map((timeUtcMs, i) => {
    const sun = sunAt(truth, timeUtcMs, params);
    if (!sun.ok) throw new Error(`sunAt failed: ${sun.reason}`);
    const side = Array.isArray(withSunSide) ? withSunSide[i] === true : withSunSide === true;
    return {
      id: `s${String(i).padStart(2, '0')}`,
      timeUtcMs,
      rawApparentAltitudeRad: sun.value.apparentAltitudeRad + biasRad,
      sampleStdDevRad: 0,
      markSigmaRad: 0,
      sunSide: side
        ? { azimuthRad: sun.value.trueAzimuthRad, northReference: 'true' as const }
        : null,
      simulated: false,
    };
  });
}

/** `prepareSights` that throws on failure, returning the prepared Sights. */
export function preparedOf(
  sights: readonly Sight[],
  calibration: CalibrationInUse,
  params: NoniusParameters,
): PreparedSight[] {
  const r = prepareSights(sights, calibration, params);
  if (!r.ok) throw new Error(`prepareSights failed: ${r.reason}`);
  return [...r.value.prepared];
}

/** Noise-free prepared Sights with no Index error (so the Common sigma is the uncalibrated one). */
export function preparedAt(
  truth: Position,
  times: readonly number[],
  params: NoniusParameters,
): PreparedSight[] {
  return preparedOf(
    noiseFreeSights(truth, times, 0, false, params),
    calibrationInUse(null),
    params,
  );
}

/** The place `eastM` east and `northM` north of `origin` on its Local plane; throws if unsupported. */
export function offsetPosition(origin: Position, eastM: number, northM: number): Position {
  const r = unprojectToLocalPlane(origin, { eastM, northM });
  if (!r.ok) throw new Error(`unproject failed: ${r.reason}`);
  return r.value;
}
