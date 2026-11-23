// The tab labels fit the narrowest screen (task 21.1; design §9 and its note of 2026-11-20). At
// 390 CSS px two labels broke inside the word ("Sighting / s", "Emergenc / y"). jsdom does no
// layout, so the width is computed: the labels are in the body stack (since 2026-11-21), and 0.63 em, measured for monospace, is an upper bound for it, so a label is its
// characters times the advance of one, about 0.6 of the font size; the test uses 0.63, a margin of
// 5 % for the widest face of the stack. The font size, the padding and the way the tabs share the
// bar are read from the styles the component sets, so that a change to any of them is measured.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeObserver } from '../test-support/fake-observe';
import { TabBar, TABS } from './TabBar';

/** The narrowest width the app supports (skeleton-ui Req 13.13). */
const NARROWEST_PX = 320;
/** The advance of one monospace character, in ems: 0.6 measured, 0.63 with the margin. */
const ADVANCE_EM = 0.63;
const MIN_TOUCH_PX = 48;

const px = (value: string) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** The width a tab needs, in CSS px: its label (or its badge, if wider) and its padding. */
function neededPx(tab: HTMLElement): number {
  const fontPx = px(tab.style.fontSize);
  const label = tab.querySelector<HTMLElement>('[data-part="tab-label"]');
  const badge = tab.querySelector<HTMLElement>('[data-testid="inbox-badge"]');
  const labelPx = (label?.textContent ?? '').length * ADVANCE_EM * fontPx;
  const badgePx =
    badge === null
      ? 0
      : (badge.textContent ?? '').length * ADVANCE_EM * fontPx +
        px(badge.style.paddingLeft) +
        px(badge.style.paddingRight);
  // A badge beside the label adds to it; a badge under it only needs to fit.
  const column = tab.style.flexDirection === 'column';
  const contentPx = column ? Math.max(labelPx, badgePx) : labelPx + badgePx;
  return Math.max(contentPx + px(tab.style.paddingLeft) + px(tab.style.paddingRight), MIN_TOUCH_PX);
}

/** Whether every tab fits a bar `barPx` wide, by the way the tabs share it. */
function fits(tabs: readonly HTMLElement[], barPx: number): { ok: boolean; detail: string } {
  const basis = tabs[0]?.style.flexBasis ?? '';
  const needs = tabs.map(neededPx);
  if (basis === '0px' || basis === '0%' || basis === '0') {
    const each = barPx / tabs.length;
    return { ok: needs.every((n) => n <= each), detail: `equal ${each}: ${needs.join(', ')}` };
  }
  const sum = needs.reduce((a, b) => a + b, 0);
  return { ok: sum <= barPx, detail: `sum ${sum.toFixed(1)} of ${barPx}: ${needs.join(', ')}` };
}

function tabsOf(inboxCount: number): HTMLElement[] {
  const { getAllByRole, unmount } = render(
    <TabBar current="smoke" inboxCount={inboxCount} onSelect={() => undefined} />,
  );
  const tabs = getAllByRole('tab');
  // Styles are read before unmounting; the elements keep them.
  unmount();
  return tabs;
}

describe('the tab labels at 320 CSS px (task 21.1)', () => {
  it('fit whole, with no Inbox badge and with a badge of two and of three digits', () => {
    for (const count of [0, 7, 42, 999]) {
      const result = fits(tabsOf(count), NARROWEST_PX);
      expect(result.ok, `${count} waiting: ${result.detail}`).toBe(true);
    }
  });

  it('never break inside a word: every label is kept on one line', () => {
    for (const tab of tabsOf(3)) {
      const label = tab.querySelector<HTMLElement>('[data-part="tab-label"]');
      expect(label?.style.whiteSpace).toBe('nowrap');
      expect(tab.style.overflowWrap).not.toBe('anywhere');
      expect(tab.style.wordBreak).not.toBe('break-all');
    }
  });

  it('are at least 16 px, the size of the rest of the text (design §9)', () => {
    for (const tab of tabsOf(0)) expect(px(tab.style.fontSize)).toBeGreaterThanOrEqual(16);
  });

  it('say nothing that suggests the app calls or alerts anyone', () => {
    for (const { label } of TABS) {
      expect(label).not.toMatch(/call|dial|sos|phone|notify|alert|send|report|help/i);
    }
  });

  it('the arithmetic bites: the bar as it was (equal shares, padding 4 px) does not fit at 320 px', () => {
    const tabs = tabsOf(0).map((t) => {
      const copy = t.cloneNode(true) as HTMLElement;
      copy.style.flexBasis = '0px';
      return copy;
    });
    expect(fits(tabs, NARROWEST_PX).ok).toBe(false);
  });
});

// Task 24.3 (2026-11-22, the lead's new look; Req 22.5): icons above the labels, the active tab in
// `tabActive` with a 4 px indicator at its top, the labels at 20 from a bar width of 360 and at 16
// below it, by the width the observer gives; the badge under the Smoke label; the safe area.
describe('the tab bar in the Field look (Req 22.5)', () => {
  const bar = (widthPx: number, current: 'smoke' | 'map' = 'smoke', inboxCount = 0) => {
    const observer = fakeObserver({ widthPx, heightPx: 64 });
    const utils = render(
      <TabBar
        current={current}
        inboxCount={inboxCount}
        onSelect={() => undefined}
        observe={observer.observe}
      />,
    );
    return { ...utils, tabs: utils.getAllByRole('tab') };
  };

  it('a cloud, a list, a map and a siren above the labels, each hidden from assistive technology', () => {
    const { tabs } = bar(390);
    expect(tabs.map((t) => t.querySelector('svg')?.getAttribute('data-icon'))).toEqual([
      'smoke',
      'sightings',
      'map',
      'siren',
    ]);
    for (const t of tabs) {
      const svg = t.querySelector('svg') as SVGElement;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      // Above the label: the icon comes first in a column.
      expect(t.style.flexDirection).toBe('column');
      expect(t.firstElementChild).toBe(svg);
    }
  });

  it('the active tab: tabActive, a 4 px indicator at its top, aria-selected; the others tabInk', () => {
    const { tabs } = bar(390, 'map');
    const [smoke, , map] = tabs;
    expect(map?.getAttribute('aria-selected')).toBe('true');
    expect(map?.style.color).toBe('var(--alidade-tabActive)');
    expect(map?.style.borderTop).toBe('4px solid var(--alidade-tabActive)');
    expect(smoke?.style.color).toBe('var(--alidade-tabInk)');
    expect(smoke?.style.borderTop).toBe('4px solid var(--alidade-tabBar)');
  });

  it('the labels at 20 from a bar of 360, at 16 below it, and they fit both ways', () => {
    for (const [widthPx, size] of [
      [320, 16],
      [359, 16],
      [360, 20],
      [375, 20],
      [390, 20],
    ] as const) {
      for (const count of [0, 12, 100]) {
        const { tabs, unmount } = bar(widthPx, 'smoke', count);
        for (const t of tabs) expect(t.style.fontSize, `${widthPx}`).toBe(`${size}px`);
        const result = fits(tabs, widthPx);
        expect(result.ok, `${widthPx} ${count}: ${result.detail}`).toBe(true);
        unmount();
      }
    }
  });

  it('the bar: tabBar, the safe area under it, the badge under the Smoke label in the primary pair', () => {
    const { getByTestId, tabs } = bar(390, 'smoke', 3);
    const nav = getByTestId('tab-bar');
    expect(nav.style.background).toBe('var(--alidade-tabBar)');
    expect(nav.style.paddingBottom).toBe('calc(0px + env(safe-area-inset-bottom))');
    const badge = getByTestId('inbox-badge');
    expect(tabs[0]?.contains(badge)).toBe(true);
    expect(badge.style.background).toBe('var(--alidade-primary)');
    expect(badge.style.color).toBe('var(--alidade-primaryInk)');
  });
});
