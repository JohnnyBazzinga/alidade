import {
  destinationPosition,
  POOR_GEOMETRY_CROSSING_RAD,
  projectToLocalPlane,
  type Position,
} from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { noiseFreeSights, offsetPosition, preparedOf } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { calibrationInUse } from '../sight/index-error';
import { defaultParameters } from '../parameters';
import { createAltitudeModel, observationsOf, type AltitudeObservation } from './altitude-model';

const D = DEG_TO_RAD;
const params = defaultParameters();
const TRUTH: Position = { latRad: 30 * D, lonRad: -40 * D };
const DAY = Date.UTC(2026, 11, 21);
const H = 3_600_000;

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

function observations(times: readonly number[], kind: 'independent' | 'full' = 'independent') {
  const prepared = preparedOf(
    noiseFreeSights(TRUTH, times, 0, false, params),
    calibrationInUse(null),
    params,
  );
  return value(observationsOf(prepared, kind, 0));
}

function model(start: Position = TRUTH) {
  return value(createAltitudeModel(start, params));
}

describe('observationsOf (design §5)', () => {
  const prepared = preparedOf(
    noiseFreeSights(TRUTH, [DAY + 11 * H, DAY + 17 * H], 0, false, params),
    calibrationInUse(null),
    params,
  );

  it('takes the Independent sigma, or the hypot of Independent and Common, as the Effective sigma', () => {
    const indep = value(observationsOf(prepared, 'independent', 0));
    const full = value(observationsOf(prepared, 'full', 0));
    prepared.forEach((p, i) => {
      expect(indep[i]?.sigmaRad).toBe(p.independentSigmaRad);
      expect(full[i]?.sigmaRad).toBe(Math.hypot(p.independentSigmaRad, p.commonSigmaRad));
    });
  });

  it('adds the shift to the observed geometric altitude and to nothing else', () => {
    const shifted = value(observationsOf(prepared, 'independent', 0.01));
    prepared.forEach((p, i) => {
      expect(shifted[i]?.observedAltitudeRad).toBe(p.observedGeometricAltitudeRad + 0.01);
      expect(shifted[i]?.correctedApparentAltitudeRad).toBe(p.correctedApparentAltitudeRad);
      expect(shifted[i]?.subsolar).toEqual(p.subsolar);
      expect(shifted[i]?.id).toBe(p.sight.id);
    });
  });

  it('refuses a shift that is not finite', () => {
    expect(observationsOf(prepared, 'independent', Number.NaN)).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'shiftRad',
    });
  });
});

describe('the altitude model, validate (Req 5.7)', () => {
  const good = observations([DAY + 11 * H, DAY + 17 * H])[0] as AltitudeObservation;
  const m = model();

  it('accepts a good observation', () => {
    expect(m.validate(good).ok).toBe(true);
  });

  const cases: readonly [string, Partial<AltitudeObservation>][] = [
    ['id', { id: '' }],
    ['timeUtcMs', { timeUtcMs: params.sunModelStartUtcMs - 1 }],
    ['timeUtcMs', { timeUtcMs: params.sunModelEndUtcMs }],
    ['timeUtcMs', { timeUtcMs: Number.NaN }],
    [
      'correctedApparentAltitudeRad',
      { correctedApparentAltitudeRad: params.minSightAltitudeRad - 1e-9 },
    ],
    [
      'correctedApparentAltitudeRad',
      { correctedApparentAltitudeRad: params.maxSightAltitudeRad + 1e-9 },
    ],
    ['correctedApparentAltitudeRad', { correctedApparentAltitudeRad: Number.NaN }],
    ['sigmaRad', { sigmaRad: 0.01 * D - 1e-9 }],
    ['sigmaRad', { sigmaRad: 45 * D + 1e-9 }],
    ['sigmaRad', { sigmaRad: Number.NaN }],
    ['observedAltitudeRad', { observedAltitudeRad: Number.NaN }],
    ['subsolar', { subsolar: { latRad: Number.NaN, lonRad: 0 } }],
  ];
  for (const [field, change] of cases) {
    it(`refuses a bad ${field}, naming the id and the field`, () => {
      const r = m.validate({ ...good, ...change });
      const id = change.id ?? good.id;
      expect(r).toMatchObject({ ok: false, reason: 'invalid_observation', field, id });
    });
  }

  it('accepts the limits exactly', () => {
    for (const change of [
      { correctedApparentAltitudeRad: params.minSightAltitudeRad },
      { correctedApparentAltitudeRad: params.maxSightAltitudeRad },
      { sigmaRad: 0.01 * D },
      { sigmaRad: 45 * D },
      { timeUtcMs: params.sunModelStartUtcMs },
      { timeUtcMs: params.sunModelEndUtcMs - 1 },
    ]) {
      expect(m.validate({ ...good, ...change }).ok).toBe(true);
    }
  });
});

describe('the altitude model, the plain parts (Req 5.5)', () => {
  it('has the start as its origin and (0, 0) as its start estimate; idOf is the id', () => {
    const start = { latRad: 0.3, lonRad: 0.4 };
    const m = model(start);
    const obs = observations([DAY + 11 * H, DAY + 17 * H]);
    expect(m.origin(obs)).toEqual({ ok: true, value: start });
    expect(m.startEstimate(obs, start)).toEqual({ ok: true, value: { eastM: 0, northM: 0 } });
    expect(m.idOf(obs[0] as AltitudeObservation)).toBe('s00');
  });

  it('adds no warning after the solve', () => {
    const m = model();
    const obs = observations([DAY + 11 * H, DAY + 17 * H]);
    const fix = {} as never;
    expect(m.postSolveCheck(fix, TRUTH, obs)).toEqual({ ok: true, value: { warnings: [] } });
  });

  it('refuses a start that is not a supported position and parameters that are bad', () => {
    expect(createAltitudeModel({ latRad: 89.5 * D, lonRad: 0 }, params)).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
    expect(createAltitudeModel(TRUTH, { ...params, planeLimitM: -1 })).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'planeLimitM',
    });
  });
});

describe('the altitude model, geometryCheck (Req 5.6)', () => {
  const base = observations([DAY + 11 * H, DAY + 17 * H]);
  const first = base[0] as AltitudeObservation;

  /** Two observations whose Subsolar points lie at azimuths 0 and `cutRad` from the start. */
  function pairCutting(cutRad: number): readonly AltitudeObservation[] {
    const at = (azimuthRad: number, id: string): AltitudeObservation => ({
      ...first,
      id,
      subsolar: value(destinationPosition(TRUTH, azimuthRad, 4_000_000)),
    });
    return [at(0.3, 'p'), at(0.3 + cutRad, 'q')];
  }

  // The standing rule for limits: a value drawn exactly at a limit can cross it by rounding, so
  // the checks are 1e-6 rad either side of 0.5° and of 20°.
  it('fails with singular_geometry below 0.5° and passes above', () => {
    const m = model();
    expect(m.geometryCheck(pairCutting(0.5 * D - 1e-6))).toMatchObject({
      ok: false,
      reason: 'singular_geometry',
    });
    expect(m.geometryCheck(pairCutting(0.5 * D + 1e-6)).ok).toBe(true);
    expect(m.geometryCheck(pairCutting(0))).toMatchObject({
      ok: false,
      reason: 'singular_geometry',
    });
  });

  it('warns poor_geometry below Core\u2019s 20° and not above', () => {
    const m = model();
    expect(POOR_GEOMETRY_CROSSING_RAD).toBeCloseTo(20 * D, 12);
    expect(m.geometryCheck(pairCutting(POOR_GEOMETRY_CROSSING_RAD - 1e-6))).toEqual({
      ok: true,
      value: { warnings: ['poor_geometry'] },
    });
    expect(m.geometryCheck(pairCutting(POOR_GEOMETRY_CROSSING_RAD + 1e-6))).toEqual({
      ok: true,
      value: { warnings: [] },
    });
  });

  it('measures the Angle of cut as acute: azimuths 170° apart cut at 10°', () => {
    expect(model().geometryCheck(pairCutting(170 * D))).toEqual({
      ok: true,
      value: { warnings: ['poor_geometry'] },
    });
  });

  it('takes the largest Angle of cut over all pairs', () => {
    const [p, q] = pairCutting(10 * D) as [AltitudeObservation, AltitudeObservation];
    const far: AltitudeObservation = {
      ...q,
      id: 'r',
      subsolar: value(destinationPosition(TRUTH, 0.3 + 90 * D, 4_000_000)),
    };
    expect(model().geometryCheck([p, q, far])).toEqual({ ok: true, value: { warnings: [] } });
  });

  it('fails with singular_geometry for fewer than two sights', () => {
    const m = model();
    expect(m.geometryCheck([first])).toMatchObject({ ok: false, reason: 'singular_geometry' });
    expect(m.geometryCheck([])).toMatchObject({ ok: false, reason: 'singular_geometry' });
  });
});

describe('the altitude model, evaluate (Req 5.2, 5.3, 5.11)', () => {
  const obs = observations([DAY + 11 * H, DAY + 17 * H]);
  const first = obs[0] as AltitudeObservation;

  it('has a residual of about zero at the truth for a noise-free sight', () => {
    const e = value(model().evaluate(first, { eastM: 0, northM: 0 }, TRUTH));
    expect(Math.abs(e.residualRad)).toBeLessThan(1e-9);
    expect(e.effectiveSigmaRad).toBe(first.sigmaRad);
    expect(Math.abs(e.predictedRad - first.observedAltitudeRad)).toBeLessThan(1e-9);
  });

  it('has the residual observed minus predicted: a higher observation gives a positive residual', () => {
    const up = value(
      model().evaluate(
        { ...first, observedAltitudeRad: first.observedAltitudeRad + 0.01 },
        { eastM: 0, northM: 0 },
        TRUTH,
      ),
    );
    expect(up.residualRad).toBeCloseTo(0.01, 8);
  });

  it('evaluates the same position the same on any origin', () => {
    const origin = offsetPosition(TRUTH, 200_000, -150_000);
    const candidate = value(projectToLocalPlane(origin, TRUTH));
    const there = value(model().evaluate(first, candidate, origin));
    expect(Math.abs(there.residualRad)).toBeLessThan(1e-9);
  });

  it('fails with out_of_range beyond PLANE_LIMIT_M from the origin, and not at it', () => {
    const m = model();
    expect(m.evaluate(first, { eastM: params.planeLimitM + 1, northM: 0 }, TRUTH)).toMatchObject({
      ok: false,
      reason: 'out_of_range',
    });
    expect(m.evaluate(first, { eastM: 0, northM: -params.planeLimitM - 1 }, TRUTH)).toMatchObject({
      ok: false,
      reason: 'out_of_range',
    });
    expect(m.evaluate(first, { eastM: 0, northM: params.planeLimitM }, TRUTH).ok).toBe(true);
    expect(m.evaluate(first, { eastM: 600_000, northM: 800_001 }, TRUTH)).toMatchObject({
      reason: 'out_of_range',
    });
  });

  it('never returns the reasons of bearings', () => {
    const m = model();
    const reasons = new Set<string>();
    const points = [
      { eastM: 0, northM: 0 },
      { eastM: 2e6, northM: 0 },
      { eastM: Number.NaN, northM: 0 },
      { eastM: 0, northM: Infinity },
    ];
    for (const p of points) {
      const r = m.evaluate(first, p, TRUTH);
      if (!r.ok) reasons.add(r.reason);
    }
    for (const bad of [
      { ...first, sigmaRad: 0 },
      { ...first, id: '' },
      { ...first, timeUtcMs: 0 },
    ]) {
      const r = m.validate(bad);
      if (!r.ok) reasons.add(r.reason);
    }
    const g = m.geometryCheck([]);
    if (!g.ok) reasons.add(g.reason);
    expect(reasons.has('diverging_bearings')).toBe(false);
    expect(reasons.has('colocated_observers')).toBe(false);
    expect(reasons.size).toBeGreaterThan(0);
  });

  it('fails with invalid_number for a candidate that is not finite', () => {
    expect(model().evaluate(first, { eastM: Number.NaN, northM: 0 }, TRUTH)).toMatchObject({
      ok: false,
      reason: 'invalid_number',
    });
  });
});
