// The other screens in the Mira look (Req 22.7, 22.10, 22.11; design D26.5 to D26.7): the same
// words, drawn as Mira's cards, tiles and pills. The other tests of each screen keep its wording.

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

describe('the Sightings tab (Req 22.7, D26.5)', () => {
  const show = () =>
    renderScreen(<SightingsScreen onShare={() => undefined} onInbox={() => undefined} />, {
      storedItems: storedWith([postsIncident(['west', 'east'])]),
    });

  it('a card for each sighting: its title and Used on one row, the bearing dial beside the numeral', () => {
    const s = show();
    const row = s.getAllByTestId('sighting-row')[0] as HTMLElement;
    expect(row.style.background).toBe('var(--alidade-card)');
    expect(row.style.borderRadius).toBe('var(--alidade-card-radius)');
    const head = row.querySelector<HTMLElement>('[data-part="head"]') as HTMLElement;
    expect(head.querySelector('h3')?.textContent).toMatch(/^Sighting 1, /);
    const badge = head.querySelector<HTMLElement>('[data-part="badge"]') as HTMLElement;
    expect(badge.textContent).toBe('Used');
    expect(icon(badge)).toBe('check');
    expect(badge.style.background).toBe('var(--alidade-okTint)');
    const dial = row.querySelector('svg[data-art="bearing-dial"]');
    expect(dial?.getAttribute('aria-label')).toMatch(
      /^Compass dial pointing toward \d+\.\d degrees$/,
    );
    const numeral = row.querySelector<HTMLElement>('[data-part="numeral"]') as HTMLElement;
    expect(numeral.style.fontSize).toBe('44px');
    expect(numeral.textContent).toMatch(/^\d+\.\d°$/);
    expect(numeral.querySelector('svg')).toBeNull();
  });

  it('rows with their icons for the accuracy, the time and the share state, over a rule', () => {
    const s = show();
    const row = s.getAllByTestId('sighting-row')[0] as HTMLElement;
    const lines = [...row.querySelectorAll('p')].filter((p) => p.querySelector('svg'));
    expect(lines.map(icon)).toEqual(['check', 'pin', 'clock', 'share']);
  });

  it('three pills of equal width, Share, Hide, Delete in the danger tone; Delete asks in a danger card', () => {
    const s = show();
    const row = s.getAllByTestId('sighting-row')[0] as HTMLElement;
    const box = row.querySelector<HTMLElement>('[data-part="actions"]') as HTMLElement;
    expect(box.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    const actions = [...box.querySelectorAll<HTMLElement>('button')];
    expect(actions.map((b) => b.textContent)).toEqual(['Share', 'Hide', 'Delete']);
    for (const b of actions)
      expect(Number.parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(48);
    expect(actions[2]?.style.border).toBe('1.5px solid var(--alidade-dangerIcon)');
    expect(actions[2]?.style.color).toBe('var(--alidade-dangerInk)');
    fireEvent.click(actions[2] as HTMLElement);
    const confirm = row.querySelector<HTMLElement>('[role="group"]') as HTMLElement;
    expect(confirm.style.background).toBe('var(--alidade-dangerTint)');
  });

  it('"Add a sighting someone sent me" is a dashed tile with a yellow plus', () => {
    const s = show();
    const add = s.getByRole('button', { name: 'Add a sighting someone sent me' });
    expect(add.style.border).toBe('1.5px dashed var(--alidade-inkDim)');
    expect(icon(add)).toBe('plus');
  });
});

describe('Share and the QR view (Req 22.10, D26.6)', () => {
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

  it('the statement is on the soft panel, its last sentence bold, after the choices', () => {
    const s = open();
    const statement = s.getByTestId('leaves-statement');
    expect(statement.style.background).toBe('var(--alidade-raised)');
    expect(statement.querySelector('strong')?.textContent).toBe('It cannot be taken back.');
    const choices = s.getByTestId('share-choices');
    expect(
      choices.compareDocumentPosition(statement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('the two choices are large option cards: the QR in the yellow, the link white with an ink edge', () => {
    const s = open();
    const choices = [...s.getByTestId('share-choices').querySelectorAll<HTMLElement>('button')];
    expect(choices.map(icon)).toEqual(['qr', 'link']);
    expect(choices[0]?.style.background).toBe('var(--alidade-primary)');
    expect(choices[1]?.style.background).toBe('var(--alidade-card)');
    expect(choices[1]?.style.border).toBe('1.5px solid var(--alidade-ruleStrong)');
    for (const c of choices) {
      expect(Number.parseFloat(c.style.minHeight)).toBe(84);
      expect(c.style.borderRadius).toBe('var(--alidade-card-radius)');
      expect(c.lastElementChild?.getAttribute('data-icon')).toBe('chevron-right');
    }
  });

  it('the QR view: a round Back, the title, the QR on a white card with an ink edge', () => {
    const s = open();
    fireEvent.click(s.getAllByRole('button', { name: /Show QR code/ })[0] as HTMLElement);
    const view = s.getByTestId('qr-view');
    expect(view.querySelector('h1')?.textContent).toBe('QR code');
    const card = view.querySelector<HTMLElement>('[data-part="qr-card"]') as HTMLElement;
    expect(card.style.background).toBe('var(--alidade-qrLight)');
    expect(card.style.border).toBe('2px solid var(--alidade-ink)');
    const back = s.getByRole('button', { name: 'Back' });
    expect(back.textContent).toBe('');
    expect(back.firstElementChild?.getAttribute('data-icon')).toBe('chevron-left');
  });
});

describe('Emergency, the delete dialog and the privacy page (Req 22.10, D26.7)', () => {
  it('Emergency: its title, then the danger card with its shield; Copy with its icon', () => {
    const s = renderScreen(<EmergencyScreen />, {
      storedItems: storedWith([postsIncident(['west', 'east', 'side'])]),
    });
    const screen = s.getByTestId('emergency-screen');
    expect(screen.firstElementChild?.textContent).toBe('Emergency');
    const card = screen.children[1] as HTMLElement;
    expect(card.style.background).toBe('var(--alidade-dangerTint)');
    expect(icon(card)).toBe('shield');
    expect(card.querySelector('strong')?.textContent).toBe(
      'This app does not call or notify anyone.',
    );
    expect(icon(s.getByRole('button', { name: /^Copy the/ }))).toBe('copy');
    const text = screen.querySelector('pre') as HTMLElement;
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

  it('the privacy page: a card for each channel with its labels in small capitals, and a round Back', () => {
    const s = renderScreen(<PrivacyPage onBack={() => undefined} />);
    for (const row of s.getAllByTestId('privacy-row')) {
      expect(row.style.background).toBe('var(--alidade-card)');
      expect(row.style.borderRadius).toBe('20px');
      const labels = [...row.querySelectorAll<HTMLElement>('p')].filter(
        (p) => p.style.textTransform === 'uppercase',
      );
      expect(labels.map((p) => p.textContent)).toEqual([
        'What leaves the phone',
        'When',
        'Who sees it',
      ]);
    }
    const back = s.getByRole('button', { name: 'Back' });
    expect(back.textContent).toBe('');
    expect(back.firstElementChild?.getAttribute('data-icon')).toBe('chevron-left');
  });
});
