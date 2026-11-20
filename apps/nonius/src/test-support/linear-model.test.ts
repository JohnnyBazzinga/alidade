import { greatCircleDistanceM, solve, unprojectToLocalPlane, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { closedForm, createLinearModel, type LinearObservation } from './linear-model';

const ORIGIN: Position = { latRad: 0.17, lonRad: 0.35 };

const rows: LinearObservation[] = [
  { id: 'a', eastRadPerM: 1e-7, northRadPerM: 0, observedRad: 1e-7 * 300, sigmaRad: 0.01 },
  { id: 'b', eastRadPerM: 0, northRadPerM: 2e-7, observedRad: 2e-7 * -500, sigmaRad: 0.02 },
  {
    id: 'c',
    eastRadPerM: 1e-7,
    northRadPerM: 1e-7,
    observedRad: 1e-7 * (300 - 500),
    sigmaRad: 0.01,
  },
];

describe('the linear test model (test support)', () => {
  it('is solved exactly by Core: the Fix is the point the rows were made from', () => {
    const fix = solve(createLinearModel(ORIGIN), rows, {});
    expect(fix.ok).toBe(true);
    if (!fix.ok) return;
    const made = unprojectToLocalPlane(ORIGIN, { eastM: 300, northM: -500 });
    if (!made.ok) throw new Error(made.reason);
    const d = greatCircleDistanceM(fix.value.position, made.value);
    expect(d.ok && d.value < 1e-6).toBe(true);
  });

  it('has a closed form equal to Core\u2019s covariance when there is no shared error', () => {
    const fix = solve(createLinearModel(ORIGIN), rows, {});
    if (!fix.ok) throw new Error(fix.reason);
    const closed = closedForm(rows, 0);
    const relative = (x: number, y: number) =>
      Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1);
    expect(relative(fix.value.covariance.varEastM2, closed.varEastM2)).toBeLessThan(1e-9);
    expect(relative(fix.value.covariance.varNorthM2, closed.varNorthM2)).toBeLessThan(1e-9);
    expect(relative(fix.value.covariance.covEastNorthM2, closed.covEastNorthM2)).toBeLessThan(1e-9);
  });

  it('adds sigmaC² g gᵀ and reports the conditioning', () => {
    const none = closedForm(rows, 0);
    const shared = closedForm(rows, 0.05);
    const g = none.sensitivityEastMPerRad;
    expect(Math.abs(shared.varEastM2 - none.varEastM2 - 0.05 * 0.05 * g * g)).toBeLessThan(
      1e-6 * none.varEastM2,
    );
    expect(none.conditioning).toBeGreaterThan(0);
    expect(
      closedForm([rows[0] as LinearObservation, { ...(rows[0] as LinearObservation), id: 'z' }], 0)
        .conditioning,
    ).toBeLessThan(1e-12);
  });
});
