// The browser Adapter (Req 4, 7, 11; design §7.11, D7, D13, D14, D21, D22). It reaches the browser
// only through a `BrowserEnvironment` and the time only through the injected Clock, turns every
// browser callback into plain data, and never throws: a call into the environment that throws is
// reported as `sensor_unavailable` (D20).

import type { FrameResetCause, FrameResetEvent } from '../frame-reset';
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
import type { BrowserEnvironment, WindowEventType } from './browser-environment';

/** A property of an untrusted value, or `undefined`. */
function read(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

/** A finite number from an untrusted field, else `null`. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** An Euler angle from an untrusted field: a number (even non-finite, which the sample refuses) or `null`. */
function angleOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/** A plain copy of a `DeviceOrientationEvent` (§7.11 step 7). Only a real `true` is absolute. */
function copyOrientationEvent(
  event: unknown,
  type: RawOrientationEvent['type'],
): RawOrientationEvent {
  return {
    type,
    alphaDeg: angleOrNull(read(event, 'alpha')),
    betaDeg: angleOrNull(read(event, 'beta')),
    gammaDeg: angleOrNull(read(event, 'gamma')),
    absolute: read(event, 'absolute') === true,
    webkitCompassHeadingDeg: numberOrNull(read(event, 'webkitCompassHeading')),
    webkitCompassAccuracyDeg: numberOrNull(read(event, 'webkitCompassAccuracy')),
  };
}

/** A plain copy of a `GeolocationPosition`'s coordinates; anything not a number becomes `NaN`. */
function copyReading(position: unknown): {
  latitudeDeg: number;
  longitudeDeg: number;
  accuracyM: number;
} {
  const coords = read(position, 'coords');
  const value = (key: string) => {
    const field = read(coords, key);
    return typeof field === 'number' ? field : Number.NaN;
  };
  return {
    latitudeDeg: value('latitude'),
    longitudeDeg: value('longitude'),
    accuracyM: value('accuracy'),
  };
}

/** The reason for a geolocation error code (Req 7.6). */
function positionErrorReason(
  error: unknown,
): 'permission_denied' | 'position_unavailable' | 'position_timeout' {
  const code = read(error, 'code');
  if (code === 1) return 'permission_denied';
  if (code === 3) return 'position_timeout';
  return 'position_unavailable';
}

/** Runs `action`; a throw becomes `false` (D20). */
function attempt(action: () => void): boolean {
  try {
    action();
    return true;
  } catch {
    return false;
  }
}

/**
 * A Sensor source on a browser (§7.11). Validates the options (Req 10.3); the source it returns
 * reads the browser only through `environment` and the time only through `clock`.
 */
export function createBrowserSensorSource(
  environment: BrowserEnvironment,
  clock: () => number,
  options: SensorSourceOptions,
): SensorResult<SensorSource> {
  const checked = checkSourceOptions(options);
  if (!checked.ok) return checked;
  const env = environment;

  const orientationListeners = new ListenerSet<SensorResult<OrientationSample>>(
    options.onListenerError,
  );
  const resetListeners = new ListenerSet<FrameResetEvent>(options.onListenerError);
  const positionListeners = new ListenerSet<SensorResult<PositionFix>>(options.onListenerError);

  const orientationStarts = new PendingStarts<SensorResult<OrientationFrame>>();
  const positionStarts = new PendingStarts<SensorResult<PositionFix>>();

  let permissionGranted = false;
  let orientationStarted = false;
  let orientationEverStopped = false;
  let lastFrame: OrientationFrame | null = null;
  let orientationTimer: { handle: unknown } | null = null;
  let positionTimer: { handle: unknown } | null = null;
  let positionStarted = false;
  let watchId: unknown = undefined;
  const added: { type: WindowEventType; listener: (event: unknown) => void }[] = [];
  let visibilityListener: (() => void) | null = null;

  /** The Clock, or `undefined` if it throws or is not finite. Remembers the last good value. */
  let lastGoodUtcMs = Number.NaN;
  const now = (): number | undefined => {
    try {
      const value = clock();
      if (!Number.isFinite(value)) return undefined;
      lastGoodUtcMs = value;
      return value;
    } catch {
      return undefined;
    }
  };
  // The Clock is read once here: a source whose Clock does not work cannot stamp its data.
  if (now() === undefined) return err('sensor_unavailable', { field: 'clock' });

  const emitReset = (cause: FrameResetCause): void => {
    const timeUtcMs = now();
    if (timeUtcMs !== undefined) resetListeners.deliver({ timeUtcMs, cause });
  };

  // --- Timers: one per kind, set for the earliest deadline of its waiting starts (D21) ----------

  const clearOrientationTimer = (): void => {
    if (orientationTimer !== null) attempt(() => env.clearTimer(orientationTimer?.handle));
    orientationTimer = null;
  };

  const clearPositionTimer = (): void => {
    if (positionTimer !== null) attempt(() => env.clearTimer(positionTimer?.handle));
    positionTimer = null;
  };

  const orientationTimeoutFailure = (): SensorResult<OrientationFrame> =>
    readPermissionFunction() !== null && !permissionGranted
      ? err('permission_required')
      : err('sensor_unavailable');

  const readPermissionFunction = (): (() => Promise<unknown>) | null => {
    try {
      return env.requestOrientationPermission;
    } catch {
      return null;
    }
  };

  const armOrientationTimer = (): void => {
    if (orientationTimer !== null) return;
    const next = orientationStarts.nextDeadlineUtcMs();
    const current = now();
    if (next === undefined || current === undefined) return;
    const timer: { handle: unknown } = { handle: undefined };
    const set = attempt(() => {
      timer.handle = env.setTimer(onOrientationTimer, Math.max(0, next - current));
    });
    if (set) orientationTimer = timer;
    else orientationStarts.settleAll(err('sensor_unavailable'));
  };

  function onOrientationTimer(): void {
    orientationTimer = null;
    const current = now();
    if (current === undefined) {
      orientationStarts.settleAll(err('sensor_unavailable'));
      return;
    }
    orientationStarts.settleExpired(current, orientationTimeoutFailure());
    armOrientationTimer();
  }

  const armPositionTimer = (): void => {
    if (positionTimer !== null) return;
    const next = positionStarts.nextDeadlineUtcMs();
    const current = now();
    if (next === undefined || current === undefined) return;
    const timer: { handle: unknown } = { handle: undefined };
    const set = attempt(() => {
      timer.handle = env.setTimer(onPositionTimer, Math.max(0, next - current));
    });
    if (set) positionTimer = timer;
    else positionStarts.settleAll(err('sensor_unavailable'));
  };

  function onPositionTimer(): void {
    positionTimer = null;
    const current = now();
    if (current === undefined) {
      positionStarts.settleAll(err('sensor_unavailable'));
      return;
    }
    positionStarts.settleExpired(current, err('position_timeout'));
    armPositionTimer();
  }

  // --- Orientation --------------------------------------------------------------------------

  const onOrientationEvent =
    (type: RawOrientationEvent['type']) =>
    (event: unknown): void => {
      let result: SensorResult<OrientationSample>;
      try {
        const raw = copyOrientationEvent(event, type);
        const timeUtcMs = now();
        if (timeUtcMs === undefined) {
          result = err('sensor_unavailable');
        } else {
          let screenAngleDeg: number | null = null;
          try {
            screenAngleDeg = numberOrNull(env.screenAngleDeg());
          } catch {
            screenAngleDeg = null;
          }
          result = orientationSampleFromEvent(raw, timeUtcMs, screenAngleDeg);
        }
      } catch {
        result = err('sensor_unavailable');
      }
      if (result.ok) {
        if (lastFrame !== null && lastFrame !== result.value.frame) emitReset('frame_change');
        lastFrame = result.value.frame;
      }
      orientationListeners.deliver(result);
      if (result.ok) {
        clearOrientationTimer();
        orientationStarts.settleAll(ok(result.value.frame));
      }
    };

  const onBlur = (): void => emitReset('blur');
  const onPagehide = (): void => emitReset('pagehide');
  const onVisibility = (): void => {
    let state: string;
    try {
      state = env.visibilityState();
    } catch {
      return;
    }
    if (state === 'hidden') emitReset('hidden');
  };

  const removeOrientationListeners = (): void => {
    for (const { type, listener } of added.splice(0))
      attempt(() => env.removeWindowListener(type, listener));
    if (visibilityListener !== null) {
      const listener = visibilityListener;
      attempt(() => env.removeVisibilityListener(listener));
      visibilityListener = null;
    }
  };

  const addWindowListener = (
    type: WindowEventType,
    listener: (event: unknown) => void,
  ): boolean => {
    const done = attempt(() => env.addWindowListener(type, listener));
    if (done) added.push({ type, listener });
    return done;
  };

  const startOrientation = (): Promise<SensorResult<OrientationFrame>> => {
    try {
      if (!env.isSecureContext) return Promise.resolve(err('insecure_context'));
      if (!env.hasDeviceOrientation) return Promise.resolve(err('sensor_unavailable'));
      const startedAt = now();
      if (startedAt === undefined) return Promise.resolve(err('sensor_unavailable'));
      const deadline = startedAt + options.listeningTimeoutMs;
      if (orientationStarted) {
        const pending = orientationStarts.add(deadline);
        armOrientationTimer();
        return pending;
      }
      if (orientationEverStopped) emitReset('restart');
      const absoluteType = env.supportsAbsoluteOrientation;
      const type: RawOrientationEvent['type'] = absoluteType
        ? 'deviceorientationabsolute'
        : 'deviceorientation';
      const listenersAdded =
        addWindowListener(type, onOrientationEvent(type)) &&
        addWindowListener('blur', onBlur) &&
        addWindowListener('pagehide', onPagehide) &&
        attempt(() => {
          env.addVisibilityListener(onVisibility);
          visibilityListener = onVisibility;
        });
      if (!listenersAdded) {
        removeOrientationListeners();
        return Promise.resolve(err('sensor_unavailable'));
      }
      orientationStarted = true;
      const pending = orientationStarts.add(deadline);
      armOrientationTimer();
      return pending;
    } catch {
      return Promise.resolve(err('sensor_unavailable'));
    }
  };

  const requestOrientationPermission = async (): Promise<
    SensorResult<'granted' | 'not_required'>
  > => {
    try {
      if (!env.isSecureContext) return err('insecure_context');
      const request = env.requestOrientationPermission;
      if (request === null) return ok('not_required');
      // A synchronous throw is treated as a rejection: either way the browser refused (Req 11.4).
      const answer = await request();
      if (answer === 'granted') {
        permissionGranted = true;
        return ok('granted');
      }
      return err('permission_denied');
    } catch {
      return err('permission_denied');
    }
  };

  // --- Position -----------------------------------------------------------------------------

  const stopWatch = (): void => {
    if (watchId !== undefined) {
      const id = watchId;
      attempt(() => env.geolocation?.clearWatch(id));
    }
    watchId = undefined;
    positionStarted = false;
  };

  const deliverPosition = (result: SensorResult<PositionFix>): void => {
    positionListeners.deliver(result);
    clearPositionTimer();
    positionStarts.settleAll(result);
  };

  const onReading = (position: unknown): void => {
    let result: SensorResult<PositionFix>;
    try {
      const timeUtcMs = now();
      result =
        timeUtcMs === undefined
          ? err('sensor_unavailable')
          : positionFixFromReading(
              copyReading(position),
              timeUtcMs,
              options.positionConfidenceScale,
            );
    } catch {
      result = err('sensor_unavailable');
    }
    deliverPosition(result);
  };

  const onPositionError = (error: unknown): void => {
    let reason: 'permission_denied' | 'position_unavailable' | 'position_timeout';
    try {
      reason = positionErrorReason(error);
    } catch {
      reason = 'position_unavailable';
    }
    // The browser calls the watch no more after a denial: end it, so a later start asks again (D21).
    if (reason === 'permission_denied') stopWatch();
    deliverPosition(err(reason));
  };

  const startPosition = (): Promise<SensorResult<PositionFix>> => {
    try {
      if (!env.isSecureContext) return Promise.resolve(err('insecure_context'));
      const geolocation = env.geolocation;
      if (geolocation === null) return Promise.resolve(err('sensor_unavailable'));
      const startedAt = now();
      if (startedAt === undefined) return Promise.resolve(err('sensor_unavailable'));
      const pending = positionStarts.add(startedAt + options.positionTimeoutMs);
      if (!positionStarted) {
        positionStarted = true;
        const watched = attempt(() => {
          // No `timeout`: the Adapter measures the position timeout itself (Req 7.6, D21).
          watchId = geolocation.watchPosition(onReading, onPositionError, {
            enableHighAccuracy: true,
            maximumAge: 0,
          });
        });
        if (!watched) {
          positionStarted = false;
          watchId = undefined;
          positionStarts.settleAll(err('sensor_unavailable'));
          return pending;
        }
      }
      armPositionTimer();
      return pending;
    } catch {
      return Promise.resolve(err('sensor_unavailable'));
    }
  };

  // --- Stop ---------------------------------------------------------------------------------

  const stop = (): void => {
    removeOrientationListeners();
    if (orientationStarted) orientationEverStopped = true;
    orientationStarted = false;
    lastFrame = null;
    clearOrientationTimer();
    clearPositionTimer();
    stopWatch();
    orientationStarts.settleAll(err('sensor_unavailable'));
    positionStarts.settleAll(err('sensor_unavailable'));
  };

  return ok({
    // The Clock's value, or its last good value if it has since failed: never NaN (Req 11.8).
    now: () => now() ?? lastGoodUtcMs,
    requestOrientationPermission,
    startOrientation,
    startPosition,
    stop,
    onOrientation: (listener) => orientationListeners.add(listener),
    onFrameReset: (listener) => resetListeners.add(listener),
    onPosition: (listener) => positionListeners.add(listener),
  });
}
