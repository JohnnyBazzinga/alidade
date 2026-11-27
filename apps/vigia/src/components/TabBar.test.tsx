// The tab labels fit the narrowest screen (task 21.1; design §9; Req 22.5 as amended 2026-11-27).
// Mira's bar is a dark pill 16 from each side, its four tabs in equal quarters, the labels at 11.
// jsdom does no layout, so the width is computed: a label is its characters times 0.63 em (an
// upper bound for the body font, measured for monospace), plus the tab's padding; it must fit a
// quarter of the bar.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TAB_BAR, TAB_LABEL_PX, TabBar, TABS } from './TabBar';

/** The narrowest width the app supports (skeleton-ui Req 13.13). */
const NARROWEST_PX = 320;
/** The advance of one monospace character, in ems: 0.6 measured, 0.63 with the margin. */
const ADVANCE_EM = 0.63;
const MIN_TOUCH_PX = 48;

const px = (value: string) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** The width a tab's label needs, in CSS px, with the tab's padding. */
function neededPx(tab: HTMLElement): number {
  const fontPx = px(tab.style.fontSize);
  const label = tab.querySelector<HTMLElement>('[data-part="tab-label"]');
  const [, side] = tab.style.padding.split(' ');
  return (label?.textContent ?? '').length * ADVANCE_EM * fontPx + 2 * px(side ?? '0');
}

/** A quarter of the bar at a screen width: the bar is the width less its two side margins. */
const quarterPx = (screenPx: number) => (screenPx - 2 * TAB_BAR.sidePx) / 4;

function tabsOf(inboxCount: number, current: 'smoke' | 'map' = 'smoke') {
  const utils = render(
    <TabBar current={current} inboxCount={inboxCount} onSelect={() => undefined} />,
  );
  return { ...utils, tabs: utils.getAllByRole('tab') };
}

describe('the tab labels at 320 CSS px (task 21.1)', () => {
  it('fit whole in a quarter of the bar, with no Inbox badge and with one of three digits', () => {
    for (const count of [0, 7, 999]) {
      const { tabs, unmount } = tabsOf(count);
      for (const t of tabs) {
        expect(neededPx(t), `${count} ${t.textContent}`).toBeLessThanOrEqual(
          quarterPx(NARROWEST_PX),
        );
      }
      unmount();
    }
  });

  it('never break inside a word: every label is kept on one line', () => {
    const { tabs } = tabsOf(3);
    for (const tab of tabs) {
      const label = tab.querySelector<HTMLElement>('[data-part="tab-label"]');
      expect(label?.style.whiteSpace).toBe('nowrap');
      expect(tab.style.overflowWrap).not.toBe('anywhere');
    }
  });

  it('are at Mira’s 11, and every tab is at least the touch target tall', () => {
    const { tabs } = tabsOf(0);
    for (const tab of tabs) {
      expect(tab.style.fontSize).toBe(`${TAB_LABEL_PX}px`);
      expect(px(tab.style.minHeight)).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    }
  });

  it('say nothing that suggests the app calls or alerts anyone', () => {
    for (const { label } of TABS) {
      expect(label).not.toMatch(/call|dial|sos|phone|notify|alert|send|report|help/i);
    }
  });

  it('the arithmetic bites: at 20, the size of the Field look, "Emergency" does not fit a quarter', () => {
    const { tabs } = tabsOf(0);
    const emergency = tabs[3]?.cloneNode(true) as HTMLElement;
    emergency.style.fontSize = '20px';
    expect(neededPx(emergency)).toBeGreaterThan(quarterPx(NARROWEST_PX));
  });
});

// Mira's bar (Req 22.5, D26.2): a dark pill that floats, the icons above the labels, the current
// tab in the yellow, the badge beside the Smoke icon.
describe('the tab bar in the Mira look (Req 22.5)', () => {
  it('a cloud, a list, a map and a siren above the labels, each hidden from assistive technology', () => {
    const { tabs } = tabsOf(0);
    expect(tabs.map((t) => t.querySelector('svg')?.getAttribute('data-icon'))).toEqual([
      'smoke',
      'sightings',
      'map',
      'siren',
    ]);
    for (const t of tabs) {
      const svg = t.querySelector('svg') as SVGElement;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(t.style.flexDirection).toBe('column');
      expect(t.firstElementChild?.contains(svg)).toBe(true);
    }
  });

  it('the active tab: tabActive, semibold, aria-selected; the others tabInk', () => {
    const { tabs } = tabsOf(0, 'map');
    const [smoke, , map] = tabs;
    expect(map?.getAttribute('aria-selected')).toBe('true');
    expect(map?.style.color).toBe('var(--alidade-tabActive)');
    expect(map?.style.fontWeight).toBe('600');
    expect(smoke?.style.color).toBe('var(--alidade-tabInk)');
  });

  it('the bar: a pill of tabBar, 16 from the sides, the safe area under it, the badge in the primary pair', () => {
    const { getByTestId, tabs } = tabsOf(3);
    const nav = getByTestId('tab-bar');
    expect(nav.style.background).toBe('var(--alidade-tabBar)');
    expect(nav.style.borderRadius).toBe(`${TAB_BAR.heightPx / 2}px`);
    expect(nav.style.margin).toBe(
      `${TAB_BAR.topPx}px ${TAB_BAR.sidePx}px calc(${TAB_BAR.bottomPx}px + env(safe-area-inset-bottom))`,
    );
    const badge = getByTestId('inbox-badge');
    expect(tabs[0]?.contains(badge)).toBe(true);
    expect(badge.style.background).toBe('var(--alidade-primary)');
    expect(badge.style.color).toBe('var(--alidade-primaryInk)');
  });
});
