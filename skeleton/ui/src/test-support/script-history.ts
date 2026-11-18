// Generators of Simulator runs and the histories built from them (design §8; test support, not
// exported).

import fc from 'fast-check';
import { closed, uniform, uniformInteger } from './generators';
import {
  buildHistoryFromRun,
  type ScriptHistory,
  type ScriptRun,
  type ScriptStep,
} from './history-from-script';
import { simulatorScript } from './scripts';

const DEG = Math.PI / 180;

/**
 * `scriptHistory`: a Simulator run, never a hand-built sample. A script (`simulatorScript`,
 * noisy or noise-free), a seed in [0, 2³²), 0 to 3 `aim` calls at drawn times (each a pose with
 * azimuth in [0, 2π), apparent altitude in [-80°, 80°], roll in [-π, π)), and an end time 200 to
 * 6000 ms after the script's start, to which the Simulator is advanced. Excludes nothing the
 * Simulator accepts; scripts that deliver nothing (a missing sensor, a denied permission, an
 * insecure page) are drawn on purpose, and the properties that need samples discard them.
 */
export function scriptRun(noiseFree = false): fc.Arbitrary<ScriptRun> {
  return fc
    .record({
      script: simulatorScript(noiseFree),
      seed: uniformInteger(0, 2 ** 32 - 1),
      aims: fc.array(
        fc.record({
          offsetMs: uniformInteger(0, 6000),
          azimuthRad: uniform(0, 2 * Math.PI),
          apparentAltitudeRad: closed(-80 * DEG, 80 * DEG),
          rollRad: uniform(-Math.PI, Math.PI),
        }),
        { maxLength: 3 },
      ),
      endOffsetMs: uniformInteger(200, 6000),
    })
    .map(({ script, seed, aims, endOffsetMs }) => {
      const endUtcMs = script.startUtcMs + endOffsetMs;
      const steps: ScriptStep[] = [];
      let clockMs = script.startUtcMs;
      for (const a of [...aims].sort((x, y) => x.offsetMs - y.offsetMs)) {
        const atUtcMs = Math.min(script.startUtcMs + a.offsetMs, endUtcMs);
        if (atUtcMs < clockMs) continue;
        steps.push({ aim: null, advanceToUtcMs: atUtcMs });
        steps.push({
          aim: {
            azimuthRad: a.azimuthRad,
            apparentAltitudeRad: a.apparentAltitudeRad,
            rollRad: a.rollRad,
          },
          advanceToUtcMs: atUtcMs,
        });
        clockMs = atUtcMs;
      }
      steps.push({ aim: null, advanceToUtcMs: endUtcMs });
      return { script, seed, steps };
    });
}

/** `scriptHistory`: `scriptRun` and the history it builds. */
export function scriptHistory(noiseFree = false): fc.Arbitrary<{
  run: ScriptRun;
  built: ScriptHistory;
}> {
  return scriptRun(noiseFree).map((run) => ({ run, built: buildHistoryFromRun(run) }));
}
