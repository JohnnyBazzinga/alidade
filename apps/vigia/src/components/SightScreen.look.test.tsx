// The Sight screen in the Mira look (Req 22.8, 22.17; design D26.4): the words of today and of Req
// 22.15, drawn as Mira draws them: before Start the title, the landscape in a circle, the three
// steps and the tip; live, the round lens in its ring of ticks, the numeral and its caption, two
// tiles; Back a round control beside the current action.

import { fireEvent } from '@testing-library/react';
import { applyTheme, instrument, mira } from '@alidade/ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AIM_LINE_TEXT, HOW_TO_STEPS, TIP_TITLE } from '../math/texts';
import { mountDeviceSight as mount } from '../test-support/device-sight';

// The app applies Mira at start (Req 22.3); the dial is drawn only in a theme with the flag.
beforeEach(() => applyTheme(document.documentElement, mira));
afterEach(() => {
  applyTheme(document.documentElement, instrument);
  document.documentElement.removeAttribute('style');
});

const icon = (el: Element | null | undefined) =>
  el?.querySelector('svg')?.getAttribute('data-icon') ?? null;

describe('the aiming row (Req 22.8)', () => {
  it('the line, and "How to aim" as a white pill whose chevron turns over when open', async () => {
    const s = mount();
    await s.toLive();
    const summary = s.getByTestId('guidance').querySelector('summary') as HTMLElement;
    expect(summary.querySelector('[data-part="aim-line"]')?.textContent).toBe(AIM_LINE_TEXT);
    const pill = summary.querySelector<HTMLElement>('[data-part="how-to-aim"]') as HTMLElement;
    expect(pill.style.background).toBe('var(--alidade-card)');
    expect(pill.style.border).toBe('1px solid var(--alidade-rule)');
    expect(pill.lastElementChild?.getAttribute('data-icon')).toBe('chevron-down');
    const details = s.getByTestId('guidance').querySelector('details') as HTMLDetailsElement;
    await s.settle(() => {
      details.open = true;
      fireEvent(details, new Event('toggle'));
    });
    const chevron = s
      .getByTestId('guidance')
      .querySelector<SVGElement>('[data-part="how-to-aim"] [data-icon="chevron-down"]');
    expect(chevron?.style.transform).toBe('rotate(180deg)');
  });
});

describe('before Start (Req 22.8, 22.15)', () => {
  it('the title, the landscape in a circle, the three steps and the tip, then Start with its camera', async () => {
    const s = mount();
    await s.settle();
    const title = s.getByTestId('before-you-sight');
    expect(title.querySelector('h1')?.textContent).toBe(AIM_LINE_TEXT);
    expect(title.querySelector('p')?.textContent).toBe('Before you sight');
    const idle = s
      .getByTestId('sight-screen')
      .querySelector<HTMLElement>('[data-part="idle-image"]') as HTMLElement;
    expect(idle.getAttribute('aria-hidden')).toBe('true');
    expect(idle.style.borderRadius).toBe('50%');
    expect(idle.style.border).toBe('2px solid var(--alidade-ink)');
    expect(idle.querySelector('[data-art="idle-scene"]')?.getAttribute('src')).toMatch(
      /^data:image\/svg\+xml/,
    );
    const howTo = s.getByTestId('how-to');
    expect(title.compareDocumentPosition(idle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(idle.compareDocumentPosition(howTo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      [...howTo.querySelectorAll('li')].map((li) => li.textContent?.replace(/^\d/, '')),
    ).toEqual([...HOW_TO_STEPS]);
    const tip = howTo.querySelector<HTMLElement>('[data-part="tip-card"]') as HTMLElement;
    expect(tip.querySelector('h2')?.textContent).toBe(TIP_TITLE);
    expect(tip.querySelector('[data-testid="limits-note"]')).not.toBeNull();
    expect(icon(s.getByRole('button', { name: 'Start' }))).toBe('camera');
  });

  it('once live: the round lens in its ring, no brackets, the dial crosshair, the numeral, two tiles', async () => {
    const s = mount();
    await s.toLive();
    expect(s.queryByTestId('how-to')).toBeNull();
    const lens = s
      .getByTestId('sight-screen')
      .querySelector<HTMLElement>('[data-part="image-box"]') as HTMLElement;
    expect(lens.dataset.variant).toBe('dial');
    expect(lens.querySelector('[data-part="dial-ring"]')).not.toBeNull();
    const surface = s.getByTestId('image-surface');
    expect(surface.querySelectorAll('[data-part="bracket"]')).toHaveLength(0);
    expect(surface.querySelector('[data-testid="reticle"]')?.getAttribute('data-variant')).toBe(
      'dial',
    );
    const readout = s.getByTestId('readout');
    expect(readout.dataset.variant).toBe('dial');
    expect(readout.querySelector('[data-part="azimuth"]')?.textContent).toMatch(/^\d+\.\d°$/);
    expect(
      readout.querySelector<HTMLElement>('[data-part="steadiness"]')?.style.textTransform,
    ).toBe('uppercase');
    expect(s.getByRole('button', { name: 'Details' }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the bar and the tiles (Req 22.8, 22.11, 22.17)', () => {
  it('north needed: the prompt is a warning card among the content; "Set north from the compass" has its compass', async () => {
    const s = mount({ relative: true });
    await s.toLive();
    const bar = s.getByTestId('control-bar');
    expect(bar.querySelector('[data-testid="yaw-status"]')).toBeNull();
    const prompt = s.getByTestId('yaw-status');
    expect(prompt.style.background).toBe('var(--alidade-warnTint)');
    expect(icon(prompt)).toBe('warning');
    expect(icon(s.getByRole('button', { name: 'Set north from the compass' }))).toBe('compass');
    const other = s.getByRole('button', { name: 'Other ways to set north' });
    expect(other.lastElementChild?.getAttribute('data-icon')).toBe('chevron-right');
  });

  it('frozen: the Frozen badge on the lens; "Capture" with a camera, "Back to live" with a video icon', async () => {
    const s = mount();
    await s.toLive();
    await s.press('freeze');
    expect(
      s.getByTestId('sight-screen').querySelector('[data-part="frozen-badge"]'),
    ).not.toBeNull();
    expect(icon(s.getByRole('button', { name: 'Capture' }))).toBe('camera');
    expect(icon(s.getByRole('button', { name: 'Back to live' }))).toBe('video');
    expect(s.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('Back is a round control of 62 named by its label, with a chevron-left alone', async () => {
    const s = mount();
    await s.settle();
    const back = s.getByRole('button', { name: 'Back' });
    expect(back.getAttribute('aria-label')).toBe('Back');
    expect(back.textContent).toBe('');
    expect(back.firstElementChild?.getAttribute('data-icon')).toBe('chevron-left');
    expect(back.style.width).toBe('62px');
    expect(back.style.borderRadius).toBe('31px');
  });
});
