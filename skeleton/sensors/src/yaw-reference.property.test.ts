import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cameraAxis, directionApparentAltitudeRad, directionAzimuthRad } from './rotation';
import type { OrientationSample } from './orientation-sample';
import { rotationFromDirection } from './simulator/direction-to-rotation';
import { angleErrorRad } from './test-support/angle-compare';
import { compassScenario, horizontalPart, knownAzimuthScenario } from './test-support/generators';
import { checkProperty, ErrorTracker } from './test-support/property-report';
import { describeRotation, lockLabel } from './test-support/rotation-labels';
import {
  applyYawReference,
  yawReferenceFromCompass,
  yawReferenceFromKnownAzimuth,
} from './yaw-reference';

const END = 1_790_000_000_000;

const COMPASS_ALTITUDE_LIMIT_RAD = 30 * (Math.PI / 180);

/** The Camera altitude of a sample as computed back from its rotation, or `undefined`. */
function cameraAltitudeOf(sample: OrientationSample): number | undefined {
  const axis = cameraAxis(sample.rotation);
  if (!axis.ok) return undefined;
  const altitude = directionApparentAltitudeRad(axis.value);
  return altitude.ok ? altitude.value : undefined;
}

/** The azimuth of a sample's Camera axis in its own frame, or `undefined` if it has none. */
function frameAzimuthOf(sample: OrientationSample): number | undefined {
  const axis = cameraAxis(sample.rotation);
  if (!axis.ok) return undefined;
  const azimuth = directionAzimuthRad(axis.value);
  return azimuth.ok ? azimuth.value : undefined;
}

function referencedValue(result: ReturnType<typeof applyYawReference>): number | undefined {
  if (!result.ok) return undefined;
  return result.value.northReference === 'true'
    ? result.value.azimuthRad
    : result.value.magneticAzimuthRad;
}

describe('Yaw reference properties', () => {
  // P-5.14 — validates Req 5.14: for samples whose Camera altitudes lie in [-30°, 30°] and whose
  // headings are exactly `wrapTwoPi(relative + offset)`, the compass reference equals the offset
  // within 1e-9 rad (wrapped), and applying it reproduces every heading within 1e-9 rad. The domain
  // is the computed Camera altitude; poses drawn at ±30° that round outside it are discarded by
  // `fc.pre` and counted in the report.
  it('P-5.14: the compass reference recovers the scripted offset', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.14',
      fc.property(compassScenario(), (scenario) => {
        const samples: OrientationSample[] = [];
        for (const [index, s] of scenario.samples.entries()) {
          const rotation = rotationFromDirection(
            s.relativeAzimuthRad,
            s.apparentAltitudeRad,
            s.rollRad,
          );
          if (!rotation.ok) return false;
          const heading =
            (((s.relativeAzimuthRad + scenario.offsetRad) % (2 * Math.PI)) + 2 * Math.PI) %
            (2 * Math.PI);
          samples.push({
            timeUtcMs: END - index,
            frame: 'relative',
            rotation: rotation.value,
            screenAngleRad: 0,
            magneticHeadingRad: heading,
            compassAccuracyRad: s.compassAccuracyRad,
          });
        }
        for (const sample of samples) {
          const altitude = cameraAltitudeOf(sample);
          fc.pre(altitude !== undefined && Math.abs(altitude) <= COMPASS_ALTITUDE_LIMIT_RAD);
        }
        const reference = yawReferenceFromCompass({
          samples,
          frameResets: [],
          window: {
            endUtcMs: END,
            windowLengthMs: 100,
            minSampleCount: samples.length,
            sampleStalenessMs: 0,
          },
          headingSigmaRad: 0.03,
        });
        if (!reference.ok) return false;
        const offsetError = angleErrorRad(reference.value.offsetRad, scenario.offsetRad);
        tracker.record('offset error', offsetError, '1e-9');
        let worstHeading = 0;
        for (const sample of samples) {
          const azimuth = frameAzimuthOf(sample);
          if (azimuth === undefined) return false;
          const applied = referencedValue(applyYawReference(azimuth, reference.value));
          if (applied === undefined) return false;
          worstHeading = Math.max(
            worstHeading,
            angleErrorRad(applied, sample.magneticHeadingRad ?? Number.NaN),
          );
        }
        tracker.record('heading error', worstHeading, '1e-9');
        return offsetError <= 1e-9 && worstHeading <= 1e-9;
      }),
      tracker,
    );
  });

  // P-5.15 — validates Req 5.15, in both frames: for a constant rotation with a horizontal part of
  // at least 1e-3, the known-azimuth reference records the frame, maps the samples' Camera azimuth
  // to the known azimuth within 1e-9 rad, and carries the known 1-sigma within 1e-12 rad.
  for (const frame of ['relative', 'absolute'] as const) {
    it(`P-5.15 (${frame}): the known-azimuth reference maps the samples to the known azimuth`, () => {
      const tracker = new ErrorTracker();
      checkProperty(
        `P-5.15 (${frame})`,
        fc.property(knownAzimuthScenario(), (scenario) => {
          fc.pre(horizontalPart(scenario.rotation) >= 1e-3);
          const samples: OrientationSample[] = Array.from(
            { length: scenario.sampleCount },
            (_, index) => ({
              timeUtcMs: END - index * 10,
              frame,
              rotation: scenario.rotation,
              screenAngleRad: 0,
              magneticHeadingRad: null,
              compassAccuracyRad: null,
            }),
          );
          const reference = yawReferenceFromKnownAzimuth({
            samples,
            frameResets: [],
            window: {
              endUtcMs: END,
              windowLengthMs: 1000,
              minSampleCount: samples.length,
              sampleStalenessMs: 0,
            },
            knownAzimuthRad: scenario.knownAzimuthRad,
            knownSigmaRad: scenario.knownSigmaRad,
            northReference: scenario.northReference,
          });
          if (!reference.ok || reference.value.frame !== frame) return false;
          const azimuth = frameAzimuthOf(samples[0] as OrientationSample);
          if (azimuth === undefined) return false;
          const applied = referencedValue(applyYawReference(azimuth, reference.value));
          if (applied === undefined) return false;
          const azimuthError = angleErrorRad(applied, scenario.knownAzimuthRad);
          const sigmaError = Math.abs(reference.value.sigmaRad - scenario.knownSigmaRad);
          const label = describeRotation(scenario.rotation);
          tracker.record(
            lockLabel('azimuth error', scenario.rotation),
            azimuthError,
            '1e-9',
            label,
          );
          tracker.record(lockLabel('sigma error', scenario.rotation), sigmaError, '1e-12', label);
          return azimuthError <= 1e-9 && sigmaError <= 1e-12;
        }),
        tracker,
      );
    });
  }
});
