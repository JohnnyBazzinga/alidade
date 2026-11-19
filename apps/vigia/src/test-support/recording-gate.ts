// A Network gate that records every call and refuses it (test support, not exported): the gate
// of the reviewer's path and of P-15.9 (Req 11.5, 17.6). `answer` makes it answer instead, for the
// Overlay tests that read a fixture.

import type { NetworkGate } from '../adapters/network-gate';
import { err, ok, type VigiaResult } from '../result';

export interface RecordingGate extends NetworkGate {
  /** Every URL the gate was asked for, in order. */
  readonly calls: string[];
}

export function createRecordingGate(
  answer: ((url: string) => VigiaResult<string>) | null = null,
): RecordingGate {
  const calls: string[] = [];
  return {
    calls,
    get: (url) => {
      calls.push(url);
      return Promise.resolve(
        answer === null ? err('host_not_allowed', { field: 'recording' }) : answer(url),
      );
    },
  };
}

/** An answer with a fixed body, for `createRecordingGate`. */
export function fixedAnswer(text: string): (url: string) => VigiaResult<string> {
  return () => ok(text);
}
