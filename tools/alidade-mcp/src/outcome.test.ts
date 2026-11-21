import { describe, expect, it } from 'vitest';
import { findNonFinite, finiteOrFailure } from './outcome.ts';

describe('findNonFinite (Req 6.6)', () => {
  it.each([NaN, Infinity, -Infinity])('finds %s at any depth', (bad) => {
    expect(findNonFinite(bad)).toBe(true);
    expect(findNonFinite([1, [2, { a: [3, bad] }]])).toBe(true);
    expect(findNonFinite({ a: { b: { c: bad } } })).toBe(true);
  });

  it('accepts finite numbers, -0, strings, booleans and null', () => {
    expect(findNonFinite({ a: [1, -0, 1e308, 'x', true, null], b: {} })).toBe(false);
  });

  it('finds a non-finite number below the depth a naive walk would stop at', () => {
    let nested: unknown = NaN;
    for (let i = 0; i < 200; i++) nested = [nested];
    expect(findNonFinite(nested)).toBe(true);
  });
});

describe('finiteOrFailure', () => {
  it('returns a finite outcome unchanged', () => {
    const outcome = { ok: true, eastM: 1, northM: 2 } as const;
    expect(finiteOrFailure(outcome)).toBe(outcome);
  });

  it('turns an outcome with a non-finite number into the non_finite_result failure', () => {
    const result = finiteOrFailure({ ok: true, eastM: NaN });
    expect(result).toMatchObject({ ok: false, reason: 'non_finite_result' });
    expect(findNonFinite(result)).toBe(false);
  });
});
