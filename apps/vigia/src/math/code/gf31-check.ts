// The check value of the sighting code: a CRC over the field GF(31) (Req 8.6, design §8.3, §8.4).
//
// The generator polynomial is g(x) = x^4 + x + 1. The message is the symbols as the coefficients
// of m(x), the first symbol the highest power; the four check symbols are the coefficients,
// highest first, of r(x) = m(x) · x^4 mod g(x), all arithmetic modulo 31.
//
// What it detects (design §8.4): g(0) = 1 is not 0, so g has no common factor with x^k, and a
// change confined to four consecutive symbols, the check symbols included, is e(x) = x^k · b(x)
// with b of degree below 4 and not zero, which g cannot divide. So every change of a single
// symbol, of two adjacent symbols, the swap of two adjacent symbols and every change of three or
// four adjacent symbols is detected. A uniformly random damaged string passes with probability
// 31^-4. It is not a signature: anyone can compute it.

import { err, ok, type VigiaResult } from '../../result';
import { ALPHABET, symbolValue } from './alphabet';

const P = 31;

/**
 * The four check symbols of `message`, a string of symbols of the alphabet (the empty string
 * gives `2222`). Fails with `invalid_number`, `field: 'message'`, for a character outside the
 * alphabet.
 */
export function checkSymbols(message: string): VigiaResult<string> {
  // The state is the remainder, highest coefficient first: r3 x^3 + r2 x^2 + r1 x + r0. Reading a
  // symbol multiplies by x and adds it; x^4 = -x - 1, so the symbol that falls out (t) is
  // subtracted from the two lowest coefficients.
  let r3 = 0;
  let r2 = 0;
  let r1 = 0;
  let r0 = 0;
  for (const symbol of message) {
    const value = symbolValue(symbol);
    if (value === null) return err('invalid_number', { field: 'message' });
    const t = (r3 + value) % P;
    r3 = r2;
    r2 = r1;
    r1 = (r0 - t + P) % P;
    r0 = (P - t) % P;
  }
  return ok(
    `${ALPHABET.charAt(r3)}${ALPHABET.charAt(r2)}${ALPHABET.charAt(r1)}${ALPHABET.charAt(r0)}`,
  );
}
