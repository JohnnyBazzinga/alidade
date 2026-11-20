// The stored format of the Sights and the Index error and its parser (Req 12.1, 12.2, 12.6; design
// §5, "Stored format"). No Position is ever written.

import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { IndexError } from '../sight/index-error';
import { checkSight, type Sight } from '../sight/sight';
import { checkIndexError, type NoniusState } from './apply-action';

export const STORAGE_FORMAT = 'nonius-state';
export const STORAGE_VERSION = 1;
/** The longest stored text that is read: a longer one is corrupt. */
export const MAX_STORED_CHARS = 1_000_000;

export type StoredParse =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly state: NoniusState; readonly dropped: number }
  | { readonly kind: 'corrupt'; readonly raw: string }
  | { readonly kind: 'newer'; readonly version: number };

/** The JSON text of `state`, keys in the order of design §5. */
export function serialiseState(state: NoniusState): string {
  return JSON.stringify({
    format: STORAGE_FORMAT,
    version: STORAGE_VERSION,
    sights: state.sights.map((s) => ({
      id: s.id,
      timeUtcMs: s.timeUtcMs,
      rawApparentAltitudeRad: s.rawApparentAltitudeRad,
      sampleStdDevRad: s.sampleStdDevRad,
      markSigmaRad: s.markSigmaRad,
      sunSide:
        s.sunSide === null
          ? null
          : { azimuthRad: s.sunSide.azimuthRad, northReference: s.sunSide.northReference },
      simulated: s.simulated,
    })),
    indexError:
      state.indexError === null
        ? null
        : {
            valueRad: state.indexError.valueRad,
            sigmaRad: state.indexError.sigmaRad,
            sightCount: state.indexError.sightCount,
            measuredUtcMs: state.indexError.measuredUtcMs,
            simulated: state.indexError.simulated,
          },
  });
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);

function sightOf(raw: unknown): Sight | null {
  if (!isObject(raw)) return null;
  const { id, simulated, sunSide } = raw;
  if (typeof id !== 'string' || typeof simulated !== 'boolean') return null;
  let side: Sight['sunSide'] = null;
  if (sunSide !== null) {
    if (!isObject(sunSide)) return null;
    const ref = sunSide.northReference;
    if (ref !== 'magnetic' && ref !== 'true') return null;
    side = { azimuthRad: num(sunSide.azimuthRad), northReference: ref };
  }
  const sight: Sight = {
    id,
    timeUtcMs: num(raw.timeUtcMs),
    rawApparentAltitudeRad: num(raw.rawApparentAltitudeRad),
    sampleStdDevRad: num(raw.sampleStdDevRad),
    markSigmaRad: num(raw.markSigmaRad),
    sunSide: side,
    simulated,
  };
  return checkSight(sight) === null ? sight : null;
}

function indexErrorOf(raw: unknown, params: NoniusParameters): IndexError | null {
  if (!isObject(raw) || typeof raw.simulated !== 'boolean') return null;
  const indexError: IndexError = {
    valueRad: num(raw.valueRad),
    sigmaRad: num(raw.sigmaRad),
    sightCount: num(raw.sightCount),
    measuredUtcMs: num(raw.measuredUtcMs),
    simulated: raw.simulated,
  };
  return checkIndexError(indexError, params) === null ? indexError : null;
}

/**
 * Reads the stored text: `empty` for none; `corrupt` (with the raw text, for the backup) for text
 * that is not this format; `newer` for a higher version, which is left alone; otherwise `loaded`
 * with what could be read and the number of items dropped (a Sight with a bad field, a duplicate
 * id, a time outside the Sun wrapper's range, or beyond `MAX_SIGHTS`; a bad Index error).
 */
export function parseStoredState(
  text: string | null,
  params: NoniusParameters,
): NoniusResult<StoredParse> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (text === null || text === '') return ok({ kind: 'empty' });
  if (typeof text !== 'string') return err('invalid_number', { field: 'text' });
  if (text.length > MAX_STORED_CHARS) return ok({ kind: 'corrupt', raw: text });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return ok({ kind: 'corrupt', raw: text });
  }
  if (!isObject(json) || json.format !== STORAGE_FORMAT) return ok({ kind: 'corrupt', raw: text });
  const version = json.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return ok({ kind: 'corrupt', raw: text });
  }
  if (version > STORAGE_VERSION) return ok({ kind: 'newer', version });
  if (!Array.isArray(json.sights)) return ok({ kind: 'corrupt', raw: text });

  const sights: Sight[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of json.sights as unknown[]) {
    const sight = sightOf(raw);
    const inRange =
      sight !== null &&
      sight.timeUtcMs >= params.sunModelStartUtcMs &&
      sight.timeUtcMs < params.sunModelEndUtcMs;
    if (sight === null || !inRange || seen.has(sight.id) || sights.length >= params.maxSights) {
      dropped += 1;
      continue;
    }
    seen.add(sight.id);
    sights.push(sight);
  }
  let indexError: IndexError | null = null;
  if (json.indexError !== null && json.indexError !== undefined) {
    indexError = indexErrorOf(json.indexError, params);
    if (indexError === null) dropped += 1;
  }
  return ok({ kind: 'loaded', state: { sights, indexError }, dropped });
}
