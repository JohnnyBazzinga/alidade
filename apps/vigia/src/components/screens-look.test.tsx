// Every screen and sheet at 360 CSS pixels (task 13.10; design §9 as amended by Mira, D26; skeleton-ui
// Req 13.13, 13.14, 18.11). jsdom does no layout, so the check reads the inline styles the
// components set: every control a touch target of at least 44 px (the primary one 62 px, Mira's
// pill), text of at least 11 px (Mira's smallest, the tab labels and the captions), every colour from
// UI's `COLOURS` (and the QR's black and white), nothing in a fixed, absolute or sticky layer but
// over a picture (the camera's image, the home dial's ring, the map), and no width wider than 320 px.

import { COLOURS } from '@alidade/ui';
import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import {
  createFakeEnvironment,
  type FakeEnvironmentOptions,
} from '../test-support/fake-environment';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { postsIncident } from '../test-support/geometry-fixtures';
import { canonicalOf, INCIDENT_ID } from '../test-support/incident-fixtures';
import { storedWith } from '../test-support/render-screen';
import { createVigiaStore } from './store';

const NARROWEST_PX = 320;
/** Mira's least sizes (the lead's design, 2026-11-27). */
const MIRA_SMALLEST_TEXT_PX = 11;
const MIRA_TOUCH_PX = 44;
const MIRA_PRIMARY_PX = 62;
// The roles are `var()` strings now (skeleton-ui Req 22.4); a resolved colour in a style is the
// art's plume (design D25.4), the QR's black and white, or a hex token of today's palette.
import { ART_COLOURS } from './art/art-colours';
const ALLOWED_COLOURS = new Set(
  [...Object.values(COLOURS), ...Object.values(ART_COLOURS), '#000000', '#FFFFFF'].map((c) =>
    c.toLowerCase(),
  ),
);

function hexOf(r: string, g: string, b: string): string {
  return `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
}

/** What breaks the look in the rendered tree, one line per fault. */
function faults(root: HTMLElement): string[] {
  const found: string[] = [];
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    const style = element.style;
    const where = `${element.tagName.toLowerCase()}${element.dataset.testid ? `#${element.dataset.testid}` : ''} "${(element.textContent ?? '').slice(0, 30)}"`;
    if (['fixed', 'absolute', 'sticky'].includes(style.position)) {
      // UI's image box positions the reticle inside itself; nothing of Vigia's does.
      if (
        element.closest(
          '[data-part="image-box"], [data-testid="home-dial"], [data-part="map-frame"]',
        ) === null
      )
        found.push(`${where}: position ${style.position}`);
    }
    for (const property of ['width', 'minWidth'] as const) {
      const value = style[property];
      if (value.endsWith('px') && Number.parseFloat(value) > NARROWEST_PX) {
        found.push(`${where}: ${property} ${value}`);
      }
    }
    const attribute = element.getAttribute('style') ?? '';
    for (const m of attribute.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)) {
      const hex = hexOf(m[1] ?? '0', m[2] ?? '0', m[3] ?? '0');
      if (!ALLOWED_COLOURS.has(hex)) found.push(`${where}: colour ${hex}`);
    }
    // The words inside a picture (the schematic's labels) scale with it: the picture is checked
    // by its own test (Schematic.test.tsx).
    if (
      style.fontSize !== '' &&
      Number.parseFloat(style.fontSize) < MIRA_SMALLEST_TEXT_PX &&
      element.closest('svg') === null
    ) {
      found.push(`${where}: font-size ${style.fontSize}`);
    }
    if (element.tagName === 'BUTTON') {
      const minHeight = Number.parseFloat(style.minHeight);
      const least = element.dataset.primary === 'true' ? MIRA_PRIMARY_PX : MIRA_TOUCH_PX;
      if (!(minHeight >= least)) found.push(`${where}: min-height ${style.minHeight}`);
      if (
        style.flex === '' &&
        !(Number.parseFloat(style.minWidth) >= MIRA_TOUCH_PX) &&
        !(Number.parseFloat(style.width) >= MIRA_TOUCH_PX) &&
        style.width !== '100%'
      ) {
        found.push(`${where}: min-width ${style.minWidth}`);
      }
    }
  }
  // An icon (skeleton-ui Req 22.8) paints with currentColor and fills nothing: its words' colour.
  // The art (design D25.4) paints in `style`, from roles: only another picture's fill is read here.
  for (const svg of root.querySelectorAll(
    'svg:not([data-icon]):not([data-art]):not([role="img"][aria-label^="Schematic"]) path, svg:not([data-icon]):not([data-art]) rect',
  )) {
    const fill = (svg.getAttribute('fill') ?? '').toLowerCase();
    if (!ALLOWED_COLOURS.has(fill)) found.push(`svg: fill ${fill}`);
  }
  return found;
}

function mount(options: FakeEnvironmentOptions = {}) {
  const fake = createFakeEnvironment({
    map: new FakeMapLibre(),
    storedItems: storedWith([
      postsIncident(['west', 'east', 'side', 'southwest'], (post) => ({
        errorRad: post === 'southwest' ? (30 * Math.PI) / 180 : 0,
      })),
    ]),
    ...options,
  });
  const store = createVigiaStore(fake.environment);
  store.start();
  const utils = render(
    <div style={{ width: 360 }}>
      <App
        environment={fake.environment}
        store={store}
        hasDeviceOrientation
        onModeChange={() => undefined}
      />
    </div>,
  );
  const settle = async (fn: () => void) => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  return { ...utils, store, settle };
}

describe('the screens at 360 CSS pixels (task 13.10)', () => {
  for (const mode of ['device', 'simulation'] as const) {
    it(`every tab, sheet and dialog keeps UI's sizes and colours, in ${mode} mode`, async () => {
      const a = mount({ mode });
      const seen: Record<string, string[]> = {};
      const look = (name: string) => {
        // Inside the App: the 360 px frame of the test is not the App's.
        seen[name] = faults(a.getByTestId('app-shell'));
      };
      look('smoke');
      fireEvent.click(a.getByTestId('data-tile'));
      await a.settle(() =>
        fireEvent.click(a.getByRole('button', { name: 'Delete everything on this phone' })),
      );
      look('delete-all dialog');
      await a.settle(() => fireEvent.click(a.getByRole('button', { name: 'Keep them' })));
      for (const tab of ['Sightings', 'Map', 'Emergency']) {
        await a.settle(() => fireEvent.click(a.getByRole('tab', { name: tab })));
        look(tab);
      }
      await a.settle(() => fireEvent.click(a.getByRole('tab', { name: 'Sightings' })));
      const row = a.getAllByTestId('sighting-row')[0];
      if (row === undefined) throw new Error('no row');
      await a.settle(() => fireEvent.click(within(row).getByRole('button', { name: 'Share' })));
      const qr = a.queryByRole('button', { name: 'Show QR code' });
      if (qr !== null) await a.settle(() => fireEvent.click(qr));
      look('share sheet');
      await a.settle(() =>
        fireEvent.click(a.getByRole('button', { name: 'What leaves this phone' })),
      );
      look('privacy page');
      await a.settle(() => fireEvent.click(a.getByRole('button', { name: 'Back' })));
      await a.settle(() => fireEvent.click(a.getByRole('button', { name: 'Close' })));
      await a.settle(() => void a.store.paste(canonicalOf(9, INCIDENT_ID, {}, 'received').code));
      await a.settle(() => fireEvent.click(a.getByRole('tab', { name: /Smoke/ })));
      await a.settle(() =>
        fireEvent.click(a.getByRole('button', { name: /Add a sighting someone sent me/ })),
      );
      look('inbox sheet');
      await a.settle(() => fireEvent.click(a.getByRole('button', { name: 'Close' })));
      await a.settle(() => fireEvent.click(a.getByRole('button', { name: 'Sight the smoke' })));
      look('sight screen');
      expect(seen).toEqual({
        smoke: [],
        'delete-all dialog': [],
        Sightings: [],
        Map: [],
        Emergency: [],
        'share sheet': [],
        'privacy page': [],
        'inbox sheet': [],
        'sight screen': [],
      });
    });
  }

  it('the check bites: a button too small, a colour of its own, a fixed layer and a wide box are found', () => {
    const { container } = render(
      <div>
        <button type="button" style={{ minHeight: 30, minWidth: 48 }}>
          small
        </button>
        <p style={{ color: '#123456', fontSize: 10 }}>odd</p>
        <div style={{ position: 'fixed' }}>over</div>
        <div style={{ width: 400 }}>wide</div>
      </div>,
    );
    const found = faults(container);
    expect(found.some((f) => f.includes('min-height'))).toBe(true);
    expect(found.some((f) => f.includes('colour #123456'))).toBe(true);
    expect(found.some((f) => f.includes('font-size 10px'))).toBe(true);
    expect(found.some((f) => f.includes('position fixed'))).toBe(true);
    expect(found.some((f) => f.includes('width 400px'))).toBe(true);
  });
});
