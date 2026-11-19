// Outlier rejection under noise (Req 10.10, 10.11; amendment of 2026-11-19; design §9).
// Statistical tests with a fixed seed passed in as an argument (testing.md).

import { describe, expect, it } from 'vitest';
import { TWO_PI_RAD, _wrapTwoPi } from './angle';
import { BearingModel } from './bearing-model';
import type { Bearing } from './observation';
import { destinationPosition, initialAzimuthRad, type Position } from './position';
import type { Reason } from './result';
import { solve } from './solver';
import { unwrapOk } from './test-support/result-helpers';
import { createSeededRandom, type SeededRandom } from './test-support/seeded-random';

const DEG = Math.PI / 180;

/**
 * Prints Req 10.10's report. Core is compiled without Node or browser types (Req 11.2), so the
 * test reaches the console through `globalThis`; no source file does (purity.test.ts).
 */
const printReport = (text: string): void =>
  (globalThis as unknown as { console: { log(text: string): void } }).console.log(text);
const MIN_OBSERVERS = 4;
const MAX_OBSERVERS = 12;
/** Req 10.10: at least 2 000 sets in each band. Req 10.11 states no count; the same is used. */
const SETS_PER_BAND = 2000;

/** The bands of the wrong azimuth's error, in degrees (Req 10.10); `null` is noise only (Req 10.11). */
type Band = readonly [number, number] | null;
const BANDS: readonly (readonly [number, number])[] = [
  [10, 20],
  [20, 40],
  [40, 90],
];

/** What one solve did with the wrong observation (Req 10.10's report). */
type Outcome = 'wrongAlone' | 'wrongAndOthers' | 'goodInstead' | 'none' | `failed:${Reason}`;

interface ExperimentResult {
  readonly sets: number;
  /** Outcome counts by number of observers. */
  readonly byCount: ReadonlyMap<number, ReadonlyMap<Outcome, number>>;
}

/**
 * One set of Req 10.10 and 10.11, drawn from `random`.
 *
 * A target with latitude in [-75°, 75°] and any longitude; 4 to 12 observers (uniform); each in a
 * uniform direction from the target at a range drawn uniformly from 500 m to 15 km, exact
 * (position accuracy 0), with its own azimuth sigma drawn uniformly from [0.5°, 2°] and Gaussian
 * noise of that sigma. With a band, one observer drawn among them has an error drawn uniformly
 * from the band, in either direction. Nothing is filtered.
 */
function drawSet(
  random: SeededRandom,
  band: Band,
): { readonly observations: Bearing[]; readonly wrongId: string | null } {
  const target: Position = {
    latRad: random.nextUniform(-75 * DEG, 75 * DEG),
    lonRad: Math.PI - random.nextUniform(0, TWO_PI_RAD),
  };
  const count =
    MIN_OBSERVERS + Math.floor(random.nextUniform(0, MAX_OBSERVERS - MIN_OBSERVERS + 1));
  const wrongIndex = band === null ? -1 : Math.floor(random.nextUniform(0, count));
  const observations = Array.from({ length: count }, (_unused, index): Bearing => {
    const observer = unwrapOk(
      destinationPosition(
        target,
        random.nextUniform(0, TWO_PI_RAD),
        random.nextUniform(500, 15_000),
      ),
    );
    const azimuthSigmaRad = random.nextUniform(0.5 * DEG, 2 * DEG);
    let errorRad = random.nextGaussian(0, azimuthSigmaRad);
    if (index === wrongIndex && band !== null) {
      const sign = random.nextUnit() < 0.5 ? -1 : 1;
      errorRad += sign * random.nextUniform(band[0] * DEG, band[1] * DEG);
    }
    return {
      id: `b${String(index).padStart(2, '0')}`,
      observer,
      positionAccuracyM: 0,
      timeUtcMs: 0,
      azimuthRad: _wrapTwoPi(unwrapOk(initialAzimuthRad(observer, target)) + errorRad),
      azimuthSigmaRad,
    };
  });
  return {
    observations,
    wrongId: band === null ? null : `b${String(wrongIndex).padStart(2, '0')}`,
  };
}

function outcomeOf(observations: readonly Bearing[], wrongId: string | null): Outcome {
  const result = solve(new BearingModel(), observations, { outlierRejection: true });
  if (!result.ok) return `failed:${result.reason}`;
  const excluded = result.value.excludedIds;
  if (excluded.length === 0) return 'none';
  if (wrongId === null || !excluded.includes(wrongId)) return 'goodInstead';
  return excluded.length === 1 ? 'wrongAlone' : 'wrongAndOthers';
}

/** `sets` sets of `band` from `seed`, solved with outlier rejection enabled. */
function runExperiment(seed: number, band: Band, sets = SETS_PER_BAND): ExperimentResult {
  const random = createSeededRandom(seed);
  const byCount = new Map<number, Map<Outcome, number>>();
  for (let set = 0; set < sets; set += 1) {
    const { observations, wrongId } = drawSet(random, band);
    const outcome = outcomeOf(observations, wrongId);
    const counts = byCount.get(observations.length) ?? new Map<Outcome, number>();
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
    byCount.set(observations.length, counts);
  }
  return { sets, byCount };
}

/** The number of sets with `outcome`, over the observer counts accepted by `countFilter`. */
function total(
  result: ExperimentResult,
  outcome: (o: Outcome) => boolean,
  countFilter: (count: number) => boolean = () => true,
): number {
  let sum = 0;
  for (const [count, counts] of result.byCount) {
    if (!countFilter(count)) continue;
    for (const [key, value] of counts) if (outcome(key)) sum += value;
  }
  return sum;
}

const isFailure = (outcome: Outcome): boolean => outcome.startsWith('failed:');

/** Req 10.10's report: shares by number of observers, then for all, as a fixed-width table. */
function report(title: string, result: ExperimentResult): string {
  const outcomes = new Set<Outcome>(['wrongAlone', 'wrongAndOthers', 'goodInstead', 'none']);
  for (const counts of result.byCount.values()) for (const key of counts.keys()) outcomes.add(key);
  const columns = [...outcomes];
  const widthOf = (column: string): number => Math.max(16, column.length + 2);
  const percent = (part: number, whole: number): string =>
    whole === 0 ? '-' : `${((100 * part) / whole).toFixed(1)}%`;
  const row = (label: string, filter: (count: number) => boolean): string => {
    const sets = total(result, () => true, filter);
    const cells = columns.map((column) =>
      percent(
        total(result, (o) => o === column, filter),
        sets,
      ).padStart(widthOf(column)),
    );
    return `${label.padEnd(6)}${String(sets).padStart(6)}${cells.join('')}`;
  };
  const counts = [...result.byCount.keys()].sort((a, b) => a - b);
  return [
    title,
    `${'n'.padEnd(6)}${'sets'.padStart(6)}${columns.map((c) => c.padStart(widthOf(c))).join('')}`,
    ...counts.map((count) => row(String(count), (c) => c === count)),
    row('6+', (c) => c >= 6),
    row('all', () => true),
  ].join('\n');
}

// The seed of the experiment (testing.md: statistical tests take a fixed seed as an argument).
const SEED = 20_261_119;

describe('outlier rejection under noise (Req 10.10, 10.11)', { timeout: 300_000 }, () => {
  // P-10.10. Validates Requirement 10.10. 2 000 sets in each band, from one seed per band.
  BANDS.forEach((band, index) => {
    it(`P-10.10: one azimuth ${band[0]}° to ${band[1]}° wrong: a Fix in 99 % of the sets, a good one excluded in its place in at most 2 % with 6 or more`, () => {
      const result = runExperiment(SEED + index, band);
      printReport(
        report(`Req 10.10, wrong by ${band[0]}° to ${band[1]}°, seed ${SEED + index}`, result),
      );
      expect(result.sets).toBe(SETS_PER_BAND);
      const fixes = result.sets - total(result, isFailure);
      expect(fixes / result.sets).toBeGreaterThanOrEqual(0.99);
      const largeSets = total(
        result,
        () => true,
        (count) => count >= 6,
      );
      const goodInstead = total(
        result,
        (o) => o === 'goodInstead',
        (count) => count >= 6,
      );
      expect(goodInstead / largeSets).toBeLessThanOrEqual(0.02);
    });
  });

  // P-10.11. Validates Requirement 10.11. 2 000 noise-only sets.
  it('P-10.11: noise only: a Fix in every set, an exclusion in at most 2 % of the sets', () => {
    const result = runExperiment(SEED + BANDS.length, null);
    printReport(report(`Req 10.11, noise only, seed ${SEED + BANDS.length}`, result));
    expect(total(result, isFailure)).toBe(0);
    expect(total(result, (o) => o === 'goodInstead') / result.sets).toBeLessThanOrEqual(0.02);
  });

  it('gives the identical result when run twice with the same seed', () => {
    const first = runExperiment(SEED, BANDS[0] ?? null, 300);
    const second = runExperiment(SEED, BANDS[0] ?? null, 300);
    expect(second).toStrictEqual(first);
    expect(runExperiment(SEED + 1, BANDS[0] ?? null, 300)).not.toStrictEqual(first);
  });
});
