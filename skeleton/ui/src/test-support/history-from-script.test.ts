import {
  addFrameReset,
  addOrientationSample,
  addPositionFix,
  createSampleHistory,
  createSimulator,
  directionAzimuthRad,
  FRAME_RESET_RETENTION_MS,
  rayDirection,
  SAMPLE_RETENTION_MS,
  type FrameResetEvent,
  type OrientationSample,
  type PositionFix,
  type SampleHistory,
  type SimulatorScript,
} from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deepSame } from './deep-same';
import { buildHistoryFromRun, historyOfAimedAzimuths } from './history-from-script';
import { scriptHistory, scriptRun } from './script-history';
import { SCRIPT_START_UTC_MS, simulatorScript } from './scripts';

const DEG = Math.PI / 180;

const SCRIPT: SimulatorScript = {
  startUtcMs: SCRIPT_START_UTC_MS,
  eventIntervalMs: 50,
  pose: [
    { timeUtcMs: SCRIPT_START_UTC_MS, azimuthRad: 1, apparentAltitudeRad: 0.2, rollRad: 0 },
    {
      timeUtcMs: SCRIPT_START_UTC_MS + 4000,
      azimuthRad: 1.5,
      apparentAltitudeRad: 0.1,
      rollRad: 0,
    },
  ],
  orientationNoiseSigmaRad: 0.2 * DEG,
  altitudeBiasRad: 0,
  frame: {
    kind: 'relative',
    zeroRad: 2,
    resets: [{ timeUtcMs: SCRIPT_START_UTC_MS + 1000, cause: 'hidden', newZeroRad: 3 }],
  },
  heading: { biasRad: 0, noiseSigmaRad: 0.01, jumps: [], reportedAccuracyDeg: 10 },
  screenAngleDeg: 0,
  declinationRad: 0.1,
  position: {
    kind: 'fix',
    position: { latRad: 0.5, lonRad: 0.5 },
    reportedAccuracyM: 10,
    firstFixDelayMs: 500,
    fixIntervalMs: 1000,
  },
  orientation: 'available',
  orientationPermission: 'granted',
  secureContext: true,
};

/** The same run, the events added by hand to a history, with no helper of ours in the loop. */
function byHand(seed: number, endUtcMs: number): SampleHistory {
  const created = createSimulator(SCRIPT, seed, {
    listeningTimeoutMs: 3000,
    positionTimeoutMs: 30_000,
    positionConfidenceScale: 1,
  });
  if (!created.ok) throw new Error('simulator');
  const events: (
    | { kind: 'sample'; value: OrientationSample }
    | { kind: 'reset'; value: FrameResetEvent }
    | { kind: 'fix'; value: PositionFix }
  )[] = [];
  const { source, controls } = created.value;
  source.onOrientation((r) => {
    if (r.ok) events.push({ kind: 'sample', value: r.value });
  });
  source.onFrameReset((value) => events.push({ kind: 'reset', value }));
  source.onPosition((r) => {
    if (r.ok) events.push({ kind: 'fix', value: r.value });
  });
  void source.requestOrientationPermission();
  void source.startOrientation();
  void source.startPosition();
  controls.advanceTo(endUtcMs);
  const history = createSampleHistory({
    sampleRetentionMs: SAMPLE_RETENTION_MS,
    frameResetRetentionMs: FRAME_RESET_RETENTION_MS,
  });
  if (!history.ok) throw new Error('history');
  let h = history.value;
  for (const e of events) {
    const next =
      e.kind === 'sample'
        ? addOrientationSample(h, e.value)
        : e.kind === 'reset'
          ? addFrameReset(h, e.value)
          : addPositionFix(h, e.value);
    if (next.ok) h = next.value;
  }
  return h;
}

describe('buildHistoryFromRun (design §8)', () => {
  it('equals the history built by adding the same events by hand', () => {
    const end = SCRIPT_START_UTC_MS + 3000;
    const built = buildHistoryFromRun({
      script: SCRIPT,
      seed: 7,
      steps: [{ aim: null, advanceToUtcMs: end }],
    });
    const expected = byHand(7, end);
    expect(deepSame(built.history, expected)).toBe(true);
    expect(built.history.samples.length).toBeGreaterThan(30);
    expect(built.history.frameResets).toHaveLength(1);
    expect(built.history.positionFix).not.toBeNull();
    expect(built.endUtcMs).toBe(end);
  });

  it('is deterministic for a script and a seed, and differs for another seed', () => {
    const run = {
      script: SCRIPT,
      seed: 7,
      steps: [{ aim: null, advanceToUtcMs: SCRIPT_START_UTC_MS + 1500 }],
    };
    expect(deepSame(buildHistoryFromRun(run).history, buildHistoryFromRun(run).history)).toBe(true);
    expect(
      deepSame(buildHistoryFromRun(run).history, buildHistoryFromRun({ ...run, seed: 8 }).history),
    ).toBe(false);
  });

  it('delivers nothing for a script whose permission is denied', () => {
    const built = buildHistoryFromRun({
      script: { ...SCRIPT, orientationPermission: 'denied' },
      seed: 1,
      steps: [{ aim: null, advanceToUtcMs: SCRIPT_START_UTC_MS + 1000 }],
    });
    expect(built.samples).toHaveLength(0);
  });
});

describe('historyOfAimedAzimuths', () => {
  it('gives one sample per azimuth, in order, at the aimed azimuth', () => {
    const script: SimulatorScript = {
      ...SCRIPT,
      orientationNoiseSigmaRad: 0,
      altitudeBiasRad: 0,
      frame: { kind: 'absolute', northErrorRad: 0, resets: [] },
      heading: null,
      declinationRad: 0,
    };
    const azimuths = [0.1, 0.5, 6.2, 3.0];
    const built = historyOfAimedAzimuths(script, 3, azimuths);
    expect(built.samples).toHaveLength(4);
    built.samples.forEach((sample, i) => {
      const direction = rayDirection(sample.rotation);
      expect(direction.ok).toBe(true);
      if (!direction.ok) return;
      const azimuth = directionAzimuthRad(direction.value);
      expect(azimuth.ok && Math.abs(azimuth.value - (azimuths[i] ?? Number.NaN)) < 1e-9).toBe(true);
      expect(sample.timeUtcMs).toBe(script.startUtcMs + i * script.eventIntervalMs);
    });
  });
});

describe('scriptRun and scriptHistory generators', () => {
  it('draw steps that never go backwards and build histories, some of them empty', () => {
    const runs = fc.sample(scriptRun(), { numRuns: 300, seed: 5 });
    for (const run of runs) {
      let previous = run.script.startUtcMs;
      for (const step of run.steps) {
        expect(step.advanceToUtcMs).toBeGreaterThanOrEqual(previous);
        previous = step.advanceToUtcMs;
      }
    }
    const built = fc.sample(scriptHistory(), { numRuns: 150, seed: 5 });
    expect(built.some((b) => b.built.samples.length > 20)).toBe(true);
    expect(built.some((b) => b.built.samples.length === 0)).toBe(true);
    expect(built.some((b) => b.built.frameResets.length > 0)).toBe(true);
    expect(built.some((b) => b.built.history.positionFix !== null)).toBe(true);
  });

  it('draws noise-free scripts with no noise, bias, jump or frame error', () => {
    for (const script of fc.sample(simulatorScript(true), { numRuns: 200, seed: 9 })) {
      expect(script.orientationNoiseSigmaRad).toBe(0);
      expect(script.altitudeBiasRad).toBe(0);
      if (script.frame.kind === 'absolute') expect(script.frame.northErrorRad).toBe(0);
      if (script.heading !== null) {
        expect(script.heading.noiseSigmaRad).toBe(0);
        expect(script.heading.jumps).toEqual([]);
      }
    }
  });
});
