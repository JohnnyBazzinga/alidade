// The Smoke tab in the Mira look (Req 22.6, design D26.3): the same words (the other tests of the
// screen say so), drawn as Mira's cards, tiles and note.

import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Incident } from '../math/incident/incident-state';
import { NOT_CALLING_TEXT } from '../math/texts';
import { postsIncident } from '../test-support/geometry-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { SmokeScreen } from './SmokeScreen';

function show(incidents: readonly Incident[], saved?: string) {
  return renderScreen(
    <SmokeScreen
      onSight={() => undefined}
      onInbox={() => undefined}
      onPrivacy={() => undefined}
      onShowMap={() => undefined}
      onSend={() => undefined}
      {...(saved === undefined ? {} : { saved: { sightingId: saved } })}
    />,
    { storedItems: storedWith(incidents) },
  );
}

const icon = (el: Element | null | undefined) =>
  el?.querySelector('svg')?.getAttribute('data-icon') ?? null;

describe('the Smoke tab as cards (Req 22.6)', () => {
  it('the not-calling statement is Mira\u2019s note at the foot: the danger tint, its words in dangerInk', () => {
    const s = show([]);
    const p = s.getByTestId('not-calling');
    expect(p.textContent).toBe(NOT_CALLING_TEXT);
    expect(p.getAttribute('role')).toBe('note');
    expect(p.style.color).toBe('var(--alidade-dangerInk)');
    expect(p.style.background).toBe('var(--alidade-dangerTint)');
    expect(p.style.borderRadius).toBe('var(--alidade-tile-radius)');
    // Its first sentence is the headline, bold; the rest is the instruction, not bold.
    expect(p.querySelector('strong')?.textContent).toBe('This app does not call or notify anyone.');
    expect(p.style.fontWeight).not.toBe('700');
    // The last block of the screen.
    expect(s.getByTestId('smoke-screen').lastElementChild).toBe(p);
  });

  it('a Fix is a card: the position with its radius after a pin, how many it rests on, then Show on map with a map icon', () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    const card = s.getByTestId('fix-words');
    expect(card.style.background).toBe('var(--alidade-card)');
    expect(card.style.borderRadius).toBe('var(--alidade-card-radius)');
    const rows = [...card.querySelectorAll('[data-part="icon-row"]')];
    expect(rows.map(icon)).toEqual(['pin', 'pins']);
    expect(rows[0]?.textContent).toMatch(/±|within|m\b/);
    const map = s.getByRole('button', { name: 'Show on map' });
    expect(icon(map)).toBe('map');
  });

  it('a warning of the state is a warning card: its icon, its words in warnInk', () => {
    // Two sightings: the sentence for two is the warning that applies.
    const s = show([postsIncident(['west', 'east'])]);
    const p = s.getByTestId('check-statement');
    expect(icon(p)).toBe('warning');
    expect(p.style.color).toBe('var(--alidade-warnInk)');
    expect((p.parentElement as HTMLElement).style.background).toBe('var(--alidade-warnTint)');
  });

  it('the compass sentence is a line after its icon, in the dim ink', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const line = s.getByText('Phone compasses are off by several degrees.');
    expect(icon(line)).toBe('compass');
    expect(line.style.color).toBe('var(--alidade-inkDim)');
  });

  it('"Where to sight from next" is a card with the schematic, wherever its sentence is shown', () => {
    const s = show([postsIncident(['west'])]);
    const advice = s.getByTestId('advice');
    expect(advice.querySelector('h2')?.textContent).toBe('Where to sight from next');
    expect(advice.style.borderRadius).toBe('var(--alidade-card-radius)');
    expect(advice.querySelector('[data-testid="schematic"]')).not.toBeNull();
  });

  it('the tiles: "Add a sighting someone sent me" ends in a chevron-right; "Details and limits" in a chevron-down that turns over', () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    const inbox = s.getByRole('button', { name: /Add a sighting someone sent me/ });
    expect(inbox.lastElementChild?.getAttribute('data-icon')).toBe('chevron-right');
    expect(inbox.style.borderRadius).toBe('var(--alidade-tile-radius)');
    const details = s.getByRole('button', { name: 'Details and limits' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    const chevron = details.querySelector('[data-icon="chevron-down"]') as SVGElement | null;
    expect(chevron).not.toBeNull();
    act(() => details.click());
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(
      (details.querySelector('[data-icon="chevron-down"]') as SVGElement).style.transform,
    ).toBe('rotate(180deg)');
    expect(s.getByTestId('details-and-limits').hidden).toBe(false);
  });

  it('the primary action has its icon: a crosshair for "Sight the smoke", a send icon for "Send this sighting"', () => {
    const s = show([]);
    expect(icon(s.getByRole('button', { name: 'Sight the smoke' }))).toBe('crosshair');
    const incident = postsIncident(['west', 'east']);
    const id = incident.entries[0]?.sighting.sightingId ?? '';
    const t = show([incident], id);
    expect(icon(t.getByRole('button', { name: 'Send this sighting' }))).toBe('send');
  });
});
