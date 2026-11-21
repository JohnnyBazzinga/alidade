// The docked layout of the sighting screen (Req 13.13 to 13.19, 19.6; design D35), by structure:
// jsdom does no layout (Req 13.12), so these tests read what the components set and the order they
// put their parts in. Where each control falls on a phone is Device check 11 and Vigia's V12.

import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SimulatorScript } from '@alidade/sensors';
import { DOCKED_BAR_TEXT_MAX_SHARE, DOCKED_IMAGE_MIN_HEIGHT_PX } from '../defaults';
import type { Session, SessionKind, SessionStateKind } from '../math/session/session';
import { fakeObserver } from '../test-support/fake-observe';
import {
  PARAMETERS,
  fixtureScript,
  liveSession,
  run,
  sessionInState,
} from '../test-support/session-fixtures';
import { SightingScreen, type SightingScreenProps } from './SightingScreen';

const STATES: readonly SessionStateKind[] = [
  'permission',
  'starting',
  'live',
  'frozen',
  'captured',
  'failed',
];

function relativeScript(): SimulatorScript {
  return fixtureScript({
    frame: { kind: 'relative', zeroRad: 2, resets: [] },
    heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
  });
}

function renderDocked(session: Session, over: Partial<SightingScreenProps> = {}) {
  const onAction = vi.fn();
  const utils = render(
    <SightingScreen
      session={session}
      parameters={PARAMETERS}
      onRequestPermission={vi.fn()}
      onAction={onAction}
      sourceSize={{ widthSourcePx: 720, heightSourcePx: 1280 }}
      fit="cover"
      calibration={null}
      tapSigmaPx={Number.NaN}
      observe={fakeObserver({ widthPx: 390, heightPx: 664 }).observe}
      renderImage={() => <div data-testid="image" />}
      layout="docked"
      {...over}
    />,
  );
  const q = within(utils.container);
  const screen = q.getByTestId('sighting-screen');
  const bar = () => q.getByTestId('control-bar');
  const controls = () =>
    [...bar().querySelectorAll<HTMLElement>('[data-control]')].map((c) => c.dataset.control);
  return { ...utils, ...q, screen, bar, controls, onAction };
}

describe('the docked layout is a column of the screen’s height (Req 13.15)', () => {
  it('has the root, the middle part and the bar, the bar last with nothing after it, in every state', () => {
    for (const kind of ['bearing', 'altitude'] as SessionKind[]) {
      for (const state of STATES) {
        const { screen, bar, unmount } = renderDocked(sessionInState(state, kind).session);
        const label = `${kind} ${state}`;
        expect(screen.dataset.layout, label).toBe('docked');
        expect(screen.style.height, label).toBe('100dvh');
        expect(screen.style.display).toBe('flex');
        expect(screen.style.flexDirection).toBe('column');
        expect(screen.style.overflow, label).toBe('hidden');
        const last = screen.lastElementChild;
        expect(last, label).toBe(bar());
        expect(bar().dataset.placement).toBe('docked');
        const middle = screen.querySelector<HTMLElement>('[data-part="middle"]');
        expect(middle, label).not.toBeNull();
        expect(middle?.style.overflowY).toBe('auto');
        expect(middle?.style.minHeight).toBe('0px');
        expect(middle?.parentElement).toBe(screen);
        unmount();
      }
    }
  });

  it('lets only the middle part and the bar’s text part scroll, and fixes nothing', () => {
    for (const state of STATES) {
      const { screen, unmount } = renderDocked(sessionInState(state, 'bearing').session);
      const scrolling = [...screen.querySelectorAll<HTMLElement>('*')].filter(
        (e) => e.style.overflowY === 'auto',
      );
      expect(
        scrolling.map((e) => e.dataset.part),
        state,
      ).toEqual(expect.arrayContaining(['middle']));
      for (const e of scrolling) expect(['middle', 'bar-text']).toContain(e.dataset.part);
      for (const el of [screen, ...screen.querySelectorAll<HTMLElement>('*')]) {
        expect(['fixed', 'sticky']).not.toContain(el.style.position);
      }
      unmount();
    }
  });

  it('adds env(safe-area-inset-bottom) to the bar’s bottom padding', () => {
    const { bar } = renderDocked(sessionInState('live', 'bearing').session);
    expect(bar().style.paddingBottom).toContain('env(safe-area-inset-bottom)');
  });

  it('gives the image the height that is left, with a floor', () => {
    for (const state of ['starting', 'live', 'frozen'] as const) {
      const { getByTestId, unmount } = renderDocked(sessionInState(state, 'bearing').session);
      const box = getByTestId('image-surface').parentElement as HTMLElement;
      expect(box.dataset.part).toBe('image-box');
      expect(box.style.flex).toBe('1 1 auto');
      expect(box.style.minHeight).toBe(`${DOCKED_IMAGE_MIN_HEIGHT_PX}px`);
      expect(box.style.height).toBe('');
      unmount();
    }
  });

  it('puts the caller’s rows where design D35.1 says: top first, aim first in the middle, extra last', () => {
    const { screen } = renderDocked(sessionInState('live', 'bearing').session, {
      top: <div data-testid="top-row">Back</div>,
      aim: <div data-testid="aim-row">Aim at the base of the smoke</div>,
      extra: <div data-testid="extra-row">Extra</div>,
    });
    const middle = screen.querySelector('[data-part="middle"]') as HTMLElement;
    expect(screen.firstElementChild?.getAttribute('data-testid')).toBe('top-row');
    expect(middle.firstElementChild?.getAttribute('data-testid')).toBe('aim-row');
    expect(middle.lastElementChild?.getAttribute('data-testid')).toBe('extra-row');
    // The screen's own hint is replaced by the aim row.
    expect(screen.querySelector('[data-part="hint"]')).toBeNull();
  });
});

describe('the bar holds the current action only (Req 13.15)', () => {
  const controls = (state: SessionStateKind, kind: SessionKind = 'bearing') =>
    renderDocked(sessionInState(state, kind).session).controls();

  it('permission: Start; starting: none; captured: Take another; failed: Start again', () => {
    expect(controls('permission')).toEqual(['start']);
    expect(controls('starting')).toEqual([]);
    expect(controls('captured')).toEqual(['again']);
    expect(controls('failed')).toEqual(['restart']);
  });

  it('live: Freeze when north is not needed, for either kind', () => {
    expect(controls('live', 'bearing')).toEqual(['freeze']);
    expect(controls('live', 'altitude')).toEqual(['freeze']);
  });

  it('live on the Relative frame with no north: only "Set north from the compass", primary', () => {
    const { session } = liveSession('bearing', relativeScript());
    const r = renderDocked(session);
    expect(r.controls()).toEqual(['north-compass']);
    const button = r.bar().querySelector<HTMLElement>('[data-control="north-compass"]');
    expect(button?.dataset.primary).toBe('true');
    expect(button?.textContent).toBe('Set north from the compass');
    fireEvent.click(button as HTMLElement);
    expect(r.onAction).toHaveBeenCalledWith({ kind: 'establishYaw', from: { kind: 'compass' } });
  });

  it('frozen: Capture (primary) and Back to live; Clear mark only with a Mark', () => {
    expect(controls('frozen')).toEqual(['capture', 'unfreeze']);
  });

  it('sizes: the primary control is 64 CSS px tall and every other 48, by the styles', () => {
    const { session } = sessionInState('frozen', 'bearing');
    const r = renderDocked(session);
    const [capture, back] = [...r.bar().querySelectorAll<HTMLElement>('[data-control]')];
    expect(capture?.style.height).toBe('64px');
    expect(back?.style.height).toBe('48px');
  });
});

describe('the bar’s text part (Req 13.14, 13.15)', () => {
  const part = (bar: HTMLElement) => bar.querySelector<HTMLElement>('[data-part="bar-text"]');

  it('is absent when there is nothing to say, and scrolls with a cap when there is', () => {
    const quiet = renderDocked(sessionInState('live', 'bearing').session);
    expect(part(quiet.bar())).toBeNull();
    quiet.unmount();
    const { session } = liveSession('bearing', relativeScript());
    const r = renderDocked(session);
    const text = part(r.bar());
    expect(text).not.toBeNull();
    expect(text?.style.maxHeight).toBe(`${DOCKED_BAR_TEXT_MAX_SHARE * 100}dvh`);
    expect(text?.style.overflowY).toBe('auto');
  });

  it('holds the north prompt, then a refusal, above the controls; a refusal equal to the prompt is shown once', () => {
    const { session, endUtcMs } = liveSession('bearing', relativeScript());
    // Freeze succeeds without north; Capture is what the Session refuses (Req 13.14).
    const refused = run(session, [
      { kind: 'freeze', timeUtcMs: endUtcMs },
      { kind: 'capture', timeUtcMs: endUtcMs },
    ]).session;
    expect(refused.state).toBe('frozen');
    expect(refused.notice?.reason).toBe('no_yaw_reference');
    const r = renderDocked(refused);
    const text = part(r.bar()) as HTMLElement;
    expect(text.querySelectorAll('[data-testid="yaw-status"]')).toHaveLength(1);
    // The Message of `no_yaw_reference` is the prompt's: not repeated as a second block.
    expect(text.querySelector('[data-testid="failure-notice"]')).toBeNull();
    expect(text.nextElementSibling?.getAttribute('data-part')).toBe('bar-controls');
  });

  it('shows another refusal after the prompt, in the bar and not above the camera', () => {
    const { session, endUtcMs } = liveSession('bearing', relativeScript());
    const refused = run(session, [{ kind: 'capture', timeUtcMs: endUtcMs }]).session;
    expect(refused.notice?.reason).toBe('action_not_available');
    const r = renderDocked(refused);
    const text = part(r.bar()) as HTMLElement;
    const order = [...text.children].map(
      (c) => c.getAttribute('data-testid') ?? c.getAttribute('data-part'),
    );
    expect(order).toEqual(['yaw-status', 'failure-notice']);
    const middle = r.screen.querySelector('[data-part="middle"]') as HTMLElement;
    expect(middle.querySelector('[data-testid="failure-notice"]')).toBeNull();
  });

  it('shows the Message of a refusal in the bar on the Absolute frame as well', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const refused = run(session, [{ kind: 'capture', timeUtcMs: endUtcMs }]).session;
    const r = renderDocked(refused);
    expect(part(r.bar())?.querySelector('[data-testid="failure-notice"]')).not.toBeNull();
  });

  it('shows the failure of a failed Session in the bar, and "Starting" while starting', () => {
    const failed = renderDocked(sessionInState('failed', 'bearing').session);
    expect(part(failed.bar())?.querySelector('[data-testid="failure-notice"]')).not.toBeNull();
    failed.unmount();
    const starting = renderDocked(sessionInState('starting', 'bearing').session);
    expect(part(starting.bar())?.textContent).toBe('Starting the motion sensors.');
  });
});
