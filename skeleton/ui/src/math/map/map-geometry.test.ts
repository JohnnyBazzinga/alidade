import { degToRad, type Bearing } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { fixAround } from '../../test-support/map-generators';
import { bearingFeatures } from './bearing-features';
import { fixFeatures } from './fix-features';
import { EMPTY_COLLECTION, lonLat, type LonLat } from './geojson';
import { mapBounds } from './map-bounds';
import { observerFeatures } from './observer-features';
import { greatCircleDistanceM } from '@alidade/core';

const rad = (deg: number): number => {
  const r = degToRad(deg);
  if (!r.ok) throw new Error('angle');
  return r.value;
};

function bearing(over: Partial<Bearing> = {}): Bearing {
  return {
    id: 'b1',
    observer: { latRad: 0, lonRad: 0 },
    positionAccuracyM: 5,
    timeUtcMs: 1_790_000_000_000,
    azimuthRad: 0,
    azimuthSigmaRad: rad(2),
    ...over,
  };
}

function toPosition([lonDeg, latDeg]: LonLat) {
  return { latRad: rad(latDeg), lonRad: rad(lonDeg) };
}

describe('geojson (Req 14.1, 14.7)', () => {
  it('writes [lonDeg, latDeg] and never -0', () => {
    const p = lonLat({ latRad: rad(30), lonRad: rad(-40) });
    expect(p !== null && Math.abs(p[0] + 40) < 1e-12 && Math.abs(p[1] - 30) < 1e-12).toBe(true);
    const zero = lonLat({ latRad: -0, lonRad: -0 });
    expect(zero !== null && Object.is(zero[0], 0) && Object.is(zero[1], 0)).toBe(true);
    expect(lonLat({ latRad: Number.NaN, lonRad: 0 })).toBeNull();
  });
});

describe('observerFeatures (Req 14.2)', () => {
  it('gives one Point per observer with kind and id', () => {
    const result = observerFeatures([
      { id: 'a', position: { latRad: rad(30), lonRad: rad(-40) } },
      { id: 'b', position: { latRad: rad(30.01), lonRad: rad(-40) } },
    ]);
    expect(
      result.ok && result.value.features.map((f) => [f.id, f.properties, f.geometry.type]),
    ).toEqual([
      ['observer:a', { kind: 'observer', id: 'a' }, 'Point'],
      ['observer:b', { kind: 'observer', id: 'b' }, 'Point'],
    ]);
  });

  it('refuses an unsupported Position, naming the observer', () => {
    expect(observerFeatures([{ id: 'pole', position: { latRad: rad(89.5), lonRad: 0 } }])).toEqual({
      ok: false,
      reason: 'unsupported_position',
      id: 'pole',
    });
  });
});

describe('bearingFeatures (Req 14.3, 14.14)', () => {
  it('draws a bearing due north from the equator, by hand (Req 14.14)', () => {
    const result = bearingFeatures(bearing(), 111_195, rad(1));
    if (!result.ok) throw new Error(result.reason);
    const [line, wedge] = result.value.features;
    if (line?.geometry.type !== 'LineString' || wedge?.geometry.type !== 'Polygon')
      throw new Error('shape');
    expect(line.geometry.coordinates[0]).toEqual([0, 0]);
    const end = line.geometry.coordinates[1];
    // 111 195 m on a sphere of 6 371 008.8 m is 1.000 000 25° of latitude.
    expect(end?.[0]).toBe(0);
    expect(Math.abs((end?.[1] ?? 0) - (111_195 / 6_371_008.8) * (180 / Math.PI))).toBeLessThan(
      1e-12,
    );
    const ring = wedge.geometry.coordinates[0] ?? [];
    expect(ring[0]).toEqual([0, 0]);
    expect(ring[ring.length - 1]).toEqual([0, 0]);
    // 2σ = 4°, step 1°: 4 segments, 5 arc vertices, from +2° (east) to −2° (west), counter-clockwise.
    expect(ring).toHaveLength(7);
    expect((ring[1]?.[0] ?? 0) > 0).toBe(true);
    expect((ring[5]?.[0] ?? 0) < 0).toBe(true);
    expect(line.properties).toEqual({ kind: 'bearing-line', id: 'b1' });
    expect(wedge.properties).toEqual({ kind: 'bearing-wedge', id: 'b1' });
  });

  it('draws a Wedge of 45° sigma at the step limit with one segment per step', () => {
    const result = bearingFeatures(bearing({ azimuthSigmaRad: rad(45) }), 1000, rad(90));
    if (!result.ok) throw new Error(result.reason);
    const wedge = result.value.features[1];
    if (wedge?.geometry.type !== 'Polygon') throw new Error('shape');
    expect(wedge.geometry.coordinates[0]).toHaveLength(4);
  });

  it('draws a short line of 10 m (under the property domain) at its length', () => {
    const result = bearingFeatures(bearing({ azimuthRad: rad(60) }), 10, rad(1));
    if (!result.ok) throw new Error(result.reason);
    const line = result.value.features[0];
    if (line?.geometry.type !== 'LineString') throw new Error('shape');
    const [a, b] = line.geometry.coordinates;
    if (a === undefined || b === undefined) throw new Error('shape');
    const d = greatCircleDistanceM(toPosition(a), toPosition(b));
    expect(d.ok && Math.abs(d.value - 10) < 1e-6).toBe(true);
  });

  it('refuses a length of 0, 500 001 or NaN and a step of 0, naming them', () => {
    for (const lineLengthM of [0, 500_001, Number.NaN, -5]) {
      expect(bearingFeatures(bearing(), lineLengthM, rad(1))).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'lineLengthM',
      });
    }
    for (const step of [0, -1, Number.NaN, Infinity]) {
      expect(bearingFeatures(bearing(), 1000, step)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'arcStepRad',
      });
    }
  });

  it("refuses an invalid Bearing with Core's failure", () => {
    expect(bearingFeatures(bearing({ azimuthSigmaRad: 0 }), 1000, rad(1)).ok).toBe(false);
  });
});

describe('fixFeatures (Req 14.4, 14.5, 14.14)', () => {
  it('gives a ring of radius 24.477 m for a circular Fix of 1-sigma 10 m (Req 14.14)', () => {
    const fix = fixAround(
      { latRad: rad(30), lonRad: rad(-40) },
      { semiMajorM: 10, semiMinorM: 10, azimuthRad: 0 },
    );
    const result = fixFeatures(fix, 72);
    if (!result.ok) throw new Error(result.reason);
    const [pointFeature, ellipse] = result.value.features;
    expect(pointFeature.properties.kind).toBe('fix');
    expect(ellipse.properties.kind).toBe('fix-ellipse-95');
    if (ellipse.geometry.type !== 'Polygon' || pointFeature.geometry.type !== 'Point')
      throw new Error('shape');
    const ring = ellipse.geometry.coordinates[0] ?? [];
    expect(ring).toHaveLength(73);
    expect(ring[0]).toEqual(ring[72]);
    for (const vertex of ring) {
      const d = greatCircleDistanceM(fix.position, toPosition(vertex));
      expect(d.ok && Math.abs(d.value - 24.477)).toBeLessThan(1e-4);
    }
    // The first vertex is on the major axis, which points north at azimuth 0.
    expect((ring[0]?.[1] ?? 0) > 30).toBe(true);
  });

  it('returns no feature for a broken Ellipse', () => {
    const broken = fixAround(
      { latRad: 0, lonRad: 0 },
      { semiMajorM: 0, semiMinorM: 10, azimuthRad: 0 },
    );
    expect(fixFeatures(broken, 72)).toEqual({ ok: false, reason: 'invalid_number' });
    const inverted = fixAround(
      { latRad: 0, lonRad: 0 },
      { semiMajorM: 5, semiMinorM: 10, azimuthRad: 0 },
    );
    expect(fixFeatures(inverted, 72)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'semiMinorM',
    });
  });

  it('refuses vertexCount 15 or a non-integer', () => {
    const fix = fixAround(
      { latRad: 0, lonRad: 0 },
      { semiMajorM: 10, semiMinorM: 10, azimuthRad: 0 },
    );
    for (const n of [15, 16.5, Number.NaN]) {
      expect(fixFeatures(fix, n)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'vertexCount',
      });
    }
    expect(fixFeatures(fix, 16).ok).toBe(true);
  });

  it('returns no feature when a vertex falls within 1° of a pole', () => {
    const fix = fixAround(
      { latRad: rad(88.95), lonRad: 0 },
      { semiMajorM: 5000, semiMinorM: 5000, azimuthRad: 0 },
    );
    expect(fixFeatures(fix, 72)).toEqual({ ok: false, reason: 'unsupported_position' });
  });
});

describe('mapBounds (Req 14.6)', () => {
  it('holds every coordinate', () => {
    const result = bearingFeatures(bearing(), 10_000, rad(1));
    if (!result.ok) throw new Error('features');
    const bounds = mapBounds([result.value]);
    expect(
      bounds.ok &&
        bounds.value.westDeg < 0 &&
        bounds.value.eastDeg > 0 &&
        bounds.value.southDeg === 0,
    ).toBe(true);
  });

  it('refuses a set across ±180° and an empty set', () => {
    const across = observerFeatures([
      { id: 'w', position: { latRad: 0, lonRad: rad(179.9) } },
      { id: 'e', position: { latRad: 0, lonRad: rad(-179.9) } },
    ]);
    if (!across.ok) throw new Error('features');
    expect(mapBounds([across.value])).toEqual({ ok: false, reason: 'crosses_antimeridian' });
    expect(mapBounds([])).toEqual({ ok: false, reason: 'invalid_number', field: 'coordinates' });
    expect(mapBounds([EMPTY_COLLECTION])).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'coordinates',
    });
  });
});
