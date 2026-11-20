// Sights made ready for a Fix (design D5, §5, §6.3): the Index error applied, the refraction taken
// off, both sigmas and the Subsolar point computed, and a Sight outside the limits set aside.
// Done each time a Fix is computed, so that measuring or removing the Index error changes every
// Fix at once and no Sight carries a stale calibration.

import type { Position } from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import { refractionRad } from '../sun/refraction';
import { subsolarPoint } from '../sun/sun-wrapper';
import type { CalibrationInUse } from './index-error';
import { checkSight, independentSigmaRad, type Sight } from './sight';

/** The corrected altitude of a Sight: the raw altitude less the Index error of the calibration. */
function correctedAltitudeRad(sight: Sight, calibration: CalibrationInUse): number {
  return calibration.kind === 'index_error'
    ? sight.rawApparentAltitudeRad - calibration.indexError.valueRad
    : sight.rawApparentAltitudeRad;
}

export interface PreparedSight {
  readonly sight: Sight;
  /** Raw less the Index error (or raw). */
  readonly correctedApparentAltitudeRad: number;
  /** The corrected altitude less its refraction. */
  readonly observedGeometricAltitudeRad: number;
  /** `hypot(sd, ε, AIM, 0.1 · R)`: the part of the error that is new at each sight. */
  readonly independentSigmaRad: number;
  /** The part every sight of the set shares: the Index error's sigma, or the uncalibrated one. */
  readonly commonSigmaRad: number;
  readonly subsolar: Position;
  readonly sunDeclinationRad: number;
}

export interface SetAside {
  readonly sight: Sight;
  readonly cause: 'outlier' | 'sun_too_low' | 'sun_too_high';
}

export interface Prepared {
  readonly prepared: readonly PreparedSight[];
  readonly setAside: readonly SetAside[];
}

/**
 * Prepares the Sights in their order. A Sight whose corrected altitude is below the minimum or
 * above the maximum is set aside with its cause and not deleted. Fails with the failure of the
 * Sun wrapper (naming the Sight's id) for a time it refuses, and with `invalid_number` for a
 * Sight whose numbers cannot be used.
 */
export function prepareSights(
  sights: readonly Sight[],
  calibration: CalibrationInUse,
  params: NoniusParameters,
): NoniusResult<Prepared> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const prepared: PreparedSight[] = [];
  const setAside: SetAside[] = [];
  const commonSigmaRad =
    calibration.kind === 'index_error' ? calibration.indexError.sigmaRad : calibration.sigmaRad;
  if (!Number.isFinite(commonSigmaRad) || commonSigmaRad < 0) {
    return err('invalid_number', { field: 'commonSigmaRad' });
  }
  for (const sight of sights) {
    const bad = checkSight(sight);
    if (bad !== null) return bad;
    const correctedApparentAltitudeRad = correctedAltitudeRad(sight, calibration);
    if (!Number.isFinite(correctedApparentAltitudeRad)) {
      return err('invalid_number', { id: sight.id, field: 'indexErrorValueRad' });
    }
    if (correctedApparentAltitudeRad < params.minSightAltitudeRad) {
      setAside.push({ sight, cause: 'sun_too_low' });
      continue;
    }
    if (correctedApparentAltitudeRad > params.maxSightAltitudeRad) {
      setAside.push({ sight, cause: 'sun_too_high' });
      continue;
    }
    const refraction = refractionRad(correctedApparentAltitudeRad);
    if (!refraction.ok) return { ...refraction, id: sight.id };
    const sigma = independentSigmaRad(
      sight.sampleStdDevRad,
      sight.markSigmaRad,
      correctedApparentAltitudeRad,
      params,
    );
    if (!sigma.ok) return { ...sigma, id: sight.id };
    const subsolar = subsolarPoint(sight.timeUtcMs, params);
    if (!subsolar.ok) return { ...subsolar, id: sight.id };
    prepared.push({
      sight,
      correctedApparentAltitudeRad,
      observedGeometricAltitudeRad: correctedApparentAltitudeRad - refraction.value,
      independentSigmaRad: sigma.value,
      commonSigmaRad,
      subsolar: subsolar.value,
      sunDeclinationRad: subsolar.value.latRad,
    });
  }
  return ok({ prepared, setAside });
}
