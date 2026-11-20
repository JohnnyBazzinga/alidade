// The reducer of the Incident store (Req 4, 5.6, 9.4 to 9.7, design D3, §7.4). `applyAction` is a
// pure function: every input an action needs, the time included, is in the action. A failure
// returns no state: the caller keeps the old one. An action that changes nothing returns the same
// state object. The invariants I1 to I7 are those of `incident-state.ts`.

import { err, ok, type VigiaResult } from '../../result';
import { checkParameters, type VigiaParameters } from '../parameters';
import { isIncidentId } from './ids';
import { joinIncident, relabelItem } from './join';
import {
  hasOnlyFiniteNumbers,
  incidentHolding,
  MAX_SHARE_RECORDS,
  newestTimeUtcMs,
  SHARE_CHANNELS,
  sanitiseState,
  type InboxItem,
  type Incident,
  type Notice,
  type ShareRecord,
  type SightingEntry,
  type VigiaState,
} from './incident-state';
import { mergeSighting } from './merge';
import type { Sighting } from './sighting';

export type VigiaAction =
  | { readonly kind: 'createIncident'; readonly incidentId: string; readonly nowUtcMs: number }
  | { readonly kind: 'openIncident'; readonly incidentId: string }
  /** After the user's answer (Req 4.3). */
  | {
      readonly kind: 'addLocal';
      readonly sighting: Sighting;
      readonly code: string;
      readonly nowUtcMs: number;
    }
  /** "Add" in the Inbox. */
  | {
      readonly kind: 'addReceived';
      readonly item: InboxItem;
      readonly nowUtcMs: number;
      readonly joinIfUnknown: boolean;
    }
  /**
   * "It is the same smoke as the one I have open" (Req 4.8, design §7.4a): joins the open Incident
   * with the Incident of a code whose id is not held.
   */
  | { readonly kind: 'joinIncident'; readonly item: InboxItem; readonly nowUtcMs: number }
  | { readonly kind: 'hide'; readonly sightingId: string }
  | { readonly kind: 'show'; readonly sightingId: string }
  | { readonly kind: 'deleteSighting'; readonly sightingId: string }
  | { readonly kind: 'deleteIncident'; readonly incidentId: string }
  | { readonly kind: 'deleteAll' }
  | { readonly kind: 'markShared'; readonly sightingId: string; readonly record: ShareRecord }
  | { readonly kind: 'expire'; readonly nowUtcMs: number }
  /** A reload or another tab's write: a state that `parseStoredState` or the outside produced. */
  | { readonly kind: 'replace'; readonly state: VigiaState };

export interface ActionResult {
  readonly state: VigiaState;
  readonly notices: readonly Notice[];
}

const NO_NOTICES: readonly Notice[] = [];

function changed(
  state: VigiaState,
  notices: readonly Notice[] = NO_NOTICES,
): VigiaResult<ActionResult> {
  return ok({ state, notices });
}

/** The state with the Incident of the same id replaced by `incident`. */
function withIncident(state: VigiaState, incident: Incident): VigiaState {
  return {
    ...state,
    incidents: state.incidents.map((i) => (i.incidentId === incident.incidentId ? incident : i)),
  };
}

/** The first Incident, in the order of the state, that holds the Sighting. */
function holderOf(state: VigiaState, sightingId: string): Incident | undefined {
  return state.incidents.find((i) => i.entries.some((e) => e.sighting.sightingId === sightingId));
}

function finite(x: number): boolean {
  return typeof x === 'number' && Number.isFinite(x);
}

function validRecord(record: ShareRecord): boolean {
  return (
    typeof record === 'object' &&
    record !== null &&
    SHARE_CHANNELS.includes(record.channel) &&
    finite(record.atUtcMs)
  );
}

/** A new Incident that is empty. */
function newIncident(
  incidentId: string,
  createdUtcMs: number,
  creation: 'created' | 'joined',
): Incident {
  return { incidentId, createdUtcMs, creation, formerIds: [], entries: [], conflicts: [] };
}

/**
 * Applies `action` to `state` (design §7.4). Fails with `invalid_number` naming `state` (a number
 * in the state that is not finite), a parameter, `nowUtcMs`, `incidentId`, `sightingId`, `code` or
 * `record`; with `incident_unknown`, `incident_full`, or the failure of the encoder for a Sighting
 * the code cannot hold.
 */
export function applyAction(
  state: VigiaState,
  action: VigiaAction,
  parameters: VigiaParameters,
): VigiaResult<ActionResult> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;

  if (action.kind === 'replace') {
    const { state: sane, dropped } = sanitiseState(action.state, parameters);
    return changed(
      sane,
      dropped > 0 ? [{ reason: 'storage_corrupt', count: dropped }] : NO_NOTICES,
    );
  }
  if (!hasOnlyFiniteNumbers(state)) return err('invalid_number', { field: 'state' });

  switch (action.kind) {
    case 'createIncident': {
      if (!finite(action.nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
      const exists = incidentHolding(state, action.incidentId) !== undefined;
      if (!isIncidentId(action.incidentId) || exists)
        return err('invalid_number', { field: 'incidentId' });
      return changed({
        incidents: [...state.incidents, newIncident(action.incidentId, action.nowUtcMs, 'created')],
        openIncidentId: action.incidentId,
      });
    }

    case 'openIncident': {
      if (!state.incidents.some((i) => i.incidentId === action.incidentId))
        return err('incident_unknown');
      if (state.openIncidentId === action.incidentId) return changed(state);
      return changed({ ...state, openIncidentId: action.incidentId });
    }

    case 'addLocal': {
      if (!finite(action.nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
      const open = state.incidents.find((i) => i.incidentId === state.openIncidentId);
      if (open === undefined || open.incidentId !== action.sighting.incidentId)
        return err('incident_unknown');
      const merged = mergeSighting(
        open,
        { ...action.sighting, origin: 'local' },
        action.code,
        null,
        parameters,
      );
      if (!merged.ok) return merged;
      if (merged.value.incident === open) return changed(state, merged.value.notices);
      return changed(withIncident(state, merged.value.incident), merged.value.notices);
    }

    case 'addReceived': {
      if (!finite(action.nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
      const { item } = action;
      // A code made under a former id is a code of the Incident that holds it (design §7.4a).
      const known = incidentHolding(state, item.sighting.incidentId);
      if (known === undefined && !action.joinIfUnknown) return err('incident_unknown');
      const target = known ?? newIncident(item.sighting.incidentId, action.nowUtcMs, 'joined');
      const labelled = relabelItem(item, target.incidentId, parameters);
      if (!labelled.ok) return labelled;
      const merged = mergeSighting(
        target,
        { ...labelled.value.sighting, origin: 'received' },
        labelled.value.code,
        action.nowUtcMs,
        parameters,
      );
      if (!merged.ok) return merged;
      if (known === undefined) {
        return changed(
          {
            incidents: [...state.incidents, merged.value.incident],
            openIncidentId: merged.value.incident.incidentId,
          },
          merged.value.notices,
        );
      }
      if (merged.value.incident === known) return changed(state, merged.value.notices);
      return changed(withIncident(state, merged.value.incident), merged.value.notices);
    }

    case 'joinIncident': {
      const joined = joinIncident(state, action.item, action.nowUtcMs, parameters);
      if (!joined.ok) return joined;
      return changed(joined.value.state, joined.value.notices);
    }

    case 'hide':
    case 'show': {
      const incident = holderOf(state, action.sightingId);
      if (incident === undefined) return err('invalid_number', { field: 'sightingId' });
      const hidden = action.kind === 'hide';
      const held = incident.entries.find((e) => e.sighting.sightingId === action.sightingId);
      if (held?.hidden === hidden) return changed(state);
      const entries = incident.entries.map((e) => (e === held ? { ...e, hidden } : e));
      return changed(withIncident(state, { ...incident, entries }));
    }

    case 'markShared': {
      if (!validRecord(action.record)) return err('invalid_number', { field: 'record' });
      const incident = holderOf(state, action.sightingId);
      if (incident === undefined) return err('invalid_number', { field: 'sightingId' });
      const entries = incident.entries.map((e): SightingEntry =>
        e.sighting.sightingId === action.sightingId
          ? { ...e, shared: [...e.shared, action.record].slice(-MAX_SHARE_RECORDS) }
          : e,
      );
      return changed(withIncident(state, { ...incident, entries }));
    }

    case 'deleteSighting': {
      const incident = holderOf(state, action.sightingId);
      if (incident === undefined) return err('invalid_number', { field: 'sightingId' });
      return changed(
        withIncident(state, {
          ...incident,
          entries: incident.entries.filter((e) => e.sighting.sightingId !== action.sightingId),
          conflicts: incident.conflicts.filter((c) => c.sightingId !== action.sightingId),
        }),
      );
    }

    case 'deleteIncident': {
      if (!state.incidents.some((i) => i.incidentId === action.incidentId))
        return err('incident_unknown');
      return changed({
        incidents: state.incidents.filter((i) => i.incidentId !== action.incidentId),
        openIncidentId: state.openIncidentId === action.incidentId ? null : state.openIncidentId,
      });
    }

    case 'deleteAll':
      return changed({ incidents: [], openIncidentId: null });

    case 'expire': {
      if (!finite(action.nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
      const kept = state.incidents.filter(
        (i) => action.nowUtcMs - newestTimeUtcMs(i) <= parameters.incidentRetentionMs,
      );
      if (kept.length === state.incidents.length) return changed(state);
      const stillOpen = kept.some((i) => i.incidentId === state.openIncidentId);
      return changed({ incidents: kept, openIncidentId: stillOpen ? state.openIncidentId : null });
    }
  }
}
