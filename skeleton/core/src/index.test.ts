// The two thresholds of the solver are exported, and the exported values are the ones it applies
// (G5 of the Vigia design; amendment of 2026-11-18 to Req 10.1 and 9.4). A set of Bearings just
// under and just over each limit must give the outcome the limit predicts, so that an app that
// quotes the limit and the solver cannot disagree.

import { describe, expect, it } from 'vitest';
import * as core from './index';
import {
  BearingModel,
  OUTLIER_STUDENTISED_RESIDUAL,
  POOR_GEOMETRY_CROSSING_RAD,
  degToRad,
  destinationPosition,
  initialAzimuthRad,
  solve,
  type Bearing,
  type Position,
} from './index';
import { makeBearing } from './test-support/bearings';
import { unwrapOk } from './test-support/result-helpers';

const rad = (angleDeg: number): number => unwrapOk(degToRad(angleDeg));
const target: Position = { latRad: rad(30), lonRad: rad(-40) };

describe('exported thresholds (G5)', () => {
  it('are exported from the package entry as numbers with the published values', () => {
    expect(typeof core.OUTLIER_STUDENTISED_RESIDUAL).toBe('number');
    expect(typeof core.POOR_GEOMETRY_CROSSING_RAD).toBe('number');
    expect(OUTLIER_STUDENTISED_RESIDUAL).toBe(3.5); // Req 10.1
    expect(POOR_GEOMETRY_CROSSING_RAD).toBe(20 * (Math.PI / 180)); // Req 9.4
  });
});

describe('OUTLIER_STUDENTISED_RESIDUAL is the limit the solver applies to the Studentised residual (Req 10.1, 11.6)', () => {
  /** Four observers 3 km from the target, 90° apart, each aimed exactly at it; one is turned by `errorRad`. */
  const bearingsWithError = (errorRad: number): Bearing[] =>
    [0, 90, 180, 270].map((azimuthDeg, index) => {
      const observer = unwrapOk(destinationPosition(target, rad(azimuthDeg), 3000));
      const aimedRad = unwrapOk(initialAzimuthRad(observer, target));
      const turnedRad = index === 0 ? aimedRad + errorRad : aimedRad;
      return makeBearing({
        id: `b${index}`,
        observer,
        azimuthRad: ((turnedRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
        azimuthSigmaRad: rad(1),
      });
    });

  /**
   * The largest |Studentised residual| of the solve over all four, with no rejection. Since the
   * amendment of 2026-11-19 the solver applies the limit to the Studentised residual (Req 10.1).
   */
  const worstStudentised = (errorRad: number): number => {
    const fix = unwrapOk(solve(new BearingModel(), bearingsWithError(errorRad)));
    return Math.max(...fix.residuals.map((r) => Math.abs(r.studentisedResidual)));
  };

  /** The error at which the worst Studentised residual equals `level`, by bisection (it grows with the error). */
  const errorAtLevel = (level: number): number => {
    let low = 0;
    let high = rad(30);
    expect(worstStudentised(low)).toBeLessThan(level);
    expect(worstStudentised(high)).toBeGreaterThan(level);
    for (let i = 0; i < 60; i += 1) {
      const middle = (low + high) / 2;
      if (worstStudentised(middle) < level) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  };

  it('keeps all four when the worst Studentised residual is just under the limit', () => {
    const errorRad = errorAtLevel(OUTLIER_STUDENTISED_RESIDUAL - 0.05);
    const fix = unwrapOk(
      solve(new BearingModel(), bearingsWithError(errorRad), { outlierRejection: true }),
    );
    expect(fix.excludedIds).toStrictEqual([]);
    expect(fix.warnings).not.toContain('outliers_excluded');
  });

  it('excludes the Bearing with the largest Studentised residual when it is just over the limit', () => {
    const errorRad = errorAtLevel(OUTLIER_STUDENTISED_RESIDUAL + 0.05);
    const bearings = bearingsWithError(errorRad);
    const unrejected = unwrapOk(solve(new BearingModel(), bearings));
    const worst = [...unrejected.residuals].sort(
      (a, b) => Math.abs(b.studentisedResidual) - Math.abs(a.studentisedResidual),
    )[0];
    // Every Normalised residual is under the limit here, so the first form of Req 10.1 would
    // exclude nothing.
    expect(
      Math.max(...unrejected.residuals.map((r) => Math.abs(r.normalisedResidual))),
    ).toBeLessThan(OUTLIER_STUDENTISED_RESIDUAL);
    const fix = unwrapOk(solve(new BearingModel(), bearings, { outlierRejection: true }));
    expect(fix.excludedIds).toStrictEqual([worst?.id]);
    expect(fix.warnings).toContain('outliers_excluded');
  });
});

describe('POOR_GEOMETRY_CROSSING_RAD is the limit the solver applies (Req 9.4)', () => {
  /** Two Bearings, each aimed at the target from 5 km, whose azimuths differ by `crossingRad`. */
  const pair = (crossingRad: number): Bearing[] => {
    const aimedAt = (id: string, fromTargetRad: number): Bearing => {
      const observer = unwrapOk(destinationPosition(target, fromTargetRad, 5000));
      return makeBearing({
        id,
        observer,
        azimuthRad: unwrapOk(initialAzimuthRad(observer, target)),
        azimuthSigmaRad: rad(1),
      });
    };
    return [aimedAt('a', Math.PI), aimedAt('b', Math.PI + crossingRad)];
  };
  /** The acute angle between the two azimuths, computed here and not by the solver. */
  const acuteDifferenceRad = ([a, b]: Bearing[]): number => {
    const d = Math.abs((a as Bearing).azimuthRad - (b as Bearing).azimuthRad);
    return Math.min(d, Math.PI - d);
  };
  const marginRad = rad(0.3);

  it('gives the warning for a pair whose angle is just under the limit', () => {
    const bearings = pair(POOR_GEOMETRY_CROSSING_RAD - marginRad);
    expect(acuteDifferenceRad(bearings)).toBeLessThan(POOR_GEOMETRY_CROSSING_RAD);
    expect(unwrapOk(solve(new BearingModel(), bearings)).warnings).toContain('poor_geometry');
  });

  it('gives no warning for a pair whose angle is just over the limit', () => {
    const bearings = pair(POOR_GEOMETRY_CROSSING_RAD + marginRad);
    expect(acuteDifferenceRad(bearings)).toBeGreaterThan(POOR_GEOMETRY_CROSSING_RAD);
    expect(unwrapOk(solve(new BearingModel(), bearings)).warnings).not.toContain('poor_geometry');
  });
});
