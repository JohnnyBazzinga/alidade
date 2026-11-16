// Spherical Earth primitives (Req 2). The Earth is a sphere of radius 6 371 008.8 m; the
// ellipsoid is ignored on purpose (math-conventions). Latitude is north positive, longitude
// east positive, azimuth clockwise from true north.
//
// Every function returns a Result: `unsupported_position` for an input that is not a Supported
// position (Req 2.10), `invalid_number` for a non-finite or out-of-domain number, and
// `coincident_positions` where a direction between two positions is requested for positions
// under 1e-3 m apart (Req 2.9).

import { _wrapPi, _wrapTwoPi } from './angle';
import { err, ok, type Result } from './result';
import { _asinChecked } from './trig';

export const EARTH_RADIUS_M = 6_371_008.8;
/** The Supported-position latitude limit: 89°, in radians. */
export const MAX_SUPPORTED_LAT_RAD = (89 * Math.PI) / 180;
/** Positions closer than this are coincident: no initial azimuth is returned (Req 2.9). */
export const COINCIDENT_DISTANCE_M = 1e-3;

export interface Position {
  readonly latRad: number;
  readonly lonRad: number;
}

/**
 * A Supported position has finite coordinates, a latitude within 89° of the equator and a
 * longitude in (-π, π]. Positions within 1° of a pole are unsupported.
 */
export function isSupportedPosition(position: Position): boolean {
  return (
    Number.isFinite(position.latRad) &&
    Number.isFinite(position.lonRad) &&
    Math.abs(position.latRad) <= MAX_SUPPORTED_LAT_RAD &&
    position.lonRad > -Math.PI &&
    position.lonRad <= Math.PI
  );
}

/**
 * Great-circle distance. The caller guarantees both positions are Supported.
 *
 * The central angle is `atan2(|cross|, dot)` of the two position vectors, written in latitude
 * and longitude. Unlike `2·asin(√haversine)`, which loses about √ε of accuracy (about 0.1 m)
 * as the positions approach the antipode, this form is well-conditioned at every distance.
 */
export function _distanceM(a: Position, b: Position): number {
  const deltaLonRad = b.lonRad - a.lonRad;
  const cosDeltaLon = Math.cos(deltaLonRad);
  const eastComponent = Math.cos(b.latRad) * Math.sin(deltaLonRad);
  const northComponent =
    Math.cos(a.latRad) * Math.sin(b.latRad) - Math.sin(a.latRad) * Math.cos(b.latRad) * cosDeltaLon;
  const alongComponent =
    Math.sin(a.latRad) * Math.sin(b.latRad) + Math.cos(a.latRad) * Math.cos(b.latRad) * cosDeltaLon;
  const centralAngleRad = Math.atan2(Math.hypot(eastComponent, northComponent), alongComponent);
  return EARTH_RADIUS_M * centralAngleRad;
}

/** Great-circle distance in metres between two Supported positions (Req 2.1). */
export function greatCircleDistanceM(a: Position, b: Position): Result<number> {
  if (!isSupportedPosition(a) || !isSupportedPosition(b)) return err('unsupported_position');
  return ok(_distanceM(a, b));
}

/**
 * Initial azimuth from `a` to `b`, clockwise from true north, in [0, 2π) (Req 2.2). Fails with
 * `coincident_positions` if the positions are less than 1e-3 m apart (Req 2.9). For antipodal
 * positions every direction is a shortest path; the value returned is then one of them.
 */
export function initialAzimuthRad(a: Position, b: Position): Result<number> {
  if (!isSupportedPosition(a) || !isSupportedPosition(b)) return err('unsupported_position');
  if (_distanceM(a, b) < COINCIDENT_DISTANCE_M) return err('coincident_positions');
  return ok(_initialAzimuthRad(a, b));
}

/**
 * Initial azimuth without the coincidence check, for code inside this package that handles
 * close positions itself (the Local plane projection). The caller guarantees both positions are
 * Supported. For identical positions the direction is undefined and 0 is returned.
 */
export function _initialAzimuthRad(a: Position, b: Position): number {
  const deltaLonRad = b.lonRad - a.lonRad;
  const eastComponent = Math.sin(deltaLonRad) * Math.cos(b.latRad);
  const northComponent =
    Math.cos(a.latRad) * Math.sin(b.latRad) -
    Math.sin(a.latRad) * Math.cos(b.latRad) * Math.cos(deltaLonRad);
  return _wrapTwoPi(Math.atan2(eastComponent, northComponent));
}

/**
 * The position reached from `a` along the initial azimuth `azimuthRad` for `distanceM` metres
 * (Req 2.3). The azimuth may be any finite angle; the distance must be finite and not negative.
 *
 * The destination is not required to be a Supported position: a destination within 1° of a pole
 * is returned as it is, and callers that need a Supported position check it. The longitude is
 * normalised to (-π, π], so a destination across the ±180° meridian is in range (Req 2.8).
 */
export function destinationPosition(
  a: Position,
  azimuthRad: number,
  distanceM: number,
): Result<Position> {
  if (!isSupportedPosition(a)) return err('unsupported_position');
  if (!Number.isFinite(azimuthRad) || !Number.isFinite(distanceM) || distanceM < 0) {
    return err('invalid_number');
  }

  const angularDistanceRad = distanceM / EARTH_RADIUS_M;
  const sinLat = Math.sin(a.latRad);
  const cosLat = Math.cos(a.latRad);
  const cosDistance = Math.cos(angularDistanceRad);
  const sinDistance = Math.sin(angularDistanceRad);

  const latRad = _asinChecked(sinLat * cosDistance + cosLat * sinDistance * Math.cos(azimuthRad));
  if (!latRad.ok) return latRad;
  const deltaLonRad = Math.atan2(
    Math.sin(azimuthRad) * sinDistance * cosLat,
    cosDistance - sinLat * Math.sin(latRad.value),
  );
  // Wrapping to (-π, π] is the longitude normalisation: `_wrapPi` keeps +π and never returns -π.
  return ok({ latRad: latRad.value, lonRad: _wrapPi(a.lonRad + deltaLonRad) });
}
