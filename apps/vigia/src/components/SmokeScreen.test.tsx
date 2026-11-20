// The Smoke screen (design §9; Req 4.5, 5.4, 5.5, 6.1 to 6.6, 7.2 to 7.5, 14.5, 16.1) in each
// state: no smoke, one sighting, two, three that agree and three that do not, four, a failed
// solve with its advice, and a Fix with the phone's own position known and unknown.

import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  checkStatement,
  disagreementStatement,
  incidentStatement,
} from '../math/assessment/statements';
import { messageFor } from '../math/messages';
import { NOT_CALLING_TEXT } from '../math/texts';
import {
  entryOfBearing,
  incidentOfEntries,
  pointingAt,
  postsIncident,
  TARGET,
} from '../test-support/geometry-fixtures';
import { offsetFromOrigin, sightingIdOf } from '../test-support/incident-fixtures';
import { allReceived, renderScreen, storedWith } from '../test-support/render-screen';
import type { Incident } from '../math/incident/incident-state';
import { STATE_KEY } from '../adapters/storage';
import { SmokeScreen } from './SmokeScreen';

const DEG = Math.PI / 180;

function show(incidents: readonly Incident[] = []) {
  const calls: string[] = [];
  const screen = renderScreen(
    <SmokeScreen
      onSight={() => void calls.push('sight')}
      onInbox={() => void calls.push('inbox')}
      onPrivacy={() => void calls.push('privacy')}
    />,
    { storedItems: storedWith(incidents) },
  );
  const text = () => screen.getByTestId('smoke-screen').textContent ?? '';
  const buttons = () => screen.getAllByRole('button').map((b) => b.textContent ?? '');
  return { ...screen, calls, text, buttons };
}

/** The lead's case of 2026-11-19: three posts, the second 15° off, sigmas of 2°. */
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

/** Two posts on one north-south line, both looking north at the smoke: the lines do not cross. */
function inLine(): Incident {
  return incidentOfEntries(
    [offsetFromOrigin(0, 0), offsetFromOrigin(0, -2000)].map((observer, i) =>
      entryOfBearing(i + 1, pointingAt(sightingIdOf(i + 1), observer, TARGET)),
    ),
  );
}

const messageText = (reason: Parameters<typeof messageFor>[0]['reason']) => {
  const m = messageFor({ ok: false, reason });
  return `${m.whatHappened} ${m.whatToDo}`;
};

describe('SmokeScreen in every state (design §9)', () => {
  // Task 21.3: the primary action is the screen's last control, which the App puts in its row
  // above the tabs (App.test.tsx); it was the first in the scrolling part.
  it('no smoke: the not-calling statement, how to start, and Sight the smoke as the primary control', () => {
    const s = show();
    expect(s.getByTestId('not-calling').textContent).toBe(NOT_CALLING_TEXT);
    expect(s.text()).toContain('No smoke yet');
    expect(s.text()).toContain(checkStatement('none'));
    expect(s.buttons().at(-1)).toBe('Sight the smoke');
    expect(s.getByRole('button', { name: 'Sight the smoke' }).dataset.primary).toBe('true');
    expect(s.text()).not.toContain(incidentStatement());
    fireEvent.click(s.getByRole('button', { name: 'Sight the smoke' }));
    expect(s.calls).toEqual(['sight']);
  });

  it('one sighting: a direction and not a place, no position, the advice to move sideways', () => {
    const s = show([postsIncident(['west'])]);
    expect(s.text()).toContain(checkStatement('one'));
    expect(s.text()).not.toMatch(/Probably here|° N/);
    expect(s.getByTestId('advice').textContent).toContain('a third');
    expect(s.text()).toContain(incidentStatement());
    expect(s.getByTestId('limits-note')).toBeTruthy();
  });

  it('two sightings: the position with its metres first, then that two cannot check each other', () => {
    const s = show([postsIncident(['west', 'east'])]);
    const headline = s.getByTestId('fix-headline').textContent ?? '';
    expect(headline).toMatch(/^Probably here: .*° N, .*° W, within about .* \(95 %\)\.$/);
    expect(s.text()).toContain('2 sightings, 2 used');
    expect(s.text()).toContain(checkStatement('two'));
    expect(s.text().indexOf(headline)).toBeLessThan(s.text().indexOf(checkStatement('two')));
    expect(s.getByTestId('advice').textContent).toMatch(
      /from the (east|west) or the (east|west) of the smoke/,
    );
    expect(s.text()).toContain(incidentStatement());
    expect(s.queryByTestId('disagreement')).toBeNull();
  });

  it('three that agree: what three can and cannot check, and no disagreement', () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    expect(s.getByTestId('fix-headline').textContent).toMatch(/^Probably here:/);
    expect(s.text()).toContain(checkStatement('three'));
    expect(s.queryByTestId('disagreement')).toBeNull();
    expect(s.text()).toContain(incidentStatement());
  });

  it('three that disagree: the disagreement is the first thing after the header, and no "probably"', () => {
    const s = show([disagreeing()]);
    const alert = s.getByTestId('disagreement');
    expect(alert.textContent).toBe(disagreementStatement('three_disagree', 'three'));
    const order = [...s.getByTestId('smoke-screen').querySelectorAll('[data-testid]')].map((e) =>
      e.getAttribute('data-testid'),
    );
    expect(order.indexOf('disagreement')).toBeLessThan(order.indexOf('fix-headline'));
    expect(order.indexOf('disagreement')).toBe(order.indexOf('smoke-header') + 1);
    expect(s.getByTestId('fix-headline').textContent).toMatch(
      /^Best fit of sightings that do not agree/,
    );
    expect(s.text()).not.toMatch(/Probably here|probably within/);
    expect(s.text()).toContain(incidentStatement());
    // No sighting is named as the culprit (Req 5.5).
    expect(s.text()).not.toMatch(/Sighting \d/);
  });

  it('four: the statistical rule and its limits', () => {
    const s = show([postsIncident(['west', 'east', 'side', 'southwest'])]);
    expect(s.text()).toContain(checkStatement('four_or_more'));
    expect(s.text()).toContain('4 sightings, 4 used');
    expect(s.text()).toContain(incidentStatement());
  });

  it('a failed solve: its Message, no position, and the advice to move sideways', () => {
    const s = show([inLine()]);
    const notice = s.getAllByRole('alert').map((a) => a.textContent ?? '');
    expect(
      notice.some(
        (n) => n === messageText('singular_geometry') || n === messageText('colocated_observers'),
      ),
    ).toBe(true);
    expect(s.queryByTestId('fix-headline')).toBeNull();
    expect(s.getByTestId('advice').textContent).toContain('a third');
    expect(s.text()).toContain(incidentStatement());
  });

  it('a Fix with the phone\u2019s position known: the distance from you with its interval', () => {
    const s = show([postsIncident(['west', 'east'])]);
    expect(s.getByTestId('from-you').textContent).toMatch(
      /^About .* of where you took your last sighting, give or take .* \(at least 95 %\)\.$/,
    );
  });

  it('a Fix with the phone\u2019s position unknown: no distance from you', () => {
    const s = show([allReceived(postsIncident(['west', 'east']))]);
    expect(s.getByTestId('fix-headline')).toBeTruthy();
    expect(s.queryByTestId('from-you')).toBeNull();
    expect(s.text()).not.toMatch(/About .* of where you took your last sighting/);
  });

  it('says when the smoke was started, and how many sightings it holds and uses', () => {
    const incident = postsIncident(['west', 'east', 'side'], (_p, i) => ({ hidden: i === 2 }));
    const s = show([incident]);
    const header = s.getByTestId('smoke-header').textContent ?? '';
    expect(header).toContain('UTC');
    expect(header).toContain('3 sightings, 2 used');
  });
});

describe('the first-screen controls (Req 4.5, 14.5)', () => {
  it('Delete everything on this phone asks once, and deletes only when confirmed', () => {
    const s = show([postsIncident(['west', 'east'])]);
    fireEvent.click(s.getByRole('button', { name: 'Delete everything on this phone' }));
    const dialog = s.getByTestId('delete-all-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep them' }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(s.queryByTestId('delete-all-dialog')).toBeNull();
    fireEvent.click(s.getByRole('button', { name: 'Delete everything on this phone' }));
    fireEvent.click(
      within(s.getByTestId('delete-all-dialog')).getByRole('button', { name: 'Delete everything' }),
    );
    expect(s.store.getSnapshot().state.incidents).toHaveLength(0);
    expect(s.text()).toContain('No smoke yet');
  });

  it('says in the confirmation that the backup copy goes too, only when there is one', () => {
    const BACKUP_SENTENCE =
      'The backup copy of saved sightings that could not be read is deleted too.';
    const without = show([postsIncident(['west', 'east'])]);
    fireEvent.click(without.getByRole('button', { name: 'Delete everything on this phone' }));
    expect(without.getByTestId('delete-all-dialog').textContent).not.toContain(BACKUP_SENTENCE);
    without.unmount();
    const withBackup = renderScreen(
      <SmokeScreen
        onSight={() => undefined}
        onInbox={() => undefined}
        onPrivacy={() => undefined}
      />,
      { storedItems: { [STATE_KEY]: 'not json {' } },
    );
    fireEvent.click(withBackup.getByRole('button', { name: 'Delete everything on this phone' }));
    const dialog = withBackup.getByTestId('delete-all-dialog');
    expect(dialog.textContent).toContain(BACKUP_SENTENCE);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete everything' }));
    expect([...withBackup.fake.storage.items.keys()]).toEqual([]);
  });

  it('opens the Inbox and the privacy page', () => {
    const s = show();
    fireEvent.click(s.getByRole('button', { name: /Add a sighting someone sent me/ }));
    fireEvent.click(s.getByRole('button', { name: 'What leaves this phone' }));
    expect(s.calls).toEqual(['inbox', 'privacy']);
  });

  it('shows a storage notice of the store with its Message', () => {
    const s = renderScreen(
      <SmokeScreen
        onSight={() => undefined}
        onInbox={() => undefined}
        onPrivacy={() => undefined}
      />,
      { memoryStorage: true },
    );
    expect(s.getAllByRole('alert').map((a) => a.textContent)).toContain(
      messageText('storage_unavailable'),
    );
  });

  it('lets the user open another smoke held on this phone', async () => {
    const s = show();
    expect(s.queryByTestId('other-smokes')).toBeNull();
    const bearing = pointingAt('bearing-1', offsetFromOrigin(-800, 0), TARGET);
    await s.settle(() => void s.store.capture(bearing, 'new'));
    const firstId = s.store.getSnapshot().state.openIncidentId;
    await s.settle(() => void s.store.capture({ ...bearing, id: 'bearing-2' }, 'new'));
    expect(s.store.getSnapshot().state.openIncidentId).not.toBe(firstId);
    const others = s.getByTestId('other-smokes');
    fireEvent.click(within(others).getByRole('button', { name: /^Open the smoke started/ }));
    expect(s.store.getSnapshot().state.openIncidentId).toBe(firstId);
  });
});
