// The Incident and the state of the app (design §6, §7.4, D3): plain data. `sanitiseState` holds
// the invariants I1 to I7 of design §7.4 for a state that comes from outside the reducer (a
// reload, another tab's write): it keeps what holds them and counts what it drops.
//
// I1 Incident ids are unique. I2 within an Incident the Sighting ids are unique and the entries
// are ordered by Sighting id (code-unit order), so a state does not remember the order of
// arrival. I3 at most `maxSightingsPerIncident` entries. I4 an entry's Sighting names its
// Incident. I5 an entry's `code` is `encodeSighting` of its Sighting. I6 `openIncidentId` is null
// or an Incident's id. I7 a Conflict names a held Sighting and a code different from the held one.
// I8 the former ids of an Incident (design §7.4a) are valid ids of its mode, in code-unit order,
// none its own and none the id or a former id of another Incident, at most `maxFormerIncidentIds`;
// the ids and former ids of all Incidents are pairwise different (I1).

import { encodeSighting } from '../code/sighting-code';
import { err, ok, type VigiaResult } from '../../result';
import type { VigiaParameters } from '../parameters';
import { incidentMode, isIncidentId } from './ids';
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
  /**
   * The ids this Incident had, or that were merged into it by a join (design §7.4a): a code made
   * under one of them is a code of this Incident. In code-unit order, none twice.
   */
  readonly formerIds: readonly string[];
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

/**
 * The Incident whose id, or one of whose former ids, is `incidentId` (design §7.4a), or `null`
 * when none holds it. A code made under either is a code of that Incident. A state that holds a
 * number that is not finite is `invalid_number` naming `state` (Req 2.1; the counterexample of
 * P-2.6, seed 898952540).
 */
export function incidentHolding(
  state: VigiaState,
  incidentId: string,
): VigiaResult<Incident | null> {
  if (!hasOnlyFiniteNumbers(state)) return err('invalid_number', { field: 'state' });
  const held = state.incidents.find(
    (i) => i.incidentId === incidentId || (i.formerIds ?? []).includes(incidentId),
  );
  return ok(held ?? null);
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
  const formerOf = new Map<string, unknown>();
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
      formerIds: [],
      entries,
      conflicts,
    });
    formerOf.set(incident.incidentId, incident.formerIds);
  }
  // I8, once every current id is known: a current id wins over a former id, and between former
  // ids the earlier Incident wins. A missing list is an empty one (a value saved before the join).
  const currentIds = new Set(incidents.map((i) => i.incidentId));
  const claimed = new Set<string>();
  const withFormer = incidents.map((incident): Incident => {
    const raw: unknown = formerOf.get(incident.incidentId);
    if (raw === undefined) return incident;
    if (!Array.isArray(raw)) {
      dropped += 1;
      return incident;
    }
    const kept: string[] = [];
    for (const id of raw as unknown[]) {
      const usable =
        typeof id === 'string' &&
        isIncidentId(id) &&
        incidentMode(id) === incidentMode(incident.incidentId) &&
        !currentIds.has(id) &&
        !claimed.has(id);
      if (!usable) {
        dropped += 1;
        continue;
      }
      claimed.add(id);
      kept.push(id);
    }
    kept.sort(compareIds);
    const former = kept.slice(0, parameters.maxFormerIncidentIds);
    for (const id of kept.slice(parameters.maxFormerIncidentIds)) claimed.delete(id);
    dropped += kept.length - former.length;
    return { ...incident, formerIds: former };
  });
  const openHeld = incidents.some((i) => i.incidentId === state.openIncidentId);
  return {
    state: { incidents: withFormer, openIncidentId: openHeld ? state.openIncidentId : null },
    dropped,
  };
}
