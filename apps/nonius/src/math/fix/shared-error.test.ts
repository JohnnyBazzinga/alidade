import type { CovarianceEnM2, Fix, Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { offsetPosition } from '../../test-support/noise-free';
import { sharedErrorCovariance } from './shared-error';

const FIX: Position = { latRad: 0.5, lonRad: -0.7 };
const BASE: CovarianceEnM2 = { varEastM2: 4e6, varNorthM2: 9e6, covEastNorthM2: 1e6 };
const STEP = 1e-4;

function fixAt(position: Position): Fix {
  return {
    position,
    covariance: BASE,
    ellipse: { semiMajorM: 1, semiMinorM: 1, azimuthRad: 0 },
    residuals: [],
    iterations: 1,
    warnings: [],
    excludedIds: [],
  };
}

/** Fixes that move by `g · (sign · step)` metres East and North when every altitude shifts. */
function shifted(gEastMPerRad: number, gNorthMPerRad: number) {
  return (sign: 1 | -1) =>
    ({
      ok: true,
      value: fixAt(offsetPosition(FIX, sign * gEastMPerRad * STEP, sign * gNorthMPerRad * STEP)),
    }) as const;
}

describe('sharedErrorCovariance (Req 7.2, design §7.3)', () => {
  it('adds sigmaC² · g gᵀ to the covariance of the Fix solve', () => {
    const g = { east: 3.0e6, north: -1.5e6 }; // metres per radian of a shared shift
    const sigmaC = 0.02;
    const r = sharedErrorCovariance(BASE, FIX, shifted(g.east, g.north), sigmaC, STEP);
    if (!r.ok) throw new Error(r.reason);
    const s2 = sigmaC * sigmaC;
    expect(r.value.varEastM2).toBeCloseTo(BASE.varEastM2 + s2 * g.east * g.east, 0);
    expect(r.value.varNorthM2).toBeCloseTo(BASE.varNorthM2 + s2 * g.north * g.north, 0);
    expect(r.value.covEastNorthM2).toBeCloseTo(BASE.covEastNorthM2 + s2 * g.east * g.north, 0);
  });

  it('returns the covariance unchanged when the Common sigma is zero', () => {
    const r = sharedErrorCovariance(BASE, FIX, shifted(5e6, 5e6), 0, STEP);
    expect(r).toEqual({ ok: true, value: BASE });
  });

  it('is symmetric in the sign: a Fix that does not move gives the covariance unchanged', () => {
    const r = sharedErrorCovariance(BASE, FIX, shifted(0, 0), 0.05, STEP);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.varEastM2).toBeCloseTo(BASE.varEastM2, 3);
      expect(r.value.covEastNorthM2).toBeCloseTo(BASE.covEastNorthM2, 3);
    }
  });

  it('returns the failure of either shifted solve', () => {
    const failing = (sign: 1 | -1) =>
      sign === 1
        ? ({ ok: true, value: fixAt(FIX) } as const)
        : ({ ok: false, reason: 'not_converged' } as const);
    expect(sharedErrorCovariance(BASE, FIX, failing, 0.05, STEP)).toMatchObject({
      ok: false,
      reason: 'not_converged',
    });
  });

  it('refuses a step or a sigma that is not usable, and a covariance that is not finite', () => {
    const ok = shifted(1e6, 1e6);
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      expect(sharedErrorCovariance(BASE, FIX, ok, 0.05, bad)).toMatchObject({
        ok: false,
        reason: 'invalid_number',
        field: 'stepRad',
      });
    }
    for (const bad of [-0.1, Number.NaN, Infinity]) {
      expect(sharedErrorCovariance(BASE, FIX, ok, bad, STEP)).toMatchObject({
        ok: false,
        reason: 'invalid_number',
        field: 'commonSigmaRad',
      });
    }
    expect(
      sharedErrorCovariance({ ...BASE, varEastM2: Number.NaN }, FIX, ok, 0.05, STEP),
    ).toMatchObject({ ok: false, reason: 'invalid_number' });
  });
});
