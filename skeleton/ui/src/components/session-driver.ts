// The Session driver (Req 9.7, 9.8, design §7.14, D4, D9): binds a Sensor source to a Session.
// It subscribes to the source, turns each delivery into a Session event stamped with the source's
// Clock, ticks the readout through the injected Timer, and runs the effects the Session asks for.
// It touches no browser API.

import type { Position } from '@alidade/core';
import {
  declinationAt,
  type Declination,
  type SensorFailure,
  type SensorResult,
  type SensorSource,
} from '@alidade/sensors';
import { ok, type UiResult } from '../result';
import type { SessionParameters } from '../math/session/parameters';
import type { Session, SessionKind } from '../math/session/session';
import type { ActionRequest, SessionEffect, SessionEvent } from '../math/session/session-events';
import { createSession, step } from '../math/session/step';
import type { Timer, TimerHandle } from './timer';

export interface DriverDeps {
  readonly source: SensorSource;
  readonly kind: SessionKind;
  readonly parameters: SessionParameters;
  readonly timer: Timer;
  /** Called with the Session after every event. A throw is caught and ignored. */
  readonly onSession: (session: Session) => void;
  /** Default Sensors' `declinationAt`. */
  readonly computeDeclination?: (
    position: Position,
    timeUtcMs: number,
  ) => SensorResult<Declination>;
}

export interface SessionDriver {
  /**
   * Asks for the orientation permission. Call it from the user's tap: the source's request runs
   * synchronously inside it (iOS needs a gesture). The first call also subscribes and starts the
   * readout Timer; later calls subscribe nothing again (Req 9.8).
   */
  requestPermission(): Promise<void>;
  /** Stamps an action with `source.now()` and steps the Session. `restart` asks again at once. */
  dispatch(action: ActionRequest): void;
  /** Delivers the state of the camera (running, or a failure of the Camera adapter). */
  camera(result: UiResult<null>): void;
  session(): Session;
  /** Removes every listener and Timer the driver added; later settlements are ignored. */
  stop(): void;
}

/** A driver for one Session of `kind`, or `invalid_number` naming a bad parameter. */
export function createSessionDriver(deps: DriverDeps): UiResult<SessionDriver> {
  const created = createSession(deps.kind, deps.parameters);
  if (!created.ok) return created;
  const { source, parameters, timer } = deps;
  const computeDeclination = deps.computeDeclination ?? declinationAt;
  let session = created.value;
  let stopped = false;
  let subscribed = false;
  /** Bumped by `restart`, so that settlements of an earlier start are ignored. */
  let generation = 0;
  const unsubscribes: (() => void)[] = [];
  let tickHandle: TimerHandle | null = null;
  const failure = (reason: SensorFailure['reason']): SensorFailure => ({ ok: false, reason });

  const now = (): number => {
    try {
      return source.now();
    } catch {
      return Number.NaN;
    }
  };

  const publish = (): void => {
    try {
      deps.onSession(session);
    } catch {
      // A throwing listener must not stop the driver.
    }
  };

  const runEffects = (effects: readonly SessionEffect[]): void => {
    const mine = generation;
    for (const effect of effects) {
      if (effect.kind === 'startOrientation') {
        settle(source.startOrientation(), mine, (result) =>
          deliver({ kind: 'orientationStarted', timeUtcMs: now(), result }),
        );
      } else {
        settle(source.startPosition(), mine, (result) => {
          // A success also arrives through `onPosition`, so only a failure is delivered here.
          if (!result.ok) deliver({ kind: 'positionFix', timeUtcMs: now(), result });
        });
      }
    }
  };

  const deliver = (event: SessionEvent): void => {
    if (stopped) return;
    const result = step(session, event, parameters);
    session = result.session;
    publish();
    runEffects(result.effects);
  };

  function settle<T>(
    promise: Promise<SensorResult<T>>,
    mine: number,
    then: (result: SensorResult<T>) => void,
  ): void {
    promise.then(
      (result) => {
        if (!stopped && mine === generation) then(result);
      },
      () => {
        if (!stopped && mine === generation) then(failure('sensor_unavailable'));
      },
    );
  }

  const onFix = (
    result: SensorResult<{ readonly position: Position; readonly timeUtcMs: number }>,
  ) => {
    if (!result.ok) return;
    if (session.kind !== 'bearing') return;
    // The Declination on every Position fix of a bearing Session (Req 9.7).
    let declination: SensorResult<Declination>;
    try {
      declination = computeDeclination(result.value.position, result.value.timeUtcMs);
    } catch {
      declination = failure('declination_unknown');
    }
    deliver({ kind: 'declination', timeUtcMs: now(), result: declination });
  };

  const subscribe = (): void => {
    if (subscribed) return;
    subscribed = true;
    unsubscribes.push(
      source.onOrientation((result) => deliver({ kind: 'sample', timeUtcMs: now(), result })),
      source.onFrameReset((event) => deliver({ kind: 'frameReset', timeUtcMs: now(), event })),
      source.onPosition((result) => {
        deliver({ kind: 'positionFix', timeUtcMs: now(), result });
        onFix(result);
      }),
    );
    tickHandle = timer.start(
      () => deliver({ kind: 'tick', timeUtcMs: now() }),
      parameters.readoutIntervalMs,
    );
  };

  const requestPermission = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    subscribe();
    const mine = generation;
    let request: Promise<SensorResult<'granted' | 'not_required'>>;
    try {
      request = source.requestOrientationPermission();
    } catch {
      request = Promise.resolve(failure('sensor_unavailable'));
    }
    return new Promise<void>((resolve) => {
      settle(request, mine, (result) =>
        deliver({ kind: 'permissionResult', timeUtcMs: now(), result }),
      );
      request.then(
        () => resolve(),
        () => resolve(),
      );
    });
  };

  const dispatch = (action: ActionRequest): void => {
    if (stopped) return;
    const before = session.state;
    deliver({ ...action, timeUtcMs: now() } as SessionEvent);
    if (action.kind === 'restart' && before === 'failed' && session.state === 'permission') {
      // Start again from this tap: the source is stopped and asked again, which, on a source that
      // had started, emits its `restart` Frame reset (Sensors Req 4.7).
      generation += 1;
      source.stop();
      void requestPermission();
    }
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
    if (tickHandle !== null) timer.stop(tickHandle);
    tickHandle = null;
  };

  const camera = (result: UiResult<null>): void =>
    deliver({ kind: 'camera', timeUtcMs: now(), result });

  return ok({ requestPermission, dispatch, camera, session: () => session, stop });
}
