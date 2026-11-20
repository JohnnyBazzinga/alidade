// A fake of the browser's Storage object, for tests (test support, not exported).

import type { StorageLike } from '../adapters/storage';

export interface FakeStorage extends StorageLike {
  readonly items: Map<string, string>;
  /** The error name each method throws; absent: the method works. */
  failing: { getItem?: string; setItem?: string; removeItem?: string };
}

export function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const items = new Map(Object.entries(initial));
  const fake: FakeStorage = {
    items,
    failing: {},
    getItem(key) {
      if (fake.failing.getItem !== undefined)
        throw Object.assign(new Error('x'), { name: fake.failing.getItem });
      return items.get(key) ?? null;
    },
    setItem(key, value) {
      if (fake.failing.setItem !== undefined)
        throw Object.assign(new Error('x'), { name: fake.failing.setItem });
      items.set(key, value);
    },
    removeItem(key) {
      if (fake.failing.removeItem !== undefined)
        throw Object.assign(new Error('x'), { name: fake.failing.removeItem });
      items.delete(key);
    },
  };
  return fake;
}
