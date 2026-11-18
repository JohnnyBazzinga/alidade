import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { messageFor } from '../math/messages';
import type { Session, SessionKind, SessionStateKind } from '../math/session/session';
import { fromDeg } from '../math/degrees';
import { fakeObserver } from '../test-support/fake-observe';
import {
  FIXTURE_CALIBRATION,
  FIXTURE_LAYOUT,
  PARAMETERS,
  fixtureScript,
  liveSession,
  run,
  sessionInState,
} from '../test-support/session-fixtures';
import { LIMITS_TEXT } from './LimitsNote';
import { SCREEN_TEXT, SightingScreen } from './SightingScreen';

function renderScreen(session: Session) {
  const onAction = vi.fn();
  const onRequestPermission = vi.fn();
  const utils = render(
    <SightingScreen
      session={session}
      parameters={PARAMETERS}
      onRequestPermission={onRequestPermission}
      onAction={onAction}
      sourceSize={{ widthSourcePx: 720, heightSourcePx: 1280 }}
      fit="cover"
      calibration={FIXTURE_CALIBRATION}
      tapSigmaPx={1}
      observe={fakeObserver({ widthPx: 390, heightPx: 844 }).observe}
      renderImage={(layout, frozen) => (
        <div data-testid="image" data-frozen={String(frozen)}>
          {layout === null ? 'no layout' : 'image'}
        </div>
      )}
    />,
  );
  const q = within(utils.container);
  const controls = () =>
    [...utils.container.querySelectorAll<HTMLElement>('[data-control]')].map(
      (c) => c.dataset.control,
    );
  const has = (id: string) => q.queryByTestId(id) !== null;
  return { ...utils, ...q, onAction, onRequestPermission, controls, has };
}

const text = (
  m: 'no_yaw_reference' | 'stale_yaw_reference' | 'frame_reset' | 'portrait_required',
) => {
  const message = messageFor({ ok: false, reason: m });
  return `${message.whatHappened} ${message.whatToDo}`;
};

describe('SightingScreen in each Session state (Req 8.3, 13)', () => {
  it('permission: the intro, the limits line and Start only', () => {
    const { has, controls, getByTestId, onRequestPermission, container } = renderScreen(
      sessionInState('permission', 'bearing').session,
    );
    expect(getByTestId('sighting-screen').dataset.state).toBe('permission');
    expect(container.querySelector('[data-part="intro"]')?.textContent).toBe(
      SCREEN_TEXT.permission,
    );
    expect(getByTestId('limits-note').textContent).toBe(LIMITS_TEXT);
    expect(controls()).toEqual(['start']);
    expect(has('image-surface')).toBe(false);
    expect(has('readout')).toBe(false);
    expect(has('reticle')).toBe(false);
    fireEvent.click(container.querySelector('[data-control="start"]') as HTMLElement);
    expect(onRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('starting: the image with the Reticle, the starting text and no controls', () => {
    const { has, controls, container } = renderScreen(
      sessionInState('starting', 'bearing').session,
    );
    expect(container.querySelector('[data-part="hint"]')?.textContent).toBe(SCREEN_TEXT.starting);
    expect(has('image-surface') && has('reticle')).toBe(true);
    expect(controls()).toEqual([]);
    expect(has('readout')).toBe(false);
  });

  it('live (bearing): image, readout, yaw status, hint, limits, Freeze and the north controls', () => {
    const { has, controls, container, getByTestId } = renderScreen(
      sessionInState('live', 'bearing').session,
    );
    expect(has('image-surface') && has('reticle') && has('readout') && has('yaw-status')).toBe(
      true,
    );
    expect(getByTestId('image').dataset.frozen).toBe('false');
    expect(container.querySelector('[data-part="hint"]')?.textContent).toBe(SCREEN_TEXT.liveHint);
    expect(has('limits-note') && has('known-azimuth-form')).toBe(true);
    expect(controls()).toEqual(['freeze', 'north-compass']);
    expect(getByTestId('readout').textContent).toMatch(/true|magnetic|relative/);
  });

  it('live (altitude): no Yaw status and no north controls', () => {
    const { has, controls } = renderScreen(sessionInState('live', 'altitude').session);
    expect(has('readout')).toBe(true);
    expect(has('yaw-status') || has('known-azimuth-form')).toBe(false);
    expect(controls()).toEqual(['freeze']);
  });

  it('frozen: the frozen image, the hint, Capture, Back to live and no readout', () => {
    const { has, controls, container, getByTestId } = renderScreen(
      sessionInState('frozen', 'bearing').session,
    );
    expect(getByTestId('image').dataset.frozen).toBe('true');
    expect(container.querySelector('[data-part="hint"]')?.textContent).toBe(
      `${SCREEN_TEXT.frozenHint} ${SCREEN_TEXT.notMarked}`,
    );
    expect(controls()).toEqual(['capture', 'unfreeze']);
    expect(has('readout')).toBe(false);
    expect(has('yaw-status') && has('known-azimuth-form')).toBe(true);
    const labels = [...container.querySelectorAll('button[data-control]')].map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(['Capture', 'Back to live']);
  });

  it('frozen with a Mark: says so and offers Clear mark', () => {
    const { session } = sessionInState('frozen', 'bearing');
    const marked = run(session, [
      {
        kind: 'mark',
        timeUtcMs: session.nowUtcMs ?? 0,
        point: { xPx: 100, yPx: 300 },
        layout: FIXTURE_LAYOUT,
        calibration: FIXTURE_CALIBRATION,
        tapSigmaPx: 1,
      },
    ]).session;
    expect(marked.frozen?.mark).not.toBeNull();
    const { controls, container, has } = renderScreen(marked);
    expect(container.querySelector('[data-part="hint"]')?.textContent).toContain(
      SCREEN_TEXT.marked,
    );
    expect(controls()).toEqual(['capture', 'unfreeze', 'clear-mark']);
    expect(has('mark-ring')).toBe(true);
  });

  it('captured (bearing): the result with its 1-sigma, what it is made of, the limits and Take another', () => {
    const { session } = sessionInState('captured', 'bearing');
    expect(session.state).toBe('captured');
    const { has, controls, getByTestId } = renderScreen(session);
    const summary = getByTestId('capture-summary');
    expect(summary.querySelector('[data-part="headline"]')?.textContent).toMatch(
      /^Bearing \d+\.\d° true, 1-sigma ±\d+\.\d°$/,
    );
    expect(summary.textContent).toContain('Made of:');
    expect(summary.textContent).toContain(LIMITS_TEXT);
    expect(controls()).toEqual(['again']);
    expect(has('image-surface') || has('readout')).toBe(false);
  });

  it('captured (altitude): the altitude with its 1-sigma', () => {
    const { session } = sessionInState('captured', 'altitude');
    const { getByTestId } = renderScreen(session);
    expect(
      getByTestId('capture-summary').querySelector('[data-part="headline"]')?.textContent,
    ).toMatch(/^Altitude -?\d+\.\d°, 1-sigma ±\d+\.\d°$/);
  });

  it('failed: the Message of the failure and Start again, nothing else', () => {
    const { session } = sessionInState('failed', 'bearing');
    const { has, controls, getByRole, container } = renderScreen(session);
    const message = messageFor({ ok: false, reason: 'permission_denied' });
    expect(getByRole('alert').textContent).toBe(message.whatHappened + message.whatToDo);
    expect(controls()).toEqual(['restart']);
    expect(container.querySelector('button')?.textContent).toBe('Start again');
    expect(has('image-surface') || has('readout') || has('reticle')).toBe(false);
  });

  it('presses the controls through onAction', () => {
    const { container, onAction } = renderScreen(sessionInState('live', 'bearing').session);
    fireEvent.click(container.querySelector('[data-control="freeze"]') as HTMLElement);
    fireEvent.click(container.querySelector('[data-control="north-compass"]') as HTMLElement);
    expect(onAction.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'freeze' },
      { kind: 'establishYaw', from: { kind: 'compass' } },
    ]);
  });

  it('shows a Notice through its Message in every state but failed', () => {
    for (const state of [
      'permission',
      'starting',
      'live',
      'frozen',
      'captured',
    ] as SessionStateKind[]) {
      const { session } = sessionInState(state, 'bearing');
      const withNotice = run(session, [
        {
          kind: 'positionFix',
          timeUtcMs: session.nowUtcMs ?? 0,
          result: { ok: false, reason: 'position_unavailable' },
        },
      ]).session;
      const { getByRole, unmount } = renderScreen(withNotice);
      const m = messageFor({ ok: false, reason: 'position_unavailable' });
      expect(getByRole('alert').textContent).toBe(m.whatHappened + m.whatToDo);
      unmount();
    }
  });
});

describe('the Yaw status after a Frame reset (Req 11.4, 11.9)', () => {
  const relative = fixtureScript({
    frame: { kind: 'relative', zeroRad: 2, resets: [] },
    heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
    pose: [
      {
        timeUtcMs: fixtureScript().startUtcMs,
        azimuthRad: 1,
        apparentAltitudeRad: 0.1,
        rollRad: 0,
      },
    ],
  });
  const kind: SessionKind = 'bearing';

  it('shows valid after north is set, then invalidated with the Message of frame_reset after a reset', () => {
    const live = liveSession(kind, relative);
    const set = run(live.session, [
      { kind: 'establishYaw', timeUtcMs: live.endUtcMs, from: { kind: 'compass' } },
    ]).session;
    expect(set.yawReference).not.toBeNull();
    const before = renderScreen(set);
    expect(before.getByTestId('yaw-status').dataset.status).toBe('valid');
    expect(before.getByTestId('yaw-status').textContent).toMatch(
      /^North set 0 s ago, \w+ north, ±\d+\.\d°\.$/,
    );
    before.unmount();

    const lost = run(set, [
      {
        kind: 'frameReset',
        timeUtcMs: live.endUtcMs + 3000,
        event: { timeUtcMs: live.endUtcMs + 2000, cause: 'hidden' },
      },
    ]).session;
    const after = renderScreen(lost);
    const bar = after.getByTestId('yaw-status');
    expect(bar.dataset.status).toBe('invalidated');
    expect(bar.querySelector('[data-part="line"]')?.textContent).toBe(
      'North set 3 s ago was lost.',
    );
    expect(bar.querySelector('[data-part="prompt"]')?.textContent).toBe(text('frame_reset'));
    // The user is told to set north again, and can: the control is still offered.
    expect(after.controls()).toContain('north-compass');
    expect(after.has('known-azimuth-form')).toBe(true);
  });

  it('stays invalidated when setting north again is refused (no sample after the reset yet)', () => {
    const live = liveSession(kind, relative);
    let session = run(live.session, [
      { kind: 'establishYaw', timeUtcMs: live.endUtcMs, from: { kind: 'compass' } },
      {
        kind: 'frameReset',
        timeUtcMs: live.endUtcMs + 3000,
        event: { timeUtcMs: live.endUtcMs + 2000, cause: 'blur' },
      },
    ]).session;
    expect(renderScreen(session).getByTestId('yaw-status').dataset.status).toBe('invalidated');
    session = run(session, [
      { kind: 'establishYaw', timeUtcMs: live.endUtcMs + 3000, from: { kind: 'compass' } },
    ]).session;
    // The window ends at the Session's time and holds no sample taken after the reset, so Sensors
    // refuses with its own reason; the old reference stays, and the screen still says it was lost
    // and shows the refusal beside it.
    expect(session.notice).not.toBeNull();
    const shown = renderScreen(session);
    expect(shown.getByTestId('yaw-status').dataset.status).toBe('invalidated');
    expect(shown.getAllByRole('alert')).toHaveLength(1);
  });

  it('Absolute frame, no Yaw reference: north from the phone\u2019s compass, never "not set" (Req 11.4)', () => {
    const { getByTestId } = renderScreen(sessionInState('live', 'bearing').session);
    const bar = getByTestId('yaw-status');
    expect(bar.dataset.status).toBe('none');
    expect(bar.querySelector('[data-part="line"]')?.textContent).toBe(
      'North comes from the phone\u2019s compass, 1-sigma ±2.0°.',
    );
    expect(bar.querySelector('[data-part="prompt"]')?.textContent).toBe(
      'Setting north on the Sun or a landmark reduces the error.',
    );
    expect(getByTestId('readout').querySelector('[data-part="azimuth"]')?.textContent).toMatch(
      /^\d+\.\d° (true|magnetic)$/,
    );
  });

  it('Relative frame, no Yaw reference: north is not set, with the Message of no_yaw_reference', () => {
    const { session } = liveSession(kind, relative);
    const { getByTestId } = renderScreen(session);
    const bar = getByTestId('yaw-status');
    expect(bar.dataset.status).toBe('none');
    expect(bar.querySelector('[data-part="line"]')?.textContent).toBe('North is not set.');
    expect(bar.querySelector('[data-part="prompt"]')?.textContent).toBe(text('no_yaw_reference'));
    expect(getByTestId('readout').querySelector('[data-part="azimuth"]')?.textContent).toMatch(
      /^\d+\.\d° relative$/,
    );
  });
});

describe('the live readout on the screen (Req 13.4)', () => {
  it('shows no bare ± beside the azimuth or the altitude, and the shake under its label', () => {
    const { getByTestId } = renderScreen(sessionInState('live', 'bearing').session);
    const readout = getByTestId('readout');
    expect(readout.querySelector('[data-part="azimuth"]')?.textContent).not.toContain('±');
    expect(readout.querySelector('[data-part="altitude"]')?.textContent).not.toContain('±');
    expect(readout.querySelector('[data-part="steadiness"]')?.textContent).toMatch(
      /^Steady hand: shake ±\d+\.\d\d° in azimuth, ±\d+\.\d\d° in altitude, \d+ readings$/,
    );
  });
});

describe('the Screen angle (Req 13.9)', () => {
  it('shows the Message of portrait_required when the newest sample is not upright', () => {
    const { session } = liveSession('bearing', fixtureScript({ screenAngleDeg: 90 }));
    const { getAllByRole } = renderScreen(session);
    const alerts = getAllByRole('alert').map((a) => a.textContent);
    const m = messageFor({ ok: false, reason: 'portrait_required' });
    expect(alerts).toContain(m.whatHappened + m.whatToDo);
    expect(alerts.filter((a) => a === m.whatHappened + m.whatToDo)).toHaveLength(1);
    expect(fromDeg(90)).toBeGreaterThan(0);
  });

  it('shows nothing about it when the phone is upright', () => {
    const { queryAllByRole } = renderScreen(sessionInState('live', 'bearing').session);
    expect(queryAllByRole('alert')).toHaveLength(0);
  });
});
