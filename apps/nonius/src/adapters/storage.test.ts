// The Storage adapter (Req 1.3, 12.1, 12.6; design D18): a key and its backup, `storage_unavailable`
// for a storage that throws, a memory storage that never touches the real one.

import { describe, expect, it } from 'vitest';
import { createFakeStorage } from '../test-support/fake-storage';
import {
  createMemoryStorage,
  createStorage,
  createStorageFromHost,
  DEVICE_KEY,
  SIMULATION_KEY,
} from './storage';

const OK = { ok: true, value: undefined };

describe('createStorage', () => {
  it('uses the two keys of the design, apart from each other', () => {
    expect(DEVICE_KEY).toBe('nonius.state');
    expect(SIMULATION_KEY).toBe('nonius.simulation.state');
  });

  it('writes and reads its key and keeps the backup once under <key>.backup', () => {
    const fake = createFakeStorage();
    const s = createStorage(fake, DEVICE_KEY);
    expect(s.read()).toEqual({ ok: true, value: null });
    expect(s.write('S')).toEqual(OK);
    expect(s.readBackup()).toEqual({ ok: true, value: null });
    expect(s.writeBackup('B')).toEqual(OK);
    expect([...fake.items.entries()].sort()).toEqual([
      ['nonius.state', 'S'],
      ['nonius.state.backup', 'B'],
    ]);
    expect(s.persistent).toBe(true);
  });

  it('a simulation storage and a device storage on one object never touch each other', () => {
    const fake = createFakeStorage();
    createStorage(fake, DEVICE_KEY).write('D');
    createStorage(fake, SIMULATION_KEY).write('S');
    expect(createStorage(fake, DEVICE_KEY).read()).toEqual({ ok: true, value: 'D' });
    expect(createStorage(fake, SIMULATION_KEY).read()).toEqual({ ok: true, value: 'S' });
  });

  it('remove() and removeBackup() each delete their own key only', () => {
    const fake = createFakeStorage({ 'nonius.state': 'S', 'nonius.state.backup': 'B' });
    const s = createStorage(fake, DEVICE_KEY);
    s.remove();
    expect([...fake.items.keys()]).toEqual(['nonius.state.backup']);
    s.removeBackup();
    expect(fake.items.size).toBe(0);
  });

  it.each(['getItem', 'setItem', 'removeItem'] as const)(
    'a %s that throws is storage_unavailable with the error name, never an exception',
    (method) => {
      const fake = createFakeStorage();
      fake.failing = { [method]: 'SecurityError' };
      const s = createStorage(fake, DEVICE_KEY);
      const result =
        method === 'getItem' ? s.read() : method === 'setItem' ? s.write('x') : s.remove();
      expect(result).toEqual({
        ok: false,
        reason: 'storage_unavailable',
        errorName: 'SecurityError',
      });
    },
  );

  it('a getItem that returns something that is not text reads as nothing', () => {
    const odd = {
      getItem: () => 5 as unknown as string,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(createStorage(odd, DEVICE_KEY).read()).toEqual({ ok: true, value: null });
  });
});

describe('createStorageFromHost and createMemoryStorage', () => {
  it('uses the memory storage when the host has none, or reading it throws', () => {
    expect(createStorageFromHost({}).persistent).toBe(false);
    const hostile = {
      get localStorage(): never {
        throw new Error('denied');
      },
    };
    expect(createStorageFromHost(hostile, DEVICE_KEY).persistent).toBe(false);
  });

  it('uses the host storage when it is whole', () => {
    expect(
      createStorageFromHost({ localStorage: createFakeStorage() }, DEVICE_KEY).persistent,
    ).toBe(true);
  });

  it('the memory storage holds state and backup and is not persistent', () => {
    const m = createMemoryStorage();
    m.write('S');
    m.writeBackup('B');
    expect(m.read()).toEqual({ ok: true, value: 'S' });
    expect(m.readBackup()).toEqual({ ok: true, value: 'B' });
    m.remove();
    m.removeBackup();
    expect(m.read()).toEqual({ ok: true, value: null });
    expect(m.persistent).toBe(false);
  });
});
