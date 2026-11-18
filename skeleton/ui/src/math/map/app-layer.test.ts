import { describe, expect, it } from 'vitest';
import { MAX_APP_LAYERS, MAX_LAYER_FEATURES } from '../../defaults';
import { SKELETON_KINDS } from '../../test-support/app-layer-generators';
import {
  appLayerKey,
  appLayerSpec,
  checkLayerCollection,
  checkLayerId,
  checkLayerPaint,
} from './app-layer';
import { APP_LAYERS_BEFORE_ID } from './map-style';

function point(coordinates: unknown, kind = 'hotspot', id = '0'): unknown {
  return {
    type: 'Feature',
    id: `${kind}:${id}`,
    geometry: { type: 'Point', coordinates },
    properties: { kind, id },
  };
}

function collectionOf(...features: unknown[]): unknown {
  return { type: 'FeatureCollection', features };
}

function fieldOf(r: { ok: boolean } & { reason?: string; field?: string }): string | undefined {
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid_number');
  return r.field;
}

describe('the limits are the requirement’s (Req 15.15)', () => {
  it('has eight layers and 2 000 features', () => {
    expect(MAX_APP_LAYERS).toBe(8);
    expect(MAX_LAYER_FEATURES).toBe(2000);
  });
});

describe('checkLayerId (Req 15.14)', () => {
  it.each(['a', 'wind', 'set-aside', 'a-1', 'x9', `a${'b'.repeat(31)}`, 'fix2', 'observers2'])(
    'accepts %s',
    (id) => {
      expect(checkLayerId(id)).toEqual({ ok: true, value: id });
    },
  );

  it.each([
    ['empty', ''],
    ['33 characters', `a${'b'.repeat(32)}`],
    ['upper case', 'A'],
    ['inner upper case', 'aB'],
    ['a digit first', '1a'],
    ['a hyphen first', '-a'],
    ['an underscore', 'a_b'],
    ['a space', 'a b'],
    ['observers', 'observers'],
    ['wedges', 'wedges'],
    ['bearings', 'bearings'],
    ['fix', 'fix'],
    ['a number', 5],
    ['null', null],
    ['undefined', undefined],
  ])('refuses %s, naming id', (_label, id) => {
    expect(fieldOf(checkLayerId(id) as never)).toBe('id');
  });
});

describe('checkLayerPaint (Req 15.14)', () => {
  it('accepts each kind, with and without the optional fields', () => {
    for (const paint of [
      { kind: 'fill', colour: '#12ab9F' },
      { kind: 'fill', colour: '#000000', opacity: 1 },
      { kind: 'line', colour: '#102030', widthPx: 16 },
      { kind: 'line', colour: '#102030', widthPx: 0.01, opacity: 0.5, dash: [1, 2, 3, 4] },
      { kind: 'line', colour: '#102030', widthPx: 2, dash: [] },
      { kind: 'circle', colour: '#FFFFFF', radiusPx: 16, opacity: 0.0001 },
    ]) {
      const r = checkLayerPaint(paint);
      expect(r).toEqual({ ok: true, value: paint });
    }
  });

  it.each([
    ['null', null, 'paint'],
    ['a string', 'line', 'paint'],
    ['no kind', {}, 'paint.kind'],
    ['text', { kind: 'text', colour: '#102030' }, 'paint.kind'],
    ['a colour name', { kind: 'fill', colour: 'red' }, 'paint.colour'],
    ['a short colour', { kind: 'fill', colour: '#123' }, 'paint.colour'],
    ['a long colour', { kind: 'fill', colour: '#1234567' }, 'paint.colour'],
    ['no hash', { kind: 'fill', colour: '12ab9f' }, 'paint.colour'],
    ['a non-hex digit', { kind: 'fill', colour: '#12ab9g' }, 'paint.colour'],
    ['no width', { kind: 'line', colour: '#102030' }, 'paint.widthPx'],
    ['width 0', { kind: 'line', colour: '#102030', widthPx: 0 }, 'paint.widthPx'],
    ['width 16.0001', { kind: 'line', colour: '#102030', widthPx: 16.0001 }, 'paint.widthPx'],
    ['width NaN', { kind: 'line', colour: '#102030', widthPx: Number.NaN }, 'paint.widthPx'],
    ['no radius', { kind: 'circle', colour: '#102030' }, 'paint.radiusPx'],
    ['radius 0', { kind: 'circle', colour: '#102030', radiusPx: 0 }, 'paint.radiusPx'],
    ['radius 16.0001', { kind: 'circle', colour: '#102030', radiusPx: 16.0001 }, 'paint.radiusPx'],
    [
      'a radius on a line',
      { kind: 'line', colour: '#102030', widthPx: 2, radiusPx: 3 },
      'paint.radiusPx',
    ],
    [
      'a width on a circle',
      { kind: 'circle', colour: '#102030', radiusPx: 2, widthPx: 3 },
      'paint.widthPx',
    ],
    ['a width on a fill', { kind: 'fill', colour: '#102030', widthPx: 3 }, 'paint.widthPx'],
    ['opacity 0', { kind: 'fill', colour: '#102030', opacity: 0 }, 'paint.opacity'],
    ['opacity 1.0001', { kind: 'fill', colour: '#102030', opacity: 1.0001 }, 'paint.opacity'],
    ['opacity NaN', { kind: 'fill', colour: '#102030', opacity: Number.NaN }, 'paint.opacity'],
    [
      'five dashes',
      { kind: 'line', colour: '#102030', widthPx: 2, dash: [1, 2, 3, 4, 5] },
      'paint.dash',
    ],
    ['a zero dash', { kind: 'line', colour: '#102030', widthPx: 2, dash: [0] }, 'paint.dash'],
    ['a negative dash', { kind: 'line', colour: '#102030', widthPx: 2, dash: [-1] }, 'paint.dash'],
    [
      'a NaN dash',
      { kind: 'line', colour: '#102030', widthPx: 2, dash: [Number.NaN] },
      'paint.dash',
    ],
    [
      'a dash on a circle',
      { kind: 'circle', colour: '#102030', radiusPx: 2, dash: [1] },
      'paint.dash',
    ],
    ['an unknown field', { kind: 'fill', colour: '#102030', glow: 3 }, 'paint.glow'],
  ])('refuses %s, naming %s', (_label, paint, field) => {
    expect(fieldOf(checkLayerPaint(paint) as never)).toBe(field);
  });
});

describe('checkLayerCollection (Req 15.14, 15.15)', () => {
  it('accepts a Point, a LineString and a Polygon, empty and not, as a copy', () => {
    const c = {
      type: 'FeatureCollection',
      features: [
        point([10, 20]),
        {
          type: 'Feature',
          id: 'line:1',
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          properties: { kind: 'line', id: '1' },
        },
        {
          type: 'Feature',
          id: 'area:2',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
          properties: { kind: 'area', id: '2' },
        },
      ],
    };
    const r = checkLayerCollection(c);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(c);
      expect(r.value).not.toBe(c);
      expect(r.value.features[0]).not.toBe((c.features as unknown[])[0]);
    }
    expect(checkLayerCollection(collectionOf()).ok).toBe(true);
  });

  it('is a copy: changing the caller’s object afterwards changes nothing in it', () => {
    const c = collectionOf(point([10, 20])) as {
      features: { geometry: { coordinates: number[] } }[];
    };
    const r = checkLayerCollection(c);
    if (!r.ok) throw new Error(r.reason);
    const first = c.features[0];
    if (first === undefined) throw new Error('feature');
    first.geometry.coordinates[0] = 99;
    expect(
      (r.value.features[0]?.geometry as unknown as { coordinates: number[] }).coordinates[0],
    ).toBe(10);
  });

  it('keeps 2 000 features and refuses 2 001, naming features', () => {
    const feature = point([1, 1]);
    expect(checkLayerCollection(collectionOf(...Array(2000).fill(feature))).ok).toBe(true);
    expect(fieldOf(checkLayerCollection(collectionOf(...Array(2001).fill(feature))) as never)).toBe(
      'features',
    );
  });

  it.each(SKELETON_KINDS)(
    'refuses the skeleton kind %s, whatever else the feature says',
    (kind) => {
      const c = collectionOf(point([1, 1]), point([2, 2], kind));
      expect(fieldOf(checkLayerCollection(c) as never)).toBe('features[1].properties.kind');
    },
  );

  it.each([
    ['not an object', null, 'collection'],
    ['an array', [], 'collection'],
    ['the wrong type', { type: 'Feature', features: [] }, 'collection'],
    ['no features', { type: 'FeatureCollection' }, 'collection'],
    ['features an object', { type: 'FeatureCollection', features: {} }, 'collection'],
    ['a null feature', collectionOf(null), 'features[0]'],
    [
      'a feature of the wrong type',
      collectionOf({ ...(point([1, 1]) as object), type: 'Thing' }),
      'features[0]',
    ],
    [
      'a numeric feature id',
      collectionOf({ ...(point([1, 1]) as object), id: 5 }),
      'features[0].id',
    ],
    [
      'no properties',
      collectionOf({ ...(point([1, 1]) as object), properties: null }),
      'features[0].properties',
    ],
    [
      'no kind',
      collectionOf({ ...(point([1, 1]) as object), properties: { id: '0' } }),
      'features[0].properties.kind',
    ],
    ['an empty kind', collectionOf(point([1, 1], '')), 'features[0].properties.kind'],
    [
      'no property id',
      collectionOf({ ...(point([1, 1]) as object), properties: { kind: 'hotspot' } }),
      'features[0].properties.id',
    ],
    [
      'no geometry',
      collectionOf({ ...(point([1, 1]) as object), geometry: null }),
      'features[0].geometry',
    ],
    [
      'a MultiPoint',
      collectionOf({
        ...(point([1, 1]) as object),
        geometry: { type: 'MultiPoint', coordinates: [] },
      }),
      'features[0].geometry',
    ],
    ['a NaN coordinate', collectionOf(point([Number.NaN, 1])), 'features[0].geometry.coordinates'],
    [
      'an infinite coordinate',
      collectionOf(point([1, Number.POSITIVE_INFINITY])),
      'features[0].geometry.coordinates',
    ],
    ['a third number', collectionOf(point([1, 1, 5])), 'features[0].geometry.coordinates'],
    ['one number', collectionOf(point([1])), 'features[0].geometry.coordinates'],
    ['latitude 89.5°', collectionOf(point([1, 89.5])), 'features[0].geometry.coordinates'],
    ['latitude -89.5°', collectionOf(point([1, -89.5])), 'features[0].geometry.coordinates'],
    ['longitude 181°', collectionOf(point([181, 1])), 'features[0].geometry.coordinates'],
    ['longitude -180°', collectionOf(point([-180, 1])), 'features[0].geometry.coordinates'],
    [
      'a bad vertex of a line',
      collectionOf({
        ...(point([1, 1]) as object),
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [0, 91],
          ],
        },
      }),
      'features[0].geometry.coordinates',
    ],
    [
      'a ring that is not nested',
      collectionOf({
        ...(point([1, 1]) as object),
        geometry: { type: 'Polygon', coordinates: [[1, 1]] },
      }),
      'features[0].geometry.coordinates',
    ],
  ])('refuses %s, naming %s', (_label, c, field) => {
    expect(fieldOf(checkLayerCollection(c) as never)).toBe(field);
  });

  it('accepts latitude 88.9° and longitude 179.9° (a pole is within 1° of unsupported)', () => {
    expect(
      checkLayerCollection(collectionOf(point([179.9, 88.9]), point([-179.9, -88.9]))).ok,
    ).toBe(true);

    expect(checkLayerCollection(collectionOf(point([180, 0]))).ok).toBe(true);
  });

  it('returns the first failure, feature by feature', () => {
    const c = collectionOf(point([1, 1]), point([Number.NaN, 1], 'x'), point([1, 1], 'fix'));
    expect(fieldOf(checkLayerCollection(c) as never)).toBe('features[1].geometry.coordinates');
  });
});

describe('appLayerSpec (Req 15.14: no text, no sprite, no glyph)', () => {
  it('draws a fill on polygons', () => {
    expect(appLayerSpec('x', { kind: 'fill', colour: '#112233', opacity: 0.4 })).toEqual({
      id: 'app-x',
      type: 'fill',
      source: 'app-x',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#112233', 'fill-opacity': 0.4 },
    });
  });

  it('draws a line on lines and on polygon outlines, with the dash when it has one', () => {
    expect(
      appLayerSpec('x', { kind: 'line', colour: '#112233', widthPx: 3, dash: [2, 1] }),
    ).toEqual({
      id: 'app-x',
      type: 'line',
      source: 'app-x',
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
      paint: {
        'line-color': '#112233',
        'line-width': 3,
        'line-opacity': 1,
        'line-dasharray': [2, 1],
      },
    });
    const solid = appLayerSpec('x', { kind: 'line', colour: '#112233', widthPx: 3, dash: [] });
    expect('line-dasharray' in solid.paint).toBe(false);
  });

  it('draws a circle on points', () => {
    expect(appLayerSpec('x', { kind: 'circle', colour: '#112233', radiusPx: 5 })).toEqual({
      id: 'app-x',
      type: 'circle',
      source: 'app-x',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': '#112233', 'circle-radius': 5, 'circle-opacity': 1 },
    });
  });

  it('names the layer and its source the same, with a prefix no skeleton id has', () => {
    expect(appLayerKey('wind')).toBe('app-wind');
    for (const kind of ['fill', 'line', 'circle'] as const) {
      const spec = appLayerSpec('wind', {
        kind,
        colour: '#000000',
        widthPx: 1,
        radiusPx: 1,
      } as never);
      expect(JSON.stringify(spec)).not.toMatch(/text|glyph|sprite|font/);
    }
    expect(APP_LAYERS_BEFORE_ID).toBe('wedges-fill');
  });
});
