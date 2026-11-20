// The statistical harness of P-17.9 (design §10, Req 17.9; test support, not exported).
//
// For a scene, a run and a seed, each Station's script is played on Sensors' Simulator, its
// samples, Frame resets and Position fix go into Sensors' sample history, and the Bearing is
// Sensors' own `captureBearing` over the last `SIGHTING_WINDOW_LENGTH_MS`, with the Declination of
// `declinationAt` (the Absolute frame needs it), Sensors' heading sigma and no Yaw reference. It
// does not use UI's Session: the Session's capture is covered by UI's own property, and
// `captureBearing` is what the Session calls. The Bearing's id is the Station id.
//
// The Fix is Core's `solve` with `outlierRejection: true`, as the app calls it. The target is
// inside the 95 % ellipse when, with (u, v) its offset from the Fix on the Local plane rotated to
// the ellipse's axes, (u / a95)² + (v / b95)² ≤ 1.

import {
  BearingModel,
  ellipse95,
  projectToLocalPlane,
  solve,
  type Bearing,
  type Fix,
  type Position,
} from '@alidade/core';
import {
  addFrameReset,
  addOrientationSample,
  addPositionFix,
  captureBearing,
  COARSE_LOCATION_LIMIT_M,
  createSampleHistory,
  createSimulator,
  declinationAt,
  FRAME_RESET_RETENTION_MS,
  HEADING_SIGMA_RAD,
  MIN_SAMPLE_COUNT,
  POSITION_STALENESS_MS,
  SAMPLE_RETENTION_MS,
  SAMPLE_STALENESS_MS,
  SIGHTING_WINDOW_LENGTH_MS,
  YAW_REFERENCE_MAX_AGE_MS,
  type SampleHistory,
} from '@alidade/sensors';
import type { CatalogueScene } from '@alidade/ui';
import { geometryClass } from '../math/fix/geometry-class';
import type { VigiaParameters } from '../math/parameters';
import { err, ok, type VigiaResult } from '../result';
import { createSeededNormal } from './seeded-normal';

/** Req 17.9: the least runs of the non-`poor` group for the bound to apply to a scene. */
export const BOUND_MIN_GROUP_SIZE = 100;
/** Req 17.9: the least percentage of runs with the target inside the 95 % ellipse. */
const LEAST_PERCENT = 90;
/** Req 17.9: the greatest percentage. */
const GREATEST_PERCENT = 99;

/** How long each Station's script is played: two windows, so that the window is full. */
const PLAY_MS = 2 * SIGHTING_WINDOW_LENGTH_MS;

const SIMULATOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

/** Whether the bound of Req 17.9 applies to a group of `size` runs: at least 100, not 99. */
export function boundApplies(size: number): boolean {
  return size >= BOUND_MIN_GROUP_SIZE;
}

/** Whether `inside` of `size` runs is a share from 90 % to 99 %, inclusive (integer arithmetic). */
export function shareWithinBounds(inside: number, size: number): boolean {
  return (
    size > 0 && inside * 100 >= LEAST_PERCENT * size && inside * 100 <= GREATEST_PERCENT * size
  );
}

/** The north error of Station `stationIndex` in run `run`: HEADING_SIGMA_RAD times a normal draw. */
export function drawnNorthErrorRad(seed: number, run: number, stationIndex: number): number {
  return HEADING_SIGMA_RAD * createSeededNormal(seed + 1000 * run + stationIndex).next();
}

export interface CaptureOptions {
  readonly seed: number;
  readonly run: number;
  /**
   * The north error to give a Station's script (its Absolute frame's `northErrorRad`), or `null`
   * to keep the script's own. Default: every script is kept.
   */
  readonly northErrorRadOf?: (stationId: string, stationIndex: number) => number | null;
}

function captureStation(
  entry: CatalogueScene,
  stationId: string,
  stationIndex: number,
  options: CaptureOptions,
): VigiaResult<Bearing> {
  const base = entry.scripts[stationId];
  if (base === undefined) return err('invalid_number', { field: 'stationId' });
  const northErrorRad = options.northErrorRadOf?.(stationId, stationIndex) ?? null;
  const script =
    northErrorRad === null
      ? base
      : { ...base, frame: { kind: 'absolute' as const, northErrorRad, resets: [] } };
  const runSeed = options.seed + 1000 * options.run + stationIndex;
  const sim = createSimulator(script, runSeed, SIMULATOR_OPTIONS);
  if (!sim.ok) return sim;
  const { source, controls } = sim.value;
  const created = createSampleHistory({
    sampleRetentionMs: SAMPLE_RETENTION_MS,
    frameResetRetentionMs: FRAME_RESET_RETENTION_MS,
  });
  if (!created.ok) return created;
  let history: SampleHistory = created.value;
  source.onOrientation((result) => {
    if (!result.ok) return;
    const next = addOrientationSample(history, result.value);
    if (next.ok) history = next.value;
  });
  source.onFrameReset((event) => {
    const next = addFrameReset(history, event);
    if (next.ok) history = next.value;
  });
  source.onPosition((result) => {
    if (!result.ok) return;
    const next = addPositionFix(history, result.value);
    if (next.ok) history = next.value;
  });
  // The calls take effect at once in the Simulator; their promises are not awaited.
  void source.requestOrientationPermission();
  void source.startOrientation();
  void source.startPosition();
  const advanced = controls.advanceTo(script.startUtcMs + PLAY_MS);
  const endUtcMs = source.now();
  source.stop();
  if (!advanced.ok) return advanced;

  const positionFix = history.positionFix;
  if (positionFix === null) return err('position_unavailable');
  const declination = declinationAt(positionFix.position, endUtcMs);
  if (!declination.ok) return declination;
  const captured = captureBearing({
    id: stationId,
    timeUtcMs: endUtcMs,
    samples: history.samples,
    frameResets: history.frameResets,
    window: {
      endUtcMs,
      windowLengthMs: SIGHTING_WINDOW_LENGTH_MS,
      minSampleCount: MIN_SAMPLE_COUNT,
      sampleStalenessMs: SAMPLE_STALENESS_MS,
    },
    yawReferenceMaxAgeMs: YAW_REFERENCE_MAX_AGE_MS,
    headingSigmaRad: HEADING_SIGMA_RAD,
    declination: declination.value,
    positionFix,
    positionStalenessMs: POSITION_STALENESS_MS,
    coarseLocationLimitM: COARSE_LOCATION_LIMIT_M,
  });
  return captured;
}

/** One Bearing for each Station of the scene, in the scene's order, or the first failure. */
export function captureScene(
  entry: CatalogueScene,
  options: CaptureOptions,
): VigiaResult<readonly Bearing[]> {
  const bearings: Bearing[] = [];
  for (const [index, station] of entry.scene.stations.entries()) {
    const bearing = captureStation(entry, station.id, index, options);
    if (!bearing.ok) return bearing;
    bearings.push(bearing.value);
  }
  return ok(bearings);
}

/** Whether `target` lies inside the 95 % ellipse of `fix` (only its position and ellipse are read). */
export function targetInsideEllipse95(
  fix: Pick<Fix, 'position' | 'ellipse'>,
  target: Position,
): VigiaResult<boolean> {
  const e95 = ellipse95(fix.ellipse);
  if (!e95.ok) return e95;
  const offset = projectToLocalPlane(fix.position, target);
  if (!offset.ok) return offset;
  const { eastM, northM } = offset.value;
  const { azimuthRad } = fix.ellipse;
  // The long axis points along `azimuthRad` (clockwise from north): (sin, cos) in (east, north).
  const alongM = eastM * Math.sin(azimuthRad) + northM * Math.cos(azimuthRad);
  const acrossM = eastM * Math.cos(azimuthRad) - northM * Math.sin(azimuthRad);
  const { semiMajorM, semiMinorM } = e95.value;
  return ok((alongM / semiMajorM) ** 2 + (acrossM / semiMinorM) ** 2 <= 1);
}

export interface GroupReport {
  /** The runs in which `solve` succeeded and the Fix is in this group. */
  readonly size: number;
  /** Of them, the runs with the target inside the 95 % ellipse. */
  readonly inside: number;
  /** `inside / size`, or `null` for an empty group. */
  readonly share: number | null;
}

export interface BoundedGroupReport extends GroupReport {
  /** Whether the bound of Req 17.9 applies (at least 100 runs). */
  readonly boundApplied: boolean;
  /** Whether the share is from 90 % to 99 %; `null` when the bound is not applied. */
  readonly withinBounds: boolean | null;
}

export interface SceneCoverage {
  readonly sceneId: string;
  readonly runs: number;
  /** Runs in which a Bearing could not be captured (a bug of the harness or the scene). */
  readonly captureFailures: number;
  /** Runs in which `solve` failed (or its Fix could not be classed). */
  readonly failedSolves: number;
  /** The reason of each failed solve, counted. */
  readonly failedSolveReasons: Readonly<Record<string, number>>;
  readonly notPoor: BoundedGroupReport;
  readonly poor: GroupReport;
  /** Runs in which Core set a (consistent) Bearing aside. */
  readonly runsWithConsistentSetAside: number;
}

function groupOf(inside: number, size: number): GroupReport {
  return { size, inside, share: size === 0 ? null : inside / size };
}

/**
 * The coverage of a scene: `runs` runs from `seed`, each Station's north error drawn per run from
 * a normal with the heading sigma, the catalogue's orientation noise kept, the target "smoke" of
 * the scene. A capture that fails is counted apart (`captureFailures`): it is a bug to look at.
 */
export function coverageOfScene(
  entry: CatalogueScene,
  options: { readonly seed: number; readonly runs: number },
  parameters: VigiaParameters,
): SceneCoverage {
  const target = entry.scene.targets.find((t) => t.id === entry.aimTargetId);
  if (target === undefined || target.kind !== 'landmark') {
    throw new Error('the scene has no landmark to aim at');
  }
  let captureFailures = 0;
  let failedSolves = 0;
  const reasons: Record<string, number> = {};
  const failed = (reason: string): void => {
    failedSolves += 1;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };
  let notPoorSize = 0;
  let notPoorInside = 0;
  let poorSize = 0;
  let poorInside = 0;
  let withSetAside = 0;
  for (let run = 0; run < options.runs; run += 1) {
    const captured = captureScene(entry, {
      seed: options.seed,
      run,
      northErrorRadOf: (_id, index) => drawnNorthErrorRad(options.seed, run, index),
    });
    if (!captured.ok) {
      captureFailures += 1;
      continue;
    }
    const solved = solve(new BearingModel(), captured.value, { outlierRejection: true });
    if (!solved.ok) {
      failed(solved.reason);
      continue;
    }
    const inside = targetInsideEllipse95(solved.value, target.position);
    const geometry = geometryClass(solved.value, parameters);
    if (!inside.ok || !geometry.ok) {
      failed(inside.ok ? (geometry.ok ? 'unknown' : geometry.reason) : inside.reason);
      continue;
    }
    if (solved.value.excludedIds.length > 0) withSetAside += 1;
    if (geometry.value === 'poor') {
      poorSize += 1;
      if (inside.value) poorInside += 1;
    } else {
      notPoorSize += 1;
      if (inside.value) notPoorInside += 1;
    }
  }
  const applied = boundApplies(notPoorSize);
  return {
    sceneId: entry.scene.id,
    runs: options.runs,
    captureFailures,
    failedSolves,
    failedSolveReasons: reasons,
    notPoor: {
      ...groupOf(notPoorInside, notPoorSize),
      boundApplied: applied,
      withinBounds: applied ? shareWithinBounds(notPoorInside, notPoorSize) : null,
    },
    poor: groupOf(poorInside, poorSize),
    runsWithConsistentSetAside: withSetAside,
  };
}
