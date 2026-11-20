// A Sun sight as Nonius holds it (Req 4.5, design §5, §6.3, D5): raw, with the Index error and the
// refraction applied only when a Fix is computed (`prepare.ts`).

import type { CapturedResult } from '@alidade/ui';
import { err, ok, type NoniusFailure, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import { refractionRad } from '../sun/refraction';
import type { CalibrationInUse } from './index-error';

/** The Camera azimuth at a sight and its North reference (Req 4.6); never given to the solver. */
export interface SunSide {
  readonly azimuthRad: number;
  readonly northReference: 'magnetic' | 'true';
}

export interface Sight {
  /** `sight-<frozenAtUtcMs>`, with `-2`, `-3` … if that is taken. */
  readonly id: string;
  /** The middle of the Frozen window (Req 4.5). */
  readonly timeUtcMs: number;
  /** Sensors' mean altitude with the calibration `{ 0, 0 }`: no Index error applied. */
  readonly rawApparentAltitudeRad: number;
  readonly sampleStdDevRad: number;
  /** UI's Mark term ε of the capture; 0 without a Mark. */
  readonly markSigmaRad: number;
  readonly sunSide: SunSide | null;
  readonly simulated: boolean;
}

/**
 * Whether a Sight's numbers can be used: an id that is not empty, a finite time, altitude, sample
 * standard deviation and Mark term (the last two not negative), and a finite Sun side azimuth.
 * Returns `invalid_observation` naming the Sight's id and the first bad field, or `null`.
 */
export function checkSight(sight: Sight): NoniusFailure | null {
  const bad = (field: string) => err('invalid_observation', { id: String(sight.id), field });
  if (typeof sight.id !== 'string' || sight.id === '') return bad('id');
  if (!Number.isFinite(sight.timeUtcMs)) return bad('timeUtcMs');
  if (!Number.isFinite(sight.rawApparentAltitudeRad)) return bad('rawApparentAltitudeRad');
  if (!Number.isFinite(sight.sampleStdDevRad) || sight.sampleStdDevRad < 0) {
    return bad('sampleStdDevRad');
  }
  if (!Number.isFinite(sight.markSigmaRad) || sight.markSigmaRad < 0) return bad('markSigmaRad');
  if (sight.sunSide !== null && !Number.isFinite(sight.sunSide.azimuthRad)) return bad('sunSide');
  return null;
}

/**
 * The Independent sigma of a sight (Req 4.5): `hypot(sample sd, ε, AIM_SIGMA_RAD, refraction
 * sigma)`, the refraction sigma being `REFRACTION_SIGMA_FRACTION · R` at the given apparent
 * altitude. Fails with `invalid_number` when the altitude is outside the refraction's domain or a
 * term is not finite or negative.
 */
export function independentSigmaRad(
  sampleStdDevRad: number,
  markSigmaRad: number,
  apparentAltitudeRad: number,
  params: NoniusParameters,
): NoniusResult<number> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!Number.isFinite(sampleStdDevRad) || sampleStdDevRad < 0) {
    return err('invalid_number', { field: 'sampleStdDevRad' });
  }
  if (!Number.isFinite(markSigmaRad) || markSigmaRad < 0) {
    return err('invalid_number', { field: 'markSigmaRad' });
  }
  const refraction = refractionRad(apparentAltitudeRad);
  if (!refraction.ok) return refraction;
  const sigmaRad = Math.hypot(
    sampleStdDevRad,
    markSigmaRad,
    params.aimSigmaRad,
    params.refractionSigmaFraction * refraction.value,
  );
  return Number.isFinite(sigmaRad) ? ok(sigmaRad) : err('invalid_number', { field: 'sigmaRad' });
}

/** The first of `base`, `base-2`, `base-3` … not in `existingIds`. */
function uniqueId(base: string, existingIds: readonly string[]): string {
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * A Sight from an altitude capture (Req 4.5, 4.8). The refusals, in this order: bad parameters;
 * a capture that is not an altitude, or whose numbers are not finite (`invalid_observation`); a
 * full set (`sights_full`); a time outside the Sun wrapper's range (`sight_time_unsupported`); a
 * corrected altitude outside the limits (`sun_too_low`, `sun_too_high`), the corrected altitude
 * being the raw one less the Index error of `calibration`, the one in use at the capture.
 */
export function sightFromCapture(
  captured: CapturedResult,
  sunSide: SunSide | null,
  existingIds: readonly string[],
  calibration: CalibrationInUse,
  simulated: boolean,
  params: NoniusParameters,
): NoniusResult<Sight> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (captured.kind !== 'altitude') return err('invalid_observation', { field: 'kind' });
  const rawApparentAltitudeRad = captured.altitude.apparentAltitudeRad;
  const sampleStdDevRad = captured.altitude.sampleStdDevRad;
  const markSigmaRad = captured.markSigmaRad ?? 0;
  const { endUtcMs, windowLengthMs } = captured.window;
  const numbers: readonly [string, number][] = [
    ['apparentAltitudeRad', rawApparentAltitudeRad],
    ['sampleStdDevRad', sampleStdDevRad],
    ['markSigmaRad', markSigmaRad],
    ['endUtcMs', endUtcMs],
    ['windowLengthMs', windowLengthMs],
  ];
  for (const [field, number] of numbers) {
    if (!Number.isFinite(number)) return err('invalid_observation', { field });
  }
  if (existingIds.length >= params.maxSights) return err('sights_full');
  const timeUtcMs = endUtcMs - windowLengthMs / 2;
  if (
    !Number.isFinite(timeUtcMs) ||
    timeUtcMs < params.sunModelStartUtcMs ||
    timeUtcMs >= params.sunModelEndUtcMs
  ) {
    return err('sight_time_unsupported', { field: 'timeUtcMs' });
  }
  const correctedRad =
    rawApparentAltitudeRad -
    (calibration.kind === 'index_error' ? calibration.indexError.valueRad : 0);
  if (correctedRad < params.minSightAltitudeRad) return err('sun_too_low');
  if (correctedRad > params.maxSightAltitudeRad) return err('sun_too_high');
  return ok({
    id: uniqueId(`sight-${endUtcMs}`, existingIds),
    timeUtcMs,
    rawApparentAltitudeRad,
    sampleStdDevRad,
    markSigmaRad,
    sunSide,
    simulated,
  });
}
