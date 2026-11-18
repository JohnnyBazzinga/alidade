// The Simulator panel's state (Req 17.4, 17.5, 17.8, design §7.15, D15): its time is a count, not
// a clock. A tick while playing adds `tickMs × speed`; the panel asks the component to advance the
// Simulator to `startUtcMs + elapsedSimMs`, in steps of at most `MAX_SIMULATOR_ADVANCE_MS`.

import { MAX_SIMULATOR_ADVANCE_MS } from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';

export type PanelSpeed = 0.25 | 1 | 4;

export interface PanelState {
  readonly sceneId: string;
  readonly stationId: string;
  /** An integer in [0, 2³²). */
  readonly seed: number;
  readonly speed: PanelSpeed;
  readonly playing: boolean;
  readonly elapsedSimMs: number;
  readonly tickMs: number;
  readonly startUtcMs: number;
}

export type PanelAction =
  | {
      readonly kind: 'selectScene';
      readonly sceneId: string;
      readonly stationId: string;
      readonly startUtcMs: number;
    }
  | { readonly kind: 'selectStation'; readonly stationId: string }
  | { readonly kind: 'setSeed'; readonly seed: number }
  | { readonly kind: 'setSpeed'; readonly speed: PanelSpeed }
  | { readonly kind: 'play' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'step' }
  | { readonly kind: 'restart' }
  | { readonly kind: 'tick' };

export interface PanelStepResult {
  readonly state: PanelState;
  /** The absolute times to pass to `advanceTo`, in order, each at most one hour after the last. */
  readonly advancesToUtcMs: readonly number[];
  /** A new scene, Station or seed, or a restart: the component makes a new Simulator and Session. */
  readonly recreate: boolean;
}

const TWO_POW_32 = 2 ** 32;
const SPEEDS: readonly number[] = [0.25, 1, 4];

/** Checks a panel state's numbers, naming the first invalid one. */
export function checkPanelState(s: PanelState): UiResult<PanelState> {
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed >= TWO_POW_32)
    return err('invalid_number', { field: 'seed' });
  if (!SPEEDS.includes(s.speed)) return err('invalid_number', { field: 'speed' });
  if (!Number.isFinite(s.tickMs) || !(s.tickMs > 0))
    return err('invalid_number', { field: 'tickMs' });
  if (!Number.isFinite(s.startUtcMs)) return err('invalid_number', { field: 'startUtcMs' });
  if (!Number.isFinite(s.elapsedSimMs) || s.elapsedSimMs < 0)
    return err('invalid_number', { field: 'elapsedSimMs' });
  return ok(s);
}

/** The advances from `fromMs` to `toMs` after the start, split at `MAX_SIMULATOR_ADVANCE_MS`. */
function advances(startUtcMs: number, fromMs: number, toMs: number): number[] {
  const out: number[] = [];
  let at = fromMs;
  while (at < toMs) {
    at = Math.min(toMs, at + MAX_SIMULATOR_ADVANCE_MS);
    out.push(startUtcMs + at);
  }
  return out;
}

function reset(s: PanelState): PanelState {
  return { ...s, elapsedSimMs: 0, playing: false };
}

/**
 * One action. A tick while paused adds nothing; a step while paused is one tick's worth. A change
 * of scene, Station or seed, and a restart, reset the time and ask for a new Simulator. A seed
 * that is not an integer in [0, 2³²) is `invalid_number` naming `seed`, the state unchanged.
 */
export function panelStep(s: PanelState, a: PanelAction): UiResult<PanelStepResult> {
  const checked = checkPanelState(s);
  if (!checked.ok) return checked;
  const none = (state: PanelState, recreate = false): UiResult<PanelStepResult> =>
    ok({ state, advancesToUtcMs: [], recreate });
  switch (a.kind) {
    case 'selectScene':
      if (!Number.isFinite(a.startUtcMs)) return err('invalid_number', { field: 'startUtcMs' });
      return none(
        reset({ ...s, sceneId: a.sceneId, stationId: a.stationId, startUtcMs: a.startUtcMs }),
        true,
      );
    case 'selectStation':
      return none(reset({ ...s, stationId: a.stationId }), true);
    case 'setSeed':
      if (!Number.isInteger(a.seed) || a.seed < 0 || a.seed >= TWO_POW_32)
        return err('invalid_number', { field: 'seed' });
      return none(reset({ ...s, seed: a.seed }), true);
    case 'setSpeed':
      if (!SPEEDS.includes(a.speed)) return err('invalid_number', { field: 'speed' });
      return none({ ...s, speed: a.speed });
    case 'play':
      return none({ ...s, playing: true });
    case 'pause':
      return none({ ...s, playing: false });
    case 'restart':
      return none(reset(s), true);
    case 'tick':
    case 'step': {
      if (a.kind === 'tick' && !s.playing) return none(s);
      if (a.kind === 'step' && s.playing) return none(s);
      const elapsedSimMs = s.elapsedSimMs + s.tickMs * s.speed;
      return ok({
        state: { ...s, elapsedSimMs },
        advancesToUtcMs: advances(s.startUtcMs, s.elapsedSimMs, elapsedSimMs),
        recreate: false,
      });
    }
  }
}
