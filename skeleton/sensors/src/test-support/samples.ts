// Builders of Orientation samples for the tests. Synthetic only.

import type { OrientationFrame, OrientationSample } from '../orientation-sample';
import type { DeviceRotation } from '../rotation';
import { rotationFromDirection } from '../simulator/direction-to-rotation';
import { expectOk } from './result-helpers';

/** The rotation that points the camera at an azimuth (in its frame) and altitude, with a roll. */
export function pointing(azimuthRad: number, apparentAltitudeRad = 0, rollRad = 0): DeviceRotation {
  return expectOk(rotationFromDirection(azimuthRad, apparentAltitudeRad, rollRad));
}

export interface SampleOptions {
  readonly frame?: OrientationFrame;
  readonly screenAngleRad?: number | null;
  readonly magneticHeadingRad?: number | null;
  readonly compassAccuracyRad?: number | null;
}

/** One sample at a time, with a rotation; Relative frame, Screen angle 0 and no heading by default. */
export function sampleAt(
  timeUtcMs: number,
  rotation: DeviceRotation,
  options: SampleOptions = {},
): OrientationSample {
  return {
    timeUtcMs,
    frame: options.frame ?? 'relative',
    rotation,
    screenAngleRad: options.screenAngleRad === undefined ? 0 : options.screenAngleRad,
    magneticHeadingRad: options.magneticHeadingRad ?? null,
    compassAccuracyRad: options.compassAccuracyRad ?? null,
  };
}

/** `count` samples 100 ms apart, ending at `endUtcMs`, all built by `make(index, timeUtcMs)`. */
export function samplesEndingAt(
  endUtcMs: number,
  count: number,
  make: (index: number, timeUtcMs: number) => OrientationSample,
): OrientationSample[] {
  return Array.from({ length: count }, (_, index) => {
    const timeUtcMs = endUtcMs - (count - 1 - index) * 100;
    return make(index, timeUtcMs);
  });
}
