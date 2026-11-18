// Summaries of the angles in a Sighting window (design §7.5, D5, D19).

import { circularMean, wrapPi, wrapTwoPi } from '@alidade/core';
import { err, ok, type SensorResult } from './sensor-result';

/** Below this mean resultant length (`q = 1 - R̄` at or above `1 - 1e-9`) the mean is undefined. */
const MIN_MEAN_RESULTANT_LENGTH = 1e-9;

export interface AzimuthSummary {
  /** The circular mean, in [0, 2π). */
  readonly meanRad: number;
  /** The circular standard deviation `sqrt(-2 ln R̄)`. */
  readonly spreadRad: number;
}

/**
 * The circular mean and the Spread of a set of angles (D5).
 *
 * The direct formula, `R̄ = |Σ e^{iθ}| / n` then `sqrt(-2 ln R̄)`, cancels catastrophically near
 * `R̄ = 1`: for identical angles it can return about `1e-8` instead of `0`. Here the mean `μ` is
 * found first, then `q = 1 - R̄ = (2/n) Σ sin²(wrapPi(θᵢ - μ)/2)` without cancellation, and the
 * Spread is `sqrt(-2 · log1p(-q))`. The two are equal in exact arithmetic, because
 * `R̄ = (1/n) Σ cos(θᵢ - μ)` when `μ` is the direction of the resultant.
 *
 * Fails with `invalid_number` for a non-finite angle, `insufficient_samples` for an empty set,
 * and Core's `undefined_mean` when the mean is undefined.
 */
export function summariseAzimuths(rawAnglesRad: readonly number[]): SensorResult<AzimuthSummary> {
  if (rawAnglesRad.length === 0) return err('insufficient_samples');
  // Every angle is reduced to [0, 2π) first, so that the mean (sin and cos of the angle) and the
  // differences (`wrapPi`, a remainder by a rounded 2π) see the same number. Without it,
  // identical angles of 1e300 rad gave a Spread of about 0.76 (Req 11.8, design D25).
  const anglesRad: number[] = [];
  for (const rawAngleRad of rawAnglesRad) {
    const reduced = wrapTwoPi(rawAngleRad);
    if (!reduced.ok) return reduced;
    anglesRad.push(reduced.value);
  }
  const mean = circularMean(anglesRad);
  if (!mean.ok) return mean;
  let sumSquares = 0;
  for (const angleRad of anglesRad) {
    const difference = wrapPi(angleRad - mean.value);
    if (!difference.ok) return difference;
    const half = Math.sin(difference.value / 2);
    sumSquares += half * half;
  }
  const q = (2 * sumSquares) / anglesRad.length;
  if (q >= 1 - MIN_MEAN_RESULTANT_LENGTH) return err('undefined_mean');
  return ok({ meanRad: mean.value, spreadRad: Math.sqrt(-2 * Math.log1p(-q)) });
}

export interface AltitudeSummary {
  readonly meanRad: number;
  /** `sqrt((1/n) Σ (hᵢ - mean)²)`, computed about the mean (D19). */
  readonly stdDevRad: number;
}

/**
 * The arithmetic mean and the standard deviation of a set of altitudes (Req 9.1, 9.10, D19).
 * Altitudes lie in [-π/2, π/2] and do not wrap, so the arithmetic mean is the right one.
 *
 * The mean is taken about the first altitude, `h₀ + Σ(hᵢ − h₀) / n`, so that identical altitudes
 * give back `h₀` exactly; the plain `Σhᵢ / n` drifts by several ulps over a few hundred equal
 * values. It is then clamped to the [min, max] of the altitudes, so rounding can never carry it
 * outside their range (Req 9.10) and, with an offset, across the limit of Req 9.6.
 */
export function summariseAltitudes(altitudesRad: readonly number[]): SensorResult<AltitudeSummary> {
  const first = altitudesRad[0];
  if (first === undefined) return err('insufficient_samples');
  let lowest = first;
  let highest = first;
  let sumOfDifferences = 0;
  for (const altitudeRad of altitudesRad) {
    if (!Number.isFinite(altitudeRad)) return err('invalid_number');
    lowest = Math.min(lowest, altitudeRad);
    highest = Math.max(highest, altitudeRad);
    sumOfDifferences += altitudeRad - first;
  }
  const meanRad = Math.min(
    highest,
    Math.max(lowest, first + sumOfDifferences / altitudesRad.length),
  );
  let sumSquares = 0;
  for (const altitudeRad of altitudesRad) sumSquares += (altitudeRad - meanRad) ** 2;
  const stdDevRad = Math.sqrt(sumSquares / altitudesRad.length);
  // Altitudes near ±Number.MAX_VALUE overflow the sums; the summary is then not a number the
  // caller can use (Req 11.8), whatever the arguments. Real altitudes lie in [-π/2, π/2].
  if (!Number.isFinite(meanRad) || !Number.isFinite(stdDevRad)) {
    return err('invalid_number', { field: 'altitudesRad' });
  }
  return ok({ meanRad, stdDevRad });
}

/** Combines independent 1-sigmas as the square root of the sum of squares. */
export function rss(...sigmas: readonly number[]): number {
  return Math.hypot(...sigmas);
}
