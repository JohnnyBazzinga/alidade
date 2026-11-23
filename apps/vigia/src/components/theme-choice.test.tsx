// Vigia's theme (Req 22.3, design D25.8, task 24.1): Field by day and Field night when the phone is
// in dark mode, chosen at start and switched while the app is open, with no reload and no control.

import { activeTheme, field, fieldNight, instrument, applyTheme } from '@alidade/ui';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { createFakeEnvironment } from '../test-support/fake-environment';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { createVigiaStore } from './store';
import { chooseTheme } from './theme-choice';

type Listener = (event: { readonly matches: boolean }) => void;

function fakeMatchMedia(dark: boolean) {
  const listeners = new Set<Listener>();
  const list = {
    matches: dark,
    addEventListener: (_type: 'change', l: Listener) => void listeners.add(l),
    removeEventListener: (_type: 'change', l: Listener) => void listeners.delete(l),
  };
  const queries: string[] = [];
  return {
    matchMedia: (query: string) => {
      queries.push(query);
      return list;
    },
    set(value: boolean) {
      list.matches = value;
      for (const l of [...listeners]) l({ matches: value });
    },
    listeners,
    queries,
  };
}

const root = () => document.documentElement;
afterEach(() => {
  applyTheme(root(), instrument);
  root().removeAttribute('style');
});

describe('chooseTheme (Req 22.3)', () => {
  it('applies Field when the phone is light, and Field night when it is dark', () => {
    const light = fakeMatchMedia(false);
    const stopLight = chooseTheme(root(), light.matchMedia);
    expect(activeTheme().id).toBe('field');
    expect(root().style.getPropertyValue('--alidade-bg')).toBe(field.colours.bg);
    stopLight();
    const dark = fakeMatchMedia(true);
    const stopDark = chooseTheme(root(), dark.matchMedia);
    expect(activeTheme().id).toBe('field-night');
    expect(root().style.getPropertyValue('--alidade-bg')).toBe(fieldNight.colours.bg);
    stopDark();
  });

  it('switches the roles on the root while the app is open, with no reload', () => {
    const fake = fakeMatchMedia(false);
    const stop = chooseTheme(root(), fake.matchMedia);
    fake.set(true);
    expect(root().style.getPropertyValue('--alidade-card')).toBe(fieldNight.colours.card);
    fake.set(false);
    expect(root().style.getPropertyValue('--alidade-card')).toBe(field.colours.card);
    stop();
  });

  it('asks for prefers-color-scheme: dark, and its stop leaves no listener', () => {
    const fake = fakeMatchMedia(false);
    const stop = chooseTheme(root(), fake.matchMedia);
    expect(fake.queries).toEqual(['(prefers-color-scheme: dark)']);
    expect(fake.listeners.size).toBe(1);
    stop();
    expect(fake.listeners.size).toBe(0);
    fake.set(true);
    expect(activeTheme().id).toBe('field');
  });
});

const MAIN = Object.values(
  import.meta.glob<string>('../main.tsx', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

describe('the entry (Req 22.3, D25.8)', () => {
  it('chooses the theme from the window’s matchMedia before the first render, for both modes', () => {
    const choose = MAIN.indexOf(
      'chooseTheme(document.documentElement, (query) => window.matchMedia(query))',
    );
    expect(choose).toBeGreaterThan(-1);
    expect(choose).toBeLessThan(MAIN.indexOf('createRoot(root).render('));
  });

  it('stops listening when the page is left for good', () => {
    expect(MAIN).toMatch(/addEventListener\('pagehide', stopTheme/);
  });

  it('offers no control to choose a theme, on any tab, in either mode', () => {
    for (const mode of ['device', 'simulation'] as const) {
      const fake = createFakeEnvironment({ map: new FakeMapLibre(), mode });
      const store = createVigiaStore(fake.environment);
      store.start();
      const utils = render(
        <App environment={fake.environment} store={store} hasDeviceOrientation />,
      );
      for (const tab of ['Smoke', 'Sightings', 'Map', 'Emergency']) {
        fireEvent.click(utils.getByRole('tab', { name: tab }));
        const controls = utils.container.querySelectorAll('button, [role="switch"], select, input');
        for (const c of controls) {
          const name = `${c.textContent ?? ''} ${c.getAttribute('aria-label') ?? ''}`;
          expect(name, `${mode} ${tab}`).not.toMatch(/\b(theme|dark|light mode|night)\b/i);
        }
      }
      utils.unmount();
    }
  });
});
