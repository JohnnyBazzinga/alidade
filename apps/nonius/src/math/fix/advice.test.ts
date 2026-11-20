import { POOR_GEOMETRY_CROSSING_RAD, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { angleOfCutRad } from '../../test-support/generators';
import { noiseFreeSights, preparedOf } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationInUse } from '../sight/index-error';
import { sunAt } from '../sun/sun-at';
import { adviceWords, nextSightAdvice, ruleOfThumb } from './advice';

const D = DEG_TO_RAD;
const params = defaultParameters();
const PLACE: Position = { latRad: 30 * D, lonRad: -40 * D };
const DAY = Date.UTC(2026, 11, 21);
const H = 3_600_000;

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

function prepared(times: readonly number[]) {
  return preparedOf(
    noiseFreeSights(PLACE, times, 0, false, params),
    calibrationInUse(null),
    params,
  );
}

describe('nextSightAdvice (Req 10.2, design §7.6)', () => {
  it('names the first 5-minute step at which the Sun has turned by 40° and is within the limits', () => {
    const sights = prepared([DAY + 11 * H]);
    const now = DAY + 11 * H + 60_000;
    const advice = value(nextSightAdvice(PLACE, sights, now, params));
    expect(advice.kind).toBe('wait');
    if (advice.kind !== 'wait') return;
    expect(advice.waitMs % params.adviceScanStepMs).toBe(0);
    expect(advice.atUtcMs).toBe(now + advice.waitMs);
    const a0 = value(sunAt(PLACE, DAY + 11 * H, params)).trueAzimuthRad;
    const at = (t: number) => value(sunAt(PLACE, t, params));
    expect(angleOfCutRad(at(advice.atUtcMs).trueAzimuthRad, a0)).toBeGreaterThanOrEqual(
      params.adviceTurnRad,
    );
    // No earlier step of the grid satisfies both conditions.
    for (let k = 1; k * params.adviceScanStepMs < advice.waitMs; k += 1) {
      const s = at(now + k * params.adviceScanStepMs);
      const inLimits =
        s.apparentAltitudeRad >= params.minSightAltitudeRad &&
        s.apparentAltitudeRad <= params.maxSightAltitudeRad;
      expect(
        inLimits && angleOfCutRad(s.trueAzimuthRad, a0) >= params.adviceTurnRad,
        `k = ${k}`,
      ).toBe(false);
    }
  });

  it('says not_today when the Sun will not turn enough before it sets', () => {
    const late = prepared([DAY + 14 * H + 40 * 60_000]);
    // At local noon the azimuth hardly changes for an hour, and by 17:30 UT (sunset about 22:00 UT
    // at 40° W in December) it has turned: ask at the last light, with two hours left.
    const evening = DAY + 21 * H + 30 * 60_000;
    const advice = value(nextSightAdvice(PLACE, late, evening, params));
    expect(advice).toEqual({ kind: 'not_today' });
  });

  it('measures the turn from the newest used Sight, not from the first', () => {
    const two = prepared([DAY + 11 * H, DAY + 14 * H]);
    const oneNew = prepared([DAY + 14 * H]);
    const now = DAY + 14 * H + 5 * 60_000;
    expect(value(nextSightAdvice(PLACE, two, now, params))).toEqual(
      value(nextSightAdvice(PLACE, oneNew, now, params)),
    );
  });

  it('fails first on bad parameters, and for no sights or a place that is not supported', () => {
    expect(
      nextSightAdvice(PLACE, prepared([DAY + 11 * H]), DAY, { ...params, adviceTurnRad: 0 }),
    ).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'adviceTurnRad',
    });
    expect(nextSightAdvice(PLACE, [], DAY, params)).toMatchObject({
      ok: false,
      reason: 'insufficient_observations',
    });
    expect(
      nextSightAdvice({ latRad: 1.57, lonRad: 0 }, prepared([DAY + 11 * H]), DAY, params),
    ).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
    expect(nextSightAdvice(PLACE, prepared([DAY + 11 * H]), Number.NaN, params)).toMatchObject({
      ok: false,
    });
  });
});

describe('adviceWords (Req 10.2)', () => {
  it('says a wait and a time, rounded up to the step, and that it is computed at the Fix', () => {
    const text = adviceWords(
      { kind: 'wait', waitMs: 100 * 60_000, atUtcMs: DAY + 14 * H + 20 * 60_000 },
      4,
      params,
    );
    expect(text).toContain('next sight in about 1 h 40 min, at 14:20 UTC, or later');
    expect(text).toMatch(
      /computed at the Fix, which may be far from the observer, so the time is approximate/,
    );
    expect(text).not.toMatch(/also lets them be checked/);
  });

  it('adds that a further sight lets two or three sights be checked', () => {
    const wait = { kind: 'wait' as const, waitMs: 40 * 60_000, atUtcMs: DAY + 11 * H };
    expect(adviceWords(wait, 2, params)).toMatch(/a further sight also lets them be checked/);
    expect(adviceWords(wait, 3, params)).toMatch(/a further sight also lets them be checked/);
    expect(adviceWords(wait, 1, params)).not.toMatch(/also lets them be checked/);
  });

  it('says for not_today that the Sun\u2019s direction will not change enough, and to sight again tomorrow from the same place', () => {
    const text = adviceWords({ kind: 'not_today' }, 3, params);
    expect(text).toMatch(/will not change enough before it sets, or before the horizon/);
    expect(text).toMatch(/sight again tomorrow from the same place/);
  });
});

describe('ruleOfThumb (Req 10.7)', () => {
  it('is the sentence of the requirement, built with the wait of the parameters', () => {
    expect(ruleOfThumb(params)).toBe(
      'The Sun\u2019s direction must change by at least 20° between sights. Away from midday at middle latitudes it turns by about 8° to 16° an hour, so wait about 2 h after the latest sight. A morning sight and an afternoon sight usually cross well.',
    );
    expect(ruleOfThumb({ ...params, firstWaitMs: 3 * H })).toContain(
      'wait about 3 h after the latest sight',
    );
    expect(POOR_GEOMETRY_CROSSING_RAD).toBeCloseTo(20 * D, 12);
  });

  it('gives words for bad parameters without a number in them', () => {
    expect(ruleOfThumb({ ...params, firstWaitMs: Number.NaN })).not.toMatch(/NaN|undefined/);
  });
});
