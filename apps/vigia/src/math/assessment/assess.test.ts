import {
  BearingModel,
  destinationPosition,
  greatCircleDistanceM,
  OUTLIER_STUDENTISED_RESIDUAL,
  solve,
  type Bearing,
  type Fix,
  type Result,
} from '@alidade/core';
import { describe, expect, it } from 'vitest';
import {
  entryOfBearing,
  incidentOfEntries,
  pointingAt,
  postPosition,
  postsIncident,
  TARGET,
  type PostName,
} from '../../test-support/geometry-fixtures';
import {
  NOW_UTC_MS,
  offsetFromOrigin,
  PARAMETERS,
  sightingIdOf,
} from '../../test-support/incident-fixtures';
import type { Incident, SightingEntry } from '../incident/incident-state';
import { assess, assessWith, type Assessment, type SetAsideCause } from './assess';

const MAX_AGE = PARAMETERS.maxIncidentAgeMs;
const SKEW = PARAMETERS.clockSkewToleranceMs;

const assessed = (incident: Incident, now = NOW_UTC_MS): Assessment => {
  const result = assess(incident, now, PARAMETERS);
  if (!result.ok) throw new Error(`assess failed: ${result.reason} ${result.field ?? ''}`);
  return result.value;
};
const causeOf = (a: Assessment, n: number): SetAsideCause | 'used' | 'absent' => {
  const id = sightingIdOf(n);
  if (a.used.some((e) => e.sighting.sightingId === id)) return 'used';
  return a.setAside.find((s) => s.entry.sighting.sightingId === id)?.cause ?? 'absent';
};
const usedIds = (a: Assessment) => a.used.map((e) => e.sighting.sightingId);

/** The time the code gives a Bearing time: the centre of its second (design §8.1). */
const EPOCH_UTC_MS = 1_767_225_600_000;
const snap = (timeUtcMs: number) =>
  EPOCH_UTC_MS + Math.floor((timeUtcMs - EPOCH_UTC_MS) / 1000) * 1000 + 500;

/** An entry at `post` pointing at the target, at a given time (snapped, so that it is exact). */
function entry(
  n: number,
  post: PostName,
  timeUtcMs: number,
  hidden = false,
  errorRad = 0,
): SightingEntry {
  const bearing = pointingAt(sightingIdOf(n), postPosition(post), TARGET, errorRad, {
    timeUtcMs: snap(timeUtcMs),
  });
  return entryOfBearing(n, bearing, hidden);
}
/** The time an entry really has, after the code has rounded it to the cell centre. */
const timeOf = (e: SightingEntry) => e.sighting.bearing.timeUtcMs;
const created = (e: SightingEntry[], createdUtcMs = NOW_UTC_MS - 3_600_000) =>
  incidentOfEntries(e, createdUtcMs);

describe('assess: the counts and the Fix (Req 5.1, 6.1, design §7.6)', () => {
  it('with no Sighting: nothing used, nothing set aside, no Fix, level none, no disagreement', () => {
    expect(assessed(created([]))).toEqual({
      used: [],
      setAside: [],
      fix: null,
      checkLevel: 'none',
      disagreement: 'none',
    });
  });

  it('with one Sighting: it is used, there is no Fix, level one', () => {
    const a = assessed(created([entry(1, 'west', NOW_UTC_MS - 60_000)]));
    expect(usedIds(a)).toEqual([sightingIdOf(1)]);
    expect(a.setAside).toEqual([]);
    expect(a.fix).toBeNull();
    expect(a.checkLevel).toBe('one');
  });

  it('with two Sightings: a Fix, level two, nothing set aside', () => {
    const a = assessed(postsIncident(['west', 'east']));
    expect(a.used).toHaveLength(2);
    expect(a.setAside).toEqual([]);
    expect(a.fix?.ok).toBe(true);
    expect(a.checkLevel).toBe('two');
    expect(a.disagreement).toBe('none');
  });

  it('gives Core\u2019s Fix of the used Bearings, with outlier rejection on, and nothing else', () => {
    const incident = postsIncident(['west', 'east', 'side', 'southwest']);
    const a = assessed(incident);
    const expected = solve(
      new BearingModel(),
      incident.entries.map((e) => e.sighting.bearing),
      {
        outlierRejection: true,
      },
    );
    expect(a.fix).toEqual(expected);
  });

  it('puts each count in its level', () => {
    const levels = (posts: readonly PostName[]) => assessed(postsIncident(posts)).checkLevel;
    expect(levels(['west'])).toBe('one');
    expect(levels(['west', 'east'])).toBe('two');
    expect(levels(['west', 'east', 'side'])).toBe('three');
    expect(levels(['west', 'east', 'side', 'southwest'])).toBe('four_or_more');
  });

  it('orders the Sightings by Bearing time, then by Sighting id, used and set aside alike', () => {
    const t = NOW_UTC_MS - 60_000;
    const incident = created([
      entry(3, 'west', t),
      entry(1, 'east', t),
      entry(2, 'side', t - 120_000),
      entry(4, 'southwest', t, true),
      entry(5, 'front', t, true),
    ]);
    const a = assessed(incident);
    expect(usedIds(a)).toEqual([sightingIdOf(2), sightingIdOf(1), sightingIdOf(3)]);
    expect(a.setAside.map((s) => s.entry.sighting.sightingId)).toEqual([
      sightingIdOf(4),
      sightingIdOf(5),
    ]);
  });

  it('does not change the Incident it was given', () => {
    const incident = postsIncident(['west', 'east', 'side']);
    const before = JSON.stringify(incident);
    assessed(incident);
    expect(JSON.stringify(incident)).toBe(before);
  });
});

describe('assess: the set-aside causes, one per Sighting, in the order of design §7.6 (Req 5.2, 5.3)', () => {
  const t = NOW_UTC_MS - 60_000;

  it('hidden_by_user for a hidden Sighting', () => {
    const a = assessed(
      created([entry(1, 'west', t), entry(2, 'east', t), entry(3, 'side', t, true)]),
    );
    expect(causeOf(a, 3)).toBe('hidden_by_user');
    expect(a.used).toHaveLength(2);
  });

  it('a hidden Sighting that is also too old, or implausible, is hidden_by_user', () => {
    const a = assessed(
      created([
        entry(1, 'west', t),
        entry(2, 'east', t),
        entry(3, 'side', t - 3 * MAX_AGE, true),
        entry(4, 'southwest', NOW_UTC_MS + 10 * SKEW, true),
      ]),
    );
    expect(causeOf(a, 3)).toBe('hidden_by_user');
    expect(causeOf(a, 4)).toBe('hidden_by_user');
  });

  it('sighting_time_implausible for a time later than now plus the skew, at and either side of the limit', () => {
    const e = entry(3, 'side', NOW_UTC_MS + SKEW);
    const exact = timeOf(e) - SKEW; // `now` at which the Sighting is exactly at the limit
    expect(timeOf(e)).toBe(snap(NOW_UTC_MS + SKEW));
    const base = [entry(1, 'west', exact - 60_000), entry(2, 'east', exact - 60_000), e];
    expect(causeOf(assessed(created(base), exact), 3)).toBe('used');
    expect(causeOf(assessed(created(base), exact - 1), 3)).toBe('sighting_time_implausible');
    expect(causeOf(assessed(created(base), exact + 1), 3)).toBe('used');
  });

  it('sighting_time_implausible for a time more than the maximum age before the Incident was created, at and either side', () => {
    const e = entry(3, 'side', t);
    const timeMs = timeOf(e);
    const base = [entry(1, 'west', t), entry(2, 'east', t), e];
    expect(causeOf(assessed(created(base, timeMs + MAX_AGE)), 3)).toBe('used');
    expect(causeOf(assessed(created(base, timeMs + MAX_AGE + 1)), 3)).toBe(
      'sighting_time_implausible',
    );
    expect(causeOf(assessed(created(base, timeMs + MAX_AGE - 1)), 3)).toBe('used');
  });

  it('sighting_too_old when more than the maximum age before the newest used Sighting, at and either side', () => {
    const newest = entry(1, 'west', t);
    const ref = timeOf(newest);
    const base = (oldTimeMs: number) =>
      created(
        [newest, entry(2, 'east', t - 1000), entry(3, 'side', oldTimeMs)],
        ref - 10 * MAX_AGE,
      );
    expect(causeOf(assessed(base(ref - MAX_AGE)), 3)).toBe('used');
    expect(causeOf(assessed(base(ref - MAX_AGE + 1000)), 3)).toBe('used');
    expect(causeOf(assessed(base(ref - MAX_AGE - 1000)), 3)).toBe('sighting_too_old');
  });

  it('with two or more candidates the newest is never too old, whatever now is', () => {
    const e1 = entry(1, 'west', t);
    const e2 = entry(2, 'east', t - 2 * MAX_AGE);
    const a = assessed(created([e1, e2], NOW_UTC_MS - 10 * MAX_AGE));
    expect(causeOf(a, 1)).toBe('used');
    expect(causeOf(a, 2)).toBe('sighting_too_old');
  });

  it('with only one candidate left the reference is now: a Sighting older than the maximum age before now is too old', () => {
    const old = entry(1, 'west', NOW_UTC_MS - 2 * MAX_AGE);
    const hiddenOther = entry(2, 'east', t, true);
    const a = assessed(created([old, hiddenOther]));
    expect(causeOf(a, 1)).toBe('sighting_too_old');
    expect(causeOf(a, 2)).toBe('hidden_by_user');
    expect(a.used).toEqual([]);
    expect(a.fix).toBeNull();
    expect(a.checkLevel).toBe('none');
    // Within the maximum age of now it is used.
    const recent = entry(1, 'west', NOW_UTC_MS - MAX_AGE + 10_000);
    expect(causeOf(assessed(created([recent, hiddenOther])), 1)).toBe('used');
  });

  it('with two old Sightings of about the same age both are used: the reference is the newest, not now', () => {
    const a = assessed(
      created(
        [
          entry(1, 'west', NOW_UTC_MS - 2 * 3_600_000),
          entry(2, 'east', NOW_UTC_MS - 2 * 3_600_000 + 60_000),
        ],
        NOW_UTC_MS - 5 * 3_600_000,
      ),
    );
    expect(a.used).toHaveLength(2);
    expect(a.fix?.ok).toBe(true);
  });

  it('implausible comes before too old: an old Sighting before the creation window is implausible', () => {
    const a = assessed(
      created(
        [entry(1, 'west', t), entry(2, 'east', t), entry(3, 'side', t - 5 * MAX_AGE)],
        NOW_UTC_MS - MAX_AGE,
      ),
    );
    expect(causeOf(a, 3)).toBe('sighting_time_implausible');
  });

  it('too old comes before outlier: an old Sighting is not given to the solver', () => {
    const a = assessed(
      created(
        [
          entry(1, 'west', t),
          entry(2, 'east', t),
          entry(3, 'side', t),
          entry(4, 'front', t),
          entry(5, 'southwest', t - 2 * MAX_AGE, false, 0.6),
        ],
        NOW_UTC_MS - 10 * MAX_AGE,
      ),
    );
    expect(causeOf(a, 5)).toBe('sighting_too_old');
  });

  it('outlier for the Sighting Core excludes, with four or more used', () => {
    const incident = postsIncident(['west', 'east', 'side', 'southwest'], (post) =>
      post === 'southwest' ? { errorRad: (12 * Math.PI) / 180 } : {},
    );
    const a = assessed(incident);
    expect(causeOf(a, 4)).toBe('outlier');
    expect(a.used).toHaveLength(3);
    expect(a.fix?.ok && a.fix.value.excludedIds).toEqual([sightingIdOf(4)]);
    expect(a.checkLevel).toBe('three');
  });

  it('every Sighting has exactly one cause: used or set aside, never both', () => {
    const a = assessed(
      created(
        [
          entry(1, 'west', t),
          entry(2, 'east', t),
          entry(3, 'side', t, true),
          entry(4, 'southwest', NOW_UTC_MS + 10 * SKEW),
          entry(5, 'front', t - 2 * MAX_AGE),
        ],
        NOW_UTC_MS - 10 * MAX_AGE,
      ),
    );
    const ids = [
      ...a.used.map((e) => e.sighting.sightingId),
      ...a.setAside.map((s) => s.entry.sighting.sightingId),
    ];
    expect(ids.sort()).toEqual([1, 2, 3, 4, 5].map(sightingIdOf).sort());
    expect(new Set(ids).size).toBe(5);
  });
});

describe('assess: a solve that fails keeps every Sighting as it was (Req 5.7)', () => {
  it('an observer standing at the smoke (excluded from sightingSet): Core\u2019s answer, and every Sighting kept', () => {
    const t = NOW_UTC_MS - 60_000;
    const atSmoke = entryOfBearing(3, {
      ...pointingAt(sightingIdOf(3), postPosition('west'), TARGET, 0, { timeUtcMs: t }),
      observer: TARGET,
    });
    const incident = created([entry(1, 'west', t), entry(2, 'east', t), atSmoke]);
    const a = assessed(incident);
    const core = solve(
      new BearingModel(),
      incident.entries.map((e) => e.sighting.bearing),
      {
        outlierRejection: true,
      },
    );
    expect(a.fix).toEqual(core);
    expect(a.used.length + a.setAside.length).toBe(3);
    expect(a.setAside.every((s) => s.cause === 'outlier')).toBe(true);
  });

  it('colocated observers: the failure of Core is the Fix, both Sightings stay used', () => {
    const here = postPosition('west');
    const incident = created([
      entryOfBearing(
        1,
        pointingAt(sightingIdOf(1), here, TARGET, 0, { timeUtcMs: NOW_UTC_MS - 60_000 }),
      ),
      entryOfBearing(
        2,
        pointingAt(sightingIdOf(2), here, TARGET, 0.1, { timeUtcMs: NOW_UTC_MS - 60_000 }),
      ),
    ]);
    const a = assessed(incident);
    expect(a.fix).toMatchObject({ ok: false, reason: 'colocated_observers' });
    expect(a.used).toHaveLength(2);
    expect(a.setAside).toEqual([]);
    expect(a.checkLevel).toBe('two');
    expect(a.disagreement).toBe('none');
  });

  it('lines that are parallel and apart: singular_geometry, both stay used', () => {
    const t = NOW_UTC_MS - 60_000;
    const incident = created([
      entryOfBearing(1, {
        ...pointingAt(sightingIdOf(1), offsetFromOrigin(0, 0), TARGET, 0, { timeUtcMs: t }),
        azimuthRad: 0,
      }),
      entryOfBearing(2, {
        ...pointingAt(sightingIdOf(2), offsetFromOrigin(2000, 0), TARGET, 0, { timeUtcMs: t }),
        azimuthRad: 0,
      }),
    ]);
    const a = assessed(incident);
    expect(a.fix).toMatchObject({ ok: false, reason: 'singular_geometry' });
    expect(a.used).toHaveLength(2);
  });
});

describe('assess: the disagreement of three Sightings and diverging lines (Req 5.5, design §7.6 step 7)', () => {
  const sigma = (post: PostName, errorDeg: number) => ({
    post,
    errorRad: (errorDeg * Math.PI) / 180,
  });
  const threePosts = (error: { post: PostName; errorRad: number }) =>
    postsIncident(['west', 'east', 'side'], (post) =>
      post === error.post ? { errorRad: error.errorRad } : {},
    );

  it('three_disagree when exactly three are used and a Studentised residual passes the limit of Core', () => {
    // A search, in the test, for an error of the west post that makes a residual pass 3.5.
    let found: number | null = null;
    for (let errorDeg = 1; errorDeg <= 60 && found === null; errorDeg += 1) {
      const a = assessed(threePosts(sigma('west', errorDeg)));
      if (a.disagreement === 'three_disagree') found = errorDeg;
    }
    expect(found).not.toBeNull();
    const errorDeg = found ?? 0;
    const a = assessed(threePosts(sigma('west', errorDeg)));
    expect(a.disagreement).toBe('three_disagree');
    expect(a.used).toHaveLength(3);
    expect(a.setAside).toEqual([]);
    expect(a.checkLevel).toBe('three');
    const fix = a.fix?.ok ? a.fix.value : null;
    const largest = Math.max(...(fix?.residuals ?? []).map((r) => Math.abs(r.studentisedResidual)));
    expect(largest).toBeGreaterThan(OUTLIER_STUDENTISED_RESIDUAL);
    // One degree less, and the limit is not passed.
    expect(assessed(threePosts(sigma('west', errorDeg - 1))).disagreement).toBe('none');
  });

  it('a 12 degree error on the side post of three-posts is not a disagreement (the residuals stay near 1.2)', () => {
    const a = assessed(threePosts(sigma('side', 12)));
    expect(a.disagreement).toBe('none');
    const residuals = a.fix?.ok
      ? a.fix.value.residuals.map((r) => Math.abs(r.normalisedResidual))
      : [];
    expect(Math.max(...residuals)).toBeLessThan(OUTLIER_STUDENTISED_RESIDUAL);
    expect(a.used).toHaveLength(3);
  });

  it('three_disagree for the lead\u2019s case: one of three Bearings 15° off, where no normalised residual passes 3.5', () => {
    // Posts at (-800, 0), (800, 0) and (4000, 3500) m from the origin, the target at (0, 3000) m,
    // sigmas of 2°, the second Bearing 15° off. Every normalised residual stays under 3.5, so the
    // rule on the normalised residual said nothing, with the Fix 545 m from the target; the three
    // Studentised residuals share one magnitude above 3.5 (Core Req 10.9), so the app says that
    // the sightings disagree (Req 5.5).
    const twoDeg = (2 * Math.PI) / 180;
    const posts = [
      offsetFromOrigin(-800, 0),
      offsetFromOrigin(800, 0),
      offsetFromOrigin(4000, 3500),
    ];
    const incident = created(
      posts.map((observer, index) =>
        entryOfBearing(
          index + 1,
          pointingAt(
            sightingIdOf(index + 1),
            observer,
            TARGET,
            index === 1 ? (15 * Math.PI) / 180 : 0,
            {
              azimuthSigmaRad: twoDeg,
            },
          ),
        ),
      ),
    );
    const a = assessed(incident);
    const fix = a.fix?.ok ? a.fix.value : null;
    if (fix === null) throw new Error('no Fix');
    const off = greatCircleDistanceM(fix.position, TARGET);
    expect(off.ok && off.value).toBeGreaterThan(500);
    expect(Math.max(...fix.residuals.map((r) => Math.abs(r.normalisedResidual)))).toBeLessThan(
      OUTLIER_STUDENTISED_RESIDUAL,
    );
    expect(Math.min(...fix.residuals.map((r) => Math.abs(r.studentisedResidual)))).toBeGreaterThan(
      OUTLIER_STUDENTISED_RESIDUAL,
    );
    expect(a.disagreement).toBe('three_disagree');
    expect(a.used).toHaveLength(3);
    expect(a.setAside).toEqual([]);
  });

  it('names no Sighting and shows no second Fix: the set aside is empty and there is one Fix', () => {
    const errorDeg = 40;
    const a = assessed(threePosts(sigma('east', errorDeg)));
    expect(a.disagreement).toBe('three_disagree');
    expect(a.setAside).toEqual([]);
    expect(Object.keys(a).sort()).toEqual([
      'checkLevel',
      'disagreement',
      'fix',
      'setAside',
      'used',
    ]);
  });

  // Core returns diverging_bearings only after the solve has converged, when a remaining
  // Bearing's residual at the Fix is beyond 90° (bearing model, `postSolveCheck`). With outlier
  // rejection on, that Bearing must keep its normalised residual under 3.5, so its sigma is loose:
  // two Bearings crossing at 90° on the smoke, and a third from 5 km beyond it with a 45° sigma
  // that points 150° off (as in Core's own example). A fourth tight Bearing changes nothing.
  const t = NOW_UTC_MS - 60_000;
  const from = (azimuthDeg: number) => {
    const p = destinationPosition(TARGET, (azimuthDeg * Math.PI) / 180, 5000);
    if (!p.ok) throw new Error('destination');
    return p.value;
  };
  const tight = (n: number, azimuthDeg: number) =>
    entryOfBearing(n, pointingAt(sightingIdOf(n), from(azimuthDeg), TARGET, 0, { timeUtcMs: t }));
  const loose = (n: number) =>
    entryOfBearing(
      n,
      pointingAt(sightingIdOf(n), from(0), TARGET, (-150 * Math.PI) / 180, {
        timeUtcMs: t,
        azimuthSigmaRad: Math.PI / 4,
      }),
    );

  it('diverging when the solve fails with diverging_bearings and three or more are used', () => {
    const three = assessed(created([tight(1, 270), tight(2, 180), loose(3)]));
    expect(three.fix).toEqual({ ok: false, reason: 'diverging_bearings' });
    expect(three.disagreement).toBe('diverging');
    expect(three.used).toHaveLength(3);
    expect(three.setAside).toEqual([]);
    const four = assessed(created([tight(1, 270), tight(2, 180), loose(3), tight(4, 90)]));
    expect(four.fix).toEqual({ ok: false, reason: 'diverging_bearings' });
    expect(four.disagreement).toBe('diverging');
    expect(four.used).toHaveLength(4);
    expect(four.checkLevel).toBe('four_or_more');
  });

  it('a hidden Sighting changes the Fix: hiding a tight one of four leaves three that still diverge, and hiding the loose one ends it', () => {
    const four = [tight(1, 270), tight(2, 180), loose(3), tight(4, 90)];
    const hideTight = assessed(created(four.map((e, i) => (i === 3 ? { ...e, hidden: true } : e))));
    expect(hideTight.used).toHaveLength(3);
    expect(hideTight.disagreement).toBe('diverging');
    const hideLoose = assessed(created(four.map((e, i) => (i === 2 ? { ...e, hidden: true } : e))));
    expect(hideLoose.fix?.ok).toBe(true);
    expect(hideLoose.disagreement).toBe('none');
  });

  it('is not diverging with two used: the failure is the Fix and nothing is said of disagreement', () => {
    // Two Bearings fit any point exactly, so Core cannot give a residual beyond 90° for them: the
    // rule of design §7.6 step 7 is tested through the seam with Core's failure.
    const result = assessWith(
      created([tight(1, 270), tight(2, 180)]),
      NOW_UTC_MS,
      PARAMETERS,
      () => ({
        ok: false,
        reason: 'diverging_bearings',
      }),
    );
    expect(result.ok && result.value.fix).toEqual({ ok: false, reason: 'diverging_bearings' });
    expect(result.ok && result.value.disagreement).toBe('none');
    expect(result.ok && result.value.used).toHaveLength(2);
  });
});

describe('assess: the invalid_observation loop, through the seam with a fake solve (design §7.6 step 5)', () => {
  const four = () => postsIncident(['west', 'east', 'side', 'southwest']);
  const run = (solveFn: (bearings: readonly Bearing[]) => Result<Fix>) => {
    const result = assessWith(four(), NOW_UTC_MS, PARAMETERS, solveFn);
    if (!result.ok) throw new Error('failed');
    return result.value;
  };
  const real = (bearings: readonly Bearing[]) =>
    solve(new BearingModel(), bearings, { outlierRejection: true });

  it('sets aside the candidate the failure names with invalid_observation, and solves again without it', () => {
    const calls: number[] = [];
    const a = run((bearings) => {
      calls.push(bearings.length);
      if (bearings.length === 4)
        return {
          ok: false,
          reason: 'invalid_observation',
          field: 'azimuthRad',
          id: sightingIdOf(2),
        };
      return real(bearings);
    });
    expect(calls).toEqual([4, 3]);
    expect(causeOf(a, 2)).toBe('invalid_observation');
    expect(a.used).toHaveLength(3);
    expect(a.fix?.ok).toBe(true);
  });

  it('repeats for each candidate named, and ends with no Fix when fewer than two are left', () => {
    let call = 0;
    const order = [1, 2, 3];
    const a = run((bearings) => {
      const id = sightingIdOf(order[call] ?? 4);
      call += 1;
      return {
        ok: false,
        reason: 'invalid_observation',
        id: bearings.find((b) => b.id === id)?.id ?? bearings[0]?.id,
      };
    });
    expect(call).toBe(3);
    expect(a.used).toHaveLength(1);
    expect(a.fix).toBeNull();
    expect(a.setAside.filter((s) => s.cause === 'invalid_observation')).toHaveLength(3);
  });

  it('keeps every candidate used, with the failure as the Fix, when it names an id that is not a candidate', () => {
    const a = run(() => ({ ok: false, reason: 'invalid_observation', id: 'not-a-candidate' }));
    expect(a.used).toHaveLength(4);
    expect(a.setAside).toEqual([]);
    expect(a.fix).toEqual({ ok: false, reason: 'invalid_observation', id: 'not-a-candidate' });
  });

  it('keeps every candidate used, with the failure as the Fix, for any other failure', () => {
    const a = run(() => ({ ok: false, reason: 'not_converged' }));
    expect(a.used).toHaveLength(4);
    expect(a.fix).toEqual({ ok: false, reason: 'not_converged' });
  });

  it('is given the same Bearings as the real solve: the candidates in the order of the display', () => {
    let seen: readonly Bearing[] = [];
    run((bearings) => {
      seen = bearings;
      return real(bearings);
    });
    expect(seen.map((b) => b.id)).toEqual(
      [...four().entries]
        .sort(
          (x, y) =>
            x.sighting.bearing.timeUtcMs - y.sighting.bearing.timeUtcMs ||
            (x.sighting.sightingId < y.sighting.sightingId ? -1 : 1),
        )
        .map((e) => e.sighting.sightingId),
    );
  });
});

describe('assess: the counterexample of P-5.10 (seed 562879761), kept as an example', () => {
  it('solves for the used plus the outliers: Core\u2019s residuals name the used, excludedIds the outliers', () => {
    // Shrunk: four Sightings, two of them from one place along one line, one of them set aside.
    const at = (latRad: number, lonRad: number, azimuthRad: number, n: number) =>
      entryOfBearing(n, {
        id: sightingIdOf(n),
        observer: { latRad, lonRad },
        positionAccuracyM: 8,
        timeUtcMs: 1_789_985_600_500,
        azimuthRad,
        azimuthSigmaRad: 0.008726646259971648,
      });
    const incident = incidentOfEntries(
      [
        at(0.5235988628647618, -0.6981317880641942, 3.1416013802360534, 1),
        at(0.5235988628647618, -0.6981317880641942, 3.1416013802360534, 2),
        at(0.5236016553915648, -0.698131613531269, 3.187503539563504, 3),
        at(0.5252848509221881, -0.699896665003811, 2.819081987760021, 4),
      ],
      1_789_985_600_000,
    );
    const a = assessed(incident, 1_790_000_000_000);
    const fix = a.fix?.ok ? a.fix.value : null;
    expect(fix).not.toBeNull();
    const outliers = a.setAside
      .filter((s) => s.cause === 'outlier')
      .map((s) => s.entry.sighting.sightingId);
    expect(outliers.length).toBeGreaterThan(0);
    expect([...(fix?.excludedIds ?? [])].sort()).toEqual([...outliers].sort());
    expect((fix?.residuals ?? []).map((r) => r.id).sort()).toEqual(
      a.used.map((e) => e.sighting.sightingId).sort(),
    );
  });
});

describe('assess: the counterexample of P-2.6 (seed 318132001), kept as an example', () => {
  it('keeps the partition for an Incident that holds one Sighting id twice (no reducer state does, assess takes any)', () => {
    const t = NOW_UTC_MS - 60_000;
    const hidden = entry(1, 'west', t, true);
    const shown = { ...hidden, hidden: false };
    const a = assessed(created([hidden, shown, entry(2, 'east', t)]));
    expect(a.used.length + a.setAside.length).toBe(3);
    expect(a.setAside.map((s) => s.cause)).toEqual(['hidden_by_user']);
    expect(a.setAside[0]?.entry).toBe(hidden);
  });
});

describe('assess: what it refuses', () => {
  it('fails with invalid_number naming nowUtcMs for a time that is not finite', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(assess(postsIncident(['west', 'east']), bad, PARAMETERS)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'nowUtcMs',
      });
    }
  });

  it('names the parameter that is not valid', () => {
    expect(
      assess(postsIncident(['west', 'east']), NOW_UTC_MS, {
        ...PARAMETERS,
        plausibleRangeM: Number.NaN,
      }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'plausibleRangeM',
    });
  });

  it('takes the thresholds from Core and the ages from the parameters', () => {
    const t = NOW_UTC_MS - 60_000;
    const incident = created(
      [entry(1, 'west', t), entry(2, 'east', t - 10 * 60_000)],
      NOW_UTC_MS - 5_000_000,
    );
    expect(
      assess(incident, NOW_UTC_MS, {
        ...PARAMETERS,
        maxIncidentAgeMs: 5 * 60_000,
        incidentRetentionMs: 6 * 60_000,
      }),
    ).toMatchObject({
      ok: true,
      value: { setAside: [{ cause: 'sighting_too_old' }] },
    });
  });
});
