// The store (Req 7.4, 11.4, 12.1 to 12.7, 15.5; design D18): it runs the reducer, saves after each
// action that changes saved data, computes the Assessment once per change, and holds the
// memory-only parts (the user's choice, the Comparison) that are never saved.

import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../adapters/storage';
import { sightOf } from '../test-support/captures';
import { createFakeStorage } from '../test-support/fake-storage';
import { noiseFreeSights } from '../test-support/noise-free';
import { testEnvironment } from '../test-support/test-environment';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { serialiseState } from '../math/state/storage-format';
import { createStorage } from '../adapters/storage';
import { createNoniusStore } from './store';

const params = defaultParameters();
const D = DEG_TO_RAD;
const T = [Date.UTC(2026, 11, 21, 11, 40), Date.UTC(2026, 11, 21, 17, 40)];
const twoSights = () => noiseFreeSights(CATALOGUE_ORIGIN, T, 0, false, params);

const persistent = () => createStorage(createFakeStorage(), 'nonius.state');

function made(over = {}) {
  const t = testEnvironment({ storage: persistent(), ...over });
  return { t, store: createNoniusStore(t.environment) };
}

describe('the store at start', () => {
  it('starts empty with nothing saved when storage has nothing', () => {
    const { store } = made();
    const s = store.getSnapshot();
    expect(s.state.sights).toEqual([]);
    expect(s.assessment.ok && s.assessment.value.kind).toBe('empty');
    expect(s.notices).toEqual([]);
  });

  it('loads what was saved', () => {
    const storage = createStorage(createFakeStorage(), 'nonius.state');
    storage.write(serialiseState({ sights: [sightOf({ id: 'a' })], indexError: null }));
    const { store } = made({ storage });
    expect(store.getSnapshot().state.sights.map((s) => s.id)).toEqual(['a']);
  });

  it('says storage_corrupt with the count of dropped Sights and keeps the rest', () => {
    const text = JSON.parse(serialiseState({ sights: [sightOf({ id: 'a' })], indexError: null }));
    text.sights.push({ id: 'bad' });
    const storage = createStorage(createFakeStorage(), 'nonius.state');
    storage.write(JSON.stringify(text));
    const { store } = made({ storage });
    expect(store.getSnapshot().notices).toEqual([{ reason: 'storage_corrupt', count: 1 }]);
    expect(store.getSnapshot().state.sights).toHaveLength(1);
  });

  it('keeps a corrupt value once as the backup and starts empty', () => {
    const storage = createStorage(createFakeStorage(), 'nonius.state');
    storage.write('{nonsense');
    const { store } = made({ storage });
    expect(storage.readBackup()).toEqual({ ok: true, value: '{nonsense' });
    expect(store.getSnapshot().notices.map((n) => n.reason)).toEqual(['storage_corrupt']);
  });

  it('leaves a value of a newer version alone and writes nothing over it', () => {
    const storage = createStorage(createFakeStorage(), 'nonius.state');
    const newer = JSON.stringify({ format: 'nonius-state', version: 99 });
    storage.write(newer);
    const { store } = made({ storage });
    store.dispatch({ kind: 'capture', sight: sightOf({ id: 'a' }) });
    expect(storage.read()).toEqual({ ok: true, value: newer });
    expect(store.getSnapshot().notices.map((n) => n.reason)).toContain(
      'storage_version_unsupported',
    );
    expect(store.getSnapshot().state.sights).toHaveLength(1);
  });

  it('says storage_unavailable for a storage that is not persistent, and keeps working in memory', () => {
    const { store } = made({ storage: createMemoryStorage() });
    store.dispatch({ kind: 'capture', sight: sightOf({ id: 'a' }) });
    expect(store.getSnapshot().notices.map((n) => n.reason)).toContain('storage_unavailable');
    expect(store.getSnapshot().state.sights).toHaveLength(1);
  });
});

describe('saving', () => {
  it('saves after each action that changes saved data, and not after one that does not', () => {
    const fake = createFakeStorage();
    const storage = createStorage(fake, 'nonius.state');
    const { store } = made({ storage });
    store.dispatch({ kind: 'capture', sight: sightOf({ id: 'a' }) });
    const afterCapture = fake.items.get('nonius.state');
    expect(afterCapture).toContain('"id":"a"');
    store.dispatch({ kind: 'delete', id: 'zzz' });
    expect(fake.items.get('nonius.state')).toBe(afterCapture);
    store.dispatch({ kind: 'delete', id: 'a' });
    expect(fake.items.get('nonius.state')).not.toContain('"id":"a"');
  });

  it('shows storage_unavailable when a write throws, and keeps the state', () => {
    const fake = createFakeStorage();
    const { store } = made({ storage: createStorage(fake, 'nonius.state') });
    fake.failing = { setItem: 'QuotaExceededError' };
    store.dispatch({ kind: 'capture', sight: sightOf({ id: 'a' }) });
    expect(store.getSnapshot().notices.map((n) => n.reason)).toContain('storage_unavailable');
    expect(store.getSnapshot().state.sights).toHaveLength(1);
  });

  it('reports a refused action as the failure of that call and changes nothing', () => {
    const { store } = made();
    store.dispatch({ kind: 'capture', sight: sightOf({ id: 'a' }) });
    const before = store.getSnapshot();
    const r = store.dispatch({ kind: 'capture', sight: sightOf({ id: 'a' }) });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_observation' });
    expect(store.getSnapshot().state).toBe(before.state);
  });

  it('notifies subscribers once per change and not after unsubscribing', () => {
    const { store } = made();
    let n = 0;
    const off = store.subscribe(() => (n += 1));
    store.dispatch({ kind: 'capture', sight: sightOf({ id: 'a' }) });
    expect(n).toBe(1);
    off();
    store.dispatch({ kind: 'capture', sight: sightOf({ id: 'b' }) });
    expect(n).toBe(1);
  });
});

describe('the memory-only parts', () => {
  it('holds the user’s choice of place for the used set, and clears it when the set changes', () => {
    const { store } = made();
    for (const s of twoSights()) store.dispatch({ kind: 'capture', sight: s });
    const a = store.getSnapshot().assessment;
    expect(a.ok && a.value.kind).toBe('two_places');
    store.chooseUserPlace(1);
    const chosen = store.getSnapshot().assessment;
    expect(chosen.ok && chosen.value.kind === 'fix' && chosen.value.choice.kind).toBe('user');
    store.undoChoice();
    const undone = store.getSnapshot().assessment;
    expect(undone.ok && undone.value.kind).toBe('two_places');
    store.chooseUserPlace(0);
    store.dispatch({ kind: 'delete', id: 's01' });
    expect(store.getSnapshot().userChoice).toBeNull();
  });

  it('never saves the choice or the Comparison, and the state holds no Position', async () => {
    const fake = createFakeStorage();
    const t = testEnvironment({ storage: createStorage(fake, 'nonius.state') });
    const store = createNoniusStore(t.environment);
    for (const s of noiseFreeSights(
      CATALOGUE_ORIGIN,
      [...T, Date.UTC(2026, 11, 21, 14, 40)],
      0,
      true,
      params,
    )) {
      store.dispatch({ kind: 'capture', sight: s });
    }
    store.chooseUserPlace(0);
    await store.compareWithGps();
    const saved = fake.items.get('nonius.state') ?? '';
    expect(saved).not.toContain('latRad');
    expect(saved).not.toContain('userChoice');
    expect(saved).not.toContain('comparison');
    expect(JSON.stringify(store.getSnapshot().state)).not.toContain('latRad');
  });

  it('asks the location once per Comparison, keeps the result, and drops it when the Fix changes', async () => {
    const { t, store } = made();
    for (const s of noiseFreeSights(
      CATALOGUE_ORIGIN,
      [...T, Date.UTC(2026, 11, 21, 14, 40)],
      -3 * D,
      true,
      params,
    )) {
      store.dispatch({ kind: 'capture', sight: s });
    }
    expect(t.locationCalls.count).toBe(0);
    await store.compareWithGps();
    expect(t.locationCalls.count).toBe(1);
    expect(store.getSnapshot().comparison).not.toBeNull();
    store.dispatch({ kind: 'delete', id: 's00' });
    expect(store.getSnapshot().comparison).toBeNull();
  });

  it('keeps the failure of a location beside the control and no Comparison', async () => {
    const { t, store } = made();
    for (const s of twoSights()) store.dispatch({ kind: 'capture', sight: s });
    store.chooseUserPlace(0);
    t.locationResult = { ok: false, reason: 'permission_denied' };
    await store.compareWithGps();
    expect(store.getSnapshot().comparison).toBeNull();
    expect(store.getSnapshot().comparisonFailure).toMatchObject({ reason: 'permission_denied' });
  });

  it('asks nothing when there is no Shown Fix', async () => {
    const { t, store } = made();
    await store.compareWithGps();
    expect(t.locationCalls.count).toBe(0);
  });
});
