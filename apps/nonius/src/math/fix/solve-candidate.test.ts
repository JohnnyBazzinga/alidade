import {
  ellipse95,
  ellipseFromCovariance,
  greatCircleDistanceM,
  type Position,
} from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { noiseFreeSights, offsetPosition, preparedOf } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationInUse, type IndexError } from '../sight/index-error';
import type { PreparedSight } from '../sight/prepare';
import { checkSolve, placeFix } from './solve-candidate';

const D = DEG_TO_RAD;
const params = defaultParameters();
const TRUTH: Position = { latRad: 30 * D, lonRad: -40 * D };
const DAY = Date.UTC(2026, 11, 21);
const H = 3_600_000;
const IE: IndexError = {
  valueRad: 0,
  sigmaRad: 0.2 * D,
  sightCount: 3,
  measuredUtcMs: DAY,
  simulated: false,
};

function dist(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

function prepared(
  times: readonly number[],
  biasOfIndex: Record<number, number> = {},
): PreparedSight[] {
  const sights = noiseFreeSights(TRUTH, times, 0, false, params).map((s, i) => ({
    ...s,
    rawApparentAltitudeRad: s.rawApparentAltitudeRad + (biasOfIndex[i] ?? 0),
  }));
  return preparedOf(sights, calibrationInUse(IE), params);
}

describe('checkSolve and placeFix (design §7.3, Req 7.1, 7.2)', () => {
  const three = prepared([DAY + 11 * H, DAY + 14 * H, DAY + 17 * H]);
  const start = offsetPosition(TRUTH, 50_000, -30_000);

  it('places the Fix at the truth for noise-free sights', () => {
    const check = value(checkSolve(three, start, params));
    const shown = value(placeFix(three, check, params));
    expect(dist(shown.position, TRUTH)).toBeLessThan(0.1);
  });

  it('with no Common sigma the two solves weigh alike, so the shown covariance is the check solve\u2019s', () => {
    const noShared = preparedOf(
      noiseFreeSights(TRUTH, [DAY + 11 * H, DAY + 14 * H, DAY + 17 * H], 0, false, params),
      calibrationInUse({ ...IE, sigmaRad: 0 }),
      params,
    );
    const check = value(checkSolve(noShared, start, params));
    const shown = value(placeFix(noShared, check, params));
    for (const key of ['varEastM2', 'varNorthM2', 'covEastNorthM2'] as const) {
      const a = check.covariance[key];
      const b = shown.covariance[key];
      expect(Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1)).toBeLessThan(1e-6);
    }
  });

  it('with a Common sigma the check solve is weighed by the larger sigma, so its covariance is larger than the Fix solve\u2019s part', () => {
    const check = value(checkSolve(three, start, params));
    const shown = value(placeFix(three, check, params));
    // Shown = Fix solve (Independent sigmas) + σc² g gᵀ; the check solve has hypot sigmas. Their
    // traces differ, and both exceed the Fix solve's alone, which the no-Common-sigma case below
    // gives: the shown trace is larger than the trace of the same sights with no Common sigma.
    const bare = preparedOf(
      noiseFreeSights(TRUTH, [DAY + 11 * H, DAY + 14 * H, DAY + 17 * H], 0, false, params),
      calibrationInUse({ ...IE, sigmaRad: 0 }),
      params,
    );
    const bareShown = value(placeFix(bare, value(checkSolve(bare, start, params)), params));
    const trace = (c: { varEastM2: number; varNorthM2: number }) => c.varEastM2 + c.varNorthM2;
    expect(trace(shown.covariance)).toBeGreaterThan(trace(bareShown.covariance));
    expect(trace(check.covariance)).toBeGreaterThan(trace(bareShown.covariance));
  });

  it('shows a covariance whose ellipse is Core\u2019s ellipseFromCovariance of it', () => {
    const check = value(checkSolve(three, start, params));
    const shown = value(placeFix(three, check, params));
    const expected = value(ellipseFromCovariance(shown.covariance));
    expect(shown.ellipse).toEqual(expected);
  });

  it('grows with the Common sigma: no Common sigma gives a smaller ellipse', () => {
    const noShared = preparedOf(
      noiseFreeSights(TRUTH, [DAY + 11 * H, DAY + 14 * H, DAY + 17 * H], 0, false, params),
      calibrationInUse({ ...IE, sigmaRad: 0 }),
      params,
    );
    const a = value(placeFix(noShared, value(checkSolve(noShared, start, params)), params));
    const b = value(placeFix(three, value(checkSolve(three, start, params)), params));
    const area = (f: typeof a) =>
      value(ellipse95(f.ellipse)).semiMajorM * value(ellipse95(f.ellipse)).semiMinorM;
    expect(area(b)).toBeGreaterThan(area(a));
  });

  it('carries the check solve\u2019s excluded ids, and places the Fix without the excluded Sight', () => {
    const five = prepared([DAY + 10 * H, DAY + 12 * H, DAY + 14 * H, DAY + 16 * H, DAY + 18 * H], {
      2: 8 * D,
    });
    const check = value(checkSolve(five, start, params));
    expect(check.excludedIds).toEqual(['s02']);
    const shown = value(placeFix(five, check, params));
    expect(shown.excludedIds).toEqual(['s02']);
    expect(dist(shown.position, TRUTH)).toBeLessThan(0.1);
    expect(shown.warnings).toContain('outliers_excluded');
  });

  it('fails with fix_too_uncertain when the 95 % semi-major axis exceeds the limit, and not below it', () => {
    const check = value(checkSolve(three, start, params));
    const shown = value(placeFix(three, check, params));
    const major = value(ellipse95(shown.ellipse)).semiMajorM;
    expect(placeFix(three, check, { ...params, maxFixSemiMajor95M: major * 0.99 })).toMatchObject({
      ok: false,
      reason: 'fix_too_uncertain',
    });
    expect(placeFix(three, check, { ...params, maxFixSemiMajor95M: major * 1.01 }).ok).toBe(true);
  });

  it('fails with the failures of its parts and with the parameters first', () => {
    expect(checkSolve([], start, params)).toMatchObject({ ok: false });
    expect(checkSolve(three, start, { ...params, sensitivityStepRad: 0 })).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'sensitivityStepRad',
    });
    const check = value(checkSolve(three, start, params));
    expect(placeFix(three, check, { ...params, aimSigmaRad: Number.NaN })).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'aimSigmaRad',
    });
  });
});
