// Local plane projection (Req 3): East-North metres on the azimuthal equidistant plane tangent
// to the sphere at a stated origin. A position at great-circle distance `d` and initial azimuth
// `θ` from the origin maps to (east, north) = (d·sin θ, d·cos θ).

import { err, ok, type Result } from './result';
import {
  _distanceM,
  _initialAzimuthRad,
  destinationPosition,
  isSupportedPosition,
  type Position,
} from './position';

/**
 * Below this distance a position projects to (0, 0) and a plane vector converts back to the
 * origin (Req 3.4). It is far below the 1e-3 m of `COINCIDENT_DISTANCE_M` (Req 2.9), which only
 * governs the public `initialAzimuthRad`: between 1e-9 m and 1e-3 m the projection uses the
 * unchecked azimuth and does not fail.
 */
export const LOCAL_PLANE_COLLAPSE_M = 1e-9;

/** A point on a Local plane, in metres east and north of the plane's origin. */
export interface LocalPoint {
  readonly eastM: number;
  readonly northM: number;
}

/**
 * Projects a Supported position onto the Local plane of `origin` (Req 3.1). The origin, and any
 * position less than 1e-9 m from it, projects to (0, 0) (Req 3.4).
 */
export function projectToLocalPlane(origin: Position, position: Position): Result<LocalPoint> {
  if (!isSupportedPosition(origin) || !isSupportedPosition(position)) {
    return err('unsupported_position');
  }
  const distanceM = _distanceM(origin, position);
  if (distanceM < LOCAL_PLANE_COLLAPSE_M) return ok({ eastM: 0, northM: 0 });

  const azimuthRad = _initialAzimuthRad(origin, position);
  return ok({
    eastM: distanceM * Math.sin(azimuthRad),
    northM: distanceM * Math.cos(azimuthRad),
  });
}

/**
 * Converts a point on the Local plane of `origin` back to a Position (Req 3.2). A vector shorter
 * than 1e-9 m returns the origin itself (Req 3.4). The result must be a Supported position; a
 * point that lies within 1° of a pole fails with `unsupported_position`.
 */
export function unprojectToLocalPlane(origin: Position, point: LocalPoint): Result<Position> {
  if (!isSupportedPosition(origin)) return err('unsupported_position');
  if (!Number.isFinite(point.eastM) || !Number.isFinite(point.northM)) return err('invalid_number');

  const distanceM = Math.hypot(point.eastM, point.northM);
  if (!Number.isFinite(distanceM)) return err('invalid_number');
  if (distanceM < LOCAL_PLANE_COLLAPSE_M) return ok(origin);

  const destination = destinationPosition(origin, Math.atan2(point.eastM, point.northM), distanceM);
  if (!destination.ok) return destination;
  if (!isSupportedPosition(destination.value)) return err('unsupported_position');
  return destination;
}
