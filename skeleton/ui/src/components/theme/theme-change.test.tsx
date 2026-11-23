// A part that reads the active theme is drawn again when another theme is applied (Req 22.4, task
// 35.3), and the map needs no redraw because it uses only constant roles and its own constants.

import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildMapStyle, type TileSource } from '../../math/map/map-style';
import { applyTheme, activeTheme, onThemeChange, useActiveTheme } from './apply-theme';
import { CONSTANT_ROLES } from './roles';
import { field, fieldNight, instrument } from './themes';

function Probe() {
  const theme = useActiveTheme();
  return <p data-testid="probe">{`${theme.id}:${theme.colours.ink}`}</p>;
}

describe('onThemeChange and useActiveTheme (Req 22.4)', () => {
  it('notifies its subscribers with the theme on every applyTheme, until they unsubscribe', () => {
    const root = document.createElement('div');
    const seen: string[] = [];
    const stop = onThemeChange((t) => void seen.push(t.id));
    applyTheme(root, field);
    applyTheme(root, fieldNight);
    stop();
    applyTheme(root, instrument);
    expect(seen).toEqual(['field', 'field-night']);
  });

  it('a part that reads activeTheme() is drawn again with the new values while it is shown', () => {
    const root = document.createElement('div');
    applyTheme(root, field);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe(`field:${field.colours.ink}`);
    act(() => applyTheme(root, fieldNight));
    expect(getByTestId('probe').textContent).toBe(`field-night:${fieldNight.colours.ink}`);
    act(() => applyTheme(root, instrument));
    expect(getByTestId('probe').textContent).toBe(`instrument:${instrument.colours.ink}`);
    expect(activeTheme()).toBe(instrument);
  });
});

const TILES: TileSource = {
  tileUrlTemplates: ['https://tiles.example.test/{z}/{x}/{y}.png'],
  attribution: 'x',
  minZoom: 0,
  maxZoom: 18,
  tileSizePx: 256,
};

/** Every colour string in a style: a `#…` or a `var(` or `rgb…`. */
function colours(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/^#|^var\(|^rgb|^hsl/.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) colours(v, out);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) colours(v, out);
  }
  return out;
}

describe('the map’s paints (Req 22.4)', () => {
  it('use only the constant roles and the map’s own constants, in every theme, so no redraw is needed', () => {
    const allowed = new Set<string>([
      ...CONSTANT_ROLES.map((r) => instrument.colours[r].toUpperCase()),
      '#DADADA',
    ]);
    for (const theme of [instrument, field, fieldNight]) {
      for (const role of CONSTANT_ROLES) expect(theme.colours[role]).toBe(instrument.colours[role]);
    }
    for (const style of [buildMapStyle(null), buildMapStyle(TILES)]) {
      const found = colours(style);
      expect(found.length).toBeGreaterThan(0);
      for (const c of found) expect(allowed.has(c.toUpperCase()), c).toBe(true);
    }
  });
});
