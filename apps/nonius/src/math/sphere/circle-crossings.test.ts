import { greatCircleDistanceM, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../degrees';
import { circleCrossings } from './circle-crossings';
import { EARTH_RADIUS_M } from './earth';

const D = DEG_TO_RAD;

function angleBetween(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value / EARTH_RADIUS_M;
}

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

describe('circleCrossings (Req 6.2)', () => {
  const A: Position = { latRad: 20 * D, lonRad: 10 * D };
  const B: Position = { latRad: -10 * D, lonRad: 60 * D };

  it('gives two crossings, each at its radius from both centres within 1e-9 rad', () => {
    const points = value(circleCrossings(A, 50 * D, B, 40 * D));
    expect(points).toHaveLength(2);
    for (const p of points) {
      expect(Math.abs(angleBetween(p, A) - 50 * D)).toBeLessThan(1e-9);
      expect(Math.abs(angleBetween(p, B) - 40 * D)).toBeLessThan(1e-9);
    }
    // The two are mirror images across the great circle through the centres: distinct places.
    expect(angleBetween(points[0] as Position, points[1] as Position)).toBeGreaterThan(0.1);
  });

  it('gives the known crossings of two circles on the equator: centres 0° and 90° E, radii 50° each', () => {
    // With a = (1, 0, 0) and b = (0, 1, 0) and both radii 50°, a crossing p has p·a = p·b =
    // cos 50°, so x = y = cos 50° and z = ±sqrt(1 − 2 cos² 50°): longitude 45° E, latitude ±asin z.
    const points = value(
      circleCrossings({ latRad: 0, lonRad: 0 }, 50 * D, { latRad: 0, lonRad: 90 * D }, 50 * D),
    );
    expect(points).toHaveLength(2);
    const z = Math.sqrt(1 - 2 * Math.cos(50 * D) ** 2);
    const lat = Math.asin(z);
    const sorted = [...points].sort((p, q) => p.latRad - q.latRad);
    expect(sorted[0]?.latRad).toBeCloseTo(-lat, 12);
    expect(sorted[1]?.latRad).toBeCloseTo(lat, 12);
    for (const p of points) expect(p.lonRad).toBeCloseTo(45 * D, 12);
  });

  it('gives a crossing on the antimeridian the longitude +180°, never −180° (counterexample of P-6.9, seed -249211460)', () => {
    // Circles of radius 60° about (0°, 150° E) and (0°, 150° W) cross on the antimeridian at
    // latitudes ±asin(...): the crossings have longitude 180°, which atan2 can give as −180°.
    const points = value(
      circleCrossings(
        { latRad: 0, lonRad: 150 * D },
        60 * D,
        { latRad: 0, lonRad: -150 * D },
        60 * D,
      ),
    );
    expect(points).toHaveLength(2);
    for (const p of points) {
      expect(p.lonRad).toBeGreaterThan(-Math.PI);
      expect(p.lonRad).toBeLessThanOrEqual(Math.PI);
      expect(Math.abs(Math.abs(p.lonRad) - Math.PI)).toBeLessThan(1e-9);
    }
    // And a pair whose crossing is exactly at (0°, 180°): radii 30° about (0°, 150° E) and (0°, 150° W).
    const [touch] = value(
      circleCrossings(
        { latRad: 0, lonRad: 150 * D },
        30 * D,
        { latRad: 0, lonRad: -150 * D },
        30 * D,
      ),
    );
    expect(touch?.lonRad).toBeGreaterThan(-Math.PI);
  });

  it('gives one where the circles touch', () => {
    // Two circles of radius 30° about centres 60° apart touch at the midpoint.
    const points = value(
      circleCrossings({ latRad: 0, lonRad: 0 }, 30 * D, { latRad: 0, lonRad: 60 * D }, 30 * D),
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.lonRad).toBeCloseTo(30 * D, 6);
    expect(points[0]?.latRad).toBeCloseTo(0, 6);
  });

  it('gives none when they do not meet: too small, or one inside the other', () => {
    expect(
      value(
        circleCrossings({ latRad: 0, lonRad: 0 }, 20 * D, { latRad: 0, lonRad: 90 * D }, 20 * D),
      ),
    ).toEqual([]);
    expect(
      value(
        circleCrossings({ latRad: 0, lonRad: 0 }, 60 * D, { latRad: 0, lonRad: 10 * D }, 20 * D),
      ),
    ).toEqual([]);
  });

  it('gives none for the same centre, and for antipodal centres', () => {
    expect(value(circleCrossings(A, 50 * D, A, 50 * D))).toEqual([]);
    expect(value(circleCrossings(A, 50 * D, A, 30 * D))).toEqual([]);
    const anti = { latRad: -A.latRad, lonRad: A.lonRad - Math.PI };
    expect(value(circleCrossings(A, 50 * D, anti, 130 * D))).toEqual([]);
  });

  it('refuses a radius that is not in (0, π) and numbers that are not finite', () => {
    for (const bad of [0, -0.1, Math.PI, 4, Number.NaN, Infinity]) {
      expect(circleCrossings(A, bad, B, 1)).toMatchObject({ ok: false, reason: 'invalid_number' });
      expect(circleCrossings(A, 1, B, bad)).toMatchObject({ ok: false, reason: 'invalid_number' });
    }
    expect(circleCrossings({ latRad: Number.NaN, lonRad: 0 }, 1, B, 1)).toMatchObject({
      ok: false,
    });
  });
});
