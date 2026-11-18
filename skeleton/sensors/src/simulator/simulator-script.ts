// The Simulator's script (Req 12.3, design §6, §7.12): plain data that states the simulated world
// and the simulated phone. `checkScript` validates it; the Simulator refuses an invalid script
// with `invalid_number` naming the field.

import { isSupportedPosition, type Position } from '@alidade/core';
import type { FrameResetCause } from '../frame-reset';
import { err, ok, type SensorResult } from '../sensor-result';

/** The true camera direction at a time; linear in between, held before the first and after the last. */
export interface PoseKeyframe {
  readonly timeUtcMs: number;
  /** True azimuth. */
  readonly azimuthRad: number;
  /** In [-80°, 80°]. */
  readonly apparentAltitudeRad: number;
  readonly rollRad: number;
}

/**
 * The true camera direction at a moment, before noise, bias and frame are applied (Req 12.9):
 * what a user interface draws, and what `aim` sets (Req 12.10).
 */
export interface TruePose {
  /** True azimuth. */
  readonly azimuthRad: number;
  /** In [-80°, 80°]. */
  readonly apparentAltitudeRad: number;
  readonly rollRad: number;
}

export type PageResetCause = 'hidden' | 'blur' | 'pagehide';

export interface SimulatorScript {
  readonly startUtcMs: number;
  /** At least 1 ms. */
  readonly eventIntervalMs: number;
  /** At least one, in strictly increasing time. */
  readonly pose: readonly PoseKeyframe[];
  /** 1-sigma added to the azimuth, altitude and roll of each event. */
  readonly orientationNoiseSigmaRad: number;
  /** Added to the measured altitude (about -3.3° on the probe's iPhone). */
  readonly altitudeBiasRad: number;
  readonly frame:
    | {
        readonly kind: 'absolute';
        /** The error of the frame's magnetic north. */
        readonly northErrorRad: number;
        /** Page events; the Absolute frame's zero does not move (Req 5.17). */
        readonly resets: readonly { readonly timeUtcMs: number; readonly cause: PageResetCause }[];
      }
    | {
        readonly kind: 'relative';
        /** The true azimuth of the frame's zero. */
        readonly zeroRad: number;
        readonly resets: readonly {
          readonly timeUtcMs: number;
          readonly cause: FrameResetCause;
          readonly newZeroRad: number;
        }[];
      };
  /** `webkitCompassHeading` (Relative frame only), or `null`. */
  readonly heading: null | {
    readonly biasRad: number;
    readonly noiseSigmaRad: number;
    readonly jumps: readonly {
      readonly startUtcMs: number;
      readonly durationMs: number;
      readonly sizeRad: number;
    }[];
    /** `webkitCompassAccuracy`, for example a constant 10 as on the iPhone. */
    readonly reportedAccuracyDeg: number;
  };
  readonly screenAngleDeg: number | null;
  /**
   * The declination of the simulated world, |·| ≤ π: it turns the scripted true azimuths into the
   * magnetic headings and Absolute-frame azimuths the phone reports. An app that corrects them with
   * `declinationAt()` recovers the scripted true azimuth only if this value came from
   * `declinationAt()` at the scripted position and time; otherwise the difference shows up as a
   * north error of exactly `declinationAt − declinationRad`. The published WMM2025 rates of change
   * reach 1.38°/year outside the blackout zone (at 88°N), under 0.0002° an hour, so a value taken
   * at the script's start serves for a session.
   */
  readonly declinationRad: number;
  readonly position:
    | null
    | {
        readonly kind: 'fix';
        readonly position: Position;
        readonly reportedAccuracyM: number;
        readonly firstFixDelayMs: number;
        /** At least 1 ms. */
        readonly fixIntervalMs: number;
      }
    | {
        readonly kind: 'failure';
        readonly reason: 'permission_denied' | 'position_unavailable' | 'position_timeout';
      };
  readonly orientation: 'available' | 'missing';
  readonly orientationPermission: 'not_required' | 'granted' | 'denied';
  readonly secureContext: boolean;
}

/** The smallest event and fix interval: 1 ms, so that every advance delivers finitely many events. */
export const MIN_SIMULATOR_INTERVAL_MS = 1;
/** The largest apparent altitude of a pose, in a script or given to `aim`: 80°. */
export const MAX_POSE_ALTITUDE_RAD = 80 * (Math.PI / 180);
const RESET_CAUSES: readonly FrameResetCause[] = [
  'hidden',
  'blur',
  'pagehide',
  'restart',
  'frame_change',
];
const PAGE_CAUSES: readonly string[] = ['hidden', 'blur', 'pagehide'];

const bad = (field: string) => err('invalid_number', { field });
const finite = (value: number) => Number.isFinite(value);

/** Validates a pose given to `aim` (Req 12.10), naming the first invalid field. */
export function checkTruePose(pose: TruePose): SensorResult<TruePose> {
  if (!finite(pose.azimuthRad)) return bad('azimuthRad');
  if (!(
    finite(pose.apparentAltitudeRad) && Math.abs(pose.apparentAltitudeRad) <= MAX_POSE_ALTITUDE_RAD
  ))
    return bad('apparentAltitudeRad');
  if (!finite(pose.rollRad)) return bad('rollRad');
  return ok(pose);
}

/** Validates every field of a script (§7.12), naming the first invalid one. */
export function checkScript(script: SimulatorScript): SensorResult<SimulatorScript> {
  if (!finite(script.startUtcMs)) return bad('startUtcMs');
  if (!(finite(script.eventIntervalMs) && script.eventIntervalMs >= MIN_SIMULATOR_INTERVAL_MS)) {
    return bad('eventIntervalMs');
  }
  if (script.pose.length === 0) return bad('pose');
  let previousUtcMs = Number.NEGATIVE_INFINITY;
  for (const keyframe of script.pose) {
    const valid =
      finite(keyframe.timeUtcMs) &&
      keyframe.timeUtcMs > previousUtcMs &&
      finite(keyframe.azimuthRad) &&
      finite(keyframe.apparentAltitudeRad) &&
      Math.abs(keyframe.apparentAltitudeRad) <= MAX_POSE_ALTITUDE_RAD &&
      finite(keyframe.rollRad);
    if (!valid) return bad('pose');
    previousUtcMs = keyframe.timeUtcMs;
  }
  if (!(finite(script.orientationNoiseSigmaRad) && script.orientationNoiseSigmaRad >= 0)) {
    return bad('orientationNoiseSigmaRad');
  }
  if (!finite(script.altitudeBiasRad)) return bad('altitudeBiasRad');
  const frame = script.frame;
  if (frame.kind === 'absolute') {
    if (!finite(frame.northErrorRad)) return bad('northErrorRad');
    if (!frame.resets.every((r) => finite(r.timeUtcMs) && PAGE_CAUSES.includes(r.cause)))
      return bad('resets');
  } else {
    if (!finite(frame.zeroRad)) return bad('zeroRad');
    const valid = frame.resets.every(
      (r) => finite(r.timeUtcMs) && RESET_CAUSES.includes(r.cause) && finite(r.newZeroRad),
    );
    if (!valid) return bad('resets');
  }
  const heading = script.heading;
  if (heading !== null) {
    if (!finite(heading.biasRad)) return bad('heading.biasRad');
    if (!(finite(heading.noiseSigmaRad) && heading.noiseSigmaRad >= 0))
      return bad('heading.noiseSigmaRad');
    const jumpsValid = heading.jumps.every(
      (j) => finite(j.startUtcMs) && finite(j.durationMs) && j.durationMs >= 0 && finite(j.sizeRad),
    );
    if (!jumpsValid) return bad('heading.jumps');
    if (!finite(heading.reportedAccuracyDeg)) return bad('heading.reportedAccuracyDeg');
  }
  if (script.screenAngleDeg !== null && !finite(script.screenAngleDeg))
    return bad('screenAngleDeg');
  if (!(finite(script.declinationRad) && Math.abs(script.declinationRad) <= Math.PI))
    return bad('declinationRad');
  const position = script.position;
  if (position !== null && position.kind === 'fix') {
    if (!isSupportedPosition(position.position)) return bad('position.position');
    if (!(finite(position.reportedAccuracyM) && position.reportedAccuracyM >= 0)) {
      return bad('position.reportedAccuracyM');
    }
    if (!(finite(position.firstFixDelayMs) && position.firstFixDelayMs >= 0))
      return bad('position.firstFixDelayMs');
    if (!(finite(position.fixIntervalMs) && position.fixIntervalMs >= MIN_SIMULATOR_INTERVAL_MS)) {
      return bad('position.fixIntervalMs');
    }
  }
  return ok(script);
}
