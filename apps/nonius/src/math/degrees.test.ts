import { describe, expect, it } from 'vitest';
import { ARCMIN_TO_RAD, DEG_TO_RAD, fromArcmin, fromDeg, HOURS_TO_DEG, toDeg } from './degrees';

describe('degrees', () => {
  it('converts degrees to radians and back', () => {
    expect(fromDeg(180)).toEqual({ ok: true, value: Math.PI });
    expect(fromDeg(-90)).toEqual({ ok: true, value: -Math.PI / 2 });
    const back = toDeg(Math.PI / 6);
    expect(back.ok && Math.abs(back.value - 30) < 1e-12).toBe(true);
  });

  it('converts arc-minutes: 60 arc-minutes are one degree', () => {
    const r = fromArcmin(60);
    expect(r.ok && Math.abs(r.value - Math.PI / 180) < 1e-15).toBe(true);
    expect(Math.abs(ARCMIN_TO_RAD * 60 - DEG_TO_RAD)).toBeLessThan(1e-18);
  });

  it('knows that an hour of sidereal time is 15 degrees', () => {
    expect(HOURS_TO_DEG).toBe(15);
  });

  it('refuses a number that is not finite, or whose conversion overflows', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(fromDeg(bad)).toMatchObject({ ok: false, reason: 'invalid_number' });
      expect(toDeg(bad)).toMatchObject({ ok: false, reason: 'invalid_number' });
      expect(fromArcmin(bad)).toMatchObject({ ok: false, reason: 'invalid_number' });
    }
    expect(toDeg(Number.MAX_VALUE)).toMatchObject({ ok: false, reason: 'invalid_number' });
  });
});
