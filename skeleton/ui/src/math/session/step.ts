// The Session reducer (Req 8, design §7.6, D3, D5, D23): `step(session, event, parameters)` is a
// pure function that returns a new Session and the effects it asks for, as plain data. It does not
// change its arguments, read the clock or wait.

import {
  addFrameReset,
  addOrientationSample,
  addPositionFix,
  createSampleHistory,
  trueAzimuthFromMagnetic,
  type SampleHistory,
} from '@alidade/sensors';
import { err, ok, type UiFailure, type UiResult } from '../../result';
import { captureFrozen } from './capture';
import { establishYaw } from './establish-yaw';
import { freeze } from './freeze';
import { makeMark } from './mark';
import { checkSessionParameters, type SessionParameters } from './parameters';
import { liveReadout, withStaleness } from './readout';
import type { Session, SessionKind, StampedFailure, YawReferenceSource } from './session';
import {
  isActionEvent,
  type ActionEvent,
  type DataEvent,
  type SessionEffect,
  type SessionEvent,
} from './session-events';

export interface StepResult {
  readonly session: Session;
  readonly effects: readonly SessionEffect[];
}

const NO_EFFECTS: readonly SessionEffect[] = Object.freeze([]);

/** A Session in `permission` with an empty history (Req 8.3). Fails if a parameter is invalid. */
export function createSession(kind: SessionKind, parameters: SessionParameters): UiResult<Session> {
  const checked = checkSessionParameters(parameters);
  if (!checked.ok) return checked;
  const history = createSampleHistory({
    sampleRetentionMs: parameters.sampleRetentionMs,
    frameResetRetentionMs: parameters.frameResetRetentionMs,
  });
  if (!history.ok) return history;
  return ok({
    kind,
    state: 'permission',
    history: history.value,
    yawReference: null,
    yawReferenceSource: null,
    declination: null,
    readout: null,
    lastReadoutUtcMs: null,
    nowUtcMs: null,
    frozen: null,
    captured: null,
    failure: null,
    notice: null,
  });
}

/** A failure with the time of the event, keeping only the details it has (Req 8.7). */
function stamp(failure: UiFailure, atUtcMs: number): StampedFailure {
  return {
    reason: failure.reason,
    ...(failure.field === undefined ? {} : { field: failure.field }),
    ...(failure.id === undefined ? {} : { id: failure.id }),
    // A non-finite accuracy is dropped: the Session carries no NaN (Req 8.8).
    ...(typeof failure.reportedAccuracyM === 'number' && Number.isFinite(failure.reportedAccuracyM)
      ? { reportedAccuracyM: failure.reportedAccuracyM }
      : {}),
    ...(failure.errorName === undefined ? {} : { errorName: failure.errorName }),
    atUtcMs,
  };
}

/** The Session with a Notice: the failure of a refused event, replacing any earlier one (D23). */
function refused(session: Session, failure: UiFailure, atUtcMs: number): StepResult {
  return { session: { ...session, notice: stamp(failure, atUtcMs) }, effects: NO_EFFECTS };
}

/** An event that changed the Session and succeeded: it clears the Notice (D23). */
function accepted(session: Session, effects: readonly SessionEffect[] = NO_EFFECTS): StepResult {
  return { session: { ...session, notice: null }, effects };
}

/** An event that changed the Session but is background data: the Notice stays (see `onData`). */
function absorbed(session: Session): StepResult {
  return { session, effects: NO_EFFECTS };
}

/** An event with nothing to apply and nothing to lose: dropped (D5). */
function dropped(session: Session): StepResult {
  return { session, effects: NO_EFFECTS };
}

/** The Session in `failed` with the failure of the event (Req 8.3). */
function failedWith(session: Session, failure: UiFailure, atUtcMs: number): StepResult {
  return {
    session: {
      ...session,
      state: 'failed',
      failure: stamp(failure, atUtcMs),
      notice: null,
      frozen: null,
    },
    effects: NO_EFFECTS,
  };
}

/** Whether a readout is due at `timeUtcMs` (Req 9.5). */
function readoutDue(session: Session, timeUtcMs: number, parameters: SessionParameters): boolean {
  return (
    session.lastReadoutUtcMs === null ||
    timeUtcMs - session.lastReadoutUtcMs >= parameters.readoutIntervalMs
  );
}

function publish(session: Session, timeUtcMs: number, parameters: SessionParameters): Session {
  return {
    ...session,
    readout: liveReadout(
      session.history,
      session.yawReference,
      session.declination,
      parameters,
      timeUtcMs,
    ),
    lastReadoutUtcMs: timeUtcMs,
  };
}

// --- Data events ------------------------------------------------------------------------------

/**
 * Req 8.15: an item stamped later than the event that carries it is refused, so that the
 * history's newest time is never later than the Session's time (one item far in the future would
 * otherwise make the history drop every real Frame reset and sample).
 */
function laterThanEvent(itemUtcMs: number, eventUtcMs: number): boolean {
  return itemUtcMs > eventUtcMs;
}

function onData(
  session: Session,
  event: DataEvent,
  parameters: SessionParameters,
  timeUtcMs: number,
): StepResult {
  switch (event.kind) {
    case 'permissionResult': {
      if (session.state === 'permission') {
        if (!event.result.ok) return failedWith(session, event.result, timeUtcMs);
        const effects: SessionEffect[] = [{ kind: 'startOrientation' }];
        if (session.kind === 'bearing') effects.push({ kind: 'startPositions' });
        return accepted({ ...session, state: 'starting' }, effects);
      }
      return event.result.ok ? dropped(session) : refused(session, event.result, timeUtcMs);
    }
    case 'orientationStarted': {
      if (session.state === 'starting') {
        if (!event.result.ok) return failedWith(session, event.result, timeUtcMs);
        return accepted({ ...session, state: 'live' });
      }
      return event.result.ok ? dropped(session) : refused(session, event.result, timeUtcMs);
    }
    case 'sample': {
      if (!event.result.ok) return refused(session, event.result, timeUtcMs);
      if (laterThanEvent(event.result.value.timeUtcMs, event.timeUtcMs)) {
        return refused(session, err('invalid_number', { field: 'timeUtcMs' }), timeUtcMs);
      }
      const history = addOrientationSample(session.history, event.result.value);
      if (!history.ok) return refused(session, history, timeUtcMs);
      let next: Session = { ...session, history: history.value };
      if (next.state === 'live' && readoutDue(next, timeUtcMs, parameters)) {
        next = publish(next, timeUtcMs, parameters);
      }
      return absorbed(next);
    }
    case 'frameReset': {
      // Applied in every state, so that a reset received while the Session was not live still
      // invalidates the Yaw reference it keeps (Req 8.14).
      if (laterThanEvent(event.event.timeUtcMs, event.timeUtcMs)) {
        return refused(session, err('invalid_number', { field: 'timeUtcMs' }), timeUtcMs);
      }
      const history = addFrameReset(session.history, event.event);
      if (!history.ok) return refused(session, history, timeUtcMs);
      return absorbed({ ...session, history: history.value });
    }
    case 'positionFix': {
      if (!event.result.ok) return refused(session, event.result, timeUtcMs);
      if (laterThanEvent(event.result.value.timeUtcMs, event.timeUtcMs)) {
        return refused(session, err('invalid_number', { field: 'timeUtcMs' }), timeUtcMs);
      }
      if (session.kind === 'altitude') return dropped(session);
      const history = addPositionFix(session.history, event.result.value);
      if (!history.ok) return refused(session, history, timeUtcMs);
      return absorbed({ ...session, history: history.value });
    }
    case 'declination': {
      if (!event.result.ok) return refused(session, event.result, timeUtcMs);
      if (session.kind === 'altitude') return dropped(session);
      // Sensors validates a Declination wherever it is used; an invalid one is refused here
      // rather than held (`trueAzimuthFromMagnetic` checks it, and its azimuth is not used).
      const checked = trueAzimuthFromMagnetic(0, event.result.value);
      if (!checked.ok) return refused(session, checked, timeUtcMs);
      return absorbed({ ...session, declination: event.result.value });
    }
    case 'camera': {
      if (event.result.ok) return dropped(session);
      if (session.state === 'captured' || session.state === 'failed') {
        return refused(session, event.result, timeUtcMs);
      }
      return failedWith(session, event.result, timeUtcMs);
    }
    case 'tick': {
      if (session.state !== 'live') return dropped(session);
      if (readoutDue(session, timeUtcMs, parameters)) {
        return absorbed(publish(session, timeUtcMs, parameters));
      }
      if (session.readout === null) return dropped(session);
      const readout = withStaleness(session.readout, timeUtcMs, parameters);
      return readout === session.readout ? dropped(session) : absorbed({ ...session, readout });
    }
  }
}

// --- Action events ----------------------------------------------------------------------------

function notAvailable(session: Session, timeUtcMs: number): StepResult {
  return refused(session, err('action_not_available'), timeUtcMs);
}

function onAction(
  session: Session,
  event: ActionEvent,
  parameters: SessionParameters,
  timeUtcMs: number,
): StepResult {
  switch (event.kind) {
    case 'freeze': {
      if (session.state !== 'live') return notAvailable(session, timeUtcMs);
      const frozen = freeze(session, parameters, timeUtcMs);
      if (!frozen.ok) return refused(session, frozen, timeUtcMs);
      return accepted({ ...session, state: 'frozen', frozen: frozen.value });
    }
    case 'unfreeze': {
      if (session.state !== 'frozen') return notAvailable(session, timeUtcMs);
      return accepted({ ...session, state: 'live', frozen: null, lastReadoutUtcMs: null });
    }
    case 'mark': {
      if (session.state !== 'frozen' || session.frozen === null)
        return notAvailable(session, timeUtcMs);
      const mark = makeMark(event.point, event.layout, event.calibration, event.tapSigmaPx);
      if (!mark.ok) return refused(session, mark, timeUtcMs);
      return accepted({ ...session, frozen: { ...session.frozen, mark: mark.value } });
    }
    case 'clearMark': {
      if (session.state !== 'frozen' || session.frozen === null)
        return notAvailable(session, timeUtcMs);
      return accepted({ ...session, frozen: { ...session.frozen, mark: null } });
    }
    case 'capture': {
      if (session.state !== 'frozen' || session.frozen === null)
        return notAvailable(session, timeUtcMs);
      const captured = captureFrozen(session.kind, session.frozen, parameters);
      if (!captured.ok) return refused(session, captured, timeUtcMs);
      // Leaving `frozen` drops the Frozen history and the Mark (Req 10.7); the result keeps the
      // Mark and the window it was made from.
      return accepted({ ...session, state: 'captured', captured: captured.value, frozen: null });
    }
    case 'establishYaw': {
      const inLive = session.state === 'live';
      const inFrozen = session.state === 'frozen' && session.frozen !== null;
      const offered = inLive || (inFrozen && event.from.kind === 'knownAzimuth');
      if (!offered) return notAvailable(session, timeUtcMs);
      const yaw = establishYaw(
        session,
        inFrozen ? session.frozen : null,
        event.from,
        parameters,
        timeUtcMs,
      );
      if (!yaw.ok) return refused(session, yaw, timeUtcMs);
      // In `frozen` this is the one write into a Frozen sighting: an action of the user, and it
      // never touches the history (Req 10.3).
      const yawReferenceSource: YawReferenceSource =
        event.from.kind === 'compass' ? 'compass' : 'known-azimuth';
      const frozen =
        inFrozen && session.frozen !== null
          ? { ...session.frozen, yawReference: yaw.value, yawReferenceSource }
          : session.frozen;
      return accepted({ ...session, yawReference: yaw.value, yawReferenceSource, frozen });
    }
    case 'again': {
      if (session.state !== 'captured') return notAvailable(session, timeUtcMs);
      return accepted({
        ...session,
        state: 'live',
        captured: null,
        frozen: null,
        lastReadoutUtcMs: null,
      });
    }
    case 'restart': {
      if (session.state !== 'failed') return notAvailable(session, timeUtcMs);
      // The samples go, the Frame resets stay, and so do the Yaw reference and the Declination
      // (Req 8.3, 8.14, 11.9).
      let history: SampleHistory | null = null;
      const created = createSampleHistory({
        sampleRetentionMs: session.history.sampleRetentionMs,
        frameResetRetentionMs: session.history.frameResetRetentionMs,
      });
      if (created.ok) {
        history = created.value;
        for (const reset of session.history.frameResets) {
          const added = addFrameReset(history, reset);
          if (added.ok) history = added.value;
        }
      }
      if (history === null)
        return refused(session, err('invalid_number', { field: 'history' }), timeUtcMs);
      return accepted({
        ...session,
        state: 'permission',
        history,
        failure: null,
        readout: null,
        lastReadoutUtcMs: null,
        frozen: null,
        captured: null,
      });
    }
  }
}

/**
 * Advances the Session by one event. Every branch validates the event time first: a non-finite
 * time leaves the Session unchanged except for the Notice `invalid_number` (Req 8.8). The
 * Session's time is the largest event time seen, and every event is handled at it (Req 8.16): a
 * time earlier than the Session's is handled as the Session's time.
 *
 * An action event in a state that does not offer it gets the Notice `action_not_available`. A
 * data event is never `action_not_available`: one that carries a failure and fits no transition
 * records its own reason as the Notice, and one that carries none is dropped (D5).
 *
 * A Notice is cleared by the next action or state-changing event that succeeds. Background data
 * that arrives continuously (samples, Frame resets, positions, Declinations) and `tick` neither
 * clear nor set one on success, so that a Notice is not wiped 50 times a second (design D23).
 */
export function step(
  session: Session,
  event: SessionEvent,
  parameters: SessionParameters,
): StepResult {
  const timeUtcMs = event.timeUtcMs;
  if (typeof timeUtcMs !== 'number' || !Number.isFinite(timeUtcMs)) {
    return refused(session, err('invalid_number', { field: 'timeUtcMs' }), session.nowUtcMs ?? 0);
  }
  const nowUtcMs = session.nowUtcMs === null ? timeUtcMs : Math.max(session.nowUtcMs, timeUtcMs);
  const base = nowUtcMs === session.nowUtcMs ? session : { ...session, nowUtcMs };
  // Req 8.16: every event is handled at the Session's time. An event from a clock that stepped
  // back is handled as if it carried the Session's time (the end of a window, the time of a
  // staleness check, of a capture and of a recorded failure); the items it carries keep their
  // own times, and Req 8.15 compares them with the time the event itself carries.
  return isActionEvent(event)
    ? onAction(base, event, parameters, nowUtcMs)
    : onData(base, event, parameters, nowUtcMs);
}
