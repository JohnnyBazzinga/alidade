import { describe, expect, expectTypeOf, it } from 'vitest';
import { err, ok, type Reason, type Warning } from './result';

describe('ok', () => {
  it('wraps a value', () => {
    expect(ok(42)).toStrictEqual({ ok: true, value: 42 });
  });

  it('wraps undefined for Result<void>', () => {
    expect(ok(undefined)).toStrictEqual({ ok: true, value: undefined });
  });
});

describe('err', () => {
  it('carries only the reason when no details are given', () => {
    expect(err('invalid_number')).toStrictEqual({ ok: false, reason: 'invalid_number' });
  });

  it('carries the field and the id when they are given', () => {
    expect(err('invalid_observation', { field: 'azimuthRad', id: 'obs-1' })).toStrictEqual({
      ok: false,
      reason: 'invalid_observation',
      field: 'azimuthRad',
      id: 'obs-1',
    });
  });

  it('leaves out a detail that is not given', () => {
    expect(err('invalid_observation', { field: 'id' })).toStrictEqual({
      ok: false,
      reason: 'invalid_observation',
      field: 'id',
    });
  });
});

describe('closed sets', () => {
  // These are compile-time checks, enforced by `pnpm typecheck`: the sets have exactly
  // these members (design D11), so adding or removing one breaks the build here.
  it('Reason has exactly the twelve documented members', () => {
    expectTypeOf<Reason>().toEqualTypeOf<
      | 'invalid_number'
      | 'undefined_mean'
      | 'coincident_positions'
      | 'unsupported_position'
      | 'invalid_observation'
      | 'unsupported_format'
      | 'not_converged'
      | 'singular_geometry'
      | 'insufficient_observations'
      | 'colocated_observers'
      | 'diverging_bearings'
      | 'out_of_range'
    >();
  });

  it('Warning has exactly the two documented members', () => {
    expectTypeOf<Warning>().toEqualTypeOf<'poor_geometry' | 'outliers_excluded'>();
  });
});
