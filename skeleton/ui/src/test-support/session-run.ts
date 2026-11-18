// `sessionRun` (design §8; test support, not exported): sequences of 0 to 200 intents, resolved
// against the live Session by a runner, because purely random events almost never reach `frozen`.
//
// An intent is either `progress` (the event that moves the Session forward from its current
// state: grant, start, a position fix, a Declination, a dense run of samples, freeze, a Mark,
// capture, again, restart) or one drawn event of any kind, valid or hostile. The runner turns an
// intent into a concrete event at the Session's time plus a drawn step, which is negative one time
// in ten (the clock stepping back). Samples come from the Simulator: each run builds two short
// noisy histories (one Absolute, one Relative with a compass) aimed at a drawn pose, and re-times
// their samples to the runner's clock, with a drawn Screen angle.

import type {
  FrameResetCause,
  OrientationSample,
  SensorFailure,
  SimulatorScript,
} from '@alidade/sensors';
import fc from 'fast-check';
import type { UiReason } from '../reasons';
import type { Session, SessionKind } from '../math/session/session';
import type { SessionEvent } from '../math/session/session-events';
import { step } from '../math/session/step';
import { closed, uniform, uniformInteger } from './generators';
import { buildHistoryFromRun } from './history-from-script';
import { hostileNumber } from './hostile';
import {
  FIXTURE_CALIBRATION,
  FIXTURE_DECLINATION,
  FIXTURE_LAYOUT,
  PARAMETERS,
  T0,
  fixtureScript,
  fixtureSession,
} from './session-fixtures';

const DEG = Math.PI / 180;
const CAUSES: readonly FrameResetCause[] = [
  'hidden',
  'blur',
  'pagehide',
  'restart',
  'frame_change',
];

export type Intent =
  | { readonly kind: 'progress' }
  | { readonly kind: 'grant' }
  | { readonly kind: 'denyPermission'; readonly reason: 'permission_denied' | 'insecure_context' }
  | { readonly kind: 'startOk' }
  | { readonly kind: 'startFail'; readonly reason: 'sensor_unavailable' | 'permission_required' }
  | {
      readonly kind: 'samples';
      readonly n: number;
      readonly frame: 'absolute' | 'relative';
      readonly screen: 'zero' | 'ninety' | 'null';
    }
  | { readonly kind: 'sampleFailure'; readonly reason: 'sensor_unavailable' | 'invalid_number' }
  | { readonly kind: 'frameReset'; readonly cause: FrameResetCause }
  | { readonly kind: 'fix'; readonly accuracyM: number }
  | { readonly kind: 'fixFailure'; readonly failure: SensorFailure }
  | { readonly kind: 'declination' }
  | { readonly kind: 'declinationFailure' }
  | { readonly kind: 'cameraFail'; readonly reason: UiReason }
  | { readonly kind: 'tick'; readonly dtMs: number }
  | { readonly kind: 'freeze' }
  | { readonly kind: 'unfreeze' }
  | { readonly kind: 'mark'; readonly inside: boolean; readonly u: number; readonly v: number }
  | { readonly kind: 'clearMark' }
  | { readonly kind: 'capture' }
  | { readonly kind: 'establishCompass' }
  | {
      readonly kind: 'establishKnown';
      readonly azimuthRad: number;
      readonly northReference: 'true' | 'magnetic';
    }
  | { readonly kind: 'again' }
  | { readonly kind: 'restart' }
  | { readonly kind: 'hostile'; readonly which: number; readonly value: number };

export interface SessionRunCase {
  readonly kind: SessionKind;
  readonly seed: number;
  readonly pose: { readonly azimuthRad: number; readonly apparentAltitudeRad: number };
  readonly noiseSigmaRad: number;
  readonly intents: readonly Intent[];
  /** One step per intent: the time step in ms (negative one time in ten). */
  readonly stepsMs: readonly number[];
}

const intent: fc.Arbitrary<Intent> = fc.oneof(
  { weight: 12, arbitrary: fc.constant({ kind: 'progress' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'grant' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('denyPermission' as const),
      reason: fc.constantFrom('permission_denied' as const, 'insecure_context' as const),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'startOk' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('startFail' as const),
      reason: fc.constantFrom('sensor_unavailable' as const, 'permission_required' as const),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('samples' as const),
      n: uniformInteger(1, 30),
      frame: fc.constantFrom('absolute' as const, 'relative' as const),
      screen: fc.constantFrom('zero' as const, 'zero' as const, 'ninety' as const, 'null' as const),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('sampleFailure' as const),
      reason: fc.constantFrom('sensor_unavailable' as const, 'invalid_number' as const),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('frameReset' as const),
      cause: fc.constantFrom(...CAUSES),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('fix' as const), accuracyM: closed(1, 3000) }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('fixFailure' as const),
      failure: fc.oneof(
        fc.constantFrom<SensorFailure>(
          { ok: false, reason: 'position_unavailable' },
          { ok: false, reason: 'position_timeout' },
          { ok: false, reason: 'permission_denied' },
        ),
        closed(101, 5000).map<SensorFailure>((reportedAccuracyM) => ({
          ok: false,
          reason: 'coarse_location',
          reportedAccuracyM,
        })),
      ),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'declination' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'declinationFailure' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('cameraFail' as const),
      reason: fc.constantFrom<UiReason>(
        'camera_track_ended',
        'camera_busy',
        'camera_permission_denied',
        'camera_failed',
        'wrong_camera',
      ),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ kind: fc.constant('tick' as const), dtMs: closed(0, 70_000) }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'freeze' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'unfreeze' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('mark' as const),
      inside: fc.boolean(),
      u: uniform(0, 1),
      v: uniform(0, 1),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'clearMark' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'capture' as const }) },
  { weight: 2, arbitrary: fc.constant({ kind: 'establishCompass' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('establishKnown' as const),
      azimuthRad: uniform(0, 2 * Math.PI),
      northReference: fc.constantFrom('true' as const, 'magnetic' as const),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'again' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'restart' as const }) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('hostile' as const),
      which: uniformInteger(0, 9),
      value: hostileNumber(),
    }),
  },
);

/**
 * Domain: a bearing or altitude Session; a seed in [0, 2³²); a pose with azimuth in [0, 2π) and
 * apparent altitude in [-20°, 20°] (within the compass's 30°, so that north can be set); a noise
 * 1-sigma in [0, 0.3°]; a number of intents uniform in [0, 200] (twelve in thirty-four are
 * `progress`); one time step per
 * intent, in [0, 400] ms nine times in ten and in [-3000, 0) ms otherwise.
 */
export function sessionRunCase(maxIntents = 200): fc.Arbitrary<SessionRunCase> {
  return fc
    .record({
      kind: fc.constantFrom('bearing' as const, 'altitude' as const),
      seed: uniformInteger(0, 2 ** 32 - 1),
      pose: fc.record({
        azimuthRad: uniform(0, 2 * Math.PI),
        apparentAltitudeRad: closed(-20 * DEG, 20 * DEG),
      }),
      noiseSigmaRad: closed(0, 0.3 * DEG),
      intents: uniformInteger(0, maxIntents).chain((n) =>
        fc.array(intent, { minLength: n, maxLength: n }),
      ),
      stepSeed: fc.array(
        fc.oneof(
          { weight: 9, arbitrary: closed(0, 400) },
          { weight: 1, arbitrary: uniform(-3000, 0) },
        ),
        { minLength: maxIntents, maxLength: maxIntents },
      ),
    })
    .map(({ stepSeed, ...rest }) => ({ ...rest, stepsMs: stepSeed.slice(0, rest.intents.length) }));
}

/** The samples a run re-times: two short Simulator histories, Absolute and Relative. */
interface SamplePool {
  readonly absolute: readonly OrientationSample[];
  readonly relative: readonly OrientationSample[];
}

function poolFor(c: SessionRunCase): SamplePool {
  const base = (over: Partial<SimulatorScript>): SimulatorScript =>
    fixtureScript({
      orientationNoiseSigmaRad: c.noiseSigmaRad,
      pose: [
        {
          timeUtcMs: T0,
          azimuthRad: c.pose.azimuthRad,
          apparentAltitudeRad: c.pose.apparentAltitudeRad,
          rollRad: 0,
        },
      ],
      ...over,
    });
  const absolute = buildHistoryFromRun({
    script: base({}),
    seed: c.seed,
    steps: [{ aim: null, advanceToUtcMs: T0 + 1000 }],
  }).samples;
  const relative = buildHistoryFromRun({
    script: base({
      frame: { kind: 'relative', zeroRad: 1.3, resets: [] },
      heading: { biasRad: 0, noiseSigmaRad: c.noiseSigmaRad, jumps: [], reportedAccuracyDeg: 10 },
    }),
    seed: c.seed,
    steps: [{ aim: null, advanceToUtcMs: T0 + 1000 }],
  }).samples;
  return { absolute, relative };
}

export interface RunRecord {
  /** The Session before the first event. */
  readonly initial: Session;
  /** The events delivered, in order. */
  readonly events: readonly SessionEvent[];
  /** The Session after each event. */
  readonly sessions: readonly Session[];
}

const EVENT_INTERVAL_MS = 50;

/**
 * Turns an intent into the events it stands for, at the runner's clock. `progress` picks the
 * event that moves the Session forward from its state.
 */
function eventsFor(
  i: Intent,
  session: Session,
  nowUtcMs: number,
  pool: SamplePool,
  counter: { next: number },
): SessionEvent[] {
  const t = nowUtcMs;
  const samplesOf = (
    n: number,
    frame: 'absolute' | 'relative',
    screen: 'zero' | 'ninety' | 'null',
  ): SessionEvent[] => {
    const source = frame === 'absolute' ? pool.absolute : pool.relative;
    const out: SessionEvent[] = [];
    for (let k = 0; k < n; k += 1) {
      const base = source[(counter.next + k) % Math.max(1, source.length)];
      if (base === undefined) break;
      const timeUtcMs = t + k * EVENT_INTERVAL_MS;
      const screenAngleRad = screen === 'zero' ? 0 : screen === 'ninety' ? Math.PI / 2 : null;
      out.push({
        kind: 'sample',
        timeUtcMs,
        result: { ok: true, value: { ...base, timeUtcMs, screenAngleRad } },
      });
    }
    counter.next += n;
    return out;
  };
  const frameOfHistory = (): 'absolute' | 'relative' =>
    session.history.samples[session.history.samples.length - 1]?.frame ?? 'absolute';
  switch (i.kind) {
    case 'progress': {
      switch (session.state) {
        case 'permission':
          return [
            { kind: 'permissionResult', timeUtcMs: t, result: { ok: true, value: 'granted' } },
          ];
        case 'starting':
          return [
            { kind: 'orientationStarted', timeUtcMs: t, result: { ok: true, value: 'absolute' } },
          ];
        case 'live': {
          if (session.kind === 'bearing' && session.history.positionFix === null) {
            return [fixEvent(t, 5)];
          }
          if (session.kind === 'bearing' && session.declination === null) {
            return [
              {
                kind: 'declination',
                timeUtcMs: t,
                result: { ok: true, value: FIXTURE_DECLINATION },
              },
            ];
          }
          const n = session.history.samples.filter((s) => s.timeUtcMs >= t - 900).length;
          if (n < PARAMETERS.minSampleCount + 2) return samplesOf(15, frameOfHistory(), 'zero');
          return [{ kind: 'freeze', timeUtcMs: session.history.samples.at(-1)?.timeUtcMs ?? t }];
        }
        case 'frozen':
          return [{ kind: 'capture', timeUtcMs: t }];
        case 'captured':
          return [{ kind: 'again', timeUtcMs: t }];
        case 'failed':
          return [{ kind: 'restart', timeUtcMs: t }];
      }
      return [];
    }
    case 'grant':
      return [{ kind: 'permissionResult', timeUtcMs: t, result: { ok: true, value: 'granted' } }];
    case 'denyPermission':
      return [{ kind: 'permissionResult', timeUtcMs: t, result: { ok: false, reason: i.reason } }];
    case 'startOk':
      return [
        { kind: 'orientationStarted', timeUtcMs: t, result: { ok: true, value: 'relative' } },
      ];
    case 'startFail':
      return [
        { kind: 'orientationStarted', timeUtcMs: t, result: { ok: false, reason: i.reason } },
      ];
    case 'samples':
      return samplesOf(i.n, i.frame, i.screen);
    case 'sampleFailure':
      return [
        {
          kind: 'sample',
          timeUtcMs: t,
          result: { ok: false, reason: i.reason, field: 'alphaDeg' },
        },
      ];
    case 'frameReset':
      return [{ kind: 'frameReset', timeUtcMs: t, event: { timeUtcMs: t, cause: i.cause } }];
    case 'fix':
      return [fixEvent(t, i.accuracyM)];
    case 'fixFailure':
      return [{ kind: 'positionFix', timeUtcMs: t, result: i.failure }];
    case 'declination':
      return [
        { kind: 'declination', timeUtcMs: t, result: { ok: true, value: FIXTURE_DECLINATION } },
      ];
    case 'declinationFailure':
      return [
        { kind: 'declination', timeUtcMs: t, result: { ok: false, reason: 'declination_unknown' } },
      ];
    case 'cameraFail':
      return [{ kind: 'camera', timeUtcMs: t, result: { ok: false, reason: i.reason } }];
    case 'tick':
      return [{ kind: 'tick', timeUtcMs: t + i.dtMs }];
    case 'freeze':
    case 'unfreeze':
    case 'clearMark':
    case 'capture':
    case 'again':
    case 'restart':
      return [{ kind: i.kind, timeUtcMs: t }];
    case 'mark': {
      const point = i.inside
        ? { xPx: FIXTURE_LAYOUT.elementWidthPx * i.u, yPx: FIXTURE_LAYOUT.elementHeightPx * i.v }
        : { xPx: -1 - 100 * i.u, yPx: FIXTURE_LAYOUT.elementHeightPx * i.v };
      return [
        {
          kind: 'mark',
          timeUtcMs: t,
          point,
          layout: FIXTURE_LAYOUT,
          calibration: FIXTURE_CALIBRATION,
          tapSigmaPx: 3,
        },
      ];
    }
    case 'establishCompass':
      return [{ kind: 'establishYaw', timeUtcMs: t, from: { kind: 'compass' } }];
    case 'establishKnown':
      return [
        {
          kind: 'establishYaw',
          timeUtcMs: t,
          from: {
            kind: 'knownAzimuth',
            azimuthRad: i.azimuthRad,
            sigmaRad: 0.01,
            northReference: i.northReference,
          },
        },
      ];
    case 'hostile':
      return [hostileEvent(i.which, i.value, t, pool)];
  }
}

function fixEvent(t: number, accuracyM: number): SessionEvent {
  return {
    kind: 'positionFix',
    timeUtcMs: t,
    result: {
      ok: true,
      value: {
        position: { latRad: 0.5, lonRad: -0.7 },
        reportedAccuracyM: accuracyM,
        sigmaM: accuracyM,
        timeUtcMs: t,
      },
    },
  };
}

/** An event with a NaN or infinite time or payload: ten kinds, `value` a hostile number. */
function hostileEvent(which: number, value: number, t: number, pool: SamplePool): SessionEvent {
  const sample = pool.absolute[0];
  switch (which) {
    case 0:
      return { kind: 'tick', timeUtcMs: value };
    case 1:
      return { kind: 'freeze', timeUtcMs: value };
    case 2:
      return sample === undefined
        ? { kind: 'tick', timeUtcMs: value }
        : {
            kind: 'sample',
            timeUtcMs: t,
            result: { ok: true, value: { ...sample, timeUtcMs: value } },
          };
    case 3:
      return sample === undefined
        ? { kind: 'tick', timeUtcMs: value }
        : {
            kind: 'sample',
            timeUtcMs: t,
            result: {
              ok: true,
              value: { ...sample, timeUtcMs: t, rotation: { ...sample.rotation, betaRad: value } },
            },
          };
    case 4:
      return { kind: 'frameReset', timeUtcMs: t, event: { timeUtcMs: value, cause: 'hidden' } };
    case 5:
      return fixEvent(t, value);
    case 6:
      return {
        kind: 'positionFix',
        timeUtcMs: t,
        result: {
          ok: true,
          value: {
            position: { latRad: value, lonRad: 0 },
            reportedAccuracyM: 5,
            sigmaM: 5,
            timeUtcMs: t,
          },
        },
      };
    case 7:
      return {
        kind: 'declination',
        timeUtcMs: t,
        result: { ok: true, value: { declinationRad: value, sigmaRad: 0.01 } },
      };
    case 8:
      return {
        kind: 'establishYaw',
        timeUtcMs: t,
        from: { kind: 'knownAzimuth', azimuthRad: value, sigmaRad: value, northReference: 'true' },
      };
    default:
      return {
        kind: 'mark',
        timeUtcMs: t,
        point: { xPx: value, yPx: value },
        layout: FIXTURE_LAYOUT,
        calibration: { ...FIXTURE_CALIBRATION, fovRad: value },
        tapSigmaPx: value,
      };
  }
}

/** Runs a case: every event, and the Session after each. `transform` may freeze states (P-8.11). */
export function runSession(
  c: SessionRunCase,
  transform: (s: Session) => Session = (s) => s,
): RunRecord {
  const pool = poolFor(c);
  const initial = transform(fixtureSession(c.kind));
  const events: SessionEvent[] = [];
  const sessions: Session[] = [];
  let session = initial;
  let clockMs = T0;
  const counter = { next: 0 };
  c.intents.forEach((i, index) => {
    clockMs = Math.max(T0 - 10_000, clockMs + (c.stepsMs[index] ?? 0));
    for (const event of eventsFor(i, session, clockMs, pool, counter)) {
      events.push(event);
      session = transform(step(session, event, PARAMETERS).session);
      sessions.push(session);
      if (Number.isFinite(event.timeUtcMs)) clockMs = Math.max(clockMs, event.timeUtcMs);
    }
  });
  return { initial, events, sessions };
}

/** The pairs of Session states that Req 8.3 allows (a state may also stay as it is). */
export const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  'permission>starting',
  'permission>failed',
  'starting>live',
  'starting>failed',
  'live>frozen',
  'live>failed',
  'frozen>live',
  'frozen>captured',
  'frozen>failed',
  'captured>live',
  'failed>permission',
]);

/** The data intents only: what may arrive after a Freeze (P-10.8, P-12.9). */
export const dataIntent: fc.Arbitrary<Intent> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('samples' as const),
      n: uniformInteger(1, 30),
      frame: fc.constantFrom('absolute' as const, 'relative' as const),
      screen: fc.constantFrom('zero' as const, 'ninety' as const, 'null' as const),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('sampleFailure' as const),
      reason: fc.constantFrom('sensor_unavailable' as const, 'invalid_number' as const),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('frameReset' as const),
      cause: fc.constantFrom(...CAUSES),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('fix' as const), accuracyM: closed(1, 3000) }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: 'declination' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'declinationFailure' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('tick' as const), dtMs: closed(0, 70_000) }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('hostile' as const),
      which: fc.constantFrom(0, 2, 3, 4, 5, 6, 7),
      value: hostileNumber(),
    }),
  },
);

/**
 * Continues a run from `session` with more intents, at the given clock and time steps; returns
 * the events and the Session after them.
 */
export function continueRun(
  c: SessionRunCase,
  session: Session,
  clockMs: number,
  intents: readonly Intent[],
  stepsMs: readonly number[],
): { session: Session; events: SessionEvent[] } {
  const pool = poolFor(c);
  const counter = { next: 1000 };
  let current = session;
  let clock = clockMs;
  const events: SessionEvent[] = [];
  intents.forEach((i, index) => {
    clock = Math.max(T0 - 10_000, clock + (stepsMs[index] ?? 0));
    for (const event of eventsFor(i, current, clock, pool, counter)) {
      events.push(event);
      current = step(current, event, PARAMETERS).session;
      if (Number.isFinite(event.timeUtcMs)) clock = Math.max(clock, event.timeUtcMs);
    }
  });
  return { session: current, events };
}

/** Freezes a value and everything it holds (P-8.11): a write then throws in strict mode. */
export function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
