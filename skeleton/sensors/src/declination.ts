// Declination (Req 6, design §3, §7.7, D11): converting magnetic azimuths to true ones, and the
// World Magnetic Model declination with its 1-sigma.

import { degToRad, isSupportedPosition, radToDeg, wrapTwoPi, type Position } from '@alidade/core';
import { checkSigma } from './parameters';
import { err, ok, type SensorResult } from './sensor-result';
import { decimalYearFromUtcMs, wmmField } from './wmm';

/** The angle from true north to magnetic north, positive east, with its 1-sigma. */
export interface Declination {
  /** |·| ≤ π/2. */
  readonly declinationRad: number;
  /** Not negative. From `declinationAt`, the WMM error model (Req 6.6). */
  readonly sigmaRad: number;
}

/** The constant term of the WMM declination error model, in degrees (Req 6.6). */
export const WMM_DECLINATION_SIGMA_FLOOR_DEG = 0.26;
/** The field term of the WMM declination error model, in degrees times nanotesla (Req 6.6). */
export const WMM_DECLINATION_SIGMA_FIELD_DEG_NT = 5417;
/** Below this horizontal intensity the WMM declination is not used (the blackout zone, Req 6.8). */
export const WMM_BLACKOUT_LIMIT_NT = 2000;

/**
 * The 1-sigma of a WMM declination, `sqrt(0.26² + (5417 / H)²)` degrees, in radians (Req 6.6).
 * Internal: called only with `H` at or above the blackout limit.
 */
export function wmmDeclinationSigmaRad(horizontalIntensityNt: number): number {
  return (
    Math.hypot(
      WMM_DECLINATION_SIGMA_FLOOR_DEG,
      WMM_DECLINATION_SIGMA_FIELD_DEG_NT / horizontalIntensityNt,
    ) *
    (Math.PI / 180)
  );
}

/** Checks a Declination: finite, |declination| ≤ π/2, 1-sigma finite and not negative (Req 6.5). */
export function checkDeclination(declination: Declination): SensorResult<Declination> {
  const value = declination.declinationRad;
  if (!Number.isFinite(value) || Math.abs(value) > Math.PI / 2) {
    return err('invalid_number', { field: 'declinationRad' });
  }
  const sigma = checkSigma(declination.sigmaRad, 'declinationSigmaRad');
  if (!sigma.ok) return sigma;
  return ok(declination);
}

/**
 * A true azimuth from a magnetic one: `wrapTwoPi(magnetic + declination)` (Req 6.1). Without a
 * Declination it fails with `declination_unknown`; it never assumes zero (Req 6.4).
 */
export function trueAzimuthFromMagnetic(
  magneticAzimuthRad: number,
  declination: Declination | undefined,
): SensorResult<number> {
  if (!Number.isFinite(magneticAzimuthRad))
    return err('invalid_number', { field: 'magneticAzimuthRad' });
  if (declination === undefined) return err('declination_unknown');
  const checked = checkDeclination(declination);
  if (!checked.ok) return checked;
  return wrapTwoPi(magneticAzimuthRad + declination.declinationRad);
}

/**
 * The WMM2025 Declination at a Position and time, at a height of 0 above the ellipsoid, with the
 * 1-sigma of the WMM error model computed from the model's own horizontal intensity (Req 6.6).
 *
 * Fails with `invalid_number` for a non-finite time, `unsupported_position` for a position that is
 * not Supported (Req 6.9), and `declination_unknown` outside WMM2025's validity dates (Req 6.7) or
 * in the blackout zone, where the horizontal intensity is below 2000 nT (Req 6.8).
 */
export function declinationAt(position: Position, timeUtcMs: number): SensorResult<Declination> {
  if (!Number.isFinite(timeUtcMs)) return err('invalid_number', { field: 'timeUtcMs' });
  if (!isSupportedPosition(position)) return err('unsupported_position');
  const decimalYear = decimalYearFromUtcMs(timeUtcMs);
  if (!decimalYear.ok) return decimalYear;
  const latitudeDeg = radToDeg(position.latRad);
  const longitudeDeg = radToDeg(position.lonRad);
  if (!latitudeDeg.ok) return latitudeDeg;
  if (!longitudeDeg.ok) return longitudeDeg;
  const field = wmmField(decimalYear.value, latitudeDeg.value, longitudeDeg.value, 0);
  if (!field.ok) return field;
  if (!(field.value.horizontalIntensityNt >= WMM_BLACKOUT_LIMIT_NT))
    return err('declination_unknown');
  const declinationRad = degToRad(field.value.declinationDeg);
  if (!declinationRad.ok) return err('declination_unknown');
  return ok({
    declinationRad: declinationRad.value,
    sigmaRad: wmmDeclinationSigmaRad(field.value.horizontalIntensityNt),
  });
}
