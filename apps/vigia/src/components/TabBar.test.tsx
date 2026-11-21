// The tab labels fit the narrowest screen (task 21.1; design §9 and its note of 2026-11-20). At
// 390 CSS px two labels broke inside the word ("Sighting / s", "Emergenc / y"). jsdom does no
// layout, so the width is computed: the labels are in the body stack (since 2026-11-21), and 0.63 em, measured for monospace, is an upper bound for it, so a label is its
// characters times the advance of one, about 0.6 of the font size; the test uses 0.63, a margin of
// 5 % for the widest face of the stack. The font size, the padding and the way the tabs share the
// bar are read from the styles the component sets, so that a change to any of them is measured.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
