// Joining two smokes (design §7.4a; Req 4.8, 4.9): the relabelling of a code to another Incident
// id, and the join of the open Incident with the Incident of a code whose id is not held. Pure
// functions; the reducer (`apply-action.ts`) is their only caller.
//
// Two people who see smoke each take a sighting before they exchange anything, so each phone has
// started its own Incident. The user's answer "it is the same smoke as the one I have open" joins
// them: the smaller of the two ids survives, the other becomes a former id, and a code made under
// either is a code of the one Incident from then on.

import { err, ok, type VigiaResult } from '../../result';
import { decodeSighting, encodeSighting } from '../code/sighting-code';
import { checkParameters, type VigiaParameters } from '../parameters';
import { incidentMode } from './ids';
import {
  compareIds,
  hasOnlyFiniteNumbers,
  incidentHolding,
  type Conflict,
  type Incident,
  type InboxItem,
  type Notice,
  type SightingEntry,
  type VigiaState,
} from './incident-state';
import { mergeSighting } from './merge';

/**
 * The code of the same Sighting made under `incidentId`: decoded, the id replaced, encoded again.
 * Nothing else in the code changes, so the Bearing is the same bit for bit. Fails with the failure
 * of the decoder for text that is not a code, or of the encoder for an id that is not an id.
 */
export function relabelCode(
  code: string,
  incidentId: string,
  parameters: VigiaParameters,
): VigiaResult<string> {
  const decoded = decodeSighting(code, parameters);
  if (!decoded.ok) return decoded;
  const encoded = encodeSighting({ ...decoded.value, incidentId });
  if (!encoded.ok) return encoded;
  return ok(encoded.value);
}

/**
 * The item as a code of the Incident `incidentId`: the same item when it already is, else its
 * Sighting relabelled and its code made again. A code made under a former id reaches the Incident
 * that holds it through this. An item that holds a number that is not finite is `invalid_number`
 * naming `item`, in both branches: the relabelled item keeps the other fields as they are (Req 2.1;
 * the counterexample of P-2.6, seed 456561989). When the item is relabelled, a parameter that is not
 * valid is named first (Req 19.3; seed 679858833).
 */
export function relabelItem(
  item: InboxItem,
  incidentId: string,
  parameters: VigiaParameters,
): VigiaResult<InboxItem> {
  if (item.sighting.incidentId !== incidentId) {
    const checked = checkParameters(parameters);
    if (!checked.ok) return checked;
  }
  if (!hasOnlyFiniteNumbers(item)) return err('invalid_number', { field: 'item' });
  if (item.sighting.incidentId === incidentId) return ok(item);
  const code = relabelCode(item.code, incidentId, parameters);
  if (!code.ok) return code;
  return ok({ ...item, code: code.value, sighting: { ...item.sighting, incidentId } });
}

function relabelEntry(
  entry: SightingEntry,
  incidentId: string,
  parameters: VigiaParameters,
): VigiaResult<SightingEntry> {
  const code = relabelCode(entry.code, incidentId, parameters);
  if (!code.ok) return code;
  return ok({ ...entry, code: code.value, sighting: { ...entry.sighting, incidentId } });
}

function relabelConflict(
  conflict: Conflict,
  incidentId: string,
  parameters: VigiaParameters,
): VigiaResult<Conflict> {
  const held = relabelCode(conflict.heldCode, incidentId, parameters);
  if (!held.ok) return held;
  const other = relabelCode(conflict.otherCode, incidentId, parameters);
  if (!other.ok) return other;
  return ok({ sightingId: conflict.sightingId, heldCode: held.value, otherCode: other.value });
}

/**
 * Joins the open Incident of `state` with the Incident of `item`, whose id is not held. Returns
 * the new state and the notices of the merge, or a failure and then nothing changes. The order of
 * the refusals is that of design §7.4a: `nowUtcMs` not finite (`invalid_number`, `nowUtcMs`), no
 * Incident open (`incident_unknown`), the id of the code held (`invalid_number`, `incidentId`), a
 * simulation against a real smoke or more former ids than `maxFormerIncidentIds`
 * (`incident_not_joinable`), more Sightings than `maxSightingsPerIncident` (`incident_full`).
 */
export function joinIncident(
  state: VigiaState,
  item: InboxItem,
  nowUtcMs: number,
  parameters: VigiaParameters,
): VigiaResult<{ readonly state: VigiaState; readonly notices: readonly Notice[] }> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!hasOnlyFiniteNumbers(state)) return err('invalid_number', { field: 'state' });
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
  const open = state.incidents.find((i) => i.incidentId === state.openIncidentId);
  if (open === undefined) return err('incident_unknown');
  const other = item.sighting.incidentId;
  if (incidentHolding(state, other) !== undefined) {
    return err('invalid_number', { field: 'incidentId' });
  }
  if (incidentMode(open.incidentId) !== incidentMode(other)) return err('incident_not_joinable');

  const survivorId = compareIds(open.incidentId, other) <= 0 ? open.incidentId : other;
  const formerIds = [...new Set([...open.formerIds, open.incidentId, other])]
    .filter((id) => id !== survivorId)
    .sort(compareIds);
  if (formerIds.length > parameters.maxFormerIncidentIds) return err('incident_not_joinable');

  // The entries keep their codes when the open Incident's own id survives.
  const entries: SightingEntry[] = [];
  const conflicts: Conflict[] = [];
  if (survivorId === open.incidentId) {
    entries.push(...open.entries);
    conflicts.push(...open.conflicts);
  } else {
    for (const entry of open.entries) {
      const relabelled = relabelEntry(entry, survivorId, parameters);
      if (!relabelled.ok) return relabelled;
      entries.push(relabelled.value);
    }
    for (const conflict of open.conflicts) {
      const relabelled = relabelConflict(conflict, survivorId, parameters);
      if (!relabelled.ok) return relabelled;
      conflicts.push(relabelled.value);
    }
  }
  const incoming = relabelItem(item, survivorId, parameters);
  if (!incoming.ok) return incoming;

  const base: Incident = {
    incidentId: survivorId,
    createdUtcMs: Math.min(open.createdUtcMs, nowUtcMs),
    creation: survivorId === open.incidentId ? open.creation : 'joined',
    formerIds,
    entries,
    conflicts,
  };
  const merged = mergeSighting(
    base,
    { ...incoming.value.sighting, origin: 'received' },
    incoming.value.code,
    nowUtcMs,
    parameters,
  );
  if (!merged.ok) return merged;
  return ok({
    state: {
      incidents: state.incidents.map((i) => (i === open ? merged.value.incident : i)),
      openIncidentId: survivorId,
    },
    notices: merged.value.notices,
  });
}
