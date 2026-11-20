import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { insideEllipse95, runBand, shareOf, shareText } from './run-harness';

const D = DEG_TO_RAD;
const params = defaultParameters();
const base = { seed: 3, runs: 25, commonSigmaRad: 0, independentSigmaRad: 0.5 * D };

describe('runBand (test support)', () => {
  it('is deterministic in the seed and different for another seed', () => {
    expect(runBand(base, params)).toEqual(runBand(base, params));
    expect(runBand({ ...base, seed: 4 }, params)).not.toEqual(runBand(base, params));
  });

  it('accounts for every run: Shown Fix, Two places or a counted failure', () => {
    const r = runBand(base, params);
    const failed = Object.values(r.outcomes.failed).reduce((a, n) => a + n, 0);
    expect(r.outcomes.fix + r.outcomes.twoPlaces + failed).toBe(base.runs);
    expect(r.coverage.size + r.coveragePoor.size).toBe(r.outcomes.fix + r.outcomes.twoPlaces);
  });

  it('puts the truth inside the ellipse every time when there is no noise at all', () => {
    const r = runBand({ ...base, independentSigmaRad: 0 }, params);
    expect(r.coverage.size).toBeGreaterThan(5);
    expect(r.coverage.hits).toBe(r.coverage.size);
    expect(r.coveragePoor.hits).toBe(r.coveragePoor.size);
  });

  it('puts the truth outside the ellipse often when the noise is far larger than the sigma says', () => {
    const r = runBand({ ...base, runs: 40, independentSigmaRad: 8 * D, commonSigmaRad: 0 }, params);
    const share = shareOf(r.coverage) ?? 1;
    expect(share).toBeLessThan(0.8);
  });

  it('counts false alarms only for 3 to 6 sights without a wrong one, and no alarm without noise', () => {
    const r = runBand({ ...base, runs: 40, independentSigmaRad: 0, minCount: 3 }, params);
    expect(r.falseAlarm.size).toBeGreaterThan(10);
    expect(r.falseAlarm.hits).toBe(0);
    const sizes = Object.values(r.falseAlarmByCount).reduce((a, s) => a + s.size, 0);
    expect(sizes).toBe(r.falseAlarm.size);
    expect(
      Object.keys(r.falseAlarmByCount)
        .map(Number)
        .every((n) => n >= 3 && n <= 6),
    ).toBe(true);
  });

  it('with a wrong Sight reports its shares by size of error and by count, and no false-alarm group', () => {
    const r = runBand(
      {
        ...base,
        runs: 40,
        minCount: 3,
        independentSigmaRad: 0,
        wrong: { minRad: 8 * D, maxRad: 12 * D },
      },
      params,
    );
    expect(r.falseAlarm.size).toBe(0);
    const total = Object.values(r.wrongByError).reduce((a, w) => a + w.size, 0);
    expect(total).toBeGreaterThan(10);
    const sixToTen = r.wrongByError['6°–10°']?.size ?? 0;
    const tenToTwenty = r.wrongByError['10°–20°']?.size ?? 0;
    expect(sixToTen + tenToTwenty).toBe(total);
  });

  it('prints a share', () => {
    expect(shareText('x', { size: 4, hits: 3 })).toBe('x: 3/4 = 75.0 %');
    expect(shareText('x', { size: 0, hits: 0 })).toBe('x: 0/0');
  });
});

describe('insideEllipse95 (test support)', () => {
  const fix = {
    position: { latRad: 0.5, lonRad: 0.5 },
    ellipse: { semiMajorM: 1000, semiMinorM: 500, azimuthRad: 0 },
  };

  it('is the 95 % ellipse, with the major axis along its azimuth', () => {
    // 95 % semi-axes: 2.4477 × 1000 m along north, 2.4477 × 500 m along east.
    const at = (eastM: number, northM: number) => {
      const lat = 0.5 + northM / 6_371_008.8;
      const lon = 0.5 + eastM / (6_371_008.8 * Math.cos(0.5));
      return { latRad: lat, lonRad: lon };
    };
    expect(insideEllipse95(fix, at(0, 2400))).toBe(true);
    expect(insideEllipse95(fix, at(0, 2500))).toBe(false);
    expect(insideEllipse95(fix, at(1200, 0))).toBe(true);
    expect(insideEllipse95(fix, at(1250, 0))).toBe(false);
  });
});
