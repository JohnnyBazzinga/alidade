// Device rotation and the Camera axis (Req 2, design §7.1, D3, D4).
//
// The device rotation is the W3C `R = Rz(alpha) · Rx(beta) · Ry(gamma)`, which maps device
// coordinates to East-North-Up (math-conventions, Frames). The camera direction always comes from
// the whole rotation, never from `alpha` or `gamma` alone (Req 2.3): with the phone upright the
// Euler angles are in gimbal lock, and only their combination is stable.

import { wrapTwoPi } from '@alidade/core';
import { err, ok, type SensorResult } from './sensor-result';

/** The W3C Euler angles of a Device rotation, converted to radians. Any finite values. */
export interface DeviceRotation {
  readonly alphaRad: number;
  readonly betaRad: number;
  readonly gammaRad: number;
}

/** A unit vector in East-North-Up. The components are dimensionless. */
export interface EnuDirection {
  readonly east: number;
  readonly north: number;
  readonly up: number;
}

/** A 3×3 matrix as three rows. Internal. */
export type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** Below this horizontal part a direction has no azimuth (Req 2.4). */
export const VERTICAL_AXIS_LIMIT = 1e-6;
/** A direction passed in is accepted if its length is within this of 1 (D4). */
const UNIT_LENGTH_TOLERANCE = 1e-9;
/** `asin` arguments are clamped only when the excess is below this (math-conventions). */
const ASIN_ROUNDING_LIMIT = 1e-12;

/** Checks that every angle of a rotation is finite, naming the first that is not (Req 2.6). */
export function checkRotation(rotation: DeviceRotation): SensorResult<DeviceRotation> {
  if (!Number.isFinite(rotation.alphaRad)) return err('invalid_number', { field: 'alphaRad' });
  if (!Number.isFinite(rotation.betaRad)) return err('invalid_number', { field: 'betaRad' });
  if (!Number.isFinite(rotation.gammaRad)) return err('invalid_number', { field: 'gammaRad' });
  return ok(rotation);
}

/**
 * The Camera axis: the image under `R` of the device vector `(0, 0, -1)`, by the closed formula
 * of Req 2.1. The rear camera looks along the device's `-z`.
 */
export function cameraAxis(rotation: DeviceRotation): SensorResult<EnuDirection> {
  const checked = checkRotation(rotation);
  if (!checked.ok) return checked;
  const sa = Math.sin(rotation.alphaRad);
  const ca = Math.cos(rotation.alphaRad);
  const sb = Math.sin(rotation.betaRad);
  const cb = Math.cos(rotation.betaRad);
  const sg = Math.sin(rotation.gammaRad);
  const cg = Math.cos(rotation.gammaRad);
  return ok({
    east: -(ca * sg + sa * sb * cg),
    north: -(sa * sg - ca * sb * cg),
    up: -(cb * cg),
  });
}

/**
 * `Rz(alpha) · Rx(beta) · Ry(gamma)` as the product of the elementary matrices (D3). Internal: the
 * Off-axis rays use it; the Camera axis uses the closed formula, so the two check each other.
 * The caller has validated the rotation.
 */
export function rotationMatrix(rotation: DeviceRotation): Matrix3 {
  const sa = Math.sin(rotation.alphaRad);
  const ca = Math.cos(rotation.alphaRad);
  const sb = Math.sin(rotation.betaRad);
  const cb = Math.cos(rotation.betaRad);
  const sg = Math.sin(rotation.gammaRad);
  const cg = Math.cos(rotation.gammaRad);
  const rz: Matrix3 = [
    [ca, -sa, 0],
    [sa, ca, 0],
    [0, 0, 1],
  ];
  const rx: Matrix3 = [
    [1, 0, 0],
    [0, cb, -sb],
    [0, sb, cb],
  ];
  const ry: Matrix3 = [
    [cg, 0, sg],
    [0, 1, 0],
    [-sg, 0, cg],
  ];
  return multiply(multiply(rz, rx), ry);
}

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const cell = (i: 0 | 1 | 2, j: 0 | 1 | 2): number =>
    a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return [
    [cell(0, 0), cell(0, 1), cell(0, 2)],
    [cell(1, 0), cell(1, 1), cell(1, 2)],
    [cell(2, 0), cell(2, 1), cell(2, 2)],
  ];
}

/** Checks a direction passed in: finite components and unit length within 1e-9 (D4). Internal. */
export function checkDirection(direction: EnuDirection): SensorResult<EnuDirection> {
  const { east, north, up } = direction;
  if (!Number.isFinite(east)) return err('invalid_number', { field: 'east' });
  if (!Number.isFinite(north)) return err('invalid_number', { field: 'north' });
  if (!Number.isFinite(up)) return err('invalid_number', { field: 'up' });
  if (Math.abs(Math.hypot(east, north, up) - 1) > UNIT_LENGTH_TOLERANCE) {
    return err('invalid_number', { field: 'direction' });
  }
  return ok(direction);
}

/**
 * The azimuth of a direction, `wrapTwoPi(atan2(east, north))`, in the North reference of the frame
 * the direction is in (Req 2.2). Fails with `axis_vertical` when the horizontal part is below
 * `1e-6`, where the azimuth is undefined (Req 2.4).
 */
export function directionAzimuthRad(direction: EnuDirection): SensorResult<number> {
  const checked = checkDirection(direction);
  if (!checked.ok) return checked;
  if (Math.hypot(direction.east, direction.north) < VERTICAL_AXIS_LIMIT)
    return err('axis_vertical');
  return wrapTwoPi(Math.atan2(direction.east, direction.north));
}

/**
 * The apparent altitude of a direction, `asin(up)`, measured against gravity (Req 2.2). Defined
 * for every unit vector, so it is still returned when the azimuth is not (Req 2.4).
 */
export function directionApparentAltitudeRad(direction: EnuDirection): SensorResult<number> {
  const checked = checkDirection(direction);
  if (!checked.ok) return checked;
  const excess = Math.abs(direction.up) - 1;
  if (excess > 0) {
    if (excess >= ASIN_ROUNDING_LIMIT) return err('invalid_number', { field: 'up' });
    return ok(Math.asin(Math.sign(direction.up)));
  }
  return ok(Math.asin(direction.up));
}
