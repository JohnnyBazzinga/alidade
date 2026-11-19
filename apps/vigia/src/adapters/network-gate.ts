// The Network gate (Req 1.3, 11.1, 11.3, 11.7, design D14, §7.14): the one module that names
// `fetch` and the other network calls. A request is decided first by `decideRequest` (a refusal
// returns before anything is sent); an allowed one is sent with no cookie, no credentials, no
// `Referer`, no header and no body, with a timeout and a limit on the size of the response. The
// gate's only clients are the Overlays, so a failure of transport is `overlay_unavailable` with the
// cause in `errorName`.
//
// The browser's `fetch` is an argument (`FetchLike`), as the Timer is: the gate reads no global
// of the page. `AbortController`, `TextEncoder` and `TextDecoder` are the language's own.

import type { Timer, TimerHandle } from '@alidade/ui';
import { decideRequest } from '../math/network/gate-decision';
import type { HostList } from '../math/network/host-list';
import { checkParameters, type VigiaParameters } from '../math/parameters';
import { err, ok, type VigiaResult } from '../result';

/** The options of every request, and no others (Req 11.7). */
export interface FetchInit {
  readonly method: 'GET';
  readonly credentials: 'omit';
  readonly referrerPolicy: 'no-referrer';
  readonly redirect: 'error';
  readonly cache: 'no-store';
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

export interface FetchBodyReader {
  read(): Promise<{ readonly done: boolean; readonly value?: Uint8Array | undefined }>;
  cancel(): Promise<void>;
}

/** The part of a `Response` the gate uses. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly body: { getReader(): FetchBodyReader } | null;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponseLike>;

export interface NetworkGate {
  /** The body of the response, or the failure. Never rejects. */
  get(url: string): Promise<VigiaResult<string>>;
}

const unavailable = (errorName: string) => err('overlay_unavailable', { errorName });

/** `offline` for a network failure (a `TypeError` or anything unnamed), else the error's name. */
function nameOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const name: unknown = Reflect.get(error, 'name');
    if (typeof name === 'string' && name !== '' && name !== 'TypeError') return name;
  }
  return 'offline';
}

/** The body as text, or `null` when it is over `maxBytes` (the request is then aborted). */
async function readBody(
  response: FetchResponseLike,
  maxBytes: number,
  controller: AbortController,
): Promise<string | null> {
  if (response.body === null) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      controller.abort();
      try {
        await reader.cancel();
      } catch {
        // The stream was already torn down by the abort.
      }
      return null;
    }
    chunks.push(value);
  }
  const whole = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(whole);
}

/**
 * The gate over `fetchLike` and `hostList`. `invalid_number` naming the field when a parameter is
 * not valid (Req 19.3).
 */
export function createNetworkGate(
  fetchLike: FetchLike,
  hostList: HostList,
  parameters: VigiaParameters,
  timer: Timer,
): VigiaResult<NetworkGate> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  const { requestTimeoutMs, maxResponseBytes } = parameters;

  async function get(url: string): Promise<VigiaResult<string>> {
    const decision = decideRequest(url, hostList);
    if (!decision.ok) return decision;
    const controller = new AbortController();
    let timedOut = false;
    let handle: TimerHandle | null = null;
    try {
      handle = timer.start(() => {
        timedOut = true;
        controller.abort();
      }, requestTimeoutMs);
      const response = await fetchLike(url, {
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        headers: {},
        signal: controller.signal,
      });
      if (!response.ok) {
        controller.abort();
        return unavailable(`status-${response.status}`);
      }
      const body = await readBody(response, maxResponseBytes, controller);
      return body === null ? unavailable('too-large') : ok(body);
    } catch (error) {
      return unavailable(timedOut ? 'timeout' : nameOf(error));
    } finally {
      if (handle !== null) timer.stop(handle);
    }
  }

  return ok({ get });
}
