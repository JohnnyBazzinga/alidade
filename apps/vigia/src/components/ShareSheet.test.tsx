// The Share sheet (design §9; Req 9.3, 10.1, 10.5 to 10.8, 15.2, 15.6, 17.4): what a code holds
// before the first Share, the three presentations of one code, each recording its channel only on
// its own button, a hidden sighting marked, a page address too long for a link, and the
// Simulation variant with no link, no QR, no system share and one button for each other phone.

import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { groupCode } from '../math/code/alphabet';
import { messageFor } from '../math/messages';
import type { Incident } from '../math/incident/incident-state';
import {
  CODE_HOLDS_TEXT,
  LINK_PURPOSE_TEXT,
  QR_PURPOSE_TEXT,
  TEXT_PURPOSE_TEXT,
} from '../math/texts';
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

describe('what a code holds (Req 15.2)', () => {
  it('is stated in full before the first Share of the session, above every presentation', () => {
    const s = open(postsIncident(['west', 'east']));
    const statement = s.getByTestId('code-holds');
    expect(statement.textContent).toBe(CODE_HOLDS_TEXT);
    expect(statement.closest('details')).toBeNull();
    const all = s.getByTestId('share-sheet').textContent ?? '';
    expect(all.indexOf(CODE_HOLDS_TEXT)).toBeLessThan(all.indexOf(LINK_PURPOSE_TEXT));
  });

  it('is in the details of every later Share', async () => {
    const s = open(postsIncident(['west', 'east']));
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy text' })));
    const statement = s.getByTestId('code-holds');
    expect(statement.textContent).toBe(CODE_HOLDS_TEXT);
    expect(statement.closest('details')).not.toBeNull();
  });
});

describe('the three presentations of one code (Req 10.1, 10.6 to 10.8)', () => {
  it('says what each one is for, and all three carry the same code', async () => {
    const s = open(postsIncident(['west', 'east']));
    expect(s.section('share-link').textContent).toContain(LINK_PURPOSE_TEXT);
    expect(s.section('share-qr').textContent).toContain(QR_PURPOSE_TEXT);
    expect(s.section('share-text').textContent).toContain(TEXT_PURPOSE_TEXT);
    const link = `${ADDRESS}#${s.entry.code}`;
    expect(s.section('share-link').textContent).toContain(link);
    expect(s.section('share-text').textContent).toContain(groupCode(s.entry.code));
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Show QR code' })));
    expect(s.section('share-qr').textContent).toContain(link);
  });

  it('records each channel only on its own button', async () => {
    const s = open(postsIncident(['west', 'east']));
    expect(s.channels()).toEqual([]);
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy link' })));
    expect(s.channels()).toEqual(['link']);
    expect(s.fake.navigator.written).toEqual([`${ADDRESS}#${s.entry.code}`]);
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Show QR code' })));
    expect(s.channels()).toEqual(['link', 'qr']);
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy text' })));
    expect(s.channels()).toEqual(['link', 'qr', 'text']);
    expect(s.fake.navigator.written[1]).toBe(groupCode(s.entry.code));
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Share…' })));
    expect(s.channels()).toEqual(['link', 'qr', 'text', 'system_share']);
    expect(s.fake.navigator.shared).toEqual([`${ADDRESS}#${s.entry.code}`]);
    expect(s.fake.gate.calls).toEqual([]);
  });

  it('draws the QR only when asked, as an inline SVG and no image', async () => {
    const s = open(postsIncident(['west', 'east']));
    expect(s.section('share-qr').querySelector('svg')).toBeNull();
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Show QR code' })));
    expect(s.section('share-qr').querySelector('svg')).not.toBeNull();
    expect(s.container.querySelector('img')).toBeNull();
  });

  it('has no Share… without a share sheet, and a cancelled share sheet records nothing', async () => {
    const without = open(postsIncident(['west', 'east']), { navigator: { share: 'absent' } });
    expect(without.queryByRole('button', { name: 'Share…' })).toBeNull();
    without.unmount();
    const cancelled = open(postsIncident(['west', 'east']), { navigator: { share: 'reject' } });
    await cancelled.settle(() =>
      fireEvent.click(cancelled.getByRole('button', { name: 'Share…' })),
    );
    expect(cancelled.channels()).toEqual([]);
    expect(cancelled.queryAllByRole('alert')).toEqual([]);
  });

  it('shows a failed copy beside its button, records nothing and leaves the text to select', async () => {
    const s = open(postsIncident(['west', 'east']), { navigator: { clipboard: 'reject' } });
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Copy link' })));
    expect(within(s.section('share-link')).getByRole('alert').textContent).toBe(
      messageText('clipboard_unavailable'),
    );
    expect(within(s.section('share-text')).queryByRole('alert')).toBeNull();
    expect(s.channels()).toEqual([]);
  });

  it('with a page address of 110 characters: "link too long" and the text only', () => {
    const href = `${ADDRESS}${'p'.repeat(110 - ADDRESS.length)}`;
    expect(href).toHaveLength(110);
    const s = open(postsIncident(['west', 'east']), { href });
    expect(s.queryByTestId('share-link')).toBeNull();
    expect(s.queryByTestId('share-qr')).toBeNull();
    expect(s.getAllByRole('alert').map((a) => a.textContent)).toContain(
      messageText('link_too_long'),
    );
    expect(s.section('share-text').textContent).toContain(groupCode(s.entry.code));
  });
});

describe('a hidden sighting (Req 15.6)', () => {
  it('is marked as hidden by you before anything is shared', () => {
    const s = open(postsIncident(['west', 'east'], (_p, i) => ({ hidden: i === 0 })));
    expect(s.getByTestId('hidden-mark').textContent).toContain('You hid this one');
    const all = s.getByTestId('share-sheet').textContent ?? '';
    expect(all.indexOf('You hid this one')).toBeLessThan(all.indexOf(LINK_PURPOSE_TEXT));
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
    expect(s.queryByTestId('share-link')).toBeNull();
    expect(s.queryByTestId('share-qr')).toBeNull();
    expect(s.queryByRole('button', { name: 'Share…' })).toBeNull();
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
    expect(s.queryByTestId('share-link')).toBeNull();
    expect(s.queryByTestId('share-qr')).toBeNull();
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
