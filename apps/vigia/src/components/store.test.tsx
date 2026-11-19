// The store (design D3, D4, D7; Req 2.5, 4.4, 4.5, 10.3): the one place that runs the reducer's
// effects. Tested with the fakes of the environment: storage, clock, timer, random, transport.

import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, STATE_KEY } from '../adapters/storage';
import { emptyState, type Incident, type VigiaState } from '../math/incident/incident-state';
import { serialiseState } from '../math/incident/storage-format';
import {
  createFakeEnvironment,
  START_UTC_MS,
  type FakeEnvironmentOptions,
} from '../test-support/fake-environment';
import {
  bearingOf,
  canonicalOf,
  INCIDENT_ID,
  sightingIdOf,
} from '../test-support/incident-fixtures';
import { createVigiaStore } from './store';

const PARAMETERS_DEFAULT = createFakeEnvironment().environment.parameters;
const HOUR_MS = 3_600_000;

function storeOf(options: FakeEnvironmentOptions = {}) {
  const fake = createFakeEnvironment(options);
  const store = createVigiaStore(fake.environment);
  store.start();
  return { ...fake, store };
}

/** A stored state of one device Incident whose entries were taken `agesMs` before the start. */
function storedIncident(agesMs: readonly number[], hidden = false): string {
  const entries = agesMs.map((ageMs, i) => {
    const { sighting, code } = canonicalOf(i + 1, INCIDENT_ID, { timeUtcMs: START_UTC_MS - ageMs });
    return { sighting, code, hidden, shared: [] };
  });
  const newest = Math.max(...agesMs.map((a) => START_UTC_MS - a));
  const incident: Incident = {
    incidentId: INCIDENT_ID,
    createdUtcMs: newest - 60_000,
    creation: 'created',
    entries,
    conflicts: [],
  };
  const state: VigiaState = { incidents: [incident], openIncidentId: INCIDENT_ID };
  return serialiseState(state, START_UTC_MS);
}

const reasons = (s: { notices: readonly { reason: string }[] }) => s.notices.map((n) => n.reason);

describe('dispatch (D3)', () => {
  it('runs the reducer and writes the whole state after a change', () => {
    const { store, storage } = storeOf();
    expect(
      store.dispatch({ kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: START_UTC_MS }),
    ).toEqual({ ok: true, value: undefined });
    expect(store.getSnapshot().state.openIncidentId).toBe(INCIDENT_ID);
    const written = storage.items.get(STATE_KEY);
    expect(written).toContain(INCIDENT_ID);
  });

  it('returns a refused action as its failure, and writes nothing', () => {
    const { store, storage } = storeOf();
    const before = storage.calls.filter((c) => c.startsWith('setItem')).length;
    const result = store.dispatch({ kind: 'openIncident', incidentId: INCIDENT_ID });
    expect(result).toMatchObject({ ok: false, reason: 'incident_unknown' });
    expect(storage.calls.filter((c) => c.startsWith('setItem'))).toHaveLength(before);
  });

  it('tells its subscribers once for a change, and not after they unsubscribe', () => {
    const { store } = storeOf();
    let heard = 0;
    const off = store.subscribe(() => {
      heard += 1;
    });
    store.dispatch({ kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: START_UTC_MS });
    expect(heard).toBe(1);
    off();
    store.dispatch({ kind: 'deleteAll' });
    expect(heard).toBe(1);
  });

  it('shows a storage write that fails as storage_unavailable, and keeps the state in memory', () => {
    const { store, storage } = storeOf();
    storage.failing = { setItem: 'QuotaExceededError' };
    store.dispatch({ kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: START_UTC_MS });
    expect(store.getSnapshot().state.openIncidentId).toBe(INCIDENT_ID);
    expect(reasons(store.getSnapshot())).toEqual(['storage_unavailable']);
  });
});

describe('loading (D4, Req 4.4)', () => {
  it('starts with what was stored, and the stored Incident open', () => {
    const { store } = storeOf({ storedItems: { [STATE_KEY]: storedIncident([60_000, 120_000]) } });
    const s = store.getSnapshot();
    expect(s.state.incidents).toHaveLength(1);
    expect(s.open?.incident.entries).toHaveLength(2);
    expect(reasons(s)).toEqual([]);
  });

  it('backs a corrupt value up once, starts empty and says storage_corrupt', () => {
    const { store, storage } = storeOf({ storedItems: { [STATE_KEY]: 'not json {' } });
    expect(storage.items.get(BACKUP_KEY)).toBe('not json {');
    expect(store.getSnapshot().state).toEqual(emptyState());
    expect(reasons(store.getSnapshot())).toEqual(['storage_corrupt']);
    // Once saved, the app writes its own state again.
    store.dispatch({ kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: START_UTC_MS });
    expect(storage.items.get(STATE_KEY)).toContain(INCIDENT_ID);
    expect(storage.items.get(BACKUP_KEY)).toBe('not json {');
  });

  it('never overwrites a corrupt value it could not back up: the backup key is taken', () => {
    const { store, storage } = storeOf({
      storedItems: { [STATE_KEY]: 'second bad value', [BACKUP_KEY]: 'first bad value' },
    });
    expect(storage.items.get(BACKUP_KEY)).toBe('first bad value');
    store.dispatch({ kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: START_UTC_MS });
    expect(storage.items.get(STATE_KEY)).toBe('second bad value');
    expect(reasons(store.getSnapshot())).toEqual(['storage_corrupt', 'storage_unavailable']);
  });

  it('salvages what holds of a value that is ours, and says how many were left out', () => {
    const good = storedIncident([60_000, 120_000]);
    const parsed = JSON.parse(good) as { incidents: { entries: { code: string }[] }[] };
    const entry = parsed.incidents[0]?.entries[0];
    if (entry === undefined) throw new Error('no entry');
    entry.code = `${entry.code.slice(0, 10)}${entry.code[10] === '2' ? '3' : '2'}${entry.code.slice(11)}`;
    const { store } = storeOf({ storedItems: { [STATE_KEY]: JSON.stringify(parsed) } });
    expect(store.getSnapshot().open?.incident.entries).toHaveLength(1);
    expect(store.getSnapshot().notices).toEqual([{ reason: 'storage_corrupt', count: 1 }]);
  });

  it('leaves a value of a newer version alone and runs in memory (storage_version_unsupported)', () => {
    const newer = JSON.stringify({ format: 'vigia-state', version: 2, incidents: [] });
    const { store, storage } = storeOf({ storedItems: { [STATE_KEY]: newer } });
    store.dispatch({ kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: START_UTC_MS });
    expect(store.getSnapshot().state.openIncidentId).toBe(INCIDENT_ID);
    expect(storage.items.get(STATE_KEY)).toBe(newer);
    expect(storage.items.has(BACKUP_KEY)).toBe(false);
    expect(reasons(store.getSnapshot())).toEqual(['storage_version_unsupported']);
  });

  it('says storage_unavailable on a phone whose storage is memory only, and not in Simulation mode', () => {
    expect(reasons(storeOf({ memoryStorage: true }).store.getSnapshot())).toEqual([
      'storage_unavailable',
    ]);
    expect(
      reasons(storeOf({ memoryStorage: true, mode: 'simulation' }).store.getSnapshot()),
    ).toEqual([]);
  });

  it('treats a storage that cannot be read as one it must not write', () => {
    const fresh = createFakeEnvironment({ storedItems: { [STATE_KEY]: 'kept' } });
    fresh.storage.failing = { getItem: 'SecurityError' };
    const other = createVigiaStore(fresh.environment);
    other.start();
    other.dispatch({ kind: 'createIncident', incidentId: INCIDENT_ID, nowUtcMs: START_UTC_MS });
    expect(fresh.storage.items.get(STATE_KEY)).toBe('kept');
    expect(reasons(other.getSnapshot())).toEqual(['storage_unavailable']);
  });
});

describe('expiry (Req 4.5)', () => {
  it('ticks every expiryCheckIntervalMs and deletes an Incident past the retention', () => {
    const retentionMs = PARAMETERS_DEFAULT.incidentRetentionMs;
    const intervalMs = PARAMETERS_DEFAULT.expiryCheckIntervalMs;
    const { store, timer, storage } = storeOf({
      storedItems: { [STATE_KEY]: storedIncident([retentionMs - intervalMs / 2]) },
    });
    expect(timer.running()).toBe(1);
    expect(store.getSnapshot().state.incidents).toHaveLength(1);
    timer.advance(intervalMs - 1);
    expect(store.getSnapshot().state.incidents).toHaveLength(1);
    timer.advance(1);
    expect(store.getSnapshot().state.incidents).toHaveLength(0);
    expect(store.getSnapshot().open).toBeNull();
    expect(storage.items.get(STATE_KEY)).not.toContain(INCIDENT_ID);
  });

  it('deletes an Incident already past the retention at load', () => {
    const retentionMs = PARAMETERS_DEFAULT.incidentRetentionMs;
    const { store } = storeOf({ storedItems: { [STATE_KEY]: storedIncident([retentionMs + 1]) } });
    expect(store.getSnapshot().state.incidents).toHaveLength(0);
  });

  it('keeps a fresh Incident through a day of ticks less one interval', () => {
    const { store, timer } = storeOf();
    store.capture(bearingOf(1, { id: 'b', timeUtcMs: START_UTC_MS }), 'new');
    timer.advance(24 * HOUR_MS - PARAMETERS_DEFAULT.expiryCheckIntervalMs);
    expect(store.getSnapshot().state.incidents).toHaveLength(1);
  });

  it('stops its timer on stop()', () => {
    const { store, timer } = storeOf();
    store.stop();
    expect(timer.running()).toBe(0);
  });
});

describe('the assessment is held by the store (decision 4)', () => {
  it('is computed once for a change of the Sighting set, not on a tick that changes nothing', () => {
    const { store, timer } = storeOf({
      storedItems: { [STATE_KEY]: storedIncident([60_000, 120_000]) },
    });
    const first = store.getSnapshot().open?.assessment;
    expect(first?.ok).toBe(true);
    timer.advance(PARAMETERS_DEFAULT.expiryCheckIntervalMs);
    expect(store.getSnapshot().open?.assessment).toBe(first);
    store.dispatch({ kind: 'hide', sightingId: sightingIdOf(1) });
    const second = store.getSnapshot().open?.assessment;
    expect(second).not.toBe(first);
    expect(second?.ok && second.value.setAside.map((s) => s.cause)).toEqual(['hidden_by_user']);
  });

  it('is computed again when time crosses a limit: one sighting becomes too old', () => {
    const maxAgeMs = PARAMETERS_DEFAULT.maxIncidentAgeMs;
    const intervalMs = PARAMETERS_DEFAULT.expiryCheckIntervalMs;
    const { store, timer } = storeOf({
      storedItems: { [STATE_KEY]: storedIncident([maxAgeMs - intervalMs / 2]) },
    });
    const before = store.getSnapshot().open?.assessment;
    expect(before?.ok && before.value.used).toHaveLength(1);
    timer.advance(intervalMs);
    const after = store.getSnapshot().open?.assessment;
    expect(after?.ok && after.value.setAside.map((s) => s.cause)).toEqual(['sighting_too_old']);
  });

  it('holds the advice beside the assessment', () => {
    const { store } = storeOf({ storedItems: { [STATE_KEY]: storedIncident([60_000]) } });
    expect(store.getSnapshot().open?.advice).toEqual({ ok: true, value: { kind: 'one_sighting' } });
  });
});

describe('capture (Req 3.4, 3.8, 4.2, 4.3)', () => {
  const captured = () =>
    bearingOf(1, { id: 'bearing-1789999940000', timeUtcMs: START_UTC_MS - 1000 });

  it('starts a new smoke with the capture only when the answer is a new smoke', () => {
    const { store } = storeOf();
    const result = store.capture(captured(), 'new');
    expect(result.ok).toBe(true);
    const s = store.getSnapshot();
    expect(s.state.incidents).toHaveLength(1);
    expect(s.open?.incident.creation).toBe('created');
    expect(s.open?.incident.entries).toHaveLength(1);
    expect(s.open?.incident.entries[0]?.sighting.sightingId).not.toBe('bearing-1789999940000');
  });

  it('adds to the open smoke when the answer is the same smoke, and refuses with none open', () => {
    const { store } = storeOf();
    expect(store.capture(captured(), 'same')).toMatchObject({
      ok: false,
      reason: 'incident_unknown',
    });
    expect(store.getSnapshot().state.incidents).toHaveLength(0);
    store.capture(captured(), 'new');
    store.capture(bearingOf(2, { id: 'bearing-2', timeUtcMs: START_UTC_MS - 500 }), 'same');
    expect(store.getSnapshot().state.incidents).toHaveLength(1);
    expect(store.getSnapshot().open?.incident.entries).toHaveLength(2);
  });

  it('makes a simulated Incident id in Simulation mode (first symbol Z)', () => {
    const { store } = storeOf({ mode: 'simulation' });
    store.capture(captured(), 'new');
    expect(store.getSnapshot().open?.incident.incidentId.startsWith('Z')).toBe(true);
  });

  it('refuses with random_unavailable when the browser has no random source, and adds nothing', () => {
    const { store } = storeOf({ randomAvailable: false });
    expect(store.capture(captured(), 'new')).toMatchObject({
      ok: false,
      reason: 'random_unavailable',
    });
    expect(store.getSnapshot().state.incidents).toHaveLength(0);
  });

  it('knows the phone\u2019s own position from its newest sighting, and none from received ones', () => {
    const { store } = storeOf();
    expect(store.getSnapshot().ownPosition).toBeNull();
    store.capture(captured(), 'new');
    expect(store.getSnapshot().ownPosition).toEqual({
      position: store.getSnapshot().open?.incident.entries[0]?.sighting.bearing.observer,
      accuracyM: store.getSnapshot().open?.incident.entries[0]?.sighting.bearing.positionAccuracyM,
    });
  });
});

describe('the own position is a new object only when it changes', () => {
  it('stays the same object across a tick and a change that does not move it', () => {
    const { store, timer } = storeOf();
    store.capture(bearingOf(1, { id: 'b', timeUtcMs: START_UTC_MS - 1000 }), 'new');
    const before = store.getSnapshot().ownPosition;
    timer.advance(PARAMETERS_DEFAULT.expiryCheckIntervalMs);
    const id = store.getSnapshot().open?.incident.entries[0]?.sighting.sightingId ?? '';
    store.markShared(id, 'text');
    expect(store.getSnapshot().ownPosition).toBe(before);
    store.capture(bearingOf(2, { id: 'c', timeUtcMs: START_UTC_MS }), 'same');
    expect(store.getSnapshot().ownPosition).not.toBe(before);
  });
});

describe('the Inbox (D7, Req 9.4)', () => {
  const received = (n: number, incidentId = INCIDENT_ID) =>
    canonicalOf(n, incidentId, {}, 'received');

  it('holds a pasted code in memory only, and writes nothing', () => {
    const { store, storage } = storeOf();
    const writes = storage.calls.length;
    const { code } = received(3);
    const result = store.paste(`look: https://app.example.test/#${code} thanks`);
    expect(result.ok).toBe(true);
    expect(store.getSnapshot().inbox.map((i) => i.code)).toEqual([code]);
    expect(storage.calls).toHaveLength(writes);
  });

  it('returns a damaged paste as its failure and holds nothing', () => {
    const { store } = storeOf();
    const { code } = received(3);
    const damaged = `${code.slice(0, 7)}${code[7] === '2' ? '3' : '2'}${code.slice(8)}`;
    expect(store.paste(damaged)).toMatchObject({ ok: false, reason: 'code_damaged' });
    expect(store.getSnapshot().inbox).toEqual([]);
  });

  it('holds the same code once', () => {
    const { store } = storeOf();
    const { code } = received(3);
    store.paste(code);
    store.paste(code);
    expect(store.getSnapshot().inbox).toHaveLength(1);
  });

  it('adds on Add, stamps the time of the act, and drops on Ignore', () => {
    const { store, timer } = storeOf();
    store.capture(bearingOf(1, { id: 'b', timeUtcMs: START_UTC_MS - 1000 }), 'new');
    const incidentId = store.getSnapshot().state.openIncidentId ?? '';
    const a = received(3, incidentId);
    const b = received(4, incidentId);
    store.paste(a.code);
    store.paste(b.code);
    timer.advance(5000);
    expect(store.addFromInbox(a.code, false).ok).toBe(true);
    store.ignore(b.code);
    const s = store.getSnapshot();
    expect(s.inbox).toEqual([]);
    const added = s.open?.incident.entries.find((e) => e.code === a.code);
    expect(added?.sighting.origin).toBe('received');
    expect(added?.sighting.receivedUtcMs).toBe(START_UTC_MS + 5000);
    expect(s.open?.incident.entries).toHaveLength(2);
  });

  it('opens a code of an unknown smoke only when asked to join it', () => {
    const { store } = storeOf();
    const a = received(3);
    store.paste(a.code);
    expect(store.addFromInbox(a.code, false)).toMatchObject({
      ok: false,
      reason: 'incident_unknown',
    });
    expect(store.getSnapshot().inbox).toHaveLength(1);
    expect(store.addFromInbox(a.code, true).ok).toBe(true);
    expect(store.getSnapshot().open?.incident.creation).toBe('joined');
  });

  it('shows a different sighting under a held id as sighting_conflict, keeping the held one', () => {
    const { store } = storeOf();
    const a = received(3);
    store.paste(a.code);
    store.addFromInbox(a.code, true);
    const other = canonicalOf(3, INCIDENT_ID, { azimuthRad: 1.2 }, 'received');
    store.paste(other.code);
    store.addFromInbox(other.code, false);
    const s = store.getSnapshot();
    expect(reasons(s)).toContain('sighting_conflict');
    expect(s.open?.incident.entries[0]?.code).toBe(a.code);
    expect(s.open?.incident.conflicts).toEqual([
      { sightingId: sightingIdOf(3), heldCode: a.code, otherCode: other.code },
    ]);
  });

  it('holds what the Transport delivers, and a delivery it cannot read as the receive failure', () => {
    const { store, transport } = storeOf();
    const a = received(3);
    transport.receive(a.code);
    expect(store.getSnapshot().inbox.map((i) => i.code)).toEqual([a.code]);
    transport.receive('ZZZZZZZZ');
    expect(store.getSnapshot().receiveFailure).toMatchObject({ reason: 'code_damaged' });
  });

  it('says transport_unavailable when the Transport stops', () => {
    const { store, transport } = storeOf();
    transport.stop();
    expect(reasons(store.getSnapshot())).toEqual(['transport_unavailable']);
  });
});

describe('the page\u2019s fragment (Req 10.3)', () => {
  const linkOf = (code: string) => `https://app.example.test/p?x=1#${code}`;

  it('decodes a code in the fragment into the Inbox and replaces the address without it', () => {
    const { code } = canonicalOf(3, INCIDENT_ID, {}, 'received');
    const { store, page } = storeOf({ href: linkOf(code) });
    const s = store.getSnapshot();
    expect(s.inbox.map((i) => i.code)).toEqual([code]);
    expect(page.history.calls.map((c) => c.url)).toEqual(['https://app.example.test/p?x=1']);
    expect(s.addressHoldsCode).toBe(false);
    expect(s.linkArrivals).toBe(1);
  });

  it('says that the address still holds the code when neither history nor location let go of it', () => {
    const { code } = canonicalOf(3, INCIDENT_ID, {}, 'received');
    const fake = createFakeEnvironment({ href: linkOf(code) });
    fake.page.history.failing = true;
    fake.page.location.hashFailing = true;
    const store = createVigiaStore(fake.environment);
    store.start();
    expect(store.getSnapshot().addressHoldsCode).toBe(true);
    expect(store.getSnapshot().inbox).toHaveLength(1);
  });

  it('replaces the address of a damaged code too, and keeps its failure for the Inbox sheet', () => {
    const { code } = canonicalOf(3, INCIDENT_ID, {}, 'received');
    const damaged = `${code.slice(0, 20)}${code[20] === '2' ? '3' : '2'}${code.slice(21)}`;
    const { store, page } = storeOf({ href: linkOf(damaged) });
    expect(store.getSnapshot().receiveFailure).toMatchObject({ reason: 'code_damaged' });
    expect(page.history.calls).toHaveLength(1);
    expect(store.getSnapshot().linkArrivals).toBe(1);
  });

  it('leaves a fragment that holds no code alone', () => {
    const { store, page } = storeOf({ href: 'https://app.example.test/#top' });
    expect(page.history.calls).toEqual([]);
    expect(store.getSnapshot().linkArrivals).toBe(0);
    expect(store.getSnapshot().receiveFailure).toBeNull();
  });

  it('handles a code that arrives later through a change of the fragment', () => {
    const { code } = canonicalOf(3, INCIDENT_ID, {}, 'received');
    const { store, page } = storeOf();
    page.location.setRaw(linkOf(code), `#${code}`);
    page.events.dispatch();
    expect(store.getSnapshot().inbox.map((i) => i.code)).toEqual([code]);
    expect(store.getSnapshot().linkArrivals).toBe(1);
  });

  it('never sends the fragment anywhere: the gate is not called and nothing is sent', () => {
    const { code } = canonicalOf(3, INCIDENT_ID, {}, 'received');
    const { gate, sent } = storeOf({ href: linkOf(code) });
    expect(gate.calls).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe('sharing (Req 9.3, 15.5)', () => {
  it('records the channel on the Sighting and in the stored state', () => {
    const { store, storage } = storeOf();
    store.capture(bearingOf(1, { id: 'b', timeUtcMs: START_UTC_MS - 1000 }), 'new');
    const id = store.getSnapshot().open?.incident.entries[0]?.sighting.sightingId ?? '';
    expect(store.markShared(id, 'text').ok).toBe(true);
    expect(store.getSnapshot().open?.incident.entries[0]?.shared).toEqual([
      { channel: 'text', atUtcMs: START_UTC_MS },
    ]);
    expect(storage.items.get(STATE_KEY)).toContain('"channel":"text"');
  });

  it('counts the shares of this page session, which a reload does not keep', () => {
    const { store } = storeOf();
    store.capture(bearingOf(1, { id: 'b', timeUtcMs: START_UTC_MS - 1000 }), 'new');
    const id = store.getSnapshot().open?.incident.entries[0]?.sighting.sightingId ?? '';
    expect(store.getSnapshot().sharesThisSession).toBe(0);
    store.markShared(id, 'text');
    expect(store.getSnapshot().sharesThisSession).toBe(1);
  });

  it('sends to another simulated phone as text and records the memory channel', async () => {
    const got: string[] = [];
    const peer = {
      id: 'east',
      label: 'the phone at the east post',
      send: (code: string) => {
        got.push(code);
        return Promise.resolve({ ok: true as const, value: undefined });
      },
    };
    const { store } = storeOf({ mode: 'simulation', peers: [peer] });
    store.capture(bearingOf(1, { id: 'b', timeUtcMs: START_UTC_MS - 1000 }), 'new');
    const entry = store.getSnapshot().open?.incident.entries[0];
    const result = await store.sendToPeer(peer, entry?.sighting.sightingId ?? '');
    expect(result.ok).toBe(true);
    expect(got).toEqual([entry?.code]);
    expect(store.getSnapshot().open?.incident.entries[0]?.shared.map((r) => r.channel)).toEqual([
      'memory',
    ]);
  });

  it('refuses a link, a QR or the share sheet for a simulated smoke (simulation_not_shareable)', () => {
    const { store } = storeOf({ mode: 'device' });
    const a = canonicalOf(3, 'ZB4N8RTY5C', {}, 'received');
    store.paste(a.code);
    store.addFromInbox(a.code, true);
    for (const channel of ['link', 'qr', 'system_share'] as const) {
      expect(store.markShared(sightingIdOf(3), channel)).toMatchObject({
        ok: false,
        reason: 'simulation_not_shareable',
      });
    }
    expect(store.markShared(sightingIdOf(3), 'text').ok).toBe(true);
  });
});
