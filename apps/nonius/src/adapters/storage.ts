// The Storage adapter (Req 1.3, 12.1, 12.6; design D18): the one module that names `localStorage`'s
// type and keys. It takes the browser's Storage object as an argument and reads no global. A
// Storage that throws (a full quota, a browser that denies it) is `storage_unavailable` and never
// an exception (Req 2.1). With two tabs open the last to write wins.

import { err, ok, type NoniusFailure, type NoniusResult } from '../result';

/** The part of the browser's Storage this adapter uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The key of the phone's own saved state (design §5). */
export const DEVICE_KEY = 'nonius.state';
/** The key of Simulation mode's saved state: never mixed with the phone's (Req 12.1). */
export const SIMULATION_KEY = 'nonius.simulation.state';

export interface NoniusStorage {
  read(): NoniusResult<string | null>;
  write(text: string): NoniusResult<void>;
  remove(): NoniusResult<void>;
  readBackup(): NoniusResult<string | null>;
  writeBackup(text: string): NoniusResult<void>;
  removeBackup(): NoniusResult<void>;
  /** False for the memory storage: closing the page loses what it holds. */
  readonly persistent: boolean;
}

function failure(error: unknown): NoniusFailure {
  const name: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'name') : undefined;
  return typeof name === 'string' && name !== ''
    ? err('storage_unavailable', { errorName: name })
    : err('storage_unavailable');
}

/** The storage over the browser's Storage object, under `key` and `<key>.backup`. */
export function createStorage(storage: StorageLike, key: string): NoniusStorage {
  const backupKey = `${key}.backup`;
  const read = (k: string): NoniusResult<string | null> => {
    try {
      const value: unknown = storage.getItem(k);
      return ok(typeof value === 'string' ? value : null);
    } catch (error) {
      return failure(error);
    }
  };
  const write = (k: string, text: string): NoniusResult<void> => {
    try {
      storage.setItem(k, text);
      return ok(undefined);
    } catch (error) {
      return failure(error);
    }
  };
  const remove = (k: string): NoniusResult<void> => {
    try {
      storage.removeItem(k);
      return ok(undefined);
    } catch (error) {
      return failure(error);
    }
  };
  return {
    read: () => read(key),
    write: (text) => write(key, text),
    remove: () => remove(key),
    readBackup: () => read(backupKey),
    writeBackup: (text) => write(backupKey, text),
    removeBackup: () => remove(backupKey),
    persistent: true,
  };
}

/** The object that holds the browser's Storage: the page's global object, passed in. */
export interface StorageHost {
  readonly localStorage?: StorageLike | null | undefined;
}

/**
 * The storage over the Storage object of `host`, or the memory storage when the browser has none
 * or denies reading it. The memory storage is not `persistent`, which the store reports as
 * `storage_unavailable`.
 */
export function createStorageFromHost(host: StorageHost, key: string = DEVICE_KEY): NoniusStorage {
  try {
    const storage = host.localStorage;
    if (
      storage === null ||
      storage === undefined ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function' ||
      typeof storage.removeItem !== 'function'
    ) {
      return createMemoryStorage();
    }
    return createStorage(storage, key);
  } catch {
    return createMemoryStorage();
  }
}

/** A storage in memory: Simulation mode's, and the fallback when the browser's is unavailable. */
export function createMemoryStorage(): NoniusStorage {
  const items = new Map<string, string>();
  const slot = (k: string) => ({
    read: () => ok(items.get(k) ?? null),
    write: (text: string) => {
      items.set(k, text);
      return ok(undefined);
    },
    remove: () => {
      items.delete(k);
      return ok(undefined);
    },
  });
  const state = slot('state');
  const backup = slot('backup');
  return {
    read: state.read,
    write: state.write,
    remove: state.remove,
    readBackup: backup.read,
    writeBackup: backup.write,
    removeBackup: backup.remove,
    persistent: false,
  };
}
