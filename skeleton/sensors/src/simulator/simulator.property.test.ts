import fc from 'fast-check';
import { describe, it } from 'vitest';
import { captureBearing, MIN_CAPTURE_SIGMA_RAD } from '../capture';
import { rss } from '../circular-summary';
import type { FrameResetEvent } from '../frame-reset';
import type { OrientationSample } from '../orientation-sample';
import type { PositionFix } from '../position-fix';
import { cameraAxis, directionApparentAltitudeRad } from '../rotation';
import type { SensorResult } from '../sensor-result';
import { angleErrorRad } from '../test-support/angle-compare';
import { deepSame } from '../test-support/deep-same';
import { cappedRuns } from '../test-support/fast-check-setup';
import { compassCaptureScript, simulatorScript } from '../test-support/generators';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { yawReferenceFromCompass } from '../yaw-reference';
import { createSimulator } from './simulator';
import type { SimulatorScript } from './simulator-script';

const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };
const HEADING_SIGMA_RAD = 2 * (Math.PI / 180);
const COMPASS_LIMIT_RAD = 30 * (Math.PI / 180);

function inWindow(sample: OrientationSample, startUtcMs: number, endUtcMs: number): boolean {
  return sample.timeUtcMs >= startUtcMs && sample.timeUtcMs <= endUtcMs;
}

describe('Simulator properties', () => {
  // P-12.7 — validates Req 12.7: for noise-free Relative-frame scripts whose generated samples all
  // have Camera altitudes in [-30°, 30°], a compass Yaw reference (the direction may move during
  // its window) and a bearing captured with the scripted Declination, over a window where the
  // direction is constant and with no Frame reset between them, give the scripted true azimuth
  // within 1e-9 rad and the 1-sigma max(0.01°, rss(heading 1-sigma, Declination 1-sigma)) within
  // 1e-12 rad. The domain applies to the computed altitudes: `fc.pre` discards the scripts whose
  // samples in either window round outside ±30°. 10 000 cases in test:deep (design §8).
  it('P-12.7: compass reference and capture recover the scripted true azimuth', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-12.7',
      fc.property(compassCaptureScript(), (scenario) => {
        const created = createSimulator(scenario.script, 7, OPTIONS);
        if (!created.ok) return false;
        const { source, controls } = created.value;
        const samples: OrientationSample[] = [];
        const resets: FrameResetEvent[] = [];
        source.onOrientation((s) => {
          if (s.ok) samples.push(s.value);
        });
        source.onFrameReset((r) => resets.push(r));
        void source.startOrientation();
        if (!controls.advanceTo(scenario.captureEndUtcMs + 5000).ok) return false;

        const read = samples.filter(
          (s) =>
            inWindow(s, scenario.yawStartUtcMs, scenario.yawEndUtcMs) ||
            inWindow(s, scenario.captureStartUtcMs, scenario.captureEndUtcMs),
        );
        for (const sample of read) {
          const axis = cameraAxis(sample.rotation);
          const altitude = axis.ok ? directionApparentAltitudeRad(axis.value) : axis;
          fc.pre(altitude.ok && Math.abs(altitude.value) <= COMPASS_LIMIT_RAD);
        }

        const reference = yawReferenceFromCompass({
          samples,
          frameResets: resets,
          window: {
            endUtcMs: scenario.yawEndUtcMs,
            windowLengthMs: scenario.yawEndUtcMs - scenario.yawStartUtcMs,
            minSampleCount: scenario.minSampleCount,
            sampleStalenessMs: 0,
          },
          headingSigmaRad: HEADING_SIGMA_RAD,
        });
        if (!reference.ok) return false;
        const declination = {
          declinationRad: scenario.script.declinationRad,
          sigmaRad: scenario.declinationSigmaRad,
        };
        const bearing = captureBearing({
          id: 'sim',
          timeUtcMs: scenario.captureEndUtcMs,
          samples,
          frameResets: resets,
          window: {
            endUtcMs: scenario.captureEndUtcMs,
            windowLengthMs: scenario.captureEndUtcMs - scenario.captureStartUtcMs,
            minSampleCount: scenario.minSampleCount,
            sampleStalenessMs: 0,
          },
          yawReference: reference.value,
          yawReferenceMaxAgeMs: 1_000_000,
          headingSigmaRad: HEADING_SIGMA_RAD,
          declination,
          positionFix: {
            position: { latRad: 0.4, lonRad: 2 },
            reportedAccuracyM: 5,
            sigmaM: 5,
            timeUtcMs: scenario.captureEndUtcMs,
          },
          positionStalenessMs: 30_000,
          coarseLocationLimitM: 100,
        });
        if (!bearing.ok) return false;
        const azimuthError = angleErrorRad(bearing.value.azimuthRad, scenario.captureAzimuthRad);
        const expectedSigma = Math.max(
          MIN_CAPTURE_SIGMA_RAD,
          rss(HEADING_SIGMA_RAD, scenario.declinationSigmaRad),
        );
        const sigmaError = Math.abs(bearing.value.azimuthSigmaRad - expectedSigma);
        tracker.record('azimuth error', azimuthError, '1e-9');
        tracker.record('sigma error', sigmaError, '1e-12');
        return azimuthError <= 1e-9 && sigmaError <= 1e-12;
      }),
      tracker,
      { numRuns: cappedRuns() },
    );
  });

  // P-12.8 — validates Req 12.4 and 12.8: two runs of the same script and seed, driven by the same
  // calls, give deep-equal output sequences, `Object.is` on every number. 10 000 cases in test:deep.
  it('P-12.8: the Simulator is deterministic', () => {
    const tracker = new ErrorTracker();
    type Output =
      | { kind: 'sample'; value: SensorResult<OrientationSample> }
      | { kind: 'reset'; value: FrameResetEvent }
      | { kind: 'fix'; value: SensorResult<PositionFix> };
    const runOnce = (
      script: SimulatorScript,
      seed: number,
      askPermission: boolean,
      steps: readonly number[],
    ) => {
      const created = createSimulator(script, seed, OPTIONS);
      if (!created.ok) return created;
      const { source, controls } = created.value;
      const outputs: Output[] = [];
      source.onOrientation((value) => outputs.push({ kind: 'sample', value }));
      source.onFrameReset((value) => outputs.push({ kind: 'reset', value }));
      source.onPosition((value) => outputs.push({ kind: 'fix', value }));
      if (askPermission) void source.requestOrientationPermission();
      void source.startOrientation();
      void source.startPosition();
      let t = script.startUtcMs;
      for (const step of steps) {
        t += step;
        controls.advanceTo(t);
      }
      return outputs;
    };
    checkProperty(
      'P-12.8',
      fc.property(
        fc.oneof(simulatorScript(), simulatorScript(true)),
        fc.noBias(fc.integer({ min: 0, max: 2 ** 32 - 1 })),
        fc.boolean(),
        fc.array(fc.noBias(fc.integer({ min: 0, max: 10_000 })), { minLength: 1, maxLength: 5 }),
        (script, seed, askPermission, steps) => {
          const first = runOnce(script, seed, askPermission, steps);
          const second = runOnce(script, seed, askPermission, steps);
          const same = deepSame(first, second);
          tracker.record('runs that differ (count)', same ? 0 : 1, '0');
          return same;
        },
      ),
      tracker,
      { numRuns: cappedRuns() },
    );
  });
});
