import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LiveReadout } from '../math/session/session';
import { Readout } from './Readout';

const BASE: LiveReadout = {
  timeUtcMs: 1,
  sampleCount: 12,
  newestSampleUtcMs: 1,
  azimuth: { ok: true, value: { northReference: 'true', azimuthRad: Math.PI / 2 } },
  apparentAltitudeRad: { ok: true, value: (12.34 * Math.PI) / 180 },
  azimuthSpreadRad: (0.25 * Math.PI) / 180,
  altitudeStdDevRad: 0.001,
  steadiness: 'steady',
  stale: false,
};
const part = (c: HTMLElement, name: string) =>
  c.querySelector(`[data-part="${name}"]`)?.textContent;

describe('Readout (Req 9.1, 13.4)', () => {
  it('shows the azimuth with its North reference and Spread, the altitude and the steadiness', () => {
    const { getByTestId } = render(<Readout readout={BASE} />);
    const el = getByTestId('readout');
    expect(part(el, 'azimuth')).toBe('90.0° true');
    expect(part(el, 'altitude')).toBe('12.3° altitude');
    expect(part(el, 'steadiness')).toBe(
      'Steady hand: shake ±0.25° in azimuth, ±0.06° in altitude, 12 readings',
    );
  });

  it('never shows a bare ± beside the azimuth or the altitude (Req 13.4)', () => {
    const { getByTestId } = render(<Readout readout={BASE} />);
    const el = getByTestId('readout');
    expect(part(el, 'azimuth')).not.toContain('±');
    expect(part(el, 'altitude')).not.toContain('±');
    // Every ± on the readout is on the line labelled as the hand's shake.
    for (const p of el.querySelectorAll('p')) {
      if (p.textContent?.includes('±')) expect(p.textContent).toMatch(/shake ±/);
    }
  });

  it('says the shake is not measured when there is no Spread', () => {
    const r = {
      ...BASE,
      azimuthSpreadRad: null,
      altitudeStdDevRad: null,
      steadiness: 'unsteady' as const,
    };
    const { getByTestId } = render(<Readout readout={r} />);
    expect(part(getByTestId('readout'), 'steadiness')).toBe(
      'Unsteady hand: shake not measured, 12 readings',
    );
  });

  for (const northReference of ['true', 'magnetic', 'relative'] as const) {
    it(`follows a ${northReference} azimuth with the word ${northReference}`, () => {
      const r = {
        ...BASE,
        azimuth: { ok: true as const, value: { northReference, azimuthRad: 1 } },
      };
      const { getByTestId } = render(<Readout readout={r} />);
      expect(part(getByTestId('readout'), 'azimuth')).toMatch(
        new RegExp(`^\\d+\\.\\d° ${northReference}$`),
      );
    });
  }

  it('uses tabular digits and a font of at least 20 CSS px', () => {
    const { getByTestId } = render(<Readout readout={BASE} />);
    const el = getByTestId('readout');
    expect(el.style.fontVariantNumeric).toBe('tabular-nums');
    expect(Number.parseFloat(el.style.fontSize)).toBeGreaterThanOrEqual(20);
  });

  it('says there are no readings, with no zeros, for a null readout', () => {
    const { getByTestId } = render(<Readout readout={null} />);
    expect(getByTestId('readout').textContent).toBe('No readings yet.');
  });

  it('shows a failure of the azimuth through its Message', () => {
    const r = { ...BASE, azimuth: { ok: false as const, reason: 'axis_vertical' as const } };
    const { getByRole } = render(<Readout readout={r} />);
    expect(getByRole('alert').textContent).not.toContain('axis_vertical');
  });

  it('says so when the readings are out of date', () => {
    const { getByTestId } = render(<Readout readout={{ ...BASE, stale: true }} />);
    expect(part(getByTestId('readout'), 'stale')).toBeTruthy();
  });
});

// Req 13.16 (2026-11-21): the compact readout of the docked layout.
describe('Readout, compact (Req 13.16)', () => {
  it('shows the azimuth with its North word and one labelled shake line; the rest is under Details', () => {
    const { getByTestId } = render(<Readout readout={BASE} compact kind="bearing" />);
    const el = getByTestId('readout');
    expect(part(el, 'azimuth')).toBe('90.0° true');
    expect(part(el, 'steadiness')).toBe('Steady hand: shake ±0.25°');
    expect(el.querySelector(':scope > [data-part="altitude"]')).toBeNull();
    const details = el.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('Details');
    expect(details.textContent).toContain('12.3° altitude');
    expect(details.textContent).toContain('±0.06°');
    expect(details.textContent).toContain('12 readings');
  });

  it('never shows a bare ± beside the azimuth, and keeps the sizes of Req 13.4', () => {
    const { getByTestId } = render(<Readout readout={BASE} compact kind="bearing" />);
    const el = getByTestId('readout');
    expect(part(el, 'azimuth')).not.toContain('±');
    for (const p of el.querySelectorAll('p')) {
      if (p.textContent?.includes('±')) expect(p.textContent).toMatch(/shake ±/);
    }
    expect(el.style.fontSize).toBe('20px');
    expect(el.querySelector<HTMLElement>('[data-part="azimuth"] span')?.style.fontSize).toBe(
      '32px',
    );
  });

  it('shows the altitude for an altitude Session, with the azimuth under Details', () => {
    const { getByTestId } = render(<Readout readout={BASE} compact kind="altitude" />);
    const el = getByTestId('readout');
    expect(part(el, 'altitude')).toBe('12.3° altitude');
    expect(part(el, 'steadiness')).toBe('Steady hand: shake ±0.06°');
    expect(el.querySelector('details')?.textContent).toContain('90.0° true');
  });

  it('keeps a stale line and a failed readout outside Details; children go inside it', () => {
    const stale: LiveReadout = { ...BASE, stale: true };
    const a = render(
      <Readout readout={stale} compact kind="bearing">
        <p data-testid="inside">north line</p>
      </Readout>,
    );
    const el = a.getByTestId('readout');
    expect(el.querySelector('[data-part="stale"]')).not.toBeNull();
    expect(el.querySelector('details [data-part="stale"]')).toBeNull();
    expect(el.querySelector('details [data-testid="inside"]')).not.toBeNull();
    a.unmount();
    const failed: LiveReadout = { ...BASE, azimuth: { ok: false, reason: 'compass_unreliable' } };
    const b = render(<Readout readout={failed} compact kind="bearing" />);
    expect(b.getByTestId('readout').querySelector('details [role="alert"]')).toBeNull();
    expect(b.getByTestId('failure-notice')).not.toBeNull();
  });

  it('without compact, is exactly as before', () => {
    const { getByTestId } = render(<Readout readout={BASE} />);
    expect(getByTestId('readout').querySelector('details')).toBeNull();
    expect(part(getByTestId('readout'), 'altitude')).toBe('12.3° altitude');
  });
});

// Req 22.11 (2026-11-22, the lead's new look; decided at the review, Open question 18): in the docked
// layout the compact readout is two cards side by side of equal width, the numeral at 32 with the
// card's whole width, each icon at the start of a line of words, the steadiness today's sentence.
describe('Readout, compact, as two cards (Req 22.11)', () => {
  const cards = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-part="card"]')];

  it('draws two cards side by side, of equal width, in the warning and the information tints', () => {
    const { getByTestId } = render(<Readout readout={BASE} compact kind="bearing" />);
    const el = getByTestId('readout');
    const row = el.querySelector<HTMLElement>('[data-part="cards"]');
    expect(row?.style.display).toBe('flex');
    expect(row?.style.gap).toBe('8px');
    const [first, second] = cards(el);
    expect(cards(el)).toHaveLength(2);
    for (const card of [first, second]) {
      expect(card?.style.flexGrow).toBe('1');
      expect(card?.style.flexShrink).toBe('1');
      expect(Number.parseFloat(card?.style.flexBasis ?? '')).toBe(0);
      expect(card?.style.minWidth).toBe('0px');
      expect(card?.style.borderRadius).toBe('var(--alidade-card-radius)');
    }
    expect(first?.style.background).toBe('var(--alidade-warnTint)');
    expect(second?.style.background).toBe('var(--alidade-infoTint)');
  });

  it('the first card: the numeral at 32 on a line of its own, then the icon and the North word at 20', () => {
    const { getByTestId } = render(<Readout readout={BASE} compact kind="bearing" />);
    const [first] = cards(getByTestId('readout'));
    const azimuth = first?.querySelector<HTMLElement>('[data-part="azimuth"]');
    expect(azimuth?.textContent).toBe('90.0° true');
    const numeral = azimuth?.querySelector<HTMLElement>('[data-part="numeral"]');
    expect(numeral?.textContent).toBe('90.0°');
    expect(numeral?.style.fontSize).toBe('32px');
    expect(numeral?.style.display).toBe('block');
    // No icon beside the numeral: the numeral's line holds no svg, so it has the card's whole width.
    expect(numeral?.querySelector('svg')).toBeNull();
    const word = azimuth?.querySelector<HTMLElement>('[data-part="north-word"]');
    expect(word?.textContent).toBe('true');
    expect(word?.firstElementChild?.getAttribute('data-icon')).toBe('navigation');
    expect(first?.querySelectorAll('svg')).toHaveLength(1);
  });

  it('the second card: the icon, then today’s sentence at 20 in the body stack, not a numeral', () => {
    const { getByTestId } = render(<Readout readout={BASE} compact kind="bearing" />);
    const [, second] = cards(getByTestId('readout'));
    const steadiness = second?.querySelector<HTMLElement>('[data-part="steadiness"]');
    expect(steadiness?.textContent).toBe('Steady hand: shake ±0.25°');
    expect(steadiness?.firstElementChild?.getAttribute('data-icon')).toBe('vibrate');
    for (const node of second?.querySelectorAll<HTMLElement>('*') ?? []) {
      expect(node.style.fontSize === '' || node.style.fontSize === '20px').toBe(true);
    }
    expect(second?.querySelector('[data-part="numeral"]')).toBeNull();
  });

  it('the altitude Session: the altitude as the numeral, then its word', () => {
    const { getByTestId } = render(<Readout readout={BASE} compact kind="altitude" />);
    const [first] = cards(getByTestId('readout'));
    expect(first?.querySelector('[data-part="altitude"]')?.textContent).toBe('12.3° altitude');
    expect(first?.querySelector<HTMLElement>('[data-part="numeral"]')?.style.fontSize).toBe('32px');
  });

  it('keeps the stale line, a failed readout and Details outside the cards', () => {
    const failed: LiveReadout = {
      ...BASE,
      stale: true,
      azimuth: { ok: false, reason: 'compass_unreliable' },
    };
    const { getByTestId } = render(<Readout readout={failed} compact kind="bearing" />);
    const row = getByTestId('readout').querySelector('[data-part="cards"]') as HTMLElement;
    expect(row.querySelector('[data-part="stale"]')).toBeNull();
    expect(row.querySelector('[role="alert"]')).toBeNull();
    expect(row.querySelector('details')).toBeNull();
    expect(getByTestId('readout').querySelector('[data-part="stale"]')).not.toBeNull();
    // With the main angle failed, the first card is not drawn: the Message says why.
    expect(cards(getByTestId('readout'))).toHaveLength(1);
  });
});
