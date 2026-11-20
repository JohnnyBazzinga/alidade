// A failure inside `astronomy-engine` becomes `sight_time_unsupported` naming the field (Req 2.1,
// 3.2). The library is replaced here by a double that throws or returns a non-finite number: the
// wrapper is the unit under test, the library is its dependency.

import { describe, expect, it, vi } from 'vitest';

const mode: { current: 'throw' | 'nan-dec' | 'nan-sidereal' | 'ok' } = { current: 'ok' };

vi.mock('astronomy-engine', () => ({
  AstroTime: class {
    constructor(readonly ut: number) {}
  },
  Body: { Sun: 'Sun' },
  GeoVector: () => {
    if (mode.current === 'throw') throw new Error('library failure');
    return { x: 1, y: 0, z: 0 };
  },
  Rotation_EQJ_EQD: () => ({}),
  RotateVector: (_r: unknown, v: unknown) => v,
  EquatorFromVector: () => ({ ra: 1, dec: mode.current === 'nan-dec' ? Number.NaN : 10 }),
  SiderealTime: () => (mode.current === 'nan-sidereal' ? Infinity : 5),
  e_tilt: () => ({ ee: mode.current === 'nan-sidereal' ? Number.NaN : 0.1 }),
}));

import { defaultParameters } from '../parameters';
import {
  greenwichMeanSiderealTimeRad,
  greenwichSiderealTimeRad,
  subsolarPoint,
  sunPosition,
} from './sun-wrapper';

const params = defaultParameters();
const T = Date.UTC(2026, 5, 15, 9, 0);

describe('the Sun wrapper when the library fails (Req 3.2)', () => {
  it('works with the double when nothing fails (the double is not vacuous)', () => {
    mode.current = 'ok';
    expect(sunPosition(T, params).ok).toBe(true);
  });

  it('turns a throw into sight_time_unsupported, for each function that uses the Sun', () => {
    mode.current = 'throw';
    for (const result of [sunPosition(T, params), subsolarPoint(T, params)]) {
      expect(result).toMatchObject({ ok: false, reason: 'sight_time_unsupported' });
    }
  });

  it('turns a non-finite declination into sight_time_unsupported naming the field', () => {
    mode.current = 'nan-dec';
    expect(sunPosition(T, params)).toEqual({
      ok: false,
      reason: 'sight_time_unsupported',
      field: 'sunDeclinationRad',
    });
  });

  it('turns a non-finite sidereal time into sight_time_unsupported naming the field', () => {
    mode.current = 'nan-sidereal';
    expect(greenwichSiderealTimeRad(T, params)).toMatchObject({
      reason: 'sight_time_unsupported',
      field: 'siderealTimeRad',
    });
    expect(greenwichMeanSiderealTimeRad(T, params)).toMatchObject({
      reason: 'sight_time_unsupported',
    });
    expect(sunPosition(T, params)).toMatchObject({ reason: 'sight_time_unsupported' });
  });
});
