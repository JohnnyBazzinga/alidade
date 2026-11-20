// The Comparison with the phone's GPS (Req 11.3, 11.6; design §7.8).

import { degToRad } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { compare } from './comparison';
import type { ShownFix } from './solve-candidate';

const D = DEG_TO_RAD;
const params = defaultParameters();

/** A Fix at 30° N, 40° W whose 1-sigma ellipse is 100 km by 50 km, the long axis due north. */
function shownFix(): ShownFix {
  return {
    position: { latRad: 30 * D, lonRad: -40 * D },
    covariance: { varEastM2: 50_000 ** 2, covEastNorthM2: 0, varNorthM2: 100_000 ** 2 },
    ellipse: { semiMajorM: 100_000, semiMinorM: 50_000, azimuthRad: 0 },
    residuals: [],
    excludedIds: [],
    warnings: [],
    cost: 0,
    iterations: 1,
  } as unknown as ShownFix;
}

describe('compare', () => {
  it('is inside at the Fix itself, at distance 0', () => {
    const r = compare(shownFix(), { latRad: 30 * D, lonRad: -40 * D }, params);
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.inside).toBe(true);
    expect(r.value.distanceM).toBeLessThan(1);
  });

  it('is inside north of the Fix by 2.4 sigma along the long axis, outside by 2.6', () => {
    const north = (km: number) => ({ latRad: 30 * D + (km * 1000) / 6_371_008.8, lonRad: -40 * D });
    const inside = compare(shownFix(), north(240), params);
    const outside = compare(shownFix(), north(260), params);
    if (!inside.ok || !outside.ok) throw new Error('failed');
    expect(inside.value.inside).toBe(true);
    expect(outside.value.inside).toBe(false);
  });

  it('is outside east of the Fix by 2.6 sigma of the short axis, with the direction east', () => {
    const lonShift = 130_000 / 6_371_008.8 / Math.cos(30 * D);
    const r = compare(shownFix(), { latRad: 30 * D, lonRad: -40 * D + lonShift }, params);
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.inside).toBe(false);
    expect(Math.abs(r.value.azimuthRad - Math.PI / 2)).toBeLessThan(0.01);
    expect(r.value.distanceM).toBeGreaterThan(120_000);
  });

  it('refuses a GPS position near a pole, a bad Fix and non-finite numbers', () => {
    expect(compare(shownFix(), { latRad: 89.5 * D, lonRad: 0 }, params).ok).toBe(false);
    expect(compare(shownFix(), { latRad: Number.NaN, lonRad: 0 }, params).ok).toBe(false);
    const flat = { ...shownFix(), covariance: { varEastM2: 0, covEastNorthM2: 0, varNorthM2: 0 } };
    expect(compare(flat, { latRad: 31 * D, lonRad: -40 * D }, params).ok).toBe(false);
    expect(degToRad(1).ok).toBe(true);
  });
});
