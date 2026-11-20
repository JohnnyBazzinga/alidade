// The statistical harness of P-17.9 (design §10, Req 17.9): a Bearing from a Station's script by
// Sensors' own capture, the target-in-ellipse test, the rule that the bound is applied to a scene
// only when at least 100 of its non-`poor` runs exist, and the report of a scene. Test support.

import { HEADING_SIGMA_RAD } from '@alidade/sensors';
import { initialAzimuthRad, wrapPi, type Fix, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { smokeScenes } from '../math/scenes/smoke-scenes';
import { defaultParameters } from '../math/parameters';
import {
  BOUND_MIN_GROUP_SIZE,
  boundApplies,
  captureScene,
  coverageOfScene,
  drawnNorthErrorRad,
  shareWithinBounds,
  targetInsideEllipse95,
} from './capture-from-script';
import { createSeededNormal } from './seeded-normal';
import { offsetFromOrigin, ORIGIN } from './incident-fixtures';

const built = smokeScenes();
if (!built.ok) throw new Error(built.reason);
const SCENES = built.value;
const scene = (id: string) => {
  const found = SCENES.find((s) => s.scene.id === id);
  if (found === undefined) throw new Error(`no scene ${id}`);
  return found;
};
const PARAMETERS = defaultParameters();
const SMOKE = offsetFromOrigin(0, 3000);

/** A Fix at `position` with a 1-sigma ellipse (only these two fields are read). */
const fixWith = (semiMajorM: number, semiMinorM: number, azimuthRad: number) =>
  ({
    position: ORIGIN,
    ellipse: { semiMajorM, semiMinorM, azimuthRad },
  }) as Pick<Fix, 'position' | 'ellipse'>;

const at = (eastM: number, northM: number): Position => offsetFromOrigin(eastM, northM);

describe('the bound rule (Req 17.9)', () => {
  it('applies the bound at 100 runs in the group and not at 99', () => {
    expect(BOUND_MIN_GROUP_SIZE).toBe(100);
    expect(boundApplies(100)).toBe(true);
    expect(boundApplies(99)).toBe(false);
    expect(boundApplies(400)).toBe(true);
    expect(boundApplies(0)).toBe(false);
  });

  it('accepts a share from 90 % to 99 % inclusive', () => {
    expect(shareWithinBounds(90, 100)).toBe(true);
    expect(shareWithinBounds(89, 100)).toBe(false);
    expect(shareWithinBounds(99, 100)).toBe(true);
    expect(shareWithinBounds(100, 100)).toBe(false);
    expect(shareWithinBounds(360, 400)).toBe(true);
    expect(shareWithinBounds(359, 400)).toBe(false);
    expect(shareWithinBounds(396, 400)).toBe(true);
    expect(shareWithinBounds(397, 400)).toBe(false);
  });
});

describe('the target inside the 95 % ellipse (design §10)', () => {
  // 1-sigma semi-axes 100 m and 50 m; the 95 % ones are 244.77 m and 122.385 m.
  it('uses the long axis at its azimuth: an ellipse whose long axis points east', () => {
    const fix = fixWith(100, 50, Math.PI / 2);
    expect(targetInsideEllipse95(fix, at(240, 0))).toEqual({ ok: true, value: true });
    expect(targetInsideEllipse95(fix, at(250, 0))).toEqual({ ok: true, value: false });
    expect(targetInsideEllipse95(fix, at(0, 120))).toEqual({ ok: true, value: true });
    expect(targetInsideEllipse95(fix, at(0, 125))).toEqual({ ok: true, value: false });
  });

  it('an ellipse whose long axis points north is the other way about', () => {
    const fix = fixWith(100, 50, 0);
    expect(targetInsideEllipse95(fix, at(0, 240))).toEqual({ ok: true, value: true });
    expect(targetInsideEllipse95(fix, at(0, 250))).toEqual({ ok: true, value: false });
    expect(targetInsideEllipse95(fix, at(120, 0))).toEqual({ ok: true, value: true });
    expect(targetInsideEllipse95(fix, at(125, 0))).toEqual({ ok: true, value: false });
  });

  it('is on the boundary rotated: a point on the 95 % ellipse at 45 degrees', () => {
    const fix = fixWith(100, 50, Math.PI / 4);
    // On the long axis (north-east) at 240 m: inside; 250 m: outside.
    const d = (m: number) => at(m * Math.SQRT1_2, m * Math.SQRT1_2);
    expect(targetInsideEllipse95(fix, d(240))).toEqual({ ok: true, value: true });
    expect(targetInsideEllipse95(fix, d(250))).toEqual({ ok: true, value: false });
    // The same offset on the short axis (north-west) is far outside.
    const s = (m: number) => at(-m * Math.SQRT1_2, m * Math.SQRT1_2);
    expect(targetInsideEllipse95(fix, s(240))).toEqual({ ok: true, value: false });
    expect(targetInsideEllipse95(fix, s(120))).toEqual({ ok: true, value: true });
  });
});

describe('the Bearings of a run', () => {
  it('draws the north error as HEADING_SIGMA_RAD times a seeded standard normal of seed + 1000·run + station', () => {
    const z = createSeededNormal(5 + 1000 * 3 + 2).next();
    expect(drawnNorthErrorRad(5, 3, 2)).toBe(HEADING_SIGMA_RAD * z);
  });

  it('gives the same Bearings for the same seed and different ones for another', () => {
    const entry = scene('three-posts');
    const options = {
      seed: 11,
      run: 2,
      northErrorRadOf: (_id: string, index: number) => drawnNorthErrorRad(11, 2, index),
    };
    const a = captureScene(entry, options);
    const b = captureScene(entry, options);
    expect(a).toEqual(b);
    const c = captureScene(entry, {
      ...options,
      seed: 12,
      northErrorRadOf: (_id: string, index: number) => drawnNorthErrorRad(12, 2, index),
    });
    expect(c).not.toEqual(a);
  });

  it('names each Bearing by its Station and puts its observer at the Station', () => {
    const entry = scene('three-posts');
    const captured = captureScene(entry, { seed: 1, run: 0 });
    if (!captured.ok) throw new Error(captured.reason);
    expect(captured.value.map((b) => b.id)).toEqual(['west', 'east', 'side']);
    captured.value.forEach((bearing, i) => {
      const station = entry.scene.stations[i];
      expect(bearing.observer).toEqual(station?.position);
    });
  });

  it('carries the drawn north error into the azimuth, and none when it is zero', () => {
    const entry = scene('two-posts');
    const truthOf = (index: number) => {
      const station = entry.scene.stations[index];
      if (station === undefined) throw new Error('station');
      const r = initialAzimuthRad(station.position, SMOKE);
      if (!r.ok) throw new Error('azimuth');
      return r.value;
    };
    const error = 0.05; // 2.9 degrees
    const withError = captureScene(entry, { seed: 1, run: 0, northErrorRadOf: () => error });
    const without = captureScene(entry, { seed: 1, run: 0, northErrorRadOf: () => 0 });
    if (!withError.ok || !without.ok) throw new Error('capture');
    withError.value.forEach((bearing, i) => {
      const d = wrapPi(bearing.azimuthRad - truthOf(i));
      if (!d.ok) throw new Error('wrap');
      // The declination of the Station is applied by the capture, so the error is the north error.
      expect(Math.abs(Math.abs(d.value) - error)).toBeLessThan(0.002);
    });
    without.value.forEach((bearing, i) => {
      const d = wrapPi(bearing.azimuthRad - truthOf(i));
      if (!d.ok) throw new Error('wrap');
      expect(Math.abs(d.value)).toBeLessThan(0.002);
    });
  });

  it('keeps the catalogue’s orientation noise: two seeds differ in the azimuth a little', () => {
    const entry = scene('two-posts');
    const a = captureScene(entry, { seed: 1, run: 0, northErrorRadOf: () => 0 });
    const b = captureScene(entry, { seed: 1, run: 1, northErrorRadOf: () => 0 });
    if (!a.ok || !b.ok) throw new Error('capture');
    expect(a.value[0]?.azimuthRad).not.toBe(b.value[0]?.azimuthRad);
  });
});

describe('the report of a scene (Req 17.9)', () => {
  it('splits the runs into failed solves, poor and not poor, and counts the shares', () => {
    const report = coverageOfScene(scene('three-posts'), { seed: 3, runs: 40 }, PARAMETERS);
    expect(report.sceneId).toBe('three-posts');
    expect(report.runs).toBe(40);
    expect(report.captureFailures).toBe(0);
    expect(report.failedSolves + report.notPoor.size + report.poor.size).toBe(40);
    expect(report.notPoor.inside).toBeLessThanOrEqual(report.notPoor.size);
    expect(report.poor.inside).toBeLessThanOrEqual(report.poor.size);
    expect(report.notPoor.boundApplied).toBe(false); // 40 runs: fewer than 100
    expect(report.runsWithConsistentSetAside).toBe(0); // three Bearings: nothing to reject
  });

  it('is the same for the same seed', () => {
    const a = coverageOfScene(scene('two-posts'), { seed: 9, runs: 20 }, PARAMETERS);
    const b = coverageOfScene(scene('two-posts'), { seed: 9, runs: 20 }, PARAMETERS);
    expect(a).toEqual(b);
  });

  it('puts the two posts in line into the poor group', () => {
    const report = coverageOfScene(scene('almost-in-line'), { seed: 3, runs: 20 }, PARAMETERS);
    expect(report.captureFailures).toBe(0);
    expect(report.poor.size + report.failedSolves).toBe(20);
    expect(report.notPoor.size).toBe(0);
  });
});
