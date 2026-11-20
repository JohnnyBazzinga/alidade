// One Candidate: the check solve judges, the Fix solve places, the shared error widens (Req 7.1,
// 7.2, 7.5, design D10, §7.3).

import {
  ellipse95,
  ellipseFromCovariance,
  type Fix,
  type Position,
  type Warning,
} from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { PreparedSight } from '../sight/prepare';
import { observationsOf } from './altitude-model';
import { recentredSolve } from './recentred-solve';
import { sharedErrorCovariance } from './shared-error';

/** The Fix that the app shows: Core's `Fix` with its covariance and ellipse replaced (Req 7.1). */
export type ShownFix = Fix;

/**
 * The check solve: every Sight weighed by the `hypot` of its Independent and Common sigmas, with
 * Core's outlier rejection, from `candidate`. Its Studentised residuals are the test of
 * disagreement and its `excludedIds` the outliers: with the Independent sigma alone a shared error
 * would appear as disagreement (design D10).
 */
export function checkSolve(
  prepared: readonly PreparedSight[],
  candidate: Position,
  params: NoniusParameters,
): NoniusResult<Fix> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const observations = observationsOf(prepared, 'full', 0);
  if (!observations.ok) return observations;
  return recentredSolve(observations.value, candidate, { outlierRejection: true }, params);
}

/**
 * The Shown Fix: the Fix solve (Independent sigmas, no rejection) on the Sights the check solve
 * kept, from the check Fix; its covariance Core's plus `σc² g gᵀ` (`sharedErrorCovariance`), its
 * ellipse Core's `ellipseFromCovariance` of that; the check solve's `excludedIds`, and the union
 * of the warnings. `fix_too_uncertain` when the 95 % semi-major axis exceeds the limit.
 */
export function placeFix(
  prepared: readonly PreparedSight[],
  check: Fix,
  params: NoniusParameters,
): NoniusResult<ShownFix> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const excluded = new Set(check.excludedIds);
  const kept = prepared.filter((p) => !excluded.has(p.sight.id));
  const commonSigmaRad = kept[0]?.commonSigmaRad ?? 0;
  const observations = observationsOf(kept, 'independent', 0);
  if (!observations.ok) return observations;
  const fix = recentredSolve(
    observations.value,
    check.position,
    { outlierRejection: false },
    params,
  );
  if (!fix.ok) return fix;
  const shiftedFix = (sign: 1 | -1): NoniusResult<Fix> => {
    const shifted = observationsOf(kept, 'independent', sign * params.sensitivityStepRad);
    if (!shifted.ok) return shifted;
    return recentredSolve(shifted.value, fix.value.position, { outlierRejection: false }, params);
  };
  const covariance = sharedErrorCovariance(
    fix.value.covariance,
    fix.value.position,
    shiftedFix,
    commonSigmaRad,
    params.sensitivityStepRad,
  );
  if (!covariance.ok) return covariance;
  const ellipse = ellipseFromCovariance(covariance.value);
  if (!ellipse.ok) return ellipse;
  const warnings: Warning[] = [...new Set<Warning>([...fix.value.warnings, ...check.warnings])];
  const shown: ShownFix = {
    ...fix.value,
    covariance: covariance.value,
    ellipse: ellipse.value,
    excludedIds: check.excludedIds,
    warnings,
  };
  const wide = ellipse95(shown.ellipse);
  if (!wide.ok) return wide;
  if (wide.value.semiMajorM > params.maxFixSemiMajor95M) return err('fix_too_uncertain');
  return ok(shown);
}
