// A Bearing on the map (Req 14.3, design §7.10): the line from the observer, and the Wedge of
// azimuth ± 1-sigma out to the line's length.

import { destinationPosition, validateBearing, type Bearing } from '@alidade/core';
import { err, ok, type UiResult } from '../../result';
import { collection, feature, lonLat, type FeatureCollection, type LonLat } from './geojson';

/** The longest line drawn: 500 km (Req 14.3). */
export const MAX_LINE_LENGTH_M = 500_000;

function point(bearing: Bearing, azimuthRad: number, lengthM: number): LonLat | null {
  const destination = destinationPosition(bearing.observer, azimuthRad, lengthM);
  return destination.ok ? lonLat(destination.value) : null;
}

/**
 * The LineString from the observer to the Position at `lineLengthM` along the azimuth, and the
 * Wedge: a ring that starts and ends at the observer, with arc vertices at `lineLengthM` spaced
 * by at most `arcStepRad` and both edges included, built counter-clockwise (RFC 7946):
 * `observer, v_n, …, v_0, observer` with `v_0` at `azimuth − σ`.
 */
export function bearingFeatures(
  bearing: Bearing,
  lineLengthM: number,
  arcStepRad: number,
): UiResult<FeatureCollection> {
  if (!Number.isFinite(lineLengthM) || !(lineLengthM > 0) || lineLengthM > MAX_LINE_LENGTH_M) {
    return err('invalid_number', { field: 'lineLengthM' });
  }
  if (!Number.isFinite(arcStepRad) || !(arcStepRad > 0)) {
    return err('invalid_number', { field: 'arcStepRad' });
  }
  const valid = validateBearing(bearing);
  if (!valid.ok) return valid;
  const start = lonLat(bearing.observer);
  const end = point(bearing, bearing.azimuthRad, lineLengthM);
  if (start === null || end === null) return err('invalid_number', { id: bearing.id });
  const sigma = bearing.azimuthSigmaRad;
  const segments = Math.max(1, Math.ceil((2 * sigma) / arcStepRad));
  if (!Number.isFinite(segments) || segments > 100_000) {
    return err('invalid_number', { field: 'arcStepRad' });
  }
  const arc: LonLat[] = [];
  for (let i = segments; i >= 0; i -= 1) {
    const vertex = point(
      bearing,
      bearing.azimuthRad - sigma + (i * 2 * sigma) / segments,
      lineLengthM,
    );
    if (vertex === null) return err('invalid_number', { id: bearing.id });
    arc.push(vertex);
  }
  return ok(
    collection([
      feature('bearing-line', bearing.id, { type: 'LineString', coordinates: [start, end] }),
      feature('bearing-wedge', bearing.id, {
        type: 'Polygon',
        coordinates: [[start, ...arc, start]],
      }),
    ]),
  );
}
