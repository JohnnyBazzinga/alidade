// The header (Req 22.2, design D25.4, task 24.2): the full header at most 112 high, the compact at
// most 64, by their styles (jsdom does no layout: the lines are counted at 0.63 em, as the docked
// budget counts them); decorative art; a row of the page; text on the header's colour.

import { BODY_FONT_STACK } from '@alidade/ui';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TAGLINE_TEXT } from '../../math/texts';
import { HEADER, Header } from './Header';
import { LANDSCAPE_HEIGHT_PX } from './Landscape';

const ADVANCE_EM = 0.63;
function lines(text: string, widthPx: number, fontPx: number): number {
  const perLine = Math.max(1, Math.floor(widthPx / (ADVANCE_EM * fontPx)));
  let count = 1;
  let used = 0;
  for (const word of text.trim().split(/\s+/)) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= perLine) used = need;
    else {
      count += 1;
      used = word.length;
    }
  }
  return count;
}

/** The full header's height at a width, from its styles. */
function fullHeight(widthPx: number): number {
  const h = HEADER.full;
  const inner = widthPx - 32;
  return (
    h.padTopPx +
    Math.max(h.markPx, h.titlePx * 1.2) +
    h.taglineGapPx +
    lines(TAGLINE_TEXT, inner, h.taglinePx) * h.taglinePx * 1.25 +
    h.landscapeGapPx +
    LANDSCAPE_HEIGHT_PX.full
  );
}

describe('the full header (Req 22.2)', () => {
  it('shows the mark, "Vigia" and the tagline; the art is hidden from assistive technology', () => {
    const { getByTestId, getByRole } = render(<Header variant="full" />);
    const header = getByTestId('app-header');
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Vigia');
    expect(header.querySelector('[data-part="tagline"]')?.textContent).toBe(TAGLINE_TEXT);
    const art = [...header.querySelectorAll('svg')];
    expect(art.length).toBeGreaterThanOrEqual(2);
    for (const svg of art) expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(header.style.fontFamily).toBe(BODY_FONT_STACK);
  });

  it('draws the plume of smoke at the end of the title row, in the flow, after the title (Codex, 2026-11-23)', () => {
    const { getByTestId } = render(<Header variant="full" />);
    const row = getByTestId('app-header').querySelector('[data-part="header-row"]') as HTMLElement;
    const plume = row.querySelector<SVGElement>('[data-art="header-plume"]') as SVGElement;
    expect(plume.getAttribute('aria-hidden')).toBe('true');
    expect(row.lastElementChild).toBe(plume);
    expect(plume.style.marginLeft).toBe('auto');
    expect(Number(plume.getAttribute('height'))).toBeLessThanOrEqual(HEADER.full.markPx);
  });

  it('is at most 112 high at the phone widths, by its styles', () => {
    for (const widthPx of [360, 375, 390, 430]) {
      expect(fullHeight(widthPx), `${widthPx}`).toBeLessThanOrEqual(HEADER.maxPx.full);
    }
    expect(HEADER.maxPx.full).toBe(112);
  });

  it('its text sits on the header’s colour, above the landscape, in headerInk and headerDim', () => {
    const { getByTestId } = render(<Header variant="full" />);
    const header = getByTestId('app-header');
    expect(header.style.background).toBe('var(--alidade-header-fill)');
    expect(header.style.color).toBe('var(--alidade-headerInk)');
    expect(header.querySelector<HTMLElement>('h1')?.style.color).toBe('var(--alidade-headerInk)');
    expect(header.querySelector<HTMLElement>('[data-part="tagline"]')?.style.color).toBe(
      'var(--alidade-headerDim)',
    );
    // The landscape follows the text: nothing of the art is under a word.
    const landscape = header.querySelector('[data-art="landscape"]') as Element;
    const tagline = header.querySelector('[data-part="tagline"]') as Element;
    expect(
      tagline.compareDocumentPosition(landscape) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('ends in the page: the last ridge is the page’s colour', () => {
    for (const variant of ['full', 'compact'] as const) {
      const props =
        variant === 'full' ? ({ variant } as const) : ({ variant, title: 'Map' } as const);
      const { container, unmount } = render(<Header {...props} />);
      const ridges = container.querySelectorAll<SVGElement>('[data-art="last-ridge"]');
      expect(ridges).toHaveLength(1);
      const svg = container.querySelector('[data-art="landscape"]') as Element;
      expect(svg.lastElementChild).toBe(ridges[0]);
      expect(ridges[0]?.style.fill).toBe('var(--alidade-bg)');
      unmount();
    }
  });

  it('is a row of the page: nothing in it is out of the flow', () => {
    const { getByTestId } = render(<Header variant="full" />);
    const header = getByTestId('app-header');
    for (const el of [header, ...header.querySelectorAll<HTMLElement>('*')]) {
      expect(['', 'static']).toContain(el.style.position);
    }
  });
});

describe('the compact header (Req 22.2)', () => {
  it('shows the mark and its title, at most 64 high for a title of one line', () => {
    const { getByTestId, getByRole } = render(<Header variant="compact" title="Sightings" />);
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Sightings');
    expect(getByTestId('app-header').dataset.variant).toBe('compact');
    const h = HEADER.compact;
    const height =
      h.padTopPx +
      Math.max(h.markPx, h.titlePx * 1.25) +
      h.landscapeGapPx +
      LANDSCAPE_HEIGHT_PX.compact;
    expect(height).toBeLessThanOrEqual(HEADER.maxPx.compact);
    expect(HEADER.maxPx.compact).toBe(64);
    // The tab labels and the titles of the views of task group 24 are one line at 375.
    for (const title of ['Smoke', 'Sightings', 'Map', 'Emergency', 'New sighting', 'QR code']) {
      expect(lines(title, 375 - 32 - h.markPx - 10, h.titlePx), title).toBe(1);
    }
  });
});
