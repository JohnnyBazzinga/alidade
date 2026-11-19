// The manual Transport (Req 9.1, 10.1, design D12, §7.19): the link, the QR and the text are one
// Transport. Its `send` hands the code to `present` (the Share sheet opens with the link, the QR and
// the text); its receive side is `receive`, called by the paste box and by the page's fragment
// handler. It never reads the text it carries.

import type { Transport, TransportStatus, Unsubscribe } from '../../math/transport/transport';
import { err, ok, type VigiaResult } from '../../result';

export interface ManualTransport extends Transport {
  /** Delivers a text that reached the phone by hand (a paste, an opened link). */
  receive(text: string): void;
}

export interface ManualTransportOptions {
  /** Shows the code to the user (the Share sheet). */
  readonly present: (code: string) => void;
}

function tell<T>(listeners: ReadonlySet<(value: T) => void>, value: T): void {
  for (const listener of [...listeners]) {
    try {
      listener(value);
    } catch {
      // A listener's failure is its own: the others still hear.
    }
  }
}

export function createManualTransport(options: ManualTransportOptions): ManualTransport {
  const receivers = new Set<(text: string) => void>();
  const watchers = new Set<(status: TransportStatus) => void>();
  let stopped = false;
  const status = (): TransportStatus =>
    stopped ? { kind: 'unavailable', reason: 'transport_unavailable' } : { kind: 'available' };
  const subscribe = <T>(set: Set<T>, listener: T): Unsubscribe => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };
  return {
    send(code): Promise<VigiaResult<void>> {
      if (stopped) return Promise.resolve(err('transport_unavailable'));
      try {
        options.present(code);
        return Promise.resolve(ok(undefined));
      } catch (error) {
        const name: unknown =
          typeof error === 'object' && error !== null ? Reflect.get(error, 'name') : undefined;
        return Promise.resolve(
          typeof name === 'string' && name !== ''
            ? err('transport_unavailable', { errorName: name })
            : err('transport_unavailable'),
        );
      }
    },
    receive(text) {
      if (!stopped) tell(receivers, text);
    },
    onReceive: (listener) => subscribe(receivers, listener),
    onStatus(listener) {
      const off = subscribe(watchers, listener);
      listener(status());
      return off;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      tell(watchers, status());
    },
  };
}
