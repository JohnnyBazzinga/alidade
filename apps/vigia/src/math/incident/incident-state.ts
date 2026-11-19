// The Incident and the state of the app (design §6, §7.4, D3): plain data. `sanitiseState` holds
// the invariants I1 to I7 of design §7.4 for a state that comes from outside the reducer (a
// reload, another tab's write): it keeps what holds them and counts what it drops.
//
// I1 Incident ids are unique. I2 within an Incident the Sighting ids are unique and the entries
// are ordered by Sighting id (code-unit order), so a state does not remember the order of
// arrival. I3 at most `maxSightingsPerIncident` entries. I4 an entry's Sighting names its
// Incident. I5 an entry's `code` is `encodeSighting` of its Sighting. I6 `openIncidentId` is null
// or an Incident's id. I7 a Conflict names a held Sighting and a code different from the held one.

import { encodeSighting } from '../code/sighting-code';
import type { VigiaParameters } from '../parameters';
import { isIncidentId } from './ids';
import type { Sighting } from './sighting';

export type ShareChannel = 'link' | 'qr' | 'text' | 'system_share' | 'memory';
export const SHARE_CHANNELS: readonly ShareChannel[] = [
  'link',
  'qr',
  'text',
  'system_share',
  'memory',
];
/** The most share records kept for one entry (design §7.4). */
export const MAX_SHARE_RECORDS = 20;

export interface ShareRecord {
  readonly channel: ShareChannel;
  readonly atUtcMs: number;
}

export interface SightingEntry {
  readonly sighting: Sighting;
  /** `encodeSighting(sighting)`: the identity of its content. */
  readonly code: string;
  readonly hidden: boolean;
  readonly shared: readonly ShareRecord[];
}

export interface Conflict {
  readonly sightingId: string;
  readonly heldCode: string;
  readonly otherCode: string;
}

export interface Incident {
  readonly incidentId: string;
  readonly createdUtcMs: number;
  readonly creation: 'created' | 'joined';
  readonly entries: readonly SightingEntry[];
  readonly conflicts: readonly Conflict[];
}

/** A decoded code that has arrived and has not been added or ignored (design D7): memory only. */
export interface InboxItem {
  readonly code: string;
  /** `origin: 'received'` and `receivedUtcMs: null`: the reducer stamps the time of the user's act. */
  readonly sighting: Sighting;
  readonly arrivedUtcMs: number;
}

export interface VigiaState {
  readonly incidents: readonly Incident[];
  readonly openIncidentId: string | null;
}

/** What the screen is told besides the new state: a conflict, or the damage that a reload found. */
export interface Notice {
  readonly reason: 'sighting_conflict' | 'storage_corrupt';
  readonly field?: string;
  readonly id?: string;
  readonly count?: number;
}

export function emptyState(): VigiaState {
  return { incidents: [], openIncidentId: null };
}

/** Code-unit order of two strings: the order of the entries of an Incident (I2). */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True when every number reachable in `value` is finite (strings, booleans and null are fine). */
export function hasOnlyFiniteNumbers(value: unknown, seen: Set<unknown> = new Set()): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || value === null || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((child) => hasOnlyFiniteNumbers(child, seen));
}

/** The newest time that keeps an Incident: its newest entry's Bearing time, or its creation time. */
export function newestTimeUtcMs(incident: Incident): number {
  let newest = incident.createdUtcMs;
  if (incident.entries.length === 0) return newest;
  newest = Number.NEGATIVE_INFINITY;
  for (const entry of incident.entries) newest = Math.max(newest, entry.sighting.bearing.timeUtcMs);
  return newest;
}

function validShared(shared: readonly ShareRecord[]): boolean {
  return (
    Array.isArray(shared) &&
    shared.length <= MAX_SHARE_RECORDS &&
    shared.every(
      (record) =>
        typeof record === 'object' &&
        record !== null &&
        SHARE_CHANNELS.includes(record.channel) &&
        Number.isFinite(record.atUtcMs),
    )
  );
}

/** True when `entry` is well formed and belongs to `incidentId` (I4, I5 and the shape of its fields). */
function entryHolds(entry: SightingEntry, incidentId: string): boolean {
  const { sighting } = entry;
  if (typeof entry.code !== 'string' || typeof entry.hidden !== 'boolean') return false;
  if (sighting.incidentId !== incidentId) return false;
  if (sighting.origin !== 'local' && sighting.origin !== 'received') return false;
  if (
    sighting.origin === 'local'
      ? sighting.receivedUtcMs !== null
      : !Number.isFinite(sighting.receivedUtcMs)
  ) {
    return false;
  }
  if (!validShared(entry.shared)) return false;
  const encoded = encodeSighting(sighting);
  return encoded.ok && encoded.value === entry.code;
}

/**
 * The state with I1 to I7 held, and the number of things dropped to hold them. An Incident that
 * is dropped counts itself and each entry it held; an entry counts itself; a conflict counts
 * itself unless it names no held entry (then it goes silently with the entry). Entries over the maximum
 * are the ones last in Sighting id order. The open Incident that is not held becomes null (not
 * counted). Nothing is changed in the argument.
 */
export function sanitiseState(
  state: VigiaState,
  parameters: VigiaParameters,
): { readonly state: VigiaState; readonly dropped: number } {
  let dropped = 0;
  const incidents: Incident[] = [];
  const seenIncidents = new Set<string>();
  for (const incident of state.incidents) {
    const heldEntries = Array.isArray(incident.entries) ? incident.entries : [];
    const headerHolds =
      typeof incident.incidentId === 'string' &&
      isIncidentId(incident.incidentId) &&
      !seenIncidents.has(incident.incidentId) &&
      Number.isFinite(incident.createdUtcMs) &&
      (incident.creation === 'created' || incident.creation === 'joined') &&
      Array.isArray(incident.entries) &&
      Array.isArray(incident.conflicts);
    if (!headerHolds) {
      dropped += 1 + heldEntries.length;
      continue;
    }
    seenIncidents.add(incident.incidentId);
    const seenSightings = new Set<string>();
    const kept: SightingEntry[] = [];
    for (const entry of heldEntries) {
      if (!entryHolds(entry, incident.incidentId) || seenSightings.has(entry.sighting.sightingId)) {
        dropped += 1;
        continue;
      }
      seenSightings.add(entry.sighting.sightingId);
      kept.push(entry);
    }
    kept.sort((a, b) => compareIds(a.sighting.sightingId, b.sighting.sightingId));
    const entries = kept.slice(0, parameters.maxSightingsPerIncident);
    dropped += kept.length - entries.length;
    const conflicts: Conflict[] = [];
    for (const conflict of incident.conflicts) {
      const held = entries.find((e) => e.sighting.sightingId === conflict?.sightingId);
      // A conflict that names no held entry means nothing and goes with it, uncounted: the entry
      // was dropped (and counted) here or by the parser, or never was held.
      if (held === undefined) continue;
      const duplicate = conflicts.some(
        (c) => c.sightingId === conflict.sightingId && c.otherCode === conflict.otherCode,
      );
      if (
        typeof conflict.otherCode !== 'string' ||
        conflict.heldCode !== held.code ||
        conflict.otherCode === held.code ||
        duplicate
      ) {
        dropped += 1;
        continue;
      }
      conflicts.push({
        sightingId: conflict.sightingId,
        heldCode: conflict.heldCode,
        otherCode: conflict.otherCode,
      });
    }
    incidents.push({
      incidentId: incident.incidentId,
      createdUtcMs: incident.createdUtcMs,
      creation: incident.creation,
      entries,
      conflicts,
    });
  }
  const openHeld = incidents.some((i) => i.incidentId === state.openIncidentId);
  return { state: { incidents, openIncidentId: openHeld ? state.openIncidentId : null }, dropped };
}
