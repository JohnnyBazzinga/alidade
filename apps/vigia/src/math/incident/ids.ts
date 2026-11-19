// Identifiers (Req 3.4, 4.1, 17.4, design §7.2). A Sighting id has 9 symbols and an Incident id 10,
// of the alphabet of the sighting code: 31^9 is 44.6 bits and 31^10 is 49.5 bits, at least the 40
// the requirements ask for. They are labels for grouping and not secrets.
//
// Two random bytes make one symbol: the bias of `65 536 mod 31 = 2` in 65 536 is about 3 · 10^-5,
// and the function is total for any byte string, constant ones included (a rejection-sampling
// loop would not be). The bytes come from the Random adapter as an argument: the Math layer
// draws no random number.

import { err, ok, type VigiaResult } from '../../result';
import { ALPHABET, ALPHABET_SIZE } from '../code/alphabet';

/** The longest id this function makes: far above the 10 symbols that exist, and a bound for the loop. */
const MAX_ID_LENGTH_SYMBOLS = 64;
const SIGHTING_ID_LENGTH = 9;
const INCIDENT_ID_LENGTH = 10;
/** The first symbol of an Incident id made in Simulation mode (design D16). */
const SIMULATION_SYMBOL = 'Z';

/**
 * `length` symbols from `2 · length` bytes: symbol `i` is the alphabet at
 * `(bytes[2i] · 256 + bytes[2i + 1]) mod m_i`, with `m_0 = firstSymbolModulus` and 31 for the
 * rest. Fails with `invalid_number` naming `bytes` (fewer than `2 · length`), `length` (not an
 * integer from 0 to 64) or `firstSymbolModulus` (not an integer from 1 to 31).
 */
export function idFromBytes(
  bytes: Uint8Array,
  length: number,
  firstSymbolModulus: number = ALPHABET_SIZE,
): VigiaResult<string> {
  if (!Number.isInteger(length) || length < 0 || length > MAX_ID_LENGTH_SYMBOLS) {
    return err('invalid_number', { field: 'length' });
  }
  if (
    !Number.isInteger(firstSymbolModulus) ||
    firstSymbolModulus < 1 ||
    firstSymbolModulus > ALPHABET_SIZE
  ) {
    return err('invalid_number', { field: 'firstSymbolModulus' });
  }
  if (bytes.length < 2 * length) return err('invalid_number', { field: 'bytes' });
  let id = '';
  for (let i = 0; i < length; i += 1) {
    const pair = (bytes[2 * i] ?? 0) * 256 + (bytes[2 * i + 1] ?? 0);
    id += ALPHABET.charAt(pair % (i === 0 ? firstSymbolModulus : ALPHABET_SIZE));
  }
  return ok(id);
}

/** A Sighting id: 9 symbols from 18 bytes. */
export function sightingIdFromBytes(bytes: Uint8Array): VigiaResult<string> {
  return idFromBytes(bytes, SIGHTING_ID_LENGTH);
}

/**
 * An Incident id: 10 symbols from 20 bytes. In `device` mode the first symbol is made modulo 30,
 * so it is never `Z`; in `simulation` mode it is `Z`.
 */
export function incidentIdFromBytes(
  bytes: Uint8Array,
  mode: 'device' | 'simulation',
): VigiaResult<string> {
  const id = idFromBytes(bytes, INCIDENT_ID_LENGTH, ALPHABET_SIZE - 1);
  if (!id.ok || mode === 'device') return id;
  return ok(`${SIMULATION_SYMBOL}${id.value.slice(1)}`);
}

const SIGHTING_ID_PATTERN = new RegExp(`^[${ALPHABET}]{${SIGHTING_ID_LENGTH}}$`);
const INCIDENT_ID_PATTERN = new RegExp(`^[${ALPHABET}]{${INCIDENT_ID_LENGTH}}$`);

/** True for exactly 9 symbols of the alphabet. */
export function isSightingId(text: string): boolean {
  return SIGHTING_ID_PATTERN.test(text);
}

/** True for exactly 10 symbols of the alphabet. */
export function isIncidentId(text: string): boolean {
  return INCIDENT_ID_PATTERN.test(text);
}

/** `simulation` when the first symbol is `Z`, `device` otherwise (design D16). */
export function incidentMode(incidentId: string): 'device' | 'simulation' {
  return incidentId.startsWith(SIMULATION_SYMBOL) ? 'simulation' : 'device';
}
