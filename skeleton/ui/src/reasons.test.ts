import type { Failure } from '@alidade/core';
import { SENSOR_REASONS, type SensorFailure } from '@alidade/sensors';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { err, ok, type UiFailure } from './result';
import { UI_ONLY_REASON_LIST, UI_REASONS, type UiReason } from './reasons';

/** The sixteen reasons of Req 2.2, typed out on purpose: a drift in the source fails here. */
const REQ_2_2 = [
  'camera_permission_denied',
  'camera_unavailable',
  'camera_busy',
  'camera_track_ended',
  'camera_stopped',
  'camera_failed',
  'wrong_camera',
  'calibration_missing',
  'calibration_mismatch',
  'outside_image',
  'outside_field_of_view',
  'portrait_required',
  'action_not_available',
  'tiles_unavailable',
  'map_unavailable',
  'crosses_antimeridian',
] as const satisfies readonly UiReason[];

describe('UI_REASONS (Req 2.2, design D2)', () => {
  it('has no duplicate', () => {
    expect(new Set(UI_REASONS).size).toBe(UI_REASONS.length);
  });

  it('holds all sixteen reasons of Req 2.2', () => {
    expect(REQ_2_2).toHaveLength(16);
    for (const reason of REQ_2_2) expect(UI_REASONS).toContain(reason);
    expect([...UI_ONLY_REASON_LIST].sort()).toEqual([...REQ_2_2].sort());
  });

  it('starts with the list Sensors exports and adds nothing else', () => {
    expect(UI_REASONS.slice(0, SENSOR_REASONS.length)).toEqual(SENSOR_REASONS);
    expect(UI_REASONS).toHaveLength(SENSOR_REASONS.length + 16);
    expect(SENSOR_REASONS).toHaveLength(31);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(UI_REASONS)).toBe(true);
  });
});

describe('UiResult (Req 2.3, 2.4)', () => {
  it('passes a Sensors failure and a Core failure through as they are (type level)', () => {
    expectTypeOf<SensorFailure>().toExtend<UiFailure>();
    expectTypeOf<Failure>().toExtend<UiFailure>();
  });

  it('carries a failure with every detail unchanged', () => {
    const sensorFailure: SensorFailure = {
      ok: false,
      reason: 'coarse_location',
      field: 'f',
      id: 'i',
      reportedAccuracyM: 840,
    };
    const asUi: UiFailure = sensorFailure;
    expect(asUi).toEqual(sensorFailure);
    expect(err('camera_busy', { errorName: 'NotReadableError' })).toEqual({
      ok: false,
      reason: 'camera_busy',
      errorName: 'NotReadableError',
    });
    expect(err('outside_image')).toEqual({ ok: false, reason: 'outside_image' });
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });
});
