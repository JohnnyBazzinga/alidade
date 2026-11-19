// A fake `fetch` for the tests of the Network gate (test support, not exported). It records every
// call, answers from a behaviour chosen per call, and honours the abort signal as the browser's
// does: a call that hangs rejects with an `AbortError` when its signal is aborted.

import type { FetchInit, FetchLike, FetchResponseLike } from '../adapters/network-gate';

export type FakeBehaviour =
  /** A rejected promise: the network is down, a redirect was refused. */
  | { readonly kind: 'reject'; readonly error: unknown }
  /** `fetchLike` itself throws before returning a promise. */
  | { readonly kind: 'throw'; readonly error: unknown }
  /** Never answers; rejects with an `AbortError` when the signal is aborted. */
  | { readonly kind: 'hang' }
  /** A response whose body is a stream of chunks (`chunks`), then, if `hangAfter`, never ends. */
  | {
      readonly kind: 'stream';
      readonly status: number;
      readonly chunks: readonly Uint8Array[];
      readonly hangAfter?: boolean;
      readonly failAfter?: boolean;
    }
  /** A response with no stream: only `text()`. */
  | {
      readonly kind: 'text';
      readonly status: number;
      readonly text: string;
      readonly textFails?: boolean;
    };

export interface FakeCall {
  readonly url: string;
  readonly init: FetchInit;
}

export interface FakeFetch {
  readonly fetchLike: FetchLike;
  readonly calls: FakeCall[];
  /** How many chunks the gate read, over all calls. */
  chunksRead: number;
  /** How many times a reader was cancelled. */
  cancelled: number;
}

function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/** Rejects `promise` with an `AbortError` when `signal` aborts. */
function untilAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(abortError());
    else signal.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

export function createFakeFetch(
  behave: (url: string, init: FetchInit) => FakeBehaviour = () => ({
    kind: 'text',
    status: 200,
    text: 'ok',
  }),
): FakeFetch {
  const fake: FakeFetch = {
    calls: [],
    chunksRead: 0,
    cancelled: 0,
    fetchLike: (url, init) => {
      fake.calls.push({ url, init });
      const behaviour = behave(url, init);
      switch (behaviour.kind) {
        case 'throw':
          throw behaviour.error;
        case 'reject':
          return Promise.reject(behaviour.error);
        case 'hang':
          return untilAbort(init.signal);
        case 'text': {
          const response: FetchResponseLike = {
            ok: behaviour.status >= 200 && behaviour.status < 300,
            status: behaviour.status,
            body: null,
            text: () =>
              behaviour.textFails === true
                ? Promise.reject(new Error('text failed'))
                : Promise.resolve(behaviour.text),
          };
          return Promise.resolve(response);
        }
        case 'stream': {
          let next = 0;
          const response: FetchResponseLike = {
            ok: behaviour.status >= 200 && behaviour.status < 300,
            status: behaviour.status,
            body: {
              getReader: () => ({
                read: () => {
                  const chunk = behaviour.chunks[next];
                  if (chunk !== undefined) {
                    next += 1;
                    fake.chunksRead += 1;
                    return Promise.resolve({ done: false, value: chunk });
                  }
                  if (behaviour.failAfter === true)
                    return Promise.reject(new Error('stream broke'));
                  if (behaviour.hangAfter === true) return untilAbort(init.signal);
                  return Promise.resolve({ done: true, value: undefined });
                },
                cancel: () => {
                  fake.cancelled += 1;
                  return Promise.resolve();
                },
              }),
            },
            text: () => Promise.reject(new Error('text() after a stream')),
          };
          return Promise.resolve(response);
        }
      }
    },
  };
  return fake;
}

/** The bytes of a text, for a stream chunk. */
export function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
