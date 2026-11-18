import { MAX_SIMULATOR_ADVANCE_MS } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { eventRateHz } from '../diagnostics/event-rate';
import { panelStep, type PanelAction, type PanelState } from './panel-state';

const START = 1_790_000_000_000;
const STATE: PanelState = {
  sceneId: 'steady',
  stationId: 'west',
  seed: 1,
  speed: 1,
  playing: false,
  elapsedSimMs: 0,
  tickMs: 100,
  startUtcMs: START,
};

function apply(s: PanelState, ...actions: PanelAction[]) {
  let state = s;
  const advances: number[] = [];
  const recreates: boolean[] = [];
  for (const a of actions) {
    const r = panelStep(state, a);
    if (!r.ok) throw new Error(r.reason);
    state = r.value.state;
    advances.push(...r.value.advancesToUtcMs);
    recreates.push(r.value.recreate);
  }
  return { state, advances, recreates };
}

describe('panelStep (Req 17.4, 17.5)', () => {
  it("a tick while playing advances by tickMs × speed from the script's start", () => {
    const r = apply(
      STATE,
      { kind: 'play' },
      { kind: 'tick' },
      { kind: 'setSpeed', speed: 4 },
      { kind: 'tick' },
      { kind: 'setSpeed', speed: 0.25 },
      { kind: 'tick' },
    );
    expect(r.advances).toEqual([START + 100, START + 500, START + 525]);
    expect(r.state.elapsedSimMs).toBe(525);
  });

  it('ticks while paused add nothing; a step while paused is one tick', () => {
    const r = apply(STATE, { kind: 'tick' }, { kind: 'tick' }, { kind: 'step' });
    expect(r.advances).toEqual([START + 100]);
    expect(r.state.playing).toBe(false);
  });

  it('a restart, a change of scene, Station or seed reset the time and ask for a new Simulator', () => {
    const playing = apply(STATE, { kind: 'play' }, { kind: 'tick' }, { kind: 'tick' }).state;
    for (const a of [
      { kind: 'restart' },
      { kind: 'selectScene', sceneId: 'sun', stationId: 'east', startUtcMs: START + 5 },
      { kind: 'selectStation', stationId: 'east' },
      { kind: 'setSeed', seed: 99 },
    ] as PanelAction[]) {
      const r = panelStep(playing, a);
      if (!r.ok) throw new Error(r.reason);
      expect(r.value.state.elapsedSimMs, a.kind).toBe(0);
      expect(r.value.state.playing).toBe(false);
      expect(r.value.recreate).toBe(true);
    }
  });

  it('splits a long advance at MAX_SIMULATOR_ADVANCE_MS', () => {
    const long = { ...STATE, tickMs: MAX_SIMULATOR_ADVANCE_MS * 2.5, speed: 1 as const };
    const r = apply(long, { kind: 'step' });
    expect(r.advances).toEqual([
      START + MAX_SIMULATOR_ADVANCE_MS,
      START + 2 * MAX_SIMULATOR_ADVANCE_MS,
      START + 2.5 * MAX_SIMULATOR_ADVANCE_MS,
    ]);
  });

  it('refuses a seed that is not an integer in [0, 2³²), naming it, and keeps the state', () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(panelStep(STATE, { kind: 'setSeed', seed })).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'seed',
      });
    }
    expect(panelStep(STATE, { kind: 'setSeed', seed: 2 ** 32 - 1 }).ok).toBe(true);
    expect(panelStep({ ...STATE, tickMs: 0 }, { kind: 'tick' })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'tickMs',
    });
  });
});

describe('eventRateHz (Req 18.6)', () => {
  it('counts the events of the last second', () => {
    const ten = Array.from({ length: 10 }, (_, i) => START + 100 * i);
    expect(eventRateHz(ten, START + 950, 1000)).toBe(10);
    expect(eventRateHz([], START, 1000)).toBe(0);
    expect(eventRateHz([START], START, 1000)).toBe(1);
    expect(eventRateHz([START], START + 1000, 1000)).toBe(0);
    // A time stepping back: an event after the end is not counted.
    expect(eventRateHz([START + 500, START + 2000], START + 600, 1000)).toBe(1);
    expect(eventRateHz(ten, Number.NaN, 1000)).toBe(0);
    expect(eventRateHz(ten, START, 0)).toBe(0);
    expect(eventRateHz(ten, START + 950, 500)).toBe(10);
  });
});
