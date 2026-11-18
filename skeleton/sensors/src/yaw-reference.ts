// Yaw references (Req 5, design §7.6, D8 to D10): an offset that maps the azimuths of one
// orientation frame to azimuths measured from magnetic or true north.
//
// In the Relative frame a reference is the only way to north; the compass fixes it, and the
// gyroscope-based frame gives the precision (math-conventions, probe findings). In either frame a
// reference can also come from a known azimuth, such as the Sun or a landmark computed elsewhere.

import { wrapPi, wrapTwoPi } from '@alidade/core';
import { rss, summariseAzimuths } from './circular-summary';
import { invalidates, type FrameResetEvent } from './frame-reset';
import type { OrientationFrame, OrientationSample } from './orientation-sample';
import { checkSigma } from './parameters';
import { rayDirection, checkRayOffset, type RayOffset } from './ray';
import { cameraAxis, directionApparentAltitudeRad, directionAzimuthRad } from './rotation';
import { err, ok, type SensorResult } from './sensor-result';
import {
  resetBetween,
  selectWindow,
  windowStartUtcMs,
  type SightingWindow,
} from './sighting-window';

export type NorthReference = 'true' | 'magnetic';

export interface YawReference {
  /** Added to an azimuth of `frame` to give one from `northReference`; in (-π, π]. */
  readonly offsetRad: number;
  /** 1-sigma of the offset (Req 5.3). */
  readonly sigmaRad: number;
  readonly northReference: NorthReference;
  /** The frame of the samples it was established from (Req 5.16). */
  readonly frame: OrientationFrame;
  /** The end of its Sighting window (Req 5.4). */
  readonly establishedUtcMs: number;
}

/** An azimuth labelled with its North reference (Req 4.6). */
export type ReferencedAzimuth =
  | { readonly northReference: 'true'; readonly azimuthRad: number }
  | { readonly northReference: 'magnetic'; readonly magneticAzimuthRad: number };

/** The compass is used only with the camera within 30° of level (Req 5.6). */
const COMPASS_ALTITUDE_LIMIT_RAD = 30 * (Math.PI / 180);
/** A Screen angle within this of 0 is the natural orientation (design §2). */
const SCREEN_ANGLE_ZERO_TOLERANCE_RAD = 1e-12;

export interface CompassYawInput {
  readonly samples: readonly OrientationSample[];
  readonly frameResets: readonly FrameResetEvent[];
  readonly window: SightingWindow;
  /** The Heading 1-sigma (Req 5.3); the default is `HEADING_SIGMA_RAD`. */
  readonly headingSigmaRad: number;
}

/** Whether a sample's heading may be used: present, and its reported accuracy not negative. */
function hasUsableHeading(sample: OrientationSample): boolean {
  return (
    sample.magneticHeadingRad !== null &&
    (sample.compassAccuracyRad === null || sample.compassAccuracyRad >= 0)
  );
}

/**
 * A Yaw reference from the compass (Req 5.1, §7.6): the circular mean of
 * `wrapPi(magnetic heading - relative Camera azimuth)` over the Relative-frame samples of the
 * window that carry a usable heading. Absolute-frame samples are skipped (D10). The Reported
 * compass accuracy only excludes headings (when negative); it never feeds the 1-sigma (Req 5.8).
 */
export function yawReferenceFromCompass(input: CompassYawInput): SensorResult<YawReference> {
  const sigma = checkSigma(input.headingSigmaRad, 'headingSigmaRad');
  if (!sigma.ok) return sigma;
  const relative = input.samples.filter((sample) => sample.frame === 'relative');
  const selected = selectWindow(relative, input.window);
  if (!selected.ok) return selected;
  const { endUtcMs } = input.window;
  if (resetBetween(input.frameResets, windowStartUtcMs(input.window), endUtcMs)) {
    return err('frame_reset');
  }
  const usable = selected.value.filter(hasUsableHeading);
  if (usable.length < input.window.minSampleCount) return err('compass_unreliable');

  const differencesRad: number[] = [];
  for (const sample of usable) {
    const axis = cameraAxis(sample.rotation);
    if (!axis.ok) return axis;
    const altitude = directionApparentAltitudeRad(axis.value);
    if (!altitude.ok) return altitude;
    if (Math.abs(altitude.value) > COMPASS_ALTITUDE_LIMIT_RAD) return err('compass_unreliable');
    const screenAngleRad = sample.screenAngleRad;
    if (screenAngleRad === null) return err('compass_unreliable');
    const screenWrapped = wrapPi(screenAngleRad);
    if (!screenWrapped.ok || Math.abs(screenWrapped.value) > SCREEN_ANGLE_ZERO_TOLERANCE_RAD) {
      return err('compass_unreliable');
    }
    const azimuth = directionAzimuthRad(axis.value);
    if (!azimuth.ok) return azimuth;
    const difference = wrapPi((sample.magneticHeadingRad ?? Number.NaN) - azimuth.value);
    if (!difference.ok) return difference;
    differencesRad.push(difference.value);
  }
  const summary = summariseAzimuths(differencesRad);
  if (!summary.ok) return summary;
  const offset = wrapPi(summary.value.meanRad);
  if (!offset.ok) return offset;
  return ok({
    offsetRad: offset.value,
    sigmaRad: rss(summary.value.spreadRad, sigma.value),
    northReference: 'magnetic',
    frame: 'relative',
    establishedUtcMs: endUtcMs,
  });
}

export interface KnownAzimuthYawInput {
  readonly samples: readonly OrientationSample[];
  readonly frameResets: readonly FrameResetEvent[];
  readonly window: SightingWindow;
  /** The azimuth of the sighted direction, from `northReference`. */
  readonly knownAzimuthRad: number;
  /** Its 1-sigma. */
  readonly knownSigmaRad: number;
  readonly northReference: NorthReference;
  /** When the sighted direction is off the Camera axis (Req 3.5). */
  readonly rayOffset?: RayOffset;
}

/**
 * A Yaw reference from a known azimuth of the sighted direction (Req 5.2, §7.6): the samples of
 * the window must share one frame, which the reference records; the offset is
 * `wrapPi(known - m)`, with `m` the circular mean of the samples' azimuths in that frame.
 */
export function yawReferenceFromKnownAzimuth(
  input: KnownAzimuthYawInput,
): SensorResult<YawReference> {
  if (!Number.isFinite(input.knownAzimuthRad)) {
    return err('invalid_number', { field: 'knownAzimuthRad' });
  }
  const known = wrapTwoPi(input.knownAzimuthRad);
  if (!known.ok) return known;
  const knownSigma = checkSigma(input.knownSigmaRad, 'knownSigmaRad');
  if (!knownSigma.ok) return knownSigma;
  if (input.rayOffset !== undefined) {
    const offsetCheck = checkRayOffset(input.rayOffset);
    if (!offsetCheck.ok) return offsetCheck;
  }
  const selected = selectWindow(input.samples, input.window);
  if (!selected.ok) return selected;
  const first = selected.value[0];
  if (first === undefined) return err('insufficient_samples');
  const frame = first.frame;
  if (selected.value.some((sample) => sample.frame !== frame)) return err('frame_reset');
  const { endUtcMs } = input.window;
  if (
    resetBetween(input.frameResets, windowStartUtcMs(input.window), endUtcMs, (cause) =>
      invalidates(frame, cause),
    )
  ) {
    return err('frame_reset');
  }
  const azimuthsRad: number[] = [];
  for (const sample of selected.value) {
    const direction = rayDirection(sample.rotation, input.rayOffset);
    if (!direction.ok) return direction;
    const azimuth = directionAzimuthRad(direction.value);
    if (!azimuth.ok) return azimuth;
    azimuthsRad.push(azimuth.value);
  }
  const summary = summariseAzimuths(azimuthsRad);
  if (!summary.ok) return summary;
  const offset = wrapPi(known.value - summary.value.meanRad);
  if (!offset.ok) return offset;
  return ok({
    offsetRad: offset.value,
    sigmaRad: rss(knownSigma.value, summary.value.spreadRad),
    northReference: input.northReference,
    frame,
    establishedUtcMs: endUtcMs,
  });
}

/**
 * Applies a Yaw reference to an azimuth of its own frame: `wrapTwoPi(azimuth + offset)`, labelled
 * with the reference's North reference (Req 5.5). The caller passes an azimuth of `y.frame`; the
 * capture checks the frames before calling this (§7.9).
 */
export function applyYawReference(
  frameAzimuthRad: number,
  y: YawReference,
): SensorResult<ReferencedAzimuth> {
  if (!Number.isFinite(frameAzimuthRad)) return err('invalid_number', { field: 'frameAzimuthRad' });
  if (!Number.isFinite(y.offsetRad)) return err('invalid_number', { field: 'offsetRad' });
  const value = wrapTwoPi(frameAzimuthRad + y.offsetRad);
  if (!value.ok) return value;
  return y.northReference === 'true'
    ? ok({ northReference: 'true', azimuthRad: value.value })
    : ok({ northReference: 'magnetic', magneticAzimuthRad: value.value });
}
