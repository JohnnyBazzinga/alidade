// The merge of one Sighting into an Incident (Req 9.5, 9.6, design §7.4): a set union by Sighting
// id. Over sets of Sightings with distinct ids and at most the maximum it is commutative,
// associative and idempotent; with two codes under one id, or more than the maximum, the held ones
// win and the result depends on the order (Req 9.6 states that domain).

import { err, ok, type VigiaResult } from '../../result';
import { decodeSighting, encodeSighting } from '../code/sighting-code';
import { checkParameters, type VigiaParameters } from '../parameters';
import { compareIds, type Incident, type Notice, type SightingEntry } from './incident-state';
import type { Sighting } from './sighting';

export type MergeOutcome = 'added' | 'duplicate' | 'conflict';

export interface MergeResult {
  readonly incident: Incident;
  readonly outcome: MergeOutcome;
  readonly notices: readonly Notice[];
}

/**
 * Merges `sighting` (with its `code`) into `incident`. The outcome is:
 * - `duplicate`: an entry with this Sighting id and the same code is held. The Incident is returned
 *   **unchanged, the same object**, so that `receivedUtcMs`, `hidden` and `shared` are not touched.
 * - `conflict`: an entry with this id and a different code is held. The held entry stays, a
 *   Conflict with both codes is added if it is not there, and the notice is `sighting_conflict`.
 * - `added`: a new id and room for it. The entry is not hidden and has not been shared.
 * - `full` is the failure `incident_full`: a new id and `maxSightingsPerIncident` entries.
 *
 * The entry holds what the code decodes to (the canonical Sighting, design D6), with the origin of
 * `sighting` and, for a received one, `receivedUtcMs`. Fails with `invalid_number` naming
 * `incidentId` (the Sighting is of another Incident), `receivedUtcMs` (a received Sighting needs a
 * finite time) or `code` (it is not the code of the Sighting), or with the failure of
 * `encodeSighting` for a Sighting the code cannot hold.
 */
export function mergeSighting(
  incident: Incident,
  sighting: Sighting,
  code: string,
  receivedUtcMs: number | null,
  parameters: VigiaParameters,
): VigiaResult<MergeResult> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (sighting.incidentId !== incident.incidentId)
    return err('invalid_number', { field: 'incidentId' });
  const received = sighting.origin === 'received';
  if (received && !(typeof receivedUtcMs === 'number' && Number.isFinite(receivedUtcMs))) {
    return err('invalid_number', { field: 'receivedUtcMs' });
  }
  const encoded = encodeSighting(sighting);
  if (!encoded.ok) return encoded;
  if (encoded.value !== code) return err('invalid_number', { field: 'code' });

  const held = incident.entries.find((e) => e.sighting.sightingId === sighting.sightingId);
  if (held !== undefined) {
    if (held.code === code) return ok({ incident, outcome: 'duplicate', notices: [] });
    const known = incident.conflicts.some(
      (c) => c.sightingId === sighting.sightingId && c.otherCode === code,
    );
    const notices: Notice[] = [{ reason: 'sighting_conflict', id: sighting.sightingId }];
    if (known) return ok({ incident, outcome: 'conflict', notices });
    const conflict = { sightingId: sighting.sightingId, heldCode: held.code, otherCode: code };
    return ok({
      incident: { ...incident, conflicts: [...incident.conflicts, conflict] },
      outcome: 'conflict',
      notices,
    });
  }
  if (incident.entries.length >= parameters.maxSightingsPerIncident) return err('incident_full');

  const decoded = decodeSighting(code, parameters);
  if (!decoded.ok) return decoded;
  const entry: SightingEntry = {
    sighting: {
      ...decoded.value,
      origin: sighting.origin,
      receivedUtcMs: received ? receivedUtcMs : null,
    },
    code,
    hidden: false,
    shared: [],
  };
  const entries = [...incident.entries, entry].sort((a, b) =>
    compareIds(a.sighting.sightingId, b.sighting.sightingId),
  );
  return ok({ incident: { ...incident, entries }, outcome: 'added', notices: [] });
}
