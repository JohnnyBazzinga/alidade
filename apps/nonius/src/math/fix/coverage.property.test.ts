// The statistical tests of design D22: P-7.3 (coverage), P-8.5 (false alarms), P-8.6 (one wrong
// Sight), from one harness pass each, with the seed an argument. In `test:deep` each band runs
// 2 000 runs and the bounds of the requirements are applied; in `pnpm test` each band runs 200
// runs and the shares are reported and not applied, because at 200 runs the 90 % bound is within
// the sampling noise of an honest 93 % (D22).

import { describe, expect, it } from 'vitest';
import { isDeepRun } from '../../test-support/fast-check-setup';
import { runBand, shareOf, shareText, type BandReport } from '../../test-support/run-harness';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';

const D = DEG_TO_RAD;
const params = defaultParameters();
const SEED = 20_261_120;
const RUNS_PER_BAND = isDeepRun() ? 2000 : 200;
/** The four bands of the Common sigma (Req 7.3): 0, 0.25°, 1°, 3.5°. */
const BANDS = [0, 0.25 * D, 1 * D, 3.5 * D];
/** A band with fewer bounded runs than this is reported and not bounded (Req 7.3). */
const MIN_BOUNDED_RUNS = 100;

function report(title: string, reports: readonly BandReport[]): void {
  if (!isDeepRun()) return;
  const lines = [`[deep] ${title}, seed ${SEED}, ${RUNS_PER_BAND} runs per band`];
  for (const r of reports) {
    lines.push(
      `[deep]  band ${(r.commonSigmaRad / D).toFixed(2)}°: redraws ${r.redraws}, Shown Fix ${r.outcomes.fix}, Two places ${r.outcomes.twoPlaces}, failed ${JSON.stringify(r.outcomes.failed)}`,
    );
    lines.push(
      `[deep]   ${shareText('coverage (not poor)', r.coverage)}; ${shareText('poor', r.coveragePoor)}`,
    );
    for (const [cls, share] of Object.entries(r.coverageByClass))
      lines.push(`[deep]   class ${cls}: ${shareText('inside', share)}`);
    for (const [count, share] of Object.entries(r.coverageByCount))
      lines.push(`[deep]   ${count} sights: ${shareText('inside', share)}`);
    lines.push(`[deep]   ${shareText('false alarm (3 to 6 sights)', r.falseAlarm)}`);
    for (const [count, share] of Object.entries(r.falseAlarmByCount))
      lines.push(`[deep]   ${count} sights: ${shareText('alarm', share)}`);
  }
  console.log(lines.join('\n'));
}

const coverageReports: BandReport[] = [];

describe('P-7.3 and P-8.5: coverage and false alarms by band (Req 7.3, 8.5)', () => {
  it('runs the harness over the four bands', () => {
    for (const commonSigmaRad of BANDS) {
      coverageReports.push(
        runBand(
          {
            seed: SEED,
            runs: RUNS_PER_BAND,
            commonSigmaRad,
            independentSigmaRad: params.aimSigmaRad,
          },
          params,
        ),
      );
    }
    report('P-7.3 / P-8.5', coverageReports);
    for (const r of coverageReports) {
      const failed = Object.values(r.outcomes.failed).reduce((a, n) => a + n, 0);
      expect(r.outcomes.fix + r.outcomes.twoPlaces + failed).toBe(RUNS_PER_BAND);
    }
  });

  it('P-7.3: the true Position is inside the 95 % ellipse in at least 90 % of the bounded runs in every band, and in at most 99 % with no Common sigma', () => {
    if (!isDeepRun()) return;
    for (const r of coverageReports) {
      if (r.coverage.size < MIN_BOUNDED_RUNS) continue;
      const share = shareOf(r.coverage) ?? 0;
      expect(
        share,
        `band ${(r.commonSigmaRad / D).toFixed(2)}°: ${shareText('coverage', r.coverage)}`,
      ).toBeGreaterThanOrEqual(0.9);
      if (r.commonSigmaRad === 0) {
        expect(share, `band 0: ${shareText('coverage', r.coverage)}`).toBeLessThanOrEqual(0.99);
      }
    }
  });

  it('P-8.5: at most 2 % of the sets of 3 to 6 sights with no wrong one are called disagreeing or have a sight set aside, in each band', () => {
    if (!isDeepRun()) return;
    for (const r of coverageReports) {
      const share = shareOf(r.falseAlarm);
      expect(
        share === null || share <= 0.02,
        `band ${(r.commonSigmaRad / D).toFixed(2)}°: ${shareText('false alarm', r.falseAlarm)}`,
      ).toBe(true);
    }
  });
});

describe('P-8.6: one wrong Sight, shares reported and not bounded (Req 8.6)', () => {
  it('reports by size of error and by count', () => {
    const reports = BANDS.map((commonSigmaRad) =>
      runBand(
        {
          seed: SEED + 1,
          runs: RUNS_PER_BAND,
          commonSigmaRad,
          independentSigmaRad: params.aimSigmaRad,
          minCount: 3,
          wrong: { minRad: 3 * D, maxRad: 20 * D },
        },
        params,
      ),
    );
    if (isDeepRun()) {
      const lines = [`[deep] P-8.6, seed ${SEED + 1}, ${RUNS_PER_BAND} runs per band`];
      for (const r of reports) {
        lines.push(
          `[deep]  band ${(r.commonSigmaRad / D).toFixed(2)}°: Shown Fix ${r.outcomes.fix}, Two places ${r.outcomes.twoPlaces}, failed ${JSON.stringify(r.outcomes.failed)}`,
        );
        for (const [name, w] of Object.entries(r.wrongByError)) {
          lines.push(
            `[deep]   error ${name}: n ${w.size}, disagreement said ${w.disagreementSaid}, wrong alone set aside ${w.wrongAloneSetAside}, good set aside ${w.goodSetAside}`,
          );
        }
        for (const [count, w] of Object.entries(r.wrongByCount)) {
          lines.push(
            `[deep]   ${count} sights: n ${w.size}, disagreement said ${w.disagreementSaid}, wrong alone set aside ${w.wrongAloneSetAside}, good set aside ${w.goodSetAside}`,
          );
        }
      }
      console.log(lines.join('\n'));
    }
    for (const r of reports) {
      const total = Object.values(r.wrongByError).reduce((a, w) => a + w.size, 0);
      expect(total).toBeGreaterThan(0);
      expect(r.falseAlarm.size).toBe(0);
    }
  });
});
