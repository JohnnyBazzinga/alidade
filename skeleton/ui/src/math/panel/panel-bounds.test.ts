// The panel's state is bounded (Req 17.5, 2.6). The first three cases are the shrunk inputs the
// deep run found: a huge finite tick length made `panelStep` build one advance per hour of it and
// throw `RangeError: Invalid array length`, after minutes of allocation.

import { describe, expect, it } from 'vitest';
import { MAX_PANEL_ELAPSED_MS, MAX_PANEL_TICK_MS } from '../../defaults';
import { panelStep, type PanelAction, type PanelState } from './panel-state';

const BASE: PanelState = {
  sceneId: 's',
  stationId: 'a',
  seed: 1,
  speed: 1,
  playing: true,
  elapsedSimMs: 0,
  tickMs: 100,
  startUtcMs: 0,
};

/** `panelStep` with a wall-clock bound: a step that loops or allocates without end fails here. */
function timed(s: PanelState, a: PanelAction) {
  const t0 = performance.now();
  const r = panelStep(s, a);
  expect(performance.now() - t0).toBeLessThan(50);
  return r;
}

describe('the panel state is bounded (Req 17.5)', () => {
  it('states the limits: 60 000 ms a tick, ten years elapsed', () => {
    expect(MAX_PANEL_TICK_MS).toBe(60_000);
    expect(MAX_PANEL_ELAPSED_MS).toBe(10 * 365.25 * 86_400_000);
  });

  for (const [elapsedSimMs, tickMs, field] of [
    [1e300, 1e300, 'tickMs'],
    [1e15, 1e15, 'tickMs'],
    [0, 1e12, 'tickMs'],
  ] as const) {
    it(`refuses elapsed ${elapsedSimMs} ms with tick ${tickMs} ms naming ${field}, without throwing`, () => {
      for (const kind of ['tick', 'step', 'play'] as const) {
        const s = { ...BASE, elapsedSimMs, tickMs, playing: kind === 'tick' };
        expect(timed(s, { kind })).toEqual({ ok: false, reason: 'invalid_number', field });
      }
    });
  }

  it('refuses a state whose elapsed time is beyond the limit, whatever the action', () => {
    const s = { ...BASE, elapsedSimMs: MAX_PANEL_ELAPSED_MS + 1 };
    for (const kind of ['tick', 'pause', 'play', 'restart'] as const) {
      expect(timed(s, { kind })).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'elapsedSimMs',
      });
    }
  });

  it('refuses a state whose tick is beyond the limit even when nothing advances', () => {
    const s = { ...BASE, tickMs: MAX_PANEL_TICK_MS + 1 };
    expect(timed(s, { kind: 'pause' })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'tickMs',
    });
  });

  it('accepts the limits themselves', () => {
    const atTick = timed({ ...BASE, tickMs: MAX_PANEL_TICK_MS }, { kind: 'tick' });
    expect(atTick.ok && atTick.value.state.elapsedSimMs).toBe(MAX_PANEL_TICK_MS);
    const atEnd = timed(
      { ...BASE, elapsedSimMs: MAX_PANEL_ELAPSED_MS, playing: false },
      { kind: 'pause' },
    );
    expect(atEnd.ok).toBe(true);
  });

  it('refuses a tick that would pass the elapsed limit, and leaves the state unchanged', () => {
    const s = {
      ...BASE,
      speed: 4 as const,
      tickMs: 1000,
      elapsedSimMs: MAX_PANEL_ELAPSED_MS - 3999,
    };
    const before = structuredClone(s);
    expect(timed(s, { kind: 'tick' })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'elapsedSimMs',
    });
    expect(s).toEqual(before);
    // The same with one millisecond more room is accepted, and reaches the limit exactly.
    const fits = timed({ ...s, elapsedSimMs: MAX_PANEL_ELAPSED_MS - 4000 }, { kind: 'tick' });
    expect(fits.ok && fits.value.state.elapsedSimMs).toBe(MAX_PANEL_ELAPSED_MS);
  });

  it('refuses a step that would pass the elapsed limit', () => {
    const s = { ...BASE, playing: false, tickMs: 100, elapsedSimMs: MAX_PANEL_ELAPSED_MS - 50 };
    expect(timed(s, { kind: 'step' })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'elapsedSimMs',
    });
  });

  it('builds at most one advance per tick at the largest tick and speed', () => {
    const r = timed({ ...BASE, speed: 4, tickMs: MAX_PANEL_TICK_MS }, { kind: 'tick' });
    expect(r.ok && r.value.advancesToUtcMs).toEqual([4 * MAX_PANEL_TICK_MS]);
  });
});
