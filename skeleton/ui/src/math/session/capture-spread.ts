// The Spread a bearing capture carries (Req 12.6): the number Sensors' `captureBearing` computed
// for that capture, obtained by calling Sensors' own exported functions on the same inputs in the
// same order (its steps 7 and 8). The UI writes no Spread of its own (Sensors 1.10).
//
// The path matters to the last bit. Sensors adds the Declination to each sample's magnetic
// azimuth without wrapping and gives the sums to `summariseAzimuths`; the Live readout instead
// wraps each sample through `trueAzimuthFromMagnetic`, which differs in the last digits (P-9.9
// measured 4e-13). This function follows the capture's path, and P-12.6 holds it to Sensors'
// sigma exactly. Call it only after `captureBearing` succeeded on the same input, so that its
// checks (window, frame, Yaw reference, Declination) have passed.

import {
  applyYawReference,
  directionAzimuthRad,
  rayDirection,
  selectWindow,
  summariseAzimuths,
  type Declination,
  type OrientationSample,
  type RayOffset,
  type SightingWindow,
  type YawReference,
} from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';

export interface CaptureSpreadInput {
  readonly samples: readonly OrientationSample[];
  readonly window: SightingWindow;
  readonly rayOffset: RayOffset | null;
  readonly yawReference: YawReference | null;
  /** The Declination Sensors used: present exactly when the North reference was magnetic. */
  readonly declination: Declination | null;
}

export function captureSpreadRad(input: CaptureSpreadInput): UiResult<number> {
  const selected = selectWindow(input.samples, input.window);
  if (!selected.ok) return selected;
  const declinationRad = input.declination?.declinationRad ?? 0;
  const azimuthsRad: number[] = [];
  for (const sample of selected.value) {
    const direction = rayDirection(sample.rotation, input.rayOffset ?? undefined);
    if (!direction.ok) return direction;
    const frameAzimuth = directionAzimuthRad(direction.value);
    if (!frameAzimuth.ok) return frameAzimuth;
    let azimuthRad = frameAzimuth.value;
    if (input.yawReference !== null) {
      const referenced = applyYawReference(azimuthRad, input.yawReference);
      if (!referenced.ok) return referenced;
      azimuthRad =
        referenced.value.northReference === 'true'
          ? referenced.value.azimuthRad
          : referenced.value.magneticAzimuthRad;
    }
    azimuthsRad.push(azimuthRad + declinationRad);
  }
  const summary = summariseAzimuths(azimuthsRad);
  if (!summary.ok) return summary.reason === 'undefined_mean' ? err('too_unsteady') : summary;
  return ok(summary.value.spreadRad);
}
