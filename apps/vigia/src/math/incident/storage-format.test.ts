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
import { emptyState, type VigiaState } from './incident-state';
import { parseStoredState, serialiseState, type StoredParse } from './storage-format';

function ran(state: VigiaState, action: VigiaAction): VigiaState {
  const result = applyAction(state, action, PARAMETERS);
  if (!result.ok) throw new Error(`${action.kind} failed: ${result.reason}`);
  return result.value.state;
}

/** A fixed state: a device Incident with two entries (one received, hidden and shared, one local) and a conflict. */
function fixedState(): VigiaState {
  let state = ran(emptyState(), {
    kind: 'createIncident',
    incidentId: INCIDENT_ID,
    nowUtcMs: NOW_UTC_MS,
  });
  const a = canonicalOf(1);
  state = ran(state, {
    kind: 'addLocal',
    sighting: a.sighting,
    code: a.code,
    nowUtcMs: NOW_UTC_MS,
  });
  const b = canonicalOf(2, INCIDENT_ID, {}, 'received', NOW_UTC_MS + 5);
  state = ran(state, {
    kind: 'addReceived',
    item: {
      code: b.code,
      sighting: { ...b.sighting, receivedUtcMs: null },
      arrivedUtcMs: NOW_UTC_MS,
    },
    nowUtcMs: NOW_UTC_MS + 5,
    joinIfUnknown: false,
  });
  state = ran(state, { kind: 'hide', sightingId: sightingIdOf(2) });
  state = ran(state, {
    kind: 'markShared',
    sightingId: sightingIdOf(1),
    record: { channel: 'link', atUtcMs: NOW_UTC_MS + 200_000 },
  });
  const other = canonicalOf(1, INCIDENT_ID, { azimuthRad: 2.5 }, 'received', NOW_UTC_MS + 9);
  return ran(state, {
    kind: 'addReceived',
    item: {
      code: other.code,
      sighting: { ...other.sighting, receivedUtcMs: null },
      arrivedUtcMs: 1,
    },
    nowUtcMs: NOW_UTC_MS + 9,
    joinIfUnknown: false,
  });
}

const SAVED = NOW_UTC_MS + 300_000;
const parsed = (text: string | null, nowUtcMs = NOW_UTC_MS + 400_000): StoredParse => {
  const result = parseStoredState(text, nowUtcMs, PARAMETERS);
  if (!result.ok) throw new Error(`parse failed: ${result.reason}`);
  return result.value;
};
const loadedAt = (text: string, nowUtcMs: number): { state: VigiaState; dropped: number } => {
  const result = parsed(text, nowUtcMs);
  if (result.kind !== 'loaded') throw new Error(`not loaded: ${result.kind}`);
  return result;
};
const loaded = (text: string): { state: VigiaState; dropped: number } => {
  const result = parsed(text);
  if (result.kind !== 'loaded') throw new Error(`not loaded: ${result.kind}`);
  return result;
};

// The stored value as the damaged-value examples change it: every field `unknown`, so that a test
// can write a value of the wrong type.
interface Stored {
  format?: unknown;
  version?: unknown;
  savedUtcMs?: unknown;
  openIncidentId?: unknown;
  incidents?: unknown;
  extra?: unknown;
}
interface StoredIncident {
  incidentId?: unknown;
  createdUtcMs?: unknown;
  creation?: unknown;
  entries?: unknown;
  conflicts?: unknown;
}
interface StoredEntry {
  code?: unknown;
  origin?: unknown;
  receivedUtcMs?: unknown;
  hidden?: unknown;
  shared?: unknown;
}
const incidentsOf = (s: Stored): StoredIncident[] => s.incidents as StoredIncident[];
const firstOf = (s: Stored): StoredIncident => incidentsOf(s)[0] ?? {};
const entriesOf = (i: StoredIncident): StoredEntry[] => i.entries as StoredEntry[];
const firstEntry = (s: Stored): StoredEntry => entriesOf(firstOf(s))[0] ?? {};

/** The JSON text of the fixed state with `change` applied to a copy: for the damaged-value examples. */
function mutated(change: (stored: Stored) => void): string {
  const stored = JSON.parse(serialiseState(fixedState(), SAVED)) as Stored;
  change(stored);
  return JSON.stringify(stored);
}

describe('serialiseState: the JSON of design §7.5, exactly', () => {
  it('writes the keys in order and nothing else, for a fixed state', () => {
    const a = canonicalOf(1);
    const b = canonicalOf(2, INCIDENT_ID, {}, 'received', NOW_UTC_MS + 5);
    const other = canonicalOf(1, INCIDENT_ID, { azimuthRad: 2.5 }, 'received', NOW_UTC_MS + 9);
    const expected =
      `{"format":"vigia-state","version":1,"savedUtcMs":${SAVED},"openIncidentId":"${INCIDENT_ID}",` +
      `"incidents":[{"incidentId":"${INCIDENT_ID}","createdUtcMs":${NOW_UTC_MS},"creation":"created",` +
      `"entries":[` +
      `{"code":"${a.code}","origin":"local","receivedUtcMs":null,"hidden":false,` +
      `"shared":[{"channel":"link","atUtcMs":${NOW_UTC_MS + 200_000}}]},` +
      `{"code":"${b.code}","origin":"received","receivedUtcMs":${NOW_UTC_MS + 5},"hidden":true,"shared":[]}` +
      `],"conflicts":[{"sightingId":"${sightingIdOf(1)}","heldCode":"${a.code}","otherCode":"${other.code}"}]}]}`;
    expect(serialiseState(fixedState(), SAVED)).toBe(expected);
  });

  it('writes the empty state with an empty list and a null open Incident', () => {
    expect(serialiseState(emptyState(), SAVED)).toBe(
      `{"format":"vigia-state","version":1,"savedUtcMs":${SAVED},"openIncidentId":null,"incidents":[]}`,
    );
  });

  it('does not write an Incident made in Simulation mode, and writes no open Incident that is one', () => {
    let state = fixedState();
    state = ran(state, {
      kind: 'createIncident',
      incidentId: SIMULATION_INCIDENT_ID,
      nowUtcMs: NOW_UTC_MS,
    });
    const s = canonicalOf(3, SIMULATION_INCIDENT_ID);
    state = ran(state, {
      kind: 'addLocal',
      sighting: s.sighting,
      code: s.code,
      nowUtcMs: NOW_UTC_MS,
    });
    expect(state.openIncidentId).toBe(SIMULATION_INCIDENT_ID);
    const text = serialiseState(state, SAVED);
    expect(text).not.toContain(SIMULATION_INCIDENT_ID);
    expect(text).not.toContain(s.code);
    const back = loaded(text);
    expect(back.state.incidents.map((i) => i.incidentId)).toEqual([INCIDENT_ID]);
    expect(back.state.openIncidentId).toBeNull();
  });

  it('writes 0 for a saved time that is not finite, never null or NaN', () => {
    for (const bad of [Number.NaN, Infinity]) {
      expect(serialiseState(emptyState(), bad)).toContain('"savedUtcMs":0,');
    }
  });
});

describe('parseStoredState: the good value', () => {
  it('is empty for null', () => {
    expect(parsed(null)).toEqual({ kind: 'empty' });
  });

  it('gives back the state that was written, with nothing dropped', () => {
    const state = fixedState();
    const back = loaded(serialiseState(state, SAVED));
    expect(back.dropped).toBe(0);
    expect(back.state).toEqual(state);
    expect(invariants(back.state, PARAMETERS)).toEqual([]);
  });

  it('gives the empty state back for the empty state', () => {
    expect(loaded(serialiseState(emptyState(), SAVED))).toEqual({
      kind: 'loaded',
      state: emptyState(),
      dropped: 0,
    });
  });

  it('keeps the receive time, the hidden flag, the shared records and the origin of each entry', () => {
    const entries = loaded(serialiseState(fixedState(), SAVED)).state.incidents[0]?.entries ?? [];
    expect(
      entries.map((e) => [e.sighting.origin, e.sighting.receivedUtcMs, e.hidden, e.shared.length]),
    ).toEqual([
      ['local', null, false, 1],
      ['received', NOW_UTC_MS + 5, true, 0],
    ]);
  });
});

describe('parseStoredState: a value that is not ours is corrupt (design §7.5, steps 1 to 3)', () => {
  const corrupt = (text: string) => expect(parsed(text)).toEqual({ kind: 'corrupt', raw: text });

  it('is corrupt for text that is not JSON, an array, a number, null and {}', () => {
    for (const text of ['', 'not json', '[', '[]', '[1,2]', '3', 'null', '"text"', 'true', '{}']) {
      corrupt(text);
    }
  });

  it('is corrupt for another format, a missing format and a format of another case', () => {
    corrupt(mutated((s) => (s.format = 'other-state')));
    corrupt(
      mutated((s) => {
        delete s.format;
      }),
    );
    corrupt(mutated((s) => (s.format = 'Vigia-State')));
  });

  it('is corrupt for version 0, 1.5, -1, a text and a missing version', () => {
    corrupt(mutated((s) => (s.version = 0)));
    corrupt(mutated((s) => (s.version = 1.5)));
    corrupt(mutated((s) => (s.version = -1)));
    corrupt(mutated((s) => (s.version = '1')));
    corrupt(
      mutated((s) => {
        delete s.version;
      }),
    );
  });

  it('is newer for version 2, and for a very large integer version, and then holds nothing else', () => {
    expect(parsed(mutated((s) => (s.version = 2)))).toEqual({ kind: 'newer', version: 2 });
    expect(parsed(mutated((s) => (s.version = 1e300)))).toEqual({ kind: 'newer', version: 1e300 });
    // A newer value is judged by its version before anything else is read.
    expect(parsed(mutated((s) => ((s.version = 2), (s.incidents = 'garbage'))))).toEqual({
      kind: 'newer',
      version: 2,
    });
  });

  it('is corrupt when the list of Incidents is not a list', () => {
    corrupt(mutated((s) => (s.incidents = {})));
    corrupt(
      mutated((s) => {
        delete s.incidents;
      }),
    );
  });

  it('is corrupt for text over 1 000 000 characters, at and either side of the limit', () => {
    const base = serialiseState(fixedState(), SAVED);
    const pad = (length: number) => base.slice(0, -1) + ' '.repeat(length - base.length) + '}';
    expect(parsed(pad(1_000_000)).kind).toBe('loaded');
    expect(parsed(pad(1_000_001)).kind).toBe('corrupt');
    expect(parsed('x'.repeat(1_000_001))).toEqual({ kind: 'corrupt', raw: 'x'.repeat(1_000_001) });
  });
});

describe('parseStoredState: what is salvaged and counted (step 4)', () => {
  const flip = (code: string) => code.slice(0, 7) + (code[7] === '2' ? '3' : '2') + code.slice(8);

  it('drops an entry whose code has a flipped symbol and counts it', () => {
    const text = mutated((s) => (firstEntry(s).code = flip(String(firstEntry(s).code))));
    const back = loaded(text);
    expect(back.dropped).toBe(1);
    expect(back.state.incidents[0]?.entries.map((e) => e.sighting.sightingId)).toEqual([
      sightingIdOf(2),
    ]);
    expect(invariants(back.state, PARAMETERS)).toEqual([]);
  });

  it('drops a conflict that names a Sighting that was dropped or whose held code is not the entry\u2019s', () => {
    const text = mutated((s) => (firstEntry(s).code = flip(String(firstEntry(s).code))));
    const back = loaded(text);
    expect(back.state.incidents[0]?.conflicts).toEqual([]);
    expect(back.dropped).toBe(1); // the entry; the conflict that went with it is part of it
  });

  it('keeps the first of a duplicate Sighting id and counts the other', () => {
    const text = mutated((s) => entriesOf(firstOf(s)).push(firstEntry(s)));
    const back = loaded(text);
    expect(back.dropped).toBe(1);
    expect(back.state.incidents[0]?.entries).toHaveLength(2);
  });

  it('drops an entry of another Incident and counts it', () => {
    const other = canonicalOf(7, 'C222222222');
    const text = mutated((s) =>
      entriesOf(firstOf(s)).push({
        code: other.code,
        origin: 'local',
        receivedUtcMs: null,
        hidden: false,
        shared: [],
      }),
    );
    const back = loaded(text);
    expect(back.dropped).toBe(1);
    expect(back.state.incidents[0]?.entries).toHaveLength(2);
  });

  it('keeps the first 32 of 33 entries, by Sighting id order, and counts the rest', () => {
    const text = mutated((s) => {
      firstOf(s).entries = Array.from({ length: 33 }, (_, i) => {
        const { code } = canonicalOf(i + 1);
        return { code, origin: 'local', receivedUtcMs: null, hidden: false, shared: [] };
      }).reverse();
      firstOf(s).conflicts = [];
    });
    const back = loaded(text);
    expect(back.dropped).toBe(1);
    const ids = back.state.incidents[0]?.entries.map((e) => e.sighting.sightingId) ?? [];
    expect(ids).toEqual(
      Array.from({ length: 33 }, (_, i) => sightingIdOf(i + 1))
        .sort()
        .slice(0, 32),
    );
    expect(invariants(back.state, PARAMETERS)).toEqual([]);
  });

  it('drops an entry with a flag, an origin, a receive time or a shared record of the wrong shape', () => {
    const wrongs: ((entry: StoredEntry) => void)[] = [
      (e) => (e.origin = 'elsewhere'),
      (e) => (e.hidden = 'no'),
      (e) => (e.receivedUtcMs = 5), // local with a receive time
      (e) => ((e.origin = 'received'), (e.receivedUtcMs = null)),
      (e) => (e.receivedUtcMs = 'x'),
      (e) => (e.shared = 'none'),
      (e) => (e.shared = [{ channel: 'carrier-pigeon', atUtcMs: 1 }]),
      (e) => (e.shared = [{ channel: 'link', atUtcMs: 'soon' }]),
      (e) => (e.shared = Array.from({ length: 21 }, () => ({ channel: 'link', atUtcMs: 1 }))),
      (e) => (e.code = 42),
    ];
    for (const wrong of wrongs) {
      const back = loaded(mutated((s) => wrong(firstEntry(s))));
      expect(back.dropped, wrong.toString()).toBe(1);
      expect(back.state.incidents[0]?.entries).toHaveLength(1);
    }
  });

  it('drops an Incident with an id that is not one, a time that is not finite or a creation that is unknown, with its entries', () => {
    const wrongs: ((incident: StoredIncident) => void)[] = [
      (i) => (i.incidentId = 'nope'),
      (i) => (i.createdUtcMs = 'then'),
      (i) => (i.creation = 'found'),
      (i) => (i.entries = 3),
    ];
    for (const wrong of wrongs) {
      const back = loaded(mutated((s) => wrong(firstOf(s))));
      expect(back.state.incidents, wrong.toString()).toEqual([]);
      expect(back.state.openIncidentId).toBeNull();
      expect(back.dropped).toBeGreaterThanOrEqual(1);
    }
  });

  it('counts an Incident dropped as one and each entry it held as one', () => {
    expect(loaded(mutated((s) => (firstOf(s).incidentId = 'nope'))).dropped).toBe(3);
  });

  it('drops an Incident made in Simulation mode that a value holds, and one that is held twice', () => {
    const sim = mutated((s) => {
      firstOf(s).incidentId = SIMULATION_INCIDENT_ID;
      firstOf(s).entries = [];
      firstOf(s).conflicts = [];
    });
    expect(loaded(sim).state.incidents).toEqual([]);
    const twice = mutated((s) => {
      incidentsOf(s).push(JSON.parse(JSON.stringify(firstOf(s))) as StoredIncident);
    });
    const back = loaded(twice);
    expect(back.state.incidents).toHaveLength(1);
    expect(back.dropped).toBe(3);
  });

  it('makes an open Incident that is not held null', () => {
    expect(
      loaded(mutated((s) => (s.openIncidentId = 'D222222222'))).state.openIncidentId,
    ).toBeNull();
    expect(loaded(mutated((s) => (s.openIncidentId = 7))).state.openIncidentId).toBeNull();
    expect(loaded(mutated((s) => (s.openIncidentId = null))).state.openIncidentId).toBeNull();
  });

  it('ignores the keys it does not know', () => {
    expect(loaded(mutated((s) => (s.extra = { a: 1 }))).dropped).toBe(0);
  });
});

describe('parseStoredState: retention (Req 4.5)', () => {
  const retention = PARAMETERS.incidentRetentionMs;
  const text = () => serialiseState(fixedState(), SAVED);
  const newest = () => {
    const entries = fixedState().incidents[0]?.entries ?? [];
    return Math.max(...entries.map((e) => e.sighting.bearing.timeUtcMs));
  };

  it('removes an Incident older than the retention on load, without counting it as damage', () => {
    const result = parsed(text(), newest() + retention + 1);
    expect(result).toEqual({ kind: 'loaded', state: emptyState(), dropped: 0 });
  });

  it('keeps it at exactly the retention', () => {
    const result = parsed(text(), newest() + retention);
    expect(result.kind === 'loaded' && result.state.incidents).toHaveLength(1);
  });

  it('removes the open Incident with it, so that none is open', () => {
    const result = parsed(text(), newest() + retention + 1);
    expect(result.kind === 'loaded' && result.state.openIncidentId).toBeNull();
  });
});

describe('parseStoredState: the shrunk counterexample of P-4.7 (seed 248150571), kept as an example', () => {
  it('removes a joined Incident whose only Sighting is older than the retention at the time of the load', () => {
    // The clock moved a day and a second; the user then added a received Sighting of 24 hours
    // before, which makes a joined Incident created now with a Sighting 24 h 0.5 s old. Expiry
    // goes by the newest Sighting's Bearing time, not by the creation time (design §7.4): the
    // reload at the clock finds it expired, and that is not damage.
    const clock = NOW_UTC_MS + 86_401_501;
    const sighting = canonicalOf(
      1,
      INCIDENT_ID,
      { timeUtcMs: NOW_UTC_MS + 1000 },
      'received',
      clock,
    );
    const state = ran(emptyState(), {
      kind: 'addReceived',
      item: {
        code: sighting.code,
        sighting: { ...sighting.sighting, receivedUtcMs: null },
        arrivedUtcMs: clock,
      },
      nowUtcMs: clock,
      joinIfUnknown: true,
    });
    expect(state.incidents[0]?.createdUtcMs).toBe(clock);
    const text = serialiseState(state, clock);
    expect(parsed(text, clock)).toEqual({ kind: 'loaded', state: emptyState(), dropped: 0 });
    // At the Sighting's own time plus the retention it is still there.
    const newest = state.incidents[0]?.entries[0]?.sighting.bearing.timeUtcMs ?? 0;
    expect(loadedAt(text, newest + PARAMETERS.incidentRetentionMs).state).toEqual(state);
  });
});

describe('parseStoredState: what it refuses', () => {
  it('fails with invalid_number naming nowUtcMs for a time that is not finite', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(parseStoredState(serialiseState(emptyState(), SAVED), bad, PARAMETERS)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'nowUtcMs',
      });
    }
  });

  it('names the parameter that is not valid', () => {
    expect(parseStoredState(null, 1, { ...PARAMETERS, incidentRetentionMs: 1 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'incidentRetentionMs',
    });
  });
});
