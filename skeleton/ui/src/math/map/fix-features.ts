// A Fix on the map (Req 14.4, 14.5, design §7.10, D13): one Point and its 95 % ellipse, always
// together. `fixFeatures` is the only producer of a `FixFeatureCollection`, and the Map adapter's
// `setFix` its only consumer; there is no function that draws a Position as a Fix.

import { ellipse95, unprojectToLocalPlane, type Fix } from '@alidade/core';
import { err, ok, type UiResult } from '../../result';
import { feature, lonLat, type Feature, type LonLat } from './geojson';

declare const fixBrand: unique symbol;

/**
 * Exactly two features: the Point (`kind: 'fix'`) and the ellipse Polygon (`kind:
 * 'fix-ellipse-95'`). The brand is a compile-time device: no object literal is one.
 */
export interface FixFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly [Feature, Feature];
  readonly [fixBrand]: true;
}

/**
 * The 95 % ellipse of `fix.ellipse` (Core's `ellipse95`, never the 1-sigma one) as a closed ring
 * of `vertexCount` vertices at `θk = 2πk / N`, the major axis at the Ellipse's azimuth, unprojected
 * about the Fix's Position, counter-clockwise; and the Point. Any failure returns the failure and
 * no feature (Req 14.5): an invalid `vertexCount` (an integer of at least 16), an Ellipse that
 * `ellipse95` refuses or whose minor axis exceeds its major axis, or a vertex that cannot be
 * unprojected.
 */
export function fixFeatures(fix: Fix, vertexCount: number): UiResult<FixFeatureCollection> {
  if (!Number.isInteger(vertexCount) || vertexCount < 16 || vertexCount > 100_000) {
    return err('invalid_number', { field: 'vertexCount' });
  }
  const scaled = ellipse95(fix.ellipse);
  if (!scaled.ok) return scaled;
  const { semiMajorM: a, semiMinorM: b, azimuthRad } = scaled.value;
  if (!(b <= a)) return err('invalid_number', { field: 'semiMinorM' });
  const centre = lonLat(fix.position);
  if (centre === null) return err('invalid_number', { field: 'position' });
  const sinAz = Math.sin(azimuthRad);
  const cosAz = Math.cos(azimuthRad);
  const ring: LonLat[] = [];
  for (let k = 0; k < vertexCount; k += 1) {
    const theta = (2 * Math.PI * k) / vertexCount;
    const u = a * Math.cos(theta);
    const v = b * Math.sin(theta);
    // The minor axis is the major one turned +90° (counter-clockwise in East-North).
    const vertex = unprojectToLocalPlane(fix.position, {
      eastM: u * sinAz - v * cosAz,
      northM: u * cosAz + v * sinAz,
    });
    if (!vertex.ok) return vertex;
    const coordinates = lonLat(vertex.value);
    if (coordinates === null) return err('invalid_number', { field: 'ellipse' });
    ring.push(coordinates);
  }
  const first = ring[0];
  if (first === undefined) return err('invalid_number', { field: 'vertexCount' });
  ring.push(first);
  const features: readonly [Feature, Feature] = [
    feature('fix', 'fix', { type: 'Point', coordinates: centre }),
    feature('fix-ellipse-95', 'fix', { type: 'Polygon', coordinates: [ring] }),
  ];
  return ok({ type: 'FeatureCollection', features } as FixFeatureCollection);
}
