// The fixes of the UX review of 2026-11-28 (Codex and a Claude agent, independently; the lead chose
// "the small ones and the step line"): Vigia Req 22.19. In the App with fakes, and in the Simulator
// through the shell's driver.
import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { reviewerStep, SENT_BACK_TEXT, type PostState } from '../math/texts';
import { deviceSource } from '../test-support/device-sight';
import { createFakeEnvironment, START_UTC_MS } from '../test-support/fake-environment';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { canonicalOf } from '../test-support/incident-fixtures';
import { mountSimulation } from '../test-support/simulation-driver';
import { createVigiaStore } from './store';

const DEG = Math.PI / 180;

function mountApp() {
  const device = deviceSource();
  const fake = createFakeEnvironment({
    map: new FakeMapLibre(),
    sighting: device.sighting,
    href: 'https://app.example.test/',
  });
  const store = createVigiaStore(fake.environment);
  store.start();
  const utils = render(
    <App
      environment={fake.environment}
      store={store}
      hasDeviceOrientation
      onModeChange={() => {}}
    />,
  );
  const settle = async (fn: () => void = () => undefined) => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  const tap = (name: string | RegExp) =>
    settle(() => fireEvent.click(utils.getByRole('button', { name })));
  const press = (id: string) =>
    settle(() => {
      const el = utils.container.querySelector<HTMLElement>(`[data-control="${id}"]`);
      if (el === null) throw new Error(`no control ${id}`);
      fireEvent.click(el);
    });
  const advance = async (ms: number) => {
    for (let t = 50; t <= ms; t += 50) {
      await settle(() => {
        device.sensors.controls?.advanceTo(device.script.startUtcMs + t);
        fake.timer.advance(50);
      });
    }
  };
  const firstSighting = async () => {
    await tap('Sight the smoke');
    await press('start');
    await advance(1500);
    await press('freeze');
    await press('capture');
  };
  const primaries = () =>
    [...utils.container.querySelectorAll<HTMLElement>('[data-primary="true"]')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
  return { ...utils, store, settle, tap, press, advance, firstSighting, primaries };
}

const post = (over: Partial<PostState> & { id: string; name: string }): PostState => ({
  sightings: 0,
  waiting: 0,
  located: false,
  ...over,
});

describe('the reviewer’s step line (Req 17.7, 22.19)', () => {
  const west = (o: Partial<PostState> = {}) => post({ id: 'west', name: 'West post', ...o });
  const east = (o: Partial<PostState> = {}) => post({ id: 'east', name: 'East post', ...o });

  it('walks the four steps from the phones’ state, and ends with Done', () => {
    expect(reviewerStep([west(), east()], 'west')).toBe(
      'Step 1 of 4 · Sight the smoke from the West post',
    );
    expect(reviewerStep([west({ sightings: 1 }), east()], 'west')).toBe(
      'Step 2 of 4 · Sight it from the East post',
    );
    expect(reviewerStep([west({ sightings: 1 }), east()], 'east')).toBe(
      'Step 2 of 4 · Sight the smoke from here, the East post',
    );
    expect(reviewerStep([west({ sightings: 1 }), east({ sightings: 1 })], 'east')).toBe(
      'Step 3 of 4 · Send this sighting to the phone at the West post',
    );
    expect(reviewerStep([west({ sightings: 1, waiting: 1 }), east({ sightings: 1 })], 'east')).toBe(
      'Step 4 of 4 · Go to the West post: a sighting is waiting there',
    );
    expect(reviewerStep([west({ sightings: 1, waiting: 1 }), east({ sightings: 1 })], 'west')).toBe(
      'Step 4 of 4 · Add the sighting waiting here: the same smoke',
    );
    expect(reviewerStep([west({ sightings: 2, located: true }), east()], 'west')).toBe(
      'Done · the smoke is located: Show on map',
    );
    expect(reviewerStep([west({ sightings: 2, located: true }), east()], 'east')).toBe(
      'Done · the smoke is located on the phone at the West post',
    );
  });
});

describe('a sighting that waits is the next step (22.19 (c))', () => {
  it('is a card at the top of the Smoke screen, yellow while one sighting is used, and opens the Inbox', async () => {
    const a = mountApp();
    await a.settle();
    await a.firstSighting();
    const code = canonicalOf(
      5,
      'M7PQ3MWXA2',
      {
        azimuthRad: 45.5 * DEG,
        azimuthSigmaRad: 2 * DEG,
        positionAccuracyM: 8,
        timeUtcMs: START_UTC_MS - 60_000,
      },
      'received',
    ).code;
    await a.settle(() => void a.store.paste(code));
    const card = a.getByTestId('waiting-card');
    const screen = a.getByTestId('smoke-screen');
    expect(screen.firstElementChild).toBe(card);
    expect(card.textContent).toContain('1 sighting waiting');
    expect(a.primaries()).toEqual(['1 sighting waiting: add']);
    // "Move and sight again" stays, as the second choice.
    expect(a.getByRole('button', { name: 'Move and sight again' }).dataset.primary).toBeUndefined();
    await a.settle(() => fireEvent.click(card));
    expect(a.getByTestId('inbox-sheet')).toBeTruthy();
  });
});

describe('Emergency is not a dead end, and the pill does not look like a call (22.19 (d))', () => {
  it('draws the siren on the pill, leaves the pill out on the Emergency tab, and offers Sight the smoke there', async () => {
    const a = mountApp();
    await a.settle();
    const pill = a.container.querySelector<HTMLElement>('[data-part="fire-pill"]');
    expect(pill?.querySelector('[data-icon="siren"], svg')).toBeTruthy();
    expect(pill?.innerHTML).toContain('siren');
    await a.settle(() => fireEvent.click(a.getByRole('tab', { name: 'Emergency' })));
    expect(a.container.querySelector('[data-part="fire-pill"]')).toBeNull();
    const sight = within(a.getByTestId('emergency-screen')).getByRole('button', {
      name: 'Sight the smoke',
    });
    expect(sight.dataset.primary).toBe('true');
    await a.settle(() => fireEvent.click(sight));
    expect(a.getByTestId('sighting-screen')).toBeTruthy();
  });
});

describe('"Sent it?" only after something was shared (22.19 (e))', () => {
  it('opening and closing the sheet says nothing; after a share it says what to wait for', async () => {
    const a = mountApp();
    await a.settle();
    await a.firstSighting();
    await a.tap('Send this sighting');
    await a.tap('Close');
    expect(a.queryByTestId('status-line')).toBeNull();
    await a.tap('Send this sighting');
    await a.tap('Show QR code (someone beside you)');
    await a.tap('Back');
    await a.tap('Close');
    expect(a.getByTestId('status-line').textContent).toBe(SENT_BACK_TEXT);
  });
});

describe('the question after a second capture says it is not saved (22.19 (b))', () => {
  it('names its caption "Not saved yet" and its way out "Discard this sighting"', async () => {
    const a = mountApp();
    await a.settle();
    await a.firstSighting();
    await a.tap('Move and sight again');
    await a.press('start');
    await a.advance(1500);
    await a.press('freeze');
    await a.press('capture');
    const dialog = a.getByTestId('confirm-smoke');
    expect(dialog.textContent).toContain('Not saved yet');
    const entries = () => a.store.getSnapshot().open?.incident.entries.length;
    expect(entries()).toBe(1);
    await a.tap('Discard this sighting');
    expect(a.getByTestId('smoke-screen')).toBeTruthy();
    expect(entries()).toBe(1);
  });
});

describe('the judge’s path in the Simulator (22.19 (a), (f))', () => {
  it('goes from post to post by the cards, sends, goes to the other phone, adds, and ends on Show on map', async () => {
    const m = mountSimulation();
    await m.settle();
    const step = () => m.getByTestId('reviewer-step').textContent;
    expect(step()).toBe('Step 1 of 4 · Sight the smoke from the West post');
    await m.sight('west', 'crosshair', 'new');
    expect(step()).toBe('Step 2 of 4 · Sight it from the East post');
    // The next step's card is the other post: it changes the phone and opens the Sight screen.
    const card = m.getByRole('button', { name: 'Sight it from the East post' });
    expect(card.dataset.primary).toBe('true');
    expect(card.textContent).toContain('Switches to the phone there');
    await m.settle(() => fireEvent.click(card));
    expect((m.getByLabelText('You hold the phone at') as HTMLSelectElement).value).toBe('east');
    expect(m.getByTestId('sight-screen')).toBeTruthy();
    await m.toLive();
    await m.press('freeze');
    await m.press('capture');
    expect(step()).toBe('Step 3 of 4 · Send this sighting to the phone at the West post');
    // Every other phone has sighted: sending is the yellow card, and no card sends the judge back.
    expect(m.getByRole('button', { name: 'Send this sighting' }).dataset.primary).toBe('true');
    expect(m.queryByRole('button', { name: /^Sight it from the / })).toBeNull();
    // Send, then the sheet offers to go to that phone: its Inbox opens there.
    await m.click('Send this sighting');
    await m.click('Send to the phone at the west post');
    expect(step()).toBe('Step 4 of 4 · Go to the West post: a sighting is waiting there');
    await m.click('Go to the phone at the west post');
    expect((m.getByLabelText('You hold the phone at') as HTMLSelectElement).value).toBe('west');
    expect(m.getByTestId('inbox-sheet')).toBeTruthy();
    expect(step()).toBe('Step 4 of 4 · Add the sighting waiting here: the same smoke');
    await m.click('It is the same smoke as the one I have open');
    await m.click('Join the two smokes');
    expect(step()).toBe('Done · the smoke is located: Show on map');
    const map = within(m.getByTestId('primary-row')).getByRole('button', { name: 'Show on map' });
    expect(map.dataset.primary).toBe('true');
  });
});
