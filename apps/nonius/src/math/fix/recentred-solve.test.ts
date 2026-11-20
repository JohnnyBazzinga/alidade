import { greatCircleDistanceM, solve, type Fix, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { noiseFreeSights, offsetPosition, preparedOf } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationInUse } from '../sight/index-error';
import { observationsOf, type AltitudeObservation } from './altitude-model';
import { recentredSolve } from './recentred-solve';

const D = DEG_TO_RAD;
const params = defaultParameters();
const TRUTH: Position = { latRad: 30 * D, lonRad: -40 * D };
const DAY = Date.UTC(2026, 11, 21);
const H = 3_600_000;

function dist(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function observations(): AltitudeObservation[] {
  const prepared = preparedOf(
    noiseFreeSights(TRUTH, [DAY + 11 * H, DAY + 14 * H, DAY + 17 * H], 0, false, params),
    calibrationInUse(null),
    params,
  );
  const r = observationsOf(prepared, 'independent', 0);
  if (!r.ok) throw new Error(r.reason);
  return [...r.value];
}

describe('recentredSolve (Req 7.8)', () => {
  it('calls Core\u2019s solve at least twice, the second time from the Fix of the first', () => {
    const starts: Position[] = [];
    const counting: typeof solve = (model, obs, options) => {
      const origin = model.origin(obs);
      if (origin.ok) starts.push(origin.value);
      return solve(model, obs, options);
    };
    const start = offsetPosition(TRUTH, 250_000, 120_000);
    const fix = recentredSolve(observations(), start, {}, params, counting);
    expect(fix.ok).toBe(true);
    expect(starts.length).toBeGreaterThanOrEqual(2);
    expect(starts[0]).toEqual(start);
    if (fix.ok) {
      expect(dist(fix.value.position, TRUTH)).toBeLessThan(0.1);
      // The last call was made at (or within a metre of) the Fix of the one before.
      expect(dist(starts[starts.length - 1] as Position, fix.value.position)).toBeLessThan(1);
    }
  });

  it('stops when two Fixes are within RECENTRE_TOLERANCE_M, and not before', () => {
    // A solver double whose Fix moves 3 m, then 0.5 m: it stops at the third call.
    const positions = [
      offsetPosition(TRUTH, 0, 0),
      offsetPosition(TRUTH, 3, 0),
      offsetPosition(TRUTH, 3.5, 0),
      offsetPosition(TRUTH, 100, 0),
    ];
    let calls = 0;
    const fake: typeof solve = () => {
      const position = positions[calls] as Position;
      calls += 1;
      return { ok: true, value: fixAt(position) };
    };
    const r = recentredSolve(observations(), TRUTH, {}, params, fake);
    expect(calls).toBe(3);
    expect(r.ok && r.value.position).toEqual(positions[2]);
  });

  it('fails with not_converged after MAX_RECENTRE_ROUNDS calls', () => {
    let calls = 0;
    const fake: typeof solve = () => {
      calls += 1;
      return { ok: true, value: fixAt(offsetPosition(TRUTH, 10_000 * calls, 0)) };
    };
    expect(recentredSolve(observations(), TRUTH, {}, params, fake)).toMatchObject({
      ok: false,
      reason: 'not_converged',
    });
    expect(calls).toBe(params.maxRecentreRounds);
  });

  it('returns the failure of Core\u2019s solve at once', () => {
    let calls = 0;
    const fake: typeof solve = () => {
      calls += 1;
      return { ok: false, reason: 'singular_geometry' };
    };
    expect(recentredSolve(observations(), TRUTH, {}, params, fake)).toMatchObject({
      ok: false,
      reason: 'singular_geometry',
    });
    expect(calls).toBe(1);
  });

  it('passes the options to every call', () => {
    const seen: unknown[] = [];
    const fake: typeof solve = (_m, _o, options) => {
      seen.push(options);
      return { ok: true, value: fixAt(TRUTH) };
    };
    recentredSolve(observations(), TRUTH, { outlierRejection: true }, params, fake);
    expect(seen).toEqual([{ outlierRejection: true }, { outlierRejection: true }]);
  });

  it('fails with out_of_range when the solution lies beyond 1 000 km of the start', () => {
    const start = offsetPosition(TRUTH, 1_300_000, 0);
    expect(recentredSolve(observations(), start, {}, params)).toMatchObject({
      ok: false,
      reason: 'out_of_range',
    });
  });

  it('fails with invalid_number for bad parameters and an unsupported start', () => {
    expect(
      recentredSolve(observations(), TRUTH, {}, { ...params, maxRecentreRounds: 1 }),
    ).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'maxRecentreRounds',
    });
    expect(recentredSolve(observations(), { latRad: 1.57, lonRad: 0 }, {}, params)).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
  });
});

/** A Fix at `position` with an arbitrary valid covariance, for the solver doubles. */
function fixAt(position: Position): Fix {
  return {
    position,
    covariance: { varEastM2: 1, varNorthM2: 1, covEastNorthM2: 0 },
    ellipse: { semiMajorM: 1, semiMinorM: 1, azimuthRad: 0 },
    residuals: [],
    iterations: 1,
    warnings: [],
    excludedIds: [],
  };
}
