// The wind response as untrusted data (design §7.16, Req 13.2, 13.6): Open-Meteo's `current` block
// with the time in Unix seconds (`timeformat=unixtime`), the speed in m/s (`wind_speed_unit=ms`)
// and the direction the wind blows FROM, in degrees clockwise from true north. Every needed field
// is checked and a missing or wrong one is refused naming it: nothing is defaulted. The response
// text is only ever read as numbers; no text of it is shown.
//
// Degrees appear in the names because the response is an I/O boundary (Req 1.7); the conversion is
// the one of `degrees.ts`. The details this relies on (the time format, the unit text) are Device
// check V9's to confirm against a real response.

import { isSupportedPosition, wrapTwoPi, type Position } from '@alidade/core';
import { fromDeg } from '../../../math/degrees';
import { windPoint } from '../../../math/network/request-boxes';
import { checkParameters, type VigiaParameters } from '../../../math/parameters';
import { err, ok, type VigiaResult } from '../../../result';

/** What the response says: the wind at the rounded request point, for one time. */
export interface WindReading {
  /** The rounded request point, not the Fix. */
  readonly point: Position;
  /** The true azimuth the wind blows FROM, in `[0, 2π)`. */
  readonly directionFromRad: number;
  readonly speedMs: number;
  readonly validUtcMs: number;
}

const unavailable = (field: string) => err('overlay_unavailable', { field });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * The reading in `text`, taken at `point` (the rounded request point as a Position). Fails with
 * `invalid_number` naming a parameter, `unsupported_position` for a point that is not Supported,
 * and `overlay_unavailable` naming the field for anything the response must hold and does not:
 * `json` (not an object), `current`, `current.time` (a whole number of seconds, not negative),
 * `current.wind_speed_10m` (finite, not negative), `current.wind_direction_10m` (finite, in
 * `[0, 360)`), `current_units`, `current_units.wind_speed_10m` (exactly `m/s`).
 */
export function parseWindResponse(
  text: string,
  point: Position,
  parameters: VigiaParameters,
): VigiaResult<WindReading> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!isSupportedPosition(point)) return err('unsupported_position');

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return unavailable('json');
  }
  if (!isRecord(root)) return unavailable('json');

  const current = root['current'];
  if (!isRecord(current)) return unavailable('current');
  const timeS = current['time'];
  if (
    typeof timeS !== 'number' ||
    !Number.isInteger(timeS) ||
    !Number.isSafeInteger(timeS * 1000) ||
    timeS < 0
  ) {
    return unavailable('current.time');
  }
  const speedMs = current['wind_speed_10m'];
  if (typeof speedMs !== 'number' || !Number.isFinite(speedMs) || speedMs < 0) {
    return unavailable('current.wind_speed_10m');
  }
  const directionDeg = current['wind_direction_10m'];
  if (
    typeof directionDeg !== 'number' ||
    !Number.isFinite(directionDeg) ||
    directionDeg < 0 ||
    directionDeg >= 360
  ) {
    return unavailable('current.wind_direction_10m');
  }
  const units = root['current_units'];
  if (!isRecord(units)) return unavailable('current_units');
  if (units['wind_speed_10m'] !== 'm/s') return unavailable('current_units.wind_speed_10m');

  const radians = fromDeg(directionDeg);
  if (!radians.ok) return unavailable('current.wind_direction_10m');
  // 359.99999999999994 degrees converts to a whole turn: it is north.
  const directionFromRad = wrapTwoPi(radians.value);
  if (!directionFromRad.ok) return unavailable('current.wind_direction_10m');

  return ok({
    point,
    directionFromRad: directionFromRad.value,
    speedMs: speedMs + 0, // -0 is a speed of 0
    validUtcMs: timeS * 1000,
  });
}

/**
 * The point of the wind request for `position` (rounded to the wind grid, Req 13.2) as a Position,
 * the point the reading is for. A longitude that rounds to -180 is the same place as 180 and is
 * given as 180, because -π is not a Supported longitude. Fails as `windPoint` does, and with
 * `unsupported_position` if the rounded point is not Supported.
 */
export function windPointPosition(
  position: Position,
  parameters: VigiaParameters,
): VigiaResult<Position> {
  const point = windPoint(position, parameters);
  if (!point.ok) return point;
  const lat = fromDeg(point.value.latDeg);
  const lon = fromDeg(point.value.lonDeg === -180 ? 180 : point.value.lonDeg);
  if (!lat.ok) return lat;
  if (!lon.ok) return lon;
  const rounded = { latRad: lat.value, lonRad: lon.value };
  return isSupportedPosition(rounded) ? ok(rounded) : err('unsupported_position');
}
