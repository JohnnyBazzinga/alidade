// The simulation block at the top of every screen is compact (task group 13, A): the banner in at
// most two lines at 320 CSS px, the bar in one row (the scene chooser, the sight-time chooser and a
// short Next), and the two together no taller than 140 CSS px at 390 wide. jsdom does no layout, so
// the heights are summed from what the components set (the arithmetic of Vigia's
// `sight-first-screen.test.tsx`): padding, borders, the lines a text wraps to at 0.63 em a
// character, and the controls' minimum heights. The real pixels are the lead's check in a browser.

import { describe, expect, it } from 'vitest';
import { mountSimulation } from '../../test-support/simulation-driver';
import { wrappedLines } from '../../test-support/wrapped-lines';

const px = (value: string): number => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const vertical = (el: HTMLElement): number =>
  px(el.style.paddingTop) +
  px(el.style.paddingBottom) +
  px(el.style.borderTopWidth) +
  px(el.style.borderBottomWidth);

/** The banner's and the bar's heights at `widthPx`. */
export function blockHeights(m: ReturnType<typeof mountSimulation>, widthPx: number) {
  const banner = m.getByTestId('simulation-banner');
  const font = px(banner.style.fontSize);
  const bannerLines = wrappedLines(
    banner.textContent ?? '',
    widthPx - px(banner.style.paddingLeft) * 2,
    font,
  );
  const bannerPx = bannerLines * font * Number(banner.style.lineHeight) + vertical(banner);
  const bar = m.getByTestId('phone-bar');
  const row = bar.querySelector<HTMLElement>('[data-part="bar-row"]');
  if (row === null) throw new Error('no bar row');
  const controls = [...row.querySelectorAll<HTMLElement>('select, button')];
  const barPx = Math.max(...controls.map((c) => px(c.style.minHeight))) + vertical(bar);
  return { bannerLines, bannerPx, barPx, total: bannerPx + barPx };
}

describe('the simulation block (task group 13, A)', () => {
  it('is at most 140 CSS px tall at 390 wide, banner and bar together', () => {
    const m = mountSimulation();
    const h = blockHeights(m, 390);
    expect(h.total, JSON.stringify(h)).toBeLessThanOrEqual(140);
  });

  it('has a banner of at most two lines at 320 wide, and the bar still fits 140 CSS px there', () => {
    const m = mountSimulation();
    const h = blockHeights(m, 320);
    expect(h.bannerLines).toBeLessThanOrEqual(2);
    expect(h.total, JSON.stringify(h)).toBeLessThanOrEqual(140);
  });

  it('has the scene chooser, the sight-time chooser and Next in one row that does not wrap', () => {
    const m = mountSimulation();
    const row = m.getByTestId('phone-bar').querySelector<HTMLElement>('[data-part="bar-row"]');
    expect(row?.style.flexWrap).toBe('nowrap');
    expect(row?.querySelectorAll('select')).toHaveLength(2);
    const next = m.q.getByRole('button', { name: 'Next sight time' });
    expect(row?.contains(next)).toBe(true);
    expect(next.textContent).toBe('Next');
    for (const select of row?.querySelectorAll('select') ?? []) {
      expect(select.style.minWidth).toBe('0px');
    }
  });

  it('keeps the still-Sun note and the full Sight time out of the bar, in the Sight screen’s scrolling part', async () => {
    const m = mountSimulation();
    expect(m.text('phone-bar')).not.toContain('stands still');
    await m.click('Sight the Sun');
    const note = m.q.getByTestId('sight-time-note');
    expect(note.textContent).toContain(
      'The simulated Sun stands still: a sight taken a minute late is up to 15′ off.',
    );
    expect(note.textContent).toContain('Sight time 1 of 3: 11:40 UTC, 21 Dec 2026 (simulated)');
    expect(m.q.getByTestId('phone-bar').contains(note)).toBe(false);
  });

  it('the arithmetic bites: the block as it was (three-line banner, stacked bar) is over 140 px', () => {
    const m = mountSimulation();
    const h = blockHeights(m, 390);
    const old =
      wrappedLines(
        'Simulation: the Sun, the sights and the places on this page are made up. Nothing here is a real position.',
        390 - 16,
        16,
      ) *
        16 *
        1.4 +
      16;
    expect(old + 5 * 48).toBeGreaterThan(140);
    expect(h.total).toBeLessThanOrEqual(140);
  });
});
