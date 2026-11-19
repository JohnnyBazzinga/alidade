// The Inbox sheet (design §9, D7; Req 4.2, 9.4, 10.3, 10.4, 15.7, 15.8, 17.4): one card for each
// code that arrived, with its direction and sigma, the accuracy, the age and which smoke it is of,
// and never the observer's position; Add and Ignore; a code of a smoke this phone does not have is
// opened as a new smoke only after one confirmation; a damaged paste shows its Message beside the
// field; a simulated code says so; no code carries proof of who made it.

import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import { NO_PROOF_TEXT } from '../math/texts';
import { createFakeEnvironment, START_UTC_MS } from '../test-support/fake-environment';
import { postsIncident } from '../test-support/geometry-fixtures';
import { canonicalOf, INCIDENT_ID } from '../test-support/incident-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { positionText } from '../math/fix/format';
import { InboxSheet } from './InboxSheet';

const DEG = Math.PI / 180;
const OTHER_INCIDENT = 'M7PQ3MWXA2';

function show(options: Parameters<typeof renderScreen>[1] = {}) {
  const calls: string[] = [];
  const s = renderScreen(<InboxSheet onClose={() => void calls.push('close')} />, {
    storedItems: storedWith([postsIncident(['west', 'east'])]),
    ...options,
  });
  const paste = async (text: string) => {
    fireEvent.change(s.getByLabelText('Paste the link or the code'), { target: { value: text } });
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Read the code' })));
  };
  const cards = () => s.queryAllByTestId('inbox-card');
  return { ...s, calls, paste, cards };
}

const received = (n: number, incidentId = INCIDENT_ID) =>
  canonicalOf(
    n,
    incidentId,
    {
      azimuthRad: 45.5 * DEG,
      azimuthSigmaRad: 2 * DEG,
      positionAccuracyM: 8,
      timeUtcMs: START_UTC_MS - 12 * 60_000 - 30_000,
    },
    'received',
  );

const messageText = (reason: 'code_damaged' | 'code_not_a_sighting') => {
  const m = messageFor({ ok: false, reason });
  return `${m.whatHappened} ${m.whatToDo}`;
};

describe('a card (Req 9.4, 15.8)', () => {
  it('shows the direction with its sigma, the accuracy, the age and the smoke, and no observer position', async () => {
    const s = show();
    const r = received(5);
    await s.paste(r.code);
    const card = s.cards()[0];
    const text = card?.textContent ?? '';
    expect(text).toContain('Toward 45.5° ± 2.0° (true north)');
    expect(text).toContain('Observer position known to 8 m');
    expect(text).toContain('Taken 12 min ago');
    expect(text).toContain('For the smoke you have open');
    expect(text).not.toMatch(/° [NS]|° [EW],/);
    const observer = positionText(r.sighting.bearing.observer, 1);
    expect(observer.ok && text.includes(observer.value.text)).toBe(false);
    expect(text).not.toContain(r.code);
  });

  it('Add puts it in the smoke and takes the card away; Ignore drops it', async () => {
    const s = show();
    await s.paste(received(5).code);
    await s.paste(received(6).code);
    expect(s.cards()).toHaveLength(2);
    const [first, second] = s.cards();
    if (first === undefined || second === undefined) throw new Error('no cards');
    fireEvent.click(within(first).getByRole('button', { name: 'Add' }));
    fireEvent.click(within(second).getByRole('button', { name: 'Ignore' }));
    expect(s.cards()).toHaveLength(0);
    expect(s.store.getSnapshot().open?.incident.entries).toHaveLength(3);
  });

  it('says when the same sighting is already on this phone', async () => {
    const s = show();
    const held = s.store.getSnapshot().open?.incident.entries[0];
    if (held === undefined) throw new Error('no entry');
    await s.paste(held.code);
    expect(s.cards()[0]?.textContent).toContain('Already on this phone');
  });
});

describe('a smoke this phone does not have (Req 4.2)', () => {
  it('says so with how many of its sightings wait, and opens it only after one confirmation', async () => {
    const s = show();
    await s.paste(received(5, OTHER_INCIDENT).code);
    await s.paste(received(6, OTHER_INCIDENT).code);
    const card = s.cards()[0];
    if (card === undefined) throw new Error('no card');
    expect(card.textContent).toContain(
      'For a smoke this phone does not have (2 sightings waiting)',
    );
    expect(within(card).queryByRole('button', { name: 'Add' })).toBeNull();
    fireEvent.click(
      within(card).getByRole('button', { name: 'Open it as a new smoke on this phone' }),
    );
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    const confirm = within(card).getByRole('group');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Not now' }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    fireEvent.click(
      within(card).getByRole('button', { name: 'Open it as a new smoke on this phone' }),
    );
    fireEvent.click(
      within(within(card).getByRole('group')).getByRole('button', {
        name: 'Open it as a new smoke',
      }),
    );
    expect(s.store.getSnapshot().state.incidents).toHaveLength(2);
    expect(s.store.getSnapshot().state.openIncidentId).toBe(OTHER_INCIDENT);
    // The other card of that smoke is now for the smoke you have open.
    expect(s.cards()[0]?.textContent).toContain('For the smoke you have open');
  });

  it('a code of another smoke held here is added to that smoke', async () => {
    const s = show();
    await s.paste(received(5, OTHER_INCIDENT).code);
    const card = s.cards()[0];
    if (card === undefined) throw new Error('no card');
    fireEvent.click(
      within(card).getByRole('button', { name: 'Open it as a new smoke on this phone' }),
    );
    fireEvent.click(
      within(within(card).getByRole('group')).getByRole('button', {
        name: 'Open it as a new smoke',
      }),
    );
    await s.settle(() => s.store.dispatch({ kind: 'openIncident', incidentId: INCIDENT_ID }));
    await s.paste(received(6, OTHER_INCIDENT).code);
    const next = s.cards()[0];
    expect(next?.textContent).toContain('For another smoke on this phone');
    if (next === undefined) throw new Error('no card');
    fireEvent.click(within(next).getByRole('button', { name: 'Add' }));
    const other = s.store
      .getSnapshot()
      .state.incidents.find((i) => i.incidentId === OTHER_INCIDENT);
    expect(other?.entries).toHaveLength(2);
  });
});

describe('the paste field (Req 10.4)', () => {
  it('reads a link inside a message', async () => {
    const s = show();
    await s.paste(`Smoke here! https://app.example.test/#${received(5).code} sent from my phone`);
    expect(s.cards()).toHaveLength(1);
  });

  it('shows a damaged paste\u2019s Message beside the field, and holds nothing', async () => {
    const s = show();
    const code = received(5).code;
    await s.paste(`${code.slice(0, 7)}${code[7] === '2' ? '3' : '2'}${code.slice(8)}`);
    const field = s.getByTestId('paste-box');
    expect(within(field).getByRole('alert').textContent).toBe(messageText('code_damaged'));
    expect(s.cards()).toHaveLength(0);
  });

  it('shows prose with no code as code_not_a_sighting', async () => {
    const s = show();
    await s.paste('there is smoke over the hill');
    expect(within(s.getByTestId('paste-box')).getByRole('alert').textContent).toBe(
      messageText('code_not_a_sighting'),
    );
  });
});

describe('what the sheet states (Req 15.7, 17.4, 10.3)', () => {
  it('says that a code has no proof of who made it, where codes are added', () => {
    const s = show();
    expect(s.getByTestId('inbox-sheet').textContent).toContain(NO_PROOF_TEXT);
  });

  it('says that a code of a simulated smoke comes from a simulation', async () => {
    const s = show();
    await s.paste(received(5, 'ZB4N8RTY5C').code);
    expect(s.cards()[0]?.textContent).toContain(
      'This code comes from a simulation, not from a real place.',
    );
  });

  it('shows a code from a link that could not be read', () => {
    const code = received(5).code;
    const damaged = `${code.slice(0, 20)}${code[20] === '2' ? '3' : '2'}${code.slice(21)}`;
    const s = show({ href: `https://app.example.test/#${damaged}` });
    expect(s.getByTestId('receive-failure').textContent).toBe(messageText('code_damaged'));
  });

  it('says that this page\u2019s address still holds the code when it could not be cleared', () => {
    const fake = createFakeEnvironment({
      href: `https://app.example.test/#${received(5).code}`,
      storedItems: storedWith([postsIncident(['west', 'east'])]),
    });
    fake.page.history.failing = true;
    fake.page.location.hashFailing = true;
    const s = renderScreen(<InboxSheet onClose={() => undefined} />, {}, fake);
    expect(s.getByTestId('address-holds-code').textContent).toBe(
      'The address of this page still holds the code, so do not share or bookmark this page.',
    );
  });

  it('says nothing about the address when the code is gone from it', () => {
    const s = show({ href: `https://app.example.test/#${received(5).code}` });
    expect(s.queryByTestId('address-holds-code')).toBeNull();
    expect(s.cards()).toHaveLength(1);
  });

  it('Close', () => {
    const s = show();
    fireEvent.click(s.getByRole('button', { name: 'Close' }));
    expect(s.calls).toEqual(['close']);
  });
});
