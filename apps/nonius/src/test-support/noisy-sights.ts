// Noisy Sights for the statistical tests (test support, not exported): the error model of
// Req 7.3. Seeds are arguments; nothing here reads a clock or a random source.

import type { Position } from '@alidade/core';
import { DEG_TO_RAD } from '../math/degrees';
import type { NoniusParameters } from '../math/parameters';
import type { Sight } from '../math/sight/sight';
import { sunAt } from '../math/sun/sun-at';
import { createSeededNormal } from './seeded-normal';

/** The Sun side's noise in Req 7.3: 5°. */
export const SUN_SIDE_NOISE_RAD = 5 * DEG_TO_RAD;

export interface NoisyOptions {
  /** The Common sigma: one shared error per run is drawn from a normal of this sigma. */
  readonly commonSigmaRad: number;
  /** One independent error per Sight is drawn from a normal of this sigma (Req 7.3: 0.5°). */
  readonly independentSigmaRad: number;
  /** The Sun side's North reference is `true`, with this noise; `null` for no Sun side. */
  readonly sunSideSigmaRad: number | null;
  /** One Sight's altitude wrong by this much (Req 8.6), by index in the order of the times. */
  readonly wrong?: { readonly index: number; readonly errorRad: number };
}

export interface NoisySights {
  readonly sights: readonly Sight[];
  /** The shared error that was added to every altitude. */
  readonly sharedErrorRad: number;
}

/**
 * The Sights of `truth` at `times`: raw altitude = true apparent altitude + one shared error +
 * one independent error per Sight (+ a wrong Sight's error); sample standard deviation 0, no
 * Mark. Draw order is fixed: the shared error, then for each Sight its altitude error, then its
 * Sun side error. Throws when the Sun cannot be computed at a time.
 */
export function noisySights(
  truth: Position,
  times: readonly number[],
  seed: number,
  options: NoisyOptions,
  params: NoniusParameters,
): NoisySights {
  const normal = createSeededNormal(seed);
  const sharedErrorRad = options.commonSigmaRad * normal.next();
  const sights = times.map((timeUtcMs, i): Sight => {
    const sun = sunAt(truth, timeUtcMs, params);
    if (!sun.ok) throw new Error(`sunAt failed: ${sun.reason}`);
    const independent = options.independentSigmaRad * normal.next();
    const wrong = options.wrong?.index === i ? options.wrong.errorRad : 0;
    const sideNoise =
      options.sunSideSigmaRad === null ? 0 : options.sunSideSigmaRad * normal.next();
    return {
      id: `s${String(i).padStart(2, '0')}`,
      timeUtcMs,
      rawApparentAltitudeRad: sun.value.apparentAltitudeRad + sharedErrorRad + independent + wrong,
      sampleStdDevRad: 0,
      markSigmaRad: 0,
      sunSide:
        options.sunSideSigmaRad === null
          ? null
          : { azimuthRad: sun.value.trueAzimuthRad + sideNoise, northReference: 'true' },
      simulated: false,
    };
  });
  return { sights, sharedErrorRad };
}
