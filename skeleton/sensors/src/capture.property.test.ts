import type { Bearing } from '@alidade/core';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import {
  captureAltitude,
  captureBearing,
  MIN_CAPTURE_SIGMA_RAD,
  type BearingCaptureInput,
} from './capture';
import { summariseAltitudes, summariseAzimuths } from './circular-summary';
import type { OrientationSample } from './orientation-sample';
import { positionFixFromReading } from './position-fix';
import {
  cameraAxis,
  directionApparentAltitudeRad,
  directionAzimuthRad,
  type DeviceRotation,
} from './rotation';
import type { SensorResult } from './sensor-result';
import { rotationFromDirection } from './simulator/direction-to-rotation';
import { angleErrorRad } from './test-support/angle-compare';
import { cappedRuns } from './test-support/fast-check-setup';
import {
  altitudeSet,
  clusteredCapture,
  deviceRotation,
  identicalCapture,
  straddlingCapture,
  uniform,
  type AltitudeScenario,
  type CaptureScenario,
} from './test-support/generators';
import { checkProperty, ErrorTracker } from './test-support/property-report';
import { applyYawReference, type YawReference } from './yaw-reference';

const END = 1_790_000_000_000;
const SAMPLE_INTERVAL_MS = 5;
const FIX = (() => {
  const fix = positionFixFromReading(
    { latitudeDeg: 24.5, longitudeDeg: 118.1, accuracyM: 12 },
    END,
    1,
  );
  if (!fix.ok) throw new Error('bad test fix');
  return fix.value;
})();
const WINDOW_LENGTH_MS = 1000;
const ALTITUDE_LIMIT_RAD = 80 * (Math.PI / 180);

function rotationOf(
  azimuthRad: number,
  altitudeRad: number,
  rollRad: number,
): DeviceRotation | undefined {
  const rotation = rotationFromDirection(azimuthRad, altitudeRad, rollRad);
  return rotation.ok ? rotation.value : undefined;
}

/** The scenario's samples, newest at END, 5 ms apart; `undefined` if a pose cannot be built. */
function samplesOf(scenario: CaptureScenario): OrientationSample[] | undefined {
  const samples: OrientationSample[] = [];
  for (const [index, s] of scenario.samples.entries()) {
    const rotation = rotationOf(s.relativeAzimuthRad, s.apparentAltitudeRad, s.rollRad);
    if (rotation === undefined) return undefined;
    samples.push({
      timeUtcMs: END - index * SAMPLE_INTERVAL_MS,
      frame: 'relative',
      rotation,
      screenAngleRad: 0,
      magneticHeadingRad: null,
      compassAccuracyRad: null,
    });
  }
  return samples;
}

function referenceOf(scenario: CaptureScenario, offsetRad = scenario.yawOffsetRad): YawReference {
  return {
    offsetRad,
    sigmaRad: scenario.yawSigmaRad,
    northReference: 'true',
    frame: 'relative',
    establishedUtcMs: END - 2000,
  };
}

function inputOf(
  samples: readonly OrientationSample[],
  reference: YawReference,
): BearingCaptureInput {
  return {
    id: 'p',
    timeUtcMs: END,
    samples,
    frameResets: [],
    window: {
      endUtcMs: END,
      windowLengthMs: WINDOW_LENGTH_MS,
      minSampleCount: 2,
      sampleStalenessMs: 500,
    },
    yawReference: reference,
    yawReferenceMaxAgeMs: 60_000,
    headingSigmaRad: 0.03,
    positionFix: FIX,
    positionStalenessMs: 30_000,
    coarseLocationLimitM: 100,
  };
}

function capture(
  samples: readonly OrientationSample[],
  reference: YawReference,
): Bearing | undefined {
  const result = captureBearing(inputOf(samples, reference));
  return result.ok ? result.value : undefined;
}

/** `wrapPi` written independently of the code under test. */
function wrapPi(x: number): number {
  return Math.atan2(Math.sin(x), Math.cos(x));
}

/** The samples in the order given by the scenario's random keys. */
function permuted<T>(items: readonly T[], keys: readonly number[]): T[] {
  return items
    .map((item, index) => ({ item, key: keys[index] ?? 0, index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((entry) => entry.item);
}

describe('Bearing capture properties', () => {
  // P-8.11 — validates Req 8.11: rotating every true azimuth by δ (through the Yaw reference,
  // whose offset becomes wrapPi(offset + δ)) moves the captured azimuth by δ within 1e-9 rad
  // (wrapped) and leaves its 1-sigma unchanged within 1e-12 rad.
  it('P-8.11: the capture rotates with its samples', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-8.11',
      fc.property(clusteredCapture(), uniform(0, 2 * Math.PI), (scenario, deltaRad) => {
        const samples = samplesOf(scenario);
        if (samples === undefined) return false;
        const before = capture(samples, referenceOf(scenario));
        const after = capture(
          samples,
          referenceOf(scenario, wrapPi(scenario.yawOffsetRad + deltaRad)),
        );
        if (before === undefined || after === undefined) return false;
        const azimuthError = angleErrorRad(after.azimuthRad, before.azimuthRad + deltaRad);
        const sigmaError = Math.abs(after.azimuthSigmaRad - before.azimuthSigmaRad);
        tracker.record('azimuth error', azimuthError, '1e-9');
        tracker.record('sigma change', sigmaError, '1e-12');
        return azimuthError <= 1e-9 && sigmaError <= 1e-12;
      }),
      tracker,
    );
  });

  // P-8.12 — validates Req 8.12: reordering the samples changes neither the captured azimuth nor
  // its 1-sigma by more than 1e-12 rad.
  it('P-8.12: the order of the samples does not matter', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-8.12',
      fc.property(clusteredCapture(), (scenario) => {
        const samples = samplesOf(scenario);
        if (samples === undefined) return false;
        const reference = referenceOf(scenario);
        const original = capture(samples, reference);
        const shuffled = capture(permuted(samples, scenario.orderKeys), reference);
        if (original === undefined || shuffled === undefined) return false;
        const azimuthError = angleErrorRad(shuffled.azimuthRad, original.azimuthRad);
        const sigmaError = Math.abs(shuffled.azimuthSigmaRad - original.azimuthSigmaRad);
        tracker.record('azimuth change', azimuthError, '1e-12');
        tracker.record('sigma change', sigmaError, '1e-12');
        return azimuthError <= 1e-12 && sigmaError <= 1e-12;
      }),
      tracker,
    );
  });

  // P-8.13 — validates Req 8.13: adding 1 to 50 samples timed outside the Sighting window, at any
  // place in the list, leaves the capture exactly unchanged (deep equality). 10 000 cases in
  // test:deep (design §8).
  it('P-8.13: samples outside the window change nothing', () => {
    const tracker = new ErrorTracker();
    const outside = fc.record({
      rotation: deviceRotation(),
      timeUtcMs: fc.oneof(
        fc.integer({ min: 1, max: 100_000 }).map((k) => END - WINDOW_LENGTH_MS - k),
        fc.integer({ min: 1, max: 100_000 }).map((k) => END + k),
      ),
      position: fc.nat(),
    });
    checkProperty(
      'P-8.13',
      fc.property(
        clusteredCapture(),
        fc.array(outside, { minLength: 1, maxLength: 50 }),
        (scenario, extras) => {
          const samples = samplesOf(scenario);
          if (samples === undefined) return false;
          const reference = referenceOf(scenario);
          const withExtras = [...samples];
          for (const extra of extras) {
            withExtras.splice(extra.position % (withExtras.length + 1), 0, {
              timeUtcMs: extra.timeUtcMs,
              frame: 'relative',
              rotation: extra.rotation,
              screenAngleRad: 0,
              magneticHeadingRad: null,
              compassAccuracyRad: null,
            });
          }
          const original = captureBearing(inputOf(samples, reference));
          const extended = captureBearing(inputOf(withExtras, reference));
          return (
            original.ok &&
            JSON.stringify(extended) === JSON.stringify(original) &&
            sameNumbers(extended, original)
          );
        },
      ),
      tracker,
      { numRuns: cappedRuns() },
    );
  });

  // P-8.14 — validates Req 8.14: when every sample has the same true azimuth, the Spread is 0
  // within 1e-12 rad and the 1-sigma equals max(0.01°, North-reference 1-sigma) within 1e-12 rad.
  // The capture returns a Core Bearing, which holds the 1-sigma but not the Spread, and the 0.01°
  // floor can hide a Spread below it; so the Spread is checked on the same true azimuths the
  // capture summarises, built with the same functions (ray, azimuth, Yaw reference).
  it('P-8.14: identical samples have no Spread', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-8.14',
      fc.property(identicalCapture(), (scenario) => {
        const samples = samplesOf(scenario);
        if (samples === undefined) return false;
        const reference = referenceOf(scenario);
        const trueAzimuths: number[] = [];
        for (const sample of samples) {
          const axis = cameraAxis(sample.rotation);
          if (!axis.ok) return false;
          const azimuth = directionAzimuthRad(axis.value);
          if (!azimuth.ok) return false;
          const referenced = applyYawReference(azimuth.value, reference);
          if (!referenced.ok || referenced.value.northReference !== 'true') return false;
          trueAzimuths.push(referenced.value.azimuthRad);
        }
        const summary = summariseAzimuths(trueAzimuths);
        const result = capture(samples, reference);
        if (!summary.ok || result === undefined) return false;
        const expectedSigma = Math.max(MIN_CAPTURE_SIGMA_RAD, scenario.yawSigmaRad);
        const sigmaError = Math.abs(result.azimuthSigmaRad - expectedSigma);
        tracker.record('Spread', summary.value.spreadRad, '1e-12');
        tracker.record('sigma error', sigmaError, '1e-12');
        return summary.value.spreadRad <= 1e-12 && sigmaError <= 1e-12;
      }),
      tracker,
    );
  });

  // P-8.15 — validates Req 8.15: for sets that straddle 0 / 2π, the captured azimuth equals that
  // of the same set rotated π and rotated back, within 1e-9 rad (wrapped).
  it('P-8.15: the 0 / 2π boundary is not special', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-8.15',
      fc.property(straddlingCapture(), (scenario) => {
        const samples = samplesOf(scenario);
        if (samples === undefined) return false;
        const straddling = capture(samples, referenceOf(scenario));
        const rotated = capture(
          samples,
          referenceOf(scenario, wrapPi(scenario.yawOffsetRad + Math.PI)),
        );
        if (straddling === undefined || rotated === undefined) return false;
        const error = angleErrorRad(straddling.azimuthRad, rotated.azimuthRad - Math.PI);
        tracker.record('azimuth error', error, '1e-9');
        return error <= 1e-9;
      }),
      tracker,
    );
  });
});

/** True when two results hold the same numbers bit for bit (`Object.is`), field by field. */
function sameNumbers(a: SensorResult<Bearing>, b: SensorResult<Bearing>): boolean {
  if (!a.ok || !b.ok) return a.ok === b.ok;
  return (
    Object.is(a.value.azimuthRad, b.value.azimuthRad) &&
    Object.is(a.value.azimuthSigmaRad, b.value.azimuthSigmaRad) &&
    Object.is(a.value.positionAccuracyM, b.value.positionAccuracyM)
  );
}

/** Samples realising the scenario's poses, shifted by `shiftRad`, and their computed altitudes. */
function altitudeSamples(
  scenario: AltitudeScenario,
  shiftRad: number,
): { samples: OrientationSample[]; altitudesRad: number[] } | undefined {
  const samples: OrientationSample[] = [];
  const altitudesRad: number[] = [];
  for (const [index, pose] of scenario.poses.entries()) {
    const rotation = rotationOf(pose.azimuthRad, pose.apparentAltitudeRad + shiftRad, pose.rollRad);
    if (rotation === undefined) return undefined;
    const axis = cameraAxis(rotation);
    if (!axis.ok) return undefined;
    const altitude = directionApparentAltitudeRad(axis.value);
    if (!altitude.ok) return undefined;
    altitudesRad.push(altitude.value);
    samples.push({
      timeUtcMs: END - index * SAMPLE_INTERVAL_MS,
      frame: 'relative',
      rotation,
      screenAngleRad: 0,
      magneticHeadingRad: null,
      compassAccuracyRad: null,
    });
  }
  return { samples, altitudesRad };
}

/** Req 9.10: the mean of the altitudes lies within their [min, max]. Returns the excess, 0 if inside. */
function meanOutsideRange(altitudesRad: readonly number[]): number {
  const summary = summariseAltitudes(altitudesRad);
  if (!summary.ok) return Number.POSITIVE_INFINITY;
  const lowest = Math.min(...altitudesRad);
  const highest = Math.max(...altitudesRad);
  return Math.max(0, lowest - summary.value.meanRad, summary.value.meanRad - highest);
}

/** Req 9.7 to 9.9 speak of the Camera altitudes, the computed ones: the domain is applied to them. */
function preInDomain(altitudesRad: readonly number[]): void {
  fc.pre(altitudesRad.every((h) => Math.abs(h) <= ALTITUDE_LIMIT_RAD));
}

function altitudeOf(scenario: AltitudeScenario, samples: readonly OrientationSample[]) {
  return captureAltitude({
    samples,
    window: {
      endUtcMs: END,
      windowLengthMs: WINDOW_LENGTH_MS,
      minSampleCount: 2,
      sampleStalenessMs: 500,
    },
    calibration: {
      offsetRad: scenario.calibrationOffsetRad,
      sigmaRad: scenario.calibrationSigmaRad,
    },
  });
}

describe('Altitude capture properties', () => {
  // P-9.7 — validates Req 9.7: samples that all have one Camera altitude in [-80°, 80°], and an
  // offset in [-10°, 10°]: the apparent altitude is the altitude plus the offset within 1e-12 rad,
  // and its 1-sigma is the calibration sigma within 1e-12 rad. Also Req 9.10: the mean of identical
  // altitudes is that altitude exactly, so the apparent altitude is exactly `h + offset`. Poses
  // whose computed altitude rounds outside [-80°, 80°] are discarded by `fc.pre` and counted.
  it('P-9.7: a still camera gives its altitude plus the offset', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-9.7',
      fc.property(altitudeSet(true), (scenario) => {
        const built = altitudeSamples(scenario, 0);
        if (built === undefined) return false;
        preInDomain(built.altitudesRad);
        const result = altitudeOf(scenario, built.samples);
        if (!result.ok) return false;
        const expected = (built.altitudesRad[0] ?? Number.NaN) + scenario.calibrationOffsetRad;
        const altitudeError = Math.abs(result.value.apparentAltitudeRad - expected);
        const sigmaError = Math.abs(result.value.sigmaRad - scenario.calibrationSigmaRad);
        const mean = summariseAltitudes(built.altitudesRad);
        const meanExact = mean.ok && Object.is(mean.value.meanRad, built.altitudesRad[0]);
        tracker.record('altitude error', altitudeError, '1e-12');
        tracker.record('sigma error', sigmaError, '1e-12');
        tracker.record('mean ≠ common altitude (count)', meanExact ? 0 : 1, '0 (exact)');
        return (
          altitudeError <= 1e-12 &&
          sigmaError <= 1e-12 &&
          meanExact &&
          Object.is(result.value.apparentAltitudeRad, expected)
        );
      }),
      tracker,
    );
  });

  // P-9.8 — validates Req 9.8: shifting every Camera altitude by δ, keeping all in [-80°, 80°],
  // shifts the apparent altitude by δ within 1e-12 rad and leaves the 1-sigma unchanged within
  // 1e-12 rad. Also Req 9.10: before and after the shift, the mean lies within the altitudes' range.
  it('P-9.8: the apparent altitude moves with the samples', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-9.8',
      fc.property(altitudeSet(), (scenario) => {
        const before = altitudeSamples(scenario, 0);
        const after = altitudeSamples(scenario, scenario.shiftRad);
        if (before === undefined || after === undefined) return false;
        preInDomain(before.altitudesRad);
        preInDomain(after.altitudesRad);
        const a = altitudeOf(scenario, before.samples);
        const b = altitudeOf(scenario, after.samples);
        if (!a.ok || !b.ok) return false;
        const altitudeError = Math.abs(
          b.value.apparentAltitudeRad - a.value.apparentAltitudeRad - scenario.shiftRad,
        );
        const sigmaError = Math.abs(b.value.sigmaRad - a.value.sigmaRad);
        tracker.record('altitude error', altitudeError, '1e-12');
        tracker.record('sigma change', sigmaError, '1e-12');
        const rangeExcess = Math.max(
          meanOutsideRange(before.altitudesRad),
          meanOutsideRange(after.altitudesRad),
        );
        tracker.record('mean outside range', rangeExcess, '0');
        return altitudeError <= 1e-12 && sigmaError <= 1e-12 && rangeExcess === 0;
      }),
      tracker,
    );
  });

  // P-9.9 — validates Req 9.9: reordering the samples changes neither the apparent altitude nor
  // its 1-sigma by more than 1e-12 rad. Also Req 9.10: the mean lies within the altitudes' range.
  it('P-9.9: the order of the samples does not matter', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-9.9',
      fc.property(altitudeSet(), (scenario) => {
        const built = altitudeSamples(scenario, 0);
        if (built === undefined) return false;
        preInDomain(built.altitudesRad);
        const a = altitudeOf(scenario, built.samples);
        const b = altitudeOf(scenario, permuted(built.samples, scenario.orderKeys));
        if (!a.ok || !b.ok) return false;
        const altitudeError = Math.abs(b.value.apparentAltitudeRad - a.value.apparentAltitudeRad);
        const sigmaError = Math.abs(b.value.sigmaRad - a.value.sigmaRad);
        tracker.record('altitude change', altitudeError, '1e-12');
        tracker.record('sigma change', sigmaError, '1e-12');
        const rangeExcess = meanOutsideRange(built.altitudesRad);
        tracker.record('mean outside range', rangeExcess, '0');
        return altitudeError <= 1e-12 && sigmaError <= 1e-12 && rangeExcess === 0;
      }),
      tracker,
    );
  });
});
