import { declinationAt } from '@alidade/sensors';
import { greatCircleDistanceM, OUTLIER_STUDENTISED_RESIDUAL, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { wrapTwoPiN } from '../../test-support/angles';
import { noiseFreeSights } from '../../test-support/noise-free';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import type { IndexError } from '../sight/index-error';
import type { Sight } from '../sight/sight';
import { sunAt } from '../sun/sun-at';
import { assess, type Assessment, type UserChoice } from './assess';

const D = DEG_TO_RAD;
const params = defaultParameters();
const TRUTH: Position = { latRad: 30 * D, lonRad: -40 * D };
const DAY = Date.UTC(2026, 11, 21);
const H = 3_600_000;
/** An Index error of zero with no sigma: the sights' only error is their own. */
const EXACT: IndexError = {
  valueRad: 0,
  sigmaRad: 0,
  sightCount: 3,
  measuredUtcMs: DAY,
  simulated: false,
};

function dist(a: Position, b: Position): number {
  const r = greatCircleDistanceM(a, b);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

function run(
  sights: readonly Sight[],
  indexError: IndexError | null = EXACT,
  userChoice: UserChoice | null = null,
  p = params,
): Assessment {
  const r = assess(sights, indexError, userChoice, p);
  if (!r.ok) throw new Error(`assess failed: ${r.reason}`);
  return r.value;
}

function sights(times: readonly number[], sunSide: boolean | readonly boolean[]): Sight[] {
  return noiseFreeSights(TRUTH, times, 0, sunSide, params);
}

const MORNING_AFTERNOON = [DAY + 11 * H, DAY + 17 * H];
const THREE = [DAY + 11 * H, DAY + 14.5 * H, DAY + 18 * H];

describe('assess: the kinds (design §7.5)', () => {
  it('is empty without sights, carrying the Calibration in use', () => {
    const a = run([], null);
    expect(a.kind).toBe('empty');
    expect(a.calibration.kind).toBe('uncalibrated');
    expect(run([], EXACT).calibration.kind).toBe('index_error');
  });

  it('is one with one Sight, which holds no position', () => {
    const a = run(sights([DAY + 11 * H], false));
    expect(a.kind).toBe('one');
    expect(JSON.stringify(a)).not.toContain('"fix"');
    if (a.kind === 'one') expect(a.sight.sight.id).toBe('s00');
  });

  it('is failed with circles_do_not_meet when no pair crosses', () => {
    const s = sights([DAY + 11 * H, DAY + 11 * H], false).map((x, i) => ({
      ...x,
      rawApparentAltitudeRad: x.rawApparentAltitudeRad + (i === 0 ? 0 : 0.2),
    }));
    const a = run(s);
    expect(a.kind).toBe('failed');
    if (a.kind === 'failed') expect(a.failure.reason).toBe('circles_do_not_meet');
  });

  it('is failed with fix_too_uncertain when the 95 % semi-major axis exceeds the limit', () => {
    const a = run(sights(THREE, false), EXACT, null, { ...params, maxFixSemiMajor95M: 1 });
    expect(a.kind).toBe('failed');
    if (a.kind === 'failed') expect(a.failure.reason).toBe('fix_too_uncertain');
  });

  it('sets aside a Sight whose corrected altitude is out of the limits, with its cause', () => {
    const s = sights(THREE, false).map((x, i) =>
      i === 0 ? { ...x, rawApparentAltitudeRad: 0.02 } : x,
    );
    const a = run(s);
    expect(a.setAside.map((x) => [x.sight.id, x.cause])).toEqual([['s00', 'sun_too_low']]);
  });

  it('fails only for bad parameters', () => {
    expect(assess([], null, null, { ...params, maxSights: 1 })).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'maxSights',
    });
  });
});

describe('assess: the choice between two crossings (Req 6)', () => {
  it('chooses by the Sun side when exactly one place is not contradicted (two sights)', () => {
    const a = run(sights(MORNING_AFTERNOON, true));
    expect(a.kind).toBe('fix');
    if (a.kind !== 'fix') return;
    expect(dist(a.fix.position, TRUTH)).toBeLessThan(0.1);
    expect(a.choice.kind).toBe('sun_side');
    if (a.choice.kind === 'sun_side') {
      expect(a.choice.otherDistanceM).toBeGreaterThan(100_000);
      expect(['s00', 's01']).toContain(a.choice.sightId);
    }
  });

  it('shows Two places for two sights with no Sun side, in latitude order, one of them the truth', () => {
    const a = run(sights(MORNING_AFTERNOON, false));
    expect(a.kind).toBe('two_places');
    if (a.kind !== 'two_places') return;
    expect(a.places.map((p) => p.label)).toEqual(['A', 'B']);
    const [first, second] = a.places;
    expect(first.fix.position.latRad).toBeLessThanOrEqual(second.fix.position.latRad);
    expect(
      Math.min(dist(first.fix.position, TRUTH), dist(second.fix.position, TRUTH)),
    ).toBeLessThan(0.1);
    expect(a.why).toContain('two_sights');
    expect(a.why).toContain('no_sun_side');
    expect(a.distanceM).toBeCloseTo(dist(first.fix.position, second.fix.position), 3);
    expect(a.usedIdsKey).toBe('s00\ns01');
  });

  it('applies the user\u2019s choice only for its used set, and a changed set clears it', () => {
    const two = sights(MORNING_AFTERNOON, false);
    const shown = run(two);
    if (shown.kind !== 'two_places') throw new Error('expected two places');
    const choice: UserChoice = { usedIdsKey: shown.usedIdsKey, placeIndex: 1 };
    const chosen = run(two, EXACT, choice);
    expect(chosen.kind).toBe('fix');
    if (chosen.kind === 'fix') {
      expect(chosen.choice).toMatchObject({ kind: 'user', label: 'B' });
      expect(dist(chosen.fix.position, shown.places[1].fix.position)).toBeLessThan(1);
    }
    // A choice made for another set is not applied.
    expect(run(two, EXACT, { usedIdsKey: 'other', placeIndex: 1 }).kind).toBe('two_places');
    // Undoing the choice shows the two places again, and choosing again gives the same Fix.
    expect(run(two, EXACT, null).kind).toBe('two_places');
    expect(run(two, EXACT, choice).kind).toBe('fix');
  });

  it('chooses by the fit for three sights when only one place fits all of them', () => {
    const found = scan((a) => a.kind === 'fix' && a.choice.kind === 'fit', false);
    expect(found).not.toBeNull();
    const { truth, assessment: a } = found as Found;
    if (a.kind !== 'fix' || a.choice.kind !== 'fit') throw new Error('not a fit');
    expect(dist(a.fix.position, truth)).toBeLessThan(0.1);
    // The other place misses the worst sight by more than the sigma of a sight (0.5°).
    expect(a.choice.worstMissRad).toBeGreaterThan(0.5 * D);
    expect(a.choice.compassDisagreedWithBoth).toBe(false);
  });

  it('says that the compass disagreed with both places when the Sun side contradicts both', () => {
    const found = scan(
      (a) => a.kind === 'fix' && a.choice.kind === 'fit' && a.choice.compassDisagreedWithBoth,
      true,
      Math.PI,
    );
    expect(found).not.toBeNull();
    const { truth, assessment: a } = found as Found;
    if (a.kind !== 'fix') throw new Error('not a fix');
    expect(dist(a.fix.position, truth)).toBeLessThan(0.1);
  });

  it('gives the equinox case: four sights over six hours with no Sun side show Two places, one at the truth and one near the opposite latitude', () => {
    // 2026-03-20: the Sun's declination is within 0.5° of zero from 06:00 to 24:00 UT.
    const equinoxTruth: Position = { latRad: 35 * D, lonRad: 10 * D };
    const day = Date.UTC(2026, 2, 20);
    const times = [day + 8 * H, day + 10 * H, day + 12 * H, day + 14 * H];
    const base = noiseFreeSights(equinoxTruth, times, 0, false, params);
    const a = assess(base, EXACT, null, params);
    if (!a.ok) throw new Error(a.reason);
    expect(a.value.kind).toBe('two_places');
    if (a.value.kind !== 'two_places') return;
    expect(a.value.why).toContain('equinox');
    const [p, q] = a.value.places;
    const nearTruth =
      dist(p.fix.position, equinoxTruth) < dist(q.fix.position, equinoxTruth) ? p : q;
    const other = nearTruth === p ? q : p;
    expect(dist(nearTruth.fix.position, equinoxTruth)).toBeLessThan(0.1);
    expect(Math.abs(other.fix.position.latRad + equinoxTruth.latRad)).toBeLessThan(3 * D);
    // One magnetic Sun side, made with the Declination of Sensors' model, gives the true place.
    const decl = declinationAt(equinoxTruth, times[1] ?? 0);
    if (!decl.ok) throw new Error(decl.reason);
    const withSide = base.map((s, i) =>
      i === 1
        ? {
            ...s,
            sunSide: {
              azimuthRad: wrapTwoPiN(trueAzimuthAt(equinoxTruth, s) - decl.value.declinationRad),
              northReference: 'magnetic' as const,
            },
          }
        : s,
    );
    const b = assess(withSide, EXACT, null, params);
    if (!b.ok) throw new Error(b.reason);
    expect(b.value.kind).toBe('fix');
    if (b.value.kind === 'fix') expect(dist(b.value.fix.position, equinoxTruth)).toBeLessThan(0.1);
  });

  it('keeps a single place when the other crossing gives no solution (other_failed), and says whether the compass disagrees', () => {
    const plain = scan((a) => a.kind === 'fix' && a.choice.kind === 'other_failed', false);
    expect(plain).not.toBeNull();
    const a = (plain as Found).assessment;
    if (a.kind !== 'fix' || a.choice.kind !== 'other_failed') throw new Error('not other_failed');
    expect(a.choice.compassDisagrees).toBe(false);
    expect(dist(a.fix.position, (plain as Found).truth)).toBeLessThan(0.1);
    const contradicted = scan(
      (x) => x.kind === 'fix' && x.choice.kind === 'other_failed' && x.choice.compassDisagrees,
      true,
      Math.PI,
    );
    expect(contradicted).not.toBeNull();
  });
});

describe('assess: the checks (Req 8)', () => {
  it('says the sights disagree for three sights with one wrong, and not for three that agree', () => {
    const good = run(sights(THREE, false));
    expect(good.kind === 'fix' && good.disagreement).toBe(false);
    const bad = sights(THREE, false).map((s, i) =>
      i === 1 ? { ...s, rawApparentAltitudeRad: s.rawApparentAltitudeRad + 8 * D } : s,
    );
    const a = run(bad);
    expect(a.kind).toBe('fix');
    if (a.kind === 'fix') {
      expect(a.disagreement).toBe(true);
      expect(
        a.check.residuals.some(
          (r) => Math.abs(r.studentisedResidual) > OUTLIER_STUDENTISED_RESIDUAL,
        ),
      ).toBe(true);
    }
  });

  it('never says disagreement for fewer or more than three sights', () => {
    const four = [DAY + 11 * H, DAY + 13 * H, DAY + 15 * H, DAY + 17.5 * H];
    const bad = sights(four, false).map((s, i) =>
      i === 1 ? { ...s, rawApparentAltitudeRad: s.rawApparentAltitudeRad + 8 * D } : s,
    );
    const a = run(bad);
    expect(a.kind === 'fix' && a.disagreement).toBe(false);
  });

  it('sets a Sight aside as an outlier with four or more sights, and does not name one with three', () => {
    const five = [DAY + 11 * H, DAY + 12.5 * H, DAY + 14.5 * H, DAY + 16.5 * H, DAY + 18 * H];
    const bad = sights(five, false).map((s, i) =>
      i === 2 ? { ...s, rawApparentAltitudeRad: s.rawApparentAltitudeRad + 8 * D } : s,
    );
    const a = run(bad);
    expect(a.kind).toBe('fix');
    if (a.kind === 'fix') {
      expect(a.setAside.map((x) => [x.sight.id, x.cause])).toEqual([['s02', 'outlier']]);
      expect(a.used.map((u) => u.sight.id)).toEqual(['s00', 's01', 's03', 's04']);
      expect(dist(a.fix.position, TRUTH)).toBeLessThan(0.1);
    }
    const three = sights(THREE, false).map((s, i) =>
      i === 1 ? { ...s, rawApparentAltitudeRad: s.rawApparentAltitudeRad + 8 * D } : s,
    );
    const t = run(three);
    expect(t.setAside.filter((x) => x.cause === 'outlier')).toEqual([]);
  });

  it('carries the Calibration in use into the assessment', () => {
    const a = run(sights(THREE, false), null);
    expect(a.calibration.kind).toBe('uncalibrated');
  });
});

/** The Sun's true azimuth at `place` at the Sight's time. */
function trueAzimuthAt(place: Position, sight: Sight): number {
  const sun = sunAt(place, sight.timeUtcMs, params);
  if (!sun.ok) throw new Error(sun.reason);
  return sun.value.trueAzimuthRad;
}

interface Found {
  readonly truth: Position;
  readonly assessment: Assessment;
}

/**
 * The first of a deterministic grid of places and times (three sights three hours apart, with the
 * Sun side the true azimuth turned by `sideTurnRad` when `withSide`) whose assessment satisfies
 * `wanted`. The geometry of which crossing fits cannot be written down by hand.
 */
function scan(
  wanted: (a: Assessment) => boolean,
  withSide: boolean,
  sideTurnRad = 0,
): Found | null {
  for (let lat = -60; lat <= 60; lat += 15) {
    for (let lon = -170; lon <= 170; lon += 40) {
      for (let month = 0; month < 12; month += 3) {
        for (let h0 = 0; h0 < 24; h0 += 3) {
          const truth: Position = { latRad: lat * D, lonRad: lon * D };
          const t0 = Date.UTC(2026, month, 15, h0);
          let base: Sight[];
          try {
            base = noiseFreeSights(truth, [t0, t0 + 3 * H, t0 + 6 * H], 0, withSide, params);
          } catch {
            continue;
          }
          const turned = base.map((s) =>
            s.sunSide === null
              ? s
              : {
                  ...s,
                  sunSide: {
                    ...s.sunSide,
                    azimuthRad: wrapTwoPiN(s.sunSide.azimuthRad + sideTurnRad),
                  },
                },
          );
          const r = assess(turned, EXACT, null, params);
          if (r.ok && wanted(r.value)) return { truth, assessment: r.value };
        }
      }
    }
  }
  return null;
}
