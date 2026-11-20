// The words of the Comparison (Req 11.3).

import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../degrees';
import type { Comparison } from './comparison';
import { comparisonWords } from './fix-words';

const base: Comparison = {
  gps: { latRad: 0.5, lonRad: -0.7 },
  distanceM: 123_000,
  azimuthRad: 45 * DEG_TO_RAD,
  mahalanobisSquared: 1,
  inside: true,
};

const words = (c: Comparison, usesIndexError: boolean, simulated = false) => {
  const r = comparisonWords(c, usesIndexError, simulated);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('comparisonWords', () => {
  it('gives the distance to the nearest step in km and nautical miles, and the direction', () => {
    const t = words(base, false);
    expect(t).toContain('120 km (70 nautical miles)');
    expect(t).toContain('north-east');
  });

  it('says that inside is expected about 19 times in 20', () => {
    expect(words(base, false)).toContain('inside the 95 % area');
    expect(words(base, false)).toContain('about 19 times in 20');
  });

  it('says that outside happens about 1 time in 20 by chance and more often means more error than stated', () => {
    const t = words({ ...base, inside: false, mahalanobisSquared: 9 }, false);
    expect(t).toContain('outside the 95 % area');
    expect(t).toContain('about 1 time in 20');
    expect(t).toContain('more often');
  });

  it('with an Index error in use, says it was measured with this phone’s GPS', () => {
    expect(words(base, true)).toContain('measured with this phone\u2019s GPS');
    expect(words(base, false)).not.toContain('measured with this phone');
  });

  it('labels the scene’s true position when simulated', () => {
    expect(words(base, false, true)).toContain('simulated');
    expect(words(base, false, true)).toContain('true position');
  });

  it('refuses numbers that are not finite', () => {
    expect(comparisonWords({ ...base, distanceM: Number.NaN }, false, false).ok).toBe(false);
  });
});
