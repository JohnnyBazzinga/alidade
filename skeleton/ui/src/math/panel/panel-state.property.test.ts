import { MAX_SIMULATOR_ADVANCE_MS } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed } from '../../test-support/generators';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { panelStep, type PanelAction, type PanelState } from './panel-state';

const START = 1_790_000_000_000;

/**
 * Domain (P-17.8): tick lengths in [10, 1000] ms; 0 to 200 actions of play, pause, step, restart,
 * the three speeds, and ticks (ticks weighted five to one).
 */
const action: fc.Arbitrary<PanelAction> = fc.oneof(
  { weight: 5, arbitrary: fc.constant({ kind: 'tick' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'play' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'pause' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'step' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'restart' as const }) },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom(0.25 as const, 1 as const, 4 as const)
      .map((speed) => ({ kind: 'setSpeed' as const, speed })),
  },
);

// P-17.8 (Req 17.8): the simulated time never decreases except at a restart, equals the start
// plus the sum of tickMs × speed of the ticks delivered while playing and of the steps within a
// relative 1e-12, does not advance while paused, and no advance exceeds MAX_SIMULATOR_ADVANCE_MS.
describe("P-17.8 the panel's time", () => {
  it('is the sum of the ticks and steps, never goes back but at a restart, never jumps more than an hour', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-17.8',
      fc.property(closed(10, 1000), fc.array(action, { maxLength: 200 }), (tickMs, actions) => {
        let state: PanelState = {
          sceneId: 's',
          stationId: 'a',
          seed: 0,
          speed: 1,
          playing: false,
          elapsedSimMs: 0,
          tickMs,
          startUtcMs: START,
        };
        let expected = 0;
        let previousTarget = START;
        let worst = 0;
        for (const a of actions) {
          const r = panelStep(state, a);
          if (!r.ok) return false;
          if (a.kind === 'restart') {
            expected = 0;
            previousTarget = START;
          } else if (
            (a.kind === 'tick' && state.playing) ||
            (a.kind === 'step' && !state.playing)
          ) {
            expected += tickMs * state.speed;
          }
          if (!state.playing && a.kind === 'tick' && r.value.advancesToUtcMs.length > 0)
            return false;
          for (const t of r.value.advancesToUtcMs) {
            if (t < previousTarget || t - previousTarget > MAX_SIMULATOR_ADVANCE_MS) return false;
            previousTarget = t;
          }
          state = r.value.state;
          const error =
            expected === 0
              ? Math.abs(state.elapsedSimMs)
              : Math.abs(state.elapsedSimMs - expected) / expected;
          worst = Math.max(worst, error);
          if (
            r.value.advancesToUtcMs.length > 0 &&
            r.value.advancesToUtcMs[r.value.advancesToUtcMs.length - 1] !==
              START + state.elapsedSimMs
          )
            return false;
        }
        tracker.record('time vs sum of ticks, relative', worst, '1e-12');
        return worst <= 1e-12;
      }),
      tracker,
      { numRuns: cappedRuns(5_000) },
    );
  });
});
