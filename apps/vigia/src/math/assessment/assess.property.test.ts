// P-5.10 to P-5.13 (Req 5.10 to 5.13, design §11): the partition of the Sightings, the independence
// of the order, the agreement with Core's outlier rule, and the argument that three Sightings
// cannot name the one that is off.

import {
  BearingModel,
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  solve,
  type Bearing,
} from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns, isDeepRun } from '../../test-support/fast-check-setup';
import { entryOfBearing, incidentOfEntries } from '../../test-support/geometry-fixtures';
import {
  closed,
  consistentBearings,
  largestCrossingRad,
  sightingSet,
  uniformInteger,
} from '../../test-support/generators';
import { deepSame } from '../../test-support/deep-same';
import { NOW_UTC_MS, PARAMETERS, sightingIdOf } from '../../test-support/incident-fixtures';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import type { Incident } from '../incident/incident-state';
import { assess, type Assessment, type SetAsideCause } from './assess';

const DEG = Math.PI / 180;
const MAX_AGE = PARAMETERS.maxIncidentAgeMs;
const SKEW = PARAMETERS.clockSkewToleranceMs;

function assessed(incident: Incident, now = NOW_UTC_MS): Assessment {
  const result = assess(incident, now, PARAMETERS);
  if (!result.ok) throw new Error(`assess failed: ${result.reason} ${result.field ?? ''}`);
  return result.value;
}

/** The causes the assessment gave, by Sighting id: `used` for the used ones. */
function causes(a: Assessment): Map<string, SetAsideCause | 'used'> {
  const map = new Map<string, SetAsideCause | 'used'>();
  for (const e of a.used) map.set(e.sighting.sightingId, 'used');
  for (const s of a.setAside) map.set(s.entry.sighting.sightingId, s.cause);
  return map;
}

/**
 * The reference of the order of design §7.6, written plainly and apart from `assess`: hidden,
 * then implausible, then too old, then Core's own outlier rule. Returns the cause of each id.
 */
function reference(incident: Incident, now: number): Map<string, SetAsideCause | 'used'> {
  const result = new Map<string, SetAsideCause | 'used'>();
  const live = [];
  for (const e of incident.entries) {
    if (e.hidden) result.set(e.sighting.sightingId, 'hidden_by_user');
    else live.push(e);
  }
  const plausible = [];
  for (const e of live) {
    const t = e.sighting.bearing.timeUtcMs;
    if (t > now + SKEW || t < incident.createdUtcMs - MAX_AGE) {
      result.set(e.sighting.sightingId, 'sighting_time_implausible');
    } else plausible.push(e);
  }
  const newest = Math.max(...plausible.map((e) => e.sighting.bearing.timeUtcMs));
  const referenceTime = plausible.length >= 2 ? newest : now;
  const candidates = [];
  for (const e of plausible) {
    if (e.sighting.bearing.timeUtcMs < referenceTime - MAX_AGE) {
      result.set(e.sighting.sightingId, 'sighting_too_old');
    } else candidates.push(e);
  }
  let excluded: readonly string[] = [];
  if (candidates.length >= 2) {
    const fix = solve(
      new BearingModel(),
      candidates.map((e) => e.sighting.bearing),
      { outlierRejection: true },
    );
    if (fix.ok) excluded = fix.value.excludedIds;
  }
  for (const e of candidates) {
    result.set(
      e.sighting.sightingId,
      excluded.includes(e.sighting.sightingId) ? 'outlier' : 'used',
    );
  }
  return result;
}

describe('P-5.10: the used and the set-aside Sightings partition the set (Req 5.1, 5.2, 5.3, 5.10)', () => {
  // Generator: `sightingSet` (2 to 12 Sightings from observers within 20 km of the origin, ages
  // from 4 hours back to 10 minutes ahead, one in six hidden, errors up to 30° and a random
  // azimuth one in twelve). Excludes sets of fewer than 2 or more than 12 Sightings.
  it('gives each Sighting exactly one cause, the one of the reference, and solves for the used plus the outliers', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.10',
      fc.property(sightingSet(), ({ incident, nowUtcMs }) => {
        const a = assessed(incident, nowUtcMs);
        const got = causes(a);
        // Partition: every Sighting is in exactly one of the two lists.
        const listed = [
          ...a.used.map((e) => e.sighting.sightingId),
          ...a.setAside.map((s) => s.entry.sighting.sightingId),
        ];
        if (listed.length !== incident.entries.length || new Set(listed).size !== listed.length) {
          throw new Error('not a partition');
        }
        for (const e of incident.entries) {
          if (!got.has(e.sighting.sightingId)) throw new Error('a Sighting is in neither list');
        }
        // One cause each, the reference's.
        const want = reference(incident, nowUtcMs);
        for (const [id, cause] of want) {
          if (got.get(id) !== cause)
            throw new Error(`${id}: ${got.get(id)}, the reference says ${cause}`);
        }
        // What was given to solve: the residuals name the used plus the outliers.
        if (a.fix?.ok) {
          // Core's residuals are those of the Bearings that remain; the excluded ones are in excludedIds.
          const given = [
            ...a.fix.value.residuals.map((r) => r.id),
            ...a.fix.value.excludedIds,
          ].sort();
          const expected = [...got]
            .filter(([, cause]) => cause === 'used' || cause === 'outlier')
            .map(([id]) => id)
            .sort();
          if (JSON.stringify(given) !== JSON.stringify(expected))
            throw new Error('solve was given another set');
        }
        tracker.record('used', a.used.length, '12');
      }),
      tracker,
      { numRuns: cappedRuns(5000) },
    );
  });
});

describe('P-5.11: the Fix depends on the set and not on the order (Req 5.11)', () => {
  // Generator: `sightingSet` and a permutation of its entries drawn as 12 uniform keys (the
  // entries sorted by their key). Excludes nothing else.
  it('gives the same used Sightings, causes and a deeply equal Fix for any permutation', () => {
    checkProperty(
      'P-5.11',
      fc.property(
        sightingSet(),
        fc.array(closed(0, 1), { minLength: 12, maxLength: 12 }),
        ({ incident, nowUtcMs }, keys) => {
          const order = incident.entries
            .map((_, i) => i)
            .sort((x, y) => (keys[x] ?? 0) - (keys[y] ?? 0));
          const permuted: Incident = {
            ...incident,
            entries: order.map((i) => incident.entries[i] as Incident['entries'][number]),
          };
          const a = assessed(incident, nowUtcMs);
          const b = assessed(permuted, nowUtcMs);
          const ids = (x: Assessment) => x.used.map((e) => e.sighting.sightingId);
          if (JSON.stringify(ids(a)) !== JSON.stringify(ids(b)))
            throw new Error('another used set or order');
          if (JSON.stringify([...causes(a)].sort()) !== JSON.stringify([...causes(b)].sort()))
            throw new Error('other causes');
          if (!deepSame(a.fix, b.fix)) throw new Error('another Fix');
          if (a.checkLevel !== b.checkLevel || a.disagreement !== b.disagreement)
            throw new Error('other level');
        },
      ),
      new ErrorTracker(),
      { numRuns: cappedRuns(5000) },
    );
  });
});

describe('P-5.12: the Sighting that Core sets aside is shown as an outlier, and the Fix is Core\u2019s (Req 5.12)', () => {
  // Generator: `consistentBearings(4 to 12)` (observers 500 m to 15 km from one target, sigmas
  // 0.5° to 3°), sets whose largest crossing angle is under 30° discarded and counted, plus one
  // Bearing from another observer 500 m to 15 km from the target whose azimuth is wrong by
  // between 10 sigma and 90°, on either side. When Core succeeds: the app's outliers are Core's
  // excluded ids and its Fix is exactly the Fix Core returned for the call (a cold-started solve of
  // the remaining Bearings is a counter, with no bound). When Core fails: the app shows Core's
  // failure, keeps every Sighting used and sets none aside. Counters (reported, not failing): the
  // wrong one excluded, a good one excluded, none excluded, and Core failed, by reason.
  const counters = {
    cases: 0,
    wrongExcluded: 0,
    goodExcluded: 0,
    noneExcluded: 0,
    failed: new Map<string, number>(),
    /** The distance in millimetres between the shown Fix and a cold-started solve of the rest. */
    coldMm: [] as number[],
  };
  it('shows as outlier exactly what Core excludes, and the Fix Core returned, or Core\u2019s failure', () => {
    const tracker = new ErrorTracker();
    const wrong = fc.tuple(
      closed(0, 2 * Math.PI),
      closed(500, 15_000),
      closed(0.5, 3),
      closed(0, 1),
      fc.boolean(),
    );
    checkProperty(
      'P-5.12',
      fc.property(
        uniformInteger(4, 12).chain((n) => fc.tuple(consistentBearings(n), wrong)),
        ([set, [az, range, sigmaDeg, fraction, negative]]) => {
          fc.pre(largestCrossingRad(set.bearings) >= 30 * DEG);
          const sigmaRad = sigmaDeg * DEG;
          const from = destinationPosition(set.target, az, range);
          if (!from.ok) throw new Error('destination');
          const pointing = initialAzimuthRad(from.value, set.target);
          if (!pointing.ok) throw new Error('azimuth');
          // The error lies between 10 sigma and 90 degrees.
          const errorRad =
            (10 * sigmaRad + fraction * (90 * DEG - 10 * sigmaRad)) * (negative ? -1 : 1);
          const wrongBearing: Bearing = {
            id: sightingIdOf(set.bearings.length + 1),
            observer: from.value,
            positionAccuracyM: 8,
            timeUtcMs: NOW_UTC_MS - 60_000,
            azimuthRad:
              (((pointing.value + errorRad) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
            azimuthSigmaRad: sigmaRad,
          };
          const all = [...set.bearings, wrongBearing];
          const incident = incidentOfEntries(all.map((b, i) => entryOfBearing(i + 1, b)));
          const a = assessed(incident);
          const canonical = incident.entries.map((e) => e.sighting.bearing);
          const core = solve(new BearingModel(), canonical, { outlierRejection: true });
          counters.cases += 1;
          const outliers = a.setAside
            .filter((s) => s.cause === 'outlier')
            .map((s) => s.entry.sighting.sightingId)
            .sort();
          if (!core.ok) {
            counters.failed.set(core.reason, (counters.failed.get(core.reason) ?? 0) + 1);
            if (JSON.stringify(a.fix) !== JSON.stringify(core))
              throw new Error('the app shows another failure');
            if (a.setAside.length !== 0 || a.used.length !== all.length)
              throw new Error('a Sighting moved on a failure');
            return;
          }
          if (JSON.stringify(outliers) !== JSON.stringify([...core.value.excludedIds].sort())) {
            throw new Error(`outliers ${outliers} against Core's ${core.value.excludedIds}`);
          }
          // The Fix shown is exactly the Fix Core returned for the call (design §11, P-5.12).
          if (!a.fix?.ok || JSON.stringify(a.fix.value) !== JSON.stringify(core.value)) {
            throw new Error('the Fix shown is not the Fix Core returned');
          }
          // Counter, with no bound: how far a cold-started solve of the remaining Bearings lies from
          // it. The two are runs of Core's own solver from different starting points, so the
          // difference measures Core's repeatability and not the app.
          const remaining = canonical.filter((b) => !core.value.excludedIds.includes(b.id));
          const cold = solve(new BearingModel(), remaining);
          if (cold.ok) {
            const apart = greatCircleDistanceM(core.value.position, cold.value.position);
            if (apart.ok) counters.coldMm.push(apart.value * 1000);
          }
          const wrongId = wrongBearing.id;
          if (core.value.excludedIds.includes(wrongId)) counters.wrongExcluded += 1;
          if (core.value.excludedIds.some((id) => id !== wrongId)) counters.goodExcluded += 1;
          if (core.value.excludedIds.length === 0) counters.noneExcluded += 1;
        },
      ),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
    if (isDeepRun()) {
      const share = (k: number) =>
        `${k} (${((100 * k) / Math.max(1, counters.cases)).toFixed(1)} %)`;
      const failed = [...counters.failed].map(([reason, k]) => `${reason} ${share(k)}`).join(', ');
      const sorted = [...counters.coldMm].sort((x, y) => x - y);
      const at = (f: number) => (sorted[Math.floor(f * (sorted.length - 1))] ?? 0).toFixed(4);
      console.log(
        `[deep] P-5.12 cold-started solve of the remaining Bearings against the shown Fix, in mm over ${sorted.length} cases: ` +
          `median ${at(0.5)}, 99th percentile ${at(0.99)}, worst ${at(1)}`,
      );
      console.log(
        `[deep] P-5.12 counters over ${counters.cases} cases: wrong excluded ${share(counters.wrongExcluded)}, ` +
          `a good one excluded ${share(counters.goodExcluded)}, none excluded ${share(counters.noneExcluded)}, ` +
          `Core failed: ${failed === '' ? 'never' : failed}`,
      );
    }
  });
});

/** The bands of the error of Req 5.13, in degrees. */
const BANDS: readonly (readonly [number, number])[] = [
  [3, 6],
  [6, 12],
  [12, 30],
  [30, 90],
];

/** The seed of the statistical test P-5.13: an argument, so that the run is deterministic. */
const P_5_13_SEED = 20_261_119;

describe('P-5.13: three Sightings cannot tell which one is off (Req 5.5, 5.13)', () => {
  // Generator: `consistentBearings(3, [0.5°, 1°])` (one target within 20 km of the origin,
  // observers 500 m to 15 km from it, no condition on the crossing angles), one of the three
  // drawn uniformly as the carrier of a gross error, the band of the error drawn uniformly among
  // 3°–6°, 6°–12°, 12°–30° and 30°–90° and the error uniform within it, either sign. A statistical
  // test with its seed passed as an argument, at least 2 000 cases. In every case: no Sighting
  // is named and there is no second Fix. In the cases where `solve` succeeds: the Bearing with the
  // largest |normalised residual| is the carrier in at most 50 % of them; the share is reported
  // by band, and the failures of `solve` by reason. A share above 50 % stops the work.
  it('names no Sighting, and the largest residual marks the wrong one in at most half the cases', () => {
    const marked = BANDS.map(() => 0);
    const solved = BANDS.map(() => 0);
    const failed = new Map<string, number>();
    checkProperty(
      'P-5.13',
      fc.property(
        consistentBearings(3, [0.5, 1]),
        uniformInteger(0, 2),
        uniformInteger(0, BANDS.length - 1),
        closed(0, 1),
        fc.boolean(),
        (set, carrier, band, fraction, negative) => {
          const [lowDeg, highDeg] = BANDS[band] ?? [3, 6];
          const errorRad = (lowDeg + fraction * (highDeg - lowDeg)) * DEG * (negative ? -1 : 1);
          const bearings = set.bearings.map((b, i) =>
            i === carrier
              ? {
                  ...b,
                  azimuthRad:
                    (((b.azimuthRad + errorRad) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
                }
              : b,
          );
          const incident = incidentOfEntries(bearings.map((b, i) => entryOfBearing(i + 1, b)));
          const a = assessed(incident);
          // In every case: no Sighting named, no second Fix.
          if (a.setAside.length !== 0 || a.used.length !== 3)
            throw new Error('a Sighting was named');
          if (
            JSON.stringify(Object.keys(a).sort()) !==
            JSON.stringify(['checkLevel', 'disagreement', 'fix', 'setAside', 'used'])
          ) {
            throw new Error('an extra field: a second Fix?');
          }
          if (a.fix === null) throw new Error('no solve with three used');
          if (!a.fix.ok) {
            failed.set(a.fix.reason, (failed.get(a.fix.reason) ?? 0) + 1);
            return;
          }
          solved[band] = (solved[band] ?? 0) + 1;
          let worst = a.fix.value.residuals[0];
          for (const r of a.fix.value.residuals) {
            if (
              worst === undefined ||
              Math.abs(r.normalisedResidual) > Math.abs(worst.normalisedResidual)
            )
              worst = r;
          }
          if (worst?.id === sightingIdOf(carrier + 1)) marked[band] = (marked[band] ?? 0) + 1;
        },
      ),
      new ErrorTracker(),
      { seed: P_5_13_SEED, numRuns: Math.max(2000, cappedRuns(10_000)) },
    );
    const totalMarked = marked.reduce((x, y) => x + y, 0);
    const totalSolved = solved.reduce((x, y) => x + y, 0);
    const share = totalMarked / Math.max(1, totalSolved);
    const lines = BANDS.map(
      ([lo, hi], i) =>
        `${lo}°–${hi}°: ${marked[i]} of ${solved[i]} (${((100 * (marked[i] ?? 0)) / Math.max(1, solved[i] ?? 0)).toFixed(1)} %)`,
    );
    const failures = [...failed].map(([reason, k]) => `${reason} ${k}`).join(', ');
    console.log(
      `[stat] P-5.13 seed ${P_5_13_SEED}: the largest residual marks the wrong Bearing in ${totalMarked} of ${totalSolved} ` +
        `(${(100 * share).toFixed(1)} %); by band ${lines.join('; ')}; solve failed: ${failures === '' ? 'never' : failures}`,
    );
    expect(totalSolved).toBeGreaterThanOrEqual(1000);
    expect(share).toBeLessThanOrEqual(0.5);
  });
});
