// The assessment: one pure function from an Incident to the used Sightings, the cause of each
// Sighting set aside, and Core's Fix (Req 5, 6.1, 6.6, design D8, §7.6).
//
// A Sighting has exactly one cause, by the fixed order: hidden, implausible time, too old, then
// Core's outlier rule. The app sets a Sighting aside as `outlier` only from `Fix.excludedIds` and
// implements no rejection rule of its own (Req 5.3). With three used Sightings it names no
// Sighting as the one that is off and computes no second Fix (Req 5.5): `disagreement` is a flag,
// raised on Core's Studentised residual (with three, all three have the same size, Core Req 10.9).
// The threshold of the flag is Core's `OUTLIER_STUDENTISED_RESIDUAL`, not a copy.

import {
  BearingModel,
  OUTLIER_STUDENTISED_RESIDUAL,
  solve,
  type Bearing,
  type Fix,
  type Result,
} from '@alidade/core';
import { err, ok, type VigiaResult } from '../../result';
import { compareIds, type Incident, type SightingEntry } from '../incident/incident-state';
import { checkParameters, type VigiaParameters } from '../parameters';

export type SetAsideCause =
  | 'hidden_by_user'
  | 'sighting_time_implausible'
  | 'sighting_too_old'
  | 'outlier'
  | 'invalid_observation';

export interface SetAsideEntry {
  readonly entry: SightingEntry;
  readonly cause: SetAsideCause;
}

export type CheckLevel = 'none' | 'one' | 'two' | 'three' | 'four_or_more';
export type Disagreement = 'none' | 'three_disagree' | 'diverging';

export interface Assessment {
  /** Ordered by (Bearing time, Sighting id). */
  readonly used: readonly SightingEntry[];
  /** In the same order. */
  readonly setAside: readonly SetAsideEntry[];
  /** `null` with fewer than two candidates; Core's failure when the solve failed. */
  readonly fix: VigiaResult<Fix> | null;
  readonly checkLevel: CheckLevel;
  readonly disagreement: Disagreement;
}

/** The solve the assessment calls: `solve` of Core with the bearing model and outlier rejection. */
export type SolveFn = (bearings: readonly Bearing[]) => Result<Fix>;

const coreSolve: SolveFn = (bearings) =>
  solve(new BearingModel(), bearings, { outlierRejection: true });

function checkLevelOf(usedCount: number): CheckLevel {
  if (usedCount === 0) return 'none';
  if (usedCount === 1) return 'one';
  if (usedCount === 2) return 'two';
  if (usedCount === 3) return 'three';
  return 'four_or_more';
}

/** The display order: by Bearing time, then by Sighting id. `solve` canonicalises by id itself. */
function byTimeThenId(a: SightingEntry, b: SightingEntry): number {
  return (
    a.sighting.bearing.timeUtcMs - b.sighting.bearing.timeUtcMs ||
    compareIds(a.sighting.sightingId, b.sighting.sightingId)
  );
}

/**
 * `assess` with the solve given, so that the `invalid_observation` loop can be tested with a fake
 * (the model is Core's: a real Bearing of this app never makes it fire). Everything else is
 * `assess`.
 */
export function assessWith(
  incident: Incident,
  nowUtcMs: number,
  parameters: VigiaParameters,
  solveFn: SolveFn,
): VigiaResult<Assessment> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });

  const ordered = [...incident.entries].sort(byTimeThenId);
  // The cause of each entry, keyed by the entry and not by its id, so that every entry has exactly
  // one cause even in an Incident that holds one Sighting id twice (no reducer state does).
  const cause = new Map<SightingEntry, SetAsideCause>();
  const timeOf = (e: SightingEntry) => e.sighting.bearing.timeUtcMs;
  const idOf = (e: SightingEntry) => e.sighting.sightingId;

  // 2. Hidden.
  let candidates = ordered.filter((e) => {
    if (e.hidden) cause.set(e, 'hidden_by_user');
    return !e.hidden;
  });
  // 3. Implausible time: later than now plus the skew, or earlier than the creation of the
  // Incident by more than the maximum age.
  candidates = candidates.filter((e) => {
    const implausible =
      timeOf(e) > nowUtcMs + parameters.clockSkewToleranceMs ||
      timeOf(e) < incident.createdUtcMs - parameters.maxIncidentAgeMs;
    if (implausible) cause.set(e, 'sighting_time_implausible');
    return !implausible;
  });
  // 4. Too old: against the newest candidate when there are two or more, against now when there
  // is one (with two or more the newest is never too old).
  const referenceUtcMs = candidates.length >= 2 ? Math.max(...candidates.map(timeOf)) : nowUtcMs;
  candidates = candidates.filter((e) => {
    const old = timeOf(e) < referenceUtcMs - parameters.maxIncidentAgeMs;
    if (old) cause.set(e, 'sighting_too_old');
    return !old;
  });

  // 5. Solve. A failure that names a candidate as invalid sets that candidate aside and solves
  // again, at most once for each candidate. Any other failure keeps every candidate used.
  let fix: VigiaResult<Fix> | null = null;
  const attempts = candidates.length;
  for (let attempt = 0; attempt < attempts && candidates.length >= 2; attempt += 1) {
    const result = solveFn(candidates.map((e) => e.sighting.bearing));
    if (result.ok) {
      fix = result;
      for (const e of candidates) {
        if (result.value.excludedIds.includes(idOf(e))) cause.set(e, 'outlier');
      }
      candidates = candidates.filter((e) => !result.value.excludedIds.includes(idOf(e)));
      break;
    }
    const named = result.reason === 'invalid_observation' ? result.id : undefined;
    if (named !== undefined && candidates.some((e) => idOf(e) === named)) {
      for (const e of candidates) {
        if (idOf(e) === named) cause.set(e, 'invalid_observation');
      }
      candidates = candidates.filter((e) => idOf(e) !== named);
      continue;
    }
    fix = result;
    break;
  }

  const used = candidates;
  const setAside: SetAsideEntry[] = [];
  for (const e of ordered) {
    const c = cause.get(e);
    if (c !== undefined) setAside.push({ entry: e, cause: c });
  }

  // 7. The flag of disagreement: it names no Sighting and computes no second Fix.
  let disagreement: Disagreement = 'none';
  if (used.length === 3 && fix?.ok) {
    const usedIds = new Set(used.map(idOf));
    const largest = Math.max(
      ...fix.value.residuals
        .filter((r) => usedIds.has(r.id))
        .map((r) => Math.abs(r.studentisedResidual)),
    );
    if (largest > OUTLIER_STUDENTISED_RESIDUAL) disagreement = 'three_disagree';
  } else if (used.length >= 3 && fix !== null && !fix.ok && fix.reason === 'diverging_bearings') {
    disagreement = 'diverging';
  }

  return ok({ used, setAside, fix, checkLevel: checkLevelOf(used.length), disagreement });
}

/** The assessment of `incident` at `nowUtcMs` (design §7.6). Fails with `invalid_number` naming `nowUtcMs` or a parameter. */
export function assess(
  incident: Incident,
  nowUtcMs: number,
  parameters: VigiaParameters,
): VigiaResult<Assessment> {
  return assessWith(incident, nowUtcMs, parameters, coreSolve);
}
