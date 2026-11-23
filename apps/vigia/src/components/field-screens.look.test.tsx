// The other screens in the Field look (Req 22.7, 22.10, 22.11; design D25.2, D25.5; task group 25):
// the same words, as cards with their icons. The other tests of each screen keep its wording.

import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { postsIncident } from '../test-support/geometry-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { DeleteAllDialog } from './DeleteAllDialog';
import { EmergencyScreen } from './EmergencyScreen';
import { PrivacyPage } from './PrivacyPage';
import { ShareSheet } from './ShareSheet';
import { SightingsScreen } from './SightingsScreen';

const icon = (el: Element | null | undefined) =>
  el?.querySelector('svg')?.getAttribute('data-icon') ?? null;

describe('the Sightings tab (Req 22.7)', () => {
  const show = () =>
    renderScreen(<SightingsScreen onShare={() => undefined} onInbox={() => undefined} />, {
      storedItems: storedWith([postsIncident(['west', 'east'])]),
    });

  it('a card for each sighting: a raised head with its icon and title, the bearing at 32 with no icon beside it', () => {
    const s = show();
    const row = s.getAllByTestId('sighting-row')[0] as HTMLElement;
    expect(row.style.background).toBe('var(--alidade-card)');
    const head = row.querySelector<HTMLElement>('[data-part="head"]') as HTMLElement;
    expect(head.style.background).toBe('var(--alidade-raised)');
    expect(icon(head)).toBe('crosshair');
    expect(head.querySelector('h3')?.textContent).toMatch(/^Sighting 1, /);
    const numeral = row.querySelector<HTMLElement>('[data-part="numeral"]') as HTMLElement;
    expect(numeral.style.fontSize).toBe('32px');
    expect(numeral.textContent).toMatch(/^\d+\.\d° ± \d+\.\d°$/);
    expect(numeral.querySelector('svg')).toBeNull();
    expect(row.querySelector('[data-part="bearing"]')?.textContent).toMatch(
      /^Toward .* \(true north\)$/,
    );
    // Compact: the rows of a card 8 apart (Codex, 2026-11-23).
    expect(
      (row.querySelector('[data-part="head"]')?.nextElementSibling as HTMLElement).style.gap,
    ).toBe('8px');
  });

  it('icon rows for the accuracy and the time; Used as a badge with its icon and word', () => {
    const s = show();
    const row = s.getAllByTestId('sighting-row')[0] as HTMLElement;
    expect([...row.querySelectorAll('[data-part="icon-row"]')].map(icon)).toEqual(['pin', 'clock']);
    const badge = row.querySelector<HTMLElement>('[data-part="badge"]') as HTMLElement;
    expect(badge.textContent).toBe('Used');
    expect(icon(badge)).toBe('success');
    expect(badge.style.background).toBe('var(--alidade-okTint)');
  });

  it('the actions with their icons, Delete in the danger fill, each at least 48; Delete asks in a danger card', () => {
    const s = show();
    const row = s.getAllByTestId('sighting-row')[0] as HTMLElement;
    const actions = [...row.querySelectorAll<HTMLElement>('[data-part="actions"] button')];
    expect(actions.map(icon)).toEqual(['hide', 'share', 'trash']);
    for (const b of actions)
      expect(Number.parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(48);
    expect(actions[2]?.style.background).toBe('var(--alidade-dangerTint)');
    expect(actions[2]?.style.color).toBe('var(--alidade-dangerInk)');
    fireEvent.click(actions[2] as HTMLElement);
    const confirm = row.querySelector<HTMLElement>('[role="group"]') as HTMLElement;
    expect(confirm.style.background).toBe('var(--alidade-dangerTint)');
  });

  it('"Add a sighting someone sent me" ends in a chevron-right', () => {
    const s = show();
    const add = s.getByRole('button', { name: 'Add a sighting someone sent me' });
    expect(add.lastElementChild?.getAttribute('data-icon')).toBe('chevron-right');
  });
});

describe('Share and the QR view (Req 22.10)', () => {
  const incident = postsIncident(['west', 'east']);
  const open = () =>
    renderScreen(
      <ShareSheet
        sightingId={incident.entries[0]?.sighting.sightingId ?? ''}
        onClose={() => undefined}
        onPrivacy={() => undefined}
      />,
      { href: 'https://app.example.test/', storedItems: storedWith([incident]) },
    );

  it('the statement is an info card with its icon, before the choices', () => {
    const s = open();
    const statement = s.getByTestId('leaves-statement');
    expect(icon(statement)).toBe('info');
    expect((statement.parentElement as HTMLElement).style.background).toBe(
      'var(--alidade-infoTint)',
    );
  });

  it('the two choices are large option cards of one style, with a QR and a link icon', () => {
    const s = open();
    const choices = [...s.getByTestId('share-choices').querySelectorAll<HTMLElement>('button')];
    expect(choices.map(icon)).toEqual(['qr', 'link']);
    expect(choices[0]?.getAttribute('style')).toBe(choices[1]?.getAttribute('style'));
    for (const c of choices)
      expect(Number.parseFloat(c.style.minHeight)).toBeGreaterThanOrEqual(64);
  });

  it('the QR view: the QR on a white card, black on white, and Back with its chevron', () => {
    const s = open();
    fireEvent.click(s.getAllByRole('button', { name: /Show QR code/ })[0] as HTMLElement);
    const card = s
      .getByTestId('qr-view')
      .querySelector<HTMLElement>('[data-part="qr-card"]') as HTMLElement;
    expect(card.style.background).toBe('var(--alidade-qrLight)');
    expect(
      s.getByRole('button', { name: 'Back' }).firstElementChild?.getAttribute('data-icon'),
    ).toBe('chevron-left');
  });
});

describe('Emergency, the delete dialog and the privacy page (Req 22.10)', () => {
  it('Emergency: the danger card first, with its shield; Copy with its icon', () => {
    const s = renderScreen(<EmergencyScreen />, {
      storedItems: storedWith([postsIncident(['west', 'east', 'side'])]),
    });
    const first = s.getByTestId('emergency-screen').firstElementChild as HTMLElement;
    expect(first.style.background).toBe('var(--alidade-dangerTint)');
    expect(icon(first)).toBe('shield');
    expect(first.querySelector('strong')?.textContent).toBe(
      'This app does not call or notify anyone.',
    );
    expect(icon(s.getByRole('button', { name: /^Copy the/ }))).toBe('copy');
    const text = s.getByTestId('emergency-screen').querySelector('pre') as HTMLElement;
    expect(text.style.userSelect).toBe('text');
    expect(text.style.background).toBe('var(--alidade-card)');
  });

  it('the confirmation of Delete everything is a danger card', () => {
    const s = renderScreen(
      <DeleteAllDialog
        backupExists={false}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const dialog = s.getByTestId('delete-all-dialog');
    expect(dialog.style.background).toBe('var(--alidade-dangerTint)');
    expect(icon(dialog)).toBe('danger');
  });

  it('the privacy page: a card for each channel, and Back with its chevron', () => {
    const s = renderScreen(<PrivacyPage onBack={() => undefined} />);
    for (const row of s.getAllByTestId('privacy-row')) {
      expect(row.style.background).toBe('var(--alidade-card)');
      expect(row.style.borderRadius).toBe('var(--alidade-card-radius)');
    }
    expect(
      s.getByRole('button', { name: 'Back' }).firstElementChild?.getAttribute('data-icon'),
    ).toBe('chevron-left');
  });
});
