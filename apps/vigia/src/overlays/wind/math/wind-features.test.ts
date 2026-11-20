// The wind arrow (design §7.16, Req 13.3, 18.4; the lead's decision of 2026-11-22): where it is
// drawn, how large, and what it must not do. It is anchored on the Fix (or the midpoint of the
// observers), outside the Fix's 95 % ellipse and never over it, on the side of the Fix where it
// stays inside the part of the map that the observers and the ellipse already fit, and it sets no
// `fit`, so that it never changes what the map shows.

import {
  degToRad,
  greatCircleDistanceM,
  angularDifference,
  initialAzimuthRad,
  projectToLocalPlane,
  unprojectToLocalPlane,
  type Position,
} from '@alidade/core';
import { MAX_APP_LAYERS } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { SET_ASIDE_LAYER_IDS } from '../../../math/fix/map-model';
import type { WindReading } from './wind-parse';
import {
  WIND_ARROW_MIN_LENGTH_M,
  WIND_LAYER_IDS,
  observersMidpoint,
  windArrow,
  windLayers,
  type WindArrow,
  type WindDrawing,
} from './wind-features';

const ORIGIN: Position = (() => {
  const lat = degToRad(30);
  const lon = degToRad(-40);
  if (!lat.ok || !lon.ok) throw new Error('bad origin');
  return { latRad: lat.value, lonRad: lon.value };
})();

function offset(eastM: number, northM: number): Position {
  const p = unprojectToLocalPlane(ORIGIN, { eastM, northM });
  if (!p.ok) throw new Error('bad offset');
  return p.value;
}

function reading(fromDeg: number): WindReading {
  const from = degToRad(fromDeg);
  if (!from.ok) throw new Error('bad direction');
  return { point: ORIGIN, directionFromRad: from.value, speedMs: 4, validUtcMs: 0 };
}

function arrowOf(r: WindReading, d: WindDrawing): WindArrow {
  const a = windArrow(r, d);
  if (!a.ok) throw new Error(`windArrow failed: ${a.reason} ${a.field ?? ''}`);
  return a.value;
}

function distanceM(a: Position, b: Position): number {
  const d = greatCircleDistanceM(a, b);
  if (!d.ok) throw new Error('distance');
  return d.value;
}

function azimuthDegFromTo(a: Position, b: Position): number {
  const az = initialAzimuthRad(a, b);
  if (!az.ok) throw new Error('azimuth');
  return (az.value * 180) / Math.PI;
}

const vertices = (a: WindArrow): Position[] => [a.tail, a.tip, a.wingA, a.wingB];

/** The two-posts scene: observers 800 m west and east, the Fix 3 km north, the 95 % semi-major 765 m. */
const TWO_POSTS: WindDrawing = {
  anchor: offset(0, 3000),
  clearRadiusM: 765,
  lineLengthM: 3953,
  observers: [offset(-800, 0), offset(800, 0)],
};

describe('the size of the arrow (Req 18.4)', () => {
  it('is 15 % of the length of the map lines, and never under 300 m', () => {
    const big = arrowOf(reading(225), TWO_POSTS);
    expect(big.lengthM).toBeCloseTo(0.15 * 3953, 6);
    expect(distanceM(big.tail, big.tip)).toBeCloseTo(0.15 * 3953, 0);
    expect(WIND_ARROW_MIN_LENGTH_M).toBe(300);
    const small = arrowOf(reading(225), { ...TWO_POSTS, lineLengthM: 2000 });
    expect(small.lengthM).toBe(300);
    expect(distanceM(small.tail, small.tip)).toBeCloseTo(300, 0);
  });

  it('points the way the wind blows to: the direction it comes from, turned half a circle', () => {
    for (const fromDeg of [0, 45, 90, 225, 300, 359]) {
      const a = arrowOf(reading(fromDeg), TWO_POSTS);
      const toDeg = azimuthDegFromTo(a.tail, a.tip);
      const wantedDeg = (fromDeg + 180) % 360;
      const diffDeg = Math.abs(((toDeg - wantedDeg + 540) % 360) - 180);
      expect(diffDeg, `from ${fromDeg}`).toBeLessThan(0.05);
    }
  });

  it('has a head of two wings behind the tip, 0.3 of the arrow long', () => {
    const a = arrowOf(reading(225), TWO_POSTS);
    expect(distanceM(a.tip, a.wingA)).toBeCloseTo(0.3 * a.lengthM, 0);
    expect(distanceM(a.tip, a.wingB)).toBeCloseTo(0.3 * a.lengthM, 0);
  });
});

describe('where the arrow is drawn: beside the ellipse, never over it (the lead, 2026-11-22)', () => {
  it('in the two-posts scene, with the wind blowing toward the observers, stands downwind of the Fix, a gap beyond the 95 % ellipse', () => {
    // Wind from the north blows south, where the observers are and the map has room.
    const a = arrowOf(reading(0), TWO_POSTS);
    expect(a.side).toBe('downwind');
    expect(a.gapM).toBeCloseTo(a.lengthM / 2, 6);
    expect(distanceM(TWO_POSTS.anchor, a.tail)).toBeCloseTo(765 + a.gapM, 0);
    expect(distanceM(TWO_POSTS.anchor, a.tip)).toBeCloseTo(765 + a.gapM + a.lengthM, 0);
  });

  it('with the wind blowing past the Fix to where the map ends, stands on the side the wind comes from and points at the ellipse', () => {
    // Wind from the south-west blows north-east: past the top of the ellipse, outside what the map fits.
    const a = arrowOf(reading(225), TWO_POSTS);
    expect(a.side).toBe('upwind');
    expect(distanceM(TWO_POSTS.anchor, a.tip)).toBeCloseTo(765 + a.gapM, 0);
    expect(distanceM(TWO_POSTS.anchor, a.tail)).toBeCloseTo(765 + a.gapM + a.lengthM, 0);
    const tail = projectToLocalPlane(TWO_POSTS.anchor, a.tail);
    if (!tail.ok) throw new Error('project');
    expect(tail.value.eastM).toBeLessThan(0);
    expect(tail.value.northM).toBeLessThan(0);
  });

  it('no vertex and no point of the shaft or the head comes within the ellipse\u2019s circle, for every direction and size', () => {
    for (const clearRadiusM of [0, 100, 765, 20_000]) {
      for (let fromDeg = 0; fromDeg < 360; fromDeg += 10) {
        for (const observers of [
          [offset(-800, 0), offset(800, 0)],
          [offset(-3000, -3000)],
          [offset(2500, 400), offset(-300, -2800), offset(100, 1900)],
        ]) {
          const drawing: WindDrawing = { ...TWO_POSTS, clearRadiusM, observers };
          const a = arrowOf(reading(fromDeg), drawing);
          const nearestM = a.gapM + clearRadiusM;
          const segments: readonly (readonly [Position, Position])[] = [
            [a.tail, a.tip],
            [a.wingA, a.tip],
            [a.tip, a.wingB],
          ];
          for (const v of vertices(a)) {
            expect(
              distanceM(drawing.anchor, v),
              `${clearRadiusM} ${fromDeg} vertex`,
            ).toBeGreaterThan(clearRadiusM + 0.99 * a.gapM);
          }
          for (const [from, to] of segments) {
            for (let k = 0; k <= 10; k += 1) {
              const f = k / 10;
              const pa = projectToLocalPlane(drawing.anchor, from);
              const pb = projectToLocalPlane(drawing.anchor, to);
              if (!pa.ok || !pb.ok) throw new Error('project');
              const e = pa.value.eastM + f * (pb.value.eastM - pa.value.eastM);
              const n = pa.value.northM + f * (pb.value.northM - pa.value.northM);
              expect(Math.hypot(e, n), `${clearRadiusM} ${fromDeg} segment`).toBeGreaterThan(
                clearRadiusM + 0.99 * a.gapM,
              );
            }
          }
          expect(nearestM).toBeGreaterThanOrEqual(clearRadiusM + WIND_ARROW_MIN_LENGTH_M / 2);
        }
      }
    }
  });

  it('with no Fix (a clear radius of 0) still starts a gap away from the anchor, not on it', () => {
    const a = arrowOf(reading(90), {
      anchor: offset(0, 0),
      clearRadiusM: 0,
      lineLengthM: 5000,
      observers: [offset(0, 0)],
    });
    expect(distanceM(offset(0, 0), a.tail)).toBeCloseTo(a.gapM, 0);
    expect(a.gapM).toBeGreaterThanOrEqual(150);
  });

  it('stays inside the part of the map that the observers and the ellipse fit, when a side allows it', () => {
    // The region is the box of the observers and of the circle round the Fix, made as wide as it is
    // tall when it is taller (a map at least as wide as it is tall shows at least that).
    for (let fromDeg = 0; fromDeg < 360; fromDeg += 15) {
      const a = arrowOf(reading(fromDeg), TWO_POSTS);
      const eastWest = 1882; // half the box's height, 3 765 m, round the centre line
      for (const v of vertices(a)) {
        const p = projectToLocalPlane(TWO_POSTS.anchor, v);
        if (!p.ok) throw new Error('project');
        // The box, relative to the Fix: north from -3000 to +765.
        const inside =
          Math.abs(p.value.eastM) <= eastWest + 1 &&
          p.value.northM >= -3000 - 1 &&
          p.value.northM <= 765 + 1;
        if (!inside) {
          // Allowed only when neither side fits (the arrow then stays downwind).
          expect(a.side, `from ${fromDeg}`).toBe('downwind');
        }
      }
    }
    // A wind from the north-east blows south-west, toward the observers: room, so downwind.
    expect(arrowOf(reading(45), TWO_POSTS).side).toBe('downwind');
  });

  it('goes to the upwind side, ending near the ellipse, when downwind would leave the map', () => {
    // The observers are all south-west of the Fix; a wind to the north-east has no room beyond it.
    const drawing: WindDrawing = {
      anchor: offset(0, 0),
      clearRadiusM: 100,
      lineLengthM: 5516,
      observers: [offset(-3000, -3000), offset(-3000, -2000)],
    };
    const a = arrowOf(reading(225), drawing);
    expect(a.side).toBe('upwind');
    // The tip is the end nearer the Fix, a gap beyond the circle; the tail is farther out, to the south-west.
    expect(distanceM(drawing.anchor, a.tip)).toBeCloseTo(100 + a.gapM, 0);
    expect(distanceM(drawing.anchor, a.tail)).toBeCloseTo(100 + a.gapM + a.lengthM, 0);
    const tail = projectToLocalPlane(drawing.anchor, a.tail);
    if (!tail.ok) throw new Error('project');
    expect(tail.value.eastM).toBeLessThan(0);
    expect(tail.value.northM).toBeLessThan(0);
    // Still pointing the way the wind blows to.
    const toDeg = azimuthDegFromTo(a.tail, a.tip);
    const off = angularDifference((toDeg * Math.PI) / 180, (45 * Math.PI) / 180);
    expect(off.ok && Math.abs(off.value)).toBeLessThan(0.001);
  });

  it('takes the downwind side when neither side fits', () => {
    const a = arrowOf(reading(225), {
      anchor: offset(0, 0),
      clearRadiusM: 50,
      lineLengthM: 2000,
      observers: [offset(10, 10)],
    });
    expect(a.side).toBe('downwind');
  });
});

describe('the layers (Req 18.4)', () => {
  const layers = (() => {
    const l = windLayers(reading(225), TWO_POSTS);
    if (!l.ok) throw new Error('windLayers failed');
    return l.value;
  })();

  it('are the shaft and the head, named wind and wind-head, in the Overlay\u2019s blue, 4 px', () => {
    expect(layers.map((l) => l.id)).toEqual(['wind', 'wind-head']);
    expect([...WIND_LAYER_IDS]).toEqual(['wind', 'wind-head']);
    for (const l of layers) {
      expect(l.paint).toEqual({ kind: 'line', colour: '#0B4F8A', widthPx: 4 });
    }
  });

  it('never set `fit`, so that the arrow cannot change what the map is fitted to', () => {
    for (const l of layers) expect('fit' in l).toBe(false);
  });

  it('hold one line of two positions (the shaft) and one of three (the head, ending at the tip)', () => {
    const [shaft, head] = layers;
    expect(shaft?.collection.features).toHaveLength(1);
    expect(head?.collection.features).toHaveLength(1);
    const s = shaft?.collection.features[0]?.geometry;
    const h = head?.collection.features[0]?.geometry;
    expect(s?.type).toBe('LineString');
    expect(h?.type).toBe('LineString');
    if (s?.type === 'LineString' && h?.type === 'LineString') {
      expect(s.coordinates).toHaveLength(2);
      expect(h.coordinates).toHaveLength(3);
      expect(h.coordinates[1]).toEqual(s.coordinates[1]);
    }
    expect(shaft?.collection.features[0]?.properties.kind).toBe('wind-shaft');
    expect(head?.collection.features[0]?.properties.kind).toBe('wind-head');
  });

  it('with the layers of the model are four of the eight that UI allows', () => {
    const ids = [...SET_ASIDE_LAYER_IDS, ...WIND_LAYER_IDS];
    expect(new Set(ids).size).toBe(4);
    expect(ids.length).toBeLessThanOrEqual(MAX_APP_LAYERS);
  });
});

describe('observersMidpoint (Req 13.2)', () => {
  it('is the middle of two observers', () => {
    const m = observersMidpoint([offset(-800, 0), offset(800, 0)]);
    expect(m.ok).toBe(true);
    if (m.ok) expect(distanceM(m.value, ORIGIN)).toBeLessThan(1);
  });

  it('is the middle across the antimeridian, not on the other side of the world', () => {
    const a = { latRad: 0.2, lonRad: Math.PI - 0.001 };
    const b = { latRad: 0.2, lonRad: -Math.PI + 0.001 };
    const m = observersMidpoint([a, b]);
    expect(m.ok).toBe(true);
    if (m.ok) expect(Math.abs(m.value.lonRad)).toBeGreaterThan(Math.PI - 1e-9);
  });

  it('fails for no observers, for observers opposite each other and for one that is not Supported', () => {
    expect(observersMidpoint([])).toMatchObject({ ok: false, reason: 'invalid_number' });
    const a = { latRad: 0.2, lonRad: 0 };
    const b = { latRad: -0.2, lonRad: Math.PI };
    expect(observersMidpoint([a, b])).toMatchObject({ ok: false, reason: 'invalid_number' });
    expect(observersMidpoint([{ latRad: Math.PI / 2, lonRad: 0 }])).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
  });
});

describe('totality (Req 2.1)', () => {
  it('a drawing or a reading with a number that is not finite is a failure naming it', () => {
    expect(windArrow(reading(10), { ...TWO_POSTS, lineLengthM: Number.NaN })).toMatchObject({
      ok: false,
      field: 'lineLengthM',
    });
    expect(windArrow(reading(10), { ...TWO_POSTS, clearRadiusM: -1 })).toMatchObject({
      ok: false,
      field: 'clearRadiusM',
    });
    expect(
      windArrow({ ...reading(10), directionFromRad: Number.POSITIVE_INFINITY }, TWO_POSTS),
    ).toMatchObject({ ok: false, field: 'directionFromRad' });
    expect(
      windArrow(reading(10), { ...TWO_POSTS, anchor: { latRad: Math.PI / 2, lonRad: 0 } }),
    ).toMatchObject({ ok: false, reason: 'unsupported_position' });
  });
});
