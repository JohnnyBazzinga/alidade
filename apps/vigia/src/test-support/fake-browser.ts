// Fakes of the browser objects the Adapters wrap (test support, not exported; tasks 11.2): the
// Storage, the navigator's clipboard and share, the crypto object, and the page's location,
// history and events. Each records what it was asked and can be made to fail. Each method checks
// that it was called as a method of its object (as a browser does: `navigator.share` called
// without its `navigator` throws "Illegal invocation"), so an adapter that detaches a method fails.

import type { NavigatorLike } from '../adapters/clipboard';
import type { EventsLike, HistoryLike, LocationLike } from '../adapters/page-address';
import type { CryptoLike } from '../adapters/random';
import type { StorageLike } from '../adapters/storage';

function illegal(): never {
  throw new TypeError('Illegal invocation');
}

function named(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

// --- Storage -------------------------------------------------------------------------------

export interface FakeStorage extends StorageLike {
  readonly items: Map<string, string>;
  /** Every call, as `method key`. */
  readonly calls: string[];
  /** Methods that throw, and the name of what they throw. */
  failing: Partial<Record<'getItem' | 'setItem' | 'removeItem', string>>;
}

export function createFakeStorage(initial: Readonly<Record<string, string>> = {}): FakeStorage {
  const storage: FakeStorage = {
    items: new Map(Object.entries(initial)),
    calls: [],
    failing: {},
    getItem(this: unknown, key: string) {
      if (this !== storage) illegal();
      storage.calls.push(`getItem ${key}`);
      if (storage.failing.getItem !== undefined) throw named(storage.failing.getItem, 'denied');
      return storage.items.get(key) ?? null;
    },
    setItem(this: unknown, key: string, value: string) {
      if (this !== storage) illegal();
      storage.calls.push(`setItem ${key}`);
      if (storage.failing.setItem !== undefined) throw named(storage.failing.setItem, 'full');
      storage.items.set(key, value);
    },
    removeItem(this: unknown, key: string) {
      if (this !== storage) illegal();
      storage.calls.push(`removeItem ${key}`);
      if (storage.failing.removeItem !== undefined)
        throw named(storage.failing.removeItem, 'denied');
      storage.items.delete(key);
    },
  };
  return storage;
}

// --- clipboard and share -------------------------------------------------------------------

export interface FakeNavigatorOptions {
  /** `absent`: no `navigator.clipboard`; `reject`: `writeText` rejects; `throw`: it throws. */
  readonly clipboard?: 'ok' | 'absent' | 'reject' | 'throw';
  readonly share?: 'ok' | 'absent' | 'reject' | 'throw';
}

export interface FakeNavigator extends NavigatorLike {
  readonly written: string[];
  readonly shared: string[];
}

export function createFakeNavigator(options: FakeNavigatorOptions = {}): FakeNavigator {
  const clipboardMode = options.clipboard ?? 'ok';
  const shareMode = options.share ?? 'ok';
  const written: string[] = [];
  const shared: string[] = [];
  const clipboard = {
    writeText(this: unknown, text: string): Promise<void> {
      if (this !== clipboard) illegal();
      if (clipboardMode === 'throw') throw named('SecurityError', 'sync');
      if (clipboardMode === 'reject') return Promise.reject(named('NotAllowedError', 'denied'));
      written.push(text);
      return Promise.resolve();
    },
  };
  const navigator: FakeNavigator = {
    written,
    shared,
    clipboard: clipboardMode === 'absent' ? undefined : clipboard,
    share:
      shareMode === 'absent'
        ? undefined
        : function share(this: unknown, data: { readonly url: string }): Promise<void> {
            if (this !== navigator) illegal();
            if (shareMode === 'throw') throw named('SecurityError', 'sync');
            if (shareMode === 'reject') return Promise.reject(named('AbortError', 'cancelled'));
            shared.push(data.url);
            return Promise.resolve();
          },
  };
  return navigator;
}

// --- crypto --------------------------------------------------------------------------------

export interface FakeCrypto extends CryptoLike {
  /** The sizes asked for, in order. */
  readonly asked: number[];
  failing: boolean;
}

/** A crypto object whose bytes are 0, 1, 2 … (mod 256) continuing across calls. */
export function createFakeCrypto(): FakeCrypto {
  let next = 0;
  const crypto: FakeCrypto = {
    asked: [],
    failing: false,
    getRandomValues(this: unknown, array: Uint8Array): Uint8Array {
      if (this !== crypto) illegal();
      crypto.asked.push(array.length);
      if (crypto.failing) throw named('QuotaExceededError', 'too many');
      for (let i = 0; i < array.length; i += 1) {
        array[i] = next % 256;
        next += 1;
      }
      return array;
    },
  };
  return crypto;
}

// --- the page --------------------------------------------------------------------------------

export interface FakePage {
  readonly location: LocationLike & {
    href: string;
    hash: string;
    /** Every value written to `hash`, in order. */
    readonly hashWrites: string[];
    /** Writing `hash` throws. */
    hashFailing: boolean;
    /** Sets the two fields apart, as no browser would: for the hostile inputs. */
    setRaw(href: string, hash: string): void;
  };
  readonly history: HistoryLike & {
    /** The arguments of every `replaceState`. */
    readonly calls: { state: unknown; unused: string; url: string | undefined }[];
    /** `replaceState` throws. */
    failing: boolean;
    /** `replaceState` returns without changing the address. */
    ignoring: boolean;
  };
  readonly events: EventsLike & {
    readonly listeners: Set<() => void>;
    /** Fires `hashchange` at every listener. */
    dispatch(): void;
  };
}

export function createFakePage(href = 'https://app.example.test/'): FakePage {
  // `href` and `hash` are plain fields that a test may set apart; writing `hash` through the
  // location, and a `replaceState` that succeeds, change both together, as a browser does.
  const hashOf = (address: string) =>
    address.includes('#') ? address.slice(address.indexOf('#')) : '';
  let hashField = hashOf(href);
  const location: FakePage['location'] = {
    href,
    hashWrites: [],
    hashFailing: false,
    setRaw(rawHref, rawHash) {
      location.href = rawHref;
      hashField = rawHash;
    },
    get hash() {
      return hashField;
    },
    set hash(value: string) {
      location.hashWrites.push(value);
      if (location.hashFailing) throw named('SecurityError', 'denied');
      const bare = value.startsWith('#') ? value.slice(1) : value;
      const cut = location.href.indexOf('#');
      location.href = `${cut < 0 ? location.href : location.href.slice(0, cut)}#${bare}`;
      hashField = bare === '' ? '' : `#${bare}`;
    },
  };
  const calls: FakePage['history']['calls'] = [];
  const history: FakePage['history'] = {
    calls,
    failing: false,
    ignoring: false,
    replaceState(this: unknown, state: unknown, unused: string, url?: string) {
      if (this !== history) illegal();
      calls.push({ state, unused, url });
      if (history.failing) throw named('SecurityError', 'denied');
      if (history.ignoring || url === undefined) return;
      location.href = url;
      hashField = hashOf(url);
    },
  };
  const listeners = new Set<() => void>();
  const events: FakePage['events'] = {
    listeners,
    addEventListener(this: unknown, type, listener) {
      if (this !== events) illegal();
      if (type === 'hashchange') listeners.add(listener);
    },
    removeEventListener(this: unknown, type, listener) {
      if (this !== events) illegal();
      if (type === 'hashchange') listeners.delete(listener);
    },
    dispatch() {
      for (const listener of [...listeners]) listener();
    },
  };
  return { location, history, events };
}
