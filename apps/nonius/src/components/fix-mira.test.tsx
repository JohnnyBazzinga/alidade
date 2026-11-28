// Nonius in Mira (Req 16; the author's design of 2026-11-28): the header with its caption, the
// warning never to look at the Sun as the title, the Sun dial and its button, the Calibration in use
// as a warning card with "Measure the index error" in it, the rule of thumb with its drawing, How it
// works as a tile, and the mode control as two segments. The words are the formatter's, whole.
import { CATALOGUE_ORIGIN, ROLE_VARS } from '@alidade/ui';
import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { DEG_TO_RAD } from '../math/degrees';
import { leadAndRest, START } from '../math/fix/fix-words';
import { defaultParameters } from '../math/parameters';
import { noiseFreeSights } from '../test-support/noise-free';
import { testEnvironment } from '../test-support/test-environment';
import { headerCaption } from './Header';
import { ModeControl } from './ModeControl';
import { createNoniusStore } from './store';

const D = DEG_TO_RAD;
const params = defaultParameters();
const T = [
  Date.UTC(2026, 11, 21, 11, 40),
  Date.UTC(2026, 11, 21, 14, 40),
  Date.UTC(2026, 11, 21, 17, 40),
];

function mount(sights: readonly number[] = [], indexError = false) {
  const t = testEnvironment();
  const store = createNoniusStore(t.environment);
  if (indexError) {
    store.dispatch({
      kind: 'save_index_error',
      indexError: {
        valueRad: -3.3 * D,
        sigmaRad: 0.25 * D,
        sightCount: 3,
        measuredUtcMs: T[2] ?? 0,
        simulated: false,
      },
    });
  }
  for (const s of noiseFreeSights(CATALOGUE_ORIGIN, sights, -3.3 * D, true, params)) {
    store.dispatch({ kind: 'capture', sight: s });
  }
  const utils = render(<App environment={t.environment} store={store} />);
  return { ...utils, q: within(utils.container) };
}

describe('the header (Req 16.3)', () => {
  it('is the mark, the word and the caption of the tab and the count, on the tabs only', () => {
    const m = mount();
    const header = m.q.getByTestId('app-header');
    expect(header.textContent).toContain('Nonius');
    expect(m.q.getByTestId('header-caption').textContent).toBe('Fix · 0 sights');
    expect(m.q.getByTestId('header-caption').style.textTransform).toBe('uppercase');
    fireEvent.click(m.q.getByRole('tab', { name: 'Sights' }));
    expect(m.q.getByTestId('header-caption').textContent).toBe('Sights · 0 taken');
    fireEvent.click(m.q.getByRole('tab', { name: 'Fix' }));
    fireEvent.click(m.q.getByRole('button', { name: 'How it works' }));
    expect(m.q.queryByTestId('app-header')).toBeNull();
  });

  it('counts one sight in the singular, and any count it cannot read as none', () => {
    expect(headerCaption('Fix', 1)).toBe('Fix · 1 sight');
    expect(headerCaption('Map', 3)).toBe('Map · 3 sights');
    expect(headerCaption('Fix', Number.NaN)).toBe('Fix · 0 sights');
    expect(headerCaption('Fix', -2)).toBe('Fix · 0 sights');
  });
});

describe('the Fix screen before any sight, as the design draws it (Req 16.3)', () => {
  it('has the warning as its title, how to sight under it, then the dial, the calibration, the rule, How it works', () => {
    const m = mount();
    const [title, lead] = leadAndRest(START);
    expect(m.q.getByRole('heading', { level: 1 }).textContent).toBe(title);
    expect(m.q.getByText(lead)).toBeTruthy();
    const screen = m.q.getByTestId('fix-screen');
    const ids = [...screen.querySelectorAll<HTMLElement>('[data-testid]')].map(
      (e) => e.dataset.testid,
    );
    const at = (id: string) => ids.indexOf(id);
    expect(at('sun-dial')).toBeGreaterThan(-1);
    expect(at('sun-dial')).toBeLessThan(at('calibration-line'));
    expect(at('calibration-line')).toBeLessThan(at('rule-card'));
    const tiles = within(screen).getAllByRole('button');
    expect(tiles[tiles.length - 1]?.textContent).toBe('How it works');
  });

  it('draws "Sight the Sun" as the dial’s round yellow button, the primary action', () => {
    const m = mount();
    const dial = m.q.getByTestId('sun-dial');
    const button = within(dial).getByRole('button', { name: 'Sight the Sun' });
    expect(button.dataset.primary).toBe('true');
    expect(button.style.borderRadius).toBe('50%');
    expect(button.style.background).toBe(ROLE_VARS.primary);
    // The drawing's four rings; the crosshair icon in the button is a fifth circle.
    expect(dial.querySelector('svg')?.querySelectorAll('circle')).toHaveLength(4);
    expect(m.q.queryByTestId('primary-action')).toBeNull();
  });

  it('shows the uncalibrated words as a warning card, the first sentence its title, and Measure in it', () => {
    const m = mount();
    const card = m.q.getByTestId('calibration-line');
    expect(card.getAttribute('role')).toBe('note');
    expect(card.style.background).toBe(ROLE_VARS.warnTint);
    const [first, ...rest] = [...card.querySelectorAll('p')].map((p) => p.textContent);
    expect(first).toBe("This phone's altitude was never calibrated.");
    expect(rest.join(' ')).toContain('about 390 km on the ground');
    const measure = within(card).getByRole('button', { name: 'Measure the index error' });
    expect(measure.dataset.primary).toBeUndefined();
  });

  it('shows the rule of thumb beside its drawing, labelled with the least turn', () => {
    const m = mount();
    const card = m.q.getByTestId('rule-card');
    expect(card.textContent).toContain('must change by at least 20° between sights.');
    expect(within(card).getByRole('img').textContent).toBe('20°');
  });
});

describe('the Fix screen with sights (Req 9.3, 16.3)', () => {
  it('keeps the warning as the title, drops how to start, and puts the calibration before the position and the dial', () => {
    const m = mount(T, true);
    const screen = m.q.getByTestId('fix-screen');
    expect(screen.dataset.kind).toBe('fix');
    expect(m.q.getByRole('heading', { level: 1 }).textContent).toBe(leadAndRest(START)[0]);
    expect(screen.textContent).not.toContain(leadAndRest(START)[1]);
    const text = screen.textContent ?? '';
    expect(text.indexOf('Index error')).toBeLessThan(text.indexOf('Probably within'));
    const dial = m.q.getByTestId('sun-dial');
    expect(
      m.q.getByTestId('fix-words').compareDocumentPosition(dial) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it('with no Index error and a Fix, Measure is the yellow action and the dial’s button an outline', () => {
    const m = mount(T);
    const measure = within(m.q.getByTestId('calibration-line')).getByRole('button', {
      name: 'Measure the index error',
    });
    expect(measure.dataset.primary).toBe('true');
    const sight = within(m.q.getByTestId('sun-dial')).getByRole('button', {
      name: 'Sight the Sun',
    });
    expect(sight.dataset.primary).toBeUndefined();
    expect(sight.style.background).toBe(ROLE_VARS.card);
    expect(m.q.getAllByRole('button').filter((b) => b.dataset.primary === 'true')).toHaveLength(1);
  });
});

describe('the mode control (Req 13.1, 16.3)', () => {
  it('is two segments, the chosen one dark, and a tap on the other changes the mode', () => {
    const changes: string[] = [];
    const { getByRole } = render(
      <ModeControl mode="device" onModeChange={(mode) => changes.push(mode)} />,
    );
    const phone = getByRole('button', { name: 'This phone' });
    const simulator = getByRole('button', { name: 'Simulator' });
    expect(phone.getAttribute('aria-pressed')).toBe('true');
    expect(phone.style.background).toBe(ROLE_VARS.ink);
    expect(simulator.style.background).toBe('transparent');
    fireEvent.click(phone);
    fireEvent.click(simulator);
    expect(changes).toEqual(['simulation']);
  });
});
