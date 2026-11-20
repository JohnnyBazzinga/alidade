import { greatCircleDistanceM } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M } from './earth';

// D23: Core does not export its radius; this keeps the two from drifting apart.
describe('EARTH_RADIUS_M (D23)', () => {
  it('is the sphere of math-conventions.md', () => {
    expect(EARTH_RADIUS_M).toBe(6_371_008.8);
  });

  it("equals Core's great-circle distance over one radian of the equator within 1e-6 m", () => {
    const d = greatCircleDistanceM({ latRad: 0, lonRad: 0 }, { latRad: 0, lonRad: 1 });
    expect(d.ok).toBe(true);
    if (d.ok) expect(Math.abs(d.value - EARTH_RADIUS_M)).toBeLessThan(1e-6);
  });
});
