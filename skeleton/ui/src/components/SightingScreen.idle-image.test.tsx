// The idle image (Req 22.15, task 35.6): before Start only, in the place the camera will take,
// inside a frame of the theme's image radius with the four brackets; decorative, with no text.
// Without one the screen is today's (Nonius, the Playground).

import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeObserver } from '../test-support/fake-observe';
import { PARAMETERS, sessionInState } from '../test-support/session-fixtures';
import type { Session } from '../math/session/session';
import { SightingScreen, type SightingScreenProps } from './SightingScreen';

function renderScreen(session: Session, over: Partial<SightingScreenProps> = {}) {
  const utils = render(
    <SightingScreen
      session={session}
      parameters={PARAMETERS}
      onRequestPermission={vi.fn()}
      onAction={vi.fn()}
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
  return { ...utils, ...within(utils.container) };
}

const ART = <svg data-testid="art" viewBox="0 0 10 10" />;

describe('the idle image (Req 22.15)', () => {
  it('is drawn before Start, in a frame with the image radius and the brackets, hidden and wordless', () => {
    const r = renderScreen(sessionInState('permission', 'bearing').session, { idleImage: ART });
    const frame = r.container.querySelector<HTMLElement>('[data-part="idle-image"]');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('aria-hidden')).toBe('true');
    expect(frame?.style.borderRadius).toBe('var(--alidade-image-radius)');
    expect(frame?.style.overflow).toBe('hidden');
    expect(frame?.style.position).toBe('relative');
    expect(frame?.querySelectorAll('[data-part="bracket"]')).toHaveLength(4);
    expect(frame?.querySelector('[data-testid="art"]')).not.toBeNull();
    expect(frame?.textContent).toBe('');
    // In the middle part, which scrolls: the budget of Req 13.15 is unchanged.
    expect(frame?.closest('[data-part="middle"]')).not.toBeNull();
    // In the place the camera will take: after the words before Start, where the image will be.
    const limits = r.getByTestId('limits-note');
    expect(
      limits.compareDocumentPosition(frame as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is not drawn once the camera has its place', () => {
    for (const state of ['live', 'frozen', 'captured'] as const) {
      const r = renderScreen(sessionInState(state, 'bearing').session, { idleImage: ART });
      expect(r.container.querySelector('[data-part="idle-image"]')).toBeNull();
      r.unmount();
    }
  });

  it('without one, the screen before Start is today’s', () => {
    const r = renderScreen(sessionInState('permission', 'bearing').session);
    expect(r.container.querySelector('[data-part="idle-image"]')).toBeNull();
    expect(r.getByTestId('limits-note')).not.toBeNull();
  });

  it('an intro given by the app takes the place of the screen’s sentence and limits note', () => {
    const r = renderScreen(sessionInState('permission', 'bearing').session, {
      idleImage: ART,
      intro: <section data-testid="how-to">Three steps</section>,
    });
    expect(r.queryByTestId('limits-note')).toBeNull();
    expect(r.container.querySelector('[data-part="intro"]')).toBeNull();
    const howTo = r.getByTestId('how-to');
    const frame = r.container.querySelector('[data-part="idle-image"]') as Node;
    expect(howTo.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the flow layout draws none', () => {
    const r = renderScreen(sessionInState('permission', 'bearing').session, {
      idleImage: ART,
      layout: 'flow',
    });
    expect(r.container.querySelector('[data-part="idle-image"]')).toBeNull();
  });
});
