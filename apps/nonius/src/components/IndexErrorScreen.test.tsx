// The Index error screen (Req 15.1 to 15.5, 15.9; design §9, D6, D17).

import type { Session } from '@alidade/ui';
import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { sunAt } from '../math/sun/sun-at';
import { appWrap } from '../test-support/app-wrap';
import { altitudeCapture } from '../test-support/captures';
import { renderScreen } from '../test-support/render-screen';
import { testEnvironment } from '../test-support/test-environment';
import { IndexErrorScreen } from './IndexErrorScreen';

const params = defaultParameters();
const D = DEG_TO_RAD;
const FIRST = Date.UTC(2026, 11, 21, 14, 40);

/** The computed apparent altitude of the Sun at the known place at `timeUtcMs`. */
function computed(timeUtcMs: number): number {
  const s = sunAt(CATALOGUE_ORIGIN, timeUtcMs, params);
  if (!s.ok) throw new Error(s.reason);
  return s.value.apparentAltitudeRad;
}

function mount() {
  let sessionCallback: ((s: Session) => void) | null = null;
  const t = testEnvironment({
    sighting: {
      kind: 'simulation',
      render: (onSession) => {
        sessionCallback = onSession;
        return <p>sighting pane</p>;
      },
    },
  });
  const w = appWrap(t);
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const screen = renderScreen(<IndexErrorScreen onDone={onDone} onCancel={onCancel} />, w.wrap);
  const q = within(screen.container);
  /** A sight at `minutes` after FIRST, measured `biasDeg` off the computed altitude. */
  const take = (minutes: number, biasDeg: number) =>
    screen.settle(() => {
      const at = FIRST + minutes * 60_000;
      const raw = computed(at - 500) + biasDeg * D;
      sessionCallback?.({
        state: 'captured',
        captured: altitudeCapture({ apparentAltitudeRad: raw, frozenAtUtcMs: at }),
        frozen: null,
      } as unknown as Session);
    });
  const takeRaw = (rawRad: number) =>
    screen.settle(() => {
      sessionCallback?.({
        state: 'captured',
        captured: altitudeCapture({ apparentAltitudeRad: rawRad, frozenAtUtcMs: FIRST + 7_000 }),
        frozen: null,
      } as unknown as Session);
    });
  const useLocation = () =>
    screen.settle(() =>
      fireEvent.click(q.getByRole('button', { name: "Use this phone's location" })),
    );
  return { t, store: w.store, screen, q, onDone, onCancel, take, takeRaw, useLocation };
}

describe('IndexErrorScreen', () => {
  it('says what it does and asks no location until the user acts', async () => {
    const m = mount();
    await m.screen.settle();
    expect(
      m.q.getByText(/few Sun sights are compared with the altitude the Sun has there/),
    ).toBeTruthy();
    expect(m.t.locationCalls.count).toBe(0);
    expect(m.q.queryByText('sighting pane')).toBeNull();
    await m.useLocation();
    expect(m.t.locationCalls.count).toBe(1);
  });

  it('shows the accuracy and that the location is used only for this and not kept', async () => {
    const m = mount();
    await m.useLocation();
    const text = m.screen.container.textContent ?? '';
    expect(text).toMatch(/accurate to about 20 m/);
    expect(text).toContain('never used for a Fix');
    expect(text).toContain('not kept');
    expect(m.q.getByText('sighting pane')).toBeTruthy();
  });

  it('shows a failure of the location through messageFor and stays at step 1', async () => {
    const m = mount();
    m.t.locationResult = { ok: false, reason: 'permission_denied' };
    await m.useLocation();
    expect(m.q.getByRole('alert')).toBeTruthy();
    expect(m.q.queryByText('sighting pane')).toBeNull();
  });

  it('shows each difference, then the mean and the sigma, as the sights are taken', async () => {
    const m = mount();
    await m.useLocation();
    await m.take(0, -3.3);
    await m.take(1, -3.1);
    const rows = m.q.getAllByTestId('difference');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('−3.3°');
    expect(rows[1]?.textContent).toContain('−3.1°');
    const summary = m.q.getByTestId('index-error-preview').textContent ?? '';
    expect(summary).toContain('−3.2°');
    expect(summary).toMatch(/±/);
  });

  it('Save stores the Index error and drops the location and the calibration sights', async () => {
    const m = mount();
    await m.useLocation();
    await m.take(0, -3.3);
    await m.take(1, -3.3);
    await m.screen.settle(() => fireEvent.click(m.q.getByRole('button', { name: 'Save' })));
    const state = m.store.getSnapshot().state;
    expect(state.sights).toHaveLength(0);
    expect(state.indexError?.valueRad).toBeCloseTo(-3.3 * D, 6);
    expect(state.indexError?.sightCount).toBe(2);
    expect(JSON.stringify(m.store.getSnapshot().state)).not.toContain('latRad');
    expect(JSON.stringify(m.t.storage.read())).not.toContain('latRad');
    expect(m.onDone).toHaveBeenCalledTimes(1);
  });

  it('Cancel drops everything and stores nothing', async () => {
    const m = mount();
    await m.useLocation();
    await m.take(0, -3.3);
    fireEvent.click(m.q.getByRole('button', { name: 'Cancel' }));
    const state = m.store.getSnapshot().state;
    expect(state.indexError).toBeNull();
    expect(state.sights).toHaveLength(0);
    expect(JSON.stringify(state)).not.toContain('latRad');
    expect(m.onCancel).toHaveBeenCalledTimes(1);
  });

  it('refuses to save an implausible Index error, with its Message beside Save', async () => {
    const m = mount();
    await m.useLocation();
    await m.take(0, -12);
    await m.screen.settle(() => fireEvent.click(m.q.getByRole('button', { name: 'Save' })));
    const area = m.q.getByTestId('save-area');
    expect(within(area).getByRole('alert').textContent).toContain('too large to be the phone');
    expect(m.store.getSnapshot().state.indexError).toBeNull();
    expect(m.onDone).not.toHaveBeenCalled();
  });

  it('refuses a sight below 5° with its Message, and adds no difference', async () => {
    const m = mount();
    await m.useLocation();
    await m.takeRaw(2 * D);
    expect(m.q.queryAllByTestId('difference')).toHaveLength(0);
    expect(m.q.getByRole('alert').textContent).toMatch(/less than 5° above the horizon/);
  });

  it('save is never offered before a sight has been taken', async () => {
    const m = mount();
    await m.useLocation();
    expect(m.q.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
