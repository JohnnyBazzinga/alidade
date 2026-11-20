// Joining two smokes (design §7.4a; Req 4.7 to 4.9): the action `joinIncident`, the former ids, and
// a code of a former id. Every Incident id here is synthetic. In the order of the alphabet:
// `C222222222` < `D4N8RTY5CM` < `H7PQ3MWXAB` < `K7PQ3MWXA2` (the digits 2 to 9 come first).

import { describe, expect, it } from 'vitest';
import { encodeSighting } from '../code/sighting-code';
import {
  canonicalOf,
  NOW_UTC_MS,
  PARAMETERS,
  SIMULATION_INCIDENT_ID,
  sightingIdOf,
} from '../../test-support/incident-fixtures';
import { invariants } from '../../test-support/incident-invariants';
import { applyAction, type VigiaAction } from './apply-action';
import { relabelItem } from './join';
import {
  emptyState,
  incidentHolding,
  type InboxItem,
  type Incident,
  type VigiaState,
} from './incident-state';

const SMALL = 'C222222222';
const MIDDLE = 'D4N8RTY5CM';
const LARGE = 'K7PQ3MWXA2';

function ran(state: VigiaState, action: VigiaAction): VigiaState {
  const result = applyAction(state, action, PARAMETERS);
  if (!result.ok) throw new Error(`${action.kind}: ${result.reason} ${result.field ?? ''}`);
  expect(invariants(result.value.state, PARAMETERS), action.kind).toEqual([]);
  return result.value.state;
}
const failure = (state: VigiaState, action: VigiaAction) => {
  const result = applyAction(state, action, PARAMETERS);
  return result.ok ? null : result;
};

const created = (id: string) =>
  ran(emptyState(), { kind: 'createIncident', incidentId: id, nowUtcMs: NOW_UTC_MS });
const addLocal = (state: VigiaState, n: number, incidentId: string) => {
  const { sighting, code } = canonicalOf(n, incidentId);
  return ran(state, { kind: 'addLocal', sighting, code, nowUtcMs: NOW_UTC_MS });
};
const itemOf = (n: number, incidentId: string, change = {}): InboxItem => {
  const { sighting, code } = canonicalOf(n, incidentId, change, 'received');
  return { code, sighting: { ...sighting, receivedUtcMs: null }, arrivedUtcMs: NOW_UTC_MS };
};
const join = (item: InboxItem, nowUtcMs = NOW_UTC_MS + 5000): VigiaAction => ({
  kind: 'joinIncident',
  item,
  nowUtcMs,
});
const only = (state: VigiaState): Incident => {
  const [incident] = state.incidents;
  if (incident === undefined || state.incidents.length !== 1) throw new Error('not one Incident');
  return incident;
};

/** A phone with its own Incident `id` holding Sightings `numbers`. */
function phone(id: string, ...numbers: number[]): VigiaState {
  return numbers.reduce((state, n) => addLocal(state, n, id), created(id));
}

describe('joinIncident: the smaller id survives', () => {
  it('takes the id of the code when it is the smaller, and keeps the open one as a former id', () => {
    const state = ran(phone(LARGE, 1, 2), join(itemOf(7, SMALL)));
    const incident = only(state);
    expect(incident.incidentId).toBe(SMALL);
    expect(incident.formerIds).toEqual([LARGE]);
    expect(state.openIncidentId).toBe(SMALL);
    expect(incident.entries.map((e) => e.sighting.sightingId)).toEqual([1, 2, 7].map(sightingIdOf));
  });

  it('keeps its own id when it is the smaller, and the code’s id becomes a former id', () => {
    const state = ran(phone(SMALL, 1), join(itemOf(7, LARGE)));
    const incident = only(state);
    expect(incident.incidentId).toBe(SMALL);
    expect(incident.formerIds).toEqual([LARGE]);
    expect(incident.creation).toBe('created');
  });

  it('takes the smaller of two ids that differ only in the last symbol, and only in the order of the alphabet', () => {
    // `2` < `9` < `A` < `Z` in code units, which is the alphabet's order (design §7.4a, step 5).
    const low = 'K7PQ3MWXA2';
    const high = 'K7PQ3MWXA9';
    expect(only(ran(phone(high, 1), join(itemOf(2, low)))).incidentId).toBe(low);
    expect(only(ran(phone(low, 1), join(itemOf(2, high)))).incidentId).toBe(low);
    const letter = 'K7PQ3MWXAB';
    expect(only(ran(phone(letter, 1), join(itemOf(2, high)))).incidentId).toBe(high);
  });

  it('relabels every entry to the new id, with the code made again, and nothing else changed', () => {
    const before = phone(LARGE, 1, 2);
    const held = only(before).entries[0];
    if (held === undefined) throw new Error('entry');
    const marked = ran(ran(before, { kind: 'hide', sightingId: sightingIdOf(1) }), {
      kind: 'markShared',
      sightingId: sightingIdOf(1),
      record: { channel: 'text', atUtcMs: NOW_UTC_MS + 9 },
    });
    const after = only(ran(marked, join(itemOf(7, SMALL))));
    for (const entry of after.entries) {
      expect(entry.sighting.incidentId).toBe(SMALL);
      const encoded = encodeSighting(entry.sighting);
      expect(encoded.ok && encoded.value).toBe(entry.code);
    }
    const first = after.entries.find((e) => e.sighting.sightingId === sightingIdOf(1));
    expect(first?.hidden).toBe(true);
    expect(first?.shared).toEqual([{ channel: 'text', atUtcMs: NOW_UTC_MS + 9 }]);
    expect(first?.sighting.origin).toBe('local');
    expect(first?.sighting.bearing).toEqual(held.sighting.bearing);
    expect(first?.code).not.toBe(held.code);
    // The one that came in is a received one, stamped with the time of the join.
    const received = after.entries.find((e) => e.sighting.sightingId === sightingIdOf(7));
    expect(received?.sighting.origin).toBe('received');
    expect(received?.sighting.receivedUtcMs).toBe(NOW_UTC_MS + 5000);
  });

  it('dates the Incident from the earlier of its creation and the join, and says who made the id', () => {
    const state = ran(phone(LARGE, 1), join(itemOf(7, SMALL), NOW_UTC_MS + 9000));
    expect(only(state).createdUtcMs).toBe(NOW_UTC_MS);
    // The id of the other phone won: this phone joined that Incident.
    expect(only(state).creation).toBe('joined');
    const earlier = ran(phone(LARGE, 1), join(itemOf(7, SMALL), NOW_UTC_MS - 9000));
    expect(only(earlier).createdUtcMs).toBe(NOW_UTC_MS - 9000);
  });

  it('relabels the conflicts of the Incident with its entries, so that I7 still holds', () => {
    const before = phone(LARGE, 1);
    const other = canonicalOf(1, LARGE, { azimuthRad: 2.5 }, 'received');
    const conflicted = ran(before, {
      kind: 'addReceived',
      item: {
        code: other.code,
        sighting: { ...other.sighting, receivedUtcMs: null },
        arrivedUtcMs: 0,
      },
      nowUtcMs: NOW_UTC_MS,
      joinIfUnknown: false,
    });
    expect(only(conflicted).conflicts).toHaveLength(1);
    const after = only(ran(conflicted, join(itemOf(7, SMALL))));
    expect(after.conflicts).toHaveLength(1);
    expect(after.conflicts[0]?.heldCode).toBe(after.entries[0]?.code);
  });

  it('joins again and again: the former ids add up, whichever is smaller', () => {
    let state = phone(LARGE, 1);
    state = ran(state, join(itemOf(2, MIDDLE)));
    expect(only(state).incidentId).toBe(MIDDLE);
    state = ran(state, join(itemOf(3, SMALL)));
    expect(only(state).incidentId).toBe(SMALL);
    expect(only(state).formerIds).toEqual([MIDDLE, LARGE]);
    state = ran(state, join(itemOf(4, 'H7PQ3MWXAB')));
    expect(only(state).formerIds).toEqual([MIDDLE, 'H7PQ3MWXAB', LARGE]);
    expect(only(state).incidentId).toBe(SMALL);
  });

  it('joins a code whose Sighting is already held under the other id: one entry, the join made', () => {
    const state = ran(phone(LARGE, 1), join(itemOf(7, SMALL)));
    // Sighting 7 once more, but under the id of a third phone: not held, so a question; same entry.
    const again = ran(state, join(itemOf(7, MIDDLE)));
    expect(only(again).incidentId).toBe(SMALL);
    expect(only(again).formerIds).toEqual([MIDDLE, LARGE]);
    expect(
      only(again).entries.filter((e) => e.sighting.sightingId === sightingIdOf(7)),
    ).toHaveLength(1);
  });

  it('leaves the other Incidents of the phone alone', () => {
    const two = ran(phone(LARGE, 1), {
      kind: 'createIncident',
      incidentId: MIDDLE,
      nowUtcMs: NOW_UTC_MS,
    });
    const open = ran(two, { kind: 'openIncident', incidentId: LARGE });
    const after = ran(open, join(itemOf(7, SMALL)));
    expect(after.incidents.map((i) => i.incidentId)).toEqual([SMALL, MIDDLE]);
    expect(after.openIncidentId).toBe(SMALL);
    expect(after.incidents[1]).toBe(open.incidents[1]);
  });
});

describe('joinIncident: what it refuses, and then nothing changes', () => {
  it('fails with incident_unknown when no Incident is open', () => {
    const state = ran(phone(LARGE, 1), { kind: 'deleteIncident', incidentId: LARGE });
    expect(failure(state, join(itemOf(2, SMALL)))).toEqual({
      ok: false,
      reason: 'incident_unknown',
    });
  });

  it('fails with invalid_number naming incidentId for a code of a held id, current or former', () => {
    const state = phone(LARGE, 1);
    expect(failure(state, join(itemOf(2, LARGE)))).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'incidentId',
    });
    const joined = ran(state, join(itemOf(2, SMALL)));
    expect(failure(joined, join(itemOf(3, LARGE)))).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'incidentId',
    });
  });

  it('fails with invalid_number naming nowUtcMs for a time that is not finite', () => {
    const state = phone(LARGE, 1);
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(failure(state, join(itemOf(2, SMALL), bad))).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'nowUtcMs',
      });
    }
  });

  it('fails with incident_not_joinable for a simulation and a real smoke, either way about', () => {
    const real = phone(LARGE, 1);
    expect(failure(real, join(itemOf(2, SIMULATION_INCIDENT_ID)))).toEqual({
      ok: false,
      reason: 'incident_not_joinable',
    });
    const simulated = phone(SIMULATION_INCIDENT_ID, 1);
    expect(failure(simulated, join(itemOf(2, LARGE)))).toEqual({
      ok: false,
      reason: 'incident_not_joinable',
    });
    // Two simulated smokes may be joined: the rule is about mixing.
    expect(only(ran(simulated, join(itemOf(2, 'ZB4N8RTY5A')))).incidentId).toBe('ZB4N8RTY5A');
  });

  it('fails with incident_not_joinable at the 17th former id, and with 16 it joins', () => {
    const extra = (k: number) => `D${sightingIdOf(k)}`;
    let state = phone(SMALL, 1);
    for (let k = 1; k <= 16; k += 1) state = ran(state, join(itemOf(100 + k, extra(k))));
    expect(only(state).formerIds).toHaveLength(PARAMETERS.maxFormerIncidentIds);
    expect(PARAMETERS.maxFormerIncidentIds).toBe(16);
    expect(failure(state, join(itemOf(200, extra(17))))).toEqual({
      ok: false,
      reason: 'incident_not_joinable',
    });
  });

  it('fails with incident_full when the union would exceed the maximum, and nothing changes', () => {
    const numbers = Array.from({ length: PARAMETERS.maxSightingsPerIncident }, (_, k) => k + 1);
    const full = phone(LARGE, ...numbers);
    expect(failure(full, join(itemOf(99, SMALL)))).toEqual({
      ok: false,
      reason: 'incident_full',
    });
    // One below the maximum: the union is exactly the maximum.
    const nearly = phone(LARGE, ...numbers.slice(1));
    expect(only(ran(nearly, join(itemOf(99, SMALL)))).entries).toHaveLength(
      PARAMETERS.maxSightingsPerIncident,
    );
  });

  it('fails with invalid_number for a code that is not the code of its Sighting', () => {
    const state = phone(LARGE, 1);
    const item = { ...itemOf(2, SMALL), code: itemOf(3, SMALL).code };
    expect(failure(state, join(item))?.reason).toBe('invalid_number');
  });
});

describe('a code of a former id (design §7.4a)', () => {
  const joined = () => ran(phone(LARGE, 1), join(itemOf(7, SMALL)));

  it('is held by the Incident of the current id: no question, no new Incident', () => {
    const state = joined();
    expect(incidentHolding(state, SMALL)?.incidentId).toBe(SMALL);
    expect(incidentHolding(state, LARGE)?.incidentId).toBe(SMALL);
    expect(incidentHolding(state, MIDDLE)).toBeUndefined();
    expect(incidentHolding(emptyState(), LARGE)).toBeUndefined();
  });

  it('is added without joinIfUnknown, relabelled to the current id', () => {
    const state = joined();
    const after = ran(state, {
      kind: 'addReceived',
      item: itemOf(8, LARGE),
      nowUtcMs: NOW_UTC_MS + 7000,
      joinIfUnknown: false,
    });
    const incident = only(after);
    const entry = incident.entries.find((e) => e.sighting.sightingId === sightingIdOf(8));
    expect(entry?.sighting.incidentId).toBe(SMALL);
    expect(entry?.code).toBe(canonicalOf(8, SMALL, {}, 'received').code);
    expect(incident.entries).toHaveLength(3);
  });

  it('is one entry with the same Sighting under the current id: a duplicate, not a conflict', () => {
    const state = joined();
    const again = applyAction(
      state,
      {
        kind: 'addReceived',
        item: itemOf(7, LARGE),
        nowUtcMs: NOW_UTC_MS + 7000,
        joinIfUnknown: false,
      },
      PARAMETERS,
    );
    if (!again.ok) throw new Error(again.reason);
    expect(again.value.state).toBe(state);
    expect(again.value.notices).toEqual([]);
  });

  it('still conflicts when the content differs under one Sighting id', () => {
    const state = joined();
    const other = itemOf(7, LARGE, { azimuthRad: 2.5 });
    const after = applyAction(
      state,
      { kind: 'addReceived', item: other, nowUtcMs: NOW_UTC_MS, joinIfUnknown: false },
      PARAMETERS,
    );
    if (!after.ok) throw new Error(after.reason);
    expect(after.value.notices.map((n) => n.reason)).toEqual(['sighting_conflict']);
    expect(only(after.value.state).conflicts).toHaveLength(1);
  });

  it('cannot be the id of a new Incident, nor be opened or deleted by', () => {
    const state = joined();
    expect(
      failure(state, { kind: 'createIncident', incidentId: LARGE, nowUtcMs: NOW_UTC_MS }),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'incidentId' });
    expect(failure(state, { kind: 'openIncident', incidentId: LARGE })).toEqual({
      ok: false,
      reason: 'incident_unknown',
    });
    expect(failure(state, { kind: 'deleteIncident', incidentId: LARGE })).toEqual({
      ok: false,
      reason: 'incident_unknown',
    });
  });

  it('goes with the Incident: after it is deleted the id is unknown again', () => {
    const state = ran(joined(), { kind: 'deleteIncident', incidentId: SMALL });
    expect(incidentHolding(state, LARGE)).toBeUndefined();
    expect(
      failure(state, {
        kind: 'addReceived',
        item: itemOf(8, LARGE),
        nowUtcMs: NOW_UTC_MS,
        joinIfUnknown: false,
      }),
    ).toEqual({ ok: false, reason: 'incident_unknown' });
  });

  it('is a code of the other Incident when the phone holds two and the id is a former id of one', () => {
    const two = ran(joined(), { kind: 'createIncident', incidentId: MIDDLE, nowUtcMs: NOW_UTC_MS });
    const after = ran(two, {
      kind: 'addReceived',
      item: itemOf(9, LARGE),
      nowUtcMs: NOW_UTC_MS,
      joinIfUnknown: false,
    });
    expect(after.incidents.find((i) => i.incidentId === SMALL)?.entries).toHaveLength(3);
    expect(after.incidents.find((i) => i.incidentId === MIDDLE)?.entries).toHaveLength(0);
    // Adding to an Incident that is not the open one does not open it.
    expect(after.openIncidentId).toBe(MIDDLE);
  });
});

describe('replace holds I8 for a state that comes from outside', () => {
  it('drops a former id that is the Incident’s own, a repeat, one of another mode and one held elsewhere', () => {
    const base = phone(LARGE, 1);
    const incident = only(base);
    const other = ran(base, { kind: 'createIncident', incidentId: MIDDLE, nowUtcMs: NOW_UTC_MS });
    const dirty: VigiaState = {
      openIncidentId: LARGE,
      incidents: [
        { ...incident, formerIds: [SMALL, SMALL, LARGE, SIMULATION_INCIDENT_ID, MIDDLE] },
        ...other.incidents.slice(1),
      ],
    };
    const result = applyAction(emptyState(), { kind: 'replace', state: dirty }, PARAMETERS);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.incidents[0]?.formerIds).toEqual([SMALL]);
    expect(invariants(result.value.state, PARAMETERS)).toEqual([]);
    expect(result.value.notices).toEqual([{ reason: 'storage_corrupt', count: 4 }]);
  });

  it('treats a missing list as an empty one, as a value saved before the join did', () => {
    const incident = only(phone(LARGE, 1));
    const old = { ...incident } as Partial<Incident>;
    Reflect.deleteProperty(old, 'formerIds');
    const result = applyAction(
      emptyState(),
      { kind: 'replace', state: { openIncidentId: LARGE, incidents: [old as Incident] } },
      PARAMETERS,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.incidents[0]?.formerIds).toEqual([]);
    expect(result.value.notices).toEqual([]);
  });
});

// The shrunk counterexample of P-2.6 (`relabelItem`, root `pnpm test` of the final checkpoint,
// seed 456561989, path 196:0:…:63:64): an Inbox item whose arrival time is -Infinity, relabelled
// to another id, came back as a success that held -Infinity (Req 2.1). Kept as the property found it.
describe('relabelItem refuses an item that holds a number that is not finite (P-2.6 counterexample)', () => {
  const counterexample: InboxItem = {
    sighting: {
      sightingId: '222222222',
      incidentId: '2222222222',
      bearing: {
        id: '222222222',
        observer: { latRad: -1.5533430342749535, lonRad: -3.1415926535897922 },
        positionAccuracyM: 0,
        timeUtcMs: 1767225600000,
        azimuthRad: 0,
        azimuthSigmaRad: 0.00017453292519943296,
      },
      origin: 'received',
      receivedUtcMs: null,
    },
    code: '3222222222222222222222222222222222222222222222M48K',
    arrivedUtcMs: Number.NEGATIVE_INFINITY,
  };
  const parameters = {
    ...PARAMETERS,
    plausibleRangeM: 1.5707963267948966,
    expiryCheckIntervalMs: 1789999900000,
  };

  it('the counterexample, relabelled to K7PQ3MWXA2, is invalid_number naming item', () => {
    expect(relabelItem(counterexample, 'K7PQ3MWXA2', parameters)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'item',
    });
  });

  it('every non-finite number of an item is refused in the relabel branch as in the other', () => {
    const good = itemOf(2, SMALL);
    const bads: InboxItem[] = [
      { ...good, arrivedUtcMs: Number.NaN },
      { ...good, sighting: { ...good.sighting, receivedUtcMs: Number.POSITIVE_INFINITY } },
      {
        ...good,
        sighting: {
          ...good.sighting,
          bearing: { ...good.sighting.bearing, azimuthRad: Number.NaN },
        },
      },
    ];
    for (const bad of bads) {
      for (const target of [SMALL, LARGE]) {
        expect(relabelItem(bad, target, PARAMETERS), target).toEqual({
          ok: false,
          reason: 'invalid_number',
          field: 'item',
        });
      }
    }
    expect(relabelItem(good, LARGE, PARAMETERS).ok).toBe(true);
  });

  // The shrunk counterexample of P-2.6 after the first fix (seed 679858833, path 11:0:…:63): with a
  // parameter that is not valid and an item that is not finite, the parameter is named first.
  it('names a parameter that is not valid before the item (Req 19.3)', () => {
    const item: InboxItem = {
      ...counterexample,
      code: '32222222222222222222222222JZMRRUD35ZGQNCEHREEHXS96',
      arrivedUtcMs: Number.NaN,
      sighting: {
        ...counterexample.sighting,
        bearing: {
          ...counterexample.sighting.bearing,
          observer: { latRad: -1.5533430342749535, lonRad: 3.141592653589793 },
        },
      },
    };
    expect(
      relabelItem(item, 'K7PQ3MWXA2', { ...PARAMETERS, maxLinkLengthChars: Number.NaN }),
    ).toEqual({ ok: false, reason: 'invalid_number', field: 'maxLinkLengthChars' });
  });

  it('joinIncident with such an item fails, whichever id survives', () => {
    // The code's id survives (it is the smaller): the item keeps its id.
    const bad = { ...itemOf(2, SMALL), arrivedUtcMs: Number.NEGATIVE_INFINITY };
    expect(failure(phone(LARGE, 1), join(bad))).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'item',
    });
    // The open id survives: the item is relabelled, the branch of the counterexample.
    const relabelled = { ...itemOf(2, LARGE), arrivedUtcMs: Number.NEGATIVE_INFINITY };
    expect(failure(phone(SMALL, 1), join(relabelled))).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'item',
    });
  });
});
