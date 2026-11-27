// Vigia's theme (Req 22.3 as amended 2026-11-27, design D26): Mira, whatever the phone's colour
// scheme, applied before the first render, with no control to choose another.

import { activeTheme, applyTheme, instrument, mira } from '@alidade/ui';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { createFakeEnvironment } from '../test-support/fake-environment';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { createVigiaStore } from './store';
import { chooseTheme } from './theme-choice';

const root = () => document.documentElement;
afterEach(() => {
  applyTheme(root(), instrument);
  root().removeAttribute('style');
});

describe('chooseTheme (Req 22.3)', () => {
  it('applies Mira: its roles, its fonts and its shapes on the root', () => {
    chooseTheme(root());
    expect(activeTheme().id).toBe('mira');
    expect(root().style.getPropertyValue('--alidade-bg')).toBe(mira.colours.bg);
    expect(root().style.getPropertyValue('--alidade-primary')).toBe(mira.colours.primary);
    expect(root().style.getPropertyValue('--alidade-font-body')).toBe(mira.fonts.body);
    expect(root().style.getPropertyValue('--alidade-tile-radius')).toBe('16px');
  });
});

const SOURCES = import.meta.glob<string>(['../**/*.ts', '../**/*.tsx', '!../**/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const MAIN = SOURCES['../main.tsx'] as string;

describe('the entry (Req 22.3, D25.8)', () => {
  it('applies Mira before the first render, for both modes', () => {
    const choose = MAIN.indexOf('chooseTheme(document.documentElement);');
    expect(choose).toBeGreaterThan(-1);
    expect(choose).toBeLessThan(MAIN.indexOf('createRoot(root).render('));
  });

  it('never reads the phone’s colour scheme and never applies Field night', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    for (const [path, text] of Object.entries(SOURCES)) {
      expect(text, path).not.toMatch(/prefers-color-scheme|watchColourScheme|fieldNight/);
    }
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
