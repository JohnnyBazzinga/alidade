// The Index error (Req 15, design D6, §7.4): the phone's constant altitude error, measured with Sun
// sights at a place the phone knows, as a mean in the apparent domain.

import { UNCALIBRATED_ALTITUDE, type PositionFix } from '@alidade/sensors';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import { EARTH_RADIUS_M } from '../sphere/earth';
import { sunAt } from '../sun/sun-at';
import { checkSight, independentSigmaRad, type Sight } from './sight';

export interface IndexError {
  /** The mean of measured minus computed apparent altitude. */
  readonly valueRad: number;
  readonly sigmaRad: number;
  readonly sightCount: number;
  /** The time of the last sight. */
  readonly measuredUtcMs: number;
  readonly simulated: boolean;
}

export type CalibrationInUse =
  | { readonly kind: 'index_error'; readonly indexError: IndexError }
  | { readonly kind: 'uncalibrated'; readonly sigmaRad: number };

/** The Index error when there is one, else the skeleton's uncalibrated sigma (Glossary). */
export function calibrationInUse(indexError: IndexError | null): CalibrationInUse {
  return indexError === null
    ? { kind: 'uncalibrated', sigmaRad: UNCALIBRATED_ALTITUDE.sigmaRad }
    : { kind: 'index_error', indexError };
}

/**
 * The Index error from calibration sights (each a raw Sight) taken at `knownPlace` (a Position fix):
 *
 * ```
 * dₖ  = rawₖ − apparentFromGeometric(geometric altitude of the Sun at the place at tₖ)
 * IE  = mean(dₖ)
 * s   = max(sample standard deviation of dₖ (n − 1; for n ≥ 2), rms of the Independent sigmas)
 * σIE = sqrt(s² / n + (σpos / R)² + SUN_ALTITUDE_SIGMA²)
 * ```
 *
 * Refusals, after the parameters: no sight (`insufficient_samples`); more than `maxSights`
 * (`sights_full`); a sight whose raw altitude is outside the limits (`sun_too_low`,
 * `sun_too_high`); `|IE|` above `maxIndexErrorRad` (`index_error_implausible`). The place is an
 * argument and is not in the result.
 */
export function indexErrorFromSights(
  calibrationSights: readonly Sight[],
  knownPlace: PositionFix,
  simulated: boolean,
  params: NoniusParameters,
): NoniusResult<IndexError> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const n = calibrationSights.length;
  if (n === 0) return err('insufficient_samples');
  if (n > params.maxSights) return err('sights_full');
  if (!Number.isFinite(knownPlace.sigmaM) || knownPlace.sigmaM < 0) {
    return err('invalid_number', { field: 'sigmaM' });
  }
  const differences: number[] = [];
  let sumSquaredSigmas = 0;
  let lastUtcMs = -Infinity;
  for (const sight of calibrationSights) {
    const bad = checkSight(sight);
    if (bad !== null) return bad;
    if (sight.rawApparentAltitudeRad < params.minSightAltitudeRad) {
      return err('sun_too_low', { id: sight.id });
    }
    if (sight.rawApparentAltitudeRad > params.maxSightAltitudeRad) {
      return err('sun_too_high', { id: sight.id });
    }
    const sun = sunAt(knownPlace.position, sight.timeUtcMs, params);
    if (!sun.ok) return { ...sun, id: sight.id };
    differences.push(sight.rawApparentAltitudeRad - sun.value.apparentAltitudeRad);
    const sigma = independentSigmaRad(
      sight.sampleStdDevRad,
      sight.markSigmaRad,
      sight.rawApparentAltitudeRad,
      params,
    );
    if (!sigma.ok) return { ...sigma, id: sight.id };
    sumSquaredSigmas += sigma.value * sigma.value;
    lastUtcMs = Math.max(lastUtcMs, sight.timeUtcMs);
  }
  const valueRad = differences.reduce((a, d) => a + d, 0) / n;
  let sampleStdDevRad = 0;
  if (n >= 2) {
    const squares = differences.reduce((a, d) => a + (d - valueRad) ** 2, 0);
    sampleStdDevRad = Math.sqrt(squares / (n - 1));
  }
  const s = Math.max(sampleStdDevRad, Math.sqrt(sumSquaredSigmas / n));
  const sigmaRad = Math.sqrt(
    (s * s) / n + (knownPlace.sigmaM / EARTH_RADIUS_M) ** 2 + params.sunAltitudeSigmaRad ** 2,
  );
  if (!Number.isFinite(valueRad) || !Number.isFinite(sigmaRad)) {
    return err('invalid_number', { field: 'valueRad' });
  }
  if (Math.abs(valueRad) > params.maxIndexErrorRad) return err('index_error_implausible');
  return ok({ valueRad, sigmaRad, sightCount: n, measuredUtcMs: lastUtcMs, simulated });
}
