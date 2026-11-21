// The Inbox sheet (design §9, D7; Req 4.2, 9.4, 10.3, 10.4, 15.7, 15.8, 17.4): one card for each
// code that arrived, with its direction and sigma, the accuracy, the age and which smoke it is of,
// and never the observer's position; Add and Ignore; a code of a smoke this phone does not have is
// opened as a new smoke only after one confirmation; a damaged paste shows its Message beside the
// field; a simulated code says so; no code carries proof of who made it.

import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import { INBOX_WARNING_LINE_TEXT, JOIN_CONFIRM_TEXT, NO_PROOF_TEXT } from '../math/texts';
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
  const s = renderScreen(
    <InboxSheet
      onClose={() => void calls.push('close')}
      onTaken={(line) => void calls.push(`taken:${line}`)}
    />,
    {
      storedItems: storedWith([postsIncident(['west', 'east'])]),
      ...options,
    },
  );
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
    expect(
      within(card).queryByRole('button', { name: 'Open it as a new smoke on this phone' }),
    ).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'It is a different smoke' }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    fireEvent.click(within(s.getByTestId('confirm-view')).getByRole('button', { name: 'Not now' }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    fireEvent.click(
      within(s.cards()[0] as HTMLElement).getByRole('button', { name: 'It is a different smoke' }),
    );
    fireEvent.click(
      within(s.getByTestId('confirm-view')).getByRole('button', { name: 'Open it as a new smoke' }),
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
    fireEvent.click(within(card).getByRole('button', { name: 'It is a different smoke' }));
    fireEvent.click(
      within(s.getByTestId('confirm-view')).getByRole('button', { name: 'Open it as a new smoke' }),
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

// Task 23.8 (2026-11-21): the two answers stay equal; choosing one replaces the card by a
// confirmation view of its own (Req 4.8 as amended); a success closes the sheet with a line (4.12).
describe('a smoke this phone does not have, with another open (Req 4.8, 4.9, 4.12)', () => {
  const SAME = 'It is the same smoke as the one I have open';
  const DIFFERENT = 'It is a different smoke';

  async function withCard(code: string) {
    const s = show();
    await s.paste(code);
    const card = s.cards()[0];
    if (card === undefined) throw new Error('no card');
    return { ...s, card };
  }
  const confirmView = (s: { getByTestId: (id: string) => HTMLElement }) =>
    s.getByTestId('confirm-view');

  it('offers the two answers and Ignore, and not Add, with neither preselected', async () => {
    const { card } = await withCard(received(5, OTHER_INCIDENT).code);
    const same = within(card).getByRole('button', { name: SAME });
    const different = within(card).getByRole('button', { name: DIFFERENT });
    within(card).getByRole('button', { name: 'Ignore' });
    expect(within(card).queryByRole('button', { name: 'Add' })).toBeNull();
    // Equal weight: one style, no mark of a preselected answer on either.
    expect(same.getAttribute('style')).toBe(different.getAttribute('style'));
    for (const button of [same, different]) {
      expect(button.getAttribute('data-preselected')).toBeNull();
      expect(button.getAttribute('aria-pressed')).toBeNull();
      expect(Number.parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(48);
    }
    expect(card.querySelector('[data-preselected="true"]')).toBeNull();
  });

  it('replaces the card by a confirmation of at most two short sentences, with Join and Not now and nothing else', async () => {
    const s = await withCard(received(5, OTHER_INCIDENT).code);
    fireEvent.click(within(s.card).getByRole('button', { name: SAME }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(s.store.getSnapshot().state.incidents[0]?.formerIds).toEqual([]);
    expect(s.cards()).toHaveLength(0);
    const view = confirmView(s);
    expect(view.textContent).toContain(JOIN_CONFIRM_TEXT);
    expect(view.textContent).toContain('Join');
    expect(s.queryByTestId('paste-box')).toBeNull();
    const buttons = [...view.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Join the two smokes', 'Not now']);
    for (const b of buttons)
      expect(Number.parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(48);
    fireEvent.click(within(view).getByRole('button', { name: 'Not now' }));
    expect(s.store.getSnapshot().state.incidents[0]?.formerIds).toEqual([]);
    expect(s.cards()).toHaveLength(1);
    expect(s.calls).toEqual([]);
  });

  it('keeps the sentence about hiding or deleting one by one under "Why check this?"', async () => {
    const s = await withCard(received(5, OTHER_INCIDENT).code);
    const why = s.getByTestId('why-check') as HTMLDetailsElement;
    expect(why.textContent).toContain('hidden or deleted one by one');
  });

  it('Join the two smokes makes one smoke with the smaller id, and closes the sheet with "Joined: 3 sightings"', async () => {
    const s = await withCard(received(5, OTHER_INCIDENT).code);
    fireEvent.click(within(s.card).getByRole('button', { name: SAME }));
    fireEvent.click(within(confirmView(s)).getByRole('button', { name: 'Join the two smokes' }));
    const state = s.store.getSnapshot().state;
    expect(state.incidents).toHaveLength(1);
    // `K7PQ3MWXA2` is smaller than `M7PQ3MWXA2`: the open smoke's id stays.
    expect(state.incidents[0]?.incidentId).toBe(INCIDENT_ID);
    expect(state.incidents[0]?.formerIds).toEqual([OTHER_INCIDENT]);
    expect(state.incidents[0]?.entries).toHaveLength(3);
    expect(s.cards()).toHaveLength(0);
    expect(s.calls).toEqual(['taken:Joined: 3 sightings']);
  });

  it('the cards of the joined smoke that still wait are then for the smoke you have open, added with no question', async () => {
    const s = await withCard(received(5, OTHER_INCIDENT).code);
    await s.paste(received(6, OTHER_INCIDENT).code);
    expect(s.cards()).toHaveLength(2);
    const [first] = s.cards();
    if (first === undefined) throw new Error('no card');
    fireEvent.click(within(first).getByRole('button', { name: SAME }));
    fireEvent.click(within(confirmView(s)).getByRole('button', { name: 'Join the two smokes' }));
    const [second] = s.cards();
    expect(second?.textContent).toContain('For the smoke you have open');
    expect(within(second as HTMLElement).queryByRole('button', { name: SAME })).toBeNull();
    fireEvent.click(within(second as HTMLElement).getByRole('button', { name: 'Add' }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(s.store.getSnapshot().state.incidents[0]?.entries).toHaveLength(4);
    expect(s.calls.at(-1)).toBe('taken:Added: 1 sighting');
  });

  it('the answer "a different smoke" asks once in a view of its own, opens it, and says "New smoke opened"', async () => {
    const s = await withCard(received(5, OTHER_INCIDENT).code);
    fireEvent.click(within(s.card).getByRole('button', { name: DIFFERENT }));
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    const view = confirmView(s);
    expect(s.cards()).toHaveLength(0);
    fireEvent.click(within(view).getByRole('button', { name: 'Open it as a new smoke' }));
    expect(s.store.getSnapshot().state.incidents.map((i) => i.incidentId)).toEqual([
      INCIDENT_ID,
      OTHER_INCIDENT,
    ]);
    expect(s.store.getSnapshot().state.incidents[0]?.formerIds).toEqual([]);
    expect(s.calls).toEqual(['taken:New smoke opened: 1 sighting']);
  });

  it('Ignore drops the card and changes nothing', async () => {
    const s = await withCard(received(5, OTHER_INCIDENT).code);
    fireEvent.click(within(s.card).getByRole('button', { name: 'Ignore' }));
    expect(s.cards()).toHaveLength(0);
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(s.calls).toEqual([]);
  });

  it('shows the refusal through its Message in the confirmation, with Not now, and joins nothing', async () => {
    const s = await withCard(received(5, 'ZB4N8RTY5C').code);
    fireEvent.click(within(s.card).getByRole('button', { name: SAME }));
    fireEvent.click(within(confirmView(s)).getByRole('button', { name: 'Join the two smokes' }));
    const m = messageFor({ ok: false, reason: 'incident_not_joinable' });
    expect(
      within(confirmView(s))
        .getAllByRole('alert')
        .map((a) => a.textContent),
    ).toContain(`${m.whatHappened} ${m.whatToDo}`);
    expect(within(confirmView(s)).getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(s.store.getSnapshot().state.incidents).toHaveLength(1);
    expect(s.calls).toEqual([]);
  });
});

describe('a compact card, one warning line, and the paste form (Req 9.4, 15.7, 4.12)', () => {
  it('shows the direction first, in one line, and the other facts under it', async () => {
    const s = show();
    await s.paste(received(5).code);
    const card = s.cards()[0] as HTMLElement;
    const lines = [...card.querySelectorAll(':scope > p')].map((p) => p.textContent ?? '');
    expect(lines[0]).toBe('Toward 45.5° ± 2.0° (true north)');
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('shows one visible warning line, and the whole text under "Why check this?"', async () => {
    const s = show();
    await s.paste(received(5).code);
    const card = s.cards()[0] as HTMLElement;
    const why = card.querySelector('[data-testid="why-check"]') as HTMLDetailsElement;
    expect(why.open).toBe(false);
    expect(why.querySelector('summary')?.textContent).toBe('Why check this?');
    expect(why.textContent).toContain(NO_PROOF_TEXT);
    const clone = card.cloneNode(true) as HTMLElement;
    clone.querySelector('details')?.remove();
    expect(clone.textContent).toContain(INBOX_WARNING_LINE_TEXT);
    expect(clone.textContent).not.toContain(NO_PROOF_TEXT);
  });

  it('puts the paste form first when no card waits, and behind "Paste a code" when one does', async () => {
    const s = show();
    const box = s.getByTestId('paste-box');
    expect(box.closest('details')).toBeNull();
    await s.paste(received(5).code);
    const waiting = s.getByTestId('paste-box').closest('details') as HTMLDetailsElement;
    expect(waiting.open).toBe(false);
    expect(waiting.querySelector('summary')?.textContent).toBe('Paste a code');
    const sheet = s.getByTestId('inbox-sheet');
    expect(
      s.cards()[0]?.compareDocumentPosition(waiting) ?? 0 & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(sheet.contains(waiting)).toBe(true);
  });

  it('puts the card of a paste that was read at the top of the sheet', async () => {
    const s = show();
    await s.paste(received(5).code);
    const sheet = s.getByTestId('inbox-sheet');
    const list = sheet.querySelector('ol') as HTMLElement;
    const heading = sheet.querySelector('h1') as HTMLElement;
    const between = [...sheet.children].filter(
      (c) =>
        (heading.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
        (c.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
    expect(between.map((c) => c.textContent?.length ?? 0).every((n) => n < 200)).toBe(true);
  });

  it('closes the sheet with "Added: 1 sighting" after Add', async () => {
    const s = show();
    await s.paste(received(5).code);
    fireEvent.click(within(s.cards()[0] as HTMLElement).getByRole('button', { name: 'Add' }));
    expect(s.calls).toEqual(['taken:Added: 1 sighting']);
  });
});

describe('a smoke this phone does not have, with none open: as before (Req 4.2)', () => {
  it('offers the one button and its confirmation view, and no answer about the same smoke', async () => {
    const s = show();
    s.store.dispatch({ kind: 'deleteIncident', incidentId: INCIDENT_ID });
    expect(s.store.getSnapshot().state.openIncidentId).toBeNull();
    await s.paste(received(5, OTHER_INCIDENT).code);
    const card = s.cards()[0];
    if (card === undefined) throw new Error('no card');
    expect(
      within(card).queryByRole('button', { name: 'It is the same smoke as the one I have open' }),
    ).toBeNull();
    expect(within(card).queryByRole('button', { name: 'It is a different smoke' })).toBeNull();
    fireEvent.click(
      within(card).getByRole('button', { name: 'Open it as a new smoke on this phone' }),
    );
    fireEvent.click(
      within(s.getByTestId('confirm-view')).getByRole('button', { name: 'Open it as a new smoke' }),
    );
    expect(s.store.getSnapshot().state.openIncidentId).toBe(OTHER_INCIDENT);
    expect(s.calls).toEqual(['taken:New smoke opened: 1 sighting']);
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
  it('says that a code has no proof of who made it, in the sheet and under "Why check this?" on a card', async () => {
    const s = show();
    expect(s.getByTestId('inbox-sheet').textContent).toContain(INBOX_WARNING_LINE_TEXT);
    await s.paste(received(5).code);
    expect(s.getByTestId('why-check').textContent).toContain(NO_PROOF_TEXT);
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
