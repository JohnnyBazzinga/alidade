// The Fix screen (Req 6.7, 8, 9.1 to 9.3, 9.7, 10.1, 10.2, 10.7, 11.1 to 11.4; design §9).

import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { appWrap } from '../test-support/app-wrap';
import { noiseFreeSights } from '../test-support/noise-free';
import { renderScreen } from '../test-support/render-screen';
import { testEnvironment } from '../test-support/test-environment';
import { FixScreen } from './FixScreen';

const params = defaultParameters();
const D = DEG_TO_RAD;
const T = [
  Date.UTC(2026, 11, 21, 11, 40),
  Date.UTC(2026, 11, 21, 14, 40),
  Date.UTC(2026, 11, 21, 17, 40),
];

function mount(times: number[], opts: { sunSide: boolean; indexError?: boolean }) {
  const t = testEnvironment();
  const w = appWrap(t);
  if (opts.indexError === true) {
    w.store.dispatch({
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
  for (const s of noiseFreeSights(CATALOGUE_ORIGIN, times, -3.3 * D, opts.sunSide, params)) {
    w.store.dispatch({ kind: 'capture', sight: s });
  }
  const handlers = { onSight: vi.fn(), onMeasureIndexError: vi.fn(), onHowItWorks: vi.fn() };
  const screen = renderScreen(<FixScreen {...handlers} />, w.wrap);
  return { t, store: w.store, screen, handlers, q: within(screen.container) };
}

const button = (q: ReturnType<typeof within>, name: RegExp | string) =>
  q.queryByRole('button', { name });

describe('FixScreen by kind of Assessment', () => {
  it('none: how to start, the rule of thumb, and Sight the Sun as the primary action', () => {
    const m = mount([], { sunSide: false });
    expect(m.q.getByTestId('fix-screen').dataset.kind).toBe('empty');
    expect(m.q.getByText(/Look only at the screen, never at the Sun/)).toBeTruthy();
    expect(m.q.getByText(/must change by at least 20°/)).toBeTruthy();
    const primary = button(m.q, 'Sight the Sun');
    expect(primary?.dataset.primary).toBe('true');
    fireEvent.click(primary as HTMLElement);
    expect(m.handlers.onSight).toHaveBeenCalledTimes(1);
  });

  it('one sight: the circle sentence and no position', () => {
    const m = mount([T[0] ?? 0], { sunSide: false });
    expect(m.q.getByTestId('fix-screen').dataset.kind).toBe('one');
    expect(m.q.getByText(/somewhere on a circle of about/)).toBeTruthy();
    expect(m.q.queryByText(/Probably within/)).toBeNull();
    expect(button(m.q, /Compare with this phone/)).toBeNull();
  });

  it('a Fix: probably within, the index error line first, and no uncalibrated words', () => {
    const m = mount(T, { sunSide: true, indexError: true });
    expect(m.q.getByTestId('fix-screen').dataset.kind).toBe('fix');
    const text = m.screen.container.textContent ?? '';
    expect(text).toMatch(/Probably within about \d+ km/);
    expect(text.indexOf('Index error')).toBeLessThan(text.indexOf('Probably within'));
    expect(text).not.toContain('never calibrated');
    expect(text).not.toMatch(/exact|located at|confirmed|precisely/);
  });

  it('uncalibrated: the words come before the position', () => {
    const m = mount(T, { sunSide: true });
    const text = m.screen.container.textContent ?? '';
    expect(text.indexOf('never calibrated')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('never calibrated')).toBeLessThan(text.indexOf('Probably within'));
  });
});

describe('FixScreen: Two places', () => {
  it('shows both places with I am near A and B as the prominent controls, then the chosen place and Undo', () => {
    const m = mount([T[0] ?? 0, T[2] ?? 0], { sunSide: false, indexError: true });
    expect(m.q.getByTestId('fix-screen').dataset.kind).toBe('two_places');
    expect(m.q.getByText(/Two places fit these sights. Choose the one you are near./)).toBeTruthy();
    const a = button(m.q, 'I am near A');
    const b = button(m.q, 'I am near B');
    expect(a?.dataset.primary).toBe('true');
    expect(b?.dataset.primary).toBe('true');
    expect(button(m.q, /Compare with this phone/)).toBeNull();
    expect(button(m.q, 'Undo my choice')).toBeNull();

    fireEvent.click(b as HTMLElement);
    expect(m.q.getByTestId('fix-screen').dataset.kind).toBe('fix');
    expect(m.screen.container.textContent).toContain('You chose this place of two (B)');
    expect(button(m.q, 'I am near A')).toBeNull();
    fireEvent.click(button(m.q, 'Undo my choice') as HTMLElement);
    expect(m.q.getByTestId('fix-screen').dataset.kind).toBe('two_places');
  });

  it('I am near A chooses place A', () => {
    const m = mount([T[0] ?? 0, T[2] ?? 0], { sunSide: false });
    fireEvent.click(button(m.q, 'I am near A') as HTMLElement);
    expect(m.screen.container.textContent).toContain('You chose this place of two (A)');
  });
});

describe('FixScreen: the Comparison', () => {
  it('is offered only with a Shown Fix, asks the location once per tap, and shows the words', async () => {
    const m = mount(T, { sunSide: true, indexError: true });
    const compare = button(m.q, /Compare with this phone/) as HTMLElement;
    expect(m.t.locationCalls.count).toBe(0);
    await m.screen.settle(() => fireEvent.click(compare));
    expect(m.t.locationCalls.count).toBe(1);
    const result = m.q.getByTestId('comparison');
    expect(result.textContent).toMatch(/is about \d+ km/);
    expect(result.textContent).toContain('measured with this phone');
    await m.screen.settle(() => fireEvent.click(compare));
    expect(m.t.locationCalls.count).toBe(2);
  });

  it('shows a refusal beside the control, through messageFor', async () => {
    const m = mount(T, { sunSide: true, indexError: true });
    m.t.locationResult = { ok: false, reason: 'permission_denied' };
    await m.screen.settle(() =>
      fireEvent.click(button(m.q, /Compare with this phone/) as HTMLElement),
    );
    const area = m.q.getByTestId('comparison-area');
    expect(within(area).getByRole('alert')).toBeTruthy();
    expect(within(area).getByRole('button', { name: /Compare with this phone/ })).toBeTruthy();
    expect(area.textContent).not.toContain('permission_denied');
  });
});

describe('FixScreen: the other controls', () => {
  it('opens the index error screen and How it works', () => {
    const m = mount(T, { sunSide: true });
    fireEvent.click(button(m.q, 'Measure the index error') as HTMLElement);
    fireEvent.click(button(m.q, 'How it works') as HTMLElement);
    expect(m.handlers.onMeasureIndexError).toHaveBeenCalledTimes(1);
    expect(m.handlers.onHowItWorks).toHaveBeenCalledTimes(1);
  });

  it('with no Index error the measure control is the prominent one beside the sighting', () => {
    const m = mount(T, { sunSide: true });
    expect(button(m.q, 'Measure the index error')?.dataset.primary).toBe('true');
  });

  it('shows a storage notice through messageFor', () => {
    const m = mount([], { sunSide: false });
    // The memory storage of the test environment is not persistent.
    expect(
      m.q.getAllByRole('alert').some((a) => /will not keep your sights/.test(a.textContent ?? '')),
    ).toBe(true);
  });
});
