// The layout and the placement of a refusal (Req 13.13, 13.14; amendments of 2026-11-19).
//
// jsdom does no layout, so these tests check what the components set and the order they put their
// parts in: no part outside the image is taken out of the normal flow, no box around the screen
// has a fixed height, the control bar follows the parts it belongs to, and the Message of a refused
// action is the part directly above the control bar. That nothing overlaps at 360, 390 and 430 CSS
// px is checked by the lead in a real browser (Req 13.13).

import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SimulatorScript } from '@alidade/sensors';
import { messageFor } from '../math/messages';
import { buildCatalogue, type CatalogueScene } from '../math/scene/catalogue';
import type { Session, SessionKind, SessionStateKind } from '../math/session/session';
import type { SessionEvent } from '../math/session/session-events';
import { fakeObserver } from '../test-support/fake-observe';
import { FakeTimer } from '../test-support/fake-timer';
import { buildHistoryFromRun } from '../test-support/history-from-script';
import {
  FIXTURE_CALIBRATION,
  FIXTURE_DECLINATION,
  PARAMETERS,
  eventsOfHistory,
  fixtureScript,
  fixtureSession,
  liveSession,
  run,
  sessionInState,
} from '../test-support/session-fixtures';
import { SightingScreen } from './SightingScreen';
import { SimulatorPanel } from './SimulatorPanel';

function renderScreen(session: Session) {
  const utils = render(
    <SightingScreen
      session={session}
      parameters={PARAMETERS}
      onRequestPermission={vi.fn()}
      onAction={vi.fn()}
      sourceSize={{ widthSourcePx: 720, heightSourcePx: 1280 }}
      fit="cover"
      calibration={FIXTURE_CALIBRATION}
      tapSigmaPx={1}
      observe={fakeObserver({ widthPx: 390, heightPx: 844 }).observe}
      renderImage={() => <div data-testid="image" />}
    />,
  );
  const q = within(utils.container);
  const screen = q.getByTestId('sighting-screen');
  const bar = () => q.getByTestId('control-bar');
  const primary = () =>
    [...utils.container.querySelectorAll<HTMLElement>('[data-control]')]
      .filter((c) => c.dataset.primary === 'true')
      .map((c) => c.dataset.control);
  return { ...utils, ...q, screen, bar, primary };
}

/** `a` comes before `b` in the document. */
function before(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

const OUT_OF_FLOW = ['absolute', 'fixed', 'sticky'];
const STATES: readonly SessionStateKind[] = [
  'permission',
  'starting',
  'live',
  'frozen',
  'captured',
  'failed',
];
const KINDS: readonly SessionKind[] = ['bearing', 'altitude'];

/** A Relative-frame phone (the iPhone case) with a compass, held on one pose. */
function relativeScript(over: Partial<SimulatorScript> = {}): SimulatorScript {
  return fixtureScript({
    frame: { kind: 'relative', zeroRad: 2, resets: [] },
    heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
    ...over,
  });
}

/**
 * North set from the compass, then lost by a switch of application (a Frame reset with cause
 * `hidden`), and fresh samples afterwards: Freeze succeeds, and Capture is refused with
 * `frame_reset` (the trial of 2026-11-19).
 */
function lostNorthSession(): { session: Session; endUtcMs: number } {
  const script = relativeScript();
  const resetUtcMs = script.startUtcMs + 2000;
  const withReset = relativeScript({
    frame: {
      kind: 'relative',
      zeroRad: 2,
      resets: [{ timeUtcMs: resetUtcMs, cause: 'hidden', newZeroRad: 3 }],
    },
  });
  const built = buildHistoryFromRun({
    script: withReset,
    seed: 1,
    steps: [{ aim: null, advanceToUtcMs: script.startUtcMs + 4000 }],
  });
  const data = eventsOfHistory(built);
  const setUtcMs = script.startUtcMs + 1500;
  const events: SessionEvent[] = [
    {
      kind: 'permissionResult',
      timeUtcMs: script.startUtcMs,
      result: { ok: true, value: 'not_required' },
    },
    {
      kind: 'orientationStarted',
      timeUtcMs: script.startUtcMs,
      result: { ok: true, value: 'relative' },
    },
    ...data.filter((e) => e.timeUtcMs <= setUtcMs),
    { kind: 'establishYaw', timeUtcMs: setUtcMs, from: { kind: 'compass' } },
    ...data.filter((e) => e.timeUtcMs > setUtcMs),
    {
      kind: 'declination',
      timeUtcMs: built.endUtcMs,
      result: { ok: true, value: FIXTURE_DECLINATION },
    },
  ];
  const { session } = run(fixtureSession('bearing'), events);
  return { session, endUtcMs: built.endUtcMs };
}

describe('the sighting screen lies in the normal flow (Req 13.13)', () => {
  it('takes nothing out of the flow except the Reticle and the Mark inside the image, in every state', () => {
    for (const kind of KINDS) {
      for (const state of STATES) {
        const { screen, unmount, queryByTestId } = renderScreen(
          sessionInState(state, kind).session,
        );
        const image = queryByTestId('image-surface');
        for (const el of [screen, ...screen.querySelectorAll<HTMLElement>('*')]) {
          if (!OUT_OF_FLOW.includes(el.style.position)) continue;
          // Out of the flow is allowed only inside the image, which clips what it holds.
          expect(image !== null && image !== el && image.contains(el), `${kind} ${state}`).toBe(
            true,
          );
        }
        if (image !== null) {
          expect(image.style.overflow).toBe('hidden');
          expect(image.style.position).toBe('relative');
        }
        unmount();
      }
    }
  });

  it('is as tall as its content: no height, minimum height or maximum height on the screen', () => {
    for (const state of STATES) {
      const { screen, unmount } = renderScreen(sessionInState(state, 'bearing').session);
      expect([screen.style.height, screen.style.minHeight, screen.style.maxHeight]).toEqual([
        '',
        '',
        '',
      ]);
      unmount();
    }
  });

  it('gives the image a height of its own, not a share of a box around it', () => {
    for (const state of ['starting', 'live', 'frozen'] as const) {
      const { getByTestId, unmount } = renderScreen(sessionInState(state, 'bearing').session);
      const box = getByTestId('image-surface').parentElement as HTMLElement;
      expect(box.dataset.part).toBe('image-box');
      // A definite height that does not depend on the screen's (which has none).
      expect(box.style.height).not.toBe('');
      expect(box.style.height).not.toMatch(/%/);
      expect(box.style.flex).toBe('');
      unmount();
    }
  });

  it('puts the control bar directly after the image, the readout and the texts it belongs to', () => {
    const { bar, getByTestId, screen, unmount } = renderScreen(
      sessionInState('live', 'bearing').session,
    );
    const hint = screen.querySelector('[data-part="hint"]') as HTMLElement;
    for (const part of [
      getByTestId('image-surface'),
      getByTestId('readout'),
      hint,
      getByTestId('yaw-status'),
    ]) {
      expect(before(part, bar())).toBe(true);
    }
    // The longer forms and the limits line come after the controls, not between them and the image.
    expect(before(bar(), getByTestId('known-azimuth-form'))).toBe(true);
    expect(before(bar(), getByTestId('limits-note'))).toBe(true);
    unmount();
  });

  it('captured: the summary is above Take another; failed: the Message is directly above Start again', () => {
    const captured = renderScreen(sessionInState('captured', 'bearing').session);
    expect(before(captured.getByTestId('capture-summary'), captured.bar())).toBe(true);
    captured.unmount();
    const failed = renderScreen(sessionInState('failed', 'bearing').session);
    expect(failed.bar().previousElementSibling?.getAttribute('data-testid')).toBe('failure-notice');
    failed.unmount();
  });
});

describe('the control bar is in the flow (Req 13.13)', () => {
  it('is neither sticky nor fixed nor absolute', () => {
    const { bar, unmount } = renderScreen(sessionInState('live', 'bearing').session);
    expect(OUT_OF_FLOW).not.toContain(bar().style.position);
    unmount();
  });
});

describe('the Simulator panel holds the screen in the flow (Req 13.13)', () => {
  const built = buildCatalogue();
  if (!built.ok) throw new Error(built.reason);
  const catalogue: readonly CatalogueScene[] = built.value;

  it('puts no box of fixed height around the sighting screen', async () => {
    const timer = new FakeTimer();
    const utils = render(
      <SimulatorPanel
        catalogue={catalogue}
        timer={timer}
        parameters={PARAMETERS}
        sensorOptions={{
          listeningTimeoutMs: 3000,
          positionTimeoutMs: 30_000,
          positionConfidenceScale: 1,
        }}
        tapSigmaPx={1}
        initialSceneId="steady"
        observe={fakeObserver({ widthPx: 390, heightPx: 844 }).observe}
        onSession={() => undefined}
      />,
    );
    const q = within(utils.container);
    await act(async () => {
      fireEvent.click(utils.container.querySelector('[data-control="start"]') as HTMLElement);
    });
    const panel = q.getByTestId('simulator-panel');
    let el = q.getByTestId('sighting-screen').parentElement;
    while (el !== null && el !== panel.parentElement) {
      expect([el.style.height, el.style.maxHeight, el.style.overflow]).toEqual(['', '', '']);
      expect(OUT_OF_FLOW).not.toContain(el.style.position);
      el = el.parentElement;
    }
    utils.unmount();
  });
});

describe('a refused action is shown where the user is looking (Req 13.14)', () => {
  it('a Freeze refused shows its Message directly above the control bar', () => {
    const live = liveSession('bearing');
    // Ten seconds later with no sample: the window's newest sample is stale.
    const refused = run(live.session, [{ kind: 'freeze', timeUtcMs: live.endUtcMs + 10_000 }]);
    expect(refused.session.state).toBe('live');
    expect(refused.session.notice).not.toBeNull();
    const { bar, unmount } = renderScreen(refused.session);
    const above = bar().previousElementSibling as HTMLElement;
    expect(above.getAttribute('data-testid')).toBe('failure-notice');
    const notice = refused.session.notice;
    if (notice === null) throw new Error('notice');
    const m = messageFor({ ok: false, reason: notice.reason });
    expect(above.textContent).toBe(m.whatHappened + m.whatToDo);
    unmount();
  });

  it('with north lost after a switch of application, a refused Capture shows frame_reset above Capture', () => {
    const lost = lostNorthSession();
    const frozen = run(lost.session, [{ kind: 'freeze', timeUtcMs: lost.endUtcMs }]);
    expect(frozen.session.state).toBe('frozen');
    const refused = run(frozen.session, [{ kind: 'capture', timeUtcMs: lost.endUtcMs }]);
    expect(refused.session.state).toBe('frozen');
    expect(refused.session.notice?.reason).toBe('frame_reset');
    const { bar, getByTestId, unmount } = renderScreen(refused.session);
    const above = bar().previousElementSibling as HTMLElement;
    expect(above.getAttribute('data-testid')).toBe('failure-notice');
    const m = messageFor({ ok: false, reason: 'frame_reset' });
    expect(above.textContent).toBe(m.whatHappened + m.whatToDo);
    // The Yaw status with its prompt is right above the Message.
    expect(above.previousElementSibling).toBe(getByTestId('yaw-status'));
    unmount();
  });

  it('the Message stays above the bar until the next action that succeeds, which clears it', () => {
    const lost = lostNorthSession();
    const refused = run(lost.session, [
      { kind: 'freeze', timeUtcMs: lost.endUtcMs },
      { kind: 'capture', timeUtcMs: lost.endUtcMs },
    ]);
    const back = run(refused.session, [{ kind: 'unfreeze', timeUtcMs: lost.endUtcMs }]);
    expect(back.session.state).toBe('live');
    const { queryByTestId, unmount } = renderScreen(back.session);
    expect(queryByTestId('failure-notice')).toBeNull();
    unmount();
  });
});

describe('setting north is the primary control while north is not valid on the Relative frame (Req 13.14)', () => {
  it('north not set: "Set north from the compass" is primary, Freeze secondary, the prompt above the bar', () => {
    const { session } = liveSession('bearing', relativeScript());
    const { bar, primary, getByTestId, container, unmount } = renderScreen(session);
    expect(getByTestId('yaw-status').dataset.status).toBe('none');
    expect(primary()).toEqual(['north-compass']);
    const freeze = container.querySelector<HTMLElement>('[data-control="freeze"]');
    expect(freeze?.dataset.primary).toBe('false');
    expect(bar().previousElementSibling).toBe(getByTestId('yaw-status'));
    unmount();
  });

  it('north lost: the same, with the Message of frame_reset as the prompt above the bar', () => {
    const lost = lostNorthSession();
    const { bar, primary, getByTestId, unmount } = renderScreen(lost.session);
    const status = getByTestId('yaw-status');
    expect(status.dataset.status).toBe('invalidated');
    expect(primary()).toEqual(['north-compass']);
    expect(bar().previousElementSibling).toBe(status);
    const m = messageFor({ ok: false, reason: 'frame_reset' });
    expect(status.querySelector('[data-part="prompt"]')?.textContent).toBe(
      `${m.whatHappened} ${m.whatToDo}`,
    );
    unmount();
  });

  it('north valid: Freeze is primary again', () => {
    const live = liveSession('bearing', relativeScript());
    const set = run(live.session, [
      { kind: 'establishYaw', timeUtcMs: live.endUtcMs, from: { kind: 'compass' } },
    ]);
    const { primary, getByTestId, unmount } = renderScreen(set.session);
    expect(getByTestId('yaw-status').dataset.status).toBe('valid');
    expect(primary()).toEqual(['freeze']);
    unmount();
  });

  it('Absolute frame with no Yaw reference: the compass gives north, Freeze stays primary', () => {
    const { primary, unmount } = renderScreen(sessionInState('live', 'bearing').session);
    expect(primary()).toEqual(['freeze']);
    unmount();
  });

  it('an altitude Session has no north control, and Freeze is primary', () => {
    const { session } = liveSession('altitude', relativeScript());
    const { primary, unmount } = renderScreen(session);
    expect(primary()).toEqual(['freeze']);
    unmount();
  });
});
