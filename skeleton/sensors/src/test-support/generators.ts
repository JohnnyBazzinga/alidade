// Shared fast-check generators (design §8). Each documents the domain it draws from and what it
// excludes (testing.md rule 4).

import fc from 'fast-check';
import type { DeviceRotation } from '../rotation';
import type { RayOffset } from '../ray';

const TWO_PI = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const DEG = Math.PI / 180;

const TWO_POW_53 = 2 ** 53;

/**
 * A double drawn uniformly from [min, max). `fc.double` is not used for this: it draws evenly
 * over the representable doubles, so most of its draws are tiny in magnitude, which would put the
 * phone flat far more often than a uniform angle does. 53 random bits give a uniform fraction.
 */
export function uniform(min: number, max: number): fc.Arbitrary<number> {
  // `noBias`: fast-check otherwise favours small integers, which would favour `min`.
  return fc.noBias(fc.integer({ min: 0, max: TWO_POW_53 - 1 })).map((n) => {
    const value = min + (max - min) * (n / TWO_POW_53);
    return value < max ? value : min; // rounding can reach max; keep the interval half-open
  });
}

/** A double uniform in [min, max), never NaN. */
function halfOpen(min: number, max: number): fc.Arbitrary<number> {
  return uniform(min, max);
}

/** A double uniform in [min, max], with both ends drawn on purpose. */
export function closed(min: number, max: number): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(min, max) },
    { weight: 9, arbitrary: uniform(min, max) },
  );
}

/** `10^k` with `k` uniform in [-17, -2]. */
export function logScaleMagnitude(): fc.Arbitrary<number> {
  return uniform(-17, -2).map((exponent) => 10 ** exponent);
}

/** `s · 10^k` with `s = ±1` and `k` uniform in [-17, -2]: log-scale offsets near a singularity. */
export function logScaleOffset(): fc.Arbitrary<number> {
  return fc
    .tuple(fc.boolean(), logScaleMagnitude())
    .map(([negative, magnitude]) => (negative ? -magnitude : magnitude));
}

const uniformAlpha = halfOpen(0, TWO_PI);
const uniformBeta = halfOpen(-Math.PI, Math.PI);
const uniformGamma = halfOpen(-HALF_PI, HALF_PI);

/**
 * `deviceRotation`: `alpha ∈ [0, 2π)`, `beta ∈ [-π, π)`, `gamma ∈ [-π/2, π/2)` (Req 2.7).
 * Half the draws are uniform. The other half are edge cases:
 * - near gimbal lock (the upright phone): `beta = ±π/2 + s·10^k` (`k ∈ [-17, -2]`) or `±π/2`
 *   exactly, with `gamma` equal to `0`, `s·10^k`, `-π/2`, `-π/2 + 10^k`, or uniform. Offsets
 *   below about 1e-16 round to `±π/2` itself; those draws are kept, since the browser can
 *   deliver that exact value;
 * - other edges: `beta = 0` (flat), `gamma = 0`, `gamma = -π/2`, `alpha = 0`.
 * Excludes nothing within the domain.
 */
export function deviceRotation(): fc.Arbitrary<DeviceRotation> {
  const nearLockBeta = fc.oneof(
    fc.constantFrom(HALF_PI, -HALF_PI),
    fc
      .tuple(fc.constantFrom(HALF_PI, -HALF_PI), logScaleOffset())
      .map(([base, offset]) => base + offset),
  );
  const nearLockGamma = fc.oneof(
    fc.constant(0),
    logScaleOffset(),
    fc.constant(-HALF_PI),
    logScaleMagnitude().map((magnitude) => -HALF_PI + magnitude),
    uniformGamma,
  );
  const nearLock = fc.record({
    alphaRad: uniformAlpha,
    betaRad: nearLockBeta,
    gammaRad: nearLockGamma,
  });
  const otherEdges = fc.oneof(
    fc.record({ alphaRad: uniformAlpha, betaRad: fc.constant(0), gammaRad: uniformGamma }),
    fc.record({ alphaRad: uniformAlpha, betaRad: uniformBeta, gammaRad: fc.constant(0) }),
    fc.record({ alphaRad: uniformAlpha, betaRad: uniformBeta, gammaRad: fc.constant(-HALF_PI) }),
    fc.record({ alphaRad: fc.constant(0), betaRad: uniformBeta, gammaRad: uniformGamma }),
  );
  const uniform = fc.record({
    alphaRad: uniformAlpha,
    betaRad: uniformBeta,
    gammaRad: uniformGamma,
  });
  return fc.oneof(
    { weight: 4, arbitrary: uniform },
    { weight: 3, arbitrary: nearLock },
    { weight: 1, arbitrary: otherEdges },
  );
}

/** The horizontal part of the Camera axis, `hypot(east, north)`, from the closed formula. */
export function horizontalPart(r: DeviceRotation): number {
  const east = -(
    Math.cos(r.alphaRad) * Math.sin(r.gammaRad) +
    Math.sin(r.alphaRad) * Math.sin(r.betaRad) * Math.cos(r.gammaRad)
  );
  const north = -(
    Math.sin(r.alphaRad) * Math.sin(r.gammaRad) -
    Math.cos(r.alphaRad) * Math.sin(r.betaRad) * Math.cos(r.gammaRad)
  );
  return Math.hypot(east, north);
}

/**
 * `horizontalRotation`: a `deviceRotation` whose Camera axis has a horizontal part of at least
 * `1e-3` (Req 2.9). Excludes the phone within about 0.06° of flat, face up or face down; those
 * axes are covered by the `axis_vertical` examples. Discard rate, measured on 100 000 draws with
 * seed 20261117: 1 draw in 100 000 (0.001 %), a `gamma = 0` edge draw with `beta` near `±π`.
 */
export function horizontalRotation(): fc.Arbitrary<DeviceRotation> {
  return deviceRotation().filter((r) => horizontalPart(r) >= 1e-3);
}

/** `smallRotationChange`: `Δα, Δβ, Δγ ∈ [-1e-3, 1e-3]` each, ends included (Req 2.10). */
export function smallRotationChange(): fc.Arbitrary<DeviceRotation> {
  const delta = closed(-1e-3, 1e-3);
  return fc.record({ alphaRad: delta, betaRad: delta, gammaRad: delta });
}

/** `rayOffset`: `rightRad, upRad ∈ [-80°, 80°]`, the ends and `0` drawn on purpose (Req 3.6). */
export function rayOffset(): fc.Arbitrary<RayOffset> {
  const limit = 80 * DEG;
  const component = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(-limit, 0, limit) },
    { weight: 9, arbitrary: uniform(-limit, limit) },
  );
  return fc.record({ rightRad: component, upRad: component });
}

/** A camera pose for the Simulator's inverse rotation: direction in the frame and roll. */
export interface CameraPose {
  readonly azimuthRad: number;
  readonly apparentAltitudeRad: number;
  readonly rollRad: number;
}

/**
 * `cameraPose` (P-12.6): azimuth in [0, 2π), altitude in [-80°, 80°], roll in [-π, π). Half the
 * draws are uniform. The other half are near gimbal lock: altitude `0` exactly or `s·10^k`
 * (`k ∈ [-17, -2]`), and roll `0`, `±π/2` or `-π` exactly, or `0` or `±π/2` plus `s·10^k`, or
 * `π - 10^k`, or `-π + 10^k`. Upright with no roll is the W3C gimbal lock (`beta = 90°`); a roll
 * of `±π/2` puts the phone on its side, and `±π` upside down. Excludes altitudes beyond ±80°, which
 * the examples cover.
 */
export function cameraPose(): fc.Arbitrary<CameraPose> {
  const limit = 80 * DEG;
  const uniformPose = fc.record({
    azimuthRad: halfOpen(0, TWO_PI),
    apparentAltitudeRad: closed(-limit, limit),
    rollRad: halfOpen(-Math.PI, Math.PI),
  });
  const nearLockAltitude = fc.oneof(fc.constant(0), logScaleOffset());
  const nearLockRoll = fc.oneof(
    fc.constantFrom(0, HALF_PI, -HALF_PI, -Math.PI),
    fc
      .tuple(fc.constantFrom(0, HALF_PI, -HALF_PI), logScaleOffset())
      .map(([base, offset]) => base + offset),
    // π - 10^k rounds to π itself below about 1e-16; π is outside [-π, π), and the same roll as
    // -π, so it is written as -π.
    logScaleMagnitude().map((magnitude) =>
      Math.PI - magnitude < Math.PI ? Math.PI - magnitude : -Math.PI,
    ),
    logScaleMagnitude().map((magnitude) => -Math.PI + magnitude),
  );
  const nearLockPose = fc.record({
    azimuthRad: halfOpen(0, TWO_PI),
    apparentAltitudeRad: nearLockAltitude,
    rollRad: nearLockRoll,
  });
  return fc.oneof(uniformPose, nearLockPose);
}

/** True for the near-gimbal-lock draws of `cameraPose`, which the reports give separately. */
export function isNearLockPose(pose: CameraPose): boolean {
  return Math.abs(pose.apparentAltitudeRad) <= 1e-2;
}
