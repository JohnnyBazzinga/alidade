// GeoJSON types and builders (Req 14.1, 14.7, design D12): our own 25 lines rather than
// `@types/geojson`. This is the only module where the order `[lonDeg, latDeg]` appears; positions
// are converted with Core's `radToDeg` (the GeoJSON boundary of Req 1.10).

import { radToDeg, type Position } from '@alidade/core';

/** `[lonDeg, latDeg]`, the GeoJSON order. */
export type LonLat = readonly [number, number];

export interface PointGeometry {
  readonly type: 'Point';
  readonly coordinates: LonLat;
}
export interface LineStringGeometry {
  readonly type: 'LineString';
  readonly coordinates: readonly LonLat[];
}
export interface PolygonGeometry {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly LonLat[])[];
}
export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry;

/** What a feature draws. Every feature carries `kind` and the `id` of what it draws (Req 14.7). */
export type FeatureKind = 'observer' | 'bearing-line' | 'bearing-wedge' | 'fix' | 'fix-ellipse-95';

export interface Feature {
  readonly type: 'Feature';
  readonly id: string;
  readonly geometry: Geometry;
  readonly properties: { readonly kind: FeatureKind; readonly id: string };
}

export interface FeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly Feature[];
}

/**
 * `[lonDeg, latDeg]` of a Position, or `null` if a number is not finite. `+ 0` turns `-0` into
 * `0`, so that a collection survives `JSON.stringify` and `JSON.parse` unchanged (Req 14.7).
 */
export function lonLat(position: Position): LonLat | null {
  const lon = radToDeg(position.lonRad);
  const lat = radToDeg(position.latRad);
  if (!lon.ok || !lat.ok) return null;
  return [lon.value + 0, lat.value + 0];
}

export function feature(kind: FeatureKind, id: string, geometry: Geometry): Feature {
  return { type: 'Feature', id: `${kind}:${id}`, geometry, properties: { kind, id } };
}

export function collection(features: readonly Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** The empty collection. */
export const EMPTY_COLLECTION: FeatureCollection = Object.freeze({
  type: 'FeatureCollection',
  features: Object.freeze([]) as readonly Feature[],
});
