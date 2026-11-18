// Pixel point <-> Ray offset (Req 5.2 to 5.6, design §7.4, D7). A pinhole camera whose optical
// axis passes through the centre of the Source image, with no lens distortion. The field of view
// is an angle, so it is applied to the image as displayed (design D7): the calibration's own
// image size serves only the aspect check (Req 4.4). This module reads no Screen angle (Req 5.6).

import { MAX_RAY_OFFSET_RAD, type RayOffset } from '@alidade/sensors';
import { err, ok, type UiResult } from '../result';
import { ASPECT_TOLERANCE, checkCalibration, type CameraCalibration } from './camera-calibration';
import type { ImageLayout, PixelPoint } from './image-layout';

/** A point on a `contain` bar or outside the Element is refused beyond this (Req 5.4). */
const EDGE_TOLERANCE_PX = 1e-9;

function positive(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

/** The layout's numbers are finite and its sizes positive; a hostile record is `invalid_number`. */
function checkLayout(layout: ImageLayout): UiResult<ImageLayout> {
  const sizes = [
    'sourceWidthSourcePx',
    'sourceHeightSourcePx',
    'elementWidthPx',
    'elementHeightPx',
    'scalePxPerSourcePx',
    'displayedWidthPx',
    'displayedHeightPx',
  ] as const;
  for (const field of sizes) {
    if (!positive(layout[field])) return err('invalid_number', { field });
  }
  for (const field of ['leftPx', 'topPx'] as const) {
    if (typeof layout[field] !== 'number' || !Number.isFinite(layout[field])) {
      return err('invalid_number', { field });
    }
  }
  if (layout.fit !== 'cover' && layout.fit !== 'contain') {
    return err('invalid_number', { field: 'fit' });
  }
  return ok(layout);
}

/**
 * The focal length in CSS pixels, `F = (Dd / 2) / tan(fovRad / 2)`, with `Dd` the width, the
 * height or the diagonal of the displayed image along `fovAxis` (Req 5.2, D7). `fovRad` may be
 * that of the calibration or the field of view plus or minus its sigma.
 */
export function focalLengthPx(
  layout: ImageLayout,
  fovAxis: CameraCalibration['fovAxis'],
  fovRad: number,
): UiResult<number> {
  const dw = layout.displayedWidthPx;
  const dh = layout.displayedHeightPx;
  const d = fovAxis === 'width' ? dw : fovAxis === 'height' ? dh : Math.hypot(dw, dh);
  const f = d / 2 / Math.tan(fovRad / 2);
  return Number.isFinite(f) && f > 0 ? ok(f) : err('invalid_number', { field: 'fovRad' });
}

/**
 * The layout and calibration checks shared by every use of a calibration, in the order of Req
 * 5.4: a missing calibration, an invalid one, then the aspect-ratio check (Req 4.4).
 */
export function checkLayoutAndCalibration(
  layout: ImageLayout,
  calibration: CameraCalibration | null,
): UiResult<CameraCalibration> {
  const checkedLayout = checkLayout(layout);
  if (!checkedLayout.ok) return checkedLayout;
  if (calibration === null) return err('calibration_missing');
  const checked = checkCalibration(calibration);
  if (!checked.ok) return checked;
  const calibrationAspect = calibration.imageWidthSourcePx / calibration.imageHeightSourcePx;
  const sourceAspect = layout.sourceWidthSourcePx / layout.sourceHeightSourcePx;
  if (!(Math.abs(sourceAspect - calibrationAspect) / calibrationAspect <= ASPECT_TOLERANCE)) {
    return err('calibration_mismatch');
  }
  return ok(calibration);
}

/**
 * The focal length in CSS pixels of the calibration's own field of view, after the layout and
 * calibration checks (Req 4.3, 5.2).
 */
export function displayedFocalPx(
  layout: ImageLayout,
  calibration: CameraCalibration | null,
): UiResult<number> {
  const checked = checkLayoutAndCalibration(layout, calibration);
  if (!checked.ok) return checked;
  return focalLengthPx(layout, checked.value.fovAxis, checked.value.fovRad);
}

/**
 * The pure geometry of Req 5.2, with no check: `rightRad = atan((x - ew / 2) / F)`, `upRad =
 * atan(-(y - eh / 2) / F)`. Internal (not exported from index.ts): `pointToRayOffset` calls it
 * after its checks, and P-5.8 calls it for points outside the Element, which Req 5.8 allows.
 * `+ 0` turns a `-0` at the centre into `0`.
 */
export function offsetOfPixel(layout: ImageLayout, focalPx: number, p: PixelPoint): RayOffset {
  return {
    rightRad: Math.atan((p.xPx - layout.elementWidthPx / 2) / focalPx) + 0,
    upRad: Math.atan(-(p.yPx - layout.elementHeightPx / 2) / focalPx) + 0,
  };
}

/**
 * Turns a Pixel point of the Element into a Ray offset (Req 5.2). The checks run in this order
 * and the first failure is returned (Req 5.4): `invalid_number` for a point that is not finite;
 * `calibration_missing`, an invalid calibration, `calibration_mismatch`; `outside_image`;
 * `outside_field_of_view`.
 */
export function pointToRayOffset(
  layout: ImageLayout,
  calibration: CameraCalibration | null,
  p: PixelPoint,
): UiResult<RayOffset> {
  if (typeof p.xPx !== 'number' || !Number.isFinite(p.xPx)) {
    return err('invalid_number', { field: 'xPx' });
  }
  if (typeof p.yPx !== 'number' || !Number.isFinite(p.yPx)) {
    return err('invalid_number', { field: 'yPx' });
  }
  const checked = checkLayoutAndCalibration(layout, calibration);
  if (!checked.ok) return checked;
  const focal = focalLengthPx(layout, checked.value.fovAxis, checked.value.fovRad);
  if (!focal.ok) return focal;
  const ew = layout.elementWidthPx;
  const eh = layout.elementHeightPx;
  const { xPx: x, yPx: y } = p;
  let outside =
    x < -EDGE_TOLERANCE_PX ||
    x > ew + EDGE_TOLERANCE_PX ||
    y < -EDGE_TOLERANCE_PX ||
    y > eh + EDGE_TOLERANCE_PX;
  if (layout.fit === 'contain') {
    outside ||=
      x < layout.leftPx - EDGE_TOLERANCE_PX ||
      x > layout.leftPx + layout.displayedWidthPx + EDGE_TOLERANCE_PX ||
      y < layout.topPx - EDGE_TOLERANCE_PX ||
      y > layout.topPx + layout.displayedHeightPx + EDGE_TOLERANCE_PX;
  }
  if (outside) return err('outside_image');
  const { rightRad, upRad } = offsetOfPixel(layout, focal.value, p);
  if (!Number.isFinite(rightRad) || !Number.isFinite(upRad)) {
    return err('invalid_number', { field: 'xPx' });
  }
  if (Math.abs(rightRad) > MAX_RAY_OFFSET_RAD || Math.abs(upRad) > MAX_RAY_OFFSET_RAD) {
    return err('outside_field_of_view');
  }
  return ok({ rightRad, upRad });
}

/** A Pixel point with where it lies (Req 5.3). */
export interface PointOnImage {
  readonly point: PixelPoint;
  readonly insideElement: boolean;
  readonly onImage: boolean;
}

/**
 * The inverse (Req 5.3): `x = ew / 2 + F tan(rightRad)`, `y = eh / 2 - F tan(upRad)`, with
 * whether the point lies inside the Element and on the displayed image. An offset that is `NaN`,
 * infinite or beyond `MAX_RAY_OFFSET_RAD` is `invalid_number` naming `rightRad` or `upRad`
 * (Req 5.5), as Sensors does.
 */
export function rayOffsetToPoint(
  layout: ImageLayout,
  calibration: CameraCalibration | null,
  offset: RayOffset,
): UiResult<PointOnImage> {
  for (const field of ['rightRad', 'upRad'] as const) {
    const value = offset[field];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Math.abs(value) > MAX_RAY_OFFSET_RAD
    ) {
      return err('invalid_number', { field });
    }
  }
  const checked = checkLayoutAndCalibration(layout, calibration);
  if (!checked.ok) return checked;
  const focal = focalLengthPx(layout, checked.value.fovAxis, checked.value.fovRad);
  if (!focal.ok) return focal;
  const ew = layout.elementWidthPx;
  const eh = layout.elementHeightPx;
  const xPx = ew / 2 + focal.value * Math.tan(offset.rightRad);
  const yPx = eh / 2 - focal.value * Math.tan(offset.upRad);
  if (!Number.isFinite(xPx) || !Number.isFinite(yPx)) {
    return err('invalid_number', { field: 'rightRad' });
  }
  const insideElement = xPx >= 0 && xPx <= ew && yPx >= 0 && yPx <= eh;
  const onImage =
    layout.fit === 'cover'
      ? insideElement
      : xPx >= layout.leftPx &&
        xPx <= layout.leftPx + layout.displayedWidthPx &&
        yPx >= layout.topPx &&
        yPx <= layout.topPx + layout.displayedHeightPx;
  return ok({ point: { xPx, yPx }, insideElement, onImage });
}
