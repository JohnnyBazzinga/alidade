// The sighting code (Req 8, design §8): one Sighting as 50 symbols of the 31-symbol alphabet.
//
// Shape: `V K P1 … P44 C1 … C4`. `V` is the version (`3`, the symbol of value 1, for version 1),
// `K` the kind (`2`, value 0, for `sighting`; the field exists so that a later version can add
// another), `P` the 44 digits of one integer in mixed radix, `C` the four check symbols of
// `gf31-check.ts`. The code carries the Incident id, the Sighting id, the observer's position,
// the position accuracy, the time, the azimuth and its 1-sigma: nothing else (Req 8.1).
//
// Precision (Req 8.4, design §8.1). The two uncertainties (the sigma and the position accuracy)
// are rounded UP and never down, in the decoder's own comparison. The three measurements
// (position, time, azimuth) are rounded to the centre of a cell: at most 0.79 m, 0.5 s and
// 0.0005 degrees from the original. Every phone uses the decoded values, the sender included (the
// canonical form, design D6), so the error is common to all and never makes two phones disagree.
// It is a difference between what the sensor read and what is used, and it is stated here.
//
// This file is a boundary where degrees are the wire's unit; the conversion itself is
// `math/degrees.ts`.

import { parseBearing, validateBearing, type BearingWire } from '@alidade/core';
import { err, ok, type VigiaResult } from '../../result';
import { fromDeg, toDeg } from '../degrees';
import { isIncidentId, isSightingId } from '../incident/ids';
import type { Sighting } from '../incident/sighting';
import { checkParameters, type VigiaParameters } from '../parameters';
import { ALPHABET, ALPHABET_SIZE, isAlphabetString, stripCode, symbolValue } from './alphabet';
import { checkSymbols } from './gf31-check';

/** The length of a code in symbols: 2 (version, kind) + 44 (payload) + 4 (check). */
export const CODE_LENGTH = 50;

const PAYLOAD_DIGITS = 44;
const CHECK_SYMBOLS = 4;
/** The symbol of version 1 and of the kind `sighting`: values 1 and 0 of the alphabet. */
export const VERSION_SYMBOL = '3';
const KIND_SYMBOL = '2';
/** The fewest symbols of a text that can hold a check and something to check. */
const MIN_SYMBOLS = 6;

// The ranges of design §8.1.
const EPOCH_UTC_MS = 1_767_225_600_000; // 2026-01-01T00:00:00Z
const SPAN_SECONDS = 631_152_000; // 20 years
const LAT_ORIGIN_DEG = -89;
const LON_ORIGIN_DEG = -180;
const CELL_DEG = 1e-5;
const AZIMUTH_CELL_DEG = 0.001;
const LAT_CELLS = 17_800_000;
const LON_CELLS = 36_000_000;
const AZIMUTH_CELLS = 360_000;
const SIGMA_STEPS = 4500; // 0.01° to 45° in steps of 0.01°
const MAX_ACCURACY_M = 10_000;

const INCIDENT_ID_LENGTH = 10;
const SIGHTING_ID_LENGTH = 9;
const BASE = BigInt(ALPHABET_SIZE);

const INCIDENT_ID_RADIX = BASE ** BigInt(INCIDENT_ID_LENGTH);
const SIGHTING_ID_RADIX = BASE ** BigInt(SIGHTING_ID_LENGTH);

/** The radices of the eight fields, in order (design §8.1). */
const RADICES: readonly bigint[] = [
  INCIDENT_ID_RADIX,
  SIGHTING_ID_RADIX,
  BigInt(LAT_CELLS),
  BigInt(LON_CELLS),
  BigInt(SPAN_SECONDS),
  BigInt(AZIMUTH_CELLS),
  BigInt(SIGMA_STEPS),
  BigInt(MAX_ACCURACY_M + 1),
];
/** The number of distinct payloads: a payload from this value up is not a code. */
const PAYLOAD_LIMIT: bigint = RADICES.reduce((product, radix) => product * radix, 1n);

/** `value` limited to the cells `0 … cells - 1`: the edge of the range belongs to its last cell. */
function cellOf(value: number, cells: number): number {
  return Math.min(Math.max(Math.floor(value), 0), cells - 1);
}

/** The id as a number in base 31, most significant symbol first. */
function idValue(id: string): bigint {
  let value = 0n;
  for (const symbol of id) value = value * BASE + BigInt(symbolValue(symbol) ?? 0);
  return value;
}

/** `value` as `length` symbols of the alphabet, most significant first. */
function idSymbols(value: bigint, length: number): string {
  let rest = value;
  let symbols = '';
  for (let i = 0; i < length; i += 1) {
    symbols = ALPHABET.charAt(Number(rest % BASE)) + symbols;
    rest /= BASE;
  }
  return symbols;
}

/**
 * The step `k` of the sigma, 1 to 4500: the smallest whose angle `k / 100` degrees is at least
 * `sigmaRad`, compared in radians by the same function the decoder's `parseBearing` calls, so
 * that the decoded sigma is never below the original in floating point (Req 8.4).
 */
function sigmaStep(sigmaRad: number, sigmaDeg: number): number {
  const angleOf = (step: number): number => {
    const angle = fromDeg(step / 100);
    return angle.ok ? angle.value : Number.POSITIVE_INFINITY;
  };
  let step = Math.min(Math.max(Math.ceil(sigmaDeg * 100 - 1e-9), 1), SIGMA_STEPS);
  while (step < SIGMA_STEPS && angleOf(step) < sigmaRad) step += 1;
  while (step > 1 && angleOf(step - 1) >= sigmaRad) step -= 1;
  return step;
}

/**
 * The code of a Sighting: its canonical text, 50 symbols. Fails with Core's failure for a Bearing
 * Core does not accept, with `invalid_number` naming `sightingId` (not equal to the Bearing's id,
 * or not 9 symbols) or `incidentId` (not 10 symbols), and with `invalid_observation` naming
 * `timeUtcMs` for a time outside the 20 years from 2026-01-01.
 */
export function encodeSighting(sighting: Sighting): VigiaResult<string> {
  const bearing = sighting.bearing;
  const valid = validateBearing(bearing);
  if (!valid.ok) return valid;
  if (sighting.sightingId !== bearing.id || !isSightingId(sighting.sightingId)) {
    return err('invalid_number', { field: 'sightingId' });
  }
  if (!isIncidentId(sighting.incidentId)) return err('invalid_number', { field: 'incidentId' });
  const timeOffsetMs = bearing.timeUtcMs - EPOCH_UTC_MS;
  if (!(timeOffsetMs >= 0 && timeOffsetMs < SPAN_SECONDS * 1000)) {
    return err('invalid_observation', { field: 'timeUtcMs', id: bearing.id });
  }
  const latDeg = toDeg(bearing.observer.latRad);
  const lonDeg = toDeg(bearing.observer.lonRad);
  const azimuthDeg = toDeg(bearing.azimuthRad);
  const sigmaDeg = toDeg(bearing.azimuthSigmaRad);
  if (!latDeg.ok) return latDeg;
  if (!lonDeg.ok) return lonDeg;
  if (!azimuthDeg.ok) return azimuthDeg;
  if (!sigmaDeg.ok) return sigmaDeg;

  const fields: readonly bigint[] = [
    idValue(sighting.incidentId),
    idValue(sighting.sightingId),
    BigInt(cellOf((latDeg.value - LAT_ORIGIN_DEG) / CELL_DEG, LAT_CELLS)),
    BigInt(cellOf((lonDeg.value - LON_ORIGIN_DEG) / CELL_DEG, LON_CELLS)),
    BigInt(cellOf(timeOffsetMs / 1000, SPAN_SECONDS)),
    BigInt(cellOf(azimuthDeg.value / AZIMUTH_CELL_DEG, AZIMUTH_CELLS)),
    BigInt(sigmaStep(bearing.azimuthSigmaRad, sigmaDeg.value) - 1),
    BigInt(Math.min(Math.ceil(bearing.positionAccuracyM) + 0, MAX_ACCURACY_M)),
  ];
  const payload = fields.reduce((n, field, i) => n * (RADICES[i] ?? 1n) + field, 0n);
  const frame = `${VERSION_SYMBOL}${KIND_SYMBOL}${idSymbols(payload, PAYLOAD_DIGITS)}`;
  const check = checkSymbols(frame);
  if (!check.ok) return check;
  return ok(frame + check.value);
}

/**
 * The Sighting of a code or of text that holds one (design §8.5), in this order: the parameters;
 * the text longer than `maxCodeLengthChars` is `code_too_long`, before anything else is read;
 * whitespace and hyphens are removed and nothing left is `code_not_a_sighting`; a character
 * outside the alphabet, and fewer than 6 symbols, are `code_damaged` (no case folding, no
 * look-alike mapping); the check value must match, else `code_damaged`, **before** the version is
 * read; a version or a kind other than 1 and `sighting` is `code_version_unsupported`; a length
 * other than 50 and a payload not below the product of the radices are `code_damaged`; and the
 * fields go through Core's `parseBearing`, whose failure is returned unchanged. The result has
 * `origin: 'received'` and `receivedUtcMs: null`: the caller stamps the time.
 */
export function decodeSighting(text: string, parameters: VigiaParameters): VigiaResult<Sighting> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (text.length > parameters.maxCodeLengthChars) return err('code_too_long');
  const symbols = stripCode(text);
  if (symbols.length === 0) return err('code_not_a_sighting');
  if (!isAlphabetString(symbols) || symbols.length < MIN_SYMBOLS) return err('code_damaged');
  const check = checkSymbols(symbols.slice(0, -CHECK_SYMBOLS));
  if (!check.ok || check.value !== symbols.slice(-CHECK_SYMBOLS)) return err('code_damaged');
  if (symbols.charAt(0) !== VERSION_SYMBOL || symbols.charAt(1) !== KIND_SYMBOL) {
    return err('code_version_unsupported');
  }
  if (symbols.length !== CODE_LENGTH) return err('code_damaged');

  let payload = idValue(symbols.slice(2, 2 + PAYLOAD_DIGITS));
  if (payload >= PAYLOAD_LIMIT) return err('code_damaged');
  // The fields, last first: each is the payload modulo its radix.
  const fields: number[] = [];
  for (let i = RADICES.length - 1; i >= 2; i -= 1) {
    const radix = RADICES[i] ?? 1n;
    fields[i] = Number(payload % radix);
    payload /= radix;
  }
  const sightingId = idSymbols(payload % SIGHTING_ID_RADIX, SIGHTING_ID_LENGTH);
  payload /= SIGHTING_ID_RADIX;
  const incidentId = idSymbols(payload, INCIDENT_ID_LENGTH);

  const wire: BearingWire = {
    v: 1,
    kind: 'bearing',
    id: sightingId,
    observer: {
      latDeg: LAT_ORIGIN_DEG + ((fields[2] ?? 0) + 0.5) * CELL_DEG,
      lonDeg: LON_ORIGIN_DEG + ((fields[3] ?? 0) + 0.5) * CELL_DEG,
    },
    positionAccuracyM: fields[7] ?? 0,
    timeUtcMs: EPOCH_UTC_MS + (fields[4] ?? 0) * 1000 + 500,
    azimuthDeg: ((fields[5] ?? 0) + 0.5) * AZIMUTH_CELL_DEG,
    azimuthSigmaDeg: ((fields[6] ?? 0) + 1) / 100,
  };
  const bearing = parseBearing(wire);
  if (!bearing.ok) return bearing;
  return ok({
    sightingId,
    incidentId,
    bearing: bearing.value,
    origin: 'received',
    receivedUtcMs: null,
  });
}
