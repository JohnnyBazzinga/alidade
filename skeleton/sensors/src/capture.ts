// Bearing and altitude captures (Req 8, 9; design §7.9, §7.10, D8, D9). A capture turns the
// Orientation samples of one Sighting window into one Core Bearing, or into one apparent altitude,
// each with its 1-sigma.

import { validateBearing, type Bearing } from '@alidade/core';
import { rss, summariseAltitudes, summariseAzimuths } from './circular-summary';
import { checkDeclination, type Declination } from './declination';
import type { AltitudeCalibration } from './defaults';
import { invalidates, type FrameResetEvent } from './frame-reset';
import type { OrientationFrame, OrientationSample } from './orientation-sample';
import { checkDurationMs, checkLimitM, checkSigma, checkTimeUtcMs } from './parameters';
import { checkPositionFix, type PositionFix } from './position-fix';
import { checkRayOffset, rayDirection, type RayOffset } from './ray';
import { directionApparentAltitudeRad, directionAzimuthRad } from './rotation';
import { err, ok, type SensorResult } from './sensor-result';
import {
  checkWindow,
  resetBetween,
  selectWindow,
  windowStartUtcMs,
  type SightingWindow,
} from './sighting-window';
import { applyYawReference, type YawReference } from './yaw-reference';

/** The smallest azimuth 1-sigma of a capture: 0.01°, the same expression as Core's limit. */
export const MIN_CAPTURE_SIGMA_RAD = 0.01 * (Math.PI / 180);
/** Above this azimuth 1-sigma a capture is `too_unsteady`: 45°, Core's largest accepted value. */
export const MAX_CAPTURE_SIGMA_RAD = 45 * (Math.PI / 180);

export interface BearingCaptureInput {
  /** The Bearing's id. */
  readonly id: string;
  /** The Bearing's time, milliseconds since the epoch, UTC. */
  readonly timeUtcMs: number;
  readonly samples: readonly OrientationSample[];
  readonly frameResets: readonly FrameResetEvent[];
  readonly window: SightingWindow;
  /** When the target is off the Camera axis (Req 3.5). */
  readonly rayOffset?: RayOffset;
  /** Required for Relative-frame samples; optional for Absolute-frame ones (Req 8.2). */
  readonly yawReference?: YawReference;
  readonly yawReferenceMaxAgeMs: number;
  /** The North-reference 1-sigma of an Absolute-frame capture without a Yaw reference (Req 8.3). */
  readonly headingSigmaRad: number;
  /** Required whenever the North reference is magnetic (Req 6.4, 8.2). */
  readonly declination?: Declination;
  readonly positionFix: PositionFix;
  readonly positionStalenessMs: number;
  readonly coarseLocationLimitM: number;
}

/** Validates every number of the input (step 1), naming the offending field (Req 10.3). */
function checkBearingInput(input: BearingCaptureInput): SensorResult<BearingCaptureInput> {
  const checks: SensorResult<unknown>[] = [
    checkWindow(input.window),
    checkDurationMs(input.yawReferenceMaxAgeMs, 'yawReferenceMaxAgeMs'),
    checkSigma(input.headingSigmaRad, 'headingSigmaRad'),
    checkDurationMs(input.positionStalenessMs, 'positionStalenessMs'),
    checkLimitM(input.coarseLocationLimitM, 'coarseLocationLimitM'),
    checkTimeUtcMs(input.timeUtcMs, 'timeUtcMs'),
  ];
  if (input.rayOffset !== undefined) checks.push(checkRayOffset(input.rayOffset));
  if (input.declination !== undefined) checks.push(checkDeclination(input.declination));
  const y = input.yawReference;
  if (y !== undefined) {
    checks.push(
      Number.isFinite(y.offsetRad) ? ok(y) : err('invalid_number', { field: 'yawOffsetRad' }),
      checkSigma(y.sigmaRad, 'yawSigmaRad'),
      checkTimeUtcMs(y.establishedUtcMs, 'establishedUtcMs'),
    );
  }
  for (const check of checks) if (!check.ok) return check;
  return ok(input);
}

/** The single frame of a non-empty window, or `frame_reset` if the samples mix frames (Req 8.8). */
function windowFrame(samples: readonly OrientationSample[]): SensorResult<OrientationFrame> {
  const first = samples[0];
  if (first === undefined) return err('insufficient_samples');
  return samples.every((sample) => sample.frame === first.frame)
    ? ok(first.frame)
    : err('frame_reset');
}

/**
 * Checks the Yaw reference against the window (step 5, D9): its frame must be the window's
 * (Req 5.18); no reset that invalidates it may lie between it and the window or in the window
 * (Req 5.11, 5.17); it must be no older than the limit (Req 5.12). A Relative window needs one
 * (Req 5.13).
 */
function checkYawReference(
  input: BearingCaptureInput,
  frame: OrientationFrame,
): SensorResult<YawReference | undefined> {
  const startUtcMs = windowStartUtcMs(input.window);
  const { endUtcMs } = input.window;
  const y = input.yawReference;
  if (y === undefined) {
    if (frame === 'absolute') return ok(undefined);
    if (resetBetween(input.frameResets, startUtcMs, endUtcMs)) return err('frame_reset');
    return err('no_yaw_reference');
  }
  if (y.frame !== frame) return err('frame_reset');
  const fromUtcMs = Math.min(y.establishedUtcMs, startUtcMs);
  const toUtcMs = Math.max(y.establishedUtcMs, endUtcMs);
  if (resetBetween(input.frameResets, fromUtcMs, toUtcMs, (cause) => invalidates(y.frame, cause))) {
    return err('frame_reset');
  }
  if (Math.abs(endUtcMs - y.establishedUtcMs) > input.yawReferenceMaxAgeMs) {
    return err('stale_yaw_reference');
  }
  return ok(y);
}

/**
 * One Bearing from the samples of a Sighting window (Req 8, §7.9). The steps run in a fixed order
 * and the first failure is returned (D8):
 *
 * 1. parameters; 2. the Position fix (stale, coarse); 3. the window (too few, stale samples);
 * 4. one frame; 5. the Yaw reference; 6. the North reference and Declination; 7. each sample's
 * true azimuth; 8. the circular mean and the Spread; 9. the 1-sigma; 10. Core's `validateBearing`.
 *
 * | Window   | Yaw reference        | Declination applied   | North-reference 1-sigma      |
 * | Relative | required, Relative   | if it is magnetic     | reference ⊕ declination      |
 * | Absolute | none                 | always                | Heading 1-sigma ⊕ declination |
 * | Absolute | Absolute, true       | never                 | reference                    |
 * | Absolute | Absolute, magnetic   | always                | reference ⊕ declination      |
 *
 * A Yaw reference of the other frame is `frame_reset`; it is never ignored (Req 5.18).
 */
export function captureBearing(input: BearingCaptureInput): SensorResult<Bearing> {
  const checked = checkBearingInput(input);
  if (!checked.ok) return checked;

  const fix = checkPositionFix(input.positionFix, {
    atUtcMs: input.window.endUtcMs,
    positionStalenessMs: input.positionStalenessMs,
    coarseLocationLimitM: input.coarseLocationLimitM,
  });
  if (!fix.ok) return fix;

  const selected = selectWindow(input.samples, input.window);
  if (!selected.ok) return selected;

  const frame = windowFrame(selected.value);
  if (!frame.ok) return frame;

  const reference = checkYawReference(input, frame.value);
  if (!reference.ok) return reference;
  const y = reference.value;

  const northReference = y === undefined ? 'magnetic' : y.northReference;
  const declination = northReference === 'magnetic' ? input.declination : undefined;
  if (northReference === 'magnetic' && declination === undefined) return err('declination_unknown');
  const declinationRad = declination?.declinationRad ?? 0;

  const trueAzimuthsRad: number[] = [];
  for (const sample of selected.value) {
    const direction = rayDirection(sample.rotation, input.rayOffset);
    if (!direction.ok) return direction;
    const frameAzimuth = directionAzimuthRad(direction.value);
    if (!frameAzimuth.ok) return frameAzimuth;
    let azimuthRad = frameAzimuth.value;
    if (y !== undefined) {
      const referenced = applyYawReference(azimuthRad, y);
      if (!referenced.ok) return referenced;
      azimuthRad =
        referenced.value.northReference === 'true'
          ? referenced.value.azimuthRad
          : referenced.value.magneticAzimuthRad;
    }
    // The magnetic azimuth plus the declination (Req 6.1); wrapped by the circular mean below.
    trueAzimuthsRad.push(azimuthRad + declinationRad);
  }

  const summary = summariseAzimuths(trueAzimuthsRad);
  if (!summary.ok) return summary.reason === 'undefined_mean' ? err('too_unsteady') : summary;

  const referenceSigmaRad = y === undefined ? input.headingSigmaRad : y.sigmaRad;
  const northSigmaRad =
    declination === undefined ? referenceSigmaRad : rss(referenceSigmaRad, declination.sigmaRad);
  const sigmaRad = Math.max(MIN_CAPTURE_SIGMA_RAD, rss(summary.value.spreadRad, northSigmaRad));
  if (!(sigmaRad <= MAX_CAPTURE_SIGMA_RAD)) return err('too_unsteady');

  const bearing: Bearing = {
    id: input.id,
    observer: fix.value.position,
    positionAccuracyM: fix.value.sigmaM,
    timeUtcMs: input.timeUtcMs,
    azimuthRad: summary.value.meanRad,
    azimuthSigmaRad: sigmaRad,
  };
  const valid = validateBearing(bearing);
  return valid.ok ? ok(bearing) : valid;
}

export interface AltitudeCaptureInput {
  readonly samples: readonly OrientationSample[];
  readonly window: SightingWindow;
  /** Required (Req 9.2): `UNCALIBRATED_ALTITUDE` until a calibration is measured. */
  readonly calibration: AltitudeCalibration;
  readonly rayOffset?: RayOffset;
}

export interface AltitudeCapture {
  readonly apparentAltitudeRad: number;
  /** `rss(sampleStdDevRad, calibration.sigmaRad)` (Req 9.3). */
  readonly sigmaRad: number;
  /** The standard deviation of the samples' altitudes, over n (D19). */
  readonly sampleStdDevRad: number;
  readonly calibration: AltitudeCalibration;
  readonly sampleCount: number;
}

/**
 * One apparent altitude from the samples of a Sighting window (Req 9, §7.10): the arithmetic mean
 * of the samples' altitudes plus the calibration offset, with the 1-sigma of Req 9.3. The frame and
 * Frame resets do not matter here: the zero of `alpha` does not change `up`.
 */
export function captureAltitude(input: AltitudeCaptureInput): SensorResult<AltitudeCapture> {
  const checkedWindow = checkWindow(input.window);
  if (!checkedWindow.ok) return checkedWindow;
  if (input.rayOffset !== undefined) {
    const offset = checkRayOffset(input.rayOffset);
    if (!offset.ok) return offset;
  }
  const { calibration } = input;
  if (!Number.isFinite(calibration.offsetRad)) {
    return err('invalid_number', { field: 'calibrationOffsetRad' });
  }
  const calibrationSigma = checkSigma(calibration.sigmaRad, 'calibrationSigmaRad');
  if (!calibrationSigma.ok) return calibrationSigma;

  const selected = selectWindow(input.samples, input.window);
  if (!selected.ok) return selected;

  const altitudesRad: number[] = [];
  for (const sample of selected.value) {
    const direction = rayDirection(sample.rotation, input.rayOffset);
    if (!direction.ok) return direction;
    const altitude = directionApparentAltitudeRad(direction.value);
    if (!altitude.ok) return altitude;
    altitudesRad.push(altitude.value);
  }
  const summary = summariseAltitudes(altitudesRad);
  if (!summary.ok) return summary;

  const apparentAltitudeRad = summary.value.meanRad + calibration.offsetRad;
  if (!(Math.abs(apparentAltitudeRad) <= Math.PI / 2)) return err('invalid_altitude');
  const sigmaRad = rss(summary.value.stdDevRad, calibration.sigmaRad);
  if (!Number.isFinite(sigmaRad)) return err('invalid_number', { field: 'calibrationSigmaRad' });
  return ok({
    apparentAltitudeRad,
    sigmaRad,
    sampleStdDevRad: summary.value.stdDevRad,
    calibration: { offsetRad: calibration.offsetRad, sigmaRad: calibration.sigmaRad },
    sampleCount: selected.value.length,
  });
}
