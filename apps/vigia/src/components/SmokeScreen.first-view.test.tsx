// The Smoke screen's first view and its two disclosures (Req 6.12, 4.5, 5.4, 6.2 to 6.4, 7.2, 16.1,
// 17.1; design D23.4, D23.5, D26.3; task 23.6). jsdom does no layout, so the tests read what is
// inside and outside each disclosure: in Mira a tile that opens a panel kept in the page, hidden
// while closed (`data-disclosure` names it), as a closed `details` keeps its contents. "First view"
// is the text of the screen outside every disclosure and button, and its words are counted against
// the bound of Req 6.12.

import { BODY_FONT_STACK, DISPLAY_FONT_STACK, NUMERIC_FONT_STACK } from '@alidade/ui';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  checkStatement,
  disagreementStatement,
  incidentStatement,
} from '../math/assessment/statements';
import { geometrySentence } from '../math/fix/geometry-class';
import type { Incident } from '../math/incident/incident-state';
import { COMPASS_ONE_LINE_TEXT, FIX_ASSUMPTION_TEXT, NOT_CALLING_TEXT } from '../math/texts';
import {
  entryOfBearing,
  incidentOfEntries,
  pointingAt,
  postsIncident,
  TARGET,
} from '../test-support/geometry-fixtures';
import { offsetFromOrigin, sightingIdOf } from '../test-support/incident-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { SmokeScreen, type SmokeScreenProps } from './SmokeScreen';

const DEG = Math.PI / 180;

function show(incidents: readonly Incident[], props: Partial<SmokeScreenProps> = {}) {
  const calls: string[] = [];
  const screen = renderScreen(
    <SmokeScreen
      onSight={() => void calls.push('sight')}
      onInbox={() => void calls.push('inbox')}
      onPrivacy={() => void calls.push('privacy')}
      onShowMap={() => void calls.push('map')}
      onSend={(id) => void calls.push(`send:${id}`)}
      {...props}
    />,
    { storedItems: storedWith(incidents) },
  );
  const root = screen.getByTestId('smoke-screen');
  /** The text of the screen outside every disclosure and every button. */
  const firstView = (): string => {
    const clone = root.cloneNode(true) as HTMLElement;
    for (const el of clone.querySelectorAll('details, button, [hidden]')) el.remove();
    return clone.textContent ?? '';
  };
  const words = (): number => firstView().trim().split(/\s+/).filter(Boolean).length;
  const disclosures = () =>
    [...root.querySelectorAll<HTMLElement>('details, [data-disclosure]')].map((d) =>
      d instanceof HTMLDetailsElement
        ? {
            summary: d.querySelector('summary')?.textContent ?? '',
            open: d.open,
            text: d.textContent ?? '',
          }
        : { summary: d.dataset.disclosure ?? '', open: !d.hidden, text: d.textContent ?? '' },
    );
  /** Opens the panel named `summary` with its tile (Mira). */
  const openPanel = (tileName: RegExp) =>
    fireEvent.click(screen.getByRole('button', { name: tileName }));
  return { ...screen, calls, firstView, words, disclosures, root, openPanel };
}

function disagreeing(): Incident {
  const posts = [offsetFromOrigin(-800, 0), offsetFromOrigin(800, 0), offsetFromOrigin(4000, 3500)];
  return incidentOfEntries(
    posts.map((observer, i) =>
      entryOfBearing(
        i + 1,
        pointingAt(sightingIdOf(i + 1), observer, TARGET, i === 1 ? 15 * DEG : 0, {
          azimuthSigmaRad: 2 * DEG,
        }),
      ),
    ),
  );
}

/** Two observers 600 m apart, 3 000 m from the smoke: the lines cross at about 11°, `poor`. */
function narrow(): Incident {
  return incidentOfEntries(
    [offsetFromOrigin(-300, 0), offsetFromOrigin(300, 0)].map((observer, i) =>
      entryOfBearing(i + 1, pointingAt(sightingIdOf(i + 1), observer, TARGET)),
    ),
  );
}

describe('the first view with a Fix (Req 6.12)', () => {
  it('holds the position with its 95 % radius, how many sightings, the warning, the compass sentence and "Show on map"', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const view = s.firstView();
    expect(view).toContain(NOT_CALLING_TEXT);
    expect(view).toMatch(/Probably here: .*° N, .*° W, within about .* \(95 %\)\./);
    expect(view).toContain('Based on 2 sightings');
    expect(view).toContain(checkStatement('two'));
    expect(view).toContain(COMPASS_ONE_LINE_TEXT);
    // In this order; Mira puts the not-calling statement at the foot of the screen.
    const at = (t: string) => view.indexOf(t);
    expect(at('Probably here')).toBeLessThan(at('Based on 2'));
    expect(at('Based on 2')).toBeLessThan(at(checkStatement('two')));
    expect(at(checkStatement('two'))).toBeLessThan(at(COMPASS_ONE_LINE_TEXT));
    fireEvent.click(s.getByRole('button', { name: 'Show on map' }));
    expect(s.calls).toEqual(['map']);
  });

  it('puts everything else under ONE disclosure, "Details and limits", closed', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const [details, data] = s.disclosures();
    expect(details?.summary).toBe('Details and limits');
    expect(details?.open).toBe(false);
    expect(data?.open).toBe(false);
    for (const t of [
      'The 95 % area is an ellipse with semi-axes',
      'newest',
      FIX_ASSUMPTION_TEXT,
      incidentStatement(),
      'Where to sight from next',
    ]) {
      expect(details?.text, t).toContain(t);
      expect(s.firstView(), t).not.toContain(t);
    }
    expect(details?.text).toContain('Phone compasses are off by several degrees');
  });

  it('shows no position outside a sentence that holds its radius', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const view = s.firstView();
    const positions = view.match(/\d+(\.\d+)?° [NS]/g) ?? [];
    expect(positions.length).toBeGreaterThan(0);
    expect(view).toMatch(/° N, [^%]*° W, within about [^%]* \(95 %\)/);
    // Nothing else prints a position outside the disclosure.
    expect(view.match(/\d+(\.\d+)?° [NS]/g)).toHaveLength(1);
  });

  it('never hides a disagreement: it is the first thing after the header, outside the disclosure', () => {
    const s = show([disagreeing()]);
    const view = s.firstView();
    const disagreement = disagreementStatement('three_disagree', 'three') ?? 'x';
    expect(view).toContain(disagreement);
    expect(view.indexOf(disagreement)).toBeLessThan(view.indexOf('Best fit of sightings'));
    expect(view).not.toContain('Probably here');
    expect(s.getByTestId('disagreement')).toBeTruthy();
    expect(s.disclosures()[0]?.text).not.toBe('');
  });

  it('never hides poor geometry: the warning and the sentence that says what to do are in the first view', () => {
    const s = show([narrow()]);
    const view = s.firstView();
    expect(view).toContain('The sightings cross at a narrow angle');
    expect(view).toContain(geometrySentence('poor'));
  });

  it('keeps the geometry sentence of a good class under the disclosure only', () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    expect(s.firstView()).not.toContain(geometrySentence('good'));
  });

  it('with three used shows the sentence for three, not the longer one for four', () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    expect(s.firstView()).toContain(checkStatement('three'));
    expect(s.firstView()).not.toContain(checkStatement('four_or_more'));
  });
});

describe('the words of the first view (Req 6.12)', () => {
  it.each([
    ['a plain Fix', () => postsIncident(['west', 'east'])],
    ['three that disagree', disagreeing],
    ['poor geometry', narrow],
  ])('are at most 150 for %s', (_name, incident) => {
    const s = show([incident()]);
    expect(s.words()).toBeLessThanOrEqual(150);
    expect(s.words()).toBeGreaterThan(20);
  });

  it('are at most 150 in the worst case: the longest sentence of each kind, together', () => {
    const count = (t: string) => t.trim().split(/\s+/).length;
    const worst = [
      NOT_CALLING_TEXT,
      'Sighting saved: 45.5° ± 2.0° (true)',
      disagreementStatement('diverging', 'four_or_more') ?? '',
      'Best fit of sightings that do not agree: 31.2345° N, 39.8765° W, within about 18.5 km (95 %), but the 95 % area may not contain the smoke.',
      'Based on 12 sightings.',
      'The sightings cross at a narrow angle (under 20 degrees).',
      geometrySentence('poor'),
      '12 sightings did not agree with the others and were set aside.',
      'The smoke would be 120 km away, beyond what a phone sighting can place.',
      COMPASS_ONE_LINE_TEXT,
    ].join(' ');
    expect(count(worst)).toBeLessThanOrEqual(150);
  });
});

describe('with one used sighting and no Fix (Req 6.12)', () => {
  it('shows a direction and not a place, the advice and the compass sentence; the rest is under the disclosures', () => {
    const s = show([postsIncident(['west'])]);
    const view = s.firstView();
    expect(view).toContain(checkStatement('one'));
    expect(view).toContain('a third');
    expect(view).toContain(COMPASS_ONE_LINE_TEXT);
    expect(view).not.toContain(incidentStatement());
    expect(s.disclosures().map((d) => d.summary)).toEqual([
      'Details and limits',
      "This phone's data and mode: This phone",
    ]);
  });
});

describe('"This phone\u2019s data and mode" (Req 4.5, 17.1, 6.12)', () => {
  it('is one closed disclosure whose summary names the mode and that holds Delete, the privacy page and the mode control', () => {
    const s = show([postsIncident(['west', 'east'])], {
      modeControl: <div data-testid="mode-control">mode</div>,
    });
    const data = s.getByTestId('data-and-mode');
    expect(data.hidden).toBe(true);
    expect(data.dataset.disclosure).toBe("This phone's data and mode: This phone");
    // Its tile says the mode, and opens it.
    const tile = s.getByTestId('data-tile');
    expect(tile.textContent).toBe('Data and modeThis phone');
    expect(tile.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(tile);
    expect(s.getByTestId('data-and-mode').hidden).toBe(false);
    fireEvent.click(tile);
    expect(data.textContent).toContain('Delete everything on this phone');
    expect(data.textContent).toContain('What leaves this phone');
    expect(data.querySelector('[data-testid="mode-control"]')).not.toBeNull();
    const outside = s.firstView();
    expect(outside).not.toContain('Delete everything on this phone');
  });

  it('still asks once before it deletes, and the privacy page is still reachable', () => {
    const s = show([postsIncident(['west', 'east'])]);
    s.openPanel(/^Data and mode/);
    fireEvent.click(s.getByRole('button', { name: 'Delete everything on this phone' }));
    expect(s.getByTestId('delete-all-dialog')).toBeTruthy();
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    fireEvent.click(s.getByRole('button', { name: 'What leaves this phone' }));
    expect(s.calls).toEqual(['privacy']);
  });
});

describe('the line after a capture or a join (Req 4.11, 4.12)', () => {
  it('shows the status line first (Mira: the not-calling statement is at the foot)', () => {
    const s = show([postsIncident(['west', 'east'])], { statusLine: 'Joined: 2 sightings' });
    const view = s.firstView();
    expect(view.indexOf('Joined: 2 sightings')).toBe(0);
    expect(view.trim().endsWith(NOT_CALLING_TEXT)).toBe(true);
  });

  it('with a saved sighting: "Send this sighting" is the primary action and "Sight the smoke" is secondary', () => {
    const incident = postsIncident(['west', 'east']);
    const id = incident.entries[0]?.sighting.sightingId ?? '';
    const s = show([incident], { saved: { sightingId: id } });
    // Mira draws the line of Req 4.11 as "Sighting saved", the numeral and "± 2.1° · true"; the
    // sentence is the name of its line.
    expect(s.getByTestId('status-line').getAttribute('aria-label')).toMatch(
      /Sighting saved: .*° ± .*° \(true\)/,
    );
    expect(s.firstView()).toMatch(/Sighting saved\d+\.\d°± \d+\.\d° · true/);
    const send = s.getByRole('button', { name: 'Send this sighting' });
    expect(send.dataset.primary).toBe('true');
    expect(s.getByRole('button', { name: 'Sight the smoke' }).dataset.primary).not.toBe('true');
    fireEvent.click(send);
    expect(s.calls).toEqual([`send:${id}`]);
  });
});

// D24 as Mira draws it (D26.3): the one-sighting statement is the screen's title, in the display
// font at 24; a warning is in the body font; the position is numeric.
describe('the stacks of the first view (design D24, D26.3)', () => {
  it('sets the one-sighting statement as the title, in the display font at 24', () => {
    const s = show([postsIncident(['west'])]);
    const el = s.getByTestId('check-statement');
    expect(el.tagName).toBe('H1');
    expect(el.style.fontFamily).toBe(DISPLAY_FONT_STACK);
    expect(el.style.fontSize).toBe('24px');
  });

  it('sets "None of these sightings is used" in the body stack, extra bold', () => {
    const hidden = postsIncident(['west', 'east'], () => ({ hidden: true }));
    const s = show([hidden]);
    const el = s.getByText(/None of these sightings is used/);
    expect(el.style.fontFamily).toBe(BODY_FONT_STACK);
    expect(el.style.fontWeight).toBe('800');
  });

  it('keeps the position in the numeric stack', () => {
    const s = show([postsIncident(['west', 'east'])]);
    expect(s.getByTestId('fix-headline').style.fontFamily).toBe(NUMERIC_FONT_STACK);
  });
});

// Req 22.18 (2026-11-28, after the lead's walk and two reviews): with one used sighting and no
// position, the screen's next step is two cards, whatever brought the user here.
describe('the next step after one sighting (Req 22.18)', () => {
  it('shows "Move and sight again" in the yellow and "Send this sighting" beside it, before the advice, with no fixed row', () => {
    const incident = postsIncident(['west']);
    const id = incident.entries[0]?.sighting.sightingId ?? '';
    const s = show([incident], { saved: { sightingId: id } });
    const next = s.getByTestId('next-step');
    const [move, send] = [...next.querySelectorAll<HTMLButtonElement>('button')];
    expect(move?.getAttribute('aria-label')).toBe('Move and sight again');
    expect(move?.dataset.primary).toBe('true');
    expect(move?.style.background).toBe('var(--alidade-primary)');
    expect(send?.getAttribute('aria-label')).toBe('Send this sighting');
    expect(send?.dataset.primary).toBeUndefined();
    expect(
      next.compareDocumentPosition(s.getByTestId('advice')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(s.queryByTestId('primary-action')).toBeNull();
    // The outline "Sight the smoke" is gone: the yellow card is the way to the camera.
    expect(s.queryByRole('button', { name: 'Sight the smoke' })).toBeNull();
    fireEvent.click(move as HTMLButtonElement);
    fireEvent.click(send as HTMLButtonElement);
    expect(s.calls).toEqual(['sight', `send:${id}`]);
  });

  it('keeps the two steps when the user comes back later, naming the sighting and its age', () => {
    const s = show([postsIncident(['west'])]);
    expect(s.getByTestId('next-step')).toBeTruthy();
    expect(s.queryByText('Sighting saved')).toBeNull();
    expect(s.getByTestId('sighting-age').textContent).toMatch(/^Sighting 1 · /);
  });

  it('puts the line after a Send under the cards, so both stay in view', () => {
    const s = show([postsIncident(['west'])], { statusLine: 'Sent it? Ask them.' });
    const next = s.getByTestId('next-step');
    expect(next.querySelector('[data-testid="status-line"]')?.textContent).toBe(
      'Sent it? Ask them.',
    );
  });

  it('is not shown once there is a position: the screen is as before', () => {
    const s = show([postsIncident(['west', 'east'])]);
    expect(s.queryByTestId('next-step')).toBeNull();
    expect(s.getByRole('button', { name: 'Sight the smoke' }).dataset.primary).toBe('true');
  });
});
