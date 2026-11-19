// The wind request: one point, rounded to the wind grid (Req 13.2, 12.3, design §7.15). The
// request carries the point and nothing else: no identifier, no time, no azimuth, no accuracy. The
// hotspot box of the second release is not here.
//
// Degrees appear in the names because the point is written into an outgoing request (an I/O
// boundary, Req 1.7); the conversion is the one of `degrees.ts`.

import { isSupportedPosition, type Position } from '@alidade/core';
import { err, ok, type VigiaResult } from '../../result';
import { toDeg } from '../degrees';
import { checkParameters, type VigiaParameters } from '../parameters';
import { WIND_ENTRY } from './host-list';

/** The point of a wind request: a multiple of the grid, in degrees. */
export interface WindPoint {
  readonly latDeg: number;
  readonly lonDeg: number;
}

/** A grid multiple without the binary noise of `k * g` (and never `-0`). */
function gridValue(valueDeg: number, gridDeg: number): number {
  return Number((Math.round(valueDeg / gridDeg) * gridDeg).toPrecision(12)) + 0;
}

/**
 * The point of the wind request for `position`: each coordinate rounded to the nearest multiple of
 * `windGridDeg`, so within half a grid step of the position on each axis. `unsupported_position`
 * when the position is not Supported; `invalid_number` naming a bad parameter.
 */
export function windPoint(position: Position, parameters: VigiaParameters): VigiaResult<WindPoint> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!isSupportedPosition(position)) return err('unsupported_position');
  const latDeg = toDeg(position.latRad);
  const lonDeg = toDeg(position.lonRad);
  if (!latDeg.ok) return latDeg;
  if (!lonDeg.ok) return lonDeg;
  const point = {
    latDeg: gridValue(latDeg.value, parameters.windGridDeg),
    lonDeg: gridValue(lonDeg.value, parameters.windGridDeg),
  };
  // A grid so fine that the position divided by it overflows (5e-324 is positive and so passes
  // `checkParameters`) cannot give a point: the grid is the parameter at fault.
  if (!Number.isFinite(point.latDeg) || !Number.isFinite(point.lonDeg)) {
    return err('invalid_number', { field: 'windGridDeg' });
  }
  return ok(point);
}

/**
 * The wind request URL for `position`, built from the wind entry of the Host list (the host and the
 * path are never written here). Each coordinate is written with one decimal, as the entry states,
 * so the grid must be a multiple of 0.1°: any other grid is `invalid_number` naming
 * `windGridDeg`.
 */
export function windRequestUrl(
  position: Position,
  parameters: VigiaParameters,
): VigiaResult<string> {
  const point = windPoint(position, parameters);
  if (!point.ok) return point;
  const tenths = parameters.windGridDeg * 10;
  if (Math.abs(tenths - Math.round(tenths)) > 1e-9) {
    return err('invalid_number', { field: 'windGridDeg' });
  }
  const path = WIND_ENTRY.path.map((kind) => (kind.kind === 'literal' ? kind.value : ''));
  const query = WIND_ENTRY.query.map(({ name, value }) => {
    if (value.kind === 'literal') return `${name}=${value.value}`;
    const text = name === 'latitude' ? point.value.latDeg : point.value.lonDeg;
    return `${name}=${text.toFixed(1)}`;
  });
  return ok(`https://${WIND_ENTRY.host}/${path.join('/')}?${query.join('&')}`);
}
