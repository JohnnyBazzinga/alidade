// The builder of an application's features from Positions (Req 15.14, design D31.12): the one
// place, with `geojson.ts`, where the map's `[lonDeg, latDeg]` order is written, so that an
// application never writes it (math-conventions).

import { isSupportedPosition, type Position } from '@alidade/core';
import { err, ok, type UiResult } from '../../result';
import type { Geometry, LonLat } from './geojson';
import { lonLat } from './geojson';
import type { AppFeature } from './app-layer';

/** What to draw, as Positions. A polygon's ring is given open or closed. */
export type AppShape =
  | { readonly type: 'point'; readonly position: Position }
  | { readonly type: 'line'; readonly positions: readonly Position[] }
  | { readonly type: 'polygon'; readonly positions: readonly Position[] };

function coordinates(list: readonly Position[]): LonLat[] | 'unsupported' {
  const out: LonLat[] = [];
  for (const p of list) {
    const c = isSupportedPosition(p) ? lonLat(p) : null;
    if (c === null) return 'unsupported';
    out.push(c);
  }
  return out;
}

function nonEmpty(x: unknown): x is string {
  return typeof x === 'string' && x !== '';
}

/**
 * A feature with its `kind` and `id` (non-empty strings) for `shape`. Fails with `invalid_number`
 * naming `kind`, `id`, `shape`, or `positions` (a line of fewer than 2 Positions, a polygon of
 * fewer than 3: checked before the Positions are), and with `unsupported_position` for a Position
 * that is not Supported. A polygon's ring is closed by repeating its first vertex, unless the
 * last already is it. `-0` is written as `0`. The `kind` is not checked against the skeleton's:
 * `setLayer` refuses those.
 */
export function appFeature(kind: string, id: string, shape: AppShape): UiResult<AppFeature> {
  if (!nonEmpty(kind)) return err('invalid_number', { field: 'kind' });
  if (!nonEmpty(id)) return err('invalid_number', { field: 'id' });
  const type: unknown = (shape as { type?: unknown } | null)?.type;
  let geometry: Geometry;
  if (type === 'point') {
    const c = coordinates([(shape as { position: Position }).position]);
    const first = c === 'unsupported' ? undefined : c[0];
    if (first === undefined) return err('unsupported_position', { id });
    geometry = { type: 'Point', coordinates: first };
  } else if (type === 'line' || type === 'polygon') {
    const list = (shape as { positions: readonly Position[] }).positions;
    if (!Array.isArray(list) || list.length < (type === 'line' ? 2 : 3))
      return err('invalid_number', { field: 'positions' });
    const c = coordinates(list);
    if (c === 'unsupported') return err('unsupported_position', { id });
    if (type === 'line') {
      geometry = { type: 'LineString', coordinates: c };
    } else {
      const first = c[0];
      const last = c[c.length - 1];
      const closed =
        first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
      geometry = {
        type: 'Polygon',
        coordinates: [first === undefined || closed ? c : [...c, first]],
      };
    }
  } else {
    return err('invalid_number', { field: 'shape' });
  }
  return ok({ type: 'Feature', id: `${kind}:${id}`, geometry, properties: { kind, id } });
}
