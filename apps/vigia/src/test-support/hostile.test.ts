import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allFinite,
  hostileNumber,
  hostileString,
  hugeFinite,
  isTotalResult,
  LIMITS,
  neighbours,
} from './hostile';

describe('hostileNumber', () => {
  it('draws NaN, both infinities, -0, a subnormal, MAX_VALUE and a neighbour of a limit', () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(hostileNumber(), (x) => {
        if (Number.isNaN(x)) seen.add('nan');
        else if (x === Infinity) seen.add('+inf');
        else if (x === -Infinity) seen.add('-inf');
        else if (Object.is(x, -0)) seen.add('-0');
        else if (x !== 0 && Math.abs(x) < 2.2250738585072014e-308) seen.add('subnormal');
        else if (Math.abs(x) === Number.MAX_VALUE) seen.add('max');
        else if (x === 1_800_000) seen.add('limit');
      }),
      { numRuns: 3000, seed: 7 },
    );
    expect([...seen].sort()).toEqual(['+inf', '-0', '-inf', 'limit', 'max', 'nan', 'subnormal']);
  });

  it('draws the doubles either side of every limit of the parameters', () => {
    const drawn = new Set(fc.sample(hostileNumber(), { numRuns: 20_000, seed: 11 }));
    for (const limit of LIMITS) {
      const [x, up, down] = neighbours(limit);
      expect(
        drawn.has(x ?? Number.NaN) && drawn.has(up ?? Number.NaN) && drawn.has(down ?? Number.NaN),
      ).toBe(true);
    }
  });

  it('a quarter of the draws or more are finite with |x| ≥ 1e6, and some reach 1e300', () => {
    const draws = fc.sample(hostileNumber(), { numRuns: 20_000, seed: 7 });
    const huge = draws.filter((x) => Number.isFinite(x) && Math.abs(x) >= 1e6);
    expect(huge.length / draws.length).toBeGreaterThanOrEqual(0.25);
    expect(huge.some((x) => Math.abs(x) >= 1e300)).toBe(true);
  });

  it('hugeFinite is always finite and at least 1e6 in magnitude', () => {
    for (const x of fc.sample(hugeFinite(), { numRuns: 5_000, seed: 3 })) {
      expect(Number.isFinite(x) && Math.abs(x) >= 1e6).toBe(true);
    }
  });
});

describe('neighbours', () => {
  it('gives the doubles next to a value and their negatives', () => {
    const [x, up, down, minusX] = neighbours(1);
    expect(up).toBeGreaterThan(x ?? 0);
    expect(down).toBeLessThan(x ?? 0);
    expect(minusX).toBe(-1);
  });
});

describe('hostileString', () => {
  const draws = fc.sample(hostileString(), { numRuns: 4000, seed: 5 });

  it('draws the empty string and strings that reach 10 000 characters, and none longer', () => {
    expect(draws.some((s) => s === '')).toBe(true);
    expect(Math.max(...draws.map((s) => s.length))).toBeGreaterThanOrEqual(9000);
    expect(Math.max(...draws.map((s) => s.length))).toBeLessThanOrEqual(10_000);
  });

  it('draws characters of the whole Basic Multilingual Plane, lone surrogates included', () => {
    const codes = new Set<number>();
    for (const s of draws)
      for (let i = 0; i < Math.min(s.length, 200); i += 1) codes.add(s.charCodeAt(i));
    expect([...codes].some((c) => c > 0x7ff && c < 0xd800)).toBe(true);
    expect([...codes].some((c) => c >= 0xd800 && c <= 0xdfff)).toBe(true);
    expect([...codes].some((c) => c < 0x20)).toBe(true);
    expect([...codes].some((c) => c > 0xe000)).toBe(true);
  });
});

describe('allFinite and isTotalResult', () => {
  it('reject what they should', () => {
    expect(allFinite({ a: [1, { b: 2 }] })).toBe(true);
    expect(allFinite({ a: [1, { b: Infinity }] })).toBe(false);
    expect(isTotalResult({ ok: true, value: { x: Number.NaN } })).toBe(false);
    expect(isTotalResult({ ok: true, value: { x: 1 } })).toBe(true);
    expect(isTotalResult({ ok: false, reason: 'invalid_number' })).toBe(true);
    expect(isTotalResult({ ok: false })).toBe(false);
    expect(isTotalResult(1)).toBe(false);
  });
});
