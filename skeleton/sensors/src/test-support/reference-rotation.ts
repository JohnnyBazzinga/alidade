// An independent computation of the Device rotation for the property tests (design D3). It is
// written here, separately from `rotation.ts`: column vectors are rotated one elementary rotation
// at a time, `Ry` first, so neither the closed formula of `cameraAxis` nor the matrix product of
// `rotationMatrix` is checked against itself.

import type { DeviceRotation, EnuDirection } from '../rotation';

type Vector = readonly [number, number, number];

function rotateY(v: Vector, angleRad: number): Vector {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

function rotateX(v: Vector, angleRad: number): Vector {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

function rotateZ(v: Vector, angleRad: number): Vector {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}

/** `Rz(alpha) · Rx(beta) · Ry(gamma) · v`, as East-North-Up. */
export function referenceRotate(rotation: DeviceRotation, v: Vector): EnuDirection {
  const rotated = rotateZ(
    rotateX(rotateY(v, rotation.gammaRad), rotation.betaRad),
    rotation.alphaRad,
  );
  return { east: rotated[0], north: rotated[1], up: rotated[2] };
}

/** `Rᵀ · d`: an ENU direction back in device coordinates, undoing each rotation in turn. */
export function referenceUnrotate(rotation: DeviceRotation, d: EnuDirection): Vector {
  const v: Vector = [d.east, d.north, d.up];
  return rotateY(rotateX(rotateZ(v, -rotation.alphaRad), -rotation.betaRad), -rotation.gammaRad);
}

/** The angle between two unit vectors, `atan2(|a × b|, a · b)`, accurate at small angles. */
export function angleBetweenRad(a: EnuDirection, b: EnuDirection): number {
  const cx = a.north * b.up - a.up * b.north;
  const cy = a.up * b.east - a.east * b.up;
  const cz = a.east * b.north - a.north * b.east;
  return Math.atan2(Math.hypot(cx, cy, cz), a.east * b.east + a.north * b.north + a.up * b.up);
}
