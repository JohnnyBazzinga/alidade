// The Sightings screen (design §9; Req 3.6, 5.1, 5.2, 5.6, 9.5, 15.5): one row for every
// Sighting with its direction and sigma, its accuracy, its time and age, where it came from,
// used or set aside with the Message of its cause, and the channels it was shared by; Hide and
// Show at once, Delete after one confirmation; a conflict shown with both versions.

import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { checkStatement } from '../math/assessment/statements';
import { messageFor } from '../math/messages';
import type { Incident } from '../math/incident/incident-state';
import { START_UTC_MS } from '../test-support/fake-environment';
import { postsIncident } from '../test-support/geometry-fixtures';
import { canonicalOf, INCIDENT_ID, sightingIdOf } from '../test-support/incident-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { SightingsScreen } from './SightingsScreen';

const DEG = Math.PI / 180;

function show(incidents: readonly Incident[]) {
  const shared: string[] = [];
  const s = renderScreen(
    <SightingsScreen onShare={(id) => void shared.push(id)} onInbox={() => undefined} />,
    { storedItems: storedWith(incidents) },
  );
  const rows = () => s.getAllByTestId('sighting-row');
  return { ...s, shared, rows };
}

/** Two local posts and a third, received, sighting with its own numbers. */
function mixed(): Incident {
  const base = postsIncident(['west', 'east']);
  const third = canonicalOf(
    3,
    INCIDENT_ID,
    {
      azimuthRad: 45.5 * DEG,
      azimuthSigmaRad: 2 * DEG,
      positionAccuracyM: 8,
      // Half a minute off the minute: the code keeps the time to the second.
      timeUtcMs: START_UTC_MS - 12 * 60_000 - 30_000,
    },
    'received',
    START_UTC_MS - 6 * 60_000,
  );
  return {
    ...base,
    entries: [...base.entries, { ...third, hidden: false, shared: [] }].sort((a, b) =>
      a.sighting.sightingId < b.sighting.sightingId ? -1 : 1,
    ),
  };
}

const causeText = (reason: 'hidden_by_user') => {
  const m = messageFor({ ok: false, reason });
  return `Set aside: ${m.whatHappened} ${m.whatToDo}`;
};

describe('SightingsScreen rows (design §9, Req 3.6, 5.1, 5.2)', () => {
  it('lists every sighting in time order with the statement by count first', () => {
    const s = show([mixed()]);
    expect(s.getByTestId('sightings-screen').textContent).toContain(checkStatement('three'));
    expect(s.rows()).toHaveLength(3);
    expect(s.rows().map((r) => r.querySelector('h3')?.textContent)).toEqual([
      'Sighting 1, received at 14:07 UTC',
      'Sighting 2, this phone',
      'Sighting 3, this phone',
    ]);
  });

  it('gives the direction with its sigma, the accuracy, the time and age, and used', () => {
    const s = show([mixed()]);
    const row = s.rows()[0];
    expect(row?.textContent).toContain('Toward 45.5° ± 2.0° (true north)');
    expect(row?.textContent).toContain('Observer position known to 8 m');
    expect(row?.textContent).toContain('Taken 14:00 UTC, 12 min ago');
    expect(row?.textContent).toContain('Used');
    expect(row?.textContent).toContain('Not shared from this phone');
  });

  it('Hide sets a sighting aside with the Message of hidden_by_user, Show brings it back', () => {
    const s = show([mixed()]);
    const first = () => s.rows()[0];
    const row = first();
    if (row === undefined) throw new Error('no row');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    expect(first()?.textContent).toContain(causeText('hidden_by_user'));
    expect(s.store.getSnapshot().open?.assessment.ok).toBe(true);
    const again = first();
    if (again === undefined) throw new Error('no row');
    fireEvent.click(within(again).getByRole('button', { name: 'Show' }));
    expect(first()?.textContent).toContain('Used');
  });

  it('Delete asks once and deletes only when confirmed', () => {
    const s = show([mixed()]);
    const row = s.rows()[1];
    if (row === undefined) throw new Error('no row');
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Keep it' }));
    expect(s.rows()).toHaveLength(3);
    const again = s.rows()[1];
    if (again === undefined) throw new Error('no row');
    fireEvent.click(within(again).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(again).getByRole('button', { name: 'Delete this sighting' }));
    expect(s.rows()).toHaveLength(2);
  });

  it('Share opens the Share sheet for that sighting', () => {
    const s = show([mixed()]);
    const row = s.rows()[2];
    if (row === undefined) throw new Error('no row');
    fireEvent.click(within(row).getByRole('button', { name: 'Share' }));
    expect(s.shared).toEqual([row.dataset.sightingId]);
  });

  it('says by which channels a sighting was shared from this phone (Req 15.5)', async () => {
    const s = show([mixed()]);
    const id = s.rows()[1]?.dataset.sightingId ?? '';
    await s.settle(() => {
      s.store.markShared(id, 'link');
      s.store.markShared(id, 'text');
      s.store.markShared(id, 'link');
    });
    expect(s.rows()[1]?.textContent).toContain('Shared by link, text code');
  });
});

describe('a conflict (Req 9.5)', () => {
  it('is shown with both versions, the held one first', async () => {
    const s = show([postsIncident(['west', 'east'])]);
    const held = s.store.getSnapshot().open?.incident.entries[0];
    const other = canonicalOf(1, INCIDENT_ID, { azimuthRad: 1.2 }, 'received');
    await s.settle(() => {
      s.store.paste(other.code);
      s.store.addFromInbox(other.code, false);
    });
    const conflict = s.getByTestId('conflict');
    const m = messageFor({ ok: false, reason: 'sighting_conflict' });
    expect(conflict.textContent).toContain(m.whatHappened);
    const versions = within(conflict).getAllByTestId('conflict-version');
    expect(versions.map((v) => v.querySelector('h4')?.textContent)).toEqual([
      'Kept on this phone',
      'The other one',
    ]);
    expect(versions[1]?.textContent).toContain('Toward 68.8°');
    expect(held?.sighting.sightingId).toBe(sightingIdOf(1));
  });
});

describe('no smoke open', () => {
  it('says so and how to start', () => {
    const s = show([]);
    expect(s.getByTestId('sightings-screen').textContent).toContain('No smoke yet');
    expect(s.getByTestId('sightings-screen').textContent).toContain(checkStatement('none'));
  });
});
