// The App (design §9 navigation; Req 1.5, 1.10, 10.3, 17.1, 17.4): the four tabs always there but
// on the Sight screen and in a sheet; a link with a code opens the Inbox sheet over the Smoke
// screen; the mode control only when the browser has motion sensors; the Simulation banner on
// every screen in Simulation mode; everything in the page's flow.

import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { SIMULATION_TEXT } from '../math/texts';
import {
  createFakeEnvironment,
  type FakeEnvironmentOptions,
} from '../test-support/fake-environment';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { postsIncident } from '../test-support/geometry-fixtures';
import { canonicalOf, INCIDENT_ID } from '../test-support/incident-fixtures';
import { storedWith } from '../test-support/render-screen';
import type { PhoneInHand } from './PhoneInHandBar';
import { createVigiaStore } from './store';

function mount(
  options: FakeEnvironmentOptions = {},
  hasDeviceOrientation = true,
  phoneInHand?: PhoneInHand,
) {
  const fake = createFakeEnvironment({
    map: new FakeMapLibre(),
    storedItems: storedWith([postsIncident(['west', 'east'])]),
    ...options,
  });
  const store = createVigiaStore(fake.environment);
  store.start();
  const modes: string[] = [];
  const utils = render(
    <App
      environment={fake.environment}
      store={store}
      hasDeviceOrientation={hasDeviceOrientation}
      onModeChange={(m) => void modes.push(m)}
      {...(phoneInHand === undefined ? {} : { phoneInHand })}
    />,
  );
  const tabs = () => utils.queryByTestId('tab-bar');
  const tap = (name: string | RegExp) => fireEvent.click(utils.getByRole('button', { name }));
  const tab = (name: string) => fireEvent.click(utils.getByRole('tab', { name }));
  return { ...utils, fake, store, modes, tabs, tap, tab };
}

describe('the tabs (design §9)', () => {
  it('starts on the Smoke screen with the four tabs', () => {
    const a = mount();
    expect(a.getByTestId('smoke-screen')).toBeTruthy();
    expect(within(a.getByTestId('tab-bar')).getAllByRole('tab')).toHaveLength(4);
  });

  it('shows each screen from its tab, with the tabs still there', async () => {
    const a = mount();
    a.tab('Sightings');
    expect(a.getByTestId('sightings-screen')).toBeTruthy();
    await act(async () => a.tab('Map'));
    expect(a.getByTestId('map-screen')).toBeTruthy();
    a.tab('Emergency');
    expect(a.getByTestId('emergency-screen')).toBeTruthy();
    expect(a.tabs()).not.toBeNull();
    a.tab('Smoke');
    expect(a.getByTestId('smoke-screen')).toBeTruthy();
  });

  it('hides the tabs on the Sight screen, and Back brings them back', () => {
    const a = mount();
    a.tap('Sight the smoke');
    expect(a.getByTestId('sight-screen')).toBeTruthy();
    expect(a.tabs()).toBeNull();
    a.tap('Back');
    expect(a.getByTestId('smoke-screen')).toBeTruthy();
    expect(a.tabs()).not.toBeNull();
  });

  it('hides the tabs in the Inbox, the Share and the privacy sheets', () => {
    const a = mount();
    a.tap(/Add a sighting someone sent me/);
    expect(a.getByTestId('inbox-sheet')).toBeTruthy();
    expect(a.tabs()).toBeNull();
    a.tap('Close');
    a.tap('What leaves this phone');
    expect(a.getByTestId('privacy-page')).toBeTruthy();
    expect(a.tabs()).toBeNull();
    a.tap('Back');
    a.tab('Sightings');
    const row = a.getAllByTestId('sighting-row')[0];
    if (row === undefined) throw new Error('no row');
    fireEvent.click(within(row).getByRole('button', { name: 'Share' }));
    expect(a.getByTestId('share-sheet')).toBeTruthy();
    expect(a.tabs()).toBeNull();
    a.tap('Close');
    expect(a.getByTestId('sightings-screen')).toBeTruthy();
  });
});

describe('a link with a code (Req 10.3)', () => {
  it('opens the Inbox sheet over the Smoke screen, the code held and the address replaced', () => {
    const { code } = canonicalOf(5, INCIDENT_ID, {}, 'received');
    const a = mount({ href: `https://app.example.test/#${code}` });
    expect(a.getByTestId('inbox-sheet')).toBeTruthy();
    expect(a.getAllByTestId('inbox-card')).toHaveLength(1);
    expect(a.fake.page.history.calls.map((c) => c.url)).toEqual(['https://app.example.test/']);
    a.tap('Close');
    expect(a.getByTestId('smoke-screen')).toBeTruthy();
  });

  it('opens the Inbox sheet for a code that arrives in the fragment later', () => {
    const a = mount();
    const { code } = canonicalOf(5, INCIDENT_ID, {}, 'received');
    act(() => {
      a.fake.page.location.setRaw(`https://app.example.test/#${code}`, `#${code}`);
      a.fake.page.events.dispatch();
    });
    expect(a.getByTestId('inbox-sheet')).toBeTruthy();
  });
});

describe('the mode control (Req 17.1)', () => {
  it('is on the Smoke screen when the browser has motion sensors', () => {
    const a = mount({}, true);
    const control = a.getByTestId('mode-control');
    expect(
      within(control).getByRole('button', { name: 'This phone' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(within(control).getByRole('button', { name: 'Simulator' }));
    expect(a.modes).toEqual(['simulation']);
  });

  it('is not there without motion sensors', () => {
    const a = mount({ mode: 'simulation' }, false);
    expect(a.queryByTestId('mode-control')).toBeNull();
  });
});

describe('Simulation mode (Req 17.4)', () => {
  it('shows the banner on every screen and sheet', async () => {
    const a = mount({ mode: 'simulation' }, false);
    const banner = () => a.getByTestId('simulation-banner').textContent;
    expect(banner()).toBe(SIMULATION_TEXT);
    for (const name of ['Sightings', 'Map', 'Emergency', 'Smoke']) {
      await act(async () => a.tab(name));
      expect(banner()).toBe(SIMULATION_TEXT);
    }
    a.tap('Sight the smoke');
    expect(banner()).toBe(SIMULATION_TEXT);
    a.tap('Back');
    a.tap(/Add a sighting someone sent me/);
    expect(banner()).toBe(SIMULATION_TEXT);
  });

  it('has no banner on a phone', () => {
    const a = mount();
    expect(a.queryByTestId('simulation-banner')).toBeNull();
  });
});

describe('the layout (skeleton-ui Req 13.13, 18.11)', () => {
  it('puts nothing in a fixed or absolute layer: the tabs end a column whose middle scrolls', () => {
    const a = mount();
    for (const element of a.container.querySelectorAll<HTMLElement>('*')) {
      expect(['fixed', 'absolute', 'sticky']).not.toContain(element.style.position);
    }
    const shell = a.getByTestId('app-shell');
    expect(shell.style.display).toBe('flex');
    expect(shell.lastElementChild).toBe(a.getByTestId('tab-bar'));
    expect(a.getByTestId('app-main').style.overflowY).toBe('auto');
    expect(a.getByTestId('app-main').style.overflowX).toBe('hidden');
  });
});

/** Whether `a` comes before `b` in the document. */
const before = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

// Task 21.3 (design §9: the primary action where the thumb is). On a phone the Smoke screen with a
// Fix was three screens long with "Sight the smoke" at its end, and Copy came after the Emergency
// text. Each screen's primary action is in a row of its own between the part that scrolls and the
// tab bar, in the column: not a layer over anything.
describe('the primary action, above the tabs (task 21.3)', () => {
  const rowOf = (a: ReturnType<typeof mount>) => a.getByTestId('primary-row');

  it('on the Smoke screen: Sight the smoke, after the scrolling part and before the tabs', () => {
    const a = mount();
    const row = rowOf(a);
    const sight = within(row).getByRole('button', { name: 'Sight the smoke' });
    expect(sight.dataset.primary).toBe('true');
    expect(a.getByTestId('app-main').contains(sight)).toBe(false);
    expect(row.parentElement).toBe(a.getByTestId('app-shell'));
    expect(before(a.getByTestId('app-main'), row)).toBe(true);
    expect(before(row, a.getByTestId('tab-bar'))).toBe(true);
    expect(row.nextElementSibling).toBe(a.getByTestId('tab-bar'));
    // The secondary controls stay in the scrolling part.
    const main = within(a.getByTestId('app-main'));
    expect(main.getByRole('button', { name: /Add a sighting someone sent me/ })).toBeTruthy();
    expect(main.getByRole('button', { name: 'Delete everything on this phone' })).toBeTruthy();
    expect(a.getAllByRole('button', { name: 'Sight the smoke' })).toHaveLength(1);
  });

  it('on the Emergency screen: Copy, with its result, in the row; the switch in the scrolling part', () => {
    const a = mount();
    a.tab('Emergency');
    const row = rowOf(a);
    expect(within(row).getByRole('button', { name: 'Copy the text' }).dataset.primary).toBe('true');
    expect(within(row).getByTestId('copy-box')).toBeTruthy();
    expect(
      within(a.getByTestId('app-main')).getByRole('switch', {
        name: 'Include where I took my last sighting',
      }),
    ).toBeTruthy();
    expect(row.nextElementSibling).toBe(a.getByTestId('tab-bar'));
  });

  it('is empty on the screens that have none, and in no fixed, absolute or sticky layer', async () => {
    const a = mount();
    for (const name of ['Sightings', 'Map']) {
      await act(async () => a.tab(name));
      expect(rowOf(a).childElementCount).toBe(0);
    }
    for (const element of [rowOf(a), ...rowOf(a).querySelectorAll<HTMLElement>('*')]) {
      expect(['fixed', 'absolute', 'sticky']).not.toContain(element.style.position);
    }
  });

  it('runs the action: Sight the smoke opens the Sight screen', () => {
    const a = mount();
    fireEvent.click(within(rowOf(a)).getByRole('button', { name: 'Sight the smoke' }));
    expect(a.getByTestId('sight-screen')).toBeTruthy();
  });
});

// Task 21.5: in Simulation mode every screen says which simulated phone is in hand, under the
// banner, with the control that changes it; and the first screen, with nothing sighted, gives
// the reviewer's path in three numbered lines.
describe('the phone in hand, in Simulation mode (task 21.5)', () => {
  const hand = (chosen: string[]): PhoneInHand => ({
    stationId: 'west',
    stations: [
      { id: 'west', name: 'West post' },
      { id: 'east', name: 'East post' },
    ],
    onSelect: (id) => void chosen.push(id),
  });

  it('is said under the banner on every screen and sheet, with its chooser', async () => {
    const chosen: string[] = [];
    const a = mount({ mode: 'simulation', storedItems: {} }, false, hand(chosen));
    const check = () => {
      const bar = a.getByTestId('phone-in-hand');
      expect(bar.previousElementSibling).toBe(a.getByTestId('simulation-banner'));
      const select = within(bar).getByLabelText('You hold the phone at') as HTMLSelectElement;
      expect(select.value).toBe('west');
      expect([...select.options].map((o) => o.text)).toEqual(['West post', 'East post']);
    };
    check();
    for (const name of ['Sightings', 'Map', 'Emergency', 'Smoke']) {
      await act(async () => a.tab(name));
      check();
    }
    a.tap('Sight the smoke');
    check();
    a.tap('Back');
    a.tap(/Add a sighting someone sent me/);
    check();
    fireEvent.change(a.getByLabelText('You hold the phone at'), { target: { value: 'east' } });
    expect(chosen).toEqual(['east']);
  });

  it('is not there on a phone', () => {
    const a = mount();
    expect(a.queryByTestId('phone-in-hand')).toBeNull();
    expect(a.queryByTestId('reviewer-path')).toBeNull();
  });

  it('gives the path in three numbered lines on the first screen while this phone has sighted nothing', () => {
    const a = mount({ mode: 'simulation', storedItems: {} }, false, hand([]));
    const path = a.getByTestId('reviewer-path');
    const lines = [...path.querySelectorAll('ol > li')].map((li) => li.textContent ?? '');
    expect(path.querySelector('ol')).not.toBeNull();
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/West post/);
    expect(lines[1]).toMatch(/another post/);
    expect(lines[2]).toMatch(/other phone/);
    expect(lines[2]).toMatch(/same smoke/);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(90);
  });

  it('gives no path once this phone holds a smoke', () => {
    const a = mount({ mode: 'simulation' }, false, hand([]));
    expect(a.getByTestId('phone-in-hand')).toBeTruthy();
    expect(a.queryByTestId('reviewer-path')).toBeNull();
  });
});

// Task 23.4 and 23.6 (2026-11-21; Req 3.10, 6.12).
describe('the Sight route is the whole column (Req 3.10, design D23.1)', () => {
  it('gives the route of the phone no padding, and the other routes their padding', () => {
    const a = mount();
    expect(a.getByTestId('app-main').style.padding).not.toBe('0px');
    a.tap('Sight the smoke');
    expect(a.getByTestId('app-main').style.padding).toBe('0px');
    a.tap('Back');
    expect(a.getByTestId('app-main').style.padding).not.toBe('0px');
  });
});

describe('"Show on map" (Req 6.12)', () => {
  it('goes from the first view of a Fix to the Map tab', async () => {
    const a = mount();
    await act(async () => fireEvent.click(a.getByRole('button', { name: 'Show on map' })));
    expect(a.getByTestId('map-screen')).toBeTruthy();
    expect(a.getByRole('tab', { name: 'Map' }).getAttribute('aria-selected')).toBe('true');
  });
});

// Task 24.3 (2026-11-22, the lead's new look; Req 22.2): a header by route, the page's first row.
describe('the header by route (Req 22.2)', () => {
  const header = (utils: ReturnType<typeof mount>) => utils.queryByTestId('app-header');

  it('is full on Smoke and compact, titled by the tab label, on the other tabs', () => {
    const utils = mount();
    expect(header(utils)?.dataset.variant).toBe('full');
    for (const tab of ['Sightings', 'Map', 'Emergency']) {
      utils.tab(tab);
      expect(header(utils)?.dataset.variant).toBe('compact');
      expect(header(utils)?.querySelector('h1')?.textContent).toBe(tab);
      // The title is said once on the screen.
      expect(utils.getAllByRole('heading', { name: tab, level: 1 })).toHaveLength(1);
    }
    utils.tab('Smoke');
    expect(header(utils)?.dataset.variant).toBe('full');
  });

  it('is the page’s first row, above the Simulation banner, never a layer', () => {
    const utils = mount({ mode: 'simulation' });
    const shell = utils.getByTestId('app-shell');
    expect(shell.firstElementChild).toBe(header(utils));
    expect(['', 'static']).toContain((header(utils) as HTMLElement).style.position);
  });

  it('is none on the Sight screen, whose first control is Back', () => {
    // The fake's sighting source is the flow layout; the docked bar's Back is
    // sight-first-screen.test.tsx's.
    const utils = mount();
    utils.tap('Sight the smoke');
    expect(utils.getByTestId('sight-screen')).toBeTruthy();
    expect(header(utils)).toBeNull();
    const main = utils.getByTestId('app-main');
    expect(main.querySelector('button')?.textContent).toMatch(/Back/);
  });

  it('is compact on the privacy page, with its title once', () => {
    const utils = mount();
    fireEvent.click(
      utils.getAllByRole('button', { name: 'What leaves this phone' })[0] as HTMLElement,
    );
    expect(header(utils)?.dataset.variant).toBe('compact');
    expect(
      utils.getAllByRole('heading', { name: 'What leaves this phone', level: 1 }),
    ).toHaveLength(1);
  });
});
