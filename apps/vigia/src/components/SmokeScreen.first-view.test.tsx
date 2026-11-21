// The Smoke screen's first view and its two disclosures (Req 6.12, 4.5, 5.4, 6.2 to 6.4, 7.2, 16.1,
// 17.1; design D23.4, D23.5; task 23.6). jsdom does no layout, so the tests read what is inside and
// outside each `details`; "first view" is the text of the screen outside every `details` and
// button, and its words are counted against the bound of Req 6.12.

import { BODY_FONT_STACK, NUMERIC_FONT_STACK } from '@alidade/ui';
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
    for (const el of clone.querySelectorAll('details, button')) el.remove();
    return clone.textContent ?? '';
  };
  const words = (): number => firstView().trim().split(/\s+/).filter(Boolean).length;
  const disclosures = () =>
    [...root.querySelectorAll('details')].map((d) => ({
      summary: d.querySelector('summary')?.textContent ?? '',
      open: d.open,
      text: d.textContent ?? '',
    }));
  return { ...screen, calls, firstView, words, disclosures, root };
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
    // In this order.
    const at = (t: string) => view.indexOf(t);
    expect(at(NOT_CALLING_TEXT)).toBeLessThan(at('Probably here'));
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
    const data = [...s.root.querySelectorAll('details')].find((d) =>
      d.querySelector('summary')?.textContent?.startsWith("This phone's data and mode"),
    ) as HTMLDetailsElement;
    expect(data.open).toBe(false);
    expect(data.querySelector('summary')?.textContent).toBe(
      "This phone's data and mode: This phone",
    );
    expect(data.textContent).toContain('Delete everything on this phone');
    expect(data.textContent).toContain('What leaves this phone');
    expect(data.querySelector('[data-testid="mode-control"]')).not.toBeNull();
    const outside = s.firstView();
    expect(outside).not.toContain('Delete everything on this phone');
  });

  it('still asks once before it deletes, and the privacy page is still reachable', () => {
    const s = show([postsIncident(['west', 'east'])]);
    fireEvent.click(s.getByRole('button', { name: 'Delete everything on this phone' }));
    expect(s.getByTestId('delete-all-dialog')).toBeTruthy();
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    fireEvent.click(s.getByRole('button', { name: 'What leaves this phone' }));
    expect(s.calls).toEqual(['privacy']);
  });
});

describe('the line after a capture or a join (Req 4.11, 4.12)', () => {
  it('shows the status line directly after the not-calling statement', () => {
    const s = show([postsIncident(['west', 'east'])], { statusLine: 'Joined: 2 sightings' });
    const view = s.firstView();
    expect(view.indexOf('Joined: 2 sightings')).toBe(NOT_CALLING_TEXT.length);
  });

  it('with a saved sighting: "Send this sighting" is the primary action and "Sight the smoke" is secondary', () => {
    const incident = postsIncident(['west', 'east']);
    const id = incident.entries[0]?.sighting.sightingId ?? '';
    const s = show([incident], { saved: { sightingId: id } });
    expect(s.firstView()).toMatch(/Sighting saved: .*° ± .*° \(true\)/);
    const send = s.getByRole('button', { name: 'Send this sighting' });
    expect(send.dataset.primary).toBe('true');
    expect(s.getByRole('button', { name: 'Sight the smoke' }).dataset.primary).not.toBe('true');
    fireEvent.click(send);
    expect(s.calls).toEqual([`send:${id}`]);
  });
});

// D24: a sentence is in the body stack, at the readout's size and weight; the position is numeric.
describe('the stacks of the first view (design D24)', () => {
  it('sets the one-sighting statement in the body stack, at the readout size', () => {
    const s = show([postsIncident(['west'])]);
    const el = s.getByTestId('check-statement');
    expect(el.style.fontFamily).toBe(BODY_FONT_STACK);
    expect(el.style.fontSize).toBe('20px');
  });

  it('sets "None of these sightings is used" in the body stack, at the readout size', () => {
    const hidden = postsIncident(['west', 'east'], () => ({ hidden: true }));
    const s = show([hidden]);
    const el = s.getByText(/None of these sightings is used/);
    expect(el.style.fontFamily).toBe(BODY_FONT_STACK);
    expect(el.style.fontSize).toBe('20px');
  });

  it('keeps the position in the numeric stack', () => {
    const s = show([postsIncident(['west', 'east'])]);
    expect(s.getByTestId('fix-headline').style.fontFamily).toBe(NUMERIC_FONT_STACK);
  });
});
