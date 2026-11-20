// The Random adapter (Req 3.4, 4.1, design §6): secure random bytes for identifiers. It takes the
// browser's crypto object as an argument and reads no global. `bytes` never throws: a count it
// cannot honour, or a crypto object that fails, gives no bytes, and the caller's identifier
// function refuses too few bytes with `invalid_number`, so that no id is ever made from nothing.

import { err, ok, type VigiaResult } from '../result';

/** The part of the browser's crypto object this adapter uses. */
export interface CryptoLike {
  getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array;
}

export interface VigiaRandom {
  /** `count` random bytes; zero bytes for a count that is not a whole number in `0 … MAX_BYTES_PER_CALL`. */
  bytes(count: number): Uint8Array;
}

/** The most bytes the Web Crypto API fills in one call (its specification). */
export const MAX_BYTES_PER_CALL = 65_536;

/** `random_unavailable` when the browser has no secure random source. */
export function createRandom(cryptoLike: CryptoLike | null | undefined): VigiaResult<VigiaRandom> {
  if (
    cryptoLike === null ||
    cryptoLike === undefined ||
    typeof cryptoLike.getRandomValues !== 'function'
  ) {
    return err('random_unavailable');
  }
  return ok({
    bytes(count) {
      if (!Number.isInteger(count) || count < 0 || count > MAX_BYTES_PER_CALL) {
        return new Uint8Array(0);
      }
      const bytes = new Uint8Array(count);
      if (count === 0) return bytes;
      try {
        cryptoLike.getRandomValues(bytes);
        return bytes;
      } catch {
        return new Uint8Array(0);
      }
    },
  });
}
