// The bearing Measurement model (Req 6): many observers at known positions, each sighting one
// unknown target. The predicted measurement is the initial azimuth from the observer to the
// candidate; the residual is the wrapped difference between the measured and predicted azimuth.
//
// Every method is total (design D17): for any type-correct input it returns a failure or finite
// numbers. The methods that take a set of observations return `insufficient_observations` for
// fewer than two, and every method validates the bearings it is given, so a method called
// directly never computes on a NaN.

import { _wrapPi } from './angle';
import {
  LOCAL_PLANE_COLLAPSE_M,
  projectToLocalPlane,
  unprojectToLocalPlane,
  type LocalPoint,
} from './local-plane';
import type { Evaluation, Fix, MeasurementModel } from './measurement-model';
import { validateBearing, type Bearing } from './observation';
import {
  EARTH_RADIUS_M,
  _distanceM,
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  isSupportedPosition,
  type Position,
} from './position';
import { err, ok, type Failure, type Result, type Warning } from './result';

/** Every pair of observers closer than this is colocated (Req 9.2). */
export const COLOCATED_OBSERVERS_M = 1;
/** A largest crossing angle below this is singular geometry: 0.5° (Req 9.3). */
export const MIN_CROSSING_ANGLE_RAD = 0.5 * (Math.PI / 180);
/** A largest crossing angle below this, and not singular, is poor geometry: 20° (Req 9.4). */
export const POOR_GEOMETRY_CROSSING_RAD = 20 * (Math.PI / 180);
/** A residual beyond this means the fix lies behind the observer: 90° (Req 9.5). */
export const DIVERGING_RESIDUAL_RAD = Math.PI / 2;
/** A fix farther than this from the Local plane origin is out of range: 500 km (Req 9.6). */
export const MAX_FIX_RANGE_M = 500_000;
/** The range used in the Effective sigma is never below this (Req 6.3). */
export const MIN_SIGMA_RANGE_M = 1;
/** How far along each bearing the second point of its plane direction is taken (design D18). */
export const LINE_DIRECTION_STEP_M = 100;
/** The mean of the observer unit vectors must be longer than this for a centroid to exist. */
const MIN_CENTROID_LENGTH = 1e-9;

/** Fewer than two observations, or any invalid one: the failure to return, else undefined. */
function observationSetFailure(observations: readonly Bearing[]): Failure | undefined {
  if (observations.length < 2) return err('insufficient_observations');
  for (const observation of observations) {
    const validation = validateBearing(observation);
    if (!validation.ok) return validation;
  }
  return undefined;
}

/**
 * The acute angle between two bearing lines: `min(|Δ|, π - |Δ|)` for the wrapped difference Δ of
 * the two azimuths (Req glossary).
 *
 * Both azimuths are validated to lie in [0, 2π), so |Δ| is `|a - b|` folded once about π. That is
 * the same value as `|wrapPi(a - b)|`, but it adds and subtracts no multiple of 2π, so a pair
 * exactly 20° apart (or 0.5°) gives exactly that angle and not a neighbouring float.
 */
function crossingAngleRad(first: Bearing, second: Bearing): number {
  const rawDifferenceRad = Math.abs(first.azimuthRad - second.azimuthRad);
  const differenceRad =
    rawDifferenceRad > Math.PI ? 2 * Math.PI - rawDifferenceRad : rawDifferenceRad;
  return Math.min(differenceRad, Math.PI - differenceRad);
}

interface CrossingPair {
  /** Of the two bearings, the one whose id sorts first. */
  readonly first: Bearing;
  readonly second: Bearing;
  readonly crossingRad: number;
}

/**
 * The pair with the largest crossing angle. A tie goes to the pair whose sorted ids come first,
 * so the result does not depend on the order of `observations` (design D4). The caller
 * guarantees at least two valid observations.
 */
function largestCrossingPair(observations: readonly Bearing[]): CrossingPair {
  let best: CrossingPair | undefined;
  for (let i = 0; i < observations.length; i += 1) {
    for (let j = i + 1; j < observations.length; j += 1) {
      const left = observations[i] as Bearing;
      const right = observations[j] as Bearing;
      const [first, second] = left.id <= right.id ? [left, right] : [right, left];
      const crossingRad = crossingAngleRad(first, second);
      const isBetter =
        best === undefined ||
        crossingRad > best.crossingRad ||
        (crossingRad === best.crossingRad &&
          (first.id < best.first.id || (first.id === best.first.id && second.id < best.second.id)));
      if (isBetter) best = { first, second, crossingRad };
    }
  }
  // At least two observations, so at least one pair was seen.
  return best as CrossingPair;
}

/** The partial derivatives of the unprojected position with respect to East and North. */
interface PositionJacobian {
  readonly dLatDEast: number;
  readonly dLatDNorth: number;
  readonly dLonDEast: number;
  readonly dLonDNorth: number;
}

/**
 * ∂(latC, lonC)/∂(eastM, northM) of `unprojectToLocalPlane` at `candidate`, where `target` is
 * the unprojected position.
 *
 * The unprojection is `destinationPosition(origin, θ, d)` with `d = √(e² + n²)`, `θ = atan2(e, n)`
 * and `δ = d / R`. Differentiating the destination formulas gives the derivatives with respect
 * to δ and θ, and `∂δ/∂e = e/(R d)`, `∂δ/∂n = n/(R d)`, `∂θ/∂e = n/d²`, `∂θ/∂n = -e/d²` carry
 * them to East and North. Those last factors divide by `d`. Below `LOCAL_PLANE_COLLAPSE_M`
 * (1e-9 m), where the projection itself collapses to the origin, the tangent-plane limit is used
 * instead: `∂lat/∂n = 1/R`, `∂lon/∂e = 1/(R cos(lat0))`, and zero for the cross terms (design
 * D16). The limit leaves out the meridian convergence, a term of size d·tan(lat0)/R, so it is
 * used only where d is too small for that term to matter; above 1e-9 m the polar chain rule is
 * well-conditioned.
 */
function positionJacobian(
  origin: Position,
  candidate: LocalPoint,
  target: Position,
): PositionJacobian {
  const { eastM, northM } = candidate;
  const distanceM = Math.hypot(eastM, northM);
  const sinLat0 = Math.sin(origin.latRad);
  const cosLat0 = Math.cos(origin.latRad);

  if (distanceM < LOCAL_PLANE_COLLAPSE_M) {
    return {
      dLatDEast: 0,
      dLatDNorth: 1 / EARTH_RADIUS_M,
      dLonDEast: 1 / (EARTH_RADIUS_M * cosLat0),
      dLonDNorth: 0,
    };
  }

  const angularDistanceRad = distanceM / EARTH_RADIUS_M;
  const sinDelta = Math.sin(angularDistanceRad);
  const cosDelta = Math.cos(angularDistanceRad);
  const sinTheta = eastM / distanceM;
  const cosTheta = northM / distanceM;
  const sinLatT = Math.sin(target.latRad);
  const cosLatT = Math.cos(target.latRad);

  // sin latC = sin lat0 cos δ + cos lat0 sin δ cos θ (the code computes latC by atan2; the
  // derivative of the same function is taken here through its sine)
  const dLatDDelta = (cosLat0 * cosDelta * cosTheta - sinLat0 * sinDelta) / cosLatT;
  const dLatDTheta = (-cosLat0 * sinDelta * sinTheta) / cosLatT;

  // lonC = lon0 + atan2(U, V), U = sin θ sin δ cos lat0, V = cos δ - sin lat0 sin latC
  const u = sinTheta * sinDelta * cosLat0;
  const v = cosDelta - sinLat0 * sinLatT;
  const uSquaredPlusVSquared = u * u + v * v;
  const dUDDelta = sinTheta * cosDelta * cosLat0;
  const dUDTheta = cosTheta * sinDelta * cosLat0;
  const dVDDelta = -sinDelta - sinLat0 * cosLatT * dLatDDelta;
  const dVDTheta = -sinLat0 * cosLatT * dLatDTheta;
  const dLonDDelta = (v * dUDDelta - u * dVDDelta) / uSquaredPlusVSquared;
  const dLonDTheta = (v * dUDTheta - u * dVDTheta) / uSquaredPlusVSquared;

  const dDeltaDEast = eastM / (EARTH_RADIUS_M * distanceM);
  const dDeltaDNorth = northM / (EARTH_RADIUS_M * distanceM);
  const dThetaDEast = northM / (distanceM * distanceM);
  const dThetaDNorth = -eastM / (distanceM * distanceM);
  return {
    dLatDEast: dLatDDelta * dDeltaDEast + dLatDTheta * dThetaDEast,
    dLatDNorth: dLatDDelta * dDeltaDNorth + dLatDTheta * dThetaDNorth,
    dLonDEast: dLonDDelta * dDeltaDEast + dLonDTheta * dThetaDEast,
    dLonDNorth: dLonDDelta * dDeltaDNorth + dLonDTheta * dThetaDNorth,
  };
}

/**
 * ∂(azimuth from `observer` to `target`)/∂(latC, lonC). The azimuth is `atan2(Y, X)` with
 * `Y = sin Δlon cos latC` and `X = cos lat0 sin latC - sin lat0 cos latC cos Δlon`.
 */
function azimuthGradient(
  observer: Position,
  target: Position,
): { readonly dAzimuthDLat: number; readonly dAzimuthDLon: number } {
  const deltaLonRad = target.lonRad - observer.lonRad;
  const sinDeltaLon = Math.sin(deltaLonRad);
  const cosDeltaLon = Math.cos(deltaLonRad);
  const sinLatO = Math.sin(observer.latRad);
  const cosLatO = Math.cos(observer.latRad);
  const sinLatT = Math.sin(target.latRad);
  const cosLatT = Math.cos(target.latRad);

  const y = sinDeltaLon * cosLatT;
  const x = cosLatO * sinLatT - sinLatO * cosLatT * cosDeltaLon;
  const dYDLat = -sinDeltaLon * sinLatT;
  const dYDLon = cosDeltaLon * cosLatT;
  const dXDLat = cosLatO * cosLatT + sinLatO * sinLatT * cosDeltaLon;
  const dXDLon = sinLatO * cosLatT * sinDeltaLon;
  const xSquaredPlusYSquared = x * x + y * y;
  return {
    dAzimuthDLat: (x * dYDLat - y * dXDLat) / xSquaredPlusYSquared,
    dAzimuthDLon: (x * dYDLon - y * dXDLon) / xSquaredPlusYSquared,
  };
}

interface PlaneLine {
  /** The observer, projected onto the Local plane. */
  readonly point: LocalPoint;
  /** Unit direction of the bearing on the plane. */
  readonly directionEast: number;
  readonly directionNorth: number;
}

/**
 * A bearing as a line on the Local plane of `origin` (design D18).
 *
 * The raw azimuth is measured from the observer's meridian, which on the plane is turned by the
 * convergence of the meridians between the observer and the origin. So the direction is taken
 * from two projected points instead: the observer and the point 100 m along the bearing. If that
 * point is not Supported or does not project, the point 100 m behind the observer is used and the
 * direction reversed; if that fails too, its failure is returned.
 */
function planeLine(observation: Bearing, origin: Position): Result<PlaneLine> {
  const point = projectToLocalPlane(origin, observation.observer);
  if (!point.ok) return point;

  const along = (azimuthRad: number): Result<LocalPoint> => {
    const reached = destinationPosition(observation.observer, azimuthRad, LINE_DIRECTION_STEP_M);
    if (!reached.ok) return reached;
    if (!isSupportedPosition(reached.value)) return err('unsupported_position');
    return projectToLocalPlane(origin, reached.value);
  };
  let sign = 1;
  let ahead = along(observation.azimuthRad);
  if (!ahead.ok) {
    ahead = along(observation.azimuthRad + Math.PI);
    if (!ahead.ok) return ahead;
    sign = -1;
  }
  const eastM = sign * (ahead.value.eastM - point.value.eastM);
  const northM = sign * (ahead.value.northM - point.value.northM);
  const lengthM = Math.hypot(eastM, northM);
  if (!(lengthM > 0)) return err('singular_geometry');
  return ok({
    point: point.value,
    directionEast: eastM / lengthM,
    directionNorth: northM / lengthM,
  });
}

export class BearingModel implements MeasurementModel<Bearing> {
  validate(observation: Bearing): Result<void> {
    return validateBearing(observation);
  }

  idOf(observation: Bearing): string {
    return observation.id;
  }

  /**
   * The Local plane origin: the centroid of the observer positions (Req 6.4), taken as the mean
   * of the observers' unit vectors on the sphere, renormalised (design D2). Unlike a mean of
   * longitudes it is unchanged by a rotation about the polar axis, so observers on both sides of
   * the ±180° meridian give the centroid on the meridian, not at 0°.
   */
  origin(observations: readonly Bearing[]): Result<Position> {
    const failure = observationSetFailure(observations);
    if (failure) return failure;

    let xSum = 0;
    let ySum = 0;
    let zSum = 0;
    for (const { observer } of observations) {
      xSum += Math.cos(observer.latRad) * Math.cos(observer.lonRad);
      ySum += Math.cos(observer.latRad) * Math.sin(observer.lonRad);
      zSum += Math.sin(observer.latRad);
    }
    const meanLength = Math.hypot(xSum, ySum, zSum) / observations.length;
    if (!(meanLength > MIN_CENTROID_LENGTH)) return err('unsupported_position');

    // atan2 of the components needs no clamping. `_wrapPi` turns a longitude of -π into +π.
    const centroid: Position = {
      latRad: Math.atan2(zSum, Math.hypot(xSum, ySum)),
      lonRad: _wrapPi(Math.atan2(ySum, xSum)),
    };
    return isSupportedPosition(centroid) ? ok(centroid) : err('unsupported_position');
  }

  /**
   * The intersection, on the Local plane of `origin`, of the two bearing lines with the largest
   * crossing angle (Req 6.4). Fails with `singular_geometry` when that angle is below 0.5°, where
   * the lines are parallel or nearly so and have no reliable intersection.
   */
  startEstimate(observations: readonly Bearing[], origin: Position): Result<LocalPoint> {
    const failure = observationSetFailure(observations);
    if (failure) return failure;

    const pair = largestCrossingPair(observations);
    if (pair.crossingRad < MIN_CROSSING_ANGLE_RAD) return err('singular_geometry');
    const firstLine = planeLine(pair.first, origin);
    if (!firstLine.ok) return firstLine;
    const secondLine = planeLine(pair.second, origin);
    if (!secondLine.ok) return secondLine;

    // Lines P_k + t_k d_k. Crossing the equation P1 + t d1 = P2 + s d2 with d2 gives
    // t = ((P2 - P1) × d2) / (d1 × d2), where a × b = a.east b.north - a.north b.east.
    const { point: first, directionEast: e1, directionNorth: n1 } = firstLine.value;
    const { point: second, directionEast: e2, directionNorth: n2 } = secondLine.value;
    const directionsCross = e1 * n2 - n1 * e2;
    const gapEastM = second.eastM - first.eastM;
    const gapNorthM = second.northM - first.northM;
    const alongFirstM = (gapEastM * n2 - gapNorthM * e2) / directionsCross;

    const eastM = first.eastM + alongFirstM * e1;
    const northM = first.northM + alongFirstM * n1;
    if (!Number.isFinite(eastM) || !Number.isFinite(northM)) return err('singular_geometry');
    return ok({ eastM, northM });
  }

  /**
   * The pre-solve and post-exclusion geometry check (Req 9.2, 9.3, 9.4). `colocated_observers`
   * if every pair of observers is under 1 m apart, checked first (design D5); `singular_geometry`
   * if the largest crossing angle is under 0.5°; the `poor_geometry` warning if it is under 20°.
   */
  geometryCheck(
    observations: readonly Bearing[],
  ): Result<{ readonly warnings: readonly Warning[] }> {
    const failure = observationSetFailure(observations);
    if (failure) return failure;

    let someObserversApart = false;
    for (let i = 0; i < observations.length && !someObserversApart; i += 1) {
      for (let j = i + 1; j < observations.length; j += 1) {
        const left = observations[i] as Bearing;
        const right = observations[j] as Bearing;
        if (_distanceM(left.observer, right.observer) >= COLOCATED_OBSERVERS_M) {
          someObserversApart = true;
          break;
        }
      }
    }
    if (!someObserversApart) return err('colocated_observers');

    const largestCrossingRad = largestCrossingPair(observations).crossingRad;
    if (largestCrossingRad < MIN_CROSSING_ANGLE_RAD) return err('singular_geometry');
    if (largestCrossingRad < POOR_GEOMETRY_CROSSING_RAD) return ok({ warnings: ['poor_geometry'] });
    return ok({ warnings: [] });
  }

  /**
   * What `observation` should read at `candidate` (Req 6.1 to 6.3, 6.7), with the partial
   * derivatives of the predicted azimuth (design D8, D16). Fails with `unsupported_position` if
   * the candidate does not unproject to a Supported position, and with `coincident_positions`
   * if it is within 1e-3 m of the observer (design D15).
   */
  evaluate(observation: Bearing, candidate: LocalPoint, origin: Position): Result<Evaluation> {
    const validation = validateBearing(observation);
    if (!validation.ok) return validation;
    if (!Number.isFinite(candidate.eastM) || !Number.isFinite(candidate.northM)) {
      return err('invalid_number');
    }

    const target = unprojectToLocalPlane(origin, candidate);
    if (!target.ok) return target;
    const predictedRad = initialAzimuthRad(observation.observer, target.value);
    if (!predictedRad.ok) return predictedRad;

    const residualRad = _wrapPi(observation.azimuthRad - predictedRad.value);
    const rangeM = Math.max(_distanceM(observation.observer, target.value), MIN_SIGMA_RANGE_M);
    const effectiveSigmaRad = Math.hypot(
      observation.azimuthSigmaRad,
      observation.positionAccuracyM / rangeM,
    );

    const gradient = azimuthGradient(observation.observer, target.value);
    const jacobian = positionJacobian(origin, candidate, target.value);
    const partialEastRadPerM =
      gradient.dAzimuthDLat * jacobian.dLatDEast + gradient.dAzimuthDLon * jacobian.dLonDEast;
    const partialNorthRadPerM =
      gradient.dAzimuthDLat * jacobian.dLatDNorth + gradient.dAzimuthDLon * jacobian.dLonDNorth;

    const evaluation: Evaluation = {
      predictedRad: predictedRad.value,
      residualRad,
      effectiveSigmaRad,
      partialEastRadPerM,
      partialNorthRadPerM,
    };
    const allFinite = Object.values(evaluation).every((value) => Number.isFinite(value));
    return allFinite && effectiveSigmaRad > 0 ? ok(evaluation) : err('invalid_number');
  }

  /**
   * The post-solve plausibility check (Req 9.5, 9.6; design D7). For each remaining observation
   * the residual is read from `fix.residuals`: beyond 90° the fix lies behind that observer and
   * the check fails with `diverging_bearings`. A fix more than 500 km from `origin`, the origin
   * it was solved in, fails with `out_of_range`.
   */
  postSolveCheck(
    fix: Fix,
    origin: Position,
    observations: readonly Bearing[],
  ): Result<{ readonly warnings: readonly Warning[] }> {
    const failure = observationSetFailure(observations);
    if (failure) return failure;

    const residualById = new Map(fix.residuals.map((entry) => [entry.id, entry.residualRad]));
    for (const observation of observations) {
      const residualRad = residualById.get(observation.id);
      if (residualRad === undefined) {
        return err('invalid_observation', { field: 'residuals', id: observation.id });
      }
      if (!Number.isFinite(residualRad)) return err('invalid_number');
      if (Math.abs(residualRad) > DIVERGING_RESIDUAL_RAD) return err('diverging_bearings');
    }

    const rangeM = greatCircleDistanceM(origin, fix.position);
    if (!rangeM.ok) return rangeM;
    if (rangeM.value > MAX_FIX_RANGE_M) return err('out_of_range');
    return ok({ warnings: [] });
  }
}
