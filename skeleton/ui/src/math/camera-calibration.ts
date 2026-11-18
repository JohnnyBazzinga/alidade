// The Camera calibration (Req 4, design §7.3): the field of view of the pinhole camera with its
// uncertainty, passed in by the caller. Nothing defaults it (Req 4.2): there is no default
// calibration, no default field of view and no default `fovSigmaRad` anywhere in the package.

import { err, ok, type UiResult } from '../result';
import { fromDeg } from './degrees';

export type FovAxis = 'width' | 'height' | 'diagonal';

/**
 * The field of view along `fovAxis` of the Source image, its 1-sigma, and the size of the Source
 * image it was measured with. The principal point is the centre of the Source image.
 */
export interface CameraCalibration {
  readonly fovRad: number;
  readonly fovAxis: FovAxis;
  readonly fovSigmaRad: number;
  readonly imageWidthSourcePx: number;
  readonly imageHeightSourcePx: number;
}

/** The least `fovSigmaRad`: the least 1-sigma Core accepts for an azimuth, 0.01° (Req 4.1). */
export const MIN_FOV_SIGMA_RAD = fromDeg(0.01);

/** The relative difference of aspect ratios beyond which a calibration is refused (Req 4.4). */
export const ASPECT_TOLERANCE = 0.01;

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Checks a calibration in the order of the fields of Req 4.1 and returns it, or
 * `invalid_number` naming the first invalid field: `fovRad` finite and in `(0, π)`; `fovAxis`
 * one of the three; `fovSigmaRad` finite and at least 0.01°; `fovRad - fovSigmaRad > 0` and
 * `fovRad + fovSigmaRad < π` (both named `fovSigmaRad`); the two sizes finite and positive.
 */
export function checkCalibration(c: CameraCalibration): UiResult<CameraCalibration> {
  if (!isFiniteNumber(c.fovRad) || !(c.fovRad > 0) || !(c.fovRad < Math.PI)) {
    return err('invalid_number', { field: 'fovRad' });
  }
  if (c.fovAxis !== 'width' && c.fovAxis !== 'height' && c.fovAxis !== 'diagonal') {
    return err('invalid_number', { field: 'fovAxis' });
  }
  if (!isFiniteNumber(c.fovSigmaRad) || c.fovSigmaRad < MIN_FOV_SIGMA_RAD) {
    return err('invalid_number', { field: 'fovSigmaRad' });
  }
  if (!(c.fovRad - c.fovSigmaRad > 0) || !(c.fovRad + c.fovSigmaRad < Math.PI)) {
    return err('invalid_number', { field: 'fovSigmaRad' });
  }
  if (!isFiniteNumber(c.imageWidthSourcePx) || !(c.imageWidthSourcePx > 0)) {
    return err('invalid_number', { field: 'imageWidthSourcePx' });
  }
  if (!isFiniteNumber(c.imageHeightSourcePx) || !(c.imageHeightSourcePx > 0)) {
    return err('invalid_number', { field: 'imageHeightSourcePx' });
  }
  return ok(c);
}

/**
 * The focal length in source pixels at the calibration's own image size, `f = (D / 2) /
 * tan(fovRad / 2)` with `D` the width, the height or the diagonal of that image (Req 4.3). The
 * geometry of Req 5 does not use it (it applies the field of view to the image as displayed,
 * design D7); it states what the calibration means and is held to itself by P-4.7.
 */
export function focalLengthSourcePx(c: CameraCalibration): UiResult<number> {
  const checked = checkCalibration(c);
  if (!checked.ok) return checked;
  const w = c.imageWidthSourcePx;
  const h = c.imageHeightSourcePx;
  const d = c.fovAxis === 'width' ? w : c.fovAxis === 'height' ? h : Math.hypot(w, h);
  const f = d / 2 / Math.tan(c.fovRad / 2);
  return Number.isFinite(f) && f > 0 ? ok(f) : err('invalid_number', { field: 'fovRad' });
}
