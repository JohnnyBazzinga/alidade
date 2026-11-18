import type { SensorFailure } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { UI_REASONS } from '../../reasons';
import {
  FIXTURE_CALIBRATION,
  FIXTURE_DECLINATION,
  FIXTURE_LAYOUT,
  PARAMETERS,
  T0,
  fixtureScript,
  fixtureSession,
  liveSession,
  run,
  sessionInState,
} from '../../test-support/session-fixtures';
import { createSession, step } from './step';
import { yawStatus } from './yaw-status';
import type { Session, SessionKind, SessionStateKind } from './session';
import type { ActionEvent, DataEvent, SessionEvent } from './session-events';

const STATES: readonly SessionStateKind[] = [
  'permission',
  'starting',
  'live',
  'frozen',
  'captured',
  'failed',
];
const KINDS: readonly SessionKind[] = ['bearing', 'altitude'];

function at(timeUtcMs: number): { timeUtcMs: number } {
  return { timeUtcMs };
}

function applyEvent(session: Session, event: SessionEvent) {
  return step(session, event, PARAMETERS);
}

describe('createSession (Req 8.3, 19.4)', () => {
  it('begins in permission with an empty history and nothing held', () => {
    for (const kind of KINDS) {
      const created = createSession(kind, PARAMETERS);
      expect(created.ok).toBe(true);
      if (!created.ok) continue;
      const s = created.value;
      expect(s.state).toBe('permission');
      expect(s.kind).toBe(kind);
      expect(s.history.samples).toHaveLength(0);
      expect([
        s.yawReference,
        s.declination,
        s.readout,
        s.frozen,
        s.captured,
        s.failure,
        s.notice,
      ]).toEqual([null, null, null, null, null, null, null]);
      expect([s.lastReadoutUtcMs, s.nowUtcMs]).toEqual([null, null]);
    }
  });

  it('refuses invalid parameters, naming them', () => {
    expect(createSession('bearing', { ...PARAMETERS, windowLengthMs: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'windowLengthMs',
    });
  });
});

describe('every transition of Req 8.3 (Req 21.4)', () => {
  it('permission, granted or not required -> starting, asking for orientation; positions for a bearing only', () => {
    for (const value of ['granted', 'not_required'] as const) {
      const bearing = applyEvent(fixtureSession('bearing'), {
        kind: 'permissionResult',
        ...at(T0),
        result: { ok: true, value },
      });
      expect(bearing.session.state).toBe('starting');
      expect(bearing.effects).toEqual([{ kind: 'startOrientation' }, { kind: 'startPositions' }]);
      const altitude = applyEvent(fixtureSession('altitude'), {
        kind: 'permissionResult',
        ...at(T0),
        result: { ok: true, value },
      });
      expect(altitude.session.state).toBe('starting');
      expect(altitude.effects).toEqual([{ kind: 'startOrientation' }]);
    }
  });

  it('permission, a failure -> failed with that failure and the time', () => {
    const result = applyEvent(fixtureSession('bearing'), {
      kind: 'permissionResult',
      ...at(T0 + 5),
      result: { ok: false, reason: 'permission_denied' },
    });
    expect(result.session.state).toBe('failed');
    expect(result.session.failure).toEqual({ reason: 'permission_denied', atUtcMs: T0 + 5 });
    expect(result.effects).toEqual([]);
  });

  it('starting, orientation started -> live; a failure -> failed', () => {
    const { session } = sessionInState('starting', 'bearing');
    const live = applyEvent(session, {
      kind: 'orientationStarted',
      ...at(T0),
      result: { ok: true, value: 'absolute' },
    });
    expect(live.session.state).toBe('live');
    const failed = applyEvent(session, {
      kind: 'orientationStarted',
      ...at(T0),
      result: { ok: false, reason: 'sensor_unavailable' },
    });
    expect(failed.session.state).toBe('failed');
    expect(failed.session.failure?.reason).toBe('sensor_unavailable');
  });

  it('live, a successful freeze -> frozen', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    const result = applyEvent(session, { kind: 'freeze', ...at(endUtcMs) });
    expect(result.session.state).toBe('frozen');
    expect(result.session.frozen?.frozenAtUtcMs).toBe(endUtcMs);
    expect(result.session.notice).toBeNull();
  });

  it('frozen, unfreeze -> live, dropping the Frozen sighting and the Mark', () => {
    const { session, endUtcMs } = sessionInState('frozen', 'bearing');
    const marked = applyEvent(session, {
      kind: 'mark',
      ...at(endUtcMs),
      point: { xPx: 250, yPx: 300 },
      layout: FIXTURE_LAYOUT,
      calibration: FIXTURE_CALIBRATION,
      tapSigmaPx: 3,
    });
    expect(marked.session.frozen?.mark).not.toBeNull();
    const result = applyEvent(marked.session, { kind: 'unfreeze', ...at(endUtcMs) });
    expect(result.session.state).toBe('live');
    expect(result.session.frozen).toBeNull();
  });

  it('frozen, a successful capture -> captured, dropping the Frozen sighting', () => {
    for (const kind of KINDS) {
      const { session, endUtcMs } = sessionInState('frozen', kind);
      const result = applyEvent(session, { kind: 'capture', ...at(endUtcMs) });
      expect(result.session.state).toBe('captured');
      expect(result.session.frozen).toBeNull();
      expect(result.session.captured?.kind).toBe(kind);
    }
  });

  it('captured, again -> live', () => {
    const { session, endUtcMs } = sessionInState('captured', 'bearing');
    const result = applyEvent(session, { kind: 'again', ...at(endUtcMs) });
    expect(result.session.state).toBe('live');
    expect(result.session.captured).toBeNull();
  });

  it('failed, restart -> permission, keeping the Frame resets, the Yaw reference and the Declination and dropping the samples', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const withReset = run(session, [
      { kind: 'frameReset', ...at(endUtcMs), event: { timeUtcMs: endUtcMs, cause: 'hidden' } },
      { kind: 'camera', ...at(endUtcMs + 1), result: { ok: false, reason: 'camera_track_ended' } },
    ]).session;
    expect(withReset.state).toBe('failed');
    expect(withReset.history.samples.length).toBeGreaterThan(0);
    const result = applyEvent(withReset, { kind: 'restart', ...at(endUtcMs + 2) });
    expect(result.session.state).toBe('permission');
    expect(result.session.failure).toBeNull();
    expect(result.session.history.samples).toHaveLength(0);
    expect(result.session.history.frameResets).toEqual(withReset.history.frameResets);
    expect(result.session.history.frameResets).toHaveLength(1);
    expect(result.session.declination).toEqual(FIXTURE_DECLINATION);
    expect(result.session.readout).toBeNull();
  });

  it('keeps the Yaw reference over a restart', () => {
    const script = fixtureScript({
      frame: { kind: 'relative', zeroRad: 2, resets: [] },
      heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
      pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.1, rollRad: 0 }],
    });
    const { session, endUtcMs } = liveSession('bearing', script);
    const withYaw = applyEvent(session, {
      kind: 'establishYaw',
      ...at(endUtcMs),
      from: { kind: 'compass' },
    }).session;
    expect(withYaw.yawReference).not.toBeNull();
    const failed = applyEvent(withYaw, {
      kind: 'camera',
      ...at(endUtcMs + 1),
      result: { ok: false, reason: 'camera_failed' },
    }).session;
    const restarted = applyEvent(failed, { kind: 'restart', ...at(endUtcMs + 2) }).session;
    expect(restarted.yawReference).toEqual(withYaw.yawReference);
  });

  it('a camera failure -> failed from every state but captured and failed', () => {
    for (const state of ['permission', 'starting', 'live', 'frozen'] as const) {
      const { session, endUtcMs } = sessionInState(state, 'bearing');
      const result = applyEvent(session, {
        kind: 'camera',
        ...at(endUtcMs),
        result: { ok: false, reason: 'camera_track_ended' },
      });
      expect(result.session.state, state).toBe('failed');
      expect(result.session.failure?.reason).toBe('camera_track_ended');
      expect(result.session.frozen).toBeNull();
    }
  });

  it('a camera failure in captured is a Notice and the result is kept', () => {
    const { session, endUtcMs } = sessionInState('captured', 'bearing');
    const result = applyEvent(session, {
      kind: 'camera',
      ...at(endUtcMs),
      result: { ok: false, reason: 'camera_track_ended' },
    });
    expect(result.session.state).toBe('captured');
    expect(result.session.captured).toBe(session.captured);
    expect(result.session.notice?.reason).toBe('camera_track_ended');
  });

  it('a camera that works changes nothing', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    expect(
      applyEvent(session, { kind: 'camera', ...at(endUtcMs), result: { ok: true, value: null } })
        .session,
    ).toBe(session);
  });
});

describe('action events in a state that does not offer it (Req 8.4)', () => {
  const OFFERED: Record<string, readonly SessionStateKind[]> = {
    freeze: ['live'],
    unfreeze: ['frozen'],
    mark: ['frozen'],
    clearMark: ['frozen'],
    capture: ['frozen'],
    again: ['captured'],
    restart: ['failed'],
    establishCompass: ['live'],
    establishKnown: ['live', 'frozen'],
  };

  function actions(endUtcMs: number): [string, ActionEvent][] {
    return [
      ['freeze', { kind: 'freeze', ...at(endUtcMs) }],
      ['unfreeze', { kind: 'unfreeze', ...at(endUtcMs) }],
      [
        'mark',
        {
          kind: 'mark',
          ...at(endUtcMs),
          point: { xPx: 100, yPx: 100 },
          layout: FIXTURE_LAYOUT,
          calibration: FIXTURE_CALIBRATION,
          tapSigmaPx: 1,
        },
      ],
      ['clearMark', { kind: 'clearMark', ...at(endUtcMs) }],
      ['capture', { kind: 'capture', ...at(endUtcMs) }],
      ['again', { kind: 'again', ...at(endUtcMs) }],
      ['restart', { kind: 'restart', ...at(endUtcMs) }],
      ['establishCompass', { kind: 'establishYaw', ...at(endUtcMs), from: { kind: 'compass' } }],
      [
        'establishKnown',
        {
          kind: 'establishYaw',
          ...at(endUtcMs),
          from: { kind: 'knownAzimuth', azimuthRad: 1, sigmaRad: 0.01, northReference: 'true' },
        },
      ],
    ];
  }

  for (const kind of KINDS) {
    for (const state of STATES) {
      it(`${kind} Session in ${state}: refuses each action it does not offer, changing nothing else`, () => {
        const { session, endUtcMs } = sessionInState(state, kind);
        for (const [name, event] of actions(endUtcMs)) {
          if (OFFERED[name]?.includes(state)) continue;
          const result = applyEvent(session, event);
          expect(result.effects, name).toEqual([]);
          expect(result.session.notice?.reason, name).toBe('action_not_available');
          expect(result.session, name).toEqual({
            ...session,
            nowUtcMs: result.session.nowUtcMs,
            notice: result.session.notice,
          });
        }
      });
    }
  }
});

describe('data events that carry a failure (Req 8.4, 8.5, 8.12, D5)', () => {
  const FAILURES: SensorFailure[] = [
    { ok: false, reason: 'sensor_unavailable', field: 'alphaDeg' },
    { ok: false, reason: 'coarse_location', reportedAccuracyM: 840 },
    { ok: false, reason: 'permission_denied' },
  ];

  function failureEvents(timeUtcMs: number, failure: SensorFailure): DataEvent[] {
    return [
      { kind: 'permissionResult', timeUtcMs, result: failure },
      { kind: 'orientationStarted', timeUtcMs, result: failure },
      { kind: 'sample', timeUtcMs, result: failure },
      { kind: 'positionFix', timeUtcMs, result: failure },
      { kind: 'declination', timeUtcMs, result: failure },
    ];
  }

  for (const kind of KINDS) {
    for (const state of STATES) {
      it(`${kind} Session in ${state}: every failure is recorded with its reason, never dropped`, () => {
        const { session, endUtcMs } = sessionInState(state, kind);
        for (const failure of FAILURES) {
          for (const event of failureEvents(endUtcMs, failure)) {
            const result = applyEvent(session, event);
            const recorded =
              result.session.state === 'failed' && session.state !== 'failed'
                ? result.session.failure
                : result.session.notice;
            expect(recorded?.reason, `${event.kind} ${failure.reason}`).toBe(failure.reason);
            if (failure.field !== undefined) expect(recorded?.field).toBe(failure.field);
            if (failure.reportedAccuracyM !== undefined) {
              expect(recorded?.reportedAccuracyM).toBe(failure.reportedAccuracyM);
            }
            expect(recorded?.atUtcMs).toBe(endUtcMs);
            // A failing data event never gives `action_not_available`.
            expect(recorded?.reason).not.toBe('action_not_available');
          }
        }
      });
    }
  }

  it('a sample failure in live stays live (Req 8.5)', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    const result = applyEvent(session, {
      kind: 'sample',
      ...at(endUtcMs + 20),
      result: { ok: false, reason: 'sensor_unavailable', field: 'betaDeg' },
    });
    expect(result.session.state).toBe('live');
    expect(result.session.notice?.reason).toBe('sensor_unavailable');
    expect(result.session.history).toBe(session.history);
  });

  it('a position or Declination failure reaches an altitude Session as a Notice too', () => {
    const { session, endUtcMs } = sessionInState('live', 'altitude');
    for (const kind of ['positionFix', 'declination'] as const) {
      const result = applyEvent(session, {
        kind,
        ...at(endUtcMs),
        result: { ok: false, reason: 'position_unavailable' },
      });
      expect(result.session.notice?.reason).toBe('position_unavailable');
    }
  });

  it('a data event that carries no failure and fits no transition is dropped with no Notice', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    const dropped = applyEvent(session, {
      kind: 'orientationStarted',
      ...at(endUtcMs),
      result: { ok: true, value: 'absolute' },
    });
    expect(dropped.session).toBe(session);
    const permission = applyEvent(session, {
      kind: 'permissionResult',
      ...at(endUtcMs),
      result: { ok: true, value: 'granted' },
    });
    expect(permission.session).toBe(session);
  });

  it('a camera failure keeps its own reason for every UI camera reason', () => {
    for (const reason of UI_REASONS.filter(
      (r) => r.startsWith('camera_') || r === 'wrong_camera',
    )) {
      const result = applyEvent(fixtureSession('bearing'), {
        kind: 'camera',
        ...at(T0),
        result: { ok: false, reason },
      });
      expect(result.session.failure?.reason).toBe(reason);
    }
  });
});

describe('an altitude Session never asks for positions or a Declination (Req 8.13)', () => {
  it('asks for no positions and records neither a fix nor a Declination', () => {
    const { session, effects } = run(fixtureSession('altitude'), [
      { kind: 'permissionResult', ...at(T0), result: { ok: true, value: 'granted' } },
    ]);
    expect(effects).toEqual([{ kind: 'startOrientation' }]);
    const live = liveSession('altitude');
    expect(live.session.history.positionFix).toBeNull();
    expect(live.session.declination).toBeNull();
    expect(session.state).toBe('starting');
    const bearing = liveSession('bearing');
    expect(bearing.session.history.positionFix).not.toBeNull();
    expect(bearing.session.declination).toEqual(FIXTURE_DECLINATION);
  });
});

describe('items stamped later than their event (Req 8.15)', () => {
  // Shrunk counterexample of P-11.9 (checkpoint 15): a reset stamped 4.76e223 ms made the
  // history drop the real reset, and the lost north read `valid` again.
  it('refuses a Frame reset stamped after its event, keeping the real reset and the invalidation', () => {
    const script = fixtureScript({
      frame: { kind: 'relative', zeroRad: 2, resets: [] },
      heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
      pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.1, rollRad: 0 }],
    });
    const { session, endUtcMs } = liveSession('bearing', script);
    const established = applyEvent(session, {
      kind: 'establishYaw',
      ...at(endUtcMs),
      from: { kind: 'compass' },
    }).session;
    const y = established.yawReference;
    if (y === null) throw new Error('reference');
    const real = { timeUtcMs: endUtcMs + 100, cause: 'hidden' as const };
    const reset = applyEvent(established, {
      kind: 'frameReset',
      ...at(endUtcMs + 100),
      event: real,
    }).session;
    const hostile = applyEvent(reset, {
      kind: 'frameReset',
      ...at(endUtcMs + 200),
      event: { timeUtcMs: 4.759331909084099e223, cause: 'hidden' },
    });
    expect(hostile.session.notice).toEqual({
      reason: 'invalid_number',
      field: 'timeUtcMs',
      atUtcMs: endUtcMs + 200,
    });
    expect(hostile.session.history).toBe(reset.history);
    expect(hostile.session.history.frameResets).toContainEqual(real);
    expect(
      yawStatus(
        y,
        hostile.session.history.frameResets,
        hostile.session.nowUtcMs ?? 0,
        PARAMETERS.yawReferenceMaxAgeMs,
      ).status,
    ).toBe('invalidated');
  });

  it('refuses a sample and a Position fix stamped after their event, and accepts equal times', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const sample = session.history.samples.at(-1);
    const fix = session.history.positionFix;
    if (sample === undefined || fix === null) throw new Error('fixture');
    const later = endUtcMs + 1000;
    for (const event of [
      {
        kind: 'sample',
        ...at(later - 1),
        result: { ok: true, value: { ...sample, timeUtcMs: later } },
      },
      {
        kind: 'positionFix',
        ...at(later - 1),
        result: { ok: true, value: { ...fix, timeUtcMs: later } },
      },
    ] as const) {
      const result = applyEvent(session, event);
      expect(result.session.notice, event.kind).toEqual({
        reason: 'invalid_number',
        field: 'timeUtcMs',
        atUtcMs: later - 1,
      });
      expect(result.session.history).toBe(session.history);
    }
    const equal = applyEvent(session, {
      kind: 'sample',
      ...at(later),
      result: { ok: true, value: { ...sample, timeUtcMs: later } },
    });
    expect(equal.session.history.samples.at(-1)?.timeUtcMs).toBe(later);
    expect(equal.session.notice).toBeNull();
  });
});

describe('events with a bad time (Req 8.8)', () => {
  // Shrunk counterexample of P-2.6: a failure carrying a NaN accuracy must not put NaN in the
  // Session (Req 8.8); the Notice keeps the reason and drops the number (the Message then shows
  // no number, Req 3.4).
  it('a coarse_location failure with a NaN accuracy is a Notice without the number', () => {
    for (const reportedAccuracyM of [Number.NaN, Infinity, -Infinity]) {
      const result = applyEvent(fixtureSession('bearing'), {
        kind: 'positionFix',
        timeUtcMs: 1790000001500,
        result: { ok: false, reason: 'coarse_location', reportedAccuracyM },
      });
      expect(result.session.notice).toEqual({ reason: 'coarse_location', atUtcMs: 1790000001500 });
    }
  });

  it('a NaN or infinite time leaves the Session unchanged but for the Notice', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    for (const timeUtcMs of [Number.NaN, Infinity, -Infinity]) {
      for (const kind of ['tick', 'freeze', 'sample', 'restart'] as const) {
        const event = (
          kind === 'sample'
            ? { kind, timeUtcMs, result: { ok: false, reason: 'sensor_unavailable' } }
            : { kind, timeUtcMs }
        ) as SessionEvent;
        const result = applyEvent(session, event);
        expect(result.effects).toEqual([]);
        expect(result.session.notice).toEqual({
          reason: 'invalid_number',
          field: 'timeUtcMs',
          atUtcMs: endUtcMs,
        });
        expect(result.session).toEqual({ ...session, notice: result.session.notice });
      }
    }
  });

  it('a time that steps back is accepted and the Session time keeps the largest', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    const result = applyEvent(session, { kind: 'tick', ...at(endUtcMs - 5000) });
    expect(result.session.nowUtcMs).toBe(endUtcMs);
  });
});

describe('the Notice (design D23, Req 8.7)', () => {
  it('is replaced by the next Notice and cleared by the next action that succeeds', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    const first = applyEvent(session, { kind: 'capture', ...at(endUtcMs) }).session;
    expect(first.notice?.reason).toBe('action_not_available');
    const second = applyEvent(first, { kind: 'unfreeze', ...at(endUtcMs + 1) }).session;
    expect(second.notice).toEqual({ reason: 'action_not_available', atUtcMs: endUtcMs + 1 });
    const cleared = applyEvent(second, { kind: 'freeze', ...at(endUtcMs + 2) }).session;
    expect(cleared.state).toBe('frozen');
    expect(cleared.notice).toBeNull();
  });

  it('a tick neither clears nor sets one, and neither does a sample that is accepted', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    const noticed = applyEvent(session, { kind: 'capture', ...at(endUtcMs) }).session;
    const afterTick = applyEvent(noticed, { kind: 'tick', ...at(endUtcMs + 1000) }).session;
    expect(afterTick.notice).toEqual(noticed.notice);
    const sample = session.history.samples[session.history.samples.length - 1];
    if (sample === undefined) throw new Error('fixture');
    const afterSample = applyEvent(afterTick, {
      kind: 'sample',
      ...at(endUtcMs + 1010),
      result: { ok: true, value: { ...sample, timeUtcMs: endUtcMs + 1010 } },
    }).session;
    expect(afterSample.notice).toEqual(noticed.notice);
  });

  it('is set by a sample that Sensors refuses, with the session otherwise unchanged', () => {
    const { session, endUtcMs } = sessionInState('live', 'bearing');
    const sample = session.history.samples[0];
    if (sample === undefined) throw new Error('fixture');
    const result = applyEvent(session, {
      kind: 'sample',
      ...at(endUtcMs),
      result: { ok: true, value: { ...sample, timeUtcMs: Number.NaN } },
    });
    expect(result.session.notice?.reason).toBe('invalid_number');
    expect(result.session.history).toBe(session.history);
  });
});

describe('Frame resets and samples are applied in every state (Req 8.6, 8.14)', () => {
  for (const state of STATES) {
    it(`${state}: a Frame reset and a sample reach the history`, () => {
      const { session, endUtcMs } = sessionInState(state, 'bearing');
      const reset = applyEvent(session, {
        kind: 'frameReset',
        ...at(endUtcMs + 10),
        event: { timeUtcMs: endUtcMs + 10, cause: 'blur' },
      });
      expect(reset.session.history.frameResets).toHaveLength(
        session.history.frameResets.length + 1,
      );
      const sample = liveSession('bearing').session.history.samples[0];
      if (sample === undefined) throw new Error('fixture');
      const added = applyEvent(session, {
        kind: 'sample',
        ...at(endUtcMs + 20),
        result: { ok: true, value: { ...sample, timeUtcMs: endUtcMs + 20 } },
      });
      expect(added.session.history.samples.length).toBe(
        Math.min(session.history.samples.length + 1, added.session.history.samples.length),
      );
      expect(added.session.history.samples.at(-1)?.timeUtcMs).toBe(endUtcMs + 20);
      if (state === 'frozen') {
        // The Frozen history is untouched (Req 10.3).
        expect(added.session.frozen?.history).toBe(session.frozen?.history);
        expect(reset.session.frozen?.history).toBe(session.frozen?.history);
      }
    });
  }
});
