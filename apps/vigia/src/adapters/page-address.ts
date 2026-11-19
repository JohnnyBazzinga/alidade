// The Page adapter (Req 1.3, 10.3, design §6): the page's own address and fragment, the
// replacement of the address once a code has been read from it, and a change of the fragment. It
// takes the browser's location, history and event target as arguments and reads no global.
//
// `replaceAddress` reports whether the fragment is gone from the address (the lead's decision after
// task group 12). When the history call throws, or returns and leaves the fragment, it falls back
// to clearing the fragment through the location. No reason of the closed set (Req 2.2) says "the
// address could not be replaced": a `false` is a statement of the Inbox sheet, not a failure.

import type { Unsubscribe } from '../math/transport/transport';

export interface LocationLike {
  readonly href: string;
  /** Written only by the fallback of `replaceAddress`. */
  hash: string;
}

export interface HistoryLike {
  replaceState(state: unknown, unused: string, url?: string): void;
}

export interface EventsLike {
  addEventListener(type: 'hashchange', listener: () => void): void;
  removeEventListener(type: 'hashchange', listener: () => void): void;
}

export interface VigiaPage {
  /** The page's address, with its query and fragment. */
  address(): string;
  /** The text after `#`, or `''`. */
  fragment(): string;
  /**
   * Replaces the current history entry with this address, with no state. A `#` and what follows
   * are dropped. Returns whether the address holds no fragment afterwards.
   */
  replaceAddress(addressWithoutFragment: string): boolean;
  onFragmentChange(listener: () => void): Unsubscribe;
}

export function createPage(
  location: LocationLike,
  history: HistoryLike,
  events: EventsLike,
): VigiaPage {
  /** The fragment, or `null` when the location cannot be read (then it is not known to be gone). */
  const readFragment = (): string | null => {
    try {
      const hash = String(location.hash);
      return hash.startsWith('#') ? hash.slice(1) : hash;
    } catch {
      return null;
    }
  };
  return {
    address() {
      try {
        return String(location.href);
      } catch {
        return '';
      }
    },
    fragment() {
      return readFragment() ?? '';
    },
    replaceAddress(addressWithoutFragment) {
      const cut = addressWithoutFragment.indexOf('#');
      const address = cut < 0 ? addressWithoutFragment : addressWithoutFragment.slice(0, cut);
      try {
        history.replaceState(null, '', address);
      } catch {
        // See the note at the top of the file: the fallback below.
      }
      if (readFragment() === '') return true;
      try {
        location.hash = '';
      } catch {
        // The location refused as well: the fragment stays, and the caller is told.
      }
      return readFragment() === '';
    },
    onFragmentChange(listener) {
      const wrapped = (): void => {
        try {
          listener();
        } catch {
          // A listener's failure is its own.
        }
      };
      events.addEventListener('hashchange', wrapped);
      return () => {
        events.removeEventListener('hashchange', wrapped);
      };
    },
  };
}
