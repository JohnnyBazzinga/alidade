import { angularDifference, greatCircleDistanceM, initialAzimuthRad } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { postsIncident, TARGET } from '../../test-support/geometry-fixtures';
import { NOW_UTC_MS, PARAMETERS } from '../../test-support/incident-fixtures';
import { assess, type Assessment } from '../assessment/assess';
import { fromDeg, toDeg } from '../degrees';
import { adviceWords, nextSightingAdvice, type Advice } from './advice';

const assessed = (
  posts: Parameters<typeof postsIncident>[0],
  change?: Parameters<typeof postsIncident>[1],
): Assessment => {
  const a = assess(postsIncident(posts, change), NOW_UTC_MS, PARAMETERS);
  if (!a.ok) throw new Error('assess');
  return a.value;
};
const advised = (a: Assessment): Advice => {
  const r = nextSightingAdvice(a, PARAMETERS);
  if (!r.ok) throw new Error(`advice failed: ${r.reason}`);
  return r.value;
};
const deg = (r: number) => {
  const x = toDeg(r);
  if (!x.ok) throw new Error('toDeg');
  return x.value;
};
/** The size of the angle between two azimuths, in degrees: |wrapPi(a − b)|. */
const offDeg = (aRad: number, bRad: number) => {
  const d = angularDifference(aRad, bRad);
  if (!d.ok) throw new Error('angularDifference');
  return Math.abs(deg(d.value));
};
const rad = (x: number) => {
  const r = fromDeg(x);
  if (!r.ok) throw new Error('fromDeg');
  return r.value;
};
const words = (advice: Advice) => {
  const w = adviceWords(advice);
  if (!w.ok) throw new Error('adviceWords');
  return w.value;
};

describe('nextSightingAdvice (Req 7.2 to 7.6, design §7.10)', () => {
  it('two posts 800 m east and west of smoke 3 000 m north: from the east or the west, about 3 km away (Req 7.9)', () => {
    const advice = advised(assessed(['west', 'east']));
    if (advice.kind !== 'fix') throw new Error(`kind ${advice.kind}`);
    const [d1, d2] = advice.directionsRad;
    const toEast = Math.min(offDeg(d1, rad(90)), offDeg(d2, rad(90)));
    const toWest = Math.min(offDeg(d1, rad(270)), offDeg(d2, rad(270)));
    expect(toEast).toBeLessThan(5);
    expect(toWest).toBeLessThan(5);
    expect(Math.abs(advice.distanceM - 3000) / 3000).toBeLessThan(0.2);
    expect(advice.geometry).toBe('poor');
    expect(advice.usedCount).toBe(2);
  });

  it('gives the two directions at right angles to the major axis, as seen from the Fix', () => {
    const a = assessed(['west', 'east']);
    const advice = advised(a);
    if (advice.kind !== 'fix' || !a.fix?.ok) throw new Error('no fix');
    const mu = a.fix.value.ellipse.azimuthRad;
    for (const d of advice.directionsRad) {
      expect(Math.abs(offDeg(d, mu) - 90)).toBeLessThan(1e-9);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(2 * Math.PI);
    }
  });

  it('stands at the distance of the nearest used observer, clamped to the advice\u2019s least distance and the plausible range', () => {
    const a = assessed(['west', 'east', 'side']);
    const advice = advised(a);
    if (advice.kind !== 'fix' || !a.fix?.ok) throw new Error('no fix');
    const fix = a.fix.value;
    const nearest = Math.min(
      ...a.used.map((e) => {
        const d = greatCircleDistanceM(e.sighting.bearing.observer, fix.position);
        return d.ok ? d.value : Infinity;
      }),
    );
    expect(advice.distanceM).toBe(
      Math.min(Math.max(nearest, PARAMETERS.adviceMinDistanceM), PARAMETERS.plausibleRangeM),
    );
    const far = advised(a);
    const closer = nextSightingAdvice(a, { ...PARAMETERS, adviceMinDistanceM: 10_000 });
    expect(closer.ok && closer.value.kind === 'fix' && closer.value.distanceM).toBe(10_000);
    expect(far.kind).toBe('fix');
  });

  it('shrinks the 95 % area: the area after a further sighting is below the area before', () => {
    const advice = advised(assessed(['west', 'east']));
    if (advice.kind !== 'fix') throw new Error('kind');
    expect(advice.areaAfterM2).not.toBeNull();
    expect(advice.areaAfterM2 ?? Infinity).toBeLessThan(advice.areaBeforeM2);
    // 765 m by 204 m (the probe of design §10) is an area of about 490 000 m².
    expect(advice.areaBeforeM2).toBeGreaterThan(300_000);
    expect(advice.areaBeforeM2).toBeLessThan(700_000);
  });

  it('is none with no used Sighting, and one_sighting with one or with a solve that failed (Req 7.4, 7.5)', () => {
    expect(advised(assessed([]))).toEqual({ kind: 'none' });
    expect(advised(assessed(['west']))).toEqual({ kind: 'one_sighting' });
    const colocated = assessed(['front', 'front'] as never);
    expect(colocated.fix?.ok).toBe(false);
    expect(advised(colocated)).toEqual({ kind: 'one_sighting' });
  });

  it('returns no hypothetical Bearing, and nothing that holds one (Req 7.6)', () => {
    const advice = advised(assessed(['west', 'east']));
    expect(JSON.stringify(advice)).not.toContain('hypothetical');
    expect(Object.keys(advice).sort()).toEqual(
      [
        'areaAfterM2',
        'areaBeforeM2',
        'directionsRad',
        'distanceM',
        'geometry',
        'kind',
        'usedCount',
      ].sort(),
    );
  });

  it('names the parameter that is not valid', () => {
    expect(
      nextSightingAdvice(assessed(['west', 'east']), { ...PARAMETERS, plausibleRangeM: -1 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'plausibleRangeM',
    });
  });
});

describe('nextSightingAdvice: a Fix whose numbers cannot be used (Req 2.1)', () => {
  it('fails with invalid_number naming ellipse when the 95 % area overflows', () => {
    const a = assessed(['west', 'east']);
    if (!a.fix?.ok) throw new Error('no fix');
    const huge = {
      ...a,
      fix: {
        ok: true as const,
        value: { ...a.fix.value, ellipse: { semiMajorM: 1e300, semiMinorM: 1e300, azimuthRad: 0 } },
      },
    };
    expect(nextSightingAdvice(huge, PARAMETERS)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'ellipse',
    });
  });
});

describe('adviceWords (Req 7.2 to 7.4, design §7.10)', () => {
  it('for one sighting: move sideways by at least a third of the distance, which gives a crossing of about 20°', () => {
    const sentence = words({ kind: 'one_sighting' });
    expect(sentence).toBe(
      'Move sideways, at right angles to the direction of the smoke, by at least a third of the distance you think the smoke is at; farther is better.',
    );
    expect(sentence).toContain('a third');
    const crossingDeg = deg(2 * Math.atan(0.35 / 2));
    expect(Math.abs(crossingDeg - 20)).toBeLessThan(0.2);
  });

  it('for a poor or fair Fix: the two directions in words, the distance, the reason, and that it does not know the ground', () => {
    const advice = advised(assessed(['west', 'east']));
    expect(words(advice)).toMatch(
      /^To shrink the area most, take a further sighting from the (east|west) or the (east|west) of the smoke, about [\d.]+ (m|km) from it\. Move to the side, so that you and the others are not all on one line to the smoke\. The app does not know the terrain, roads or access, so choose the place yourself\.$/,
    );
    expect(words(advice)).toContain('east');
    expect(words(advice)).toContain('west');
  });

  it('for a good Fix: one sentence, and with two or three sightings that another still helps (Req 7.3)', () => {
    const good = (usedCount: number): Advice => ({
      kind: 'fix',
      directionsRad: [0, Math.PI],
      distanceM: 3000,
      areaBeforeM2: 1,
      areaAfterM2: 1,
      geometry: 'good',
      usedCount,
    });
    const helps =
      'The geometry is good; a further sighting from anywhere still helps, because with fewer than four sightings nothing can be checked.';
    expect(words(good(2))).toBe(helps);
    expect(words(good(3))).toBe(helps);
    expect(words(good(4))).toBe('The geometry is good.');
  });

  it('has no sentence when there is no sighting at all', () => {
    expect(adviceWords({ kind: 'none' })).toEqual({ ok: true, value: null });
  });

  it('names no place and claims nothing about the smoke\u2019s position', () => {
    const sentence = words(advised(assessed(['west', 'east', 'side'])));
    expect(sentence).not.toMatch(/° [NSEW]|probably|located/);
  });

  it('three-posts: the side post makes the Fix round, and the advice says the geometry is good', () => {
    const advice = advised(assessed(['west', 'east', 'side']));
    expect(advice.kind === 'fix' && advice.geometry).toBe('good');
  });

  it('points at the place of the side post after two captures of two-posts', () => {
    const advice = advised(assessed(['west', 'east']));
    if (advice.kind !== 'fix') throw new Error('kind');
    const toSide = initialAzimuthRad(
      TARGET,
      postsIncident(['side']).entries[0]?.sighting.bearing.observer ?? TARGET,
    );
    if (!toSide.ok) throw new Error('azimuth');
    // The side post (3.1 km east, 3 km north) lies due east of the smoke: within 5° of an advised direction.
    expect(Math.min(...advice.directionsRad.map((d) => offDeg(d, toSide.value)))).toBeLessThan(5);
  });
});
