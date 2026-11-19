// The Page adapter (Req 1.3, 10.3, design §6): the page's own address and fragment, the
// replacement of the address once a code has been read from it, and a change of the fragment. It
// takes the browser's location, history and event target as arguments and reads no global.
//
// `replaceAddress` returns nothing: no reason of the closed set (Req 2.2) says "the address could
// not be replaced", so a history that throws is swallowed here and the fragment stays in the
// address bar. The screens read `address()` afterwards if they need to know.

import type { Unsubscribe } from '../math/transport/transport';

export interface LocationLike {
  readonly href: string;
  readonly hash: string;
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
  /** Replaces the current history entry with this address, with no state. A `#` and what follows are dropped. */
  replaceAddress(addressWithoutFragment: string): void;
  onFragmentChange(listener: () => void): Unsubscribe;
}

export function createPage(
  location: LocationLike,
  history: HistoryLike,
  events: EventsLike,
): VigiaPage {
  return {
    address() {
      try {
        return String(location.href);
      } catch {
        return '';
      }
    },
    fragment() {
      try {
        const hash = String(location.hash);
        return hash.startsWith('#') ? hash.slice(1) : hash;
      } catch {
        return '';
      }
    },
    replaceAddress(addressWithoutFragment) {
      const cut = addressWithoutFragment.indexOf('#');
      const address = cut < 0 ? addressWithoutFragment : addressWithoutFragment.slice(0, cut);
      try {
        history.replaceState(null, '', address);
      } catch {
        // See the note at the top of the file.
      }
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
