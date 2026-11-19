import type { Failure } from '@alidade/core';
import type { SensorFailure } from '@alidade/sensors';
import type { UiFailure } from '@alidade/ui';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { err, ok, type VigiaFailure, type VigiaResult } from './result';

describe('VigiaResult (Req 2.1, design D2)', () => {
  it('passes a Core, a Sensors and a UI failure through as they are (type level)', () => {
    expectTypeOf<Failure>().toExtend<VigiaFailure>();
    expectTypeOf<SensorFailure>().toExtend<VigiaFailure>();
    expectTypeOf<UiFailure>().toExtend<VigiaFailure>();
  });

  it('does not take a Vigia reason as a UI failure (type level)', () => {
    expectTypeOf<VigiaFailure>().not.toExtend<UiFailure>();
  });

  it('builds a success with its value and nothing else', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it('builds a failure with a Vigia reason and carries every detail unchanged', () => {
    expect(err('code_damaged')).toEqual({ ok: false, reason: 'code_damaged' });
    expect(
      err('storage_unavailable', { field: 'f', id: 'i', reportedAccuracyM: 12, errorName: 'e' }),
    ).toEqual({
      ok: false,
      reason: 'storage_unavailable',
      field: 'f',
      id: 'i',
      reportedAccuracyM: 12,
      errorName: 'e',
    });
  });

  it('accepts a UI reason as well as a Vigia one', () => {
    const failure: VigiaFailure = err('crosses_antimeridian');
    expect(failure.reason).toBe('crosses_antimeridian');
  });

  it('narrows on ok', () => {
    const pick = (good: boolean): VigiaResult<number> => (good ? ok(1) : err('invalid_number'));
    const result = pick(true);
    if (result.ok) expectTypeOf(result.value).toBeNumber();
    else expectTypeOf(result.reason).toBeString();
    expect(result.ok).toBe(true);
  });
});
