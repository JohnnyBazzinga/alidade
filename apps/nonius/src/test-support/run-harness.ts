// The harness of the statistical tests (design D22; test support, not exported). One pass over
// runs gives the coverage of Req 7.3, the false alarms of Req 8.5 and the one-wrong-Sight shares
// of Req 8.6, by band of the Common sigma and by count, every failure reason and the Two places.
//
// A run draws, from its own seeded generator: the true Position (latitude uniform in [-70°, 70°],
// longitude uniform), the start (uniform in 2026 to 2029), the count (2 to 6), the spread (2 to 9
// hours), the times (uniform in the spread at one-minute resolution), redrawing the whole set
// when the Sun at the Position is outside [5°, 80°] at a time (counted in `redraws`). The noise
// is that of Req 7.3: a shared error from a normal of the Common sigma, one independent error per
// Sight from a normal of the Independent sigma (0.5°), and a `true` Sun side with 5° of noise.
// No clock and no `Math.random`: the seed is an argument.

import { greatCircleDistanceM, projectToLocalPlane, type Position } from '@alidade/core';
import { assess, type Assessment } from '../math/fix/assess';
import { geometryClass, type GeometryClass } from '../math/fix/geometry-class';
import type { ShownFix } from '../math/fix/solve-candidate';
import { DEG_TO_RAD } from '../math/degrees';
import type { NoniusParameters } from '../math/parameters';
import type { IndexError } from '../math/sight/index-error';
import { sunAt } from '../math/sun/sun-at';
import { noisySights, SUN_SIDE_NOISE_RAD } from './noisy-sights';
import { createSeededNormal } from './seeded-normal';
import { OUTLIER_STUDENTISED_RESIDUAL, ellipse95 } from '@alidade/core';

export interface Share {
  size: number;
  hits: number;
}

export interface WrongShares {
  size: number;
  disagreementSaid: number;
  wrongAloneSetAside: number;
  goodSetAside: number;
}

export interface BandReport {
  readonly commonSigmaRad: number;
  readonly runs: number;
  readonly redraws: number;
  /** Runs ending in a Shown Fix, in Two places, and each failure reason. */
  readonly outcomes: { fix: number; twoPlaces: number; failed: Record<string, number> };
  /** The true Position inside the 95 % ellipse: runs with a Shown Fix whose class is not `poor`. */
  readonly coverage: Share;
  readonly coveragePoor: Share;
  readonly coverageByClass: Record<GeometryClass, Share>;
  readonly coverageByCount: Record<number, Share>;
  /** Runs with 3 to 6 Sights and no wrong one: the app said they disagree, or set one aside. */
  readonly falseAlarm: Share;
  readonly falseAlarmByCount: Record<number, Share>;
  /** With one wrong Sight (Req 8.6): by size of error, in bands of degrees. */
  readonly wrongByError: Record<string, WrongShares>;
  readonly wrongByCount: Record<number, WrongShares>;
}

export interface HarnessOptions {
  readonly seed: number;
  readonly runs: number;
  readonly commonSigmaRad: number;
  readonly independentSigmaRad: number;
  /** One Sight's altitude wrong by an error drawn in `[minRad, maxRad]`, either sign (Req 8.6). */
  readonly wrong?: { readonly minRad: number; readonly maxRad: number };
  /** 3 to 6 Sights only (the false-alarm group); default 2 to 6. */
  readonly minCount?: number;
}

const D = DEG_TO_RAD;
const ERROR_BANDS: readonly (readonly [string, number, number])[] = [
  ['3°–6°', 3, 6],
  ['6°–10°', 6, 10],
  ['10°–20°', 10, 20],
];
const CLASSES: readonly GeometryClass[] = ['none', 'poor', 'fair', 'good'];

const emptyShare = (): Share => ({ size: 0, hits: 0 });
const emptyWrong = (): WrongShares => ({
  size: 0,
  disagreementSaid: 0,
  wrongAloneSetAside: 0,
  goodSetAside: 0,
});

/** Whether `truth` lies inside the 95 % ellipse of `fix`. */
export function insideEllipse95(
  fix: Pick<ShownFix, 'position' | 'ellipse'>,
  truth: Position,
): boolean {
  const e95 = ellipse95(fix.ellipse);
  const offset = projectToLocalPlane(fix.position, truth);
  if (!e95.ok || !offset.ok) return false;
  const { azimuthRad } = fix.ellipse;
  const along =
    offset.value.eastM * Math.sin(azimuthRad) + offset.value.northM * Math.cos(azimuthRad);
  const across =
    offset.value.eastM * Math.cos(azimuthRad) - offset.value.northM * Math.sin(azimuthRad);
  return (along / e95.value.semiMajorM) ** 2 + (across / e95.value.semiMinorM) ** 2 <= 1;
}

function distanceM(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  return r.ok ? r.value : Number.POSITIVE_INFINITY;
}

/** The Shown Fix, its check solve and the count of used Sights of the chosen place of a run. */
function chosenOf(a: Assessment, truth: Position) {
  if (a.kind === 'fix')
    return {
      fix: a.fix,
      check: a.check,
      usedCount: a.used.length + a.setAside.filter((s) => s.cause === 'outlier').length,
    };
  if (a.kind === 'two_places') {
    const [first, second] = a.places;
    const nearer =
      distanceM(first.fix.position, truth) <= distanceM(second.fix.position, truth)
        ? first
        : second;
    return { fix: nearer.fix, check: nearer.check, usedCount: a.used.length };
  }
  return null;
}

export function runBand(options: HarnessOptions, params: NoniusParameters): BandReport {
  const indexError: IndexError = {
    valueRad: 0,
    sigmaRad: options.commonSigmaRad,
    sightCount: 3,
    measuredUtcMs: 0,
    simulated: false,
  };
  const failed: Record<string, number> = {};
  let fix = 0;
  let twoPlaces = 0;
  let redraws = 0;
  const coverage = emptyShare();
  const coveragePoor = emptyShare();
  const coverageByClass = Object.fromEntries(CLASSES.map((c) => [c, emptyShare()])) as Record<
    GeometryClass,
    Share
  >;
  const coverageByCount: Record<number, Share> = {};
  const falseAlarm = emptyShare();
  const falseAlarmByCount: Record<number, Share> = {};
  const wrongByError: Record<string, WrongShares> = Object.fromEntries(
    ERROR_BANDS.map(([n]) => [n, emptyWrong()]),
  );
  const wrongByCount: Record<number, WrongShares> = {};
  const minCount = options.minCount ?? 2;

  for (let run = 0; run < options.runs; run += 1) {
    const rng = createSeededNormal(options.seed * 1_000_003 + run * 7 + 1);
    const uniform = (min: number, max: number) => min + (max - min) * rng.nextUnit();
    let truth: Position = { latRad: 0, lonRad: 0 };
    let times: number[];
    for (let attempt = 0; ; attempt += 1) {
      truth = { latRad: uniform(-70, 70) * D, lonRad: uniform(-180, 180) * D };
      const startMinute = Math.floor(
        uniform(Date.UTC(2026, 0, 1), Date.UTC(2030, 0, 1) - 1) / 60_000,
      );
      const count = Math.floor(uniform(minCount, 7));
      const spreadMinutes = uniform(2, 9) * 60;
      times = Array.from(
        { length: count },
        () => (startMinute + Math.round(uniform(0, spreadMinutes))) * 60_000,
      ).sort((a, b) => a - b);
      const usable = times.every((t) => {
        const sun = sunAt(truth, t, params);
        return (
          sun.ok &&
          sun.value.apparentAltitudeRad >= params.minSightAltitudeRad &&
          sun.value.apparentAltitudeRad <= params.maxSightAltitudeRad
        );
      });
      if (usable) break;
      redraws += 1;
      if (attempt > 10_000) throw new Error('no usable set found');
    }
    const count = times.length;
    const wrongIndex = options.wrong === undefined ? undefined : Math.floor(uniform(0, count));
    const wrongErrorRad =
      options.wrong === undefined
        ? 0
        : (rng.nextUnit() < 0.5 ? -1 : 1) * uniform(options.wrong.minRad, options.wrong.maxRad);
    const noisy = noisySights(
      truth,
      times,
      options.seed * 1_000_003 + run * 7 + 2,
      {
        commonSigmaRad: options.commonSigmaRad,
        independentSigmaRad: options.independentSigmaRad,
        sunSideSigmaRad: SUN_SIDE_NOISE_RAD,
        ...(wrongIndex === undefined
          ? {}
          : { wrong: { index: wrongIndex, errorRad: wrongErrorRad } }),
      },
      params,
    );
    const result = assess(noisy.sights, indexError, null, params);
    if (!result.ok) {
      failed[result.reason] = (failed[result.reason] ?? 0) + 1;
      continue;
    }
    const a = result.value;
    if (a.kind === 'failed') {
      failed[a.failure.reason] = (failed[a.failure.reason] ?? 0) + 1;
      continue;
    }
    if (a.kind === 'fix') fix += 1;
    else if (a.kind === 'two_places') twoPlaces += 1;
    else {
      failed[a.kind] = (failed[a.kind] ?? 0) + 1;
      continue;
    }
    const chosen = chosenOf(a, truth);
    if (chosen === null) continue;
    const cls = geometryClass(chosen.fix, params);
    const inside = insideEllipse95(chosen.fix, truth);
    if (cls.ok) {
      const bucket = cls.value === 'poor' ? coveragePoor : coverage;
      bucket.size += 1;
      if (inside) bucket.hits += 1;
      coverageByClass[cls.value].size += 1;
      if (inside) coverageByClass[cls.value].hits += 1;
      if (cls.value !== 'poor') {
        const byCount = (coverageByCount[count] ??= emptyShare());
        byCount.size += 1;
        if (inside) byCount.hits += 1;
      }
    }
    const outliers = chosen.check.excludedIds;
    const disagreement =
      count === 3 &&
      chosen.check.residuals.some(
        (r) => Math.abs(r.studentisedResidual) > OUTLIER_STUDENTISED_RESIDUAL,
      );
    if (options.wrong === undefined) {
      if (count >= 3) {
        const alarmed = disagreement || outliers.length > 0;
        falseAlarm.size += 1;
        if (alarmed) falseAlarm.hits += 1;
        const byCount = (falseAlarmByCount[count] ??= emptyShare());
        byCount.size += 1;
        if (alarmed) byCount.hits += 1;
      }
    } else if (wrongIndex !== undefined && count >= 3) {
      const wrongId = noisy.sights[wrongIndex]?.id ?? '';
      const size = Math.abs(wrongErrorRad) / D;
      const band =
        ERROR_BANDS.find(([, low, high]) => size >= low && size <= high)?.[0] ?? '10°–20°';
      const targets = [wrongByError[band] ?? emptyWrong(), (wrongByCount[count] ??= emptyWrong())];
      for (const t of targets) {
        t.size += 1;
        if (disagreement) t.disagreementSaid += 1;
        if (outliers.length === 1 && outliers[0] === wrongId) t.wrongAloneSetAside += 1;
        if (outliers.some((id) => id !== wrongId)) t.goodSetAside += 1;
      }
    }
  }
  return {
    commonSigmaRad: options.commonSigmaRad,
    runs: options.runs,
    redraws,
    outcomes: { fix, twoPlaces, failed },
    coverage,
    coveragePoor,
    coverageByClass,
    coverageByCount,
    falseAlarm,
    falseAlarmByCount,
    wrongByError,
    wrongByCount,
  };
}

/** `hits / size` as a fraction, or `null` for an empty group. */
export function shareOf(s: Share): number | null {
  return s.size === 0 ? null : s.hits / s.size;
}

/** One printable line for a share. */
export function shareText(label: string, s: Share): string {
  const share = shareOf(s);
  return `${label}: ${s.hits}/${s.size}${share === null ? '' : ` = ${(100 * share).toFixed(1)} %`}`;
}
