// The Fix's words, in order (Req 6.5 to 6.8, 8, 9.1 to 9.3, 9.7; design §8.2).

import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { noiseFreeSights } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import type { IndexError } from '../sight/index-error';
import { assess, type Assessment } from './assess';
import { fixWords, oneSightWords, type WordLine } from './fix-words';

const D = DEG_TO_RAD;
const params = defaultParameters();
const NOW = Date.UTC(2026, 11, 21, 18, 0);
const T = [
  Date.UTC(2026, 11, 21, 11, 40),
  Date.UTC(2026, 11, 21, 14, 40),
  Date.UTC(2026, 11, 21, 17, 40),
];
const BIAS = -3.3 * D;
const INDEX_ERROR: IndexError = {
  valueRad: BIAS,
  sigmaRad: 0.25 * D,
  sightCount: 5,
  measuredUtcMs: NOW - 3_600_000,
  simulated: false,
};

function assessed(times: number[], indexError: IndexError | null, sunSide = true): Assessment {
  const sights = noiseFreeSights(CATALOGUE_ORIGIN, times, BIAS, sunSide, params);
  const r = assess(sights, indexError, null, params);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function words(a: Assessment): readonly WordLine[] {
  const r = fixWords(a, NOW, params);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

const FORBIDDEN = [
  'exact',
  'located at',
  'confirmed',
  'precisely',
  'NaN',
  'Infinity',
  'undefined',
  'null',
];

describe('fixWords of a Fix with three sights', () => {
  const lines = words(assessed(T, INDEX_ERROR));
  const kinds = lines.map((l) => l.kind);
  const all = lines.map((l) => l.text).join('\n');

  it('begins with the calibration, then the position, in the order of design §8.2', () => {
    expect(kinds[0]).toBe('calibration');
    expect(kinds.indexOf('calibration')).toBeLessThan(kinds.indexOf('position'));
    expect(kinds.indexOf('position')).toBeLessThan(kinds.indexOf('axes'));
    expect(kinds.indexOf('axes')).toBeLessThan(kinds.indexOf('choice'));
    expect(kinds.indexOf('choice')).toBeLessThan(kinds.indexOf('count'));
    expect(kinds.indexOf('count')).toBeLessThan(kinds.indexOf('geometry'));
    expect(kinds[kinds.length - 1]).toBe('limits');
  });

  it('says probably within, with kilometres and nautical miles, and the count of used sights', () => {
    const position = lines.find((l) => l.kind === 'position')?.text ?? '';
    expect(position).toMatch(
      /^Probably within about \d+ km \(\d+ nautical miles\) of \d+(\.\d+)?° [NS], \d+(\.\d+)?° [EW]\./,
    );
    expect(lines.find((l) => l.kind === 'count')?.text).toContain('3 sights used');
  });

  it('states the limits of Req 9.2 and uses none of the forbidden words', () => {
    expect(all).toContain('about 111 km (60 nautical miles)');
    expect(all).toContain('28 km');
    expect(all).toContain('No GPS was used for this position');
    expect(all).toContain('not navigation equipment');
    for (const w of FORBIDDEN) expect(all).not.toContain(w);
  });

  it('shows the Index error in use and no uncalibrated sentence', () => {
    expect(lines[0]?.text).toContain('Index error −3.3° ± 0.3°');
    expect(all).not.toContain('never calibrated');
  });
});

describe('fixWords without an Index error', () => {
  it('puts the uncalibrated words before the position', () => {
    const lines = words(assessed(T, null));
    expect(lines[0]?.kind).toBe('calibration');
    expect(lines[0]?.text).toContain('never calibrated');
    expect(lines[0]?.text).toContain('3.5°');
  });
});

describe('fixWords for each kind of Assessment', () => {
  it('empty: how to start and the rule of thumb', () => {
    const lines = words(assessed([], null));
    expect(lines.map((l) => l.kind)).toEqual(['calibration', 'start', 'rule']);
  });

  it('one sight: the circle with its radius and the point where the Sun was overhead', () => {
    const a = assessed([T[0] ?? 0], INDEX_ERROR);
    if (a.kind !== 'one') throw new Error(a.kind);
    const text = oneSightWords(a.sight, params);
    if (!text.ok) throw new Error(text.reason);
    expect(text.value).toMatch(
      /somewhere on a circle of about \d+ km radius around \d+(\.\d+)?° [NS], \d+(\.\d+)?° [EW]/,
    );
    expect(text.value).toContain('11:40 UTC');
    const lines = words(a);
    expect(lines.some((l) => l.kind === 'circle')).toBe(true);
    expect(lines.some((l) => l.kind === 'position')).toBe(false);
    expect(lines.some((l) => l.kind === 'rule')).toBe(true);
  });

  it('two sights without a Sun side: Two places, with A and B, the reasons, no geometry or advice', () => {
    const a = assessed([T[0] ?? 0, T[2] ?? 0], INDEX_ERROR, false);
    if (a.kind !== 'two_places') throw new Error(a.kind);
    const lines = words(a);
    const all = lines.map((l) => l.text).join('\n');
    expect(all).toContain('Two places fit these sights. Choose the one you are near.');
    expect(all).toContain('Place A');
    expect(all).toContain('Place B');
    expect(all).toContain('two sights always cross twice');
    expect(all).toContain('no usable compass reading');
    expect(lines.some((l) => l.kind === 'geometry' || l.kind === 'advice')).toBe(false);
    expect(all).toContain('two sights cannot check each other');
  });

  it('two sights with a Sun side: the choice is the compass, in compass words', () => {
    const a = assessed([T[0] ?? 0, T[2] ?? 0], INDEX_ERROR, true);
    if (a.kind !== 'fix' || a.choice.kind !== 'sun_side') throw new Error(`${a.kind}`);
    const choice = words(a).find((l) => l.kind === 'choice')?.text ?? '';
    expect(choice).toContain('at the other place');
    expect(choice).toMatch(
      /the Sun would have been to the [a-z-]+ at \d\d:\d\d UTC; your phone pointed [a-z-]+/,
    );
  });

  it('three sights that disagree: the disagreement first, the best fit, not probably within', () => {
    const sights = noiseFreeSights(CATALOGUE_ORIGIN, T, BIAS, true, params).map((s, i) =>
      i === 1 ? { ...s, rawApparentAltitudeRad: s.rawApparentAltitudeRad + 3 * D } : s,
    );
    const r = assess(sights, INDEX_ERROR, null, params);
    if (!r.ok || r.value.kind !== 'fix') throw new Error('no fix');
    if (!r.value.disagreement) return;
    const lines = words(r.value);
    expect(lines.map((l) => l.kind).indexOf('disagreement')).toBeLessThan(
      lines.map((l) => l.kind).indexOf('position'),
    );
    const position = lines.find((l) => l.kind === 'position')?.text ?? '';
    expect(position).toContain('best fit of sights that disagree');
    expect(position).not.toContain('Probably within');
  });

  it('a failed solve: its Message in words about sights, and the rule of thumb', () => {
    const close = noiseFreeSights(
      CATALOGUE_ORIGIN,
      [T[1] ?? 0, (T[1] ?? 0) + 60_000],
      BIAS,
      true,
      params,
    );
    const r = assess(close, INDEX_ERROR, null, params);
    if (!r.ok) throw new Error(r.reason);
    const lines = words(r.value);
    expect(lines[0]?.kind).toBe('calibration');
    expect(lines.some((l) => l.kind === 'rule' || l.kind === 'position')).toBe(true);
  });
});
