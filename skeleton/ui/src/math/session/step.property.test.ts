import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deepSame } from '../../test-support/deep-same';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed, uniformInteger } from '../../test-support/generators';
import { allFinite } from '../../test-support/hostile';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import {
  ALLOWED_TRANSITIONS,
  continueRun,
  dataIntent,
  deepFreeze,
  runSession,
  sessionRunCase,
  type RunRecord,
} from '../../test-support/session-run';
import { PARAMETERS } from '../../test-support/session-fixtures';
import { captureFrozen } from './capture';
import { step } from './step';
import type { Session, SessionStateKind } from './session';
import { isActionEvent, type SessionEvent } from './session-events';

/** The capped count of the Session-sequence properties (design §8, revised at checkpoint 15). */
const SEQUENCE_RUNS = 5_000;
/** P-8.11 replays every run twice on deep-frozen state (checkpoint 15). */
const PURITY_RUNS = 2_000;

/** Counts the runs that reach each state, and fails the property's coverage if under 10 %. */
class Coverage {
  private readonly counts = new Map<SessionStateKind, number>();
  private runs = 0;
  add(record: RunRecord): void {
    this.runs += 1;
    for (const state of new Set(record.sessions.map((s) => s.state))) {
      this.counts.set(state, (this.counts.get(state) ?? 0) + 1);
    }
  }
  check(id: string): void {
    const share = (state: SessionStateKind) =>
      (this.counts.get(state) ?? 0) / Math.max(1, this.runs);
    const line = (['frozen', 'captured', 'failed'] as const)
      .map((s) => `${s} ${(share(s) * 100).toFixed(1)} %`)
      .join(', ');
    console.log(`[coverage] ${id}: ${this.runs} runs; ${line}`);
    for (const state of ['frozen', 'captured', 'failed'] as const)
      expect(share(state), `${id} ${state}`).toBeGreaterThanOrEqual(0.1);
  }
}

// P-8.9 (Req 8.9): `step` never throws, and every number in the Session after every event is
// finite (a deep scan: the history, the readout, the Frozen sighting, the captured result).
// Domain: `sessionRunCase` (design §8 `sessionRun`).
describe('P-8.9 step is total', () => {
  it('never throws and holds only finite numbers', () => {
    const tracker = new ErrorTracker();
    const coverage = new Coverage();
    checkProperty(
      'P-8.9',
      fc.property(sessionRunCase(), (c) => {
        const record = runSession(c);
        coverage.add(record);
        const bad = record.sessions.filter((s) => !allFinite(s)).length;
        tracker.record('Sessions with a non-finite number (must be 0)', bad, '0');
        return bad === 0;
      }),
      tracker,
      { numRuns: cappedRuns(SEQUENCE_RUNS) },
    );
    coverage.check('P-8.9');
  });
});

// P-8.10 (Req 8.10): every consecutive pair of states is a transition of Req 8.3 or the same state.
describe('P-8.10 only the transitions of Req 8.3', () => {
  it('takes no other transition', () => {
    const tracker = new ErrorTracker();
    const coverage = new Coverage();
    const seen = new Set<string>();
    checkProperty(
      'P-8.10',
      fc.property(sessionRunCase(), (c) => {
        const record = runSession(c);
        coverage.add(record);
        let previous: Session = record.initial;
        let bad = 0;
        for (const s of record.sessions) {
          if (s.state !== previous.state) {
            const pair = `${previous.state}>${s.state}`;
            seen.add(pair);
            if (!ALLOWED_TRANSITIONS.has(pair)) bad += 1;
          }
          previous = s;
        }
        tracker.record('transitions outside Req 8.3 (must be 0)', bad, '0');
        return bad === 0;
      }),
      tracker,
      { numRuns: cappedRuns(SEQUENCE_RUNS) },
    );
    coverage.check('P-8.10');
    expect(seen).toEqual(ALLOWED_TRANSITIONS);
  });
});

// P-8.11 (Req 8.11): two runs of the same sequence are equal (Object.is on numbers), and no
// `step` modifies its arguments: every Session, event and the parameters are deeply frozen
// before each step, so a write throws (ES modules are strict) and fails the property.
describe('P-8.11 step is pure', () => {
  it('gives equal results twice and writes to nothing it is given', () => {
    const tracker = new ErrorTracker();
    const coverage = new Coverage();
    deepFreeze(PARAMETERS);
    checkProperty(
      'P-8.11',
      fc.property(sessionRunCase(), (c) => {
        const first = runSession(c);
        const second = runSession(c, (s) => deepFreeze(s));
        coverage.add(first);
        // Replaying the frozen events on frozen Sessions, one by one.
        let session = deepFreeze(second.initial);
        for (const event of second.events)
          session = deepFreeze(step(session, deepFreeze(event), PARAMETERS).session);
        const same =
          first.sessions.length === second.sessions.length &&
          first.sessions.every((s, i) => deepSame(s, second.sessions[i])) &&
          deepSame(session, first.sessions[first.sessions.length - 1] ?? first.initial);
        tracker.record('runs that differ (must be 0)', same ? 0 : 1, '0');
        return same;
      }),
      tracker,
      { numRuns: cappedRuns(PURITY_RUNS) },
    );
    coverage.check('P-8.11');
  });
});

/** The states in which an action event is offered (Req 8.3, 11.1, D24). */
function offered(event: SessionEvent, state: SessionStateKind): boolean {
  switch (event.kind) {
    case 'freeze':
      return state === 'live';
    case 'unfreeze':
    case 'mark':
    case 'clearMark':
    case 'capture':
      return state === 'frozen';
    case 'again':
      return state === 'captured';
    case 'restart':
      return state === 'failed';
    case 'establishYaw':
      return state === 'live' || (state === 'frozen' && event.from.kind === 'knownAzimuth');
    default:
      return true;
  }
}

/** The failure a data event carries, if any. */
function carried(event: SessionEvent): string | null {
  if ('result' in event && !event.result.ok) return event.result.reason;
  return null;
}

// P-8.12 (Req 8.12, 8.4, D5): every failure a data event carries is, with its reason, in the
// `failure` or the Notice of the Session that same step returns, in a Session of either kind and
// every state; an action event that fits no transition gets `action_not_available`.
describe('P-8.12 no failure is dropped', () => {
  it('records each carried failure and refuses each action not offered', () => {
    const tracker = new ErrorTracker();
    const coverage = new Coverage();
    const reasons = new Set<string>();
    let refusedActions = 0;
    checkProperty(
      'P-8.12',
      fc.property(sessionRunCase(), (c) => {
        const record = runSession(c);
        coverage.add(record);
        let previous: Session = record.initial;
        let bad = 0;
        record.events.forEach((event, i) => {
          const after = record.sessions[i];
          if (after === undefined) return;
          const timeOk = Number.isFinite(event.timeUtcMs);
          const reason = carried(event);
          if (reason !== null && timeOk && !isActionEvent(event)) {
            reasons.add(`${event.kind}:${reason}`);
            // Req 8.16: the time recorded is the Session's time, the largest event time seen.
            const handledUtcMs =
              previous.nowUtcMs === null
                ? event.timeUtcMs
                : Math.max(previous.nowUtcMs, event.timeUtcMs);
            const inNotice =
              after.notice?.reason === reason && after.notice.atUtcMs === handledUtcMs;
            const inFailure =
              after.state === 'failed' &&
              after.failure?.reason === reason &&
              after.failure.atUtcMs === handledUtcMs;
            if (!inNotice && !inFailure) bad += 1;
          }
          if (isActionEvent(event) && timeOk && !offered(event, previous.state)) {
            refusedActions += 1;
            if (after.notice?.reason !== 'action_not_available') bad += 1;
          }
          if (
            !isActionEvent(event) &&
            after.notice?.reason === 'action_not_available' &&
            after.notice !== previous.notice
          ) {
            bad += 1;
          }
          previous = after;
        });
        tracker.record('dropped failures or wrong Notices (must be 0)', bad, '0');
        return bad === 0;
      }),
      tracker,
      { numRuns: cappedRuns(SEQUENCE_RUNS) },
    );
    coverage.check('P-8.12');
    expect(refusedActions).toBeGreaterThan(0);
    console.log(
      `[coverage] P-8.12 carried failures seen: ${[...reasons].sort().join(', ')}; refused actions ${refusedActions}`,
    );
  });
});

/**
 * Domain (P-10.8, P-12.9): `sessionRunCase` runs that reach `frozen`; from the first frozen
 * Session, 0 to 40 further data intents (`dataIntent`: samples of either frame and any Screen
 * angle, sample failures, Frame resets of every cause, fixes, Declinations and their failures,
 * ticks, and hostile data events), with time steps in [-3000, 400] ms.
 */
const afterFreezeCase = fc.record({
  c: sessionRunCase(),
  extra: uniformInteger(0, 40).chain((n) => fc.array(dataIntent, { minLength: n, maxLength: n })),
  steps: fc.array(
    fc.oneof({ weight: 9, arbitrary: closed(0, 400) }, { weight: 1, arbitrary: closed(-3000, 0) }),
    {
      minLength: 40,
      maxLength: 40,
    },
  ),
});

// P-10.8 (Req 10.8) and P-12.9 (Req 12.9): after a Freeze, any further samples, Frame resets,
// positions and Declinations, with any times, leave the Frozen sighting and the capture made from
// it exactly as they are without them.
describe('P-10.8 and P-12.9 nothing reaches the Frozen sighting', () => {
  it('keeps the Frozen sighting and the capture', () => {
    const tracker = new ErrorTracker();
    let reached = 0;
    let captured = 0;
    checkProperty(
      'P-10.8 / P-12.9',
      fc.property(afterFreezeCase, ({ c, extra, steps }) => {
        const record = runSession(c);
        const index = record.sessions.findIndex((s) => s.state === 'frozen');
        fc.pre(index >= 0);
        const frozen = record.sessions[index];
        if (frozen === undefined || frozen.frozen === null) return false;
        reached += 1;
        const clock = frozen.nowUtcMs ?? 0;
        const later = continueRun(c, frozen, clock, extra, steps).session;
        const sameSighting = later.state === 'frozen' && deepSame(later.frozen, frozen.frozen);
        tracker.record('Frozen sightings changed (must be 0)', sameSighting ? 0 : 1, '0');
        const before = captureFrozen(frozen.kind, frozen.frozen, PARAMETERS);
        const after =
          later.frozen === null ? null : captureFrozen(later.kind, later.frozen, PARAMETERS);
        if (before.ok) captured += 1;
        // Through `step` as well: the capture event at the same time.
        const t = frozen.nowUtcMs ?? 0;
        const viaStepBefore = step(frozen, { kind: 'capture', timeUtcMs: t }, PARAMETERS).session
          .captured;
        const viaStepAfter = step(later, { kind: 'capture', timeUtcMs: t }, PARAMETERS).session
          .captured;
        const sameCapture = deepSame(before, after) && deepSame(viaStepBefore, viaStepAfter);
        tracker.record('captures changed (must be 0)', sameCapture ? 0 : 1, '0');
        return sameSighting && sameCapture;
      }),
      tracker,
      { numRuns: cappedRuns(SEQUENCE_RUNS) },
    );
    console.log(
      `[coverage] P-10.8 / P-12.9: ${reached} runs reached frozen, ${captured} of them with a capture that succeeds`,
    );
    expect(captured).toBeGreaterThan(0);
  });
});
