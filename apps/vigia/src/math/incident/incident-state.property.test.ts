// P-4.7 (Req 4.7): any sequence of 0 to 200 actions on the Incident store (the join of Req 4.8
// among them) keeps the invariants I1 to I8, holds exactly the Sightings a reference model of the actions says, and survives a
// reload through the stored format.
//
// The reference model below is written here from the actions' definitions (design §7.4) and
// shares no code with the reducer: it works on plain maps of codes.

import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import {
  INCIDENT_POOL,
  actionsOf,
  clockAfter,
  storageActions,
} from '../../test-support/storage-actions';
import { invariants } from '../../test-support/incident-invariants';
import { NOW_UTC_MS, PARAMETERS } from '../../test-support/incident-fixtures';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { decodeSighting, encodeSighting } from '../code/sighting-code';
import { applyAction, type VigiaAction } from './apply-action';
import { incidentMode, isIncidentId } from './ids';
import { emptyState, type ShareRecord, type VigiaState } from './incident-state';
import { parseStoredState, serialiseState } from './storage-format';

// ---------------------------------------------------------------------------------------------
// The reference model.

interface ModelEntry {
  code: string;
  origin: 'local' | 'received';
  receivedUtcMs: number | null;
  hidden: boolean;
  shared: ShareRecord[];
  newestMs: number; // the Bearing time, read from the action's Sighting
}
interface ModelIncident {
  id: string;
  createdUtcMs: number;
  creation: 'created' | 'joined';
  /** The former ids (design §7.4a): the ids merged into this Incident by a join. */
  former: Set<string>;
  entries: Map<string, ModelEntry>;
  conflicts: { sightingId: string; heldCode: string; otherCode: string }[];
}
interface Model {
  incidents: ModelIncident[];
  open: string | null;
}

type Verdict = { ok: true } | { ok: false; reason: string };

const cloneModel = (m: Model): Model => ({
  open: m.open,
  incidents: m.incidents.map((i) => ({
    ...i,
    former: new Set(i.former),
    entries: new Map([...i.entries].map(([k, e]) => [k, { ...e, shared: [...e.shared] }])),
    conflicts: [...i.conflicts],
  })),
});

/** Applies a Sighting to an Incident of the model; the verdict says why it was refused. */
function modelMerge(
  incident: ModelIncident,
  sightingId: string,
  code: string,
  origin: 'local' | 'received',
  receivedUtcMs: number | null,
  newestMs: number,
): Verdict {
  const held = incident.entries.get(sightingId);
  if (held !== undefined) {
    if (
      held.code !== code &&
      !incident.conflicts.some((c) => c.sightingId === sightingId && c.otherCode === code)
    ) {
      incident.conflicts.push({ sightingId, heldCode: held.code, otherCode: code });
    }
    return { ok: true };
  }
  if (incident.entries.size >= PARAMETERS.maxSightingsPerIncident)
    return { ok: false, reason: 'incident_full' };
  incident.entries.set(sightingId, {
    code,
    origin,
    receivedUtcMs,
    hidden: false,
    shared: [],
    newestMs,
  });
  return { ok: true };
}

function modelApply(model: Model, action: VigiaAction): { model: Model; verdict: Verdict } {
  const next = cloneModel(model);
  const fail = (reason: string) => ({ model, verdict: { ok: false, reason } as Verdict });
  const ok = () => ({ model: next, verdict: { ok: true } as Verdict });
  const incidentOf = (id: string) => next.incidents.find((i) => i.id === id);
  /** The Incident whose id or a former id is `id` (design §7.4a). */
  const holding = (id: string) => next.incidents.find((i) => i.id === id || i.former.has(id));
  const holder = (sightingId: string) => next.incidents.find((i) => i.entries.has(sightingId));
  switch (action.kind) {
    case 'createIncident': {
      if (!isIncidentId(action.incidentId) || holding(action.incidentId) !== undefined) {
        return fail('invalid_number');
      }
      next.incidents.push({
        id: action.incidentId,
        createdUtcMs: action.nowUtcMs,
        creation: 'created',
        former: new Set(),
        entries: new Map(),
        conflicts: [],
      });
      next.open = action.incidentId;
      return ok();
    }
    case 'openIncident':
      if (incidentOf(action.incidentId) === undefined) return fail('incident_unknown');
      next.open = action.incidentId;
      return ok();
    case 'addLocal': {
      const incident = next.open === null ? undefined : incidentOf(next.open);
      if (incident === undefined || incident.id !== action.sighting.incidentId)
        return fail('incident_unknown');
      const verdict = modelMerge(
        incident,
        action.sighting.sightingId,
        action.code,
        'local',
        null,
        action.sighting.bearing.timeUtcMs,
      );
      return verdict.ok ? ok() : fail(verdict.reason);
    }
    case 'addReceived': {
      let incident = holding(action.item.sighting.incidentId);
      if (incident === undefined) {
        if (!action.joinIfUnknown) return fail('incident_unknown');
        incident = {
          id: action.item.sighting.incidentId,
          createdUtcMs: action.nowUtcMs,
          creation: 'joined',
          former: new Set(),
          entries: new Map(),
          conflicts: [],
        };
        next.incidents.push(incident);
        next.open = incident.id;
      }
      const verdict = modelMerge(
        incident,
        action.item.sighting.sightingId,
        relabelCode(action.item.code, incident.id),
        'received',
        action.nowUtcMs,
        action.item.sighting.bearing.timeUtcMs,
      );
      return verdict.ok ? ok() : fail(verdict.reason);
    }
    case 'joinIncident': {
      if (!Number.isFinite(action.nowUtcMs)) return fail('invalid_number');
      const open = next.open === null ? undefined : incidentOf(next.open);
      if (open === undefined) return fail('incident_unknown');
      const other = action.item.sighting.incidentId;
      if (holding(other) !== undefined) return fail('invalid_number');
      if (incidentMode(open.id) !== incidentMode(other)) return fail('incident_not_joinable');
      const survivor = open.id < other ? open.id : other;
      const former = new Set([...open.former, open.id, other]);
      former.delete(survivor);
      if (former.size > PARAMETERS.maxFormerIncidentIds) return fail('incident_not_joinable');
      const joined: ModelIncident = {
        id: survivor,
        createdUtcMs: Math.min(open.createdUtcMs, action.nowUtcMs),
        creation: survivor === open.id ? open.creation : 'joined',
        former,
        entries: new Map(
          [...open.entries].map(([k, e]) => [k, { ...e, code: relabelCode(e.code, survivor) }]),
        ),
        conflicts: open.conflicts.map((c) => ({
          sightingId: c.sightingId,
          heldCode: relabelCode(c.heldCode, survivor),
          otherCode: relabelCode(c.otherCode, survivor),
        })),
      };
      const verdict = modelMerge(
        joined,
        action.item.sighting.sightingId,
        relabelCode(action.item.code, survivor),
        'received',
        action.nowUtcMs,
        action.item.sighting.bearing.timeUtcMs,
      );
      if (!verdict.ok) return fail(verdict.reason);
      next.incidents = next.incidents.map((i) => (i.id === open.id ? joined : i));
      next.open = survivor;
      return ok();
    }
    case 'hide':
    case 'show':
    case 'deleteSighting':
    case 'markShared': {
      const incident = holder(action.sightingId);
      const entry = incident?.entries.get(action.sightingId);
      if (incident === undefined || entry === undefined) return fail('invalid_number');
      if (action.kind === 'hide') entry.hidden = true;
      else if (action.kind === 'show') entry.hidden = false;
      else if (action.kind === 'markShared')
        entry.shared = [...entry.shared, action.record].slice(-20);
      else {
        incident.entries.delete(action.sightingId);
        incident.conflicts = incident.conflicts.filter((c) => c.sightingId !== action.sightingId);
      }
      return ok();
    }
    case 'deleteIncident':
      if (incidentOf(action.incidentId) === undefined) return fail('incident_unknown');
      next.incidents = next.incidents.filter((i) => i.id !== action.incidentId);
      if (next.open === action.incidentId) next.open = null;
      return ok();
    case 'deleteAll':
      return { model: { incidents: [], open: null }, verdict: { ok: true } };
    case 'expire': {
      const expired = (i: ModelIncident) => {
        const newest = [...i.entries.values()].reduce((m, e) => Math.max(m, e.newestMs), -Infinity);
        const reference = i.entries.size === 0 ? i.createdUtcMs : newest;
        return action.nowUtcMs - reference > PARAMETERS.incidentRetentionMs;
      };
      next.incidents = next.incidents.filter((i) => !expired(i));
      if (next.open !== null && incidentOf(next.open) === undefined) next.open = null;
      return ok();
    }
    case 'replace':
      return fail('not modelled');
  }
}

/**
 * The code of a Sighting under another Incident id: decoded, the id replaced, encoded again. The
 * model's own copy of the relabelling of design §7.4a, written from its definition.
 */
function relabelCode(code: string, incidentId: string): string {
  const decoded = decodeSighting(code, PARAMETERS);
  if (!decoded.ok) throw new Error(`model: a code that does not decode (${decoded.reason})`);
  const encoded = encodeSighting({ ...decoded.value, incidentId });
  if (!encoded.ok) throw new Error(`model: a code that does not encode (${encoded.reason})`);
  return encoded.value;
}

/** The model after a reload: the Simulation Incidents are not written (design D4). */
function modelReload(model: Model): Model {
  const next = cloneModel(model);
  next.incidents = next.incidents.filter((i) => incidentMode(i.id) === 'device');
  if (next.open !== null && !next.incidents.some((i) => i.id === next.open)) next.open = null;
  return next;
}

/** The state of the reducer as the model's shape, to compare the two. */
function projection(state: VigiaState): unknown {
  return {
    open: state.openIncidentId,
    incidents: state.incidents.map((i) => ({
      id: i.incidentId,
      createdUtcMs: i.createdUtcMs,
      creation: i.creation,
      formerIds: i.formerIds,
      entries: i.entries.map((e) => ({
        id: e.sighting.sightingId,
        code: e.code,
        origin: e.sighting.origin,
        receivedUtcMs: e.sighting.receivedUtcMs,
        hidden: e.hidden,
        shared: e.shared,
      })),
      conflicts: i.conflicts,
    })),
  };
}
function modelProjection(model: Model): unknown {
  return {
    open: model.open,
    incidents: model.incidents.map((i) => ({
      id: i.id,
      createdUtcMs: i.createdUtcMs,
      creation: i.creation,
      formerIds: [...i.former].sort(),
      entries: [...i.entries]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([id, e]) => ({
          id,
          code: e.code,
          origin: e.origin,
          receivedUtcMs: e.receivedUtcMs,
          hidden: e.hidden,
          shared: e.shared,
        })),
      conflicts: i.conflicts,
    })),
  };
}

describe('P-4.7: the Incident store (Req 4.7)', () => {
  // Generator: `storageActions`: 0 to 200 steps among create, join, joinSame (the action
  // `joinIncident`, design §7.4a), capture, receive (the same
  // code again, and a different code under the same id, among them), hide, show, delete,
  // share, deleteIncident, deleteAll, expire (the clock moves 0 to 40 hours) and reload, over a
  // pool of 4 device Incident ids and one Simulation id and 40 Sighting numbers. Excludes what
  // is not an action of the store. Reload is read with the clock at the oldest Incident's newest
  // Sighting, so that retention on load removes nothing: it is covered by its own examples.
  it('keeps I1 to I7, holds what the model says, and a reload gives an equal state with nothing dropped', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-4.7',
      fc.property(storageActions(), (steps) => {
        let state = emptyState();
        let model: Model = { incidents: [], open: null };
        let nowUtcMs = NOW_UTC_MS;
        steps.forEach((step, index) => {
          const where = `step ${index} ${JSON.stringify(step)}`;
          if (step.kind === 'reload') {
            const text = serialiseState(state, nowUtcMs);
            const newest = state.incidents
              .filter((i) => incidentMode(i.incidentId) === 'device')
              // Retention goes by the newest Sighting's Bearing time, or by the creation time of
              // an empty Incident (design §7.4): the clock of the load is the oldest of them.
              .map((i) =>
                i.entries.length === 0
                  ? i.createdUtcMs
                  : Math.max(...i.entries.map((e) => e.sighting.bearing.timeUtcMs)),
              );
            const parseNow = newest.length === 0 ? nowUtcMs : Math.min(...newest);
            const parsed = parseStoredState(text, parseNow, PARAMETERS);
            if (!parsed.ok || parsed.value.kind !== 'loaded')
              throw new Error(`${where}: not loaded`);
            if (parsed.value.dropped !== 0)
              throw new Error(`${where}: dropped ${parsed.value.dropped}`);
            const replaced = applyAction(
              state,
              { kind: 'replace', state: parsed.value.state },
              PARAMETERS,
            );
            if (!replaced.ok) throw new Error(`${where}: replace failed ${replaced.reason}`);
            if (replaced.value.notices.length !== 0) throw new Error(`${where}: replace noticed`);
            state = replaced.value.state;
            model = modelReload(model);
          } else {
            const actions = actionsOf(step, state, nowUtcMs);
            if (actions === null) throw new Error('no action');
            for (const action of actions) {
              const expected = modelApply(model, action);
              const result = applyAction(state, action, PARAMETERS);
              if (expected.verdict.ok !== result.ok) {
                throw new Error(
                  `${where}: reducer ${result.ok ? 'accepted' : result.reason}, model ${JSON.stringify(expected.verdict)}`,
                );
              }
              if (!result.ok) {
                if (!expected.verdict.ok && result.reason !== expected.verdict.reason) {
                  throw new Error(
                    `${where}: reducer says ${result.reason}, model ${expected.verdict.reason}`,
                  );
                }
              } else {
                state = result.value.state;
                model = expected.model;
              }
            }
            nowUtcMs = clockAfter(step, nowUtcMs);
          }
          const problems = invariants(state, PARAMETERS);
          if (problems.length > 0) throw new Error(`${where}: ${problems.join('; ')}`);
          // The reach of the property: the largest Incident and the longest list of share records.
          for (const incident of state.incidents) {
            tracker.record('largest Incident (entries)', incident.entries.length, '32');
            tracker.record('conflicts of one Incident', incident.conflicts.length, 'none');
            tracker.record('former ids of one Incident', incident.formerIds.length, '16');
            for (const entry of incident.entries) {
              tracker.record('share records of one entry', entry.shared.length, '20');
            }
          }
          const got = JSON.stringify(projection(state));
          const want = JSON.stringify(modelProjection(model));
          if (got !== want) throw new Error(`${where}: state differs\n got  ${got}\n want ${want}`);
        });
        // The Sightings held, counted: never two with one id in an Incident, never more than 32.
        for (const incident of state.incidents) {
          const ids = incident.entries.map((e) => e.sighting.sightingId);
          if (new Set(ids).size !== ids.length || ids.length > PARAMETERS.maxSightingsPerIncident) {
            throw new Error('duplicate or too many');
          }
        }
        void INCIDENT_POOL;
      }),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
  });
});
