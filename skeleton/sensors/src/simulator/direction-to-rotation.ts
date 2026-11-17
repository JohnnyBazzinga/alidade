// From a camera direction and a roll to W3C Euler angles (design D18, §7.12): the inverse of the
// Device rotation, used by the Simulator to generate raw events and by the tests to build
// rotations that point in a chosen direction.

import { radToDeg, wrapPi, wrapTwoPi } from '@alidade/core';
import type { DeviceRotation } from '../rotation';
import { err, ok, type SensorResult } from '../sensor-result';

/** Below this `|cos β|` the rotation is treated as exactly in gimbal lock. */
const GIMBAL_LOCK_LIMIT = 1e-12;

/** W3C Euler angles in degrees, in the W3C ranges. */
export interface EulerDegrees {
  readonly alphaDeg: number; // [0, 360)
  readonly betaDeg: number; // [-180, 180)
  readonly gammaDeg: number; // [-90, 90)
}

type Vector = readonly [number, number, number];

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** `wrapTwoPi` of a finite value (the callers pass only finite values). */
function twoPi(angleRad: number): number {
  const wrapped = wrapTwoPi(angleRad);
  return wrapped.ok ? wrapped.value : Number.NaN;
}

/** `wrapPi` of a finite value, then `π` mapped to `-π`, so the result lies in [-π, π). */
function minusPiToPi(angleRad: number): number {
  const wrapped = wrapPi(angleRad);
  if (!wrapped.ok) return Number.NaN;
  return wrapped.value === Math.PI ? -Math.PI : wrapped.value;
}

/**
 * The Device rotation that points the rear camera at `azimuthRad` (in the frame) and
 * `apparentAltitudeRad`, rolled by `rollRad` about the camera axis (positive turns the screen
 * counterclockwise as the user sees it, so its top moves left). Returns `alpha ∈ [0, 2π)`, `beta ∈ [-π, π)`, `gamma ∈ [-π/2, π/2)`.
 *
 * The device axes in East-North-Up are: `z = -c` (the camera looks along `-z`), the zero-roll
 * right axis `x₀ = (cos A, -sin A, 0)`, `y₀ = z × x₀`, then the roll. The matrix `M = [x y z]`
 * equals `Rz(α) Rx(β) Ry(γ)`, whose bottom row is `(-cβ sγ, sβ, cβ cγ)` and middle column
 * `(-cβ sα, cα cβ, sβ)`; the angles are read from those. Near gimbal lock the entries used are
 * products of small sines, so they keep their relative precision and the ratios stay accurate.
 */
export function rotationFromDirection(
  azimuthRad: number,
  apparentAltitudeRad: number,
  rollRad: number,
): SensorResult<DeviceRotation> {
  if (!Number.isFinite(azimuthRad)) return err('invalid_number', { field: 'azimuthRad' });
  if (!Number.isFinite(apparentAltitudeRad))
    return err('invalid_number', { field: 'apparentAltitudeRad' });
  if (!Number.isFinite(rollRad)) return err('invalid_number', { field: 'rollRad' });

  const cosH = Math.cos(apparentAltitudeRad);
  const sinH = Math.sin(apparentAltitudeRad);
  const sinA = Math.sin(azimuthRad);
  const cosA = Math.cos(azimuthRad);
  const z: Vector = [-cosH * sinA, -cosH * cosA, -sinH];
  const x0: Vector = [cosA, -sinA, 0];
  const y0 = cross(z, x0);
  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);
  const x: Vector = [
    cosR * x0[0] + sinR * y0[0],
    cosR * x0[1] + sinR * y0[1],
    cosR * x0[2] + sinR * y0[2],
  ];
  const y: Vector = [
    -sinR * x0[0] + cosR * y0[0],
    -sinR * x0[1] + cosR * y0[1],
    -sinR * x0[2] + cosR * y0[2],
  ];

  // M[row][column]: rows East, North, Up; columns the device x, y, z.
  const m20 = x[2];
  const m21 = y[2];
  const m22 = z[2];
  let cosBeta = Math.hypot(m20, m22);
  if (m22 < 0) cosBeta = -cosBeta; // keeps cos γ ≥ 0, so γ ∈ [-π/2, π/2]

  let alphaRad: number;
  let betaRad: number;
  let gammaRad: number;
  if (Math.abs(cosBeta) < GIMBAL_LOCK_LIMIT) {
    // Exactly upright or exactly face down: only α + γ (or α - γ) is defined; take γ = 0.
    betaRad = Math.atan2(m21, 0);
    gammaRad = 0;
    alphaRad = Math.atan2(x[1], x[0]);
  } else {
    betaRad = Math.atan2(m21, cosBeta);
    gammaRad = Math.atan2(-m20 / cosBeta, m22 / cosBeta);
    alphaRad = Math.atan2(-y[0] / cosBeta, y[1] / cosBeta);
  }
  if (gammaRad >= Math.PI / 2) {
    // (α, β, π/2) and (α + π, π - β, -π/2) are the same rotation; the second is in range.
    alphaRad += Math.PI;
    betaRad = Math.PI - betaRad;
    gammaRad = -Math.PI / 2;
  }
  return ok({ alphaRad: twoPi(alphaRad), betaRad: minusPiToPi(betaRad), gammaRad });
}

function toDeg(angleRad: number): number {
  const converted = radToDeg(angleRad);
  return converted.ok ? converted.value : Number.NaN;
}

/**
 * The rotation's angles in degrees, in the W3C ranges. Conversion can round a value onto the open
 * end of its range (an `α` just below `2π` becomes exactly `360`), so the ends are mapped back
 * after converting, `γ = 90` by the same identity as above.
 */
export function eulerDegreesFromRotation(rotation: DeviceRotation): EulerDegrees {
  let alphaDeg = toDeg(rotation.alphaRad);
  let betaDeg = toDeg(rotation.betaRad);
  let gammaDeg = toDeg(rotation.gammaRad);
  if (gammaDeg >= 90) {
    alphaDeg += 180;
    betaDeg = 180 - betaDeg;
    gammaDeg -= 180;
  }
  if (alphaDeg >= 360) alphaDeg -= 360;
  if (betaDeg >= 180) betaDeg -= 360;
  if (betaDeg < -180) betaDeg += 360;
  return { alphaDeg, betaDeg, gammaDeg };
}
