import { describe, expect, it } from 'vitest';
import { createSeededNormal } from '../../test-support/seeded-normal';
import { ALPHABET, symbolAt } from './alphabet';
import { checkSymbols } from './gf31-check';

/** The payloads and the checks of the three worked examples of design §8.7 (`V K` is `32`). */
const EXAMPLES = [
  { name: 'A', payload: '7VGW67HFXYW4EP3NHT3AFXPGBQKU927W36FR8FF326RW', check: 'B8GH' },
  { name: 'B', payload: 'CBYCHGRHRYG4PX7AH8SYYD5C7GZCVXJ4BQEE3U3TVT8P', check: 'FSJE' },
  { name: 'C', payload: '5EN636NMPH56SW8ZWJ3XDMCSARJWYA5AH9TE25T7JDE9', check: '8FQS' },
] as const;

const messageOf = (payload: string) => `32${payload}`;

/** Checks `word` (46 message symbols then 4 check symbols) by the function under test. */
function passes(word: string): boolean {
  const check = checkSymbols(word.slice(0, 46));
  return check.ok && check.value === word.slice(46);
}

/** `word` with the symbols from `start` replaced by `replacement`. */
const replaced = (word: string, start: number, replacement: string) =>
  word.slice(0, start) + replacement + word.slice(start + replacement.length);

describe('checkSymbols: the worked examples of design §8.7 (Req 8.6)', () => {
  for (const { name, payload, check } of EXAMPLES) {
    it(`gives ${check} for the payload of example ${name}`, () => {
      expect(messageOf(payload)).toHaveLength(46);
      expect(checkSymbols(messageOf(payload))).toEqual({ ok: true, value: check });
    });
  }

  it('gives 2222 for the empty message and for any run of the symbol 2 (the symbol of value 0)', () => {
    expect(checkSymbols('')).toEqual({ ok: true, value: '2222' });
    expect(checkSymbols('2'.repeat(46))).toEqual({ ok: true, value: '2222' });
  });

  it('gives four symbols of the alphabet for any message, and fails for a character outside it', () => {
    for (const message of ['3', '32', 'ZZZZ', ALPHABET, ALPHABET.repeat(5)]) {
      const check = checkSymbols(message);
      expect(check.ok && /^[2-9A-HJKMNP-Z]{4}$/.test(check.value)).toBe(true);
    }
    for (const bad of ['a', '0', '1', 'I', 'L', 'O', '2-3', '2 3', '\u0662']) {
      expect(checkSymbols(bad), JSON.stringify(bad)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'message',
      });
    }
  });

  it('is the generator polynomial x^4 + x + 1 of design §8.3: one symbol 3 (value 1) then zeros', () => {
    // x^k mod g for the message of one symbol of value 1 followed by k zeros, each as the four
    // coefficients highest first: x^4 = -x - 1 = 30x + 30 (so 'Z' 'Z' at the two low places).
    expect(checkSymbols('3')).toEqual({ ok: true, value: '22ZZ' });
    // Adding a zero symbol multiplies by x: x^5 = -x^2 - x = 30x^2 + 30x.
    expect(checkSymbols('32')).toEqual({ ok: true, value: '2ZZ2' });
  });
});

describe('checkSymbols is linear over GF(31), with no initial value', () => {
  it('gives the difference of the checks for the difference of two messages, symbol by symbol modulo 31', () => {
    const random = createSeededNormal(11);
    const message = (): number[] =>
      Array.from({ length: 46 }, () => Math.floor(random.nextUnit() * 31));
    const text = (values: readonly number[]) => values.map((v) => symbolAt(v) ?? '?').join('');
    const valueOf = (checkText: string) => [...checkText].map((c) => ALPHABET.indexOf(c));
    for (let run = 0; run < 200; run += 1) {
      const a = message();
      const b = message();
      const sum = a.map((x, i) => (x + (b[i] ?? 0)) % 31);
      const ca = checkSymbols(text(a));
      const cb = checkSymbols(text(b));
      const cs = checkSymbols(text(sum));
      if (!ca.ok || !cb.ok || !cs.ok) throw new Error('check failed');
      const expected = valueOf(ca.value).map((x, i) => (x + (valueOf(cb.value)[i] ?? 0)) % 31);
      expect(valueOf(cs.value)).toEqual(expected);
    }
  });
});

describe('the proof of design §8.4 as a test: what the check detects (Req 8.6)', () => {
  const words = EXAMPLES.map(({ payload, check }) => messageOf(payload) + check);

  it('accepts the three words as they are', () => {
    for (const word of words) expect(passes(word)).toBe(true);
  });

  it('never passes after any change of a single symbol (30 by 50 positions, each word)', () => {
    for (const word of words) {
      for (let at = 0; at < 50; at += 1) {
        for (const other of ALPHABET) {
          if (other === word[at]) continue;
          expect(passes(replaced(word, at, other)), `${word} at ${at} to ${other}`).toBe(false);
        }
      }
    }
  });

  it('never passes after the swap of two unequal neighbours (each word, each position)', () => {
    for (const word of words) {
      for (let at = 0; at < 49; at += 1) {
        const first = word[at] ?? '';
        const second = word[at + 1] ?? '';
        if (first === second) continue;
        expect(passes(replaced(word, at, second + first)), `${word} at ${at}`).toBe(false);
      }
    }
  });

  it('never passes after a change of two adjacent symbols, both changed (900 by 49 positions, each word)', () => {
    for (const word of words) {
      for (let at = 0; at < 49; at += 1) {
        for (const a of ALPHABET) {
          if (a === word[at]) continue;
          for (const b of ALPHABET) {
            if (b === word[at + 1]) continue;
            expect(passes(replaced(word, at, a + b)), `${word} at ${at}: ${a}${b}`).toBe(false);
          }
        }
      }
    }
  });

  // Three and four adjacent symbols: the check is linear, so whether a change passes depends on
  // the change alone and not on the word it is made to. The change is a word of zeros (the
  // symbol 2) with the window written in, and the word passes when its check is the zero check,
  // 2222 (the window and the check taken together, so a window that reaches the check is a window
  // like any other). Three symbols: every change at every position. Four: every change at the
  // first and the last position of the word, and a seeded random subset of changes at
  // every other position (g(0) is not 0, so the position does not matter: x is invertible).
  const zeroWord = '2'.repeat(50);
  const difference = (start: number, window: string) => replaced(zeroWord, start, window);
  const symbolStrings = (length: number): string[] =>
    length === 0
      ? ['']
      : symbolStrings(length - 1).flatMap((prefix) =>
          [...ALPHABET].map((symbol) => prefix + symbol),
        );

  it('never passes after a change of three adjacent symbols, any three, anywhere (29 791 by 48)', () => {
    const windows = symbolStrings(3).filter((w) => w[0] !== '2' && w[2] !== '2');
    // The two end symbols changed (value not 0) and the middle one anything: every nonzero
    // pattern of exactly three adjacent symbols; patterns with a zero end are shorter windows.
    expect(windows).toHaveLength(30 * 31 * 30);
    for (let at = 0; at < 48; at += 1) {
      for (const window of windows) {
        expect(passes(difference(at, window)), `at ${at}: ${window}`).toBe(false);
      }
    }
  });

  it('never passes after a change of four adjacent symbols (every change at the first and the last position, a seeded subset at the rest)', () => {
    const windows = symbolStrings(4).filter((w) => w[0] !== '2' && w[3] !== '2');
    expect(windows).toHaveLength(30 * 31 * 31 * 30);
    for (const at of [0, 46]) {
      for (const window of windows) {
        if (!passes(difference(at, window))) continue;
        throw new Error(`a change of four symbols passed: at ${at}: ${window}`);
      }
    }
    const random = createSeededNormal(5);
    for (let at = 0; at < 47; at += 1) {
      for (let run = 0; run < 400; run += 1) {
        const window = windows[Math.floor(random.nextUnit() * windows.length)] ?? '';
        expect(passes(difference(at, window)), `at ${at}: ${window}`).toBe(false);
      }
    }
  });

  it('does pass some changes of five symbols: the guarantee ends at four (the bound 31^-4 is the rest)', () => {
    // Over all 31^5 - 1 changes confined to five symbols, exactly those divisible by g pass:
    // x^4 + x + 1 times a nonzero constant (30 of them) is a change of exactly five symbols
    // that passes. Written as symbols: the coefficients of c * g, highest first.
    let passed = 0;
    for (let c = 1; c < 31; c += 1) {
      const coefficients = [c, 0, 0, c, c];
      const window = coefficients.map((v) => symbolAt(v) ?? '').join('');
      if (passes(difference(10, window))) passed += 1;
    }
    expect(passed).toBe(30);
  });
});
