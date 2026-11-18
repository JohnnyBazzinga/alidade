// The box that holds every coordinate of some feature collections (Req 14.6).

import { err, ok, type UiResult } from '../../result';
import type { Geometry, LonLat } from './geojson';

/** Anything with features that have a geometry: the skeleton's collections and an application's. */
export interface HasGeometries {
  readonly features: readonly { readonly geometry: Geometry }[];
}

export interface MapBounds {
  readonly westDeg: number;
  readonly southDeg: number;
  readonly eastDeg: number;
  readonly northDeg: number;
}

function coordinatesOf(geometry: Geometry): readonly LonLat[] {
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'LineString') return geometry.coordinates;
  return geometry.coordinates.flat();
}

/**
 * The smallest west, south, east, north box (degrees) that holds every coordinate; `invalid_number`
 * when there is none or one is not finite; `crosses_antimeridian` when the longitudes span more
 * than 180° (a set across ±180°, or simply too wide: the message says the area is too wide).
 */
export function mapBounds(collections: readonly HasGeometries[]): UiResult<MapBounds> {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const c of collections) {
    for (const f of c.features) {
      for (const [lon, lat] of coordinatesOf(f.geometry)) {
        if (!Number.isFinite(lon) || !Number.isFinite(lat))
          return err('invalid_number', { field: 'coordinates' });
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
        count += 1;
      }
    }
  }
  if (count === 0) return err('invalid_number', { field: 'coordinates' });
  if (east - west > 180) return err('crosses_antimeridian');
  return ok({ westDeg: west, southDeg: south, eastDeg: east, northDeg: north });
}
