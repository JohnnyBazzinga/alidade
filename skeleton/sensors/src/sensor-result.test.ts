import { wrapTwoPi, type Failure } from '@alidade/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { err, ok, type SensorFailure, type SensorResult } from './sensor-result';

/** A Sensors function that passes a Core failure through unchanged (D2). */
function passThrough(angleRad: number): SensorResult<number> {
  const wrapped = wrapTwoPi(angleRad);
  if (!wrapped.ok) return wrapped;
  return ok(wrapped.value);
}

describe('SensorResult (Req 11.1, D2)', () => {
  it('accepts every Core failure as a Sensors failure', () => {
    expectTypeOf<Failure>().toExtend<SensorFailure>();
  });

  it('passes a Core failure through unchanged', () => {
    const coreFailure = wrapTwoPi(Number.NaN);
    expect(coreFailure.ok).toBe(false);
    expect(passThrough(Number.NaN)).toEqual(coreFailure);
  });

  it('builds failures with their details', () => {
    expect(err('coarse_location', { reportedAccuracyM: 2000 })).toEqual({
      ok: false,
      reason: 'coarse_location',
      reportedAccuracyM: 2000,
    });
    expect(err('frame_reset')).toEqual({ ok: false, reason: 'frame_reset' });
  });
});
