// The stored format of the Incidents and its parser (design D4, §7.5, Req 4.4, 4.5, 15.4).
//
// A Sighting is stored as its sighting code plus its flags: the code is already the canonical
// form, so a reload decodes to the identical Bearing, bit for bit; its check value detects
// corruption; and the format cannot drift from the wire format because it is the wire format.
// Simulated Incidents are never written (they live in a memory object, design D16).

import { err, ok, type VigiaResult } from '../../result';
import { decodeSighting, encodeSighting } from '../code/sighting-code';
import { checkParameters, type VigiaParameters } from '../parameters';
import { incidentMode, isIncidentId } from './ids';
import {
  MAX_SHARE_RECORDS,
  newestTimeUtcMs,
  SHARE_CHANNELS,
  sanitiseState,
  type Conflict,
  type Incident,
  type ShareRecord,
  type SightingEntry,
  type VigiaState,
} from './incident-state';

export const STORAGE_FORMAT = 'vigia-state';
export const STORAGE_VERSION = 1;
/** The longest stored text that is read: a longer one is corrupt (design §7.5, step 1). */
export const MAX_STORED_CHARS = 1_000_000;

export type StoredParse =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly state: VigiaState; readonly dropped: number }
  | { readonly kind: 'corrupt'; readonly raw: string }
  | { readonly kind: 'newer'; readonly version: number };

/**
 * The JSON text of `state`, keys in the order of design §7.5. Only Incidents made on a device are
 * written, with each entry's `code`, `origin`, `receivedUtcMs`, `hidden` and `shared`. A saved
 * time that is not finite is written as 0.
 */
export function serialiseState(state: VigiaState, savedUtcMs: number): string {
  const incidents = state.incidents
    .filter((i) => incidentMode(i.incidentId) === 'device')
    .map((i) => ({
      incidentId: i.incidentId,
      createdUtcMs: i.createdUtcMs,
      creation: i.creation,
      entries: i.entries.map((e) => ({
        code: e.code,
        origin: e.sighting.origin,
        receivedUtcMs: e.sighting.receivedUtcMs,
        hidden: e.hidden,
        shared: e.shared.map((r) => ({ channel: r.channel, atUtcMs: r.atUtcMs })),
      })),
      conflicts: i.conflicts.map((c) => ({
        sightingId: c.sightingId,
        heldCode: c.heldCode,
        otherCode: c.otherCode,
      })),
    }));
  const open = incidents.some((i) => i.incidentId === state.openIncidentId)
    ? state.openIncidentId
    : null;
  return JSON.stringify({
    format: STORAGE_FORMAT,
    version: STORAGE_VERSION,
    savedUtcMs: Number.isFinite(savedUtcMs) ? savedUtcMs : 0,
    openIncidentId: open,
    incidents,
  });
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** The records of a stored `shared`, or `null` when it is not an array of at most 20 good ones. */
function sharedOf(raw: unknown): ShareRecord[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SHARE_RECORDS) return null;
  const records: ShareRecord[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !isFiniteNumber(item['atUtcMs'])) return null;
    const channel = SHARE_CHANNELS.find((c) => c === item['channel']);
    if (channel === undefined) return null;
    records.push({ channel, atUtcMs: item['atUtcMs'] });
  }
  return records;
}

/** One stored entry as an entry, or `null` when it is not one (the caller counts it). */
function entryOf(raw: unknown, parameters: VigiaParameters): SightingEntry | null {
  if (!isRecord(raw)) return null;
  const { code, origin, receivedUtcMs, hidden } = raw;
  if (typeof code !== 'string' || typeof hidden !== 'boolean') return null;
  if (origin !== 'local' && origin !== 'received') return null;
  if (origin === 'local' ? receivedUtcMs !== null : !isFiniteNumber(receivedUtcMs)) return null;
  const shared = sharedOf(raw['shared']);
  if (shared === null) return null;
  const decoded = decodeSighting(code, parameters);
  if (!decoded.ok) return null;
  const canonical = encodeSighting(decoded.value);
  if (!canonical.ok) return null;
  return {
    sighting: {
      ...decoded.value,
      origin,
      receivedUtcMs: origin === 'local' ? null : (receivedUtcMs as number),
    },
    code: canonical.value,
    hidden,
    shared,
  };
}

function conflictOf(raw: unknown): Conflict | null {
  if (!isRecord(raw)) return null;
  const { sightingId, heldCode, otherCode } = raw;
  if (
    typeof sightingId !== 'string' ||
    typeof heldCode !== 'string' ||
    typeof otherCode !== 'string'
  )
    return null;
  return { sightingId, heldCode, otherCode };
}

/**
 * Reads a stored value (design §7.5): `empty` for `null`; `corrupt` (with the text, for the
 * backup) for a text over 1 000 000 characters, text that is not a JSON object of format
 * `vigia-state`, a version that is not an integer of at least 1, or a list of Incidents that is
 * not a list; `newer` for an integer version above 1, judged before anything else is read;
 * otherwise `loaded`, with every Incident and entry that holds, and the number of those that
 * were dropped to make it so. An Incident older than the retention is removed without being
 * counted as damage. Fails with `invalid_number` naming `nowUtcMs` or a parameter.
 */
export function parseStoredState(
  text: string | null,
  nowUtcMs: number,
  parameters: VigiaParameters,
): VigiaResult<StoredParse> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
  if (text === null) return ok({ kind: 'empty' });
  if (text.length > MAX_STORED_CHARS) return ok({ kind: 'corrupt', raw: text });

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return ok({ kind: 'corrupt', raw: text });
  }
  if (!isRecord(value) || value['format'] !== STORAGE_FORMAT)
    return ok({ kind: 'corrupt', raw: text });
  const version = value['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return ok({ kind: 'corrupt', raw: text });
  }
  if (version > STORAGE_VERSION) return ok({ kind: 'newer', version });
  const rawIncidents = value['incidents'];
  if (!Array.isArray(rawIncidents)) return ok({ kind: 'corrupt', raw: text });

  let dropped = 0;
  const incidents: Incident[] = [];
  for (const raw of rawIncidents) {
    if (!isRecord(raw)) {
      dropped += 1;
      continue;
    }
    const rawEntries: unknown = raw['entries'];
    const rawConflicts: unknown = raw['conflicts'];
    const incidentId = raw['incidentId'];
    const createdUtcMs = raw['createdUtcMs'];
    const creation = raw['creation'];
    const headerHolds =
      typeof incidentId === 'string' &&
      isIncidentId(incidentId) &&
      incidentMode(incidentId) === 'device' &&
      isFiniteNumber(createdUtcMs) &&
      (creation === 'created' || creation === 'joined') &&
      Array.isArray(rawEntries) &&
      Array.isArray(rawConflicts);
    if (!headerHolds) {
      dropped += 1 + (Array.isArray(rawEntries) ? rawEntries.length : 0);
      continue;
    }
    const entries: SightingEntry[] = [];
    for (const rawEntry of rawEntries) {
      const entry = entryOf(rawEntry, parameters);
      if (entry === null) dropped += 1;
      else entries.push(entry);
    }
    const conflicts: Conflict[] = [];
    for (const rawConflict of rawConflicts) {
      const conflict = conflictOf(rawConflict);
      if (conflict === null) dropped += 1;
      else conflicts.push(conflict);
    }
    incidents.push({ incidentId, createdUtcMs, creation, entries, conflicts });
  }
  const open = typeof value['openIncidentId'] === 'string' ? value['openIncidentId'] : null;
  const sane = sanitiseState({ incidents, openIncidentId: open }, parameters);

  const kept = sane.state.incidents.filter(
    (i) => nowUtcMs - newestTimeUtcMs(i) <= parameters.incidentRetentionMs,
  );
  const stillOpen = kept.some((i) => i.incidentId === sane.state.openIncidentId);
  return ok({
    kind: 'loaded',
    state: { incidents: kept, openIncidentId: stillOpen ? sane.state.openIncidentId : null },
    dropped: dropped + sane.dropped,
  });
}
