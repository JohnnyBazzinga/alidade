// The Simulation mode in Mira (Req 22.16 (d), 22.18; design D26.9): a reviewer on a laptop sees the
// lens of the lead's design, the landscape with its plume, the bezel that turns, and the App as a
// column of a phone's width in the middle of the page.

import { applyTheme, instrument } from '@alidade/ui';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_MAX_WIDTH_PX } from '../../App';
import { mountSimulation } from '../../test-support/simulation-driver';
import { chooseTheme } from '../theme-choice';

afterEach(() => {
  applyTheme(document.documentElement, instrument);
  document.documentElement.removeAttribute('style');
});

describe('the Simulator in Mira', () => {
  it('draws the Sight screen as the dial: the lens, the landscape, the smoke as a plume, the numeral', async () => {
    chooseTheme(document.documentElement);
    const m = mountSimulation({});
    await m.settle();
    expect(m.getByTestId('app-shell').style.maxWidth).toBe(`${APP_MAX_WIDTH_PX}px`);
    await m.openSight();
    await m.toLive();
    const screen = m.getByTestId('sighting-screen');
    expect(screen.dataset.variant).toBe('dial');
    expect(screen.querySelector('[data-part="image-box"]')?.getAttribute('data-variant')).toBe(
      'dial',
    );
    const scene = m.getByTestId('scene-image');
    expect(scene.dataset.variant).toBe('landscape');
    expect(scene.querySelector('[data-target-id="smoke"] [data-part="plume"]')).not.toBeNull();
    expect(m.getByTestId('readout').querySelector('[data-part="azimuth"]')?.textContent).toMatch(
      /^\d+\.\d°$/,
    );
    // The scenes start on a true north: the bezel is turned and shows its north.
    expect(screen.querySelector('[data-part="dial-north"]')).not.toBeNull();
  });
});
