// Mark (Req 10.5, 10.6, design §7.6): a tapped point turned into a Ray offset and its Image
// angular sigma, kept as an offset so that a change of the Element's size does not move it.

import type { UiResult } from '../../result';
import { ok } from '../../result';
import type { CameraCalibration } from '../camera-calibration';
import { pointToRayOffset } from '../image-geometry';
import type { ImageLayout, PixelPoint } from '../image-layout';
import { imageAngularSigmaRad } from '../ray-uncertainty';
import type { Mark } from './session';

/**
 * The Mark of a tapped point. The Freeze already required a Screen angle of 0 (Req 10.2), so
 * this repeats no check of it. The failures are those of Req 5.4 and Req 6.2.
 */
export function makeMark(
  point: PixelPoint,
  layout: ImageLayout,
  calibration: CameraCalibration | null,
  tapSigmaPx: number,
): UiResult<Mark> {
  const offset = pointToRayOffset(layout, calibration, point);
  if (!offset.ok) return offset;
  const sigma = imageAngularSigmaRad(layout, calibration, point, tapSigmaPx);
  if (!sigma.ok) return sigma;
  if (calibration === null) return { ok: false, reason: 'calibration_missing' };
  return ok({ offset: offset.value, imageSigmaRad: sigma.value, calibration });
}
