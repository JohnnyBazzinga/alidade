import { declinationAt, type Declination } from '@alidade/sensors';
import { initialAzimuthRad, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { wrapPiN, wrapTwoPiN } from '../../test-support/angles';
import { noiseFreeSights, preparedOf } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationInUse } from '../sight/index-error';
import type { PreparedSight } from '../sight/prepare';
import { contradicts } from './sun-side-check';

const D = DEG_TO_RAD;
const params = defaultParameters();
const TRUTH: Position = { latRad: 30 * D, lonRad: -40 * D };
const DAY = Date.UTC(2026, 11, 21);
const H = 3_600_000;

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

function prepared(sunSide: boolean | readonly boolean[]): PreparedSight[] {
  return preparedOf(
    noiseFreeSights(TRUTH, [DAY + 11 * H, DAY + 14 * H, DAY + 17 * H], 0, sunSide, params),
    calibrationInUse(null),
    params,
  );
}

describe('contradicts (Req 6.5)', () => {
  it('does not contradict the truth when the Sun sides are the true azimuths', () => {
    const r = value(contradicts(TRUTH, prepared(true), params));
    expect(r.contradictedBy).toBeNull();
    expect(r.usable).toBe(3);
  });

  it('contradicts a place far from the truth, naming the first contradicting Sight and its azimuths', () => {
    const other: Position = { latRad: 60 * D, lonRad: 100 * D };
    const r = value(contradicts(other, prepared(true), params));
    expect(r.contradictedBy).not.toBeNull();
    const first = prepared(true)[0];
    const computed = value(initialAzimuthRad(other, first?.subsolar as Position));
    if (r.contradictedBy === 's00') {
      expect(
        Math.abs(
          wrapPiN((r.measuredTrueAzimuthRad ?? 0) - (first?.sight.sunSide?.azimuthRad ?? 0)),
        ),
      ).toBeLessThan(1e-9);
      expect(Math.abs(wrapPiN((r.computedAzimuthRad ?? 0) - computed))).toBeLessThan(1e-9);
    }
  });

  it('counts only the Sights that have a Sun side', () => {
    const r = value(contradicts(TRUTH, prepared([true, false, true]), params));
    expect(r.usable).toBe(2);
    expect(value(contradicts(TRUTH, prepared(false), params)).usable).toBe(0);
    expect(value(contradicts(TRUTH, prepared(false), params)).contradictedBy).toBeNull();
  });

  it('is decided at the tolerance: a Sun side 29° off passes, 31° off contradicts', () => {
    const base = prepared(true);
    const off = (deg: number) =>
      base.map((p) => ({
        ...p,
        sight: {
          ...p.sight,
          sunSide: {
            azimuthRad: wrapTwoPiN((p.sight.sunSide?.azimuthRad ?? 0) + deg * D),
            northReference: 'true' as const,
          },
        },
      }));
    expect(value(contradicts(TRUTH, off(29), params)).contradictedBy).toBeNull();
    expect(value(contradicts(TRUTH, off(31), params)).contradictedBy).toBe('s00');
    expect(value(contradicts(TRUTH, off(-31), params)).contradictedBy).toBe('s00');
  });

  it('turns a magnetic Sun side into a true one with the Declination at the place and time', () => {
    const t = Date.UTC(2026, 11, 21, 14, 0);
    const decl: Declination = value(declinationAt(TRUTH, t));
    expect(Math.abs(decl.declinationRad)).toBeGreaterThan(2 * D);
    const base = prepared(true);
    // The compass reads the true azimuth less the Declination: magnetic = true − declination.
    const magnetic = base.map((p) => {
      const d = value(declinationAt(TRUTH, p.sight.timeUtcMs));
      return {
        ...p,
        sight: {
          ...p.sight,
          sunSide: {
            azimuthRad: wrapTwoPiN((p.sight.sunSide?.azimuthRad ?? 0) - d.declinationRad),
            northReference: 'magnetic' as const,
          },
        },
      };
    });
    const ok = value(contradicts(TRUTH, magnetic, params));
    expect(ok.contradictedBy).toBeNull();
    expect(ok.usable).toBe(3);
    // Ignoring the Declination would leave the Sun side off by the Declination, which is not 30°
    // here, so the tolerance alone does not show it: the azimuth difference is checked exactly.
    expect(ok.worstDifferenceRad).toBeLessThan(1e-6);
  });

  it('leaves a Sight out when the Declination is unknown (a time outside the WMM years)', () => {
    const old = prepared(true).map((p) => ({
      ...p,
      sight: {
        ...p.sight,
        timeUtcMs: Date.UTC(2010, 5, 1),
        sunSide: { azimuthRad: 1, northReference: 'magnetic' as const },
      },
    }));
    const r = value(contradicts(TRUTH, old, params));
    expect(r.usable).toBe(0);
    expect(r.contradictedBy).toBeNull();
  });

  it('fails first on bad parameters and on a place that is not supported', () => {
    expect(contradicts(TRUTH, prepared(true), { ...params, sunSideToleranceRad: 0 })).toMatchObject(
      {
        ok: false,
        reason: 'invalid_number',
        field: 'sunSideToleranceRad',
      },
    );
    expect(contradicts({ latRad: 1.57, lonRad: 0 }, prepared(true), params)).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
  });
});
