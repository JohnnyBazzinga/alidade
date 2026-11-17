// The World Magnetic Model, through `magvar` 2.2.0 (design §3, D12). This is the only module that
// imports `magvar`, and it calls only `calculateMagneticField`, always with an explicit decimal
// year inside WMM2025's validity, so that the package's clock-reading entry points and its console
// warning are never reached.

import { calculateMagneticField } from 'magvar';
import { err, ok, type SensorResult } from './sensor-result';

/** The calendar years WMM2025 covers: from 2025-01-01T00:00:00Z up to, not including, 2030. */
const FIRST_YEAR = 2025;
const LAST_YEAR = 2029;

/** The first instant of WMM2025's validity, milliseconds since the epoch, UTC. */
export const WMM_VALID_FROM_UTC_MS = Date.UTC(FIRST_YEAR, 0, 1);
/** The first instant after WMM2025's validity. */
export const WMM_VALID_UNTIL_UTC_MS = Date.UTC(LAST_YEAR + 1, 0, 1);

/**
 * The decimal year of an instant: `y + (t − start of y) / (length of y)`, with `y` the calendar
 * year (UTC) that contains `t` (D12). Fails with `declination_unknown` outside WMM2025's validity
 * and `invalid_number` for a non-finite time. `Date.UTC` is a pure function of its arguments; no
 * `Date` object is built and no clock is read.
 */
export function decimalYearFromUtcMs(timeUtcMs: number): SensorResult<number> {
  if (!Number.isFinite(timeUtcMs)) return err('invalid_number', { field: 'timeUtcMs' });
  for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
    const startUtcMs = Date.UTC(year, 0, 1);
    const endUtcMs = Date.UTC(year + 1, 0, 1);
    if (timeUtcMs >= startUtcMs && timeUtcMs < endUtcMs) {
      return ok(year + (timeUtcMs - startUtcMs) / (endUtcMs - startUtcMs));
    }
  }
  return err('declination_unknown');
}

export interface WmmField {
  readonly declinationDeg: number;
  readonly horizontalIntensityNt: number;
}

/**
 * The WMM2025 declination and horizontal intensity. Internal. The caller passes a decimal year in
 * [2025, 2030) and finite coordinates in degrees; a non-finite result (which the checked domain
 * cannot produce) gives `declination_unknown`, so the function stays total.
 */
export function wmmField(
  decimalYear: number,
  latitudeDeg: number,
  longitudeDeg: number,
  heightKm: number,
): SensorResult<WmmField> {
  if (!(decimalYear >= FIRST_YEAR && decimalYear < LAST_YEAR + 1))
    return err('declination_unknown');
  if (
    !Number.isFinite(latitudeDeg) ||
    !Number.isFinite(longitudeDeg) ||
    !Number.isFinite(heightKm)
  ) {
    return err('invalid_number');
  }
  const field = calculateMagneticField(decimalYear, latitudeDeg, longitudeDeg, heightKm);
  if (!Number.isFinite(field.declination) || !Number.isFinite(field.h))
    return err('declination_unknown');
  return ok({ declinationDeg: field.declination, horizontalIntensityNt: field.h });
}
