import { describe, expect, it } from 'vitest';
import { fromDeg } from '../degrees';
import { appFeature } from './app-feature';
import { checkLayerCollection } from './app-layer';

const at = (latDeg: number, lonDeg: number) => ({
  latRad: fromDeg(latDeg),
  lonRad: fromDeg(lonDeg),
});

function built(r: ReturnType<typeof appFeature>) {
  if (!r.ok) throw new Error(`${r.reason} ${r.field ?? ''}`);
  return r.value;
}

describe('appFeature: a feature of an application from Positions (Req 15.14)', () => {
  it('writes a point as [longitude, latitude] in degrees, with its kind and id', () => {
    const f = built(appFeature('hotspot', 'h1', { type: 'point', position: at(30, -40) }));
    expect(f.type).toBe('Feature');
    expect(f.id).toBe('hotspot:h1');
    expect(f.properties).toEqual({ kind: 'hotspot', id: 'h1' });
    expect(f.geometry.type).toBe('Point');
    const [lon, lat] = (f.geometry as unknown as { coordinates: number[] }).coordinates;
    expect(lon).toBeCloseTo(-40, 12);
    expect(lat).toBeCloseTo(30, 12);
  });

  it('writes a line in the order given', () => {
    const f = built(
      appFeature('lop', 'a', { type: 'line', positions: [at(10, 20), at(11, 21), at(12, 22)] }),
    );
    const c = (f.geometry as unknown as { coordinates: number[][] }).coordinates;
    expect(f.geometry.type).toBe('LineString');
    expect(c.map(([lon]) => Math.round(lon as number))).toEqual([20, 21, 22]);
    expect(c.map(([, lat]) => Math.round(lat as number))).toEqual([10, 11, 12]);
  });

  it('closes the ring of a polygon, and does not repeat a vertex already repeated', () => {
    const open = built(
      appFeature('zone', 'z', { type: 'polygon', positions: [at(0, 0), at(0, 1), at(1, 1)] }),
    );
    const ring = (open.geometry as unknown as { coordinates: number[][][] })
      .coordinates[0] as number[][];
    expect(open.geometry.type).toBe('Polygon');
    expect(ring).toHaveLength(4);
    expect(ring[3]).toEqual(ring[0]);
    const closed = built(
      appFeature('zone', 'z', {
        type: 'polygon',
        positions: [at(0, 0), at(0, 1), at(1, 1), at(0, 0)],
      }),
    );
    expect(
      (closed.geometry as unknown as { coordinates: number[][][] }).coordinates[0],
    ).toHaveLength(4);
  });

  it('writes no -0', () => {
    const f = built(appFeature('k', 'i', { type: 'point', position: { latRad: -0, lonRad: -0 } }));
    const [lon, lat] = (f.geometry as unknown as { coordinates: number[] }).coordinates;
    expect(Object.is(lon, 0)).toBe(true);
    expect(Object.is(lat, 0)).toBe(true);
  });

  it('is accepted by the check that setLayer applies, when the kind is not a skeleton kind', () => {
    const features = [
      built(appFeature('hotspot', 'p', { type: 'point', position: at(30, -40) })),
      built(appFeature('lop', 'l', { type: 'line', positions: [at(30, -40), at(31, -41)] })),
      built(
        appFeature('zone', 'z', { type: 'polygon', positions: [at(0, 0), at(0, 1), at(1, 1)] }),
      ),
    ];
    expect(checkLayerCollection({ type: 'FeatureCollection', features }).ok).toBe(true);
    const skeleton = built(appFeature('fix', 'f', { type: 'point', position: at(30, -40) }));
    expect(checkLayerCollection({ type: 'FeatureCollection', features: [skeleton] })).toMatchObject(
      {
        ok: false,
        field: 'features[0].properties.kind',
      },
    );
  });
});

describe('appFeature: what it refuses', () => {
  it.each([
    ['a latitude within 1° of the pole', at(89.5, 0)],
    ['NaN', { latRad: Number.NaN, lonRad: 0 }],
    ['an infinite longitude', { latRad: 0, lonRad: Number.POSITIVE_INFINITY }],
    ['longitude -180°', at(0, -180)],
  ])('refuses %s with unsupported_position', (_label, position) => {
    expect(appFeature('k', 'i', { type: 'point', position })).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
    expect(appFeature('k', 'i', { type: 'line', positions: [at(0, 0), position] })).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
  });

  it('refuses a line of fewer than 2 and a polygon of fewer than 3 Positions with invalid_number', () => {
    for (const positions of [[], [at(0, 0)]])
      expect(appFeature('k', 'i', { type: 'line', positions })).toMatchObject({
        ok: false,
        reason: 'invalid_number',
        field: 'positions',
      });
    for (const positions of [[], [at(0, 0)], [at(0, 0), at(1, 1)]])
      expect(appFeature('k', 'i', { type: 'polygon', positions })).toMatchObject({
        ok: false,
        reason: 'invalid_number',
        field: 'positions',
      });
    expect(appFeature('k', 'i', { type: 'line', positions: [at(0, 0), at(1, 1)] }).ok).toBe(true);
  });

  it('counts before it looks at the Positions', () => {
    expect(appFeature('k', 'i', { type: 'line', positions: [at(89.5, 0)] })).toMatchObject({
      reason: 'invalid_number',
    });
  });

  it('refuses an empty kind or id, and a shape it does not know, without throwing', () => {
    expect(appFeature('', 'i', { type: 'point', position: at(0, 0) })).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'kind',
    });
    expect(appFeature('k', '', { type: 'point', position: at(0, 0) })).toMatchObject({
      field: 'id',
    });
    expect(appFeature('k', 'i', { type: 'circle' } as never)).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'shape',
    });
  });
});
