// Device-rotation math, transcribed verbatim from .kiro/steering/math-conventions.md
// (Frames section). All internal math is in radians; degrees appear only at this
// probe's I/O boundary (the sensors report degrees, the UI shows degrees).
//
// The formula is the thing under test: the steering notes it "must be confirmed
// against recorded phone data before the sensors package relies on it, because
// iOS does not report an absolute alpha". This probe exists to gather that data.

export interface CameraAxis {
  /** Azimuth of the rear-camera axis, clockwise from true north, in [0, 2π). */
  azimuthRad: number;
  /** Altitude of the rear-camera axis, in [-π/2, π/2]. */
  altitudeRad: number;
  /** East component of the unit camera axis in ENU. */
  east: number;
  /** North component of the unit camera axis in ENU. */
  north: number;
  /** Up component of the unit camera axis in ENU. */
  up: number;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Wrap to [0, 2π). */
export function wrapTwoPi(x: number): number {
  const twoPi = 2 * Math.PI;
  const r = ((x % twoPi) + twoPi) % twoPi;
  return r === twoPi ? 0 : r;
}

/** Wrap to (-π, π]. Robust for negative inputs: JS `%` keeps the dividend's sign,
 *  so we first normalise into [0, 2π) with `((x % 2π) + 2π) % 2π` and fold the
 *  upper half down. */
export function wrapPi(x: number): number {
  const pi = Math.PI;
  const twoPi = 2 * Math.PI;
  const r = ((x % twoPi) + twoPi) % twoPi; // [0, 2π)
  return r > pi ? r - twoPi : r; // (-π, π]
}

// iOS reports alpha relative to the device's starting orientation, never absolute.
// webkitCompassHeading is the heading of the device's top edge, clockwise from true
// north. The W3C absolute alpha is the rotation about the world up axis, which runs
// the opposite way: rotating the top from north toward west (counter-clockwise) grows
// alpha. Hence absolute alpha = (360 - heading) mod 360.
export function absoluteAlphaDegFromCompass(webkitCompassHeadingDeg: number): number {
  return (((360 - webkitCompassHeadingDeg) % 360) + 360) % 360;
}

/**
 * Rear-camera axis (the device -z direction) expressed in ENU, using the formula
 * from the math-conventions steering:
 *   east  = -(cos α · sin γ + sin α · sin β · cos γ)
 *   north = -(sin α · sin γ - cos α · sin β · cos γ)
 *   up    = -(cos β · cos γ)
 * with azimuth = atan2(east, north) and altitude = asin(up).
 *
 * The `up` argument is clamped before asin so the probe always renders a number;
 * the raw `up` is returned alongside so any excess (a real symptom here, since this
 * formula is what we are validating) stays visible in the readout.
 */
export function cameraAxisFromRotation(
  alphaRad: number,
  betaRad: number,
  gammaRad: number,
): CameraAxis {
  const ca = Math.cos(alphaRad);
  const sa = Math.sin(alphaRad);
  const cb = Math.cos(betaRad);
  const sb = Math.sin(betaRad);
  const cg = Math.cos(gammaRad);
  const sg = Math.sin(gammaRad);

  const east = -(ca * sg + sa * sb * cg);
  const north = -(sa * sg - ca * sb * cg);
  const up = -(cb * cg);

  const azimuthRad = wrapTwoPi(Math.atan2(east, north));
  const clampedUp = up < -1 ? -1 : up > 1 ? 1 : up;
  const altitudeRad = Math.asin(clampedUp);

  return { azimuthRad, altitudeRad, east, north, up };
}

/**
 * Horizontal azimuth of the device's top edge (+y) under the same rotation
 * R = Rz(α)·Rx(β)·Ry(γ) used for the camera axis. The +y vector maps to
 * (east, north, up) = (-sin α · cos β, cos α · cos β, sin β), so its azimuth is
 * atan2(-sin α · cos β, cos α · cos β). γ drops out because +y is the Ry axis.
 * Singular when cos β = 0 (top edge vertical): both horizontal components are 0
 * and the azimuth is undefined (atan2(0,0) → 0).
 */
export function topEdgeAzimuthRad(alphaRad: number, betaRad: number): number {
  const sa = Math.sin(alphaRad);
  const ca = Math.cos(alphaRad);
  const cb = Math.cos(betaRad);
  return wrapTwoPi(Math.atan2(-sa * cb, ca * cb));
}

/**
 * Candidate B camera azimuth — tilt-robust where candidate A (absolute alpha =
 * 360 − webkitCompassHeading) breaks down past vertical.
 *
 * Build the rotation from the event's own raw (relative, on iOS) alpha, beta,
 * gamma. The raw rotation captures the device's tilt but only a relative yaw;
 * the compass pins the absolute azimuth of the device top edge, so the yaw
 * offset = webkitCompassHeading − topEdgeAzimuth recovers the absolute yaw, and
 * adding it to the raw camera-axis azimuth gives the absolute camera azimuth
 * for any tilt. A pure yaw does not change altitude, so candidate B's altitude
 * equals candidate A's (asin(-(cos β · cos γ)), which is independent of alpha).
 */
export function candidateBAzimuthRad(
  rawAlphaRad: number,
  betaRad: number,
  gammaRad: number,
  compassHeadingDeg: number,
): number {
  const camRaw = cameraAxisFromRotation(rawAlphaRad, betaRad, gammaRad);
  const topY = topEdgeAzimuthRad(rawAlphaRad, betaRad);
  const offsetDeg = compassHeadingDeg - radToDeg(topY);
  return wrapTwoPi(degToRad(radToDeg(camRaw.azimuthRad) + offsetDeg));
}
