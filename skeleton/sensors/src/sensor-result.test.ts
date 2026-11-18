import { wrapTwoPi, type Failure } from '@alidade/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  err,
  ok,
  SENSOR_REASONS,
  type SensorFailure,
  type SensorReason,
  type SensorResult,
} from './sensor-result';

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

describe('SENSOR_REASONS (Req 1.10, 11.1)', () => {
  it("lists every reason once, Core's twelve and the nineteen of Sensors", () => {
    expect(new Set(SENSOR_REASONS).size).toBe(SENSOR_REASONS.length);
    expect(SENSOR_REASONS).toHaveLength(31);
    const core = [
      'invalid_number',
      'undefined_mean',
      'coincident_positions',
      'unsupported_position',
      'invalid_observation',
      'unsupported_format',
      'not_converged',
      'singular_geometry',
      'insufficient_observations',
      'colocated_observers',
      'diverging_bearings',
      'out_of_range',
    ];
    for (const reason of core) expect(SENSOR_REASONS).toContain(reason);
    for (const reason of ['permission_denied', 'frame_reset', 'invalid_altitude', 'too_unsteady'])
      expect(SENSOR_REASONS).toContain(reason);
  });

  it('is frozen, and every member is a SensorReason', () => {
    expect(Object.isFrozen(SENSOR_REASONS)).toBe(true);
    expectTypeOf(SENSOR_REASONS).toEqualTypeOf<readonly SensorReason[]>();
  });
});
