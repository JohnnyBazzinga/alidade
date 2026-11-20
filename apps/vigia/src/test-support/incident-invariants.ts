// The invariants I1 to I8 of design §7.4 and §7.4a, written here as a list of violations (empty when the
// state holds them), independently of the code that keeps them (test support, not exported).
// Used by the example tests of the reducer and by P-4.7.

import { encodeSighting } from '../math/code/sighting-code';
import { incidentMode, isIncidentId } from '../math/incident/ids';
import type { VigiaState } from '../math/incident/incident-state';
import type { Sighting } from '../math/incident/sighting';
import type { VigiaParameters } from '../math/parameters';

/** `encodeSighting` of a Sighting object, remembered by identity: states share their entries. */
const ENCODED = new WeakMap<object, string | null>();
function encodedCode(sighting: Sighting): string | null {
  const known = ENCODED.get(sighting);
  if (known !== undefined) return known;
  const result = encodeSighting(sighting);
  const code = result.ok ? result.value : null;
  ENCODED.set(sighting, code);
  return code;
}

export function invariants(state: VigiaState, parameters: VigiaParameters): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  // I1: the ids and the former ids of all Incidents are pairwise different (checked with I8).
  for (const incident of state.incidents) {
    const former: readonly unknown[] = Array.isArray(incident.formerIds) ? incident.formerIds : [];
    if (!Array.isArray(incident.formerIds)) problems.push(`I8: no list of former ids`);
    for (const id of [incident.incidentId, ...former]) {
      if (ids.has(String(id)))
        problems.push(`I1: ${String(id)} is the id or a former id of two Incidents, or twice`);
      ids.add(String(id));
    }
    // I8
    if (former.length > parameters.maxFormerIncidentIds) {
      problems.push(`I8: ${former.length} former ids`);
    }
    former.forEach((id, k) => {
      if (
        typeof id !== 'string' ||
        !isIncidentId(id) ||
        incidentMode(id) !== incidentMode(incident.incidentId)
      ) {
        problems.push(`I8: former id ${String(id)} of ${incident.incidentId}`);
      } else if (k > 0 && !(String(former[k - 1]) < id)) {
        problems.push(`I8: former ids of ${incident.incidentId} are not in order`);
      }
    });
  }
  for (const incident of state.incidents) {
    if (!isIncidentId(incident.incidentId))
      problems.push(`I1: ${incident.incidentId} is not an id`);
    // I3
    if (incident.entries.length > parameters.maxSightingsPerIncident) {
      problems.push(`I3: ${incident.entries.length} entries`);
    }
    const sightingIds = new Set<string>();
    let previous: string | null = null;
    for (const entry of incident.entries) {
      const id = entry.sighting.sightingId;
      // I2: unique, and in code-unit order
      if (sightingIds.has(id)) problems.push(`I2: ${id} twice in ${incident.incidentId}`);
      sightingIds.add(id);
      if (previous !== null && !(previous < id)) problems.push(`I2: ${previous} before ${id}`);
      previous = id;
      // I4
      if (entry.sighting.incidentId !== incident.incidentId) {
        problems.push(`I4: ${id} says ${entry.sighting.incidentId} in ${incident.incidentId}`);
      }
      // I5
      if (encodedCode(entry.sighting) !== entry.code) problems.push(`I5: code of ${id}`);
      if (entry.sighting.bearing.id !== id) problems.push(`I5: bearing id of ${id}`);
      if (entry.shared.length > 20)
        problems.push(`shared: ${entry.shared.length} records of ${id}`);
      const local = entry.sighting.origin === 'local';
      if (local !== (entry.sighting.receivedUtcMs === null)) problems.push(`origin: ${id}`);
    }
    // I7
    for (const conflict of incident.conflicts) {
      const held = incident.entries.find((e) => e.sighting.sightingId === conflict.sightingId);
      if (held === undefined) problems.push(`I7: ${conflict.sightingId} is not held`);
      else if (held.code !== conflict.heldCode)
        problems.push(`I7: held code of ${conflict.sightingId}`);
      else if (conflict.otherCode === held.code)
        problems.push(`I7: ${conflict.sightingId} conflicts with itself`);
    }
  }
  // I6
  if (
    state.openIncidentId !== null &&
    !state.incidents.some((i) => i.incidentId === state.openIncidentId)
  ) {
    problems.push(`I6: open ${state.openIncidentId} is not held`);
  }
  return problems;
}
