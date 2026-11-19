// The Storage adapter (Req 1.3, 4.4, design D4): the one key and the backup key, `storage_unavailable`
// for a storage that throws, and a memory storage that never touches the real one.

import { describe, expect, it } from 'vitest';
import { createFakeStorage } from '../test-support/fake-browser';
import { BACKUP_KEY, createMemoryStorage, createStorage, STATE_KEY } from './storage';

const sources = import.meta.glob<string>('./storage.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const SOURCE = Object.values(sources)[0] ?? '';

describe('createStorage over a Storage object', () => {
  it('writes and reads the one key', () => {
    const fake = createFakeStorage();
    const storage = createStorage(fake);
    expect(STATE_KEY).toBe('vigia.state');
    expect(storage.read()).toEqual({ ok: true, value: null });
    expect(storage.write('{"a":1}')).toEqual({ ok: true, value: undefined });
    expect(fake.items.get('vigia.state')).toBe('{"a":1}');
    expect(storage.read()).toEqual({ ok: true, value: '{"a":1}' });
  });

  it('keeps the backup under its own key, apart from the state', () => {
    const fake = createFakeStorage({ 'vigia.state': 'S' });
    const storage = createStorage(fake);
    expect(BACKUP_KEY).toBe('vigia.state.backup');
    expect(storage.readBackup()).toEqual({ ok: true, value: null });
    expect(storage.writeBackup('B')).toEqual({ ok: true, value: undefined });
    expect([...fake.items.entries()].sort()).toEqual([
      ['vigia.state', 'S'],
      ['vigia.state.backup', 'B'],
    ]);
    expect(storage.readBackup()).toEqual({ ok: true, value: 'B' });
  });

  it('remove() deletes the state and leaves the backup', () => {
    const fake = createFakeStorage({ 'vigia.state': 'S', 'vigia.state.backup': 'B' });
    const storage = createStorage(fake);
    expect(storage.remove()).toEqual({ ok: true, value: undefined });
    expect([...fake.items.keys()]).toEqual(['vigia.state.backup']);
  });

  it('is persistent', () => {
    expect(createStorage(createFakeStorage()).persistent).toBe(true);
  });

  it('a setItem that throws (quota) is storage_unavailable with the error name, not an exception', () => {
    const fake = createFakeStorage();
    fake.failing = { setItem: 'QuotaExceededError' };
    const storage = createStorage(fake);
    expect(storage.write('x')).toEqual({
      ok: false,
      reason: 'storage_unavailable',
      errorName: 'QuotaExceededError',
    });
    expect(storage.writeBackup('x')).toEqual({
      ok: false,
      reason: 'storage_unavailable',
      errorName: 'QuotaExceededError',
    });
  });

  it('a getItem or removeItem that throws is storage_unavailable', () => {
    const fake = createFakeStorage();
    fake.failing = { getItem: 'SecurityError', removeItem: 'SecurityError' };
    const storage = createStorage(fake);
    for (const result of [storage.read(), storage.readBackup(), storage.remove()]) {
      expect(result).toEqual({
        ok: false,
        reason: 'storage_unavailable',
        errorName: 'SecurityError',
      });
    }
  });

  it('calls the storage as a method of itself, as a browser needs', () => {
    const fake = createFakeStorage();
    const storage = createStorage(fake);
    expect(storage.write('x').ok).toBe(true);
    expect(storage.read().ok).toBe(true);
    expect(fake.calls).toEqual(['setItem vigia.state', 'getItem vigia.state']);
  });

  it('touches no other key', () => {
    const fake = createFakeStorage();
    const storage = createStorage(fake);
    storage.read();
    storage.write('x');
    storage.readBackup();
    storage.writeBackup('x');
    storage.remove();
    expect(new Set(fake.calls.map((c) => c.split(' ')[1]))).toEqual(
      new Set(['vigia.state', 'vigia.state.backup']),
    );
  });
});

describe('createMemoryStorage', () => {
  it('holds a state and a backup, and is not persistent', () => {
    const storage = createMemoryStorage();
    expect(storage.persistent).toBe(false);
    expect(storage.read()).toEqual({ ok: true, value: null });
    storage.write('S');
    storage.writeBackup('B');
    expect(storage.read()).toEqual({ ok: true, value: 'S' });
    expect(storage.readBackup()).toEqual({ ok: true, value: 'B' });
    storage.remove();
    expect(storage.read()).toEqual({ ok: true, value: null });
    expect(storage.readBackup()).toEqual({ ok: true, value: 'B' });
  });

  it('two memory storages are separate', () => {
    const a = createMemoryStorage();
    const b = createMemoryStorage();
    a.write('A');
    expect(b.read()).toEqual({ ok: true, value: null });
  });

  it('never touches the global localStorage', () => {
    let touched = 0;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        touched += 1;
        throw new Error('the memory storage read localStorage');
      },
    });
    try {
      const storage = createMemoryStorage();
      storage.write('x');
      storage.read();
      storage.remove();
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
      else Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
    expect(touched).toBe(0);
  });
});

describe('no storage event handler (Req 4.4)', () => {
  it('offers no way to hear another tab: no onExternalChange, no event listener', () => {
    for (const storage of [createStorage(createFakeStorage()), createMemoryStorage()]) {
      expect(Object.keys(storage).sort()).toEqual([
        'persistent',
        'read',
        'readBackup',
        'remove',
        'write',
        'writeBackup',
      ]);
    }
    expect(SOURCE).not.toBe('');
    expect(SOURCE).not.toMatch(/addEventListener|onExternalChange|'storage'/);
  });
});
