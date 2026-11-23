// The Smoke tab in the Field look (Req 22.6, design D25.2, D25.3, D25.5; task 24.4): the same words in
// the same order (the other tests of the screen say so), drawn as cards with icons.

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
  it('the not-calling statement is a danger card with a shield, its words in dangerInk', () => {
    const s = show([]);
    const p = s.getByTestId('not-calling');
    expect(p.textContent).toBe(NOT_CALLING_TEXT);
    expect(icon(p)).toBe('shield');
    expect(p.style.color).toBe('var(--alidade-dangerInk)');
    const card = p.parentElement as HTMLElement;
    expect(card.style.background).toBe('var(--alidade-dangerTint)');
    expect(card.style.borderLeft).toBe('4px solid var(--alidade-dangerBar)');
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

  it('a supporting fact is a row with an icon in a round tint', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const rows = [
      ...s.getByTestId('smoke-screen').querySelectorAll(':scope > [data-part="icon-row"]'),
    ];
    expect(rows.map(icon)).toContain('compass');
  });

  it('"Where to sight from next" is a card with the schematic, wherever its sentence is shown', () => {
    const s = show([postsIncident(['west'])]);
    const advice = s.getByTestId('advice');
    expect(icon(advice.querySelector('h2'))).toBe('crosshair');
    expect(advice.querySelector('[data-testid="schematic"]')).not.toBeNull();
  });

  it('the rows: "Add a sighting someone sent me" ends in a chevron-right; the disclosures in a chevron-down that turns up', () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    const inbox = s.getByRole('button', { name: /Add a sighting someone sent me/ });
    expect(inbox.lastElementChild?.getAttribute('data-icon')).toBe('chevron-right');
    expect(icon(inbox)).toBe('inbox');
    for (const details of s.getByTestId('smoke-screen').querySelectorAll('details')) {
      const summary = details.querySelector('summary') as HTMLElement;
      expect(summary.querySelector('[data-icon="chevron-right"]')).toBeNull();
      expect(summary.lastElementChild?.getAttribute('data-icon')).toBe('chevron-down');
      act(() => {
        (details as HTMLDetailsElement).open = true;
        details.dispatchEvent(new Event('toggle'));
      });
      expect(details.querySelector('summary')?.lastElementChild?.getAttribute('data-icon')).toBe(
        'chevron-up',
      );
    }
    const icons = [...s.getByTestId('smoke-screen').querySelectorAll('summary')].map(icon);
    expect(icons).toEqual(['info', 'phone']);
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
