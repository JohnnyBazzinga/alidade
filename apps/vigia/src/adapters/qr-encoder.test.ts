// The QR encoder adapter (Req 10.5, 10.6, 20.4, design §3.2, D13): a link in, a square matrix of
// modules out. First against a fake encoder, then against the real package (`uqr` 0.1.3), which
// checks the capacities of design §3.2.

import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../math/parameters';
import { createQrEncoder, type QrEncode } from './qr-encoder';

const P = defaultParameters();
const LINK_77 = `https://vigia.example.org/#${'A'.repeat(50)}`;

/** A link of exactly `length` characters on a 24-character address. */
function linkOfLength(length: number): string {
  return `https://vigia.example.org/#${'A'.repeat(Math.max(0, length - 27))}`.slice(0, length);
}

function fakeEncoder(version: number): { encode: QrEncode; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const size = 4 * version + 17;
  return {
    calls,
    encode: (text, options) => {
      calls.push([text, options]);
      return {
        version,
        size,
        data: Array.from({ length: size }, (_, y) =>
          Array.from({ length: size }, (_, x) => (x + y) % 2 === 0),
        ),
      };
    },
  };
}

function encoderOf(encode?: QrEncode) {
  const made = createQrEncoder(P, encode);
  if (!made.ok) throw new Error(`not made: ${made.reason}`);
  return made.value;
}

describe('against a fake encoder', () => {
  it('asks for error correction M and no border (the quiet zone is drawn by the component)', () => {
    const fake = fakeEncoder(5);
    encoderOf(fake.encode).qrMatrix(LINK_77);
    expect(fake.calls).toEqual([[LINK_77, { ecc: 'M', border: 0 }]]);
  });

  it('returns the matrix with its version and size, square, size = 4 · version + 17', () => {
    const result = encoderOf(fakeEncoder(5).encode).qrMatrix(LINK_77);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(5);
    expect(result.value.size).toBe(37);
    expect(result.value.modules).toHaveLength(37);
    for (const row of result.value.modules) expect(row).toHaveLength(37);
  });

  it('refuses a link longer than the limit with link_too_long, and never calls the encoder', () => {
    const fake = fakeEncoder(9);
    const encoder = encoderOf(fake.encode);
    expect(encoder.qrMatrix(linkOfLength(P.maxLinkLengthChars)).ok).toBe(true);
    expect(encoder.qrMatrix(linkOfLength(P.maxLinkLengthChars + 1))).toEqual({
      ok: false,
      reason: 'link_too_long',
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('refuses an empty link with invalid_number naming the link', () => {
    const fake = fakeEncoder(1);
    expect(encoderOf(fake.encode).qrMatrix('')).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'link',
    });
    expect(fake.calls).toEqual([]);
  });

  it('an encoder that throws is a failure value that keeps the error name', () => {
    const encoder = encoderOf(() => {
      const error = new RangeError('too long');
      throw error;
    });
    expect(encoder.qrMatrix(LINK_77)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'link',
      errorName: 'RangeError',
    });
  });

  it('a result that is not a square of size 4 · version + 17 is refused, not drawn', () => {
    const wrongSize = encoderOf(() => ({ version: 5, size: 38, data: [[true]] }));
    expect(wrongSize.qrMatrix(LINK_77)).toMatchObject({ ok: false, field: 'qr' });
    const notSquare = encoderOf(() => ({
      version: 1,
      size: 21,
      data: Array.from({ length: 21 }, () => [true]),
    }));
    expect(notSquare.qrMatrix(LINK_77)).toMatchObject({ ok: false, field: 'qr' });
  });

  it('returns its own copy of the modules, not the encoder\u2019s arrays', () => {
    const size = 21;
    const data = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
    const result = encoderOf(() => ({ version: 1, size, data })).qrMatrix(LINK_77);
    if (!result.ok) throw new Error('no matrix');
    const row = data[0];
    if (row === undefined) throw new Error('no row');
    row[0] = true;
    expect(result.value.modules[0]?.[0]).toBe(false);
  });

  it('invalid parameters are invalid_number naming the field', () => {
    expect(createQrEncoder({ ...P, maxLinkLengthChars: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'maxLinkLengthChars',
    });
  });
});

/** Byte-mode capacity at error correction level M, by version (the QR standard). */
const CAPACITY_M_BYTES: readonly number[] = [14, 26, 42, 62, 84, 106, 122, 152, 180];

describe('against the real package (uqr 0.1.3; checks design §3.2, F19)', () => {
  const real = encoderOf();

  it('a 77-character link is version 5, 37 modules a side', () => {
    expect(LINK_77).toHaveLength(77);
    const result = real.qrMatrix(LINK_77);
    expect(result.ok && [result.value.version, result.value.size]).toEqual([5, 37]);
  });

  it('the longest allowed link, 160 characters, is the version its capacity says, size 4 · version + 17', () => {
    const link = linkOfLength(P.maxLinkLengthChars);
    expect(link).toHaveLength(160);
    const result = real.qrMatrix(link);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedVersion = CAPACITY_M_BYTES.findIndex((capacity) => capacity >= 160) + 1;
    expect(expectedVersion).toBe(9);
    expect(result.value.version).toBe(expectedVersion);
    expect(result.value.size).toBe(53);
  });

  it('a 161-character link is refused with link_too_long', () => {
    expect(real.qrMatrix(linkOfLength(161))).toEqual({ ok: false, reason: 'link_too_long' });
  });

  it('for every length from 1 to 160 the version is the smallest whose capacity holds the link, and size = 4 · version + 17', () => {
    for (let length = 1; length <= 160; length += 1) {
      const result = real.qrMatrix(linkOfLength(length));
      expect(result.ok, `length ${length}`).toBe(true);
      if (!result.ok) continue;
      const expected = CAPACITY_M_BYTES.findIndex((capacity) => capacity >= length) + 1;
      expect(result.value.version, `length ${length}`).toBe(expected);
      expect(result.value.size).toBe(4 * result.value.version + 17);
      expect(result.value.modules).toHaveLength(result.value.size);
      for (const row of result.value.modules) expect(row).toHaveLength(result.value.size);
    }
  });

  it('the same link gives the same matrix, and another link another one', () => {
    const a = real.qrMatrix(LINK_77);
    const b = real.qrMatrix(LINK_77);
    const c = real.qrMatrix(`https://vigia.example.org/#${'B'.repeat(50)}`);
    expect(a).toEqual(b);
    expect(a.ok && c.ok && a.value.modules).not.toEqual(c.ok && c.value.modules);
  });

  it('has the three finder patterns: a dark 7 by 7 ring at three corners and none at the fourth', () => {
    const result = real.qrMatrix(LINK_77);
    if (!result.ok) throw new Error('no matrix');
    const m = result.value.modules;
    const n = result.value.size;
    const ring = (top: number, left: number) =>
      [0, 6].every((d) =>
        [0, 1, 2, 3, 4, 5, 6].every(
          (k) => m[top + d]?.[left + k] === true && m[top + k]?.[left + d] === true,
        ),
      ) &&
      m[top + 3]?.[left + 3] === true &&
      m[top + 1]?.[left + 1] === false;
    expect(ring(0, 0)).toBe(true);
    expect(ring(0, n - 7)).toBe(true);
    expect(ring(n - 7, 0)).toBe(true);
    expect(ring(n - 7, n - 7)).toBe(false);
  });
});
