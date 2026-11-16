import { describe, expect, it } from 'vitest';
import { _asinChecked } from './trig';

describe('_asinChecked', () => {
  it('is asin inside [-1, 1]', () => {
    expect(_asinChecked(0)).toStrictEqual({ ok: true, value: 0 });
    expect(_asinChecked(0.5)).toStrictEqual({ ok: true, value: Math.asin(0.5) });
    expect(_asinChecked(1)).toStrictEqual({ ok: true, value: Math.PI / 2 });
    expect(_asinChecked(-1)).toStrictEqual({ ok: true, value: -Math.PI / 2 });
  });

  it('clamps an excess below 1e-12, which is rounding error', () => {
    expect(_asinChecked(1 + 5e-13)).toStrictEqual({ ok: true, value: Math.PI / 2 });
    expect(_asinChecked(-1 - 5e-13)).toStrictEqual({ ok: true, value: -Math.PI / 2 });
    expect(_asinChecked(1 + 2.2e-16)).toStrictEqual({ ok: true, value: Math.PI / 2 });
  });

  it('fails, and does not clamp, an excess of 1e-12 or more', () => {
    expect(_asinChecked(1 + 2e-12)).toStrictEqual({ ok: false, reason: 'invalid_number' });
    expect(_asinChecked(-1 - 2e-12)).toStrictEqual({ ok: false, reason: 'invalid_number' });
    expect(_asinChecked(1.5)).toStrictEqual({ ok: false, reason: 'invalid_number' });
  });

  it('fails for NaN and infinite values', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(_asinChecked(value)).toStrictEqual({ ok: false, reason: 'invalid_number' });
    }
  });
});
