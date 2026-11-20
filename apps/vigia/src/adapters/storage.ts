// The Storage adapter (Req 1.3, 4.4, design D4, §6): the one module that names `localStorage`'s
// type and keys. It takes the browser's Storage object as an argument and reads no global. A
// Storage that throws (a full quota, a browser that denies it) is `storage_unavailable` and
// never an exception (Req 2.1).
//
// There is no handler for changes made by another tab: with two tabs open the last to write wins
// and the other's changes are seen on the next load (Req 4.4).

import { err, ok, type VigiaResult } from '../result';

/** The part of the browser's Storage this adapter uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The key of the saved state (design §7.5). */
export const STATE_KEY = 'vigia.state';
/** The key of the one copy kept of a saved value that could not be read (design D4). */
export const BACKUP_KEY = 'vigia.state.backup';

export interface VigiaStorage {
  read(): VigiaResult<string | null>;
  write(text: string): VigiaResult<void>;
  remove(): VigiaResult<void>;
  readBackup(): VigiaResult<string | null>;
  writeBackup(text: string): VigiaResult<void>;
  /** Deletes the backup copy: "Delete everything on this phone" leaves no key of the app. */
  removeBackup(): VigiaResult<void>;
  /** False for the memory storage: closing the page loses what it holds. */
  readonly persistent: boolean;
}

function failure(error: unknown) {
  const name: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'name') : undefined;
  return typeof name === 'string' && name !== ''
    ? err('storage_unavailable', { errorName: name })
    : err('storage_unavailable');
}

/** The storage over the browser's Storage object. */
export function createStorage(storage: StorageLike): VigiaStorage {
  const read = (key: string): VigiaResult<string | null> => {
    try {
      const value: unknown = storage.getItem(key);
      return ok(typeof value === 'string' ? value : null);
    } catch (error) {
      return failure(error);
    }
  };
  const write = (key: string, text: string): VigiaResult<void> => {
    try {
      storage.setItem(key, text);
      return ok(undefined);
    } catch (error) {
      return failure(error);
    }
  };
  const remove = (key: string): VigiaResult<void> => {
    try {
      storage.removeItem(key);
      return ok(undefined);
    } catch (error) {
      return failure(error);
    }
  };
  return {
    read: () => read(STATE_KEY),
    write: (text) => write(STATE_KEY, text),
    remove: () => remove(STATE_KEY),
    readBackup: () => read(BACKUP_KEY),
    writeBackup: (text) => write(BACKUP_KEY, text),
    removeBackup: () => remove(BACKUP_KEY),
    persistent: true,
  };
}

/** The object that holds the browser's Storage: the page's global object, passed in. */
export interface StorageHost {
  readonly localStorage?: StorageLike | null | undefined;
}

/**
 * The storage over the Storage object of `host`, or the memory storage when the browser has none
 * or denies reading it (reading `localStorage` throws in some browsers with storage disabled).
 * The memory storage is not `persistent`, which the store reports as `storage_unavailable`.
 */
export function createStorageFromHost(host: StorageHost): VigiaStorage {
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
    return createStorage(storage);
  } catch {
    return createMemoryStorage();
  }
}

/** A storage in memory: Simulation mode's, and the fallback when the browser's is unavailable. */
export function createMemoryStorage(): VigiaStorage {
  const items = new Map<string, string>();
  return {
    read: () => ok(items.get(STATE_KEY) ?? null),
    write: (text) => {
      items.set(STATE_KEY, text);
      return ok(undefined);
    },
    remove: () => {
      items.delete(STATE_KEY);
      return ok(undefined);
    },
    readBackup: () => ok(items.get(BACKUP_KEY) ?? null),
    writeBackup: (text) => {
      items.set(BACKUP_KEY, text);
      return ok(undefined);
    },
    removeBackup: () => {
      items.delete(BACKUP_KEY);
      return ok(undefined);
    },
    persistent: false,
  };
}
