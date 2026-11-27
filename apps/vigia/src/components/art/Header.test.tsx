// The header of the four tabs (Req 22.2 as amended 2026-11-27, design D26.2): Mira's row of the
// mark, "Vigia" and the "Fire? Emergency" pill, a row of the page, never a layer; the pill opens
// the Emergency tab and dials nothing (Req 14.5).

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FIRE_PILL_TEXT, HEADER, Header } from './Header';

describe('the header (Req 22.2, D26.2)', () => {
  it('shows the mark, "Vigia" and the pill, the mark hidden from assistive technology', () => {
    const calls: string[] = [];
    const { getByTestId, getByRole, container } = render(
      <Header onEmergency={() => void calls.push('emergency')} />,
    );
    const header = getByTestId('app-header');
    expect(header.tagName).toBe('HEADER');
    expect(header.textContent).toBe(`Vigia${FIRE_PILL_TEXT}`);
    expect(container.querySelector('[data-part="app-mark"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    fireEvent.click(getByRole('button', { name: FIRE_PILL_TEXT }));
    expect(calls).toEqual(['emergency']);
  });

  it('names no emergency number and has no link that dials (Req 14.5)', () => {
    const { container } = render(<Header onEmergency={() => undefined} />);
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.textContent).not.toMatch(/\b(112|911|999|000)\b/);
  });

  it('is a row of the page: in the flow, on the page’s colour, the pill an outline of 44', () => {
    const { getByTestId, getByRole } = render(<Header onEmergency={() => undefined} />);
    const header = getByTestId('app-header');
    expect(header.style.position).toBe('');
    expect(header.style.background).toBe('var(--alidade-bg)');
    expect(header.style.minHeight).toBe(`${HEADER.rowPx}px`);
    const pill = getByRole('button', { name: FIRE_PILL_TEXT });
    expect(pill.style.minHeight).toBe('44px');
    expect(pill.style.border).toBe('1.5px solid var(--alidade-ruleStrong)');
  });
});
