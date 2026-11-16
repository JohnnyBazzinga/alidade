import { describe, expect, it } from 'vitest';
import { TWO_PI_RAD, _wrapTwoPi } from './angle';
import { BearingModel } from './bearing-model';
import type { Bearing } from './observation';
import { destinationPosition, greatCircleDistanceM, initialAzimuthRad } from './position';
import { solve } from './solver';
import { unwrapOk } from './test-support/result-helpers';
import { createSeededRandom } from './test-support/seeded-random';

const DEG = Math.PI / 180;

/**
 * 200 valid bearings of one target from observers 1 km to 20 km away, spread all round it, with
 * 2° of seeded Gaussian noise so that the solve iterates as it would on real sightings.
 */
function twoHundredBearings(seed: number): {
  target: { latRad: number; lonRad: number };
  observations: Bearing[];
} {
  const random = createSeededRandom(seed);
  const target = { latRad: 38.7 * DEG, lonRad: -9.1 * DEG };
  const observations = Array.from({ length: 200 }, (_unused, index): Bearing => {
    const observer = unwrapOk(
      destinationPosition(target, (TWO_PI_RAD * index) / 200, random.nextUniform(1000, 20_000)),
    );
    return {
      id: `o${String(index).padStart(3, '0')}`,
      observer,
      positionAccuracyM: 5,
      timeUtcMs: 1_763_193_600_000,
      azimuthRad: _wrapTwoPi(
        unwrapOk(initialAzimuthRad(observer, target)) + random.nextGaussian(0, 2 * DEG),
      ),
      azimuthSigmaRad: 2 * DEG,
    };
  });
  return { target, observations };
}

/** The median of a list of numbers. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

describe('performance (Req 7.10)', () => {
  // Why the median of five solves, and not one measurement: a single wall-clock reading also
  // times whatever else the machine is doing. On a shared, loaded machine one solve that takes
  // about 11 ms in steady state was seen to stall to 70 to 143 ms in about 1 run in 5, which
  // says nothing about the solver. The median of five ignores up to two such stalls, while still
  // failing if the solver itself is slower than the 50 ms bound of Req 7.10, which stays as it is.
  it('solves 200 observations in under 50 ms (median of five solves after a warm-up)', () => {
    const model = new BearingModel();
    const { target, observations } = twoHundredBearings(7);
    // Warm up once, so that the timing does not include compiling the code.
    unwrapOk(solve(model, observations));

    // The clock is read here, in the test, never by @alidade/core (Req 11.2).
    const elapsedMs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const startedMs = Date.now();
      const result = solve(model, observations);
      elapsedMs.push(Date.now() - startedMs);

      const fix = unwrapOk(result);
      // A sanity check that each timed solve did the real work: 200 bearings with 2° of noise
      // put the fix within a few metres of the target.
      expect(unwrapOk(greatCircleDistanceM(fix.position, target))).toBeLessThan(50);
      expect(fix.residuals).toHaveLength(200);
    }
    expect(median(elapsedMs)).toBeLessThan(50);
  });

  it('takes the median of five as the middle value', () => {
    expect(median([5, 1, 143, 2, 3])).toBe(3);
    expect(median([70, 126, 11, 12, 13])).toBe(13);
  });
});
