import { describe, expect, it } from 'vitest';
import { buildHistoryFromRun } from '../../test-support/history-from-script';
import {
  FIXTURE_CALIBRATION,
  FIXTURE_LAYOUT,
  PARAMETERS,
  T0,
  fixtureScript,
  liveSession,
  run,
} from '../../test-support/session-fixtures';
import type { SessionEvent } from './session-events';
import { yawStatus } from './yaw-status';

const RELATIVE_SCRIPT = fixtureScript({
  frame: { kind: 'relative', zeroRad: 2, resets: [] },
  heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
  pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.1, rollRad: 0 }],
});

function statusOf(session: {
  yawReference: Parameters<typeof yawStatus>[0];
  history: { frameResets: Parameters<typeof yawStatus>[1] };
  nowUtcMs: number | null;
}) {
  return yawStatus(
    session.yawReference,
    session.history.frameResets,
    session.nowUtcMs ?? 0,
    PARAMETERS.yawReferenceMaxAgeMs,
  ).status;
}

describe('the Session never sights against a lost north (Req 11.9, 8.16)', () => {
  // The case of the review of checkpoint 15: north from the compass, a `hidden` reset at
  // T0+3100, then the clock steps back 1.5 s and samples arrive stamped T0+1650 to T0+2900, then
  // freeze and capture at T0+2900. The Frozen window used to end at T0+2900, before the reset's
  // time, and the capture succeeded with the lost reference.
  it('does not capture with the lost reference after the clock steps back', () => {
    const { session } = liveSession('bearing', RELATIVE_SCRIPT, 3050);
    const pool = buildHistoryFromRun({
      script: RELATIVE_SCRIPT,
      seed: 1,
      steps: [{ aim: null, advanceToUtcMs: T0 + 3000 }],
    }).samples;
    const late: SessionEvent[] = pool
      .filter((s) => s.timeUtcMs >= T0 + 1650 && s.timeUtcMs <= T0 + 2900)
      .map((s) => ({ kind: 'sample', timeUtcMs: s.timeUtcMs, result: { ok: true, value: s } }));
    expect(late).toHaveLength(26);
    const result = run(session, [
      { kind: 'establishYaw', timeUtcMs: T0 + 3050, from: { kind: 'compass' } },
      {
        kind: 'frameReset',
        timeUtcMs: T0 + 3100,
        event: { timeUtcMs: T0 + 3100, cause: 'hidden' },
      },
      ...late,
      { kind: 'freeze', timeUtcMs: T0 + 2900 },
      { kind: 'capture', timeUtcMs: T0 + 2900 },
    ]);
    const established = result.sessions[0];
    expect(established?.yawReference).not.toBeNull();
    expect(result.session.state).not.toBe('captured');
    expect(result.session.captured).toBeNull();
    expect(result.session.notice?.reason).toBe('frame_reset');
    expect(statusOf(result.session)).toBe('invalidated');
    // The Frozen window is the Session's time, not the stepped-back clock (Req 8.16).
    expect(result.session.frozen?.window.endUtcMs).toBe(T0 + 3100);
  });

  it('keeps the capture of a sighting frozen before the reset was delivered (Req 10.8)', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const result = run(session, [
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      { kind: 'freeze', timeUtcMs: endUtcMs },
      {
        kind: 'frameReset',
        timeUtcMs: endUtcMs + 100,
        event: { timeUtcMs: endUtcMs + 100, cause: 'hidden' },
      },
      { kind: 'capture', timeUtcMs: endUtcMs + 200 },
    ]);
    expect(result.session.state).toBe('captured');
    expect(statusOf(result.session)).toBe('invalidated');
  });

  // Decision 1 of the review: a reference established in `frozen` over a Frozen window from before
  // the reset is established before the reset's time, so it is lost too.
  it('treats a reference set in frozen over a window from before the reset as lost', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const result = run(session, [
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      { kind: 'freeze', timeUtcMs: endUtcMs },
      {
        kind: 'frameReset',
        timeUtcMs: endUtcMs + 100,
        event: { timeUtcMs: endUtcMs + 100, cause: 'hidden' },
      },
      {
        kind: 'mark',
        timeUtcMs: endUtcMs + 150,
        point: { xPx: 195, yPx: 422 },
        layout: FIXTURE_LAYOUT,
        calibration: FIXTURE_CALIBRATION,
        tapSigmaPx: 2,
      },
      {
        kind: 'establishYaw',
        timeUtcMs: endUtcMs + 200,
        from: { kind: 'knownAzimuth', azimuthRad: 1, sigmaRad: 0.002, northReference: 'true' },
      },
      { kind: 'capture', timeUtcMs: endUtcMs + 300 },
      { kind: 'again', timeUtcMs: endUtcMs + 400 },
    ]);
    const [established, , , , known, captured, again] = result.sessions;
    if (!established || !known || !captured || !again) throw new Error('sessions');
    expect(known.yawReference).not.toBe(established.yawReference);
    expect(known.yawReference?.establishedUtcMs).toBe(endUtcMs);
    expect(captured.state).toBe('captured');
    expect(again.state).toBe('live');
    expect(again.yawReference).toBe(known.yawReference);
    expect(statusOf(again)).toBe('invalidated');
    const readout = run(again, [{ kind: 'tick', timeUtcMs: endUtcMs + 650 }]).session.readout;
    // The window ending at endUtcMs + 650 holds the samples up to endUtcMs; the reset lies in it.
    expect(
      readout === null ||
        !readout.azimuth.ok ||
        readout.azimuth.value.northReference === 'relative',
    ).toBe(true);
    expect(readout?.azimuth.ok && readout.azimuth.value.northReference === 'true').toBe(false);
  });
});
