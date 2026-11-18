// What an application may draw on the map besides the skeleton's own layers (Req 15.14, 15.15,
// design D31): the types, the checks and the style of one layer. Every check takes `unknown`, so
// that a hostile argument is a failure and not a `TypeError` (Req 2.1), and a check that accepts a
// collection returns a copy, so that the caller changing its object later changes nothing.

import { degToRad, isSupportedPosition } from '@alidade/core';
import { MAX_LAYER_FEATURES } from '../../defaults';
import { err, ok, type UiResult } from '../../result';
import type { Geometry, LonLat } from './geojson';
import { GEOJSON_SOURCE_IDS, type MapLayer } from './map-style';

/** A feature of an application: any `kind` that is not one of the skeleton's five (Req 15.15). */
export interface AppFeature {
  readonly type: 'Feature';
  readonly id: string;
  readonly geometry: Geometry;
  readonly properties: { readonly kind: string; readonly id: string };
}

export interface AppFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly AppFeature[];
}

/**
 * How a layer is painted, a closed form (Req 15.14): `colour` is `#RRGGBB`; `widthPx` and
 * `radiusPx` are in `(0, 16]` CSS pixels; `opacity` in `(0, 1]` (default 1); `dash` is 0 to 4
 * positive lengths in line widths (none or empty: solid). A `fill` draws polygons, a `line` draws
 * lines and polygon outlines, a `circle` draws points.
 */
export type LayerPaint =
  | { readonly kind: 'fill'; readonly colour: string; readonly opacity?: number }
  | {
      readonly kind: 'line';
      readonly colour: string;
      readonly widthPx: number;
      readonly opacity?: number;
      readonly dash?: readonly number[];
    }
  | {
      readonly kind: 'circle';
      readonly colour: string;
      readonly radiusPx: number;
      readonly opacity?: number;
    };

/** One application layer, as `MapView` takes it. */
export interface AppLayer {
  readonly id: string;
  readonly collection: AppFeatureCollection;
  readonly paint: LayerPaint;
  /** Whether `MapView` fits the map to this layer as well (default: no). */
  readonly fit?: boolean;
}

/** The five kinds of feature the skeleton draws itself (`geojson.ts`): never in an application layer. */
const SKELETON_KINDS: readonly string[] = [
  'observer',
  'bearing-line',
  'bearing-wedge',
  'fix',
  'fix-ellipse-95',
];

const ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const COLOUR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const MAX_SIZE_PX = 16;
const MAX_DASHES = 4;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** The name of the layer and of its source on the map: the id with a prefix no skeleton id has. */
export function appLayerKey(id: string): string {
  return `app-${id}`;
}

/** `id` of 1 to 32 characters, a lower-case letter then lower-case letters, digits or hyphens, and not a skeleton source id. */
export function checkLayerId(id: unknown): UiResult<string> {
  if (
    typeof id !== 'string' ||
    !ID_PATTERN.test(id) ||
    (GEOJSON_SOURCE_IDS as readonly string[]).includes(id)
  )
    return err('invalid_number', { field: 'id' });
  return ok(id);
}

function inRange(x: unknown, low: number, high: number): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x > low && x <= high;
}

const ALLOWED_FIELDS = {
  fill: ['kind', 'colour', 'opacity'],
  line: ['kind', 'colour', 'widthPx', 'opacity', 'dash'],
  circle: ['kind', 'colour', 'radiusPx', 'opacity'],
} as const;

/**
 * Validates a paint and returns a copy. Refuses, naming `paint` or `paint.<field>`, in this order:
 * not an object; a `kind` that is not `fill`, `line` or `circle`; a field the kind does not have
 * (the form is closed on both sides); a `colour` that is not `#RRGGBB`; a missing or out-of-range
 * `widthPx` (line) or `radiusPx` (circle); an `opacity` outside `(0, 1]`; a `dash` that is not 0 to
 * 4 finite positive numbers.
 */
export function checkLayerPaint(paint: unknown): UiResult<LayerPaint> {
  if (!isRecord(paint)) return err('invalid_number', { field: 'paint' });
  const kind = paint['kind'];
  if (kind !== 'fill' && kind !== 'line' && kind !== 'circle')
    return err('invalid_number', { field: 'paint.kind' });
  const allowed: readonly string[] = ALLOWED_FIELDS[kind];
  for (const key of Object.keys(paint)) {
    if (!allowed.includes(key) && paint[key] !== undefined)
      return err('invalid_number', { field: `paint.${key}` });
  }
  const colour = paint['colour'];
  if (typeof colour !== 'string' || !COLOUR_PATTERN.test(colour))
    return err('invalid_number', { field: 'paint.colour' });
  const opacity = paint['opacity'];
  if (kind === 'line') {
    if (!inRange(paint['widthPx'], 0, MAX_SIZE_PX))
      return err('invalid_number', { field: 'paint.widthPx' });
  } else if (kind === 'circle') {
    if (!inRange(paint['radiusPx'], 0, MAX_SIZE_PX))
      return err('invalid_number', { field: 'paint.radiusPx' });
  }
  if (opacity !== undefined && !inRange(opacity, 0, 1))
    return err('invalid_number', { field: 'paint.opacity' });
  const dash = paint['dash'];
  if (dash !== undefined) {
    if (
      !Array.isArray(dash) ||
      dash.length > MAX_DASHES ||
      !dash.every((d) => typeof d === 'number' && Number.isFinite(d) && d > 0)
    )
      return err('invalid_number', { field: 'paint.dash' });
  }
  const common = { colour, ...(opacity === undefined ? {} : { opacity: opacity as number }) };
  if (kind === 'fill') return ok({ kind, ...common });
  if (kind === 'circle') return ok({ kind, ...common, radiusPx: paint['radiusPx'] as number });
  return ok({
    kind,
    ...common,
    widthPx: paint['widthPx'] as number,
    ...(dash === undefined ? {} : { dash: [...(dash as number[])] }),
  });
}

/** `[lonDeg, latDeg]`, two finite numbers that are a Supported position (a pole is not), or `null`. */
function copyPosition(c: unknown): LonLat | null {
  if (!Array.isArray(c) || c.length !== 2) return null;
  const lon: unknown = c[0];
  const lat: unknown = c[1];
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  const lonRad = degToRad(lon);
  const latRad = degToRad(lat);
  if (!lonRad.ok || !latRad.ok) return null;
  return isSupportedPosition({ latRad: latRad.value, lonRad: lonRad.value }) ? [lon, lat] : null;
}

function copyPositions(list: unknown): LonLat[] | null {
  if (!Array.isArray(list)) return null;
  const out: LonLat[] = [];
  for (const item of list) {
    const p = copyPosition(item);
    if (p === null) return null;
    out.push(p);
  }
  return out;
}

/** A copy of a geometry, or `{ field }` for where it is wrong (the type or the coordinates). */
function copyGeometry(geometry: unknown): Geometry | 'geometry' | 'coordinates' {
  if (!isRecord(geometry)) return 'geometry';
  const type = geometry['type'];
  const coordinates = geometry['coordinates'];
  if (type === 'Point') {
    const p = copyPosition(coordinates);
    return p === null ? 'coordinates' : { type, coordinates: p };
  }
  if (type === 'LineString') {
    const line = copyPositions(coordinates);
    return line === null ? 'coordinates' : { type, coordinates: line };
  }
  if (type === 'Polygon') {
    if (!Array.isArray(coordinates)) return 'coordinates';
    const rings: LonLat[][] = [];
    for (const ring of coordinates) {
      const r = copyPositions(ring);
      if (r === null) return 'coordinates';
      rings.push(r);
    }
    return { type, coordinates: rings };
  }
  return 'geometry';
}

/**
 * Validates a collection and returns a copy (Req 14.7, 15.14, 15.15). Refuses with `invalid_number`
 * naming, in this order: `collection` (not a `FeatureCollection` with a `features` array);
 * `features` (more than `MAX_LAYER_FEATURES`); then for each feature in turn, the first of
 * `features[i]` (not a `Feature` object), `features[i].id` and `features[i].properties` (and its
 * `.kind` and `.id`, which are non-empty strings), `features[i].properties.kind` (one of the
 * skeleton's five kinds), `features[i].geometry` (not a Point, LineString or Polygon) and
 * `features[i].geometry.coordinates` (not of the right nesting, a number that is not finite, a
 * coordinate with other than two numbers, or a position that is not Supported). `properties` keeps
 * `kind` and `id` only. There is no bound on the vertices of one feature.
 */
export function checkLayerCollection(collection: unknown): UiResult<AppFeatureCollection> {
  if (
    !isRecord(collection) ||
    collection['type'] !== 'FeatureCollection' ||
    !Array.isArray(collection['features'])
  )
    return err('invalid_number', { field: 'collection' });
  const features: unknown[] = collection['features'];
  if (features.length > MAX_LAYER_FEATURES) return err('invalid_number', { field: 'features' });
  const out: AppFeature[] = [];
  for (const [i, f] of features.entries()) {
    const at = `features[${i}]`;
    if (!isRecord(f) || f['type'] !== 'Feature') return err('invalid_number', { field: at });
    const id = f['id'];
    if (typeof id !== 'string' || id === '') return err('invalid_number', { field: `${at}.id` });
    const properties = f['properties'];
    if (!isRecord(properties)) return err('invalid_number', { field: `${at}.properties` });
    const kind = properties['kind'];
    if (typeof kind !== 'string' || kind === '')
      return err('invalid_number', { field: `${at}.properties.kind` });
    const propertyId = properties['id'];
    if (typeof propertyId !== 'string' || propertyId === '')
      return err('invalid_number', { field: `${at}.properties.id` });
    if (SKELETON_KINDS.includes(kind))
      return err('invalid_number', { field: `${at}.properties.kind` });
    const geometry = copyGeometry(f['geometry']);
    if (geometry === 'geometry') return err('invalid_number', { field: `${at}.geometry` });
    if (geometry === 'coordinates')
      return err('invalid_number', { field: `${at}.geometry.coordinates` });
    out.push({ type: 'Feature', id, geometry, properties: { kind, id: propertyId } });
  }
  return ok({ type: 'FeatureCollection', features: out });
}

/** The layer of the style that draws `paint` for the layer `id`: plain JSON, no text, no sprite. */
export function appLayerSpec(id: string, paint: LayerPaint): MapLayer {
  const key = appLayerKey(id);
  const opacity = paint.opacity ?? 1;
  if (paint.kind === 'fill') {
    return {
      id: key,
      type: 'fill',
      source: key,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': paint.colour, 'fill-opacity': opacity },
    };
  }
  if (paint.kind === 'circle') {
    return {
      id: key,
      type: 'circle',
      source: key,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': paint.colour,
        'circle-radius': paint.radiusPx,
        'circle-opacity': opacity,
      },
    };
  }
  return {
    id: key,
    type: 'line',
    source: key,
    filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
    paint: {
      'line-color': paint.colour,
      'line-width': paint.widthPx,
      'line-opacity': opacity,
      ...(paint.dash === undefined || paint.dash.length === 0
        ? {}
        : { 'line-dasharray': [...paint.dash] }),
    },
  };
}
