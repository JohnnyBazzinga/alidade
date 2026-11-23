// The formatter of the words (Req 6.2, 6.4, 14.1, 16.4, design D9, §7.8): every length, position
// and direction that reaches a sentence goes through here, so that no number is written without
// its rounding rule. A length that is an uncertainty is rounded UP; a distance to the nearest
// step. This file is an I/O boundary: degrees are its output.

import { greatCircleDistanceM, isSupportedPosition, wrapTwoPi, type Position } from '@alidade/core';
import { formatAzimuthDeg, formatSignedDeg } from '@alidade/ui';
import { err, ok, type VigiaResult } from '../../result';
import { fromDeg, toDeg } from '../degrees';

/**
 * Metres in one degree of latitude on Core's sphere: Core's great-circle distance of one degree,
 * computed once at load. For these two Supported positions it cannot fail; a failure would be a
 * programmer error.
 */
export const METRES_PER_DEGREE: number = (() => {
  const oneDegree = fromDeg(1);
  if (!oneDegree.ok) throw new Error('fromDeg(1) failed');
  const distance = greatCircleDistanceM(
    { latRad: 0, lonRad: 0 },
    { latRad: oneDegree.value, lonRad: 0 },
  );
  if (!distance.ok) throw new Error('greatCircleDistanceM of one degree failed');
  return distance.value;
})();

/** The longest length the words write as a number: above it they say "over 1000 km". */
const LONGEST_WRITTEN_M = 1_000_000;
const OVER_TEXT = 'over 1000 km';
const MOST_DECIMALS = 4;

function kilometres(valueM: number): string {
  return `${(valueM / 1000).toFixed(1)} km`;
}

/**
 * A length that is an uncertainty, rounded up: to 10 m below 1 000 m, to 0.1 km from 1 000 m;
 * `over 1000 km` above 1 000 km. Fails with `invalid_number` (`field: 'lengthM'`) unless the
 * length is finite and above 0.
 */
export function lengthText95(lengthM: number): VigiaResult<string> {
  if (!(Number.isFinite(lengthM) && lengthM > 0))
    return err('invalid_number', { field: 'lengthM' });
  if (lengthM > LONGEST_WRITTEN_M) return ok(OVER_TEXT);
  // At least the least step: a positive length whose tenth underflows to 0 is still 10 m.
  const valueM =
    lengthM < 1000 ? Math.max(10, Math.ceil(lengthM / 10) * 10) : Math.ceil(lengthM / 100) * 100;
  return ok(valueM < 1000 ? `${valueM} m` : kilometres(valueM));
}

/**
 * A distance, to the nearest 10 m below 1 000 m and the nearest 0.1 km from 1 000 m;
 * `over 1000 km` above 1 000 km. Fails with `invalid_number` (`field: 'lengthM'`) unless the
 * distance is finite and not below 0.
 */
export function lengthTextNearest(lengthM: number): VigiaResult<string> {
  if (!(Number.isFinite(lengthM) && lengthM >= 0))
    return err('invalid_number', { field: 'lengthM' });
  if (lengthM > LONGEST_WRITTEN_M) return ok(OVER_TEXT);
  if (lengthM < 1000) {
    const valueM = Math.round(lengthM / 10) * 10;
    return ok(valueM < 1000 ? `${valueM} m` : kilometres(valueM));
  }
  return ok(kilometres(Math.round(lengthM / 100) * 100));
}

/** The step of `decimals` decimal places of a degree, in metres of latitude. */
function stepM(decimals: number): number {
  return METRES_PER_DEGREE * 10 ** -decimals;
}

/**
 * The decimals of a printed position: the smallest `d` in 0 to 4 whose step is no coarser than
 * the 95 % semi-minor axis, or 4 when none is (or the axis is not a positive finite number).
 */
export function positionDecimals(semiMinor95M: number): number {
  if (!(Number.isFinite(semiMinor95M) && semiMinor95M > 0)) return MOST_DECIMALS;
  for (let d = 0; d < MOST_DECIMALS; d += 1) {
    if (stepM(d) <= semiMinor95M) return d;
  }
  return MOST_DECIMALS;
}

export interface PositionText {
  readonly text: string;
  readonly decimals: number;
  /** The farthest the printed point can lie from the position, in metres. */
  readonly printBoundM: number;
}

/** An angle as unsigned degrees with its letter: the letter follows the sign of what is printed. */
function hemisphere(
  angleRad: number,
  decimals: number,
  positive: string,
  negative: string,
): string {
  const signed = formatSignedDeg(angleRad, decimals);
  return signed.startsWith('-') ? `${signed.slice(1)}° ${negative}` : `${signed}° ${positive}`;
}

/**
 * `30.123° N, 40.057° W`, with the decimals of `positionDecimals(semiMinor95M)`; zero is N and E,
 * and a minus sign is never written. Also the printing bound: half a step of latitude and half a
 * step of longitude at this latitude, together. Fails with `unsupported_position` for a position
 * that is not Supported.
 */
export function positionText(position: Position, semiMinor95M: number): VigiaResult<PositionText> {
  if (!isSupportedPosition(position)) return err('unsupported_position');
  const decimals = positionDecimals(semiMinor95M);
  const half = 0.5 * stepM(decimals);
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

/** The word of `azimuthDeg`, an angle in `[0, 360)`. */
function wordOfDegrees(azimuthDeg: number): string {
  const sector = Math.floor(((((azimuthDeg + 22.5) % 360) + 360) % 360) / 45);
  return COMPASS_WORDS[sector] ?? 'north';
}

/** One of eight words for an azimuth: the 45° sector centred on it. Fails for an angle that is not finite. */
export function compassWord8(azimuthRad: number): VigiaResult<string> {
  const wrapped = wrapTwoPi(azimuthRad);
  if (!wrapped.ok) return err('invalid_number', { field: 'azimuthRad' });
  const azimuthDeg = toDeg(wrapped.value);
  if (!azimuthDeg.ok) return err('invalid_number', { field: 'azimuthRad' });
  return ok(wordOfDegrees(azimuthDeg.value));
}

const AXIS_WORDS = [
  'north to south',
  'north-east to south-west',
  'east to west',
  'south-east to north-west',
] as const;

/**
 * A line (the long axis of an ellipse) in words. A line has no direction, so its azimuth is
 * reduced to `[0°, 180°)` and rounded to a whole degree, and it is named as one of four axes by
 * the sector of 45° centred on it: `north to south`, `north-east to south-west`, `east to west`,
 * `south-east to north-west`. The same axis always reads the same way (176°, 180° and 4° are
 * all `north to south`), and the words follow the angle that is printed. Fails for an angle that
 * is not finite.
 */
export function axisWords(azimuthRad: number): VigiaResult<string> {
  const wrapped = wrapTwoPi(azimuthRad);
  if (!wrapped.ok) return err('invalid_number', { field: 'azimuthRad' });
  const azimuthDeg = toDeg(wrapped.value);
  if (!azimuthDeg.ok) return err('invalid_number', { field: 'azimuthRad' });
  const roundedDeg = Math.round(azimuthDeg.value) % 180;
  const sector = Math.floor(((roundedDeg + 22.5) % 180) / 45);
  return ok(`${AXIS_WORDS[sector] ?? AXIS_WORDS[0]} (${roundedDeg}°)`);
}

/** Tenths of a degree, rounded up; the float noise of a whole tenth (`2.0000000000000004`) is not a tenth more. */
const TENTH_SLACK = 1e-9;

/**
 * A Bearing's direction with its 1-sigma (Req 3.6, 9.4): `45.5° ± 2.0°`, the azimuth to the
 * nearest 0.1° by UI's `formatAzimuthDeg` and the sigma rounded **up** to 0.1°, so that the text
 * never claims more than the Bearing had. Fails with `invalid_number` naming `azimuthRad` for an
 * angle that is not finite and `sigmaRad` for a sigma that is not in `(0, π]`.
 */
export function directionText(azimuthRad: number, sigmaRad: number): VigiaResult<string> {
  if (!Number.isFinite(azimuthRad)) return err('invalid_number', { field: 'azimuthRad' });
  // A sigma above half a turn says nothing about a direction (and would print in exponent form).
  if (!(Number.isFinite(sigmaRad) && sigmaRad > 0 && sigmaRad <= Math.PI)) {
    return err('invalid_number', { field: 'sigmaRad' });
  }
  const sigma = sigmaDegUp(sigmaRad);
  if (!sigma.ok) return sigma;
  return ok(`${formatAzimuthDeg(azimuthRad, 1)}° ± ${sigma.value}°`);
}

/**
 * The one rule for a sigma (Req 3.6, 22.9): degrees to 0.1°, rounded **up** (at least `0.1`), as a
 * number's text without its unit: `2.1` for `2.04°`, never the nearest tenth. Fails with
 * `invalid_number` naming `sigmaRad` for a sigma that is not in `(0, π]`.
 */
export function sigmaDegUp(sigmaRad: number): VigiaResult<string> {
  if (!(Number.isFinite(sigmaRad) && sigmaRad > 0 && sigmaRad <= Math.PI)) {
    return err('invalid_number', { field: 'sigmaRad' });
  }
  const sigmaDeg = toDeg(sigmaRad);
  if (!sigmaDeg.ok || !Number.isFinite(sigmaDeg.value)) {
    return err('invalid_number', { field: 'sigmaRad' });
  }
  const tenths = Math.max(1, Math.ceil(sigmaDeg.value * 10 - TENTH_SLACK));
  return ok((tenths / 10).toFixed(1));
}

/** A sigma for a headline (UI's `sigmaText`, skeleton-ui Req 22.12): `±2.1°`, by the one rule. */
export function sigmaHeadlineText(sigmaRad: number): string {
  const sigma = sigmaDegUp(sigmaRad);
  return sigma.ok ? `±${sigma.value}°` : '±?°';
}

/**
 * `Sighting saved: 45.5° ± 2.0° (true)` (Req 4.11): the Bearing's direction with its sigma rounded
 * up, and the word for its North reference, which a Bearing always has as true.
 */
export function savedLineText(azimuthRad: number, sigmaRad: number): VigiaResult<string> {
  const direction = directionText(azimuthRad, sigmaRad);
  if (!direction.ok) return direction;
  return ok(`Sighting saved: ${direction.value} (true)`);
}

/**
 * A position accuracy (Req 3.6, 9.4), rounded up: whole metres below 1 000 m (at least `1 m`),
 * then as `lengthText95`. Fails with `invalid_number` naming `accuracyM` for an accuracy that is
 * not finite or below 0.
 */
export function accuracyText(accuracyM: number): VigiaResult<string> {
  if (!(Number.isFinite(accuracyM) && accuracyM >= 0)) {
    return err('invalid_number', { field: 'accuracyM' });
  }
  const wholeM = Math.ceil(accuracyM);
  if (wholeM < 1000) return ok(`${Math.max(1, wholeM)} m`);
  return lengthText95(accuracyM);
}
