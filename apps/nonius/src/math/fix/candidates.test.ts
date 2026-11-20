import { greatCircleDistanceM, initialAzimuthRad, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { preparedAt } from '../../test-support/noise-free';
import { angleOfCutRad } from '../../test-support/generators';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { candidates } from './candidates';

const D = DEG_TO_RAD;
const params = defaultParameters();
const TRUTH: Position = { latRad: 30 * D, lonRad: -40 * D };
// 2026-12-21: local noon at 40° W is about 14:40 UT. Morning, noon and afternoon sights.
const DAY = Date.UTC(2026, 11, 21);
const H = 3_600_000;

function dist(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

describe('candidates (Req 6.2)', () => {
  it('gives two crossings for two sights, one of them the truth', () => {
    const prepared = preparedAt(TRUTH, [DAY + 11 * H, DAY + 17 * H], params);
    const c = value(candidates(prepared, params));
    expect(c.places).toHaveLength(2);
    expect(Math.min(...c.places.map((p) => dist(p, TRUTH)))).toBeLessThan(1);
    expect(c.pairIds).toEqual(['s00', 's01']);
  });

  it('orders the Candidates by latitude, then longitude', () => {
    const prepared = preparedAt(TRUTH, [DAY + 11 * H, DAY + 17 * H], params);
    const [first, second] = value(candidates(prepared, params)).places;
    expect((first as Position).latRad).toBeLessThanOrEqual((second as Position).latRad);
  });

  it('takes the pair of largest Angle of cut among three sights', () => {
    // Morning, near noon and afternoon: the morning and afternoon pair cuts at the widest angle.
    const times = [DAY + 11 * H, DAY + 14 * H + 40 * 60_000, DAY + 18 * H];
    const prepared = preparedAt(TRUTH, times, params);
    const c = value(candidates(prepared, params));
    const azimuthsRad = prepared.map((p) => {
      const a = initialAzimuthRad(TRUTH, p.subsolar);
      return value(a);
    });
    const cuts = new Map<string, number>();
    for (let i = 0; i < 3; i += 1) {
      for (let j = i + 1; j < 3; j += 1) {
        cuts.set(`s0${i}|s0${j}`, angleOfCutRad(azimuthsRad[i] ?? 0, azimuthsRad[j] ?? 0));
      }
    }
    const best = [...cuts.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(c.pairIds.join('|')).toBe(best?.[0]);
    expect(Math.abs(c.angleOfCutRad - (best?.[1] ?? 0))).toBeLessThan(1e-6);
  });

  it('breaks a tie of the Angle of cut by the order of the ids', () => {
    // Two identical copies of one sight and a third: the pairs (s00, s02) and (s01, s02) cut at
    // the same angle, so the first pair in the order of the ids wins.
    const base = preparedAt(TRUTH, [DAY + 11 * H, DAY + 11 * H, DAY + 17 * H], params);
    const c = value(candidates(base, params));
    expect(c.pairIds).toEqual(['s00', 's02']);
  });

  it('does not depend on the order the Sights are given in', () => {
    const times = [DAY + 11 * H, DAY + 14 * H + 40 * 60_000, DAY + 18 * H];
    const prepared = preparedAt(TRUTH, times, params);
    const a = value(candidates(prepared, params));
    const b = value(candidates([...prepared].reverse(), params));
    expect(b).toEqual(a);
  });

  it('keeps the Candidate at the antimeridian: a truth at (0°, −180°) is one of the two (counterexample of P-6.9, seed -249211460)', () => {
    const truth: Position = { latRad: 0, lonRad: -3.141592653589792 };
    const times = [1873409700000, 1873409700000, 1873411500000];
    const prepared = preparedAt(truth, times, params);
    const c = value(candidates(prepared, params));
    expect(c.places).toHaveLength(2);
    expect(Math.min(...c.places.map((p) => dist(p, truth)))).toBeLessThan(1);
    for (const p of c.places) {
      expect(p.lonRad).toBeGreaterThan(-Math.PI);
      expect(p.lonRad).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('fails with circles_do_not_meet when no pair crosses', () => {
    // Two sights at the same instant with altitudes that put the circles inside each other: the
    // same Subsolar point, so the circles are concentric.
    const prepared = preparedAt(TRUTH, [DAY + 11 * H, DAY + 11 * H], params);
    const shifted = prepared.map((p, i) => ({
      ...p,
      observedGeometricAltitudeRad: p.observedGeometricAltitudeRad + (i === 0 ? 0 : 0.2),
    }));
    expect(candidates(shifted, params)).toMatchObject({ ok: false, reason: 'circles_do_not_meet' });
  });

  it('fails with circles_do_not_meet for fewer than two sights, and with the parameters first', () => {
    expect(candidates([], params)).toMatchObject({ ok: false, reason: 'circles_do_not_meet' });
    const one = preparedAt(TRUTH, [DAY + 11 * H], params);
    expect(candidates(one, params)).toMatchObject({ ok: false, reason: 'circles_do_not_meet' });
    expect(candidates(one, { ...params, planeLimitM: Number.NaN })).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'planeLimitM',
    });
  });

  it('drops a crossing that is within 1° of a pole', () => {
    // Circles centred on the same meridian near the pole with a crossing at the pole itself.
    const a = preparedAt(TRUTH, [DAY + 11 * H, DAY + 17 * H], params);
    const polar = a.map((p, i) => ({
      ...p,
      subsolar: { latRad: i === 0 ? 20 * D : 20 * D, lonRad: i === 0 ? 0 : Math.PI },
      observedGeometricAltitudeRad: 20 * D,
    }));
    // Both circles of radius 70° about (20°, 0) and (20°, 180°) meet exactly at the pole.
    const r = candidates(polar, params);
    expect(r).toMatchObject({ ok: false, reason: 'circles_do_not_meet' });
  });
});
