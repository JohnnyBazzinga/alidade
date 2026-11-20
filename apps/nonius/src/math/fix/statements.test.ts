import { OUTLIER_STUDENTISED_RESIDUAL } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { noiseFreeSights } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { assess } from './assess';
import { countStatement, disagreementStatement } from './statements';

const D = DEG_TO_RAD;
const params = defaultParameters();
const TRUTH = { latRad: 30 * D, lonRad: -40 * D };
const DAY = Date.UTC(2026, 11, 21);
const H = 3_600_000;
const EXACT = { valueRad: 0, sigmaRad: 0, sightCount: 3, measuredUtcMs: DAY, simulated: false };

describe('countStatement (Req 8.1)', () => {
  it('says what each count can check', () => {
    expect(countStatement(0)).toMatch(/no sight/i);
    expect(countStatement(1)).toMatch(/circle, not a position/);
    expect(countStatement(2)).toMatch(/two sights cannot check each other/);
    expect(countStatement(2)).toMatch(
      /wrong one gives a wrong place and nothing on the screen can tell/,
    );
    expect(countStatement(3)).toMatch(/can be seen to disagree/);
    expect(countStatement(3)).toMatch(/not which one/);
  });

  it('says for four or more that a rule sets a sight aside at Core\u2019s threshold, and that it can be wrong', () => {
    for (const n of [4, 5, 9]) {
      const text = countStatement(n);
      expect(text).toContain(String(OUTLIER_STUDENTISED_RESIDUAL));
      expect(text).toMatch(/can keep a wrong sight or set aside a good one/);
    }
    expect(countStatement(4)).toMatch(/more often with four or five/);
    expect(countStatement(9)).not.toMatch(/more often with four or five/);
  });

  it('names no Sight and has no code, number-like leftover or forbidden word', () => {
    for (const n of [0, 1, 2, 3, 4, 7]) {
      expect(countStatement(n)).not.toMatch(/s0\d|undefined|NaN|null|Infinity|_/);
    }
  });

  it('gives words for a count that is not a count', () => {
    for (const bad of [-1, 1.5, Number.NaN, Infinity]) {
      expect(countStatement(bad)).not.toMatch(/undefined|NaN|Infinity/);
    }
  });
});

describe('disagreementStatement (Req 8.2, 8.3)', () => {
  const TIMES = [DAY + 11 * H, DAY + 14.5 * H, DAY + 18 * H];
  function assessment(offsetDeg: number) {
    const sights = noiseFreeSights(TRUTH, TIMES, 0, false, params).map((s, i) =>
      i === 1 ? { ...s, rawApparentAltitudeRad: s.rawApparentAltitudeRad + offsetDeg * D } : s,
    );
    const r = assess(sights, EXACT, null, params);
    if (!r.ok) throw new Error(r.reason);
    return r.value;
  }

  it('gives the words of the three-sight disagreement, naming no Sight', () => {
    const text = disagreementStatement(assessment(8));
    expect(text).not.toBeNull();
    expect(text).toMatch(/do not agree/);
    expect(text).toMatch(/a reflection, the wrong light, a moved phone, a wrong clock/);
    expect(text).toMatch(/Three sights cannot tell which one, and a fourth can/);
    expect(text).toMatch(/best fit of sights that disagree/);
    expect(text).toMatch(/95 % area may not contain/);
    expect(text).not.toMatch(/\bs0\d\b/);
  });

  it('gives nothing when the sights agree, and for other kinds', () => {
    expect(disagreementStatement(assessment(0))).toBeNull();
    const empty = assess([], null, null, params);
    if (!empty.ok) throw new Error(empty.reason);
    expect(disagreementStatement(empty.value)).toBeNull();
  });
});
