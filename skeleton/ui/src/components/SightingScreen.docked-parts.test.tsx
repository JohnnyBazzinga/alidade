// The parts of the docked screen that criteria 13.16 to 13.18 move behind a disclosure or into a
// view of their own, and the hint and the taps of 13.17 / 18.10 (design D35.5 to D35.7), by structure.

import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
import type { Session } from '../math/session/session';
import { SightingScreen, type SightingScreenProps } from './SightingScreen';

function renderScreen(session: Session, over: Partial<SightingScreenProps> = {}) {
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
  return { ...utils, ...within(utils.container), onAction };
}

describe('the docked live screen: compact readout and "Details" (Req 13.16)', () => {
  it('shows the compact readout, with the limits note and the north line under Details', () => {
    const { getByTestId, container } = renderScreen(sessionInState('live', 'bearing').session);
    const readout = getByTestId('readout');
    expect(readout.querySelector(':scope > [data-part="altitude"]')).toBeNull();
    const details = readout.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('[data-testid="limits-note"]')).not.toBeNull();
    // The Absolute frame's north line asks nothing: it is under Details, not in the bar.
    expect(details.querySelector('[data-testid="yaw-status"]')).not.toBeNull();
    expect(container.querySelector('[data-part="bar-text"]')).toBeNull();
  });

  it('shows the limits note in full before Start, where no camera is shown', () => {
    const { getByTestId, queryByTestId } = renderScreen(
      sessionInState('permission', 'bearing').session,
    );
    expect(getByTestId('limits-note')).not.toBeNull();
    expect(queryByTestId('image-surface')).toBeNull();
  });

  it('shows the compact summary after a capture', () => {
    const { getByTestId } = renderScreen(sessionInState('captured', 'bearing').session);
    expect(getByTestId('capture-summary').querySelector('details > summary')?.textContent).toBe(
      'Why this accuracy?',
    );
  });

  it('the flow layout keeps the full readout', () => {
    const { getByTestId } = renderScreen(sessionInState('live', 'bearing').session, {
      layout: 'flow',
    });
    expect(getByTestId('readout').querySelector('details')).toBeNull();
    expect(getByTestId('readout').querySelector(':scope > [data-part="altitude"]')).not.toBeNull();
  });
});

describe('"Other ways to set north" (Req 13.18)', () => {
  it('keeps the form out of the middle part, and opens it as a view with no bar', () => {
    const r = renderScreen(sessionInState('live', 'bearing').session);
    expect(r.queryByTestId('known-azimuth-form')).toBeNull();
    const open = r.getByRole('button', { name: 'Other ways to set north' });
    const middle = r.container.querySelector('[data-part="middle"]') as HTMLElement;
    expect(middle.lastElementChild).toBe(open);
    fireEvent.click(open);
    expect(r.getByTestId('known-azimuth-form')).not.toBeNull();
    expect(r.queryByTestId('control-bar')).toBeNull();
    const compass = r.container.querySelector<HTMLElement>('[data-control="north-compass"]');
    expect(compass).not.toBeNull();
    fireEvent.click(r.getByRole('button', { name: 'Back to the sighting' }));
    expect(r.queryByTestId('known-azimuth-form')).toBeNull();
    expect(r.getByTestId('control-bar')).not.toBeNull();
    // Pressing the compass control acts and returns to the sighting.
    fireEvent.click(r.getByRole('button', { name: 'Other ways to set north' }));
    fireEvent.click(r.container.querySelector('[data-control="north-compass"]') as HTMLElement);
    expect(r.onAction).toHaveBeenCalledWith({ kind: 'establishYaw', from: { kind: 'compass' } });
    expect(r.getByTestId('control-bar')).not.toBeNull();
  });

  it('a submitted form reaches onAction as before', () => {
    const r = renderScreen(sessionInState('live', 'bearing').session);
    fireEvent.click(r.getByRole('button', { name: 'Other ways to set north' }));
    fireEvent.change(r.getByLabelText('Known azimuth, degrees'), { target: { value: '120' } });
    fireEvent.change(r.getByLabelText('Its 1-sigma, degrees'), { target: { value: '1' } });
    fireEvent.click(r.getByRole('button', { name: 'Set north from this azimuth' }));
    expect(r.onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'establishYaw',
        from: expect.objectContaining({ kind: 'knownAzimuth' }),
      }),
    );
  });

  it('is not offered for an altitude Session, and in the flow layout the form stays in place', () => {
    const alt = renderScreen(sessionInState('live', 'altitude').session);
    expect(alt.queryByRole('button', { name: 'Other ways to set north' })).toBeNull();
    alt.unmount();
    const flow = renderScreen(sessionInState('live', 'bearing').session, { layout: 'flow' });
    expect(flow.getByTestId('known-azimuth-form')).not.toBeNull();
    expect(flow.queryByRole('button', { name: 'Other ways to set north' })).toBeNull();
  });

  it('is also reachable while frozen', () => {
    const r = renderScreen(sessionInState('frozen', 'bearing').session);
    expect(r.getByRole('button', { name: 'Other ways to set north' })).not.toBeNull();
  });
});

describe('no instruction to tap where a tap cannot work (Req 13.17, 18.10)', () => {
  const frozen = () => sessionInState('frozen', 'bearing').session;

  it.each(['docked', 'flow'] as const)(
    '%s, no calibration: the hint does not say to tap',
    (layout) => {
      const r = renderScreen(frozen(), { layout });
      const hint = r.container.querySelector('[data-part="hint"]')?.textContent ?? '';
      expect(hint).toBe('Capture takes the direction of the crosshair.');
      expect(r.container.textContent).not.toMatch(/Tap the image|No mark|Mark set/);
    },
  );

  it('with a calibration, the hint is the existing one', () => {
    const r = renderScreen(frozen(), {
      layout: 'flow',
      calibration: FIXTURE_CALIBRATION,
      tapSigmaPx: 1,
    });
    expect(r.container.querySelector('[data-part="hint"]')?.textContent).toMatch(/Tap the image/);
  });

  it('a tap on the frozen image with no calibration starts no mark and shows no Message', () => {
    const r = renderScreen(frozen());
    const surface = r.getByTestId('image-surface');
    surface.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 390,
        height: 300,
        right: 390,
        bottom: 300,
        x: 0,
        y: 0,
      }) as DOMRect;
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(r.onAction).not.toHaveBeenCalled();
  });

  it('with a calibration the same tap sends a mark, as before', () => {
    const r = renderScreen(frozen(), { calibration: FIXTURE_CALIBRATION, tapSigmaPx: 1 });
    const surface = r.getByTestId('image-surface');
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 100 });
    // The fake observer gives a size, so a layout exists and the mark is sent.
    expect(r.onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mark' }));
  });

  it('the Session still refuses its own mark event without a calibration', () => {
    const { session, endUtcMs } = liveSession('bearing', fixtureScript());
    const frozen2 = run(session, [{ kind: 'freeze', timeUtcMs: endUtcMs }]).session;
    const marked = run(frozen2, [
      {
        kind: 'mark',
        timeUtcMs: endUtcMs,
        point: { xPx: 1, yPx: 1 },
        layout: FIXTURE_LAYOUT,
        calibration: null,
        tapSigmaPx: 1,
      },
    ]).session;
    expect(marked.notice?.reason).toBe('calibration_missing');
  });
});
