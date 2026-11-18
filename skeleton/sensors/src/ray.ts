// Off-axis rays (Req 3, design §7.2): the East-North-Up direction of a point of the camera image,
// given as angular offsets from the Camera axis. This supports "freeze the image, then tap the
// target"; mapping a tap to offsets belongs to skeleton-ui.

import {
  cameraAxis,
  checkDirection,
  checkRotation,
  rotationMatrix,
  type DeviceRotation,
  type EnuDirection,
} from './rotation';
import { err, ok, type SensorResult } from './sensor-result';

/**
 * A direction in the camera image. `rightRad` is the angle of the ray's projection on the
 * device's x-z plane from `-z` toward `+x` (the right of the screen); `upRad` that on the y-z
 * plane toward `+y` (the top of the screen). Each in [-80°, 80°].
 */
export interface RayOffset {
  readonly rightRad: number;
  readonly upRad: number;
}

/** The largest offset accepted: 80° (Req 3.3). */
export const MAX_RAY_OFFSET_RAD = 80 * (Math.PI / 180);

/** Checks an offset: finite and within ±80°, naming the offending field (Req 3.3). */
export function checkRayOffset(offset: RayOffset): SensorResult<RayOffset> {
  for (const field of ['rightRad', 'upRad'] as const) {
    const value = offset[field];
    if (!Number.isFinite(value) || Math.abs(value) > MAX_RAY_OFFSET_RAD) {
      return err('invalid_number', { field });
    }
  }
  return ok(offset);
}

/**
 * The Off-axis ray `R · d`, with `d = (tan right, tan up, -1)` normalised (Req 3.1). At the zero
 * offset it is the Camera axis (Req 3.7).
 */
export function offAxisRay(
  rotation: DeviceRotation,
  offset: RayOffset,
): SensorResult<EnuDirection> {
  const checkedOffset = checkRayOffset(offset);
  if (!checkedOffset.ok) return checkedOffset;
  const checkedRotation = checkRotation(rotation);
  if (!checkedRotation.ok) return checkedRotation;
  const x = Math.tan(offset.rightRad);
  const y = Math.tan(offset.upRad);
  const length = Math.hypot(x, y, 1);
  const dx = x / length;
  const dy = y / length;
  const dz = -1 / length;
  const [r0, r1, r2] = rotationMatrix(rotation);
  return ok({
    east: r0[0] * dx + r0[1] * dy + r0[2] * dz,
    north: r1[0] * dx + r1[1] * dy + r1[2] * dz,
    up: r2[0] * dx + r2[1] * dy + r2[2] * dz,
  });
}

/** The Off-axis ray when an offset is given, else the Camera axis (Req 3.5). */
export function rayDirection(
  rotation: DeviceRotation,
  offset?: RayOffset,
): SensorResult<EnuDirection> {
  return offset === undefined ? cameraAxis(rotation) : offAxisRay(rotation, offset);
}

/**
 * The inverse of `offAxisRay` (Req 3.10, design §7.2): the Ray offset whose Off-axis ray, under
 * `rotation`, is `direction`, or `null` when the direction lies behind the camera or its offset
 * is beyond 80° on either axis. With `(x, y, z) = Rᵀ · direction`, the offset is
 * `rightRad = atan2(x, -z)` and `upRad = atan2(y, -z)` (Req 3.8), for `z < 0` (in front).
 *
 * Fails with `invalid_number` naming the field for a rotation angle or direction component that
 * is not finite, or `direction` when its length is not 1 within 1e-9 (as the azimuth functions).
 */
export function rayOffsetOfDirection(
  rotation: DeviceRotation,
  direction: EnuDirection,
): SensorResult<RayOffset | null> {
  const checkedRotation = checkRotation(rotation);
  if (!checkedRotation.ok) return checkedRotation;
  const checkedDirection = checkDirection(direction);
  if (!checkedDirection.ok) return checkedDirection;
  const [r0, r1, r2] = rotationMatrix(rotation);
  const { east, north, up } = direction;
  // Rᵀ · d: the columns of R are the rows of Rᵀ.
  const x = r0[0] * east + r1[0] * north + r2[0] * up;
  const y = r0[1] * east + r1[1] * north + r2[1] * up;
  const z = r0[2] * east + r1[2] * north + r2[2] * up;
  if (!(z < 0)) return ok(null);
  const rightRad = Math.atan2(x, -z);
  const upRad = Math.atan2(y, -z);
  if (Math.abs(rightRad) > MAX_RAY_OFFSET_RAD || Math.abs(upRad) > MAX_RAY_OFFSET_RAD) {
    return ok(null);
  }
  return ok({ rightRad, upRad });
}
