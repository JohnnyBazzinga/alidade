// Generators of the application-layer properties (design §8 `appLayerOp`; test support, not
// exported). Every invalid draw has exactly one defect and carries the field a refusal must name,
// so that the properties' oracle does not use the code under test.

import fc from 'fast-check';
import type { AppFeature, AppFeatureCollection, LayerPaint } from '../math/map/app-layer';
import { closed } from './generators';

/** The five kinds the skeleton draws itself (Req 15.15). */
export const SKELETON_KINDS = [
  'observer',
  'bearing-line',
  'bearing-wedge',
  'fix',
  'fix-ellipse-95',
] as const;

/** Kinds an application may use: none of the five above. */
const APP_KINDS = ['set-aside', 'hotspot', 'wind', 'line-of-position', 'footprint'] as const;

/** Ids of the ten layers the sequences use; 10 > 8, so that the limit is reached. */
export const LAYER_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const;

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly field: string };

/** A valid `[lonDeg, latDeg]`: longitude in [-179.9, 179.9], latitude in [-88.9, 88.9] (ends drawn). */
function coordinate(): fc.Arbitrary<[number, number]> {
  return fc.tuple(closed(-179.9, 179.9), closed(-88.9, 88.9));
}

function validGeometry(): fc.Arbitrary<unknown> {
  return fc.oneof(
    coordinate().map((coordinates) => ({ type: 'Point', coordinates })),
    fc
      .array(coordinate(), { minLength: 2, maxLength: 4 })
      .map((coordinates) => ({ type: 'LineString', coordinates })),
    fc.array(coordinate(), { minLength: 3, maxLength: 4 }).map((ring) => ({
      type: 'Polygon',
      coordinates: [[...ring, ring[0] as [number, number]]],
    })),
  );
}

function validFeature(index: number): fc.Arbitrary<AppFeature> {
  return fc
    .record({ kind: fc.constantFrom(...APP_KINDS), geometry: validGeometry() })
    .map(({ kind, geometry }) => ({
      type: 'Feature' as const,
      id: `${kind}:${index}`,
      geometry: geometry as AppFeature['geometry'],
      properties: { kind, id: String(index) },
    }));
}

/** A valid collection of 0 to 3 features (Point, LineString or Polygon at Supported positions). */
export function appCollection(): fc.Arbitrary<AppFeatureCollection> {
  return fc
    .integer({ min: 0, max: 3 })
    .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => validFeature(i))))
    .map((features) => ({ type: 'FeatureCollection' as const, features }));
}

/** A valid paint of each of the three kinds, widths and radii in (0, 16] (16 drawn). */
export function appPaint(): fc.Arbitrary<LayerPaint> {
  const colour = fc
    .array(fc.constantFrom(...'0123456789abcdefABCDEF'.split('')), { minLength: 6, maxLength: 6 })
    .map((digits) => `#${digits.join('')}`);
  const opacity = fc.option(closed(0.01, 1), { nil: undefined });
  const size = closed(0.01, 16);
  return fc.oneof(
    fc.record({ colour, opacity }).map(({ colour: c, opacity: o }) => ({
      kind: 'fill' as const,
      colour: c,
      ...(o === undefined ? {} : { opacity: o }),
    })),
    fc
      .record({
        colour,
        widthPx: size,
        opacity,
        dash: fc.option(fc.array(closed(0.1, 20), { minLength: 0, maxLength: 4 }), {
          nil: undefined,
        }),
      })
      .map(({ colour: c, widthPx, opacity: o, dash }) => ({
        kind: 'line' as const,
        colour: c,
        widthPx,
        ...(o === undefined ? {} : { opacity: o }),
        ...(dash === undefined ? {} : { dash }),
      })),
    fc.record({ colour, radiusPx: size, opacity }).map(({ colour: c, radiusPx, opacity: o }) => ({
      kind: 'circle' as const,
      colour: c,
      radiusPx,
      ...(o === undefined ? {} : { opacity: o }),
    })),
  );
}

export function validId(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constantFrom(...LAYER_IDS),
    fc
      .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), {
        minLength: 0,
        maxLength: 31,
      })
      .chain((rest) =>
        fc
          .constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''))
          .map((first) => first + rest.join('')),
      ),
  );
}

export interface Defect<T> {
  readonly value: T;
  readonly field: string;
}

/** An id with one defect (length 0 or 33, upper case, first a digit or a hyphen, `_`, a skeleton id, a non-string). */
export function badId(): fc.Arbitrary<Defect<unknown>> {
  const bad: unknown[] = [
    '',
    'a'.repeat(33),
    'A',
    'aB',
    '1a',
    '-a',
    'a_b',
    'a b',
    'observers',
    'wedges',
    'bearings',
    'fix',
    5,
    null,
    undefined,
  ];
  return fc.constantFrom(...bad).map((value) => ({ value, field: 'id' }));
}

/** A paint with one defect, with the field a refusal must name. */
export function badPaint(): fc.Arbitrary<Defect<unknown>> {
  const line = { kind: 'line', colour: '#102030', widthPx: 4 };
  const circle = { kind: 'circle', colour: '#102030', radiusPx: 4 };
  const fill = { kind: 'fill', colour: '#102030' };
  const cases: Defect<unknown>[] = [
    { value: null, field: 'paint' },
    { value: 'line', field: 'paint' },
    { value: {}, field: 'paint.kind' },
    { value: { ...line, kind: 'text' }, field: 'paint.kind' },
    ...['red', '#12345', '#1234567', '12ab9f', '#12ab9g', '#12ab9f ', 5].map((c) => ({
      value: { ...line, colour: c },
      field: 'paint.colour',
    })),
    ...[0, -1, 16.0001, Number.NaN, Number.POSITIVE_INFINITY, '4'].map((w) => ({
      value: { ...line, widthPx: w },
      field: 'paint.widthPx',
    })),
    { value: { kind: 'line', colour: '#102030' }, field: 'paint.widthPx' },
    ...[0, -1, 16.0001, Number.NaN, Number.POSITIVE_INFINITY].map((r) => ({
      value: { ...circle, radiusPx: r },
      field: 'paint.radiusPx',
    })),
    { value: { kind: 'circle', colour: '#102030' }, field: 'paint.radiusPx' },
    { value: { ...line, radiusPx: 3 }, field: 'paint.radiusPx' },
    { value: { ...circle, widthPx: 3 }, field: 'paint.widthPx' },
    { value: { ...fill, widthPx: 3 }, field: 'paint.widthPx' },
    ...[0, -0.5, 1.0001, Number.NaN, 2].map((o) => ({
      value: { ...fill, opacity: o },
      field: 'paint.opacity',
    })),
    ...[[1, 2, 3, 4, 5], [0], [-1], [Number.NaN], [1, Number.POSITIVE_INFINITY], 'dashed', 3].map(
      (d) => ({
        value: { ...line, dash: d },
        field: 'paint.dash',
      }),
    ),
    { value: { ...circle, dash: [1] }, field: 'paint.dash' },
    { value: { ...fill, dash: [1] }, field: 'paint.dash' },
    { value: { ...line, glow: 3 }, field: 'paint.glow' },
  ];
  return fc.constantFrom(...cases);
}

function pointFeature(coordinates: unknown, kind = 'hotspot'): unknown {
  return {
    type: 'Feature',
    id: `${kind}:0`,
    geometry: { type: 'Point', coordinates },
    properties: { kind, id: '0' },
  };
}

function collectionOf(first: unknown, rest: readonly AppFeature[]): unknown {
  return { type: 'FeatureCollection', features: [first, ...rest] };
}

/**
 * A collection with one defect in its first feature (the others valid), with the field a refusal
 * must name; one draw in forty has 2 001 features. The five skeleton kinds, a coordinate that is
 * `NaN`, infinite, at latitude 89.5° or longitude 181° or -180°, and a third number are drawn.
 */
export function badCollection(): fc.Arbitrary<Defect<unknown>> {
  const many = Array.from({ length: 2001 }, (_, i) => pointFeature([i % 100, 10], 'hotspot'));
  const feature = (f: AppFeature, rest: readonly AppFeature[]): unknown => collectionOf(f, rest);
  return fc.array(validFeature(1), { minLength: 0, maxLength: 2 }).chain((rest) => {
    const coordinateCases: unknown[][] = [
      [Number.NaN, 10],
      [10, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, 10],
      [10, 89.5],
      [10, -89.5],
      [181, 10],
      [-180, 10],
      [10, 10, 100],
      [10],
      [],
    ];
    const kindCases: Defect<unknown>[] = [
      ...SKELETON_KINDS.map((kind) => ({
        value: feature(pointFeature([10, 10], kind) as AppFeature, rest),
        field: 'features[0].properties.kind',
      })),
      {
        value: feature(pointFeature([10, 10], '') as AppFeature, rest),
        field: 'features[0].properties.kind',
      },
    ];
    const cases: Defect<unknown>[] = [
      { value: null, field: 'collection' },
      { value: [], field: 'collection' },
      { value: { type: 'Feature', features: [] }, field: 'collection' },
      { value: { type: 'FeatureCollection' }, field: 'collection' },
      { value: { type: 'FeatureCollection', features: {} }, field: 'collection' },
      { value: { type: 'FeatureCollection', features: many }, field: 'features' },
      { value: feature(null as unknown as AppFeature, rest), field: 'features[0]' },
      {
        value: feature(
          { ...(pointFeature([1, 1]) as AppFeature), type: 'Thing' as 'Feature' },
          rest,
        ),
        field: 'features[0]',
      },
      {
        value: feature(
          { ...(pointFeature([1, 1]) as AppFeature), id: 5 as unknown as string },
          rest,
        ),
        field: 'features[0].id',
      },
      {
        value: feature(
          { ...(pointFeature([1, 1]) as AppFeature), properties: null as never },
          rest,
        ),
        field: 'features[0].properties',
      },
      {
        value: feature(
          { ...(pointFeature([1, 1]) as AppFeature), properties: { kind: 'hotspot' } as never },
          rest,
        ),
        field: 'features[0].properties.id',
      },
      ...kindCases,
      {
        value: feature({ ...(pointFeature([1, 1]) as AppFeature), geometry: null as never }, rest),
        field: 'features[0].geometry',
      },
      {
        value: feature(
          {
            ...(pointFeature([1, 1]) as AppFeature),
            geometry: { type: 'MultiPoint', coordinates: [] } as never,
          },
          rest,
        ),
        field: 'features[0].geometry',
      },
      ...coordinateCases.map((c) => ({
        value: feature(pointFeature(c) as AppFeature, rest),
        field: 'features[0].geometry.coordinates',
      })),
      {
        value: feature(
          {
            ...(pointFeature([1, 1]) as AppFeature),
            geometry: {
              type: 'LineString',
              coordinates: [
                [1, 1],
                [Number.NaN, 2],
              ],
            } as never,
          },
          rest,
        ),
        field: 'features[0].geometry.coordinates',
      },
      {
        value: feature(
          {
            ...(pointFeature([1, 1]) as AppFeature),
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [1, 1],
                  [2, 2],
                  [3, 91],
                  [1, 1],
                ],
              ],
            } as never,
          },
          rest,
        ),
        field: 'features[0].geometry.coordinates',
      },
      {
        value: feature(
          {
            ...(pointFeature([1, 1]) as AppFeature),
            geometry: { type: 'Polygon', coordinates: [[1, 1]] } as never,
          },
          rest,
        ),
        field: 'features[0].geometry.coordinates',
      },
    ];
    // 2 001 features is one draw in forty: weight the many-features case down.
    return fc.oneof(
      { weight: 39, arbitrary: fc.constantFrom(...cases.filter((c) => c.field !== 'features')) },
      {
        weight: 1,
        arbitrary: fc.constant(cases.find((c) => c.field === 'features') as Defect<unknown>),
      },
    );
  });
}

/** A valid `setLayer` of the given id (a valid collection and paint, verdict ok). */
export function validSetLayer(id: string): fc.Arbitrary<LayerOp> {
  return fc.tuple(appCollection(), appPaint()).map(([collection, paint]) => ({
    kind: 'setLayer' as const,
    id,
    collection,
    paint,
    verdict: { ok: true } as Verdict,
  }));
}

/**
 * A run of 8 to 10 valid `setLayer` calls on distinct ids, in a drawn order: a sequence that
 * starts with it reaches the limit of 8 layers, which random calls on ten ids reach too rarely.
 */
export function fillLayers(): fc.Arbitrary<LayerOp[]> {
  return fc
    .shuffledSubarray([...LAYER_IDS], { minLength: 8, maxLength: 10 })
    .chain((ids) => fc.tuple(...ids.map((id) => validSetLayer(id))));
}

export type LayerOp =
  | {
      readonly kind: 'setLayer';
      readonly id: unknown;
      readonly collection: unknown;
      readonly paint: unknown;
      readonly verdict: Verdict;
    }
  | { readonly kind: 'clearLayer'; readonly id: unknown; readonly verdict: Verdict };

/**
 * `appLayerOp`: one call of `setLayer` or `clearLayer` with its own verdict. A `setLayer` is
 * valid (id of the ten fixed ids, a valid paint, a valid collection) or has exactly one defect,
 * in the id, the paint or the collection; a `clearLayer` has one of the ten ids or a bad one. The
 * layer limit depends on the state and is modelled by the property.
 */
export function appLayerOp(): fc.Arbitrary<LayerOp> {
  const id = fc.constantFrom(...LAYER_IDS);
  return fc.oneof(
    {
      weight: 6,
      arbitrary: fc.tuple(id, appCollection(), appPaint()).map(([i, collection, paint]) => ({
        kind: 'setLayer' as const,
        id: i,
        collection,
        paint,
        verdict: { ok: true } as Verdict,
      })),
    },
    {
      weight: 1,
      arbitrary: fc.tuple(badId(), appCollection(), appPaint()).map(([i, collection, paint]) => ({
        kind: 'setLayer' as const,
        id: i.value,
        collection,
        paint,
        verdict: { ok: false, field: i.field } as Verdict,
      })),
    },
    {
      weight: 1,
      arbitrary: fc.tuple(id, appCollection(), badPaint()).map(([i, collection, paint]) => ({
        kind: 'setLayer' as const,
        id: i,
        collection,
        paint: paint.value,
        verdict: { ok: false, field: paint.field } as Verdict,
      })),
    },
    {
      weight: 2,
      arbitrary: fc.tuple(id, badCollection(), appPaint()).map(([i, collection, paint]) => ({
        kind: 'setLayer' as const,
        id: i,
        collection: collection.value,
        paint,
        verdict: { ok: false, field: collection.field } as Verdict,
      })),
    },
    {
      weight: 3,
      arbitrary: id.map((i) => ({
        kind: 'clearLayer' as const,
        id: i,
        verdict: { ok: true } as Verdict,
      })),
    },
    {
      weight: 1,
      arbitrary: badId().map((i) => ({
        kind: 'clearLayer' as const,
        id: i.value,
        verdict: { ok: false, field: i.field } as Verdict,
      })),
    },
  );
}
