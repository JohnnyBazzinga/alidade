import { describe, expect, it } from 'vitest';
import {
  canonicalOf,
  INCIDENT_ID,
  NOW_UTC_MS,
  PARAMETERS,
  SIMULATION_INCIDENT_ID,
  sightingIdOf,
} from '../../test-support/incident-fixtures';
import { invariants } from '../../test-support/incident-invariants';
import { applyAction, type VigiaAction } from './apply-action';
import { emptyState, type InboxItem, type VigiaState } from './incident-state';

function run(state: VigiaState, action: VigiaAction) {
  return applyAction(state, action, PARAMETERS);
}
function ran(state: VigiaState, action: VigiaAction): VigiaState {
  const result = run(state, action);
  if (!result.ok) throw new Error(`${action.kind} failed: ${result.reason} ${result.field ?? ''}`);
  expect(invariants(result.value.state, PARAMETERS), action.kind).toEqual([]);
  return result.value.state;
}
const failure = (state: VigiaState, action: VigiaAction) => {
  const result = run(state, action);
  return result.ok ? null : result;
};

const created = (id = INCIDENT_ID, now = NOW_UTC_MS) =>
  ran(emptyState(), { kind: 'createIncident', incidentId: id, nowUtcMs: now });
const addLocal = (state: VigiaState, n: number, incidentId = INCIDENT_ID) => {
  const { sighting, code } = canonicalOf(n, incidentId);
  return ran(state, { kind: 'addLocal', sighting, code, nowUtcMs: NOW_UTC_MS });
};
const itemOf = (n: number, incidentId = INCIDENT_ID, change = {}): InboxItem => {
  const { sighting, code } = canonicalOf(n, incidentId, change, 'received');
  return { code, sighting: { ...sighting, receivedUtcMs: null }, arrivedUtcMs: NOW_UTC_MS };
};

describe('emptyState', () => {
  it('has no Incident and none open', () => {
    expect(emptyState()).toEqual({ incidents: [], openIncidentId: null });
  });
});

describe('createIncident (design §7.4)', () => {
  it('adds an empty Incident created here, at the time given, and opens it', () => {
    const state = created();
    expect(state.openIncidentId).toBe(INCIDENT_ID);
    expect(state.incidents).toEqual([
      {
        incidentId: INCIDENT_ID,
        createdUtcMs: NOW_UTC_MS,
        creation: 'created',
        formerIds: [],
        entries: [],
        conflicts: [],
      },
    ]);
  });

  it('opens the new Incident when another is open, and keeps the older one', () => {
    const second = ran(created(), {
      kind: 'createIncident',
      incidentId: 'C222222222',
      nowUtcMs: NOW_UTC_MS + 1,
    });
    expect(second.openIncidentId).toBe('C222222222');
    expect(second.incidents.map((i) => i.incidentId)).toEqual([INCIDENT_ID, 'C222222222']);
  });

  it('fails with invalid_number naming incidentId for an id that is not ten symbols or is in use', () => {
    for (const bad of ['', 'K7PQ3MWXA', 'k7pq3mwxa2', 'K7PQ3MWXA0', 'K7PQ3MWXA22']) {
      expect(
        failure(emptyState(), { kind: 'createIncident', incidentId: bad, nowUtcMs: 1 }),
      ).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'incidentId',
      });
    }
    expect(
      failure(created(), { kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: 1 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'incidentId',
    });
  });

  it('fails with invalid_number naming nowUtcMs for a time that is not finite', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(
        failure(emptyState(), { kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: bad }),
      ).toEqual({ ok: false, reason: 'invalid_number', field: 'nowUtcMs' });
    }
  });
});

describe('openIncident', () => {
  it('opens a held Incident and fails with incident_unknown for another', () => {
    const state = ran(created(), { kind: 'createIncident', incidentId: 'C222222222', nowUtcMs: 5 });
    expect(ran(state, { kind: 'openIncident', incidentId: INCIDENT_ID }).openIncidentId).toBe(
      INCIDENT_ID,
    );
    expect(failure(state, { kind: 'openIncident', incidentId: 'D222222222' })).toEqual({
      ok: false,
      reason: 'incident_unknown',
    });
  });
});

describe('addLocal', () => {
  it('adds the Sighting as a local entry of the open Incident', () => {
    const state = addLocal(created(), 1);
    const entry = state.incidents[0]?.entries[0];
    expect(entry?.sighting.origin).toBe('local');
    expect(entry?.sighting.receivedUtcMs).toBeNull();
    expect(entry?.code).toBe(canonicalOf(1).code);
    expect(entry?.hidden).toBe(false);
    expect(entry?.shared).toEqual([]);
  });

  it('fails with incident_unknown when the Sighting is not of the open Incident, or none is open', () => {
    const { sighting, code } = canonicalOf(1, 'C222222222');
    expect(failure(created(), { kind: 'addLocal', sighting, code, nowUtcMs: 1 })).toEqual({
      ok: false,
      reason: 'incident_unknown',
    });
    const mine = canonicalOf(1);
    const closed: VigiaState = { ...created(), openIncidentId: null };
    expect(
      failure(closed, { kind: 'addLocal', sighting: mine.sighting, code: mine.code, nowUtcMs: 1 }),
    ).toEqual({ ok: false, reason: 'incident_unknown' });
  });

  it('fails with invalid_number naming code for a code that is not the Sighting\u2019s', () => {
    const { sighting } = canonicalOf(1);
    expect(
      failure(created(), { kind: 'addLocal', sighting, code: canonicalOf(2).code, nowUtcMs: 1 }),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'code' });
  });

  it('is incident_full at the 33rd and says nothing else changed', () => {
    let state = created();
    for (let n = 1; n <= 32; n += 1) state = addLocal(state, n);
    const { sighting, code } = canonicalOf(33);
    expect(failure(state, { kind: 'addLocal', sighting, code, nowUtcMs: 1 })).toEqual({
      ok: false,
      reason: 'incident_full',
    });
  });

  it('the same Sighting twice returns the same state object', () => {
    const state = addLocal(created(), 1);
    const { sighting, code } = canonicalOf(1);
    const result = run(state, { kind: 'addLocal', sighting, code, nowUtcMs: NOW_UTC_MS + 1 });
    expect(result.ok && result.value.state).toBe(state);
  });
});

describe('addReceived (Req 4.2, 9.4, 9.5)', () => {
  it('adds to the known Incident as a received entry stamped with the time of the act', () => {
    const state = ran(created(), {
      kind: 'addReceived',
      item: itemOf(1),
      nowUtcMs: NOW_UTC_MS + 5_000,
      joinIfUnknown: false,
    });
    const entry = state.incidents[0]?.entries[0];
    expect(entry?.sighting.origin).toBe('received');
    expect(entry?.sighting.receivedUtcMs).toBe(NOW_UTC_MS + 5_000);
  });

  it('into an unknown Incident without joinIfUnknown is incident_unknown, and nothing is created', () => {
    const result = failure(created(), {
      kind: 'addReceived',
      item: itemOf(1, 'C222222222'),
      nowUtcMs: 1,
      joinIfUnknown: false,
    });
    expect(result).toEqual({ ok: false, reason: 'incident_unknown' });
  });

  it('into an unknown Incident with joinIfUnknown creates a joined Incident at the time of the act, and opens it', () => {
    const state = ran(created(), {
      kind: 'addReceived',
      item: itemOf(1, 'C222222222'),
      nowUtcMs: NOW_UTC_MS + 9,
      joinIfUnknown: true,
    });
    expect(state.openIncidentId).toBe('C222222222');
    expect(state.incidents.map((i) => i.incidentId)).toEqual([INCIDENT_ID, 'C222222222']);
    const joined = state.incidents[1];
    expect(joined?.creation).toBe('joined');
    expect(joined?.createdUtcMs).toBe(NOW_UTC_MS + 9);
    expect(joined?.entries).toHaveLength(1);
  });

  it('does not open a known Incident that is not the open one', () => {
    const base = ran(created(), { kind: 'createIncident', incidentId: 'C222222222', nowUtcMs: 5 });
    const state = ran(base, {
      kind: 'addReceived',
      item: itemOf(1),
      nowUtcMs: 6,
      joinIfUnknown: false,
    });
    expect(state.openIncidentId).toBe('C222222222');
  });

  it('a duplicate keeps receivedUtcMs, hidden and shared, and returns the same object', () => {
    let state = ran(created(), {
      kind: 'addReceived',
      item: itemOf(1),
      nowUtcMs: 100,
      joinIfUnknown: false,
    });
    state = ran(state, { kind: 'hide', sightingId: sightingIdOf(1) });
    state = ran(state, {
      kind: 'markShared',
      sightingId: sightingIdOf(1),
      record: { channel: 'text', atUtcMs: 7 },
    });
    const again = run(state, {
      kind: 'addReceived',
      item: itemOf(1),
      nowUtcMs: 999_999,
      joinIfUnknown: false,
    });
    expect(again.ok && again.value.state).toBe(state);
    expect(again.ok && again.value.notices).toEqual([]);
    const entry = state.incidents[0]?.entries[0];
    expect(entry?.sighting.receivedUtcMs).toBe(100);
    expect(entry?.hidden).toBe(true);
    expect(entry?.shared).toEqual([{ channel: 'text', atUtcMs: 7 }]);
  });

  it('a conflict keeps the held entry, records both codes and carries the notice', () => {
    const held = ran(created(), {
      kind: 'addReceived',
      item: itemOf(1),
      nowUtcMs: 1,
      joinIfUnknown: false,
    });
    const other = itemOf(1, INCIDENT_ID, { azimuthRad: 2.5 });
    const result = run(held, {
      kind: 'addReceived',
      item: other,
      nowUtcMs: 2,
      joinIfUnknown: false,
    });
    if (!result.ok) throw new Error('failed');
    expect(result.value.notices).toEqual([{ reason: 'sighting_conflict', id: sightingIdOf(1) }]);
    const incident = result.value.state.incidents[0];
    expect(incident?.entries).toEqual(held.incidents[0]?.entries);
    expect(incident?.conflicts).toEqual([
      { sightingId: sightingIdOf(1), heldCode: itemOf(1).code, otherCode: other.code },
    ]);
    expect(invariants(result.value.state, PARAMETERS)).toEqual([]);
  });

  it('is incident_full for the 33rd entry, also of a joined Incident', () => {
    let state = created();
    for (let n = 1; n <= 32; n += 1) {
      state = ran(state, {
        kind: 'addReceived',
        item: itemOf(n),
        nowUtcMs: 1,
        joinIfUnknown: false,
      });
    }
    expect(
      failure(state, { kind: 'addReceived', item: itemOf(33), nowUtcMs: 1, joinIfUnknown: false }),
    ).toEqual({ ok: false, reason: 'incident_full' });
  });

  it('fails with invalid_number naming code for an item whose code is not its Sighting\u2019s', () => {
    const item: InboxItem = { ...itemOf(1), code: itemOf(2).code };
    expect(
      failure(created(), { kind: 'addReceived', item, nowUtcMs: 1, joinIfUnknown: false }),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'code' });
  });
});

describe('hide, show, deleteSighting and markShared (design §7.4)', () => {
  const two = () => addLocal(addLocal(created(), 1), 2);
  const entryOf = (state: VigiaState, n: number) =>
    state.incidents[0]?.entries.find((e) => e.sighting.sightingId === sightingIdOf(n));

  it('hide and show set the flag of the one entry and nothing else', () => {
    const hidden = ran(two(), { kind: 'hide', sightingId: sightingIdOf(1) });
    expect(entryOf(hidden, 1)?.hidden).toBe(true);
    expect(entryOf(hidden, 2)?.hidden).toBe(false);
    const shown = ran(hidden, { kind: 'show', sightingId: sightingIdOf(1) });
    expect(shown).toEqual(two());
  });

  it('hiding a hidden Sighting returns the same state', () => {
    const hidden = ran(two(), { kind: 'hide', sightingId: sightingIdOf(1) });
    const again = run(hidden, { kind: 'hide', sightingId: sightingIdOf(1) });
    expect(again.ok && again.value.state).toBe(hidden);
  });

  it('deleteSighting removes the entry and its conflicts, and the Incident stays', () => {
    let state = ran(created(), {
      kind: 'addReceived',
      item: itemOf(1),
      nowUtcMs: 1,
      joinIfUnknown: false,
    });
    state = ran(state, {
      kind: 'addReceived',
      item: itemOf(1, INCIDENT_ID, { azimuthRad: 2.5 }),
      nowUtcMs: 2,
      joinIfUnknown: false,
    });
    expect(state.incidents[0]?.conflicts).toHaveLength(1);
    const after = ran(state, { kind: 'deleteSighting', sightingId: sightingIdOf(1) });
    expect(after.incidents[0]?.entries).toEqual([]);
    expect(after.incidents[0]?.conflicts).toEqual([]);
    expect(after.incidents).toHaveLength(1);
  });

  it('markShared appends a record and keeps the last 20', () => {
    let state = two();
    for (let i = 0; i < 25; i += 1) {
      state = ran(state, {
        kind: 'markShared',
        sightingId: sightingIdOf(1),
        record: { channel: i % 2 === 0 ? 'link' : 'qr', atUtcMs: 1000 + i },
      });
    }
    const shared = entryOf(state, 1)?.shared ?? [];
    expect(shared).toHaveLength(20);
    expect(shared.map((r) => r.atUtcMs)).toEqual(Array.from({ length: 20 }, (_, i) => 1005 + i));
    expect(entryOf(state, 2)?.shared).toEqual([]);
  });

  it('fails with invalid_number naming sightingId for an id no Incident holds', () => {
    for (const action of [
      { kind: 'hide', sightingId: sightingIdOf(9) },
      { kind: 'show', sightingId: sightingIdOf(9) },
      { kind: 'deleteSighting', sightingId: sightingIdOf(9) },
      { kind: 'markShared', sightingId: sightingIdOf(9), record: { channel: 'text', atUtcMs: 1 } },
    ] as const) {
      expect(failure(two(), action), action.kind).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'sightingId',
      });
    }
  });

  it('markShared fails with invalid_number naming record for a time that is not finite', () => {
    expect(
      failure(two(), {
        kind: 'markShared',
        sightingId: sightingIdOf(1),
        record: { channel: 'text', atUtcMs: Number.NaN },
      }),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'record' });
  });

  it('finds the entry in any Incident, not only the open one', () => {
    const state = ran(two(), { kind: 'createIncident', incidentId: 'C222222222', nowUtcMs: 9 });
    expect(state.openIncidentId).toBe('C222222222');
    const hidden = ran(state, { kind: 'hide', sightingId: sightingIdOf(1) });
    expect(
      hidden.incidents[0]?.entries.find((e) => e.sighting.sightingId === sightingIdOf(1))?.hidden,
    ).toBe(true);
  });
});

describe('deleteIncident and deleteAll (Req 4.5)', () => {
  it('deleting the open Incident makes openIncidentId null', () => {
    const state = addLocal(created(), 1);
    const after = ran(state, { kind: 'deleteIncident', incidentId: INCIDENT_ID });
    expect(after).toEqual(emptyState());
  });

  it('deleting another Incident keeps the open one open', () => {
    const state = ran(created(), { kind: 'createIncident', incidentId: 'C222222222', nowUtcMs: 5 });
    const after = ran(state, { kind: 'deleteIncident', incidentId: INCIDENT_ID });
    expect(after.openIncidentId).toBe('C222222222');
    expect(after.incidents.map((i) => i.incidentId)).toEqual(['C222222222']);
  });

  it('fails with incident_unknown for an Incident that is not held', () => {
    expect(failure(created(), { kind: 'deleteIncident', incidentId: 'C222222222' })).toEqual({
      ok: false,
      reason: 'incident_unknown',
    });
  });

  it('deleteAll leaves the empty state, also from the empty state', () => {
    const state = addLocal(created(), 1);
    expect(ran(state, { kind: 'deleteAll' })).toEqual(emptyState());
    expect(ran(emptyState(), { kind: 'deleteAll' })).toEqual(emptyState());
  });
});

describe('expire (Req 4.5): the boundary, in milliseconds', () => {
  const retention = PARAMETERS.incidentRetentionMs;

  it('keeps an Incident whose newest Sighting is exactly the retention old, and removes it one millisecond later', () => {
    const state = addLocal(created(), 1);
    const newest = state.incidents[0]?.entries[0]?.sighting.bearing.timeUtcMs ?? 0;
    expect(ran(state, { kind: 'expire', nowUtcMs: newest + retention })).toBe(state);
    expect(ran(state, { kind: 'expire', nowUtcMs: newest + retention + 1 })).toEqual(emptyState());
  });

  it('measures from the newest Sighting\u2019s Bearing time, not from the creation or the receive time', () => {
    let state = created(INCIDENT_ID, NOW_UTC_MS);
    state = addLocal(state, 1);
    state = addLocal(state, 5);
    const times = state.incidents[0]?.entries.map((e) => e.sighting.bearing.timeUtcMs) ?? [];
    const newest = Math.max(...times);
    expect(ran(state, { kind: 'expire', nowUtcMs: newest + retention })).toBe(state);
    expect(ran(state, { kind: 'expire', nowUtcMs: newest + retention + 1 }).incidents).toHaveLength(
      0,
    );
  });

  it('measures an empty Incident from its creation time', () => {
    const state = created(INCIDENT_ID, 1_000);
    expect(ran(state, { kind: 'expire', nowUtcMs: 1_000 + retention })).toBe(state);
    expect(ran(state, { kind: 'expire', nowUtcMs: 1_000 + retention + 1 })).toEqual(emptyState());
  });

  it('removes only the old Incident, keeps the open one open and sets it to null when it is removed', () => {
    let state = created(INCIDENT_ID, 1_000);
    state = ran(state, {
      kind: 'createIncident',
      incidentId: 'C222222222',
      nowUtcMs: 1_000 + retention,
    });
    const mid = ran(state, { kind: 'expire', nowUtcMs: 1_000 + retention + 1 });
    expect(mid.incidents.map((i) => i.incidentId)).toEqual(['C222222222']);
    expect(mid.openIncidentId).toBe('C222222222');
    const first = ran(
      { ...state, openIncidentId: INCIDENT_ID },
      { kind: 'expire', nowUtcMs: 1_000 + retention + 1 },
    );
    expect(first.openIncidentId).toBeNull();
  });

  it('fails with invalid_number naming nowUtcMs for a time that is not finite', () => {
    expect(failure(created(), { kind: 'expire', nowUtcMs: Number.NaN })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'nowUtcMs',
    });
  });
});

describe('replace (design §7.4)', () => {
  it('takes a good state as it is', () => {
    const state = addLocal(created(), 1);
    expect(ran(emptyState(), { kind: 'replace', state })).toEqual(state);
  });

  it('drops what violates the invariants and says how much, with the notice storage_corrupt', () => {
    const good = addLocal(created(), 1);
    const incident = good.incidents[0];
    if (incident === undefined) throw new Error('no incident');
    const entry = incident.entries[0];
    if (entry === undefined) throw new Error('no entry');
    const wrongIncident = { ...entry, sighting: { ...entry.sighting, incidentId: 'C222222222' } };
    const wrongCode = { ...entry, code: canonicalOf(2).code };
    const bad: VigiaState = {
      incidents: [
        { ...incident, entries: [entry, entry, wrongIncident, wrongCode] },
        incident,
        { ...incident, incidentId: 'not-an-id' },
      ],
      openIncidentId: 'D222222222',
    };
    const result = run(emptyState(), { kind: 'replace', state: bad });
    if (!result.ok) throw new Error('failed');
    expect(invariants(result.value.state, PARAMETERS)).toEqual([]);
    expect(result.value.state.incidents).toHaveLength(1);
    expect(result.value.state.incidents[0]?.entries).toHaveLength(1);
    expect(result.value.state.openIncidentId).toBeNull();
    // Dropped: three entries of the first Incident (a repeated id, an entry of another Incident, a
    // code that is not the entry's), and each of the two Incidents that is dropped whole counts
    // itself and the entry it held (a repeated Incident id; an id that is not one): 3 + 2 + 2.
    expect(result.value.notices).toEqual([{ reason: 'storage_corrupt', count: 7 }]);
  });
});

describe('every action, with a state or a time that is not finite (Req 2.1)', () => {
  it('fails with invalid_number naming state for a state that carries a number that is not finite', () => {
    const good = addLocal(created(), 1);
    const incident = good.incidents[0];
    if (incident === undefined) throw new Error('no incident');
    const bad: VigiaState = { ...good, incidents: [{ ...incident, createdUtcMs: Number.NaN }] };
    for (const action of [
      { kind: 'hide', sightingId: sightingIdOf(1) },
      { kind: 'expire', nowUtcMs: 1 },
      { kind: 'deleteAll' },
    ] as const) {
      expect(failure(bad, action), action.kind).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'state',
      });
    }
  });

  it('names the parameter that is not valid', () => {
    expect(
      applyAction(emptyState(), { kind: 'deleteAll' }, { ...PARAMETERS, adviceMinDistanceM: 0 }),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'adviceMinDistanceM' });
  });
});

describe('simulated Incidents are handled like the others by the reducer', () => {
  it('can create, add to and delete an Incident whose id says Simulation', () => {
    let state = created(SIMULATION_INCIDENT_ID);
    state = addLocal(state, 1, SIMULATION_INCIDENT_ID);
    expect(state.incidents[0]?.entries).toHaveLength(1);
    expect(ran(state, { kind: 'deleteIncident', incidentId: SIMULATION_INCIDENT_ID })).toEqual(
      emptyState(),
    );
  });
});
