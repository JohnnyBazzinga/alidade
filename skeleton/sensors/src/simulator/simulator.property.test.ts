import fc from 'fast-check';
import { describe, it } from 'vitest';
import { captureBearing, MIN_CAPTURE_SIGMA_RAD } from '../capture';
import { rss } from '../circular-summary';
import type { FrameResetEvent } from '../frame-reset';
import type { OrientationSample } from '../orientation-sample';
import type { PositionFix } from '../position-fix';
import { offAxisRay } from '../ray';
import { cameraAxis, directionApparentAltitudeRad, directionAzimuthRad } from '../rotation';
import type { SensorResult } from '../sensor-result';
import { angleErrorRad } from '../test-support/angle-compare';
import { deepSame } from '../test-support/deep-same';
import { cappedRuns } from '../test-support/fast-check-setup';
import {
  cameraPose,
  compassCaptureScript,
  rayOffset,
  simulatorScript,
} from '../test-support/generators';
import { angleBetweenRad } from '../test-support/reference-rotation';
import { baseScript } from '../test-support/scripts';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { yawReferenceFromCompass } from '../yaw-reference';
import { createSimulator } from './simulator';
import type { SimulatorScript, TruePose } from './simulator-script';

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

  // P-12.8 — validates Req 12.4, 12.8 and 12.10: two runs of the same script and seed, driven by
  // the same sequence of calls to the controls (advance, aim with a valid or an invalid pose,
  // read the true pose), give deep-equal output sequences, `Object.is` on every number, the
  // results of the control calls included. 10 000 cases in test:deep.
  type Output =
    | { kind: 'sample'; value: SensorResult<OrientationSample> }
    | { kind: 'reset'; value: FrameResetEvent }
    | { kind: 'fix'; value: SensorResult<PositionFix> }
    | { kind: 'control'; value: unknown };
  type Op =
    { kind: 'advance'; stepMs: number } | { kind: 'aim'; pose: TruePose } | { kind: 'truePose' };
  const runOnce = (
    script: SimulatorScript,
    seed: number,
    askPermission: boolean,
    ops: readonly Op[],
    insertInvalidAims = false,
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
    for (const op of ops) {
      if (insertInvalidAims) {
        controls.aim({ azimuthRad: Number.NaN, apparentAltitudeRad: 0, rollRad: 0 });
        controls.aim({ azimuthRad: 0, apparentAltitudeRad: 1.6, rollRad: 0 });
        controls.aim({ azimuthRad: 0, apparentAltitudeRad: 0, rollRad: Number.POSITIVE_INFINITY });
      }
      if (op.kind === 'advance') {
        t += op.stepMs;
        outputs.push({ kind: 'control', value: controls.advanceTo(t) });
      } else if (op.kind === 'aim') {
        outputs.push({ kind: 'control', value: controls.aim(op.pose) });
      } else {
        outputs.push({ kind: 'control', value: controls.truePose() });
      }
    }
    return outputs;
  };
  // Generator `controlOps`: 1 to 8 calls; an advance of 0 to 10 000 ms (without fast-check's bias
  // toward small integers), an aim with a `cameraPose` or an invalid pose (NaN azimuth, altitude
  // of 90°, infinite roll), or a read of the true pose. Excludes hostile values beyond these.
  const invalidPose: fc.Arbitrary<TruePose> = fc.constantFrom(
    { azimuthRad: Number.NaN, apparentAltitudeRad: 0, rollRad: 0 },
    { azimuthRad: 0, apparentAltitudeRad: Math.PI / 2, rollRad: 0 },
    { azimuthRad: 0, apparentAltitudeRad: 0, rollRad: Number.NEGATIVE_INFINITY },
  );
  const controlOps: fc.Arbitrary<Op[]> = fc.array(
    fc.oneof(
      fc
        .noBias(fc.integer({ min: 0, max: 10_000 }))
        .map((stepMs): Op => ({ kind: 'advance', stepMs })),
      fc.oneof(cameraPose(), invalidPose).map((pose): Op => ({ kind: 'aim', pose })),
      fc.constant<Op>({ kind: 'truePose' }),
    ),
    { minLength: 1, maxLength: 8 },
  );

  it('P-12.8: the Simulator is deterministic, calls to the controls included', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-12.8',
      fc.property(
        fc.oneof(simulatorScript(), simulatorScript(true)),
        fc.noBias(fc.integer({ min: 0, max: 2 ** 32 - 1 })),
        fc.boolean(),
        controlOps,
        (script, seed, askPermission, ops) => {
          const first = runOnce(script, seed, askPermission, ops);
          const second = runOnce(script, seed, askPermission, ops);
          const same = deepSame(first, second);
          tracker.record('runs that differ (count)', same ? 0 : 1, '0');
          return same;
        },
      ),
      tracker,
      { numRuns: cappedRuns() },
    );
  });

  // P-12.10 — validates Req 12.10: an `aim` with an invalid pose changes nothing. Inserting
  // invalid aims before every call of a sequence leaves every sample, reset, fix and the result of
  // every other call exactly as without them. 10 000 cases in test:deep.
  it('P-12.10: an invalid aim changes nothing', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-12.10',
      fc.property(
        fc.oneof(simulatorScript(), simulatorScript(true)),
        fc.noBias(fc.integer({ min: 0, max: 2 ** 32 - 1 })),
        controlOps,
        (script, seed, ops) => {
          const plain = runOnce(script, seed, false, ops);
          const withInvalid = runOnce(script, seed, false, ops, true);
          const same = deepSame(plain, withInvalid);
          tracker.record('runs that differ (count)', same ? 0 : 1, '0');
          return same;
        },
      ),
      tracker,
      { numRuns: cappedRuns() },
    );
  });

  // P-12.11 — validates Req 12.11: on a Simulator with no noise, no altitude bias, an Absolute
  // frame with no north error and Declination 0, a pose given to `aim` at any simulated time is
  // given back exactly by `truePose` (`Object.is`), and every sample generated afterwards gives,
  // through the Camera axis, the azimuth and altitude within 1e-9 rad. Domain: `cameraPose` (the
  // gimbal-lock draws included; altitudes beyond ±80° are refused, an example test), aimed after
  // 0 to 5000 ms. 10 000 cases in test:deep.
  it('P-12.11: an aimed pose is given back exactly and generates the same direction', () => {
    const tracker = new ErrorTracker();
    const script: SimulatorScript = baseScript({
      frame: { kind: 'absolute', northErrorRad: 0, resets: [] },
      heading: null,
      declinationRad: 0,
      altitudeBiasRad: 0,
      orientationNoiseSigmaRad: 0,
    });
    checkProperty(
      'P-12.11',
      fc.property(cameraPose(), fc.noBias(fc.integer({ min: 0, max: 5000 })), (pose, beforeMs) => {
        const created = createSimulator(script, 3, OPTIONS);
        if (!created.ok) return false;
        const { source, controls } = created.value;
        const samples: OrientationSample[] = [];
        source.onOrientation((s) => {
          if (s.ok) samples.push(s.value);
        });
        void source.startOrientation();
        if (!controls.advanceTo(script.startUtcMs + beforeMs).ok) return false;
        const delivered = samples.length;
        if (!controls.aim(pose).ok) return false;
        const given = controls.truePose();
        const exact =
          Object.is(given.azimuthRad, pose.azimuthRad) &&
          Object.is(given.apparentAltitudeRad, pose.apparentAltitudeRad) &&
          Object.is(given.rollRad, pose.rollRad);
        if (!controls.advanceTo(script.startUtcMs + beforeMs + 500).ok) return false;
        const after = samples.slice(delivered);
        if (after.length === 0) return false;
        let worst = 0;
        for (const sample of after) {
          const axis = cameraAxis(sample.rotation);
          if (!axis.ok) return false;
          const altitude = directionApparentAltitudeRad(axis.value);
          const azimuth = directionAzimuthRad(axis.value);
          if (!altitude.ok || !azimuth.ok) return false;
          worst = Math.max(
            worst,
            Math.abs(altitude.value - pose.apparentAltitudeRad),
            angleErrorRad(azimuth.value, pose.azimuthRad),
          );
        }
        tracker.record('direction error', worst, '1e-9');
        return exact && worst <= 1e-9;
      }),
      tracker,
      { numRuns: cappedRuns() },
    );
  });

  // P-12.13 — validates Req 12.13: for every aimed pose, the Camera axis of the true Device
  // rotation gives that azimuth and altitude within 1e-9 rad; and on a noise-free Absolute-frame
  // Simulator with no north error, no bias and Declination 0, the Off-axis ray of every Ray offset
  // in [-80°, 80°] under the next sample's rotation lies within 1e-9 rad of angle of the same ray
  // under the true rotation. Domain: `cameraPose` (gimbal-lock draws included), `rayOffset`
  // (ends drawn). 10 000 cases in test:deep.
  it('P-12.13: the true rotation points where aimed and matches the next sample', () => {
    const tracker = new ErrorTracker();
    const script: SimulatorScript = baseScript({
      frame: { kind: 'absolute', northErrorRad: 0, resets: [] },
      heading: null,
      declinationRad: 0,
      altitudeBiasRad: 0,
      orientationNoiseSigmaRad: 0,
    });
    checkProperty(
      'P-12.13',
      fc.property(cameraPose(), rayOffset(), (pose, offset) => {
        const created = createSimulator(script, 3, OPTIONS);
        if (!created.ok) return false;
        const { source, controls } = created.value;
        const samples: OrientationSample[] = [];
        source.onOrientation((s) => {
          if (s.ok) samples.push(s.value);
        });
        void source.startOrientation();
        if (!controls.aim(pose).ok) return false;
        const rotation = controls.trueRotation();
        if (!rotation.ok) return false;
        const axis = cameraAxis(rotation.value);
        if (!axis.ok) return false;
        const altitude = directionApparentAltitudeRad(axis.value);
        const azimuth = directionAzimuthRad(axis.value);
        if (!altitude.ok || !azimuth.ok) return false;
        const axisError = Math.max(
          Math.abs(altitude.value - pose.apparentAltitudeRad),
          angleErrorRad(azimuth.value, pose.azimuthRad),
        );
        if (!controls.advanceTo(script.startUtcMs + 200).ok) return false;
        const sample = samples[samples.length - 1];
        if (sample === undefined) return false;
        const underSample = offAxisRay(sample.rotation, offset);
        const underTrue = offAxisRay(rotation.value, offset);
        if (!underSample.ok || !underTrue.ok) return false;
        const rayError = angleBetweenRad(underSample.value, underTrue.value);
        tracker.record('camera axis error', axisError, '1e-9');
        tracker.record('ray angle between sample and true rotation', rayError, '1e-9');
        return axisError <= 1e-9 && rayError <= 1e-9;
      }),
      tracker,
      { numRuns: cappedRuns() },
    );
  });
});
