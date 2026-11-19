// The App (design §9 navigation; Req 1.5, 1.10, 10.3, 17.1, 17.4): the four tabs always there but
// on the Sight screen and in a sheet; a link with a code opens the Inbox sheet over the Smoke
// screen; the mode control only when the browser has motion sensors; the Simulation banner on
// every screen in Simulation mode; everything in the page's flow.

import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { SIMULATION_BANNER_TEXT } from '../math/texts';
import {
  createFakeEnvironment,
  type FakeEnvironmentOptions,
} from '../test-support/fake-environment';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { postsIncident } from '../test-support/geometry-fixtures';
import { canonicalOf, INCIDENT_ID } from '../test-support/incident-fixtures';
import { storedWith } from '../test-support/render-screen';
import { createVigiaStore } from './store';

function mount(options: FakeEnvironmentOptions = {}, hasDeviceOrientation = true) {
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
    expect(banner()).toBe(SIMULATION_BANNER_TEXT);
    for (const name of ['Sightings', 'Map', 'Emergency', 'Smoke']) {
      await act(async () => a.tab(name));
      expect(banner()).toBe(SIMULATION_BANNER_TEXT);
    }
    a.tap('Sight the smoke');
    expect(banner()).toBe(SIMULATION_BANNER_TEXT);
    a.tap('Back');
    a.tap(/Add a sighting someone sent me/);
    expect(banner()).toBe(SIMULATION_BANNER_TEXT);
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
