// Arcs of a Circle near the Fix (Req 9.4, 9.9; design §7.7).

import { greatCircleDistanceM, initialAzimuthRad, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../degrees';
import { circleArc } from './circle-arc';
import { EARTH_RADIUS_M } from './earth';

const D = DEG_TO_RAD;
const STEP = 0.25 * D;

function arcs(centre: Position, radiusRad: number, near: Position, halfLengthM: number) {
  const r = circleArc(centre, radiusRad, near, halfLengthM, STEP);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

describe('circleArc', () => {
  const centre: Position = { latRad: -23 * D, lonRad: 10 * D };
  const radius = 50 * D;
  // A point on the Circle: 50° from the centre, due east.
  const near: Position = { latRad: -23 * D - 10 * D, lonRad: 55 * D };

  it('is one segment whose vertices lie on the Circle', () => {
    const segs = arcs(centre, radius, near, 300_000);
    expect(segs).toHaveLength(1);
    for (const v of segs[0] ?? []) {
      const d = greatCircleDistanceM(centre, v);
      if (!d.ok) throw new Error(d.reason);
      expect(Math.abs(d.value - radius * EARTH_RADIUS_M)).toBeLessThan(1e-3);
    }
  });

  it('has vertices at most one step apart along the Circle and reaches the half-length both ways', () => {
    const seg = arcs(centre, radius, near, 300_000)[0] ?? [];
    let longestM = 0;
    for (let i = 1; i < seg.length; i += 1) {
      const a = seg[i - 1];
      const b = seg[i];
      if (a === undefined || b === undefined) throw new Error('hole');
      const d = greatCircleDistanceM(a, b);
      if (!d.ok) throw new Error(d.reason);
      longestM = Math.max(longestM, d.value);
    }
    expect(longestM).toBeLessThanOrEqual(STEP * EARTH_RADIUS_M * (1 + 1e-6));
    const first = seg[0];
    const last = seg[seg.length - 1];
    if (first === undefined || last === undefined) throw new Error('empty');
    const span = greatCircleDistanceM(first, last);
    if (!span.ok) throw new Error(span.reason);
    // The chord of two half-lengths of 300 km each, on a Circle of radius R sin ρ.
    expect(span.value).toBeGreaterThan(0.99 * 600_000 * 0.99);
    expect(span.value).toBeLessThan(600_000 * 1.001);
  });

  it('is centred on the point of the Circle nearest the Fix', () => {
    const seg = arcs(centre, radius, near, 300_000)[0] ?? [];
    const mid = seg[Math.floor(seg.length / 2)];
    if (mid === undefined) throw new Error('empty');
    const azMid = initialAzimuthRad(centre, mid);
    const azNear = initialAzimuthRad(centre, near);
    if (!azMid.ok || !azNear.ok) throw new Error('azimuth');
    expect(
      Math.abs(
        Math.atan2(Math.sin(azMid.value - azNear.value), Math.cos(azMid.value - azNear.value)),
      ),
    ).toBeLessThan(1e-3);
  });

  it('is limited to half the Circle', () => {
    const seg = arcs(centre, radius, near, 1e9)[0] ?? [];
    const first = seg[0];
    const last = seg[seg.length - 1];
    if (first === undefined || last === undefined) throw new Error('empty');
    // Half the Circle each way is the whole Circle: the ends meet.
    const gap = greatCircleDistanceM(first, last);
    if (!gap.ok) throw new Error(gap.reason);
    expect(gap.value).toBeLessThan(STEP * EARTH_RADIUS_M * 2);
  });

  it('splits where the arc crosses the antimeridian, no segment spanning over 180° of longitude', () => {
    const c: Position = { latRad: 0, lonRad: 150 * D };
    // The Circle of 40° crosses the meridian of 180° at azimuth 43.5° from the centre, at 27.8° N.
    const near: Position = { latRad: 27.8 * D, lonRad: 179.9 * D };
    const segs = arcs(c, 40 * D, near, 1_000_000);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    for (const seg of segs) {
      const lons = seg.map((p) => p.lonRad);
      expect(Math.max(...lons) - Math.min(...lons)).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('leaves out a vertex within 1° of a pole and ends the segment there', () => {
    const c: Position = { latRad: 60 * D, lonRad: 0 };
    const segs = arcs(c, 30.5 * D, { latRad: 85 * D, lonRad: 0 }, 200_000);
    const count = segs.reduce((n, seg) => n + seg.length, 0);
    // 17 vertices are made; those near the pole are not Supported and are dropped.
    expect(count).toBeLessThan(17);
    for (const seg of segs) {
      for (const v of seg) expect(Math.abs(v.latRad)).toBeLessThanOrEqual(89 * D);
    }
  });

  it('refuses a centre at longitude -180°, outside Core’s domain (-π, π] (shrunk counterexample of P-9.9, seed -1971247205)', () => {
    // [lat 0°, lon -180°, radius 5°, azimuth -1.45e-13°, half-length 1 km]: the generator drew the
    // closed range [-180°, 180°]; the meridian is 180°, and Subsolar points are `wrapPi(-GHA)`.
    const r = circleArc(
      { latRad: 0, lonRad: -Math.PI },
      5 * D,
      { latRad: 5 * D, lonRad: -Math.PI + 1e-9 },
      1000,
      STEP,
    );
    expect(r).toMatchObject({ ok: false, reason: 'unsupported_position' });
    expect(
      circleArc(
        { latRad: 0, lonRad: Math.PI },
        5 * D,
        { latRad: 5 * D, lonRad: Math.PI },
        1000,
        STEP,
      ).ok,
    ).toBe(true);
  });

  it('refuses a radius outside (0, π), non-finite numbers and a Fix at the centre', () => {
    for (const bad of [0, Math.PI, -1, Number.NaN]) {
      expect(circleArc(centre, bad, near, 1000, STEP).ok).toBe(false);
    }
    expect(circleArc(centre, radius, near, Number.NaN, STEP).ok).toBe(false);
    expect(circleArc(centre, radius, near, 1000, 0).ok).toBe(false);
    expect(circleArc(centre, radius, centre, 1000, STEP).ok).toBe(false);
    expect(circleArc({ latRad: Number.NaN, lonRad: 0 }, radius, near, 1000, STEP).ok).toBe(false);
  });
});
