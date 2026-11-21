// The known local minimum of the solve (Req 5.10, as amended on 2026-11-21).
//
// The set was found by the P-5.10 hunt of 2026-11-21 (seed 716968603): four Sights near the zenith
// and one nearly opposite, a largest Angle of cut of 23°. From a start 300 km due north of the
// truth the re-centred solve stops at a stationary point of the cost 569 km away, with non-zero
// residuals; from 250 km, and from every other direction, it reaches the truth. The solve is a
// local method and Req 5.10 now claims convergence only from 100 km. The app never starts the
// solve that far away: it starts from the closed-form Candidates (Req 6.2), and Req 6.9 holds
// that path. Both halves are kept here: the first so that a change to the solver that removes the
// local minimum is noticed (then Req 5.10 may be widened again), the second so that the app's own
// path on this very set stays right.

import { greatCircleDistanceM, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { noiseFreeSights, offsetPosition, preparedAt } from '../../test-support/noise-free';
import { defaultParameters } from '../parameters';
import type { IndexError } from '../sight/index-error';
import { observationsOf } from './altitude-model';
import { assess } from './assess';
import { recentredSolve } from './recentred-solve';

const params = defaultParameters();
const TRUTH: Position = { latRad: 0.26359512215994135, lonRad: -0.3234099641801548 };
const TIMES = [1809862200000, 1809862740000, 1809865260000, 1809865800000, 1809870720000];
/** The shrunk start of the counterexample: due north, at the edge of the old 300 km range. */
const START_OFFSET_M = 299_999.94040971907;
/** Index error 0 with Common sigma 0 ("no Index error" of Req 6.9), as P-6.9 draws it. */
const EXACT: IndexError = {
  valueRad: 0,
  sigmaRad: 0,
  sightCount: 3,
  measuredUtcMs: 0,
  simulated: false,
};

function dist(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function observations() {
  const o = observationsOf(preparedAt(TRUTH, TIMES, params), 'independent', 0);
  if (!o.ok) throw new Error(o.reason);
  return o.value;
}

describe('the known local minimum of the re-centred solve (Req 5.10, 2026-11-21)', () => {
  it('stops 569 km from the truth at a stationary point when started 300 km due north', () => {
    const fix = recentredSolve(
      observations(),
      offsetPosition(TRUTH, 0, START_OFFSET_M),
      {},
      params,
    );
    if (!fix.ok) throw new Error(fix.reason);
    // Measured on 2026-11-21: 568 792 m. The band is wide enough for the platform's rounding.
    const missM = dist(fix.value.position, TRUTH);
    expect(missM).toBeGreaterThan(568_000);
    expect(missM).toBeLessThan(570_000);
    // Not the truth: the residuals are not zero (0.1° to 0.17°) and there is no warning.
    const worstResidualRad = Math.max(...fix.value.residuals.map((r) => Math.abs(r.residualRad)));
    expect(worstResidualRad).toBeGreaterThan(0.001);
    // A stationary point: solving again from it does not move it by more than a few millimetres.
    const again = recentredSolve(observations(), fix.value.position, {}, params);
    if (!again.ok) throw new Error(again.reason);
    expect(dist(again.value.position, fix.value.position)).toBeLessThan(0.01);
  });

  it('reaches the truth from 250 km, from 100 km, and from every other direction at 300 km', () => {
    const starts: readonly (readonly [number, number])[] = [
      [0, 250_000],
      [0, 100_000],
      [Math.PI / 2, 300_000],
      [Math.PI, 300_000],
      [-Math.PI / 2, 300_000],
    ];
    for (const [bearingRad, offsetM] of starts) {
      const start = offsetPosition(
        TRUTH,
        offsetM * Math.sin(bearingRad),
        offsetM * Math.cos(bearingRad),
      );
      const fix = recentredSolve(observations(), start, {}, params);
      if (!fix.ok) throw new Error(fix.reason);
      expect(dist(fix.value.position, TRUTH), `${bearingRad} ${offsetM}`).toBeLessThanOrEqual(0.1);
    }
  });

  it("through the app's own path (assess) gives a Fix or Two places with one within 0.1 m, never a wrong place", () => {
    const sideChoices: readonly (readonly boolean[])[] = [
      [false, false, false, false, false],
      [true, true, true, true, true],
      [true, false, true, false, true],
    ];
    for (const indexError of [EXACT, null]) {
      for (const sides of sideChoices) {
        const label = `${indexError === null ? 'no index error' : 'exact'}, sides ${sides.join()}`;
        const sights = noiseFreeSights(TRUTH, TIMES, 0, sides, params);
        const r = assess(sights, indexError, null, params);
        if (!r.ok) throw new Error(`${label}: ${r.reason}`);
        const a = r.value;
        if (a.kind === 'fix') {
          expect(dist(a.fix.position, TRUTH), label).toBeLessThanOrEqual(0.1);
        } else if (a.kind === 'two_places') {
          const nearer = Math.min(
            dist(a.places[0].fix.position, TRUTH),
            dist(a.places[1].fix.position, TRUTH),
          );
          expect(nearer, label).toBeLessThanOrEqual(0.1);
        } else if (indexError === null && a.kind === 'failed') {
          // Uncalibrated, the Common sigma is 3.5° and this set's geometry is weak: the app
          // refuses to show a place at all, which is honest and not a wrong place.
          expect(a.failure.reason, label).toBe('fix_too_uncertain');
        } else {
          throw new Error(`${label}: unexpected kind ${a.kind}`);
        }
      }
    }
  });
});
