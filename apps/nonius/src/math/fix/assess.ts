// The assessment (Req 6, 7, 8; design D12, §5, §7.5): from the Sights and the Calibration in use to
// what the app can say: nothing, a circle, a failure, Two places, or a Shown Fix with its choice
// and checks. A fixed ladder: Sun side, then fit, then Two places. One pure function.

import {
  greatCircleDistanceM,
  initialAzimuthRad,
  OUTLIER_STUDENTISED_RESIDUAL,
  type Fix,
  type Position,
} from '@alidade/core';
import { err, ok, type NoniusFailure, type NoniusResult } from '../../result';
import { DEG_TO_RAD } from '../degrees';
import { checkParameters, type NoniusParameters } from '../parameters';
import { calibrationInUse, type CalibrationInUse, type IndexError } from '../sight/index-error';
import { prepareSights, type PreparedSight, type SetAside } from '../sight/prepare';
import type { Sight } from '../sight/sight';
import { candidates } from './candidates';
import { checkSolve, placeFix, type ShownFix } from './solve-candidate';
import { contradicts, type SunSideCheck } from './sun-side-check';

/**
 * Below this Sun's declination at every used Sight, the Sun alone cannot tell a northern latitude
 * from the southern one (Req 6.7): 2°. Unit: rad. Basis: the requirement's own figure.
 */
const EQUINOX_DECLINATION_RAD = 2 * DEG_TO_RAD;

/** The user's choice of place, held in memory for the used set it was made on (design D13). */
export interface UserChoice {
  readonly usedIdsKey: string;
  readonly placeIndex: 0 | 1;
}

export interface Place {
  readonly label: 'A' | 'B';
  readonly fix: ShownFix;
  readonly check: Fix;
}

export type Choice =
  | { readonly kind: 'single' }
  | {
      readonly kind: 'sun_side';
      readonly sightId: string;
      readonly measuredTrueAzimuthRad: number;
      readonly otherAzimuthRad: number;
      readonly otherDistanceM: number;
    }
  | {
      readonly kind: 'fit';
      readonly worstMissRad: number;
      readonly compassDisagreedWithBoth: boolean;
    }
  | { readonly kind: 'other_failed'; readonly compassDisagrees: boolean }
  | {
      readonly kind: 'user';
      readonly label: 'A' | 'B';
      readonly otherDistanceM: number;
      readonly otherAzimuthRad: number;
    };

export type TwoPlacesWhy = 'two_sights' | 'no_sun_side' | 'sun_side_undecided' | 'equinox';

export type Assessment =
  | {
      readonly kind: 'empty';
      readonly calibration: CalibrationInUse;
      readonly setAside: readonly SetAside[];
    }
  | {
      readonly kind: 'one';
      readonly calibration: CalibrationInUse;
      readonly sight: PreparedSight;
      readonly setAside: readonly SetAside[];
    }
  | {
      readonly kind: 'failed';
      readonly calibration: CalibrationInUse;
      readonly failure: NoniusFailure;
      readonly used: readonly PreparedSight[];
      readonly setAside: readonly SetAside[];
    }
  | {
      readonly kind: 'two_places';
      readonly calibration: CalibrationInUse;
      readonly places: readonly [Place, Place];
      readonly distanceM: number;
      readonly why: readonly TwoPlacesWhy[];
      readonly usedIdsKey: string;
      readonly used: readonly PreparedSight[];
      readonly setAside: readonly SetAside[];
    }
  | {
      readonly kind: 'fix';
      readonly calibration: CalibrationInUse;
      readonly fix: ShownFix;
      readonly check: Fix;
      readonly choice: Choice;
      readonly disagreement: boolean;
      readonly usedIdsKey: string;
      readonly used: readonly PreparedSight[];
      readonly setAside: readonly SetAside[];
    };

interface Checked {
  readonly position: Position;
  readonly check: Fix;
  readonly cost: number;
}

function distanceM(a: Position, b: Position): number | null {
  const d = greatCircleDistanceM(a, b);
  return d.ok ? d.value : null;
}

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function costOf(check: Fix): number {
  return check.residuals.reduce((sum, r) => sum + r.normalisedResidual * r.normalisedResidual, 0);
}

function indexErrorFailure(indexError: IndexError | null): NoniusFailure | null {
  if (indexError === null) return null;
  const numbers: readonly [string, number][] = [
    ['valueRad', indexError.valueRad],
    ['sigmaRad', indexError.sigmaRad],
    ['sightCount', indexError.sightCount],
    ['measuredUtcMs', indexError.measuredUtcMs],
  ];
  for (const [field, value] of numbers) {
    if (!Number.isFinite(value)) return err('invalid_number', { field });
  }
  return indexError.sigmaRad < 0 ? err('invalid_number', { field: 'sigmaRad' }) : null;
}

/**
 * The assessment. Fails (as a `NoniusResult`) only for bad parameters, a bad Index error, or a
 * Sight whose numbers cannot be used; every other outcome, including the failures of the solve,
 * is an `Assessment` (`failed` carries the reason). The Sights are taken in the order of their
 * ids, so that the order they are given in changes nothing (Req 6.10).
 *
 * ```
 * 0 used: empty;  1 used: one
 * candidates fail: failed;  check solve of each Candidate (failed ones dropped); none: failed
 * two Fixes within SAME_FIX_DISTANCE_M: the lower Cost, choice single
 * one Fix: choice other_failed
 * two Fixes: exactly one contradicted by the Sun side: sun_side
 *            else three or more used and Costs differ by CROSSING_COST_MARGIN: fit
 *            else the user's choice for this used set: user
 *            else Two places
 * ```
 */
export function assess(
  sights: readonly Sight[],
  indexError: IndexError | null,
  userChoice: UserChoice | null,
  params: NoniusParameters,
): NoniusResult<Assessment> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const badIndexError = indexErrorFailure(indexError);
  if (badIndexError !== null) return badIndexError;
  const calibration = calibrationInUse(indexError);
  const ordered = [...sights].sort(byId);
  const preparedResult = prepareSights(ordered, calibration, params);
  if (!preparedResult.ok) return preparedResult;
  const { prepared, setAside } = preparedResult.value;
  if (prepared.length === 0) return ok({ kind: 'empty', calibration, setAside });
  const first = prepared[0];
  if (prepared.length === 1 && first !== undefined) {
    return ok({ kind: 'one', calibration, sight: first, setAside });
  }
  const usedIdsKey = prepared.map((p) => p.sight.id).join('\n');
  const failed = (failure: NoniusFailure): NoniusResult<Assessment> =>
    ok({ kind: 'failed', calibration, failure, used: prepared, setAside });

  const crossings = candidates(prepared, params);
  if (!crossings.ok) return failed(crossings);
  const results: Checked[] = [];
  let firstFailure: NoniusFailure | null = null;
  for (const position of crossings.value.places) {
    const check = checkSolve(prepared, position, params);
    if (!check.ok) {
      firstFailure ??= check;
      continue;
    }
    results.push({ position: check.value.position, check: check.value, cost: costOf(check.value) });
  }
  if (results.length === 0) return failed(firstFailure ?? err('circles_do_not_meet'));

  let kept: Checked[] = results;
  let single = false;
  if (results.length === 2) {
    const [a, b] = results as [Checked, Checked];
    const apart = distanceM(a.position, b.position);
    if (apart !== null && apart < params.sameFixDistanceM) {
      kept = [b.cost < a.cost ? b : a];
      single = true;
    }
  }
  // Places in latitude, then longitude order: A and B.
  kept = [...kept].sort(
    (p, q) => p.position.latRad - q.position.latRad || p.position.lonRad - q.position.lonRad,
  );

  const sunSide = (c: Checked): SunSideCheck | null => {
    const r = contradicts(c.position, prepared, params);
    return r.ok ? r.value : null;
  };

  /** The Shown Fix of one Checked place, as an Assessment of kind `fix` with its choice. */
  const shown = (chosen: Checked, choice: Choice): NoniusResult<Assessment> => {
    const fix = placeFix(prepared, chosen.check, params);
    if (!fix.ok) return failed(fix);
    const excluded = new Set(chosen.check.excludedIds);
    const used = prepared.filter((p) => !excluded.has(p.sight.id));
    const outliers: SetAside[] = ordered
      .filter((s) => excluded.has(s.id))
      .map((sight) => ({ sight, cause: 'outlier' as const }));
    const disagreement =
      prepared.length === 3 &&
      chosen.check.residuals.some(
        (r) => Math.abs(r.studentisedResidual) > OUTLIER_STUDENTISED_RESIDUAL,
      );
    return ok({
      kind: 'fix',
      calibration,
      fix: fix.value,
      check: chosen.check,
      choice,
      disagreement,
      usedIdsKey,
      used,
      setAside: [...setAside, ...outliers],
    });
  };

  const [onlyOrFirst, second] = kept;
  if (onlyOrFirst === undefined) return failed(err('circles_do_not_meet'));
  if (second === undefined) {
    if (single) return shown(onlyOrFirst, { kind: 'single' });
    const side = sunSide(onlyOrFirst);
    return shown(onlyOrFirst, {
      kind: 'other_failed',
      compassDisagrees: side !== null && side.contradictedBy !== null,
    });
  }

  const [a, b] = [onlyOrFirst, second];
  const sideA = sunSide(a);
  const sideB = sunSide(b);
  const contradictedA = sideA !== null && sideA.contradictedBy !== null;
  const contradictedB = sideB !== null && sideB.contradictedBy !== null;
  const apart = distanceM(a.position, b.position) ?? 0;

  if (contradictedA !== contradictedB) {
    const [chosen, other, otherSide] = contradictedA ? [b, a, sideA] : [a, b, sideB];
    return shown(chosen, {
      kind: 'sun_side',
      sightId: otherSide?.contradictedBy ?? '',
      measuredTrueAzimuthRad: otherSide?.measuredTrueAzimuthRad ?? 0,
      otherAzimuthRad: otherSide?.computedAzimuthRad ?? 0,
      otherDistanceM: distanceM(chosen.position, other.position) ?? apart,
    });
  }
  if (prepared.length >= 3 && Math.abs(a.cost - b.cost) >= params.crossingCostMargin) {
    const [chosen, other] = a.cost < b.cost ? [a, b] : [b, a];
    const worstMissRad = other.check.residuals.reduce(
      (m, r) => Math.max(m, Math.abs(r.residualRad)),
      0,
    );
    return shown(chosen, {
      kind: 'fit',
      worstMissRad,
      compassDisagreedWithBoth: contradictedA && contradictedB,
    });
  }
  if (
    userChoice !== null &&
    userChoice.usedIdsKey === usedIdsKey &&
    (userChoice.placeIndex === 0 || userChoice.placeIndex === 1)
  ) {
    const index = userChoice.placeIndex;
    const chosen = index === 0 ? a : b;
    const other = index === 0 ? b : a;
    const azimuth = initialAzimuthRad(chosen.position, other.position);
    return shown(chosen, {
      kind: 'user',
      label: index === 0 ? 'A' : 'B',
      otherDistanceM: distanceM(chosen.position, other.position) ?? apart,
      otherAzimuthRad: azimuth.ok ? azimuth.value : 0,
    });
  }

  const fixA = placeFix(prepared, a.check, params);
  if (!fixA.ok) return failed(fixA);
  const fixB = placeFix(prepared, b.check, params);
  if (!fixB.ok) return failed(fixB);
  const why: TwoPlacesWhy[] = [];
  if (prepared.length === 2) why.push('two_sights');
  const anyUsable = (sideA?.usable ?? 0) > 0 || (sideB?.usable ?? 0) > 0;
  if (!anyUsable) why.push('no_sun_side');
  else why.push('sun_side_undecided');
  if (prepared.every((p) => Math.abs(p.sunDeclinationRad) < EQUINOX_DECLINATION_RAD))
    why.push('equinox');
  return ok({
    kind: 'two_places',
    calibration,
    places: [
      { label: 'A', fix: fixA.value, check: a.check },
      { label: 'B', fix: fixB.value, check: b.check },
    ],
    distanceM: apart,
    why,
    usedIdsKey,
    used: prepared,
    setAside,
  });
}
