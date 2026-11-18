// Fixed Sessions for the example tests (design §9; test support, not exported). Every state is
// reached by events, never by building a Session by hand, so that the examples go through `step`.

import type { Declination, SimulatorScript } from '@alidade/sensors';
import { createSession, step, type StepResult } from '../math/session/step';
import { defaultSessionParameters, type SessionParameters } from '../math/session/parameters';
import type { Session, SessionKind, SessionStateKind } from '../math/session/session';
import type { SessionEvent } from '../math/session/session-events';
import type { CameraCalibration } from '../math/camera-calibration';
import { fromDeg } from '../math/degrees';
import { imageLayout, type ImageLayout } from '../math/image-layout';
import { buildHistoryFromRun, type ScriptHistory } from './history-from-script';
import { SCRIPT_START_UTC_MS } from './scripts';

export const T0 = SCRIPT_START_UTC_MS;
export const FIXTURE_DECLINATION: Declination = { declinationRad: 0.05, sigmaRad: 0.005 };

/** A noise-free Absolute-frame phone held on one pose, with a position fix at the start. */
export function fixtureScript(over: Partial<SimulatorScript> = {}): SimulatorScript {
  return {
    startUtcMs: T0,
    eventIntervalMs: 50,
    pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.2, rollRad: 0 }],
    orientationNoiseSigmaRad: 0,
    altitudeBiasRad: 0,
    frame: { kind: 'absolute', northErrorRad: 0, resets: [] },
    heading: null,
    screenAngleDeg: 0,
    declinationRad: FIXTURE_DECLINATION.declinationRad,
    position: {
      kind: 'fix',
      position: { latRad: 0.5, lonRad: -0.7 },
      reportedAccuracyM: 5,
      firstFixDelayMs: 0,
      fixIntervalMs: 1000,
    },
    orientation: 'available',
    orientationPermission: 'not_required',
    secureContext: true,
    ...over,
  };
}

export const FIXTURE_CALIBRATION: CameraCalibration = {
  fovRad: fromDeg(70),
  fovAxis: 'diagonal',
  fovSigmaRad: fromDeg(1),
  imageWidthSourcePx: 720,
  imageHeightSourcePx: 1280,
};

export const FIXTURE_LAYOUT: ImageLayout = (() => {
  const layout = imageLayout(
    { widthSourcePx: 720, heightSourcePx: 1280 },
    { widthPx: 390, heightPx: 844 },
    'cover',
  );
  if (!layout.ok) throw new Error('fixture layout');
  return layout.value;
})();

export const PARAMETERS: SessionParameters = defaultSessionParameters();

/** Steps through events in order, returning the last Session and every effect asked for. */
export function run(
  session: Session,
  events: readonly SessionEvent[],
  parameters: SessionParameters = PARAMETERS,
): { session: Session; effects: StepResult['effects'][number][]; sessions: Session[] } {
  let current = session;
  const effects: StepResult['effects'][number][] = [];
  const sessions: Session[] = [];
  for (const event of events) {
    const result = step(current, event, parameters);
    current = result.session;
    effects.push(...result.effects);
    sessions.push(current);
  }
  return { session: current, effects, sessions };
}

/** The data events a script delivers, in time order, as Session events. */
export function eventsOfHistory(built: ScriptHistory): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (const sample of built.samples) {
    events.push({
      kind: 'sample',
      timeUtcMs: sample.timeUtcMs,
      result: { ok: true, value: sample },
    });
  }
  for (const event of built.frameResets) {
    events.push({ kind: 'frameReset', timeUtcMs: event.timeUtcMs, event });
  }
  for (const fix of built.fixes) {
    events.push({
      kind: 'positionFix',
      timeUtcMs: fix.timeUtcMs,
      result: { ok: true, value: fix },
    });
  }
  return events.sort((a, b) => a.timeUtcMs - b.timeUtcMs);
}

export function fixtureSession(kind: SessionKind): Session {
  const created = createSession(kind, PARAMETERS);
  if (!created.ok) throw new Error('createSession');
  return created.value;
}

/** A Session in `live` with 1.5 s of samples (and, for a bearing, a fix and a Declination). */
export function liveSession(
  kind: SessionKind,
  script: SimulatorScript = fixtureScript(),
  durationMs = 1500,
): { session: Session; endUtcMs: number; built: ScriptHistory } {
  const built = buildHistoryFromRun({
    script,
    seed: 1,
    steps: [{ aim: null, advanceToUtcMs: script.startUtcMs + durationMs }],
  });
  const events: SessionEvent[] = [
    {
      kind: 'permissionResult',
      timeUtcMs: script.startUtcMs,
      result: { ok: true, value: 'not_required' },
    },
    {
      kind: 'orientationStarted',
      timeUtcMs: script.startUtcMs,
      result: { ok: true, value: script.frame.kind },
    },
    ...eventsOfHistory(built),
  ];
  if (kind === 'bearing') {
    events.push({
      kind: 'declination',
      timeUtcMs: built.endUtcMs,
      result: { ok: true, value: FIXTURE_DECLINATION },
    });
  }
  const { session } = run(fixtureSession(kind), events);
  return { session, endUtcMs: built.endUtcMs, built };
}

/** A Session in each state, reached through events. */
export function sessionInState(
  state: SessionStateKind,
  kind: SessionKind,
): { session: Session; endUtcMs: number } {
  if (state === 'permission') return { session: fixtureSession(kind), endUtcMs: T0 };
  if (state === 'starting') {
    const { session } = run(fixtureSession(kind), [
      { kind: 'permissionResult', timeUtcMs: T0, result: { ok: true, value: 'not_required' } },
    ]);
    return { session, endUtcMs: T0 };
  }
  if (state === 'failed') {
    const { session } = run(fixtureSession(kind), [
      {
        kind: 'permissionResult',
        timeUtcMs: T0,
        result: { ok: false, reason: 'permission_denied' },
      },
    ]);
    return { session, endUtcMs: T0 };
  }
  const live = liveSession(kind);
  if (state === 'live') return { session: live.session, endUtcMs: live.endUtcMs };
  const frozen = run(live.session, [{ kind: 'freeze', timeUtcMs: live.endUtcMs }]);
  if (state === 'frozen') return { session: frozen.session, endUtcMs: live.endUtcMs };
  const captured = run(frozen.session, [{ kind: 'capture', timeUtcMs: live.endUtcMs }]);
  return { session: captured.session, endUtcMs: live.endUtcMs };
}

/** A Session of `kind` that has received the start events and every data event of `built`. */
export function sessionFromHistory(
  kind: SessionKind,
  built: ScriptHistory,
  startUtcMs: number,
  parameters: SessionParameters = PARAMETERS,
  declination: Declination | null = null,
): Session {
  const events: SessionEvent[] = [
    {
      kind: 'permissionResult',
      timeUtcMs: startUtcMs,
      result: { ok: true, value: 'not_required' },
    },
    { kind: 'orientationStarted', timeUtcMs: startUtcMs, result: { ok: true, value: 'absolute' } },
    ...eventsOfHistory(built),
  ];
  if (declination !== null) {
    events.push({
      kind: 'declination',
      timeUtcMs: built.endUtcMs,
      result: { ok: true, value: declination },
    });
  }
  const created = createSession(kind, parameters);
  if (!created.ok) throw new Error('createSession');
  return run(created.value, events, parameters).session;
}
