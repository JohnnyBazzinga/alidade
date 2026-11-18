import { invalidates, type OrientationFrame, type YawReference } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { runSession, sessionRunCase } from '../../test-support/session-run';
import { PARAMETERS } from '../../test-support/session-fixtures';
import type { SessionStateKind } from './session';
import { yawStatus } from './yaw-status';

const SEQUENCE_RUNS = 5_000;

/** One accepted Frame reset that invalidated the reference the Session held when it arrived. */
interface Loss {
  readonly frame: OrientationFrame;
  readonly resetUtcMs: number;
  /** The index of the event that delivered it. */
  readonly deliveredAt: number;
  readonly original: YawReference;
}

/** A reference counts as lost under `loss` if it is of its frame and set no later than the reset. */
function lostUnder(y: YawReference | null, loss: Loss): boolean {
  return y !== null && y.frame === loss.frame && y.establishedUtcMs <= loss.resetUtcMs;
}

// P-11.9 (Req 11.9, 8.14, 8.15, 8.16, 19.4): in every sequence in which a Yaw reference is
// established and the Session afterwards accepts a Frame reset that invalidates it (its cause
// invalidates the reference's frame and its time is not earlier than the reference's), in any
// state and with any events between and after, `restart` included, from the event that delivers
// the reset and for as long as the Session holds that reference or another of the same frame
// established no later than the reset's time: (a) the Yaw status is never `valid`; (b) no bearing
// capture succeeds with such a reference for a sighting frozen after that event. A reset counts
// when the Session accepted it (its history changed, no Notice), whether or not retention keeps
// it. Domain: `sessionRunCase` (times that do not increase, hostile events included).
describe('P-11.9 the Session never sights against a lost north', () => {
  it('never shows a lost reference as valid and never captures with it', () => {
    const tracker = new ErrorTracker();
    const lossesByState = new Map<SessionStateKind, number>();
    const captureOutcomes = new Map<string, number>();
    let runsWithLoss = 0;
    let checkedSessions = 0;
    let followedOthers = 0;
    let droppedByRetention = 0;
    checkProperty(
      'P-11.9',
      fc.property(sessionRunCase(), (c) => {
        const record = runSession(c);
        const losses: Loss[] = [];
        const followed = new Set<YawReference>();
        let frozenAt = -1;
        let previous = record.initial;
        let violation = '';
        record.events.forEach((event, i) => {
          const after = record.sessions[i];
          if (after === undefined) return;
          const y = previous.yawReference;
          // An accepted reset: the history changed and no Notice was set.
          if (
            event.kind === 'frameReset' &&
            after.history !== previous.history &&
            after.notice === previous.notice &&
            y !== null &&
            invalidates(y.frame, event.event.cause) &&
            event.event.timeUtcMs >= y.establishedUtcMs
          ) {
            losses.push({
              frame: y.frame,
              resetUtcMs: event.event.timeUtcMs,
              deliveredAt: i,
              original: y,
            });
            lossesByState.set(previous.state, (lossesByState.get(previous.state) ?? 0) + 1);
            if (!after.history.frameResets.some((r) => r.timeUtcMs === event.event.timeUtcMs))
              droppedByRetention += 1;
          }
          if (after.state === 'frozen' && previous.state !== 'frozen') frozenAt = i;
          // (b): a capture attempted on a sighting frozen after a loss, with a lost reference.
          if (event.kind === 'capture' && previous.state === 'frozen' && previous.frozen !== null) {
            const used = previous.frozen.yawReference;
            const under = losses.some(
              (loss) => frozenAt > loss.deliveredAt && lostUnder(used, loss),
            );
            if (under && previous.kind === 'bearing') {
              const outcome =
                after.state === 'captured' ? 'captured' : (after.notice?.reason ?? 'none');
              captureOutcomes.set(outcome, (captureOutcomes.get(outcome) ?? 0) + 1);
              if (after.state === 'captured')
                violation ||= 'a bearing captured with a lost reference after the reset';
            }
          }
          // (a): the Yaw status of a held lost reference.
          const held = after.yawReference;
          const loss = losses.find((l) => lostUnder(held, l));
          if (held !== null && loss !== undefined) {
            checkedSessions += 1;
            if (held !== loss.original && !followed.has(held)) {
              followed.add(held);
              followedOthers += 1;
            }
            const status = yawStatus(
              held,
              after.history.frameResets,
              after.nowUtcMs ?? 0,
              PARAMETERS.yawReferenceMaxAgeMs,
            );
            if (status.status === 'valid') violation ||= `valid after the reset, in ${after.state}`;
          }
          previous = after;
        });
        if (losses.length > 0) runsWithLoss += 1;
        tracker.record('violations (must be 0)', violation === '' ? 0 : 1, '0', violation);
        if (violation !== '') throw new Error(violation);
        return true;
      }),
      tracker,
      { numRuns: cappedRuns(SEQUENCE_RUNS) },
    );
    console.log(
      `[coverage] P-11.9: ${runsWithLoss} runs with an accepted invalidating reset; resets by state ${JSON.stringify(Object.fromEntries([...lossesByState].sort()))}; ${droppedByRetention} not kept by retention; ${followedOthers} other references of the same frame followed; ${checkedSessions} Sessions checked under (a); captures under (b) ${JSON.stringify(Object.fromEntries([...captureOutcomes].sort()))}`,
    );
    for (const state of [
      'live',
      'frozen',
      'captured',
      'failed',
      'permission',
      'starting',
    ] as const) {
      expect(lossesByState.get(state) ?? 0, state).toBeGreaterThan(0);
    }
    expect([...captureOutcomes.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
