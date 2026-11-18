// Builds a Sample history from a Simulator script, using Sensors' public API only (design §8,
// `scriptHistory`; test support, not exported). The history is what a Session would hold: the
// Simulator's listeners deliver the samples, the Frame resets and the Position fixes, and
// Sensors' `createSampleHistory` and `add…` functions build the history from them.

import {
  addFrameReset,
  addOrientationSample,
  addPositionFix,
  createSampleHistory,
  createSimulator,
  FRAME_RESET_RETENTION_MS,
  SAMPLE_RETENTION_MS,
  type FrameResetEvent,
  type OrientationSample,
  type PositionFix,
  type SampleHistory,
  type SensorSourceOptions,
  type SimulatorScript,
  type TruePose,
} from '@alidade/sensors';

/** What the helper asks of the Simulator, in order: aim (if a pose is given), then advance. */
export interface ScriptStep {
  readonly aim: TruePose | null;
  readonly advanceToUtcMs: number;
}

export interface ScriptRun {
  readonly script: SimulatorScript;
  readonly seed: number;
  /** In order; the advances never go backwards. */
  readonly steps: readonly ScriptStep[];
}

/** Everything a run delivered, and the history built from it. */
export interface ScriptHistory {
  readonly history: SampleHistory;
  /** Every successful Orientation sample, in delivery order. */
  readonly samples: readonly OrientationSample[];
  /** Every Orientation failure delivered (a `null` angle, say). */
  readonly sampleFailures: number;
  readonly frameResets: readonly FrameResetEvent[];
  readonly fixes: readonly PositionFix[];
  /** The time the Simulator ended at. */
  readonly endUtcMs: number;
}

const OPTIONS: SensorSourceOptions = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

function must<T>(result: { ok: true; value: T } | { ok: false; reason: string }, what: string): T {
  if (!result.ok) throw new Error(`${what}: ${result.reason}`);
  return result.value;
}

/**
 * Runs the script on a Simulator with the given seed. The permission is requested, orientation
 * and positions are started at the script's start, and the steps are applied in order. A script
 * whose orientation is missing, denied or on an insecure page simply delivers nothing.
 * Throws only on a programmer error (an invalid script or a step going backwards).
 */
export function buildHistoryFromRun(
  run: ScriptRun,
  retention = {
    sampleRetentionMs: SAMPLE_RETENTION_MS,
    frameResetRetentionMs: FRAME_RESET_RETENTION_MS,
  },
): ScriptHistory {
  const { source, controls } = must(
    createSimulator(run.script, run.seed, OPTIONS),
    'createSimulator',
  );
  let history = must(createSampleHistory(retention), 'createSampleHistory');
  const samples: OrientationSample[] = [];
  const frameResets: FrameResetEvent[] = [];
  const fixes: PositionFix[] = [];
  let sampleFailures = 0;

  source.onOrientation((result) => {
    if (!result.ok) {
      sampleFailures += 1;
      return;
    }
    samples.push(result.value);
    const next = addOrientationSample(history, result.value);
    if (next.ok) history = next.value;
  });
  source.onFrameReset((event) => {
    frameResets.push(event);
    const next = addFrameReset(history, event);
    if (next.ok) history = next.value;
  });
  source.onPosition((result) => {
    if (!result.ok) return;
    fixes.push(result.value);
    const next = addPositionFix(history, result.value);
    if (next.ok) history = next.value;
  });

  // The permission and start calls take effect synchronously; their promises are not awaited.
  void source.requestOrientationPermission();
  void source.startOrientation();
  void source.startPosition();

  for (const step of run.steps) {
    if (step.aim !== null) must(controls.aim(step.aim), 'aim');
    must(controls.advanceTo(step.advanceToUtcMs), 'advanceTo');
  }
  const endUtcMs = source.now();
  source.stop();
  return { history, samples, sampleFailures, frameResets, fixes, endUtcMs };
}

/**
 * A history of `azimuthsRad.length` samples, one per azimuth, in order, one event interval
 * apart: the camera is aimed at each azimuth, at the apparent altitude and roll given, and the
 * Simulator advanced to the next event. `script` should be noise-free for the samples to carry
 * exactly these azimuths. Used for the sets within 30° of a common direction (P-9.11).
 */
export function historyOfAimedAzimuths(
  script: SimulatorScript,
  seed: number,
  azimuthsRad: readonly number[],
  apparentAltitudeRad = 0,
  rollRad = 0,
): ScriptHistory {
  const steps: ScriptStep[] = azimuthsRad.map((azimuthRad, i) => ({
    aim: { azimuthRad, apparentAltitudeRad, rollRad },
    advanceToUtcMs: script.startUtcMs + i * script.eventIntervalMs,
  }));
  return buildHistoryFromRun({ script, seed, steps });
}
