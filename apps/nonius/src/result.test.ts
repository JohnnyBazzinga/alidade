import { describe, expect, it } from 'vitest';
import { err, ok } from './result';

describe('result helpers', () => {
  it('ok wraps a value as Core does', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it('err keeps the reason and only the details it was given', () => {
    expect(err('sun_too_low')).toEqual({ ok: false, reason: 'sun_too_low' });
    expect(err('invalid_number', { field: 'x', id: 'sight-1' })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'x',
      id: 'sight-1',
    });
  });
});
