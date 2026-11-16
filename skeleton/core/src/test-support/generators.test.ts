import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TWO_PI_RAD } from '../angle';
import {
  MAX_AZIMUTH_SIGMA_RAD,
  MAX_POSITION_ACCURACY_M,
  MIN_AZIMUTH_SIGMA_RAD,
  validateBearing,
} from '../observation';
import {
  EARTH_RADIUS_M,
  MAX_SUPPORTED_LAT_RAD,
  greatCircleDistanceM,
  initialAzimuthRad,
  isSupportedPosition,
} from '../position';
import { unwrapOk } from './result-helpers';
import type { Bearing } from '../observation';
import {
  MAX_CROSS_TRACK_RATIO,
  OUTLIER_MAX_LAT_RAD,
  SOLVABLE_MAX_LAT_RAD,
  TARGET_LIMIT_MARGIN_M,
  crossTrackSigmaRatio,
  crossingAngleBetweenRad,
  largestCrossingAngleRad,
  largestDirectionGapRad,
  meridianSet,
  noisySolvableSet,
  outlierSet,
  solvableSet,
  solvableSetWithExtra,
  solvableSetWithScale,
  azimuth,
  bearingGeometry,
  clusteredAngles,
  finiteAngle,
  logUniformBetween,
  supportedPosition,
  uniformBetween,
  validBearing,
} from './generators';

// These tests guard the spread of the generators. A plain `fc.double` over a range puts about
// 90% of its draws within 0.1 of zero, which makes every property that uses it test only a
// sliver of its domain. Each test draws a fixed sample with a fixed seed.
const sampleOf = <T>(arbitrary: fc.Arbitrary<T>, count = 4000): T[] =>
  fc.sample(arbitrary, { numRuns: count, seed: 20261115 });
const shareOf = (values: number[], predicate: (value: number) => boolean): number =>
  values.filter(predicate).length / values.length;

describe('uniformBetween and logUniformBetween', () => {
  it('uniformBetween stays inside [lower, upper) and fills it evenly', () => {
    const values = sampleOf(uniformBetween(-3, 5));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-3);
    expect(Math.max(...values)).toBeLessThan(5);
    for (let bucket = 0; bucket < 8; bucket += 1) {
      const lower = -3 + bucket;
      const share = shareOf(values, (value) => value >= lower && value < lower + 1);
      expect(share).toBeGreaterThan(0.1);
      expect(share).toBeLessThan(0.15);
    }
  });

  it('logUniformBetween gives every decade about the same share', () => {
    const values = sampleOf(logUniformBetween(1e-10, 1e6), 8000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1e-10 * (1 - 1e-9));
    expect(Math.max(...values)).toBeLessThan(1e6 * (1 + 1e-9));
    for (let exponent = -10; exponent < 6; exponent += 1) {
      const share = shareOf(
        values,
        (value) => value >= 10 ** exponent && value < 10 ** (exponent + 1),
      );
      // 16 decades: the expected share is 1/16 = 6.25%.
      expect(share).toBeGreaterThan(0.04);
      expect(share).toBeLessThan(0.09);
    }
  });
});

describe('angle and position generators', () => {
  it('azimuth stays in [0, 2π) and covers the whole circle', () => {
    const values = sampleOf(azimuth);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(TWO_PI_RAD);
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const lower = (quarter * TWO_PI_RAD) / 4;
      const share = shareOf(values, (value) => value >= lower && value < lower + TWO_PI_RAD / 4);
      expect(share).toBeGreaterThan(0.18);
    }
  });

  it('finiteAngle stays within ±1e6 and has large, small and wrap-boundary values', () => {
    const values = sampleOf(finiteAngle);
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(1e6);
    expect(shareOf(values, (value) => Math.abs(value) > 1000)).toBeGreaterThan(0.2);
    expect(shareOf(values, (value) => Math.abs(value) > 1 && Math.abs(value) < 13)).toBeGreaterThan(
      0.2,
    );
    expect(shareOf(values, (value) => Math.abs(value) < 1e-3)).toBeGreaterThan(0.05);
  });

  it('clusteredAngles lists are non-empty and have spread, not copies of one angle', () => {
    const lists = sampleOf(clusteredAngles, 1000);
    expect(lists.every((list) => list.length >= 1 && list.length <= 20)).toBe(true);
    const multi = lists.filter((list) => list.length > 1);
    const spreadShare =
      multi.filter((list) => Math.max(...list) - Math.min(...list) > 0.1).length / multi.length;
    expect(spreadShare).toBeGreaterThan(0.7);
  });

  it('supportedPosition is always Supported and covers latitudes and longitudes widely', () => {
    const positions = sampleOf(supportedPosition);
    expect(positions.every(isSupportedPosition)).toBe(true);
    const latitudes = positions.map((position) => position.latRad);
    const longitudes = positions.map((position) => position.lonRad);
    expect(shareOf(latitudes, (value) => Math.abs(value) > 1)).toBeGreaterThan(0.2);
    expect(shareOf(latitudes, (value) => Math.abs(value) < 0.5)).toBeGreaterThan(0.2);
    expect(shareOf(longitudes, (value) => value > 2)).toBeGreaterThan(0.1);
    expect(shareOf(longitudes, (value) => value < -2)).toBeGreaterThan(0.1);
    expect(shareOf(longitudes, (value) => Math.abs(value) > Math.PI - 0.05)).toBeGreaterThan(0.005);
  });
});

describe('validBearing', () => {
  it('always produces a bearing that validateBearing accepts', () => {
    expect(sampleOf(validBearing, 2000).every((bearing) => validateBearing(bearing).ok)).toBe(true);
  });

  it('spreads accuracy, sigma and time over their ranges and reaches both ends', () => {
    const bearings = sampleOf(validBearing);
    const accuracies = bearings.map((bearing) => bearing.positionAccuracyM);
    const sigmas = bearings.map((bearing) => bearing.azimuthSigmaRad);
    const times = bearings.map((bearing) => bearing.timeUtcMs);
    expect(shareOf(accuracies, (value) => value > 1000)).toBeGreaterThan(0.3);
    expect(shareOf(accuracies, (value) => value < 1)).toBeGreaterThan(0.02);
    expect(accuracies).toContain(0);
    expect(accuracies).toContain(MAX_POSITION_ACCURACY_M);
    expect(shareOf(sigmas, (value) => value > MAX_AZIMUTH_SIGMA_RAD / 2)).toBeGreaterThan(0.2);
    expect(sigmas).toContain(MIN_AZIMUTH_SIGMA_RAD);
    expect(sigmas).toContain(MAX_AZIMUTH_SIGMA_RAD);
    expect(shareOf(times, (value) => value > 1e12 && value < 5e12)).toBeGreaterThan(0.2);
    expect(shareOf(times, (value) => Math.abs(value) > 1e15)).toBeGreaterThan(0.05);
  });

  it('produces ids of different lengths and distinct ids', () => {
    const ids = sampleOf(validBearing).map((bearing) => bearing.id);
    expect(new Set(ids.map((id) => id.length)).size).toBeGreaterThan(8);
    expect(new Set(ids).size).toBeGreaterThan(ids.length * 0.9);
  });
});

describe('bearingGeometry', () => {
  const geometries = sampleOf(bearingGeometry, 4000);
  const limitMarginM = (latRad: number): number =>
    (MAX_SUPPORTED_LAT_RAD - Math.abs(latRad)) * EARTH_RADIUS_M;

  it('keeps every target at least 10 m inside the 89° limit, and every position Supported', () => {
    expect(TARGET_LIMIT_MARGIN_M).toBe(10);
    for (const { observer, target, origin } of geometries) {
      expect(limitMarginM(target.latRad)).toBeGreaterThanOrEqual(10);
      expect(isSupportedPosition(observer) && isSupportedPosition(origin)).toBe(true);
    }
  });

  it('reaches targets just inside the 10 m margin, and observers near the limit', () => {
    const targetMarginsM = geometries.map(({ target }) => limitMarginM(target.latRad));
    expect(shareOf(targetMarginsM, (marginM) => marginM < 20)).toBeGreaterThan(0.005);
    expect(shareOf(targetMarginsM, (marginM) => marginM < 1000)).toBeGreaterThan(0.05);
    const observerMarginsM = geometries.map(({ observer }) => limitMarginM(observer.latRad));
    expect(observerMarginsM.some((marginM) => marginM < 1000)).toBe(true);
  });

  it('puts the observer 50 m to 200 km from the target, across the decades', () => {
    const rangesM = geometries.map(({ observer, target }) =>
      unwrapOk(greatCircleDistanceM(observer, target)),
    );
    expect(Math.min(...rangesM)).toBeGreaterThan(50 * (1 - 1e-9));
    expect(Math.max(...rangesM)).toBeLessThan(2e5 * (1 + 1e-9));
    expect(shareOf(rangesM, (rangeM) => rangeM < 200)).toBeGreaterThan(0.1);
    expect(shareOf(rangesM, (rangeM) => rangeM > 50_000)).toBeGreaterThan(0.1);
  });

  it('fills each band of origin offsets: at the target, inside 1e-3 m, and beyond', () => {
    const offsetsM = geometries.map(({ target, origin }) =>
      unwrapOk(greatCircleDistanceM(target, origin)),
    );
    expect(shareOf(offsetsM, (offsetM) => offsetM === 0)).toBeGreaterThan(0.15);
    expect(shareOf(offsetsM, (offsetM) => offsetM > 0 && offsetM < 1e-3)).toBeGreaterThan(0.15);
    expect(shareOf(offsetsM, (offsetM) => offsetM >= 1e-3)).toBeGreaterThan(0.35);
  });
});

describe('solver scenario generators', () => {
  const DEG = Math.PI / 180;
  const rangeOf = (
    observer: { latRad: number; lonRad: number },
    target: { latRad: number; lonRad: number },
  ) => unwrapOk(greatCircleDistanceM(observer, target));
  const trueAzimuth = (
    observer: { latRad: number; lonRad: number },
    target: { latRad: number; lonRad: number },
  ) => unwrapOk(initialAzimuthRad(observer, target));
  const angleGap = (aRad: number, bRad: number): number =>
    Math.abs(Math.atan2(Math.sin(aRad - bRad), Math.cos(aRad - bRad)));
  /** Cross-track 1-sigma recomputed by hand, independent of the generators' helper. */
  const crossTrackByHand = (observation: Bearing, target: { latRad: number; lonRad: number }) =>
    Math.sqrt(
      (observation.azimuthSigmaRad * rangeOf(observation.observer, target)) ** 2 +
        observation.positionAccuracyM ** 2,
    );

  it('crossingAngleBetweenRad and largestDirectionGapRad give known values', () => {
    expect(crossingAngleBetweenRad(0, 170 * DEG)).toBeCloseTo(10 * DEG, 12);
    expect(crossingAngleBetweenRad(350 * DEG, 10 * DEG)).toBeCloseTo(20 * DEG, 12);
    expect(crossingAngleBetweenRad(0, 90 * DEG)).toBeCloseTo(90 * DEG, 12);
    expect(largestDirectionGapRad([0, 90 * DEG])).toBeCloseTo(270 * DEG, 12);
    expect(largestDirectionGapRad([350 * DEG, 10 * DEG, 100 * DEG])).toBeCloseTo(250 * DEG, 12);
    expect(largestDirectionGapRad([0, 120 * DEG, 240 * DEG])).toBeCloseTo(120 * DEG, 12);
  });

  it('solvableSet meets exactly the Req 7.4 conditions, noise-free, with every count 2 to 12', () => {
    const scenarios = sampleOf(solvableSet, 600);
    const counts = new Set<number>();
    for (const { target, observations } of scenarios) {
      counts.add(observations.length);
      expect(Math.abs(target.latRad)).toBeLessThanOrEqual(SOLVABLE_MAX_LAT_RAD);
      expect(observations.length).toBeGreaterThanOrEqual(2);
      expect(observations.length).toBeLessThanOrEqual(12);
      expect(new Set(observations.map((observation) => observation.id)).size).toBe(
        observations.length,
      );
      expect(largestCrossingAngleRad(observations)).toBeGreaterThanOrEqual(10 * DEG);
      const crossTracks = observations.map((observation) => crossTrackByHand(observation, target));
      expect(Math.max(...crossTracks) / Math.min(...crossTracks)).toBeLessThanOrEqual(1e3);
      expect(crossTrackSigmaRatio(observations, target)).toBeLessThanOrEqual(MAX_CROSS_TRACK_RATIO);
      for (const observation of observations) {
        expect(validateBearing(observation).ok).toBe(true);
        const rangeM = rangeOf(observation.observer, target);
        expect(rangeM).toBeGreaterThan(500 - 1e-3);
        expect(rangeM).toBeLessThan(1e5 + 1e-3);
        expect(angleGap(observation.azimuthRad, trueAzimuth(observation.observer, target))).toBe(0);
      }
    }
    expect(counts.size).toBe(11);
  });

  it('solvableSet reaches high latitudes, both cross-track extremes and every end of sigma and accuracy', () => {
    const scenarios = sampleOf(solvableSet, 1500);
    const observations = scenarios.flatMap((scenario) => scenario.observations);
    const sigmas = observations.map((observation) => observation.azimuthSigmaRad);
    const accuracies = observations.map((observation) => observation.positionAccuracyM);
    expect(scenarios.some(({ target }) => Math.abs(target.latRad) > 70 * DEG)).toBe(true);
    expect(sigmas).toContain(MIN_AZIMUTH_SIGMA_RAD);
    expect(sigmas).toContain(MAX_AZIMUTH_SIGMA_RAD);
    expect(accuracies).toContain(0);
    expect(accuracies.some((accuracyM) => accuracyM > MAX_POSITION_ACCURACY_M * 0.999)).toBe(true);
    expect(shareOf(sigmas, (sigmaRad) => sigmaRad > 20 * DEG)).toBeGreaterThan(0.02);
    expect(shareOf(sigmas, (sigmaRad) => sigmaRad < 1 * DEG)).toBeGreaterThan(0.2);
    const ratios = scenarios
      .filter((scenario) => scenario.observations.length >= 3)
      .map(({ observations: set, target }) => crossTrackSigmaRatio(set, target));
    expect(ratios.some((ratio) => ratio > 900)).toBe(true);
    expect(ratios.some((ratio) => ratio < 2)).toBe(true);
  });

  it('noisySolvableSet keeps the geometry and adds noise on the scale of each sigma', () => {
    const normalisedErrors: number[] = [];
    for (const { target, observations } of sampleOf(noisySolvableSet, 400)) {
      for (const observation of observations) {
        expect(validateBearing(observation).ok).toBe(true);
        const errorRad = Math.atan2(
          Math.sin(observation.azimuthRad - trueAzimuth(observation.observer, target)),
          Math.cos(observation.azimuthRad - trueAzimuth(observation.observer, target)),
        );
        normalisedErrors.push(errorRad / observation.azimuthSigmaRad);
      }
    }
    // Noise of one sigma: about 68% of the errors within one sigma, and not all of them zero.
    const withinOne = shareOf(normalisedErrors, (value) => Math.abs(value) < 1);
    expect(withinOne).toBeGreaterThan(0.6);
    expect(withinOne).toBeLessThan(0.76);
  });

  it('meridianSet has observers on both sides of the ±180° meridian and meets Req 7.4', () => {
    for (const { target, observations } of sampleOf(meridianSet, 300)) {
      expect(Math.abs(Math.abs(target.lonRad) - Math.PI)).toBeLessThanOrEqual(1 * DEG + 1e-12);
      expect(Math.abs(target.latRad)).toBeLessThanOrEqual(SOLVABLE_MAX_LAT_RAD);
      expect(observations.some((observation) => observation.observer.lonRad > Math.PI / 2)).toBe(
        true,
      );
      expect(observations.some((observation) => observation.observer.lonRad < -Math.PI / 2)).toBe(
        true,
      );
      expect(largestCrossingAngleRad(observations)).toBeGreaterThanOrEqual(10 * DEG);
      expect(crossTrackSigmaRatio(observations, target)).toBeLessThanOrEqual(MAX_CROSS_TRACK_RATIO);
    }
  });

  it('solvableSetWithExtra keeps Req 7.4 both without and with the extra observation', () => {
    for (const { target, observations, extra } of sampleOf(solvableSetWithExtra, 400)) {
      const extended = [...observations, extra];
      for (const set of [observations, extended]) {
        expect(set.length).toBeGreaterThanOrEqual(2);
        expect(set.length).toBeLessThanOrEqual(12);
        expect(largestCrossingAngleRad(set)).toBeGreaterThanOrEqual(10 * DEG);
        expect(crossTrackSigmaRatio(set, target)).toBeLessThanOrEqual(MAX_CROSS_TRACK_RATIO);
      }
      expect(new Set(extended.map((observation) => observation.id)).size).toBe(extended.length);
      expect(angleGap(extra.azimuthRad, trueAzimuth(extra.observer, target))).toBe(0);
    }
  });

  it('solvableSetWithScale draws only factors that keep every scaled observation valid, reaching both ends', () => {
    const draws = sampleOf(solvableSetWithScale, 1000);
    for (const { scenario, scale } of draws) {
      expect(scale).toBeGreaterThanOrEqual(0.5);
      expect(scale).toBeLessThanOrEqual(4);
      for (const observation of scenario.observations) {
        const scaled = {
          ...observation,
          azimuthSigmaRad: observation.azimuthSigmaRad * scale,
          positionAccuracyM: observation.positionAccuracyM * scale,
        };
        expect(validateBearing(scaled).ok).toBe(true);
      }
    }
    const scales = draws.map((draw) => draw.scale);
    expect(scales).toContain(0.5);
    expect(scales).toContain(4);
    expect(scales.some((scale) => scale > 1.1 && scale < 3.9)).toBe(true);
  });

  it('outlierSet matches Req 10.5: 8 to 12 good observers with no gap over 60°, one bad by 15° to 45°', () => {
    for (const { target, observations, badId } of sampleOf(outlierSet, 300)) {
      expect(Math.abs(target.latRad)).toBeLessThanOrEqual(OUTLIER_MAX_LAT_RAD);
      const good = observations.filter((observation) => observation.id !== badId);
      const bad = observations.filter((observation) => observation.id === badId);
      expect(bad).toHaveLength(1);
      expect(good.length).toBeGreaterThanOrEqual(8);
      expect(good.length).toBeLessThanOrEqual(12);
      expect(new Set(observations.map((observation) => observation.id)).size).toBe(
        observations.length,
      );
      const directionsRad = good.map((observation) => trueAzimuth(target, observation.observer));
      expect(largestDirectionGapRad(directionsRad)).toBeLessThanOrEqual(60 * DEG + 1e-9);
      for (const observation of observations) {
        expect(observation.azimuthSigmaRad).toBeCloseTo(2 * DEG, 15);
        expect(observation.positionAccuracyM).toBe(0);
        const rangeM = rangeOf(observation.observer, target);
        expect(rangeM).toBeGreaterThan(5000 - 1e-3);
        expect(rangeM).toBeLessThan(7000 + 1e-3);
      }
      for (const observation of good) {
        expect(angleGap(observation.azimuthRad, trueAzimuth(observation.observer, target))).toBe(0);
      }
      const [badObservation] = bad;
      if (badObservation === undefined) throw new Error('no bad observation');
      const badErrorRad = angleGap(
        badObservation.azimuthRad,
        trueAzimuth(badObservation.observer, target),
      );
      expect(badErrorRad).toBeGreaterThanOrEqual(15 * DEG - 1e-9);
      expect(badErrorRad).toBeLessThanOrEqual(45 * DEG + 1e-9);
    }
  });
});
