// The Sight screen in the Field look (Req 22.8, design D25.5, D25.6; task 24.5): the words of today
// and of Req 22.15, drawn with their icons, the cards before Start and the camera's frame.

import { fireEvent } from '@testing-library/react';
import { applyTheme, field, instrument } from '@alidade/ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOW_TO_STEPS, HOW_TO_TITLE, TIP_TITLE } from '../math/texts';
import { mountDeviceSight as mount } from '../test-support/device-sight';

// The app applies Field at start (Req 22.3); a status card draws as a card only in a theme with cards.
beforeEach(() => applyTheme(document.documentElement, field));
afterEach(() => {
  applyTheme(document.documentElement, instrument);
  document.documentElement.removeAttribute('style');
});

const icon = (el: Element | null | undefined) =>
  el?.querySelector('svg')?.getAttribute('data-icon') ?? null;

describe('the aiming row (Req 22.8)', () => {
  it('the crosshair, the line, and "How to aim" as a pill of accent on infoTint with its chevron', async () => {
    const s = mount();
    await s.settle();
    const summary = s.getByTestId('guidance').querySelector('summary') as HTMLElement;
    expect(icon(summary.querySelector('[data-part="aim-line"]'))).toBe('crosshair');
    const pill = summary.querySelector<HTMLElement>('[data-part="how-to-aim"]') as HTMLElement;
    expect(pill.style.color).toBe('var(--alidade-accent)');
    expect(pill.style.background).toBe('var(--alidade-infoTint)');
    expect(pill.style.borderRadius).toBe('var(--alidade-badge-radius)');
    expect(pill.lastElementChild?.getAttribute('data-icon')).toBe('chevron-down');
    const details = s.getByTestId('guidance').querySelector('details') as HTMLDetailsElement;
    await s.settle(() => {
      details.open = true;
      fireEvent(details, new Event('toggle'));
    });
    expect(
      s
        .getByTestId('guidance')
        .querySelector('[data-part="how-to-aim"]')
        ?.lastElementChild?.getAttribute('data-icon'),
    ).toBe('chevron-up');
  });
});

describe('before Start (Req 22.8, 22.15)', () => {
  it('the how-to card of three steps, the tip card with the limits line, then the idle picture', async () => {
    const s = mount();
    await s.settle();
    const howTo = s.getByTestId('how-to');
    expect(howTo.querySelector('[data-part="how-to-card"] h2')?.textContent).toBe(HOW_TO_TITLE);
    expect(
      [...howTo.querySelectorAll('li')].map((li) => li.textContent?.replace(/^\d/, '')),
    ).toEqual([...HOW_TO_STEPS]);
    const tip = howTo.querySelector<HTMLElement>('[data-part="tip-card"]') as HTMLElement;
    expect(tip.querySelector('h2')?.textContent).toBe(TIP_TITLE);
    expect(icon(tip.querySelector('h2'))).toBe('lightbulb');
    expect(tip.style.background).toBe('var(--alidade-infoTint)');
    expect(tip.querySelector('[data-testid="limits-note"]')).not.toBeNull();
    const idle = s
      .getByTestId('sight-screen')
      .querySelector('[data-part="idle-image"]') as HTMLElement;
    expect(idle.getAttribute('aria-hidden')).toBe('true');
    expect(idle.querySelector('[data-art="idle-scene"]')).not.toBeNull();
    expect(howTo.compareDocumentPosition(idle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Start, docked, with its icon.
    const start = s.getByRole('button', { name: 'Start' });
    expect(icon(start)).toBe('camera');
  });

  it('once live, neither card nor the idle picture is in view; the camera has its frame', async () => {
    const s = mount();
    await s.toLive();
    expect(s.queryByTestId('how-to')).toBeNull();
    expect(s.getByTestId('sight-screen').querySelector('[data-part="idle-image"]')).toBeNull();
    const surface = s.getByTestId('image-surface');
    expect(surface.querySelectorAll('[data-part="bracket"]')).toHaveLength(4);
    expect(surface.style.borderRadius).toBe('var(--alidade-image-radius)');
  });
});

describe('the docked bar and the rows (Req 22.8, 22.11)', () => {
  it('north needed: the prompt is a warning card and "Set north from the compass" has its compass', async () => {
    const s = mount({ relative: true });
    await s.toLive();
    const bar = s.getByTestId('control-bar');
    const prompt = bar.querySelector<HTMLElement>('[data-testid="yaw-status"]') as HTMLElement;
    expect(prompt.style.background).toBe('var(--alidade-warnTint)');
    expect(icon(prompt)).toBe('warning');
    expect(icon(s.getByRole('button', { name: 'Set north from the compass' }))).toBe('compass');
    const other = s.getByRole('button', { name: 'Other ways to set north' });
    expect(other.lastElementChild?.getAttribute('data-icon')).toBe('chevron-right');
  });

  it('frozen: "Capture" with a camera, "Back to live" with a video icon', async () => {
    const s = mount();
    await s.toLive();
    await s.press('freeze');
    expect(icon(s.getByRole('button', { name: 'Capture' }))).toBe('camera');
    expect(icon(s.getByRole('button', { name: 'Back to live' }))).toBe('video');
  });

  it('Back begins with a chevron-left and keeps its word', async () => {
    const s = mount();
    await s.settle();
    const back = s.getByRole('button', { name: 'Back' });
    expect(back.firstElementChild?.getAttribute('data-icon')).toBe('chevron-left');
  });
});
