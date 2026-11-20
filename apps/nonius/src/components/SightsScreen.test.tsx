// The Sights screen (Req 4.9, 8.4, 12.3, 12.4, 15.5, 15.6; design §9).

import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { appWrap } from '../test-support/app-wrap';
import { noiseFreeSights } from '../test-support/noise-free';
import { renderScreen } from '../test-support/render-screen';
import { testEnvironment } from '../test-support/test-environment';
import { SightsScreen } from './SightsScreen';

const params = defaultParameters();
const D = DEG_TO_RAD;
const T = [
  Date.UTC(2026, 11, 21, 11, 40),
  Date.UTC(2026, 11, 21, 14, 40),
  Date.UTC(2026, 11, 21, 17, 40),
];
const IE = {
  valueRad: -3.3 * D,
  sigmaRad: 0.25 * D,
  sightCount: 3,
  measuredUtcMs: T[2] ?? 0,
  simulated: false,
};

function mount(times: number[], withIndexError = true, mutate: (i: number) => object = () => ({})) {
  const t = testEnvironment();
  const w = appWrap(t);
  if (withIndexError) w.store.dispatch({ kind: 'save_index_error', indexError: IE });
  noiseFreeSights(CATALOGUE_ORIGIN, times, -3.3 * D, true, params).forEach((s, i) =>
    w.store.dispatch({ kind: 'capture', sight: { ...s, ...mutate(i) } }),
  );
  const onMeasure = vi.fn();
  const screen = renderScreen(<SightsScreen onMeasureIndexError={onMeasure} />, w.wrap);
  return { t, store: w.store, screen, q: within(screen.container), onMeasure };
}

describe('SightsScreen', () => {
  it('says there is no sight yet, with no list', () => {
    const m = mount([]);
    expect(m.q.getByText('There is no sight yet.')).toBeTruthy();
    expect(m.q.queryAllByTestId('sight-row')).toHaveLength(0);
  });

  it('shows the count statement, the span, and that all sights must be from one place', () => {
    const m = mount(T);
    const text = m.screen.container.textContent ?? '';
    expect(text).toContain('With three sights');
    expect(text).toContain('11:40 UTC');
    expect(text).toContain('17:40 UTC');
    expect(text).toMatch(/all (the )?sights of a set must be taken from one place/i);
    expect(text).toMatch(/after moving.*start again/i);
  });

  it('lists each sight with its corrected altitude and total sigma, time, age, Sun side and used', () => {
    const m = mount(T);
    const rows = m.q.getAllByTestId('sight-row');
    expect(rows).toHaveLength(3);
    const first = rows[0]?.textContent ?? '';
    expect(first).toMatch(/\d+\.\d° ± \d+\.\d°/);
    expect(first).toContain('11:40 UTC');
    expect(first).toMatch(/ago/);
    expect(first).toContain('Sun side: yes');
    expect(first).toContain('used');
  });

  it('marks a simulated sight', () => {
    const m = mount(T, true, () => ({ simulated: true }));
    expect(m.q.getAllByTestId('sight-row')[0]?.textContent).toContain('simulated');
  });

  it('shows a Sight set aside with its cause, in words', () => {
    const m = mount(T, true, (i) => (i === 0 ? { rawApparentAltitudeRad: 0.5 * D } : {}));
    const first = m.q.getAllByTestId('sight-row')[0]?.textContent ?? '';
    expect(first).toContain('set aside');
    expect(first).toMatch(/less than 5° above the horizon/);
    expect(first).not.toContain('sun_too_low');
  });

  it('shows the Calibration in use', () => {
    expect(mount(T).q.getByTestId('calibration-line').textContent).toContain('Index error −3.3°');
    expect(mount(T, false).q.getByTestId('calibration-line').textContent).toContain(
      'never calibrated',
    );
  });

  it('deletes one sight after one confirmation, and only that one', () => {
    const m = mount(T);
    const row = m.q.getAllByTestId('sight-row')[1] as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^Delete/ }));
    expect(m.store.getSnapshot().state.sights).toHaveLength(3);
    fireEvent.click(within(row).getByRole('button', { name: 'Keep it' }));
    expect(m.store.getSnapshot().state.sights).toHaveLength(3);
    fireEvent.click(
      within(m.q.getAllByTestId('sight-row')[1] as HTMLElement).getByRole('button', {
        name: /^Delete/,
      }),
    );
    fireEvent.click(m.q.getByRole('button', { name: 'Yes, delete this sight' }));
    const left = m.store.getSnapshot().state.sights;
    expect(left).toHaveLength(2);
    expect(left.map((s) => s.timeUtcMs)).toEqual([T[0], T[2]]);
  });

  it('starts again after one confirmation, keeping the Index error', () => {
    const m = mount(T);
    fireEvent.click(m.q.getByRole('button', { name: 'Start again' }));
    expect(m.store.getSnapshot().state.sights).toHaveLength(3);
    fireEvent.click(m.q.getByRole('button', { name: 'Yes, delete all sights' }));
    const state = m.store.getSnapshot().state;
    expect(state.sights).toHaveLength(0);
    expect(state.indexError).toEqual(IE);
  });

  it('removes the Index error after one confirmation, and shows the Fix as uncalibrated', () => {
    const m = mount(T);
    fireEvent.click(m.q.getByRole('button', { name: 'Remove the index error' }));
    expect(m.store.getSnapshot().state.indexError).toEqual(IE);
    fireEvent.click(m.q.getByRole('button', { name: 'Yes, remove the index error' }));
    expect(m.store.getSnapshot().state.indexError).toBeNull();
    expect(m.q.getByTestId('calibration-line').textContent).toContain('never calibrated');
    expect(m.q.queryByRole('button', { name: 'Remove the index error' })).toBeNull();
  });

  it('opens the index error screen', () => {
    const m = mount(T);
    fireEvent.click(m.q.getByRole('button', { name: 'Measure the index error' }));
    expect(m.onMeasure).toHaveBeenCalledTimes(1);
  });
});
