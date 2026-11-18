// The Image angular sigma (Req 6, design §7.5): the 1-sigma of the angular error of a direction
// taken from a point of the image. It has two parts: the finger's (`εTap`, from the caller's
// `tapSigmaPx`, with no default) and the lens's (`εFov`, from the calibration's `fovSigmaRad`).

import { err, ok, type UiResult } from '../result';
import type { CameraCalibration } from './camera-calibration';
import { checkLayoutAndCalibration, focalLengthPx, pointToRayOffset } from './image-geometry';
import type { ImageLayout, PixelPoint } from './image-layout';

/**
 * `hypot(εTap, εFov)` for the Pixel point `p`, in radians. `εTap = tapSigmaPx / hypot(r, F)`,
 * with `r` the distance of the point from the centre of the Element and `F` the focal length in
 * CSS pixels; `εFov` is the larger of `|atan(r / F⁺) - atan(r / F)|` and `|atan(r / F⁻) -
 * atan(r / F)|`, with `F±` the focal lengths of the calibration with `fovRad ± fovSigmaRad`.
 *
 * `tapSigmaPx` is required, finite and at least 0, else `invalid_number` naming it (Req 6.2).
 * The failures of the point (Req 5.4) pass through.
 */
export function imageAngularSigmaRad(
  layout: ImageLayout,
  calibration: CameraCalibration | null,
  p: PixelPoint,
  tapSigmaPx: number,
): UiResult<number> {
  if (typeof tapSigmaPx !== 'number' || !Number.isFinite(tapSigmaPx) || tapSigmaPx < 0) {
    return err('invalid_number', { field: 'tapSigmaPx' });
  }
  const offset = pointToRayOffset(layout, calibration, p);
  if (!offset.ok) return offset;
  const checked = checkLayoutAndCalibration(layout, calibration);
  if (!checked.ok) return checked;
  const c = checked.value;
  const f = focalLengthPx(layout, c.fovAxis, c.fovRad);
  const fPlus = focalLengthPx(layout, c.fovAxis, c.fovRad + c.fovSigmaRad);
  const fMinus = focalLengthPx(layout, c.fovAxis, c.fovRad - c.fovSigmaRad);
  if (!f.ok) return f;
  if (!fPlus.ok) return fPlus;
  if (!fMinus.ok) return fMinus;
  const rPx = Math.hypot(p.xPx - layout.elementWidthPx / 2, p.yPx - layout.elementHeightPx / 2);
  const epsilonTap = tapSigmaPx / Math.hypot(rPx, f.value);
  const angle = Math.atan(rPx / f.value);
  const epsilonFov = Math.max(
    Math.abs(Math.atan(rPx / fPlus.value) - angle),
    Math.abs(Math.atan(rPx / fMinus.value) - angle),
  );
  const sigmaRad = Math.hypot(epsilonTap, epsilonFov);
  return Number.isFinite(sigmaRad) ? ok(sigmaRad) : err('invalid_number', { field: 'tapSigmaPx' });
}
