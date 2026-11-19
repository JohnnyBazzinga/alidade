// The Random adapter (Req 3.4, 4.1, design §6): bytes from the secure random source, or
// `random_unavailable`.

import { describe, expect, it } from 'vitest';
import { createFakeCrypto } from '../test-support/fake-browser';
import { createRandom, MAX_BYTES_PER_CALL } from './random';

function randomOf(crypto = createFakeCrypto()) {
  const made = createRandom(crypto);
  if (!made.ok) throw new Error(`not made: ${made.reason}`);
  return { random: made.value, crypto };
}

describe('createRandom', () => {
  it('without a crypto object, or with one that cannot fill bytes, fails with random_unavailable', () => {
    for (const missing of [null, undefined, {} as never, { getRandomValues: 3 } as never]) {
      expect(createRandom(missing)).toEqual({ ok: false, reason: 'random_unavailable' });
    }
  });

  it('bytes(n) has n bytes, those of the crypto object, called as a method of it', () => {
    const { random, crypto } = randomOf();
    expect([...random.bytes(5)]).toEqual([0, 1, 2, 3, 4]);
    expect([...random.bytes(3)]).toEqual([5, 6, 7]);
    expect(crypto.asked).toEqual([5, 3]);
  });

  it('bytes(0) is empty and asks nothing', () => {
    const { random, crypto } = randomOf();
    expect(random.bytes(0)).toEqual(new Uint8Array(0));
    expect(crypto.asked).toEqual([]);
  });

  it('gives 20 and 64 bytes, the sizes of an Incident id and more', () => {
    const { random } = randomOf();
    expect(random.bytes(20)).toHaveLength(20);
    expect(random.bytes(64)).toHaveLength(64);
  });

  it('at the most one call can ask for, and either side of it', () => {
    const { random } = randomOf();
    expect(random.bytes(MAX_BYTES_PER_CALL)).toHaveLength(MAX_BYTES_PER_CALL);
    expect(random.bytes(MAX_BYTES_PER_CALL + 1)).toHaveLength(0);
    expect(MAX_BYTES_PER_CALL).toBe(65_536);
  });

  it('a count that is not a whole number of at least 0 gives no bytes, not an exception', () => {
    const { random, crypto } = randomOf();
    for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, -0.5, 2 ** 40]) {
      expect(random.bytes(count)).toHaveLength(0);
    }
    expect(crypto.asked).toEqual([]);
  });

  it('a crypto object that throws gives no bytes, so that no id is made from nothing', () => {
    const { random, crypto } = randomOf();
    crypto.failing = true;
    expect(random.bytes(20)).toHaveLength(0);
  });
});
