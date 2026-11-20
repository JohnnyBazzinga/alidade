// Every screen at 320 to 430 CSS pixels (skeleton-ui Req 13.13, 13.14, 18.11; Vigia task 13.10).
// jsdom does no layout, so the check reads the inline styles the components set: every control a
// touch target of at least 48 px (the primary one 64 px), text of at least 16 px, every colour from
// UI's `COLOURS`, nothing in a fixed, absolute or sticky layer, and no width wider than 320 px.

import { CATALOGUE_ORIGIN, COLOURS, SIZES } from '@alidade/ui';
import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { noiseFreeSights } from '../test-support/noise-free';
import { testEnvironment } from '../test-support/test-environment';
import { App } from '../App';
import { createNoniusStore } from './store';

const NARROWEST_PX = 320;
const ALLOWED_COLOURS = new Set(
  [...Object.values(COLOURS), '#000000', '#FFFFFF'].map((c) => c.toLowerCase()),
);
const D = DEG_TO_RAD;
const params = defaultParameters();
const T = [
  Date.UTC(2026, 11, 21, 11, 40),
  Date.UTC(2026, 11, 21, 14, 40),
  Date.UTC(2026, 11, 21, 17, 40),
];

function hexOf(r: string, g: string, b: string): string {
  return `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
}

/** What breaks the look in the rendered tree, one line per fault. */
export function faults(root: HTMLElement): string[] {
  const found: string[] = [];
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    const style = element.style;
    const where = `${element.tagName.toLowerCase()}${element.dataset.testid ? `#${element.dataset.testid}` : ''} "${(element.textContent ?? '').slice(0, 30)}"`;
    if (['fixed', 'absolute', 'sticky'].includes(style.position)) {
      if (element.closest('[data-part="image-box"]') === null)
        found.push(`${where}: position ${style.position}`);
    }
    for (const property of ['width', 'minWidth'] as const) {
      const value = style[property];
      if (value.endsWith('px') && Number.parseFloat(value) > NARROWEST_PX)
        found.push(`${where}: ${property} ${value}`);
    }
    const attribute = element.getAttribute('style') ?? '';
    for (const m of attribute.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)) {
      const hex = hexOf(m[1] ?? '0', m[2] ?? '0', m[3] ?? '0');
      if (!ALLOWED_COLOURS.has(hex)) found.push(`${where}: colour ${hex}`);
    }
    if (style.fontSize !== '' && Number.parseFloat(style.fontSize) < 16)
      found.push(`${where}: font-size ${style.fontSize}`);
    if (element.tagName === 'BUTTON' && element.getAttribute('role') !== 'tab') {
      const minHeight = Number.parseFloat(style.minHeight);
      const least = element.dataset.primary === 'true' ? SIZES.primaryPx : SIZES.touchPx;
      if (!(minHeight >= least)) found.push(`${where}: min-height ${style.minHeight}`);
    }
  }
  return found;
}

function app(withSights: boolean, mode: 'device' | 'simulation' = 'device') {
  const t = testEnvironment({ mode });
  const store = createNoniusStore(t.environment);
  if (withSights) {
    for (const s of noiseFreeSights(CATALOGUE_ORIGIN, T, -3.3 * D, true, params)) {
      store.dispatch({ kind: 'capture', sight: s });
    }
  }
  const utils = render(<App environment={t.environment} store={store} />);
  return { ...utils, q: within(utils.container) };
}

describe('the look of every screen', () => {
  for (const withSights of [false, true]) {
    for (const mode of ['device', 'simulation'] as const) {
      it(`has no fault: ${withSights ? 'with three sights' : 'empty'}, ${mode}`, () => {
        const m = app(withSights, mode);
        expect(faults(m.container)).toEqual([]);
        fireEvent.click(m.q.getByRole('tab', { name: 'Sights' }));
        expect(faults(m.container)).toEqual([]);
        fireEvent.click(m.q.getByRole('tab', { name: 'Map' }));
        expect(faults(m.container)).toEqual([]);
        fireEvent.click(m.q.getByRole('tab', { name: 'Fix' }));
        fireEvent.click(m.q.getByRole('button', { name: 'How it works' }));
        expect(faults(m.container)).toEqual([]);
        fireEvent.click(m.q.getByRole('button', { name: 'Back' }));
        fireEvent.click(m.q.getByRole('button', { name: 'Measure the index error' }));
        expect(faults(m.container)).toEqual([]);
        fireEvent.click(m.q.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(m.q.getByRole('button', { name: 'Sight the Sun' }));
        expect(faults(m.container)).toEqual([]);
      });
    }
  }

  it('the check bites: a fixed layer and a small control are found', () => {
    const { container } = render(
      <div style={{ position: 'fixed' }}>
        <button type="button" style={{ minHeight: 20 }}>
          x
        </button>
      </div>,
    );
    expect(faults(container)).toHaveLength(2);
  });
});
