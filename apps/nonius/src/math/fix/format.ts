// The formatter of the words (Req 9.1, 9.3, 11.3; design D14, §8.2): every length, position and
// calibration that reaches a sentence goes through here. A length that is an uncertainty is
// rounded UP, a distance to the nearest step. This file is an I/O boundary: degrees are its output.

import { isSupportedPosition, wrapTwoPi, type Position } from '@alidade/core';
import { formatSignedDeg } from '@alidade/ui';
import { err, ok, type NoniusResult } from '../../result';
import { ageText, utcDateText } from '../civil-time';
import { DEG_TO_RAD, toDeg } from '../degrees';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { CalibrationInUse } from '../sight/index-error';
import { EARTH_RADIUS_M } from '../sphere/earth';

/** Metres in one degree of latitude on the sphere of `math-conventions.md`. */
export const METRES_PER_DEGREE: number = EARTH_RADIUS_M * DEG_TO_RAD;

const METRES_PER_NAUTICAL_MILE = 1852;
/** The length (km) from which the step of a rounded length is 100 instead of 10. */
const COARSE_FROM_KM = 1000;
const MOST_DECIMALS = 4;
/** A tenth of a degree rounded up; the float noise of a whole tenth is not a tenth more. */
const TENTH_SLACK = 1e-9;

function positiveLength(lengthM: number): NoniusResult<number> {
  return Number.isFinite(lengthM) && lengthM > 0
    ? ok(lengthM)
    : err('invalid_number', { field: 'lengthM' });
}

/** The step, in kilometres or nautical miles, of the rounding of a length: 10, or 100 from 1 000 km. */
const stepOf = (lengthM: number): number => (lengthM / 1000 < COARSE_FROM_KM ? 10 : 100);

function roundedUp(lengthM: number, unitM: number): number {
  const step = stepOf(lengthM);
  return Math.max(step, Math.ceil(lengthM / unitM / step) * step);
}

function roundedNearest(lengthM: number, unitM: number): number {
  const step = stepOf(lengthM);
  return Math.round(lengthM / unitM / step) * step;
}

/** A length that is an uncertainty, in kilometres, rounded up to 10 km (to 100 km from 1 000 km). */
export function lengthText95(lengthM: number): NoniusResult<string> {
  const checked = positiveLength(lengthM);
  if (!checked.ok) return checked;
  return ok(`${roundedUp(lengthM, 1000)} km`);
}

/** The same length in nautical miles, rounded up with the same step. */
export function nauticalText(lengthM: number): NoniusResult<string> {
  const checked = positiveLength(lengthM);
  if (!checked.ok) return checked;
  return ok(`${roundedUp(lengthM, METRES_PER_NAUTICAL_MILE)} nautical miles`);
}

/** A distance to the nearest step, in kilometres and nautical miles (Req 11.3). */
export function distanceText(lengthM: number): NoniusResult<string> {
  if (!(Number.isFinite(lengthM) && lengthM >= 0))
    return err('invalid_number', { field: 'lengthM' });
  return ok(
    `${roundedNearest(lengthM, 1000)} km (${roundedNearest(lengthM, METRES_PER_NAUTICAL_MILE)} nautical miles)`,
  );
}

/**
 * The decimals of a printed position: the smallest `d` in 0 to 4 whose step is no coarser than
 * the 95 % semi-minor axis, or 4 when none is (or the axis is not a positive finite number).
 */
export function positionDecimals(semiMinor95M: number): number {
  if (!(Number.isFinite(semiMinor95M) && semiMinor95M > 0)) return MOST_DECIMALS;
  for (let d = 0; d < MOST_DECIMALS; d += 1) {
    if (METRES_PER_DEGREE / 10 ** d <= semiMinor95M) return d;
  }
  return MOST_DECIMALS;
}

export interface PositionText {
  readonly text: string;
  readonly decimals: number;
  /** The farthest the printed point can lie from the position, in metres. */
  readonly printBoundM: number;
}

function hemisphere(
  angleRad: number,
  decimals: number,
  positive: string,
  negative: string,
): string {
  const signed = formatSignedDeg(angleRad, decimals);
  return signed.startsWith('-') ? `${signed.slice(1)}° ${negative}` : `${signed}° ${positive}`;
}

/** `30.1° N, 40.1° W` with the decimals of `positionDecimals`; zero is N and E; no minus sign. */
export function positionText(position: Position, semiMinor95M: number): NoniusResult<PositionText> {
  if (!isSupportedPosition(position)) return err('unsupported_position');
  const decimals = positionDecimals(semiMinor95M);
  const half = (0.5 * METRES_PER_DEGREE) / 10 ** decimals;
  return ok({
    text: `${hemisphere(position.latRad, decimals, 'N', 'S')}, ${hemisphere(position.lonRad, decimals, 'E', 'W')}`,
    decimals,
    printBoundM: Math.hypot(half, half * Math.cos(position.latRad)),
  });
}

const COMPASS_WORDS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

function degreesOf(azimuthRad: number): NoniusResult<number> {
  const wrapped = wrapTwoPi(azimuthRad);
  if (!wrapped.ok) return err('invalid_number', { field: 'azimuthRad' });
  const deg = toDeg(wrapped.value);
  return deg.ok ? deg : err('invalid_number', { field: 'azimuthRad' });
}

/** One of eight words for an azimuth: the 45° sector centred on it. */
export function compassWord8(azimuthRad: number): NoniusResult<string> {
  const deg = degreesOf(azimuthRad);
  if (!deg.ok) return deg;
  const sector = Math.floor(((((deg.value + 22.5) % 360) + 360) % 360) / 45);
  return ok(COMPASS_WORDS[sector] ?? 'north');
}

const AXIS_WORDS = [
  'north to south',
  'north-east to south-west',
  'east to west',
  'south-east to north-west',
] as const;

/** A line (the long axis of an ellipse) in words and whole degrees, the same from either end. */
export function axisWords(azimuthRad: number): NoniusResult<string> {
  const deg = degreesOf(azimuthRad);
  if (!deg.ok) return deg;
  const roundedDeg = Math.round(deg.value) % 180;
  const sector = Math.floor(((roundedDeg + 22.5) % 180) / 45);
  return ok(`${AXIS_WORDS[sector] ?? AXIS_WORDS[0]} (${roundedDeg}°)`);
}

function tenthsText(tenths: number): string {
  const text = (Math.abs(tenths) / 10).toFixed(1);
  return tenths < 0 ? `\u2212${text}` : text;
}

/** The phone's altitude sigma in degrees, rounded up to 0.1°. */
export function sigmaDegText(sigmaRad: number): NoniusResult<string> {
  const deg = toDeg(sigmaRad);
  if (!deg.ok || sigmaRad < 0) return err('invalid_number', { field: 'sigmaRad' });
  return ok((Math.ceil(deg.value * 10 - TENTH_SLACK) / 10).toFixed(1));
}

/** The Calibration in use, as it is printed with every Fix (Req 9.3, 15.6). */
export function calibrationText(
  calibration: CalibrationInUse,
  nowUtcMs: number,
  params: NoniusParameters,
): NoniusResult<string> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
  const sigma = sigmaDegText(
    calibration.kind === 'index_error' ? calibration.indexError.sigmaRad : calibration.sigmaRad,
  );
  if (!sigma.ok) return sigma;
  if (calibration.kind === 'uncalibrated') {
    const groundKm = Math.round((EARTH_RADIUS_M * calibration.sigmaRad) / 10_000) * 10;
    return ok(
      `This phone's altitude was never calibrated. It may be off by ${sigma.value}°, about ${groundKm} km on the ground. Measure the index error at a place the phone knows to remove most of it.`,
    );
  }
  const { indexError } = calibration;
  const valueDeg = toDeg(indexError.valueRad);
  if (!valueDeg.ok) return err('invalid_number', { field: 'valueRad' });
  const ageMs = nowUtcMs - indexError.measuredUtcMs;
  const old =
    ageMs > params.indexErrorOldMs
      ? ` (${ageText(ageMs)}: an index error can change; measure it again)`
      : '';
  const simulated = indexError.simulated ? ' (simulated)' : '';
  return ok(
    `Index error ${tenthsText(Math.round(valueDeg.value * 10))}° ± ${sigma.value}°, measured ${utcDateText(indexError.measuredUtcMs)}${old}${simulated}.`,
  );
}
