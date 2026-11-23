// The Share sheet (design §9, D23.6; Req 9.3, 10.1, 10.6 to 10.8, 10.11, 10.12, 15.2, 15.6, 17.4),
// REWRITTEN 2026-11-21 (task 23.7): the sheet is a title, the bearing in a line, one compact
// statement that is always visible, two primary choices and "Other ways (no connection)"; the QR
// is a view of its own. Requirement changes: the first-Share/later-Shares difference, the three
// blocks with a paragraph each and the printed address are replaced; each channel is still recorded
// only by its own control, a hidden sighting is still marked, a page address too long still gives
// "link too long" and the text only, and the Simulation variant has no link, no QR, no system share.

import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { groupCode } from '../math/code/alphabet';
import { messageFor } from '../math/messages';
import type { Incident } from '../math/incident/incident-state';
import { CODE_HOLDS_TEXT, LEAVES_STATEMENT_TEXT } from '../math/texts';
import type { FakeEnvironmentOptions } from '../test-support/fake-environment';
import { START_UTC_MS } from '../test-support/fake-environment';
import { pointingAt, postsIncident, postPosition, TARGET } from '../test-support/geometry-fixtures';
import { canonicalOf } from '../test-support/incident-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { ShareSheet } from './ShareSheet';
import { useVigia } from './store';

const ADDRESS = 'https://app.example.test/';

function open(incident: Incident, options: FakeEnvironmentOptions = {}, index = 0) {
  const entry = incident.entries[index];
  if (entry === undefined) throw new Error('no entry');
  const calls: string[] = [];
  const s = renderScreen(
    <ShareSheet
      sightingId={entry.sighting.sightingId}
      onClose={() => void calls.push('close')}
      onPrivacy={() => void calls.push('privacy')}
    />,
    { href: ADDRESS, ...options, storedItems: storedWith([incident]) },
  );
  const channels = () =>
    s.store
      .getSnapshot()
      .open?.incident.entries.find((e) => e.sighting.sightingId === entry.sighting.sightingId)
      ?.shared.map((r) => r.channel);
  const section = (id: string) => s.getByTestId(id);
  return { ...s, entry, calls, channels, section };
}

const messageText = (
  reason: 'clipboard_unavailable' | 'link_too_long' | 'simulation_not_shareable',
) => {
  const m = messageFor({ ok: false, reason });
  return `${m.whatHappened} ${m.whatToDo}`;
};

const QR = 'Show QR code (someone beside you)';
const SEND = 'Send link (someone far away)';
const OTHER = 'Other ways (no connection)';

/** The text of the sheet in document order. */
const sheet = (s: ReturnType<typeof open>) => s.getByTestId('share-sheet').textContent ?? '';

describe('the sheet’s order and its statement (Req 10.11, 15.2)', () => {
  it('is the title, the bearing, the statement, the two choices, Other ways, the page, Close', () => {
    const s = open(postsIncident(['west', 'east']));
    const all = sheet(s);
    const order = [
      'Share this sighting',
      'Toward',
      LEAVES_STATEMENT_TEXT,
      QR,
      SEND,
      OTHER,
      'What leaves this phone',
      'Close',
    ].map((t) => all.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('states, compactly and in full, what leaves, and is visible before every choice, in every Share', async () => {
    const s = open(postsIncident(['west', 'east']));
    const statement = s.getByTestId('leaves-statement');
    expect(statement.closest('details')).toBeNull();
    for (const part of [
      'about 1 m',
      'how well the phone knew',
      'when',
      'direction',
      'uncertainty',
      'which smoke',
      'cannot be taken back',
    ]) {
      expect(statement.textContent).toContain(part);
    }
    // After a Share it is still there, not folded: a later Share is made with it in view.
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: SEND })));
    expect(s.getByTestId('leaves-statement').closest('details')).toBeNull();
  });

  it('keeps the long text under a closed disclosure, "What the code holds"', () => {
    const s = open(postsIncident(['west', 'east']));
    const details = s.getByTestId('code-holds-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('What the code holds');
    expect(details.querySelector('[data-testid="code-holds"]')?.textContent).toBe(CODE_HOLDS_TEXT);
  });

  it('has two primary choices of at least 64 px, and prints neither the address nor the code before them', () => {
    const s = open(postsIncident(['west', 'east']));
    for (const name of [QR, SEND]) {
      const b = s.getByRole('button', { name });
      expect(Number.parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(64);
    }
    const outside = [...s.getByTestId('share-sheet').children]
      .filter((c) => c.getAttribute('data-testid') !== 'share-text')
      .map((c) => c.textContent)
      .join(' ');
    expect(outside).not.toContain(ADDRESS);
    expect(outside).not.toContain(s.entry.code);
    expect(outside).not.toContain(groupCode(s.entry.code));
  });

  it('has no paragraph of purpose before the choices: each says who it is for on its label', () => {
    const s = open(postsIncident(['west', 'east']));
    expect(sheet(s)).not.toMatch(/someone far away who has a connection/);
    expect(s.getByRole('button', { name: QR })).toBeTruthy();
  });
});

describe('sending the link (Req 10.1)', () => {
  it('uses the share sheet where it exists, and records system_share', async () => {
    const s = open(postsIncident(['west', 'east']));
    expect(s.channels()).toEqual([]);
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: SEND })));
    expect(s.fake.navigator.shared).toEqual([`${ADDRESS}#${s.entry.code}`]);
    expect(s.channels()).toEqual(['system_share']);
    expect(s.fake.navigator.written).toEqual([]);
  });

  it('otherwise copies the link, says that it did, and records link', async () => {
    const s = open(postsIncident(['west', 'east']), { navigator: { share: 'absent' } });
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: SEND })));
    expect(s.fake.navigator.written).toEqual([`${ADDRESS}#${s.entry.code}`]);
    expect(s.channels()).toEqual(['link']);
    expect(s.getByRole('status').textContent).toBe('Link copied.');
  });

  it('a share sheet the user closes is no failure and records nothing', async () => {
    const s = open(postsIncident(['west', 'east']), { navigator: { share: 'reject' } });
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: SEND })));
    expect(s.channels()).toEqual([]);
    expect(s.queryAllByRole('alert')).toEqual([]);
  });

  it('shows a failed copy beside the choice, and records nothing', async () => {
    const s = open(postsIncident(['west', 'east']), {
      navigator: { share: 'absent', clipboard: 'reject' },
    });
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: SEND })));
    expect(s.getByRole('alert').textContent).toBe(messageText('clipboard_unavailable'));
    expect(s.channels()).toEqual([]);
  });
});

describe('the QR view (Req 10.6, 10.7)', () => {
  it('is a view of its own: the QR as an inline SVG, one line, the link as text, Back', async () => {
    const s = open(postsIncident(['west', 'east']));
    // No QR before it is asked for (an icon, skeleton-ui Req 22.8, is not a picture: role img only).
    expect(s.container.querySelector('svg[role="img"]')).toBeNull();
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: QR })));
    const view = s.getByTestId('qr-view');
    expect(view.querySelector('svg')).not.toBeNull();
    expect(s.container.querySelector('img')).toBeNull();
    expect(view.textContent).toContain(`${ADDRESS}#${s.entry.code}`);
    expect(view.textContent).toMatch(/connection/);
    expect(s.queryByTestId('share-sheet')).toBeNull();
    expect(s.channels()).toEqual(['qr']);
    fireEvent.click(within(view).getByRole('button', { name: 'Back' }));
    expect(s.getByTestId('share-sheet')).toBeTruthy();
    expect(s.queryByTestId('qr-view')).toBeNull();
  });
});

describe('Other ways (no connection) (Req 10.1, 10.8)', () => {
  it('holds the text code in a closed disclosure with Copy text, recording text', async () => {
    const s = open(postsIncident(['west', 'east']));
    const other = s.getByTestId('share-text') as HTMLDetailsElement;
    expect(other.tagName).toBe('DETAILS');
    expect(other.open).toBe(false);
    expect(other.querySelector('summary')?.textContent).toBe(OTHER);
    expect(other.textContent).toContain(groupCode(s.entry.code));
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy text' })));
    expect(s.channels()).toEqual(['text']);
    expect(s.fake.navigator.written).toEqual([groupCode(s.entry.code)]);
    expect(s.fake.gate.calls).toEqual([]);
  });

  it('with a page address of 110 characters: "link too long", no choices, and Other ways open', () => {
    const href = `${ADDRESS}${'p'.repeat(110 - ADDRESS.length)}`;
    expect(href).toHaveLength(110);
    const s = open(postsIncident(['west', 'east']), { href });
    expect(s.queryByRole('button', { name: SEND })).toBeNull();
    expect(s.queryByRole('button', { name: QR })).toBeNull();
    expect(s.getAllByRole('alert').map((a) => a.textContent)).toContain(
      messageText('link_too_long'),
    );
    const other = s.getByTestId('share-text') as HTMLDetailsElement;
    expect(other.open).toBe(true);
    expect(other.textContent).toContain(groupCode(s.entry.code));
  });
});

describe('a hidden sighting (Req 15.6)', () => {
  it('is marked as hidden by you before the statement and the choices', () => {
    const s = open(postsIncident(['west', 'east'], (_p, i) => ({ hidden: i === 0 })));
    expect(s.getByTestId('hidden-mark').textContent).toContain('You hid this one');
    const all = sheet(s);
    expect(all.indexOf('You hid this one')).toBeLessThan(all.indexOf(LEAVES_STATEMENT_TEXT));
    expect(all.indexOf('You hid this one')).toBeLessThan(all.indexOf(SEND));
  });
});

/** The Share sheet of the open smoke's first sighting, once there is one. */
function FirstSighting() {
  const { open: view } = useVigia();
  const id = view?.incident.entries[0]?.sighting.sightingId;
  return id === undefined ? null : (
    <ShareSheet sightingId={id} onClose={() => undefined} onPrivacy={() => undefined} />
  );
}

describe('a simulated smoke', () => {
  it('in Simulation mode: the text and one button for each other phone, no link, no QR, no system share', async () => {
    const got: string[] = [];
    const peers = ['east', 'side'].map((id) => ({
      id,
      label: `the phone at the ${id} post`,
      send: (code: string) => {
        got.push(`${id}:${code}`);
        return Promise.resolve({ ok: true as const, value: undefined });
      },
    }));
    const s = renderScreen(<FirstSighting />, { mode: 'simulation', peers, href: ADDRESS });
    const bearing = pointingAt('bearing-1', postPosition('west'), TARGET, 0, {
      timeUtcMs: START_UTC_MS - 1000,
    });
    await s.settle(() => void s.store.capture(bearing, 'new'));
    const entry = s.store.getSnapshot().open?.incident.entries[0];
    if (entry === undefined) throw new Error('no entry');
    expect(s.queryByRole('button', { name: SEND })).toBeNull();
    expect(s.queryByRole('button', { name: QR })).toBeNull();
    expect(s.queryByRole('button', { name: 'Copy text' })).toBeNull();
    expect(s.getByTestId('share-text').textContent).toContain(groupCode(entry.code));
    await s.settle(() =>
      fireEvent.click(s.getByRole('button', { name: 'Send to the phone at the side post' })),
    );
    expect(got).toEqual([`side:${entry.code}`]);
    expect(s.store.getSnapshot().open?.incident.entries[0]?.shared.map((r) => r.channel)).toEqual([
      'memory',
    ]);
    expect(s.getByRole('button', { name: 'Send to the phone at the east post' })).toBeTruthy();
  });

  it('on a phone: simulation_not_shareable, and the text only', async () => {
    const s = renderScreen(<FirstSighting />, { href: ADDRESS });
    const code = canonicalOf(1, 'ZB4N8RTY5C', {}, 'received').code;
    await s.settle(() => {
      s.store.paste(code);
      s.store.addFromInbox(code, true);
    });
    expect(s.getAllByRole('alert').map((a) => a.textContent)).toContain(
      messageText('simulation_not_shareable'),
    );
    expect(s.queryByRole('button', { name: SEND })).toBeNull();
    expect(s.queryByRole('button', { name: QR })).toBeNull();
    expect(s.getByTestId('share-text').textContent).toContain(groupCode(code));
  });
});

describe('the sheet\u2019s own controls', () => {
  it('Close and What leaves this phone', () => {
    const s = open(postsIncident(['west', 'east']));
    fireEvent.click(s.getByRole('button', { name: 'What leaves this phone' }));
    fireEvent.click(s.getByRole('button', { name: 'Close' }));
    expect(s.calls).toEqual(['privacy', 'close']);
  });
});
