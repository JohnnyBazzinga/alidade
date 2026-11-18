// The Simulator source (Req 12, design §7.12, D16 to D18, D21, D22): a Sensor source driven by a
// script and a seed on a simulated clock that the caller advances. Its raw events go through the
// same `orientationSampleFromEvent` as the browser's (Req 12.2). It reads no clock, no randomness
// but its own seeded stream, and no browser API.

import { degToRad, radToDeg, wrapPi, wrapTwoPi } from '@alidade/core';
import type { DeviceRotation } from '../rotation';
import type { FrameResetEvent } from '../frame-reset';
import { ListenerSet } from '../listener-set';
import {
  orientationSampleFromEvent,
  type OrientationFrame,
  type OrientationSample,
  type RawOrientationEvent,
} from '../orientation-sample';
import { PendingStarts } from '../pending-starts';
import { positionFixFromReading, type PositionFix } from '../position-fix';
import { err, ok, type SensorResult } from '../sensor-result';
import { checkSourceOptions, type SensorSource, type SensorSourceOptions } from '../sensor-source';
import { eulerDegreesFromRotation, rotationFromDirection } from './direction-to-rotation';
import { createSeededRandom } from './seeded-random';
import {
  checkScript,
  checkTruePose,
  type PoseKeyframe,
  type SimulatorScript,
  type TruePose,
} from './simulator-script';

/** The longest single advance: one hour, so that one call delivers at most 3.6 million events. */
export const MAX_SIMULATOR_ADVANCE_MS = 3_600_000;
const TWO_POW_32 = 2 ** 32;

export interface SimulatorControls {
  /** Delivers every scheduled event up to `timeUtcMs`, in time order; never goes backwards. */
  advanceTo(timeUtcMs: number): SensorResult<void>;
  /**
   * The true camera direction at the current simulated time, before noise, bias and frame are
   * applied (Req 12.9): the aimed pose when one was given, else the script's.
   */
  truePose(): TruePose;
  /**
   * The true Device rotation at the current simulated time (Req 12.12): what a noise-free sensor
   * with a frame of true north and no altitude bias would report for `truePose()`, by the same
   * conversion as the events, so that the Off-axis rays under it and under the next noise-free
   * sample agree (Req 12.13). Fails with `invalid_number` only if the pose is not finite, which
   * a validated script and `aim` rule out.
   */
  trueRotation(): SensorResult<DeviceRotation>;
  /**
   * From the current simulated time on, the true camera direction is `pose`, in place of the
   * script's, until it is aimed again (Req 12.10). Draws no random number. Fails with
   * `invalid_number` naming the field, and changes nothing, for a value that is not finite or an
   * altitude beyond ±80°.
   */
  aim(pose: TruePose): SensorResult<void>;
}

/** `wrapPi` of a finite angle. */
function wrappedPi(angleRad: number): number {
  const wrapped = wrapPi(angleRad);
  return wrapped.ok ? wrapped.value : 0;
}

function wrappedTwoPi(angleRad: number): number {
  const wrapped = wrapTwoPi(angleRad);
  return wrapped.ok ? wrapped.value : 0;
}

/** The scripted pose at `t`: held outside the keyframes, linear between them (§7.12). */
function poseAt(pose: readonly PoseKeyframe[], timeUtcMs: number): PoseKeyframe {
  const first = pose[0];
  const last = pose[pose.length - 1];
  // `checkScript` guarantees at least one keyframe; the fallback keeps the function total.
  if (first === undefined || last === undefined) {
    return { timeUtcMs, azimuthRad: 0, apparentAltitudeRad: 0, rollRad: 0 };
  }
  if (timeUtcMs <= first.timeUtcMs) return first;
  if (timeUtcMs >= last.timeUtcMs) return last;
  for (let i = 1; i < pose.length; i += 1) {
    const b = pose[i];
    const a = pose[i - 1];
    if (a === undefined || b === undefined || timeUtcMs > b.timeUtcMs) continue;
    const s = (timeUtcMs - a.timeUtcMs) / (b.timeUtcMs - a.timeUtcMs);
    return {
      timeUtcMs,
      azimuthRad: a.azimuthRad + s * wrappedPi(b.azimuthRad - a.azimuthRad),
      apparentAltitudeRad:
        a.apparentAltitudeRad + s * (b.apparentAltitudeRad - a.apparentAltitudeRad),
      rollRad: a.rollRad + s * (b.rollRad - a.rollRad),
    };
  }
  return last;
}

function degrees(angleRad: number): number {
  const converted = radToDeg(angleRad);
  return converted.ok ? converted.value : Number.NaN;
}

/**
 * A Simulator source from a script and a seed (an integer in [0, 2³²)) (Req 12.1 to 12.4). The
 * source is a plain `SensorSource`; the controls that drive the simulation are a separate object.
 * Fails with `invalid_number` naming the first invalid field.
 */
export function createSimulator(
  script: SimulatorScript,
  seed: number,
  options: SensorSourceOptions,
): SensorResult<{ source: SensorSource; controls: SimulatorControls }> {
  const checkedScript = checkScript(script);
  if (!checkedScript.ok) return checkedScript;
  if (!(Number.isInteger(seed) && seed >= 0 && seed < TWO_POW_32))
    return err('invalid_number', { field: 'seed' });
  const checkedOptions = checkSourceOptions(options);
  if (!checkedOptions.ok) return checkedOptions;

  const random = createSeededRandom(seed);
  const orientationListeners = new ListenerSet<SensorResult<OrientationSample>>(
    options.onListenerError,
  );
  const resetListeners = new ListenerSet<FrameResetEvent>(options.onListenerError);
  const positionListeners = new ListenerSet<SensorResult<PositionFix>>(options.onListenerError);
  const orientationStarts = new PendingStarts<SensorResult<OrientationFrame>>();
  const positionStarts = new PendingStarts<SensorResult<PositionFix>>();

  const frame = script.frame;
  const resets = [...frame.resets].sort((a, b) => a.timeUtcMs - b.timeUtcMs);

  let nowUtcMs = script.startUtcMs;
  // The pose given to `aim`, or null while the script's pose is in force. Every event not yet
  // delivered lies at or after the current time, so one aimed pose replaces the script's.
  let aimedPose: TruePose | null = null;
  const truePoseAt = (timeUtcMs: number): TruePose => {
    if (aimedPose !== null) return aimedPose;
    const scripted = poseAt(script.pose, timeUtcMs);
    return {
      azimuthRad: scripted.azimuthRad,
      apparentAltitudeRad: scripted.apparentAltitudeRad,
      rollRad: scripted.rollRad,
    };
  };
  let permissionGranted = false;
  let orientationStarted = false;
  let orientationEverStopped = false;
  let nextOrientationUtcMs: number | null = null;
  let nextResetIndex = resets.findIndex((r) => r.timeUtcMs > nowUtcMs);
  if (nextResetIndex < 0) nextResetIndex = resets.length;
  let positionStarted = false;
  let nextPositionUtcMs: number | null = null;

  const eventsFlow = (): boolean =>
    script.orientationPermission === 'not_required' || permissionGranted;

  /** The Relative frame's zero at `t`: the new zero of the latest reset at or before `t`. */
  const zeroAt = (timeUtcMs: number): number => {
    if (frame.kind !== 'relative') return 0;
    let zero = frame.zeroRad;
    let zeroSetUtcMs = Number.NEGATIVE_INFINITY;
    for (const reset of frame.resets) {
      // Later resets win; of resets at the same time, the last listed wins.
      if (reset.timeUtcMs <= timeUtcMs && reset.timeUtcMs >= zeroSetUtcMs) {
        zero = reset.newZeroRad;
        zeroSetUtcMs = reset.timeUtcMs;
      }
    }
    return zero;
  };

  const headingJumpAt = (timeUtcMs: number): number => {
    if (script.heading === null) return 0;
    let total = 0;
    for (const jump of script.heading.jumps) {
      if (timeUtcMs >= jump.startUtcMs && timeUtcMs < jump.startUtcMs + jump.durationMs)
        total += jump.sizeRad;
    }
    return total;
  };

  /** One orientation event at `t` (§7.12), the noise drawn in a fixed order. */
  const orientationEventAt = (timeUtcMs: number): SensorResult<OrientationSample> => {
    const sigma = script.orientationNoiseSigmaRad;
    const pose = truePoseAt(timeUtcMs);
    const azimuthRad = pose.azimuthRad + sigma * random.normal();
    const altitudeRad = pose.apparentAltitudeRad + sigma * random.normal();
    const rollRad = pose.rollRad + sigma * random.normal();
    const headingNoise = random.normal();
    const measuredAltitudeRad = altitudeRad + script.altitudeBiasRad;
    const frameAzimuthRad =
      frame.kind === 'absolute'
        ? wrappedTwoPi(azimuthRad - script.declinationRad + frame.northErrorRad)
        : wrappedTwoPi(azimuthRad - zeroAt(timeUtcMs));
    const rotation = rotationFromDirection(frameAzimuthRad, measuredAltitudeRad, rollRad);
    if (!rotation.ok) return rotation;
    const angles = eulerDegreesFromRotation(rotation.value);
    const heading = script.heading;
    const headingRad =
      frame.kind === 'relative' && heading !== null
        ? wrappedTwoPi(
            azimuthRad -
              script.declinationRad +
              heading.biasRad +
              heading.noiseSigmaRad * headingNoise +
              headingJumpAt(timeUtcMs),
          )
        : null;
    const raw: RawOrientationEvent = {
      type: frame.kind === 'absolute' ? 'deviceorientationabsolute' : 'deviceorientation',
      alphaDeg: angles.alphaDeg,
      betaDeg: angles.betaDeg,
      gammaDeg: angles.gammaDeg,
      absolute: frame.kind === 'absolute',
      webkitCompassHeadingDeg: headingRad === null ? null : degrees(headingRad),
      webkitCompassAccuracyDeg:
        headingRad === null || heading === null ? null : heading.reportedAccuracyDeg,
    };
    return orientationSampleFromEvent(raw, timeUtcMs, script.screenAngleDeg);
  };

  const positionAt = (timeUtcMs: number): SensorResult<PositionFix> => {
    const position = script.position;
    if (position === null) return err('sensor_unavailable');
    if (position.kind === 'failure') return err(position.reason);
    return positionFixFromReading(
      {
        latitudeDeg: degrees(position.position.latRad),
        longitudeDeg: degrees(position.position.lonRad),
        accuracyM: position.reportedAccuracyM,
      },
      timeUtcMs,
      options.positionConfidenceScale,
    );
  };

  /**
   * The next time on a schedule, or `null` when the step is lost to rounding (times beyond about
   * 1e17 ms, or near `Number.MAX_VALUE`): the schedule then ends, so that `advanceTo` always
   * terminates (Req 11.8).
   */
  const after = (timeUtcMs: number, stepMs: number): number | null => {
    const next = timeUtcMs + stepMs;
    return Number.isFinite(next) && next > timeUtcMs ? next : null;
  };

  /** The first event time at or after `t` on the grid `startUtcMs + k · interval`. */
  const firstOrientationAtOrAfter = (timeUtcMs: number): number | null => {
    const k = Math.max(0, Math.ceil((timeUtcMs - script.startUtcMs) / script.eventIntervalMs));
    const first = script.startUtcMs + k * script.eventIntervalMs;
    return Number.isFinite(first) ? first : null;
  };

  // --- The event loop of advanceTo -----------------------------------------------------------

  type Next = { readonly timeUtcMs: number; readonly order: number; readonly run: () => void };

  const nextEvent = (): Next | undefined => {
    const candidates: Next[] = [];
    const reset = resets[nextResetIndex];
    if (reset !== undefined) {
      candidates.push({
        timeUtcMs: reset.timeUtcMs,
        order: 0,
        run: () => {
          nextResetIndex += 1;
          if (orientationStarted)
            resetListeners.deliver({ timeUtcMs: reset.timeUtcMs, cause: reset.cause });
        },
      });
    }
    if (nextOrientationUtcMs !== null) {
      const at = nextOrientationUtcMs;
      candidates.push({
        timeUtcMs: at,
        order: 1,
        run: () => {
          nextOrientationUtcMs = after(at, script.eventIntervalMs);
          const sample = orientationEventAt(at);
          orientationListeners.deliver(sample);
          if (sample.ok) orientationStarts.settleAll(ok(sample.value.frame));
        },
      });
    }
    if (nextPositionUtcMs !== null) {
      const at = nextPositionUtcMs;
      const position = script.position;
      candidates.push({
        timeUtcMs: at,
        order: 2,
        run: () => {
          if (position !== null && position.kind === 'fix') {
            nextPositionUtcMs = after(at, position.fixIntervalMs);
          } else {
            nextPositionUtcMs = null;
          }
          const result = positionAt(at);
          positionListeners.deliver(result);
          positionStarts.settleAll(result);
          if (!result.ok && result.reason === 'permission_denied') positionStarted = false;
        },
      });
    }
    const orientationDeadline = orientationStarts.nextDeadlineUtcMs();
    if (orientationDeadline !== undefined) {
      candidates.push({
        timeUtcMs: orientationDeadline,
        order: 3,
        run: () =>
          orientationStarts.settleExpired(
            orientationDeadline,
            script.orientationPermission !== 'not_required' && !permissionGranted
              ? err('permission_required')
              : err('sensor_unavailable'),
          ),
      });
    }
    const positionDeadline = positionStarts.nextDeadlineUtcMs();
    if (positionDeadline !== undefined) {
      candidates.push({
        timeUtcMs: positionDeadline,
        order: 4,
        run: () => positionStarts.settleExpired(positionDeadline, err('position_timeout')),
      });
    }
    let best: Next | undefined;
    for (const candidate of candidates) {
      if (
        best === undefined ||
        candidate.timeUtcMs < best.timeUtcMs ||
        (candidate.timeUtcMs === best.timeUtcMs && candidate.order < best.order)
      ) {
        best = candidate;
      }
    }
    return best;
  };

  const advanceTo = (timeUtcMs: number): SensorResult<void> => {
    if (
      !Number.isFinite(timeUtcMs) ||
      timeUtcMs < nowUtcMs ||
      timeUtcMs - nowUtcMs > MAX_SIMULATOR_ADVANCE_MS
    ) {
      return err('invalid_number', { field: 'timeUtcMs' });
    }
    for (;;) {
      const next = nextEvent();
      if (next === undefined || next.timeUtcMs > timeUtcMs) break;
      nowUtcMs = Math.max(nowUtcMs, next.timeUtcMs);
      next.run();
    }
    // A listener may have advanced the clock further during delivery (a re-entrant call): keep the
    // later time, so the clock never goes backwards (Req 12.2).
    nowUtcMs = Math.max(nowUtcMs, timeUtcMs);
    return ok(undefined);
  };

  // --- The source ----------------------------------------------------------------------------

  const startOrientation = (): Promise<SensorResult<OrientationFrame>> => {
    if (!script.secureContext) return Promise.resolve(err('insecure_context'));
    if (script.orientation === 'missing') return Promise.resolve(err('sensor_unavailable'));
    const pending = orientationStarts.add(nowUtcMs + options.listeningTimeoutMs);
    if (orientationStarted) return pending;
    if (orientationEverStopped) resetListeners.deliver({ timeUtcMs: nowUtcMs, cause: 'restart' });
    orientationStarted = true;
    nextOrientationUtcMs = eventsFlow() ? firstOrientationAtOrAfter(nowUtcMs) : null;
    return pending;
  };

  const startPosition = (): Promise<SensorResult<PositionFix>> => {
    if (!script.secureContext) return Promise.resolve(err('insecure_context'));
    if (script.position === null) return Promise.resolve(err('sensor_unavailable'));
    const pending = positionStarts.add(nowUtcMs + options.positionTimeoutMs);
    if (positionStarted) return pending;
    positionStarted = true;
    const position = script.position;
    if (position.kind === 'fix') nextPositionUtcMs = nowUtcMs + position.firstFixDelayMs;
    // A scripted failure is reported on every first start, as a browser answers each new watch.
    else nextPositionUtcMs = nowUtcMs;
    return pending;
  };

  const requestOrientationPermission = (): Promise<SensorResult<'granted' | 'not_required'>> => {
    if (!script.secureContext) return Promise.resolve(err('insecure_context'));
    if (script.orientationPermission === 'not_required') return Promise.resolve(ok('not_required'));
    if (script.orientationPermission === 'denied') return Promise.resolve(err('permission_denied'));
    permissionGranted = true;
    if (orientationStarted && nextOrientationUtcMs === null)
      nextOrientationUtcMs = firstOrientationAtOrAfter(nowUtcMs);
    return Promise.resolve(ok('granted'));
  };

  const stop = (): void => {
    if (orientationStarted) orientationEverStopped = true;
    orientationStarted = false;
    nextOrientationUtcMs = null;
    positionStarted = false;
    nextPositionUtcMs = null;
    orientationStarts.settleAll(err('sensor_unavailable'));
    positionStarts.settleAll(err('sensor_unavailable'));
  };

  const source: SensorSource = {
    now: () => nowUtcMs,
    requestOrientationPermission,
    startOrientation,
    startPosition,
    stop,
    onOrientation: (listener) => orientationListeners.add(listener),
    onFrameReset: (listener) => resetListeners.add(listener),
    onPosition: (listener) => positionListeners.add(listener),
  };
  const truePose = (): TruePose => ({ ...truePoseAt(nowUtcMs) });

  const trueRotation = (): SensorResult<DeviceRotation> => {
    const pose = truePoseAt(nowUtcMs);
    const rotation = rotationFromDirection(
      wrappedTwoPi(pose.azimuthRad),
      pose.apparentAltitudeRad,
      pose.rollRad,
    );
    if (!rotation.ok) return rotation;
    // The events go through degrees (the W3C unit) and back in `orientationSampleFromEvent`; the
    // true rotation takes the same path, so that it equals a noise-free sample's rotation.
    const angles = eulerDegreesFromRotation(rotation.value);
    const alphaRad = degToRad(angles.alphaDeg);
    const betaRad = degToRad(angles.betaDeg);
    const gammaRad = degToRad(angles.gammaDeg);
    if (!alphaRad.ok) return alphaRad;
    if (!betaRad.ok) return betaRad;
    if (!gammaRad.ok) return gammaRad;
    return ok({ alphaRad: alphaRad.value, betaRad: betaRad.value, gammaRad: gammaRad.value });
  };

  const aim = (pose: TruePose): SensorResult<void> => {
    const checked = checkTruePose(pose);
    if (!checked.ok) return checked;
    aimedPose = {
      azimuthRad: pose.azimuthRad,
      apparentAltitudeRad: pose.apparentAltitudeRad,
      rollRad: pose.rollRad,
    };
    return ok(undefined);
  };

  return ok({ source, controls: { advanceTo, truePose, trueRotation, aim } });
}
