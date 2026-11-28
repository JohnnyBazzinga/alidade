// Mira's drawing of the docked sighting screen (Req 22.17, design D37.12): in a theme with the `dial`
// flag the same parts, in the same order, with the same controls, drawn as a round lens in a ring of
// ticks, one numeral with its caption, two tiles and a round Back; in every other theme, today's.

import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeObserver } from '../test-support/fake-observe';
import { PARAMETERS, sessionInState } from '../test-support/session-fixtures';
import { DialLens, dialLensSize, DIAL_RESERVE_PX } from './dial';
import { SightingScreen } from './SightingScreen';
import { applyTheme } from './theme/apply-theme';
import { field, instrument, mira } from './theme/themes';

afterEach(() => {
  applyTheme(document.documentElement, instrument);
  document.documentElement.removeAttribute('style');
});

function show(state: Parameters<typeof sessionInState>[0], back = true) {
  return render(
    <SightingScreen
      session={sessionInState(state, 'bearing').session}
      parameters={PARAMETERS}
      onRequestPermission={vi.fn()}
      onAction={vi.fn()}
      sourceSize={{ widthSourcePx: 720, heightSourcePx: 1280 }}
      fit="cover"
      calibration={null}
      tapSigmaPx={Number.NaN}
      observe={fakeObserver({ widthPx: 390, heightPx: 844 }).observe}
      renderImage={() => <div />}
      layout="docked"
      {...(back ? { back: { label: 'Back', onPress: vi.fn() } } : {})}
    />,
  );
}

describe('the dial (Req 22.17)', () => {
  it('is drawn in Mira only: Instrument and Field keep the framed image and the cards', () => {
    for (const theme of [instrument, field]) {
      applyTheme(document.documentElement, theme);
      const { getByTestId, unmount } = show('live');
      expect(getByTestId('sighting-screen').dataset.variant).toBeUndefined();
      expect(getByTestId('readout').dataset.variant).toBeUndefined();
      unmount();
    }
    applyTheme(document.documentElement, mira);
    const { getByTestId } = show('live');
    expect(getByTestId('sighting-screen').dataset.variant).toBe('dial');
  });

  it('live: the lens in its ring, the crosshair of the dial, the numeral and its caption, two tiles', () => {
    applyTheme(document.documentElement, mira);
    const { getByTestId, getByRole, container } = show('live');
    const lens = container.querySelector<HTMLElement>('[data-part="image-box"]') as HTMLElement;
    expect(lens.dataset.variant).toBe('dial');
    expect(lens.querySelector('[data-part="dial-ring"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(lens.querySelector<HTMLElement>('[data-part="lens"]')?.style.borderRadius).toBe('50%');
    expect(container.querySelectorAll('[data-part="bracket"]')).toHaveLength(0);
    expect(getByTestId('reticle').dataset.variant).toBe('dial');
    const readout = getByTestId('readout');
    expect(readout.querySelector('[data-part="azimuth"]')?.textContent).toMatch(/^\d+\.\d°$/);
    expect(readout.querySelector('[data-part="steadiness"]')?.textContent).toMatch(
      /(True north|Magnetic north|Relative) · (Steady|Settling|Unsteady) hand · shake/,
    );
    const details = getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(details);
    expect(container.querySelector('[data-part="details-body"]')?.textContent).toMatch(/readings/);
  });

  it('frozen: the Frozen badge, the hint as a title, Capture then Back to live, and no Back', () => {
    applyTheme(document.documentElement, mira);
    const { container, getByTestId, queryByRole } = show('frozen');
    expect(container.querySelector('[data-part="frozen-badge"]')?.textContent).toBe('Frozen');
    const bar = getByTestId('control-bar');
    expect(bar.dataset.variant).toBe('dial');
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Capture',
      'Back to live',
    ]);
    expect(queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('before Start: Back is a round control of 62, named, beside Start', () => {
    applyTheme(document.documentElement, mira);
    const { getByTestId } = show('permission');
    const buttons = [...getByTestId('control-bar').querySelectorAll<HTMLElement>('button')];
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Back',
      'Start',
    ]);
    expect(buttons[0]?.style.width).toBe('62px');
    expect(buttons[0]?.style.borderRadius).toBe('31px');
    expect(buttons[1]?.style.background).toBe('var(--alidade-primary)');
  });

  it('the lens takes the height the other parts leave, between its bounds', () => {
    expect(dialLensSize(DIAL_RESERVE_PX.live)).toBe(
      'min(calc(100vw - 40px), 350px, max(160px, calc(100dvh - 380px)))',
    );
  });

  it('the bezel turns with a true azimuth and marks north; with a Relative one it stands and marks none', () => {
    applyTheme(document.documentElement, mira);
    const live = show('live');
    const az =
      live.getByTestId('readout').querySelector('[data-part="azimuth"]')?.textContent ?? '';
    const bezel = live.container.querySelector<SVGElement>('[data-part="dial-bezel"]');
    const steadiness = live.getByTestId('readout').querySelector('[data-part="steadiness"]');
    if ((steadiness?.textContent ?? '').startsWith('Relative')) {
      expect(bezel?.getAttribute('transform')).toBeNull();
      expect(live.container.querySelector('[data-part="dial-north"]')).toBeNull();
    } else {
      expect(Number(bezel?.dataset.turnDeg)).toBeCloseTo(-Number.parseFloat(az), 0);
      expect(live.container.querySelector('[data-part="dial-north"]')).not.toBeNull();
    }
  });

  it('the bezel of a lens: turned by the azimuth on a north, still without one', () => {
    const turned = render(
      <DialLens sizeCss="350px" frozen={false} northRad={Math.PI / 2}>
        <div />
      </DialLens>,
    );
    const bezel = turned.container.querySelector<SVGElement>('[data-part="dial-bezel"]');
    expect(bezel?.getAttribute('transform')).toBe('rotate(-90.00 175 175)');
    expect(turned.container.querySelector('[data-part="dial-north"]')).not.toBeNull();
    turned.unmount();
    const still = render(
      <DialLens sizeCss="350px" frozen={false} northRad={null}>
        <div />
      </DialLens>,
    );
    expect(
      still.container.querySelector('[data-part="dial-bezel"]')?.getAttribute('transform'),
    ).toBeNull();
    expect(still.container.querySelector('[data-part="dial-north"]')).toBeNull();
  });

  it('the flow layout (the Simulator) in Mira: the lens, the numeral, the tiles and the pills, the form in place', () => {
    applyTheme(document.documentElement, mira);
    const flow = render(
      <SightingScreen
        session={sessionInState('live', 'bearing').session}
        parameters={PARAMETERS}
        onRequestPermission={vi.fn()}
        onAction={vi.fn()}
        sourceSize={{ widthSourcePx: 720, heightSourcePx: 1280 }}
        fit="cover"
        calibration={null}
        tapSigmaPx={Number.NaN}
        observe={fakeObserver({ widthPx: 390, heightPx: 844 }).observe}
        renderImage={() => <div />}
      />,
    );
    const screen = flow.getByTestId('sighting-screen');
    expect(screen.dataset.variant).toBe('dial');
    expect(screen.dataset.layout).toBeUndefined();
    expect(screen.querySelector('[data-part="image-box"]')?.getAttribute('data-variant')).toBe(
      'dial',
    );
    expect(flow.getByTestId('readout').dataset.variant).toBe('dial');
    expect(flow.getByTestId('control-bar').dataset.variant).toBe('dial');
    const other = flow.queryByRole('button', { name: 'Other ways to set north' });
    if (other !== null) {
      fireEvent.click(other);
      expect(screen.querySelector('[data-part="way"]')).not.toBeNull();
    }
  });
});
