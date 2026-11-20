// The Comparison with the phone's GPS (Req 11.3, 11.6; design §7.8).

import {
  CONFIDENCE_95_SCALE,
  greatCircleDistanceM,
  initialAzimuthRad,
  isSupportedPosition,
  projectToLocalPlane,
  type Position,
} from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { ShownFix } from './solve-candidate';

export interface Comparison {
  /** The GPS position compared with the Fix; held in memory only, never stored (Req 11.4). */
  readonly gps: Position;
  readonly distanceM: number;
  /** The direction from the Fix to the GPS position; 0 when they coincide. */
  readonly azimuthRad: number;
  /** `xᵀ C⁻¹ x`, with `x` the GPS position on the Local plane of the Fix. */
  readonly mahalanobisSquared: number;
  /** Whether it is within the 95 % ellipse: `mahalanobisSquared ≤ CONFIDENCE_95_SCALE²`. */
  readonly inside: boolean;
}

/** Fails with `invalid_number` for a covariance that is not positive definite or not finite. */
export function compare(
  shown: ShownFix,
  gps: Position,
  params: NoniusParameters,
): NoniusResult<Comparison> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!Number.isFinite(gps.latRad) || !Number.isFinite(gps.lonRad) || !isSupportedPosition(gps)) {
    return err('unsupported_position', { field: 'gps' });
  }
  const { varEastM2: a, covEastNorthM2: b, varNorthM2: c } = shown.covariance;
  const det = a * c - b * b;
  if (!(
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Number.isFinite(c) &&
    a > 0 &&
    det > 0 &&
    Number.isFinite(det)
  )) {
    return err('invalid_number', { field: 'covariance' });
  }
  const x = projectToLocalPlane(shown.position, gps);
  if (!x.ok) return err(x.reason, { field: 'gps' });
  const distance = greatCircleDistanceM(shown.position, gps);
  if (!distance.ok) return err(distance.reason, { field: 'gps' });
  const azimuth = initialAzimuthRad(shown.position, gps);
  const mahalanobisSquared =
    (c * x.value.eastM * x.value.eastM -
      2 * b * x.value.eastM * x.value.northM +
      a * x.value.northM * x.value.northM) /
    det;
  if (!Number.isFinite(mahalanobisSquared)) return err('invalid_number', { field: 'covariance' });
  return ok({
    gps,
    distanceM: distance.value,
    azimuthRad: azimuth.ok ? azimuth.value : 0,
    mahalanobisSquared,
    inside: mahalanobisSquared <= CONFIDENCE_95_SCALE * CONFIDENCE_95_SCALE,
  });
}
