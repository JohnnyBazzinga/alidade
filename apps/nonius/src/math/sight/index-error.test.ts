import type { Position } from '@alidade/core';
import { UNCALIBRATED_ALTITUDE, type PositionFix } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { sightOf } from '../../test-support/captures';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { EARTH_RADIUS_M } from '../sphere/earth';
import { apparentFromGeometricRad, refractionRad } from '../sun/refraction';
import { sunAt } from '../sun/sun-at';
import { calibrationInUse, indexErrorFromSights, type IndexError } from './index-error';
import type { Sight } from './sight';

const D = DEG_TO_RAD;
const params = defaultParameters();
const PLACE: Position = { latRad: 30 * D, lonRad: -40 * D };
const T0 = Date.UTC(2026, 11, 21, 12, 0);

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

function fix(sigmaM = 5): PositionFix {
  return { position: PLACE, reportedAccuracyM: sigmaM, sigmaM, timeUtcMs: T0 };
}

/** A noise-free Sight at PLACE with the phone's constant error `biasRad` added. */
function sightWithBias(
  id: string,
  timeUtcMs: number,
  biasRad: number,
  over: Partial<Sight> = {},
): Sight {
  const sun = value(sunAt(PLACE, timeUtcMs, params));
  return sightOf({
    id,
    timeUtcMs,
    rawApparentAltitudeRad: sun.apparentAltitudeRad + biasRad,
    sampleStdDevRad: 0,
    ...over,
  });
}

describe('calibrationInUse', () => {
  it('is the skeleton\u2019s uncalibrated sigma without an Index error, and the Index error with one', () => {
    expect(calibrationInUse(null)).toEqual({
      kind: 'uncalibrated',
      sigmaRad: UNCALIBRATED_ALTITUDE.sigmaRad,
    });
    const ie: IndexError = {
      valueRad: 0.1,
      sigmaRad: 0.01,
      sightCount: 2,
      measuredUtcMs: 5,
      simulated: false,
    };
    expect(calibrationInUse(ie)).toEqual({ kind: 'index_error', indexError: ie });
  });
});

describe('indexErrorFromSights (Req 15.3, 15.4)', () => {
  const bias = -3.3 * D;
  const sights = [
    sightWithBias('a', T0, bias),
    sightWithBias('b', T0 + 1_800_000, bias),
    sightWithBias('c', T0 + 3_600_000, bias),
  ];

  it('is the mean of measured minus computed apparent altitude: noise-free sights give the bias', () => {
    const ie = value(indexErrorFromSights(sights, fix(), false, params));
    expect(Math.abs(ie.valueRad - bias)).toBeLessThan(1e-9);
    expect(ie.sightCount).toBe(3);
    expect(ie.measuredUtcMs).toBe(T0 + 3_600_000);
    expect(ie.simulated).toBe(false);
  });

  it('has the sigma sqrt(s²/n + (σpos/R)² + σsun²) with s the larger of the sample sd and the rms Independent sigma', () => {
    const sigmaPosM = 400;
    const ie = value(indexErrorFromSights(sights, fix(sigmaPosM), false, params));
    // With noise-free sights the sample sd of the differences is 0, so s is the rms of the
    // Independent sigmas: hypot(0, 0, aim, 0.1 R(raw)) for each.
    const sigmas = sights.map((s) => {
      const r = value(refractionRad(s.rawApparentAltitudeRad));
      return Math.hypot(
        s.sampleStdDevRad,
        s.markSigmaRad,
        params.aimSigmaRad,
        params.refractionSigmaFraction * r,
      );
    });
    const rms = Math.sqrt(sigmas.reduce((a, x) => a + x * x, 0) / sigmas.length);
    const expected = Math.sqrt(
      (rms * rms) / 3 + (sigmaPosM / EARTH_RADIUS_M) ** 2 + params.sunAltitudeSigmaRad ** 2,
    );
    expect(Math.abs(ie.sigmaRad - expected)).toBeLessThan(1e-12);
    expect(ie.sigmaRad).toBeGreaterThanOrEqual(params.sunAltitudeSigmaRad);
  });

  it('uses the sample standard deviation (over n − 1) of the differences when it is the larger', () => {
    // Differences b ± 0.05°: the rms of the Independent sigmas (0.5° aim) is the larger, so the
    // spread does not show.
    // Make the spread win: 1° either side.
    const wide = [
      sightWithBias('a', T0, bias - 1 * D),
      sightWithBias('b', T0 + 600_000, bias + 1 * D),
    ];
    const ieWide = value(indexErrorFromSights(wide, fix(1), false, params));
    const s = Math.SQRT2 * 1 * D;
    const expected = Math.sqrt(
      (s * s) / 2 + (1 / EARTH_RADIUS_M) ** 2 + params.sunAltitudeSigmaRad ** 2,
    );
    expect(Math.abs(ieWide.sigmaRad - expected)).toBeLessThan(1e-9);
  });

  it('refuses no sights with insufficient_samples', () => {
    expect(indexErrorFromSights([], fix(), false, params)).toMatchObject({
      ok: false,
      reason: 'insufficient_samples',
    });
  });

  it('refuses an Index error beyond 10° with index_error_implausible, at and either side of the limit', () => {
    const at = (b: number) =>
      indexErrorFromSights([sightWithBias('a', T0, b, {})], fix(), false, params);
    // The standing rule for limits: the computed value is the bias within 1e-9, so the check
    // is at 1e-6 either side of the limit.
    expect(at(params.maxIndexErrorRad - 1e-6).ok).toBe(true);
    expect(at(-(params.maxIndexErrorRad - 1e-6)).ok).toBe(true);
    expect(at(params.maxIndexErrorRad + 1e-6)).toMatchObject({
      ok: false,
      reason: 'index_error_implausible',
    });
    expect(at(-(params.maxIndexErrorRad + 1e-6))).toMatchObject({
      ok: false,
      reason: 'index_error_implausible',
    });
  });

  it('at exactly ±10° saves the Index error when its computed mean is within the limit and refuses it otherwise (the standing rule\u2019s example)', () => {
    for (const b of [params.maxIndexErrorRad, -params.maxIndexErrorRad]) {
      const sight = sightWithBias('a', T0, b);
      const sun = value(sunAt(PLACE, T0, params));
      const mean = sight.rawApparentAltitudeRad - sun.apparentAltitudeRad;
      expect(Math.abs(mean - b)).toBeLessThan(1e-9);
      const r = indexErrorFromSights([sight], fix(), false, params);
      if (Math.abs(mean) > params.maxIndexErrorRad) {
        expect(r).toMatchObject({ ok: false, reason: 'index_error_implausible' });
      } else {
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.valueRad).toBe(mean);
      }
    }
  });

  it('applies the limits of the sights to the raw altitude', () => {
    const low = sightOf({ id: 'low', rawApparentAltitudeRad: 4 * D, timeUtcMs: T0 });
    const high = sightOf({ id: 'high', rawApparentAltitudeRad: 81 * D, timeUtcMs: T0 });
    expect(indexErrorFromSights([low], fix(), false, params)).toMatchObject({
      reason: 'sun_too_low',
    });
    expect(indexErrorFromSights([high], fix(), false, params)).toMatchObject({
      reason: 'sun_too_high',
    });
  });

  it('refuses more sights than MAX_SIGHTS with sights_full', () => {
    const many = Array.from({ length: params.maxSights + 1 }, (_, i) =>
      sightWithBias(`s${i}`, T0 + i * 60_000, bias),
    );
    expect(indexErrorFromSights(many, fix(), false, params)).toMatchObject({
      ok: false,
      reason: 'sights_full',
    });
    expect(indexErrorFromSights(many.slice(0, params.maxSights), fix(), false, params).ok).toBe(
      true,
    );
  });

  it('marks a simulated measurement, and holds no Position anywhere in its result', () => {
    const ie = value(indexErrorFromSights(sights, fix(), true, params));
    expect(ie.simulated).toBe(true);
    const text = JSON.stringify(ie);
    expect(text).not.toMatch(/latRad|lonRad|position/i);
    expect(Object.keys(ie).sort()).toEqual(
      ['measuredUtcMs', 'sightCount', 'sigmaRad', 'simulated', 'valueRad'].sort(),
    );
  });

  it('makes the apparent altitude of the Sun by the inverse of the refraction, not by a difference of geometric altitudes', () => {
    // Near 5° with a bias of 3°, the two readings of "the difference" disagree by up to 3′.
    const t = Date.UTC(2026, 11, 21, 10, 10);
    const sun = value(sunAt(PLACE, t, params));
    expect(sun.apparentAltitudeRad).toBeGreaterThan(5 * D);
    const b = 3 * D;
    const s = sightOf({
      id: 'x',
      timeUtcMs: t,
      rawApparentAltitudeRad: sun.apparentAltitudeRad + b,
      sampleStdDevRad: 0,
    });
    const ie = value(indexErrorFromSights([s], fix(), false, params));
    expect(Math.abs(ie.valueRad - b)).toBeLessThan(1e-9);
    const geometricOfRaw = value(apparentFromGeometricRad(sun.geometricAltitudeRad));
    expect(geometricOfRaw).toBeCloseTo(sun.apparentAltitudeRad, 12);
  });

  it('fails first on bad parameters', () => {
    expect(
      indexErrorFromSights(sights, fix(), false, { ...params, maxIndexErrorRad: Number.NaN }),
    ).toMatchObject({ ok: false, reason: 'invalid_number', field: 'maxIndexErrorRad' });
  });
});
