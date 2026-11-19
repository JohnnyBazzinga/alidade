import { describe, expect, it } from 'vitest';
import { fromDeg, toDeg } from './degrees';

describe('toDeg and fromDeg (Req 1.7: the one conversion module, over Core)', () => {
  it('convert the values every reader knows', () => {
    expect(toDeg(Math.PI)).toEqual({ ok: true, value: 180 });
    expect(toDeg(0)).toEqual({ ok: true, value: 0 });
    const quarter = toDeg(Math.PI / 2);
    expect(quarter.ok && Math.abs(quarter.value - 90) < 1e-12).toBe(true);
    expect(fromDeg(180)).toEqual({ ok: true, value: Math.PI });
    const full = fromDeg(360);
    expect(full.ok && Math.abs(full.value - 2 * Math.PI) < 1e-15).toBe(true);
    const negative = fromDeg(-90);
    expect(negative.ok && Math.abs(negative.value + Math.PI / 2) < 1e-15).toBe(true);
  });

  it('do not wrap: an angle outside [0, 360) is converted as it is', () => {
    expect(fromDeg(720)).toEqual({ ok: true, value: 4 * Math.PI });
    expect(toDeg(-3 * Math.PI)).toEqual({ ok: true, value: -540 });
  });

  it('round-trip within 1e-12 relative for angles of a few turns', () => {
    for (const angleDeg of [0.001, 0.0005, 1, 45.5, 89, 179.9995, 359.9996, -270, 1234.5]) {
      const rad = fromDeg(angleDeg);
      expect(rad.ok).toBe(true);
      if (!rad.ok) continue;
      const back = toDeg(rad.value);
      expect(
        back.ok && Math.abs(back.value - angleDeg) <= 1e-12 * Math.max(1, Math.abs(angleDeg)),
      ).toBe(true);
    }
  });

  it('fail with invalid_number, and return no NaN or infinity, for what is not a finite angle (Req 2.1)', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(toDeg(bad)).toEqual({ ok: false, reason: 'invalid_number' });
      expect(fromDeg(bad)).toEqual({ ok: false, reason: 'invalid_number' });
    }
  });

  it('fail when the result would overflow, not return infinity (Req 2.1)', () => {
    expect(toDeg(Number.MAX_VALUE)).toEqual({ ok: false, reason: 'invalid_number' });
    expect(fromDeg(Number.MAX_VALUE).ok).toBe(true); // the factor is below 1: no overflow
    expect(toDeg(Number.MAX_VALUE / 10).ok).toBe(false);
  });
});
