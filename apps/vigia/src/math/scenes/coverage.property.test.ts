// P-17.9 (Req 17.9, design §10, §11): the coverage of the 95 % ellipse on the four scenes.
//
// Statistical test, seeded: for each scene, 400 runs, each Station's north error drawn per run from
// a normal with mean 0 and sigma `HEADING_SIGMA_RAD`, the catalogue's orientation noise kept, the
// Fix as the app computes it (`outlierRejection: true`); in `four-posts-one-wrong` the deliberate
// 12° is replaced by the drawn error, so that all four Stations are consistent. Among the runs in
// which `solve` succeeded and the Fix is not `poor`, the target "smoke" lies inside the 95 %
// ellipse in at least 90 % and at most 99 %, for a scene only when at least 100 of its runs are in
// that group; for the `poor` runs and for a smaller group the share is reported and not bounded.
// A result outside the bounds stops the work and is classified (code, property or requirement).
//
// 400 runs per scene in `pnpm test` and in `test:deep`; `test:deep` adds a second pass of 4 000 runs
// per scene, from another seed, for the report. The report is printed in both.

import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../parameters';
import { coverageOfScene, type SceneCoverage } from '../../test-support/capture-from-script';
import { isDeepRun } from '../../test-support/fast-check-setup';
import { smokeScenes } from './smoke-scenes';

const PARAMETERS = defaultParameters();
/** The seed of the 400-run pass (an argument, so that the test is deterministic). */
const SEED = 20_261_121;
/** The seed of the second pass of the deep run. */
const DEEP_SEED = 20_261_122;
const RUNS = 400;
const DEEP_RUNS = 4000;

const built = smokeScenes();
if (!built.ok) throw new Error(`smokeScenes failed: ${built.reason}`);

const percent = (share: number | null) =>
  share === null ? 'n/a' : `${(100 * share).toFixed(1)} %`;

function report(label: string, c: SceneCoverage): string {
  return [
    `P-17.9 ${label} ${c.sceneId}: ${c.runs} runs, capture failures ${c.captureFailures}, failed solves ${c.failedSolves} ${JSON.stringify(c.failedSolveReasons)}`,
    `  not poor: group ${c.notPoor.size}, inside ${c.notPoor.inside}, share ${percent(c.notPoor.share)}, bound ${c.notPoor.boundApplied ? `applied, ${c.notPoor.withinBounds === true ? 'within 90-99 %' : 'OUTSIDE 90-99 %'}` : 'not applied (fewer than 100)'}`,
    `  poor:     group ${c.poor.size}, inside ${c.poor.inside}, share ${percent(c.poor.share)} (not bounded)`,
    `  runs in which a consistent Bearing was set aside: ${c.runsWithConsistentSetAside}`,
  ].join('\n');
}

function check(label: string, runs: number, seed: number) {
  for (const entry of built.ok ? built.value : []) {
    it(`${label}: ${entry.scene.id}, ${runs} runs`, () => {
      const c = coverageOfScene(entry, { seed, runs }, PARAMETERS);
      console.log(report(label, c));
      expect(c.captureFailures).toBe(0);
      expect(c.failedSolves + c.notPoor.size + c.poor.size).toBe(runs);
      // The bound, applied only to a group of at least 100 runs (Req 17.9).
      if (c.notPoor.boundApplied) expect(c.notPoor.withinBounds).toBe(true);
      else expect(c.notPoor.withinBounds).toBeNull();
    });
  }
}

describe('P-17.9: the target inside the 95 % ellipse on the four scenes (Req 17.9)', () => {
  check('400 runs', RUNS, SEED);
  if (isDeepRun()) check('second pass', DEEP_RUNS, DEEP_SEED);

  it('is deterministic: the same seed gives the same report', () => {
    const entry = built.ok ? built.value[1] : undefined;
    if (entry === undefined) throw new Error('scene');
    const a = coverageOfScene(entry, { seed: SEED, runs: 30 }, PARAMETERS);
    const b = coverageOfScene(entry, { seed: SEED, runs: 30 }, PARAMETERS);
    expect(a).toEqual(b);
  });
});
