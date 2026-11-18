// Orientation samples (Req 4, design §7.3, D6). One function turns a plain copy of a browser
// orientation event into the Math layer's sample. The browser Adapter and the Simulator both use
// it, so a simulated sample goes through exactly the code a real one does.

import { degToRad, wrapTwoPi } from '@alidade/core';
import { checkRotation, type DeviceRotation } from './rotation';
import { err, ok, type SensorResult } from './sensor-result';

/** The frame of a sample: north-referenced (magnetic), or with an arbitrary zero. */
export type OrientationFrame = 'absolute' | 'relative';

/** A plain copy of one W3C `DeviceOrientationEvent`, in degrees as the browser gives them. */
export interface RawOrientationEvent {
  readonly type: 'deviceorientation' | 'deviceorientationabsolute';
  readonly alphaDeg: number | null;
  readonly betaDeg: number | null;
  readonly gammaDeg: number | null;
  readonly absolute: boolean;
  /** iOS only: the magnetic heading of the rear camera direction with the phone upright. */
  readonly webkitCompassHeadingDeg: number | null;
  /** iOS only: recorded, never used as a 1-sigma; a negative value marks the heading invalid. */
  readonly webkitCompassAccuracyDeg: number | null;
}

/** The Math layer's record of one orientation reading. */
export interface OrientationSample {
  /** When the Adapter received the event, from its injected Clock (Req 1.4). */
  readonly timeUtcMs: number;
  readonly frame: OrientationFrame;
  /** The full Device rotation, kept so that Off-axis rays can be computed later (Req 3.4). */
  readonly rotation: DeviceRotation;
  /** `screen.orientation.angle` in [0, 2π), or `null` when not available (Req 4.9). */
  readonly screenAngleRad: number | null;
  /** `webkitCompassHeading` in [0, 2π), or `null` (Req 4.5). */
  readonly magneticHeadingRad: number | null;
  /** `webkitCompassAccuracy` in radians, sign kept, or `null` (Req 4.5, 5.8). */
  readonly compassAccuracyRad: number | null;
}

/** Converts browser degrees to radians with Core's `degToRad` (Req 1.7). */
function toRad(valueDeg: number, field: string): SensorResult<number> {
  const converted = degToRad(valueDeg);
  return converted.ok ? converted : err('invalid_number', { field });
}

/** An optional browser angle: finite gives radians wrapped to [0, 2π), anything else `null`. */
function optionalWrappedRad(valueDeg: number | null): number | null {
  if (valueDeg === null || !Number.isFinite(valueDeg)) return null;
  const converted = degToRad(valueDeg);
  if (!converted.ok) return null;
  const wrapped = wrapTwoPi(converted.value);
  return wrapped.ok ? wrapped.value : null;
}

/**
 * Turns a Raw orientation event into an Orientation sample (§7.3).
 *
 * - A `null` Euler angle (the browser has no sensor, or sends a placeholder event): fails with
 *   `sensor_unavailable` naming it (Req 2.5).
 * - A non-finite angle or time: `invalid_number` naming it (Req 2.6).
 * - The frame comes from the event alone: `deviceorientationabsolute`, or `absolute === true`,
 *   is Absolute; anything else, including a truthy non-boolean `absolute`, is Relative (Req 4.3).
 * - Angles outside the W3C ranges are accepted: the rotation formulas hold for any angle.
 * - The heading, its accuracy and the Screen angle are optional and never fail the sample.
 */
export function orientationSampleFromEvent(
  raw: RawOrientationEvent,
  timeUtcMs: number,
  screenAngleDeg: number | null,
): SensorResult<OrientationSample> {
  for (const field of ['alphaDeg', 'betaDeg', 'gammaDeg'] as const) {
    if (raw[field] === null) return err('sensor_unavailable', { field });
  }
  if (!Number.isFinite(timeUtcMs)) return err('invalid_number', { field: 'timeUtcMs' });
  const alpha = toRad(raw.alphaDeg ?? Number.NaN, 'alphaDeg');
  if (!alpha.ok) return alpha;
  const beta = toRad(raw.betaDeg ?? Number.NaN, 'betaDeg');
  if (!beta.ok) return beta;
  const gamma = toRad(raw.gammaDeg ?? Number.NaN, 'gammaDeg');
  if (!gamma.ok) return gamma;

  const accuracyDeg = raw.webkitCompassAccuracyDeg;
  let compassAccuracyRad: number | null = null;
  if (accuracyDeg !== null && Number.isFinite(accuracyDeg)) {
    const converted = degToRad(accuracyDeg);
    if (converted.ok) compassAccuracyRad = converted.value;
  }

  return ok({
    timeUtcMs,
    // `=== true`: the field comes from an untrusted event, and only a real `true` counts.
    frame:
      raw.type === 'deviceorientationabsolute' || raw.absolute === true ? 'absolute' : 'relative',
    rotation: { alphaRad: alpha.value, betaRad: beta.value, gammaRad: gamma.value },
    screenAngleRad: optionalWrappedRad(screenAngleDeg),
    magneticHeadingRad: optionalWrappedRad(raw.webkitCompassHeadingDeg),
    compassAccuracyRad,
  });
}

/**
 * Whether a sample is valid in itself (Req 14.4, 11.8; D20): a finite time, finite rotation angles
 * (the same `checkRotation` the captures apply through `cameraAxis` and `rayDirection`), and a
 * Screen angle, Magnetic heading and Reported compass accuracy that are each `null` or finite.
 * Fails with `invalid_number` naming the first invalid field. A negative compass accuracy is valid:
 * it only marks the heading as unusable (Req 5.8). Internal; the Sample history uses it.
 */
export function checkSampleValid(sample: OrientationSample): SensorResult<OrientationSample> {
  if (!Number.isFinite(sample.timeUtcMs)) return err('invalid_number', { field: 'timeUtcMs' });
  const rotation = checkRotation(sample.rotation);
  if (!rotation.ok) return rotation;
  for (const field of ['screenAngleRad', 'magneticHeadingRad', 'compassAccuracyRad'] as const) {
    const value = sample[field];
    if (value !== null && !Number.isFinite(value)) return err('invalid_number', { field });
  }
  return ok(sample);
}
