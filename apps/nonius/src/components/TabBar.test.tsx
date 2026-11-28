// The tab labels fit the narrowest screen (Vigia task 21.1's lesson; design §9). jsdom does no
// layout, so the width is computed: the labels are in the body stack (since 2026-11-21), and 0.63 em, measured for monospace, is an upper bound for it, a label is its
// characters times 0.63 of the font size (0.6 measured, 5 % margin), and the font size, padding
// and the way the tabs share the bar are read from the styles the component sets.

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabBar, TABS } from './TabBar';

const NARROWEST_PX = 320;
const ADVANCE_EM = 0.63;
/** Mira's least touch target and its tab labels' size (the author's design, Nonius Req 16.2). */
const MIN_TOUCH_PX = 44;
const MIRA_LABEL_PX = 11;
const px = (value: string) =>
  Number.isFinite(Number.parseFloat(value)) ? Number.parseFloat(value) : 0;

function neededPx(tab: HTMLElement): number {
  const label = tab.querySelector<HTMLElement>('[data-part="tab-label"]');
  const labelPx = (label?.textContent ?? '').length * ADVANCE_EM * px(tab.style.fontSize);
  return Math.max(labelPx + px(tab.style.paddingLeft) + px(tab.style.paddingRight), MIN_TOUCH_PX);
}

/** Mira's bar is a grid of equal columns inside margins of 16 on each side. */
function fits(tabs: readonly HTMLElement[], barPx: number, grid = false): boolean {
  const basis = tabs[0]?.style.flexBasis ?? '';
  const needs = tabs.map(neededPx);
  if (grid) return needs.every((n) => n <= (barPx - 32) / tabs.length);
  if (basis === '0px' || basis === '0%' || basis === '0') {
    return needs.every((n) => n <= barPx / tabs.length);
  }
  return needs.reduce((a, b) => a + b, 0) <= barPx;
}

function tabs(): HTMLElement[] {
  const { getAllByRole, unmount } = render(<TabBar current="fix" onSelect={() => undefined} />);
  const found = getAllByRole('tab');
  unmount();
  return found;
}

describe('the tab labels at 320 CSS px', () => {
  it('are Fix, Sights and Map, and fit whole', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Fix', 'Sights', 'Map']);
    expect(fits(tabs(), NARROWEST_PX, true)).toBe(true);
  });

  it('never break inside a word and are at least Mira\u2019s 11 px', () => {
    for (const tab of tabs()) {
      const label = tab.querySelector<HTMLElement>('[data-part="tab-label"]');
      expect(label?.style.whiteSpace).toBe('nowrap');
      expect(px(tab.style.fontSize)).toBeGreaterThanOrEqual(MIRA_LABEL_PX);
    }
  });

  it('the arithmetic bites: a label of 18 characters at 11 px with the bar’s padding does not fit in a third of the bar at 320 px', () => {
    const copy = tabs().map((t) => {
      const c = t.cloneNode(true) as HTMLElement;
      const label = c.querySelector<HTMLElement>('[data-part="tab-label"]');
      if (label !== null) label.textContent = 'Measurements taken';
      return c;
    });
    expect(fits(copy, NARROWEST_PX, true)).toBe(false);
  });

  it('selects the tab that is pressed and marks the current one', () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<TabBar current="sights" onSelect={onSelect} />);
    expect(getByRole('tab', { name: 'Sights' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(getByRole('tab', { name: 'Map' }));
    expect(onSelect).toHaveBeenCalledWith('map');
  });
});
