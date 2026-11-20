// The shared error by sensitivity (Req 7.2, design D11, §7.3).

import { projectToLocalPlane, type CovarianceEnM2, type Fix, type Position } from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';

/**
 * The covariance of the Shown Fix: Core's covariance of the Fix solve plus `σc² · g gᵀ`, where
 * `g` is, in East-North metres per radian at the Fix, the shift of the Fix when every corrected
 * altitude is shifted by the same amount: `g = (F₊ − F₋) / (2 · stepRad)`, `F±` being the Fix
 * solves with every altitude shifted by `± stepRad` (`shiftedFix(+1)`, `shiftedFix(-1)`),
 * projected onto the Local plane of the Fix.
 *
 * A shared error `b` moves every Circle by the same amount, so the Fix moves by `g · b` and that
 * does not shrink as Sights are added. On a linear model this is exactly the covariance of the
 * weighted least-squares estimate with independent plus one shared error (design §7.3, P-7.9).
 */
export function sharedErrorCovariance(
  base: CovarianceEnM2,
  fixPosition: Position,
  shiftedFix: (sign: 1 | -1) => NoniusResult<Fix>,
  commonSigmaRad: number,
  stepRad: number,
): NoniusResult<CovarianceEnM2> {
  if (!Number.isFinite(stepRad) || stepRad <= 0) return err('invalid_number', { field: 'stepRad' });
  if (!Number.isFinite(commonSigmaRad) || commonSigmaRad < 0) {
    return err('invalid_number', { field: 'commonSigmaRad' });
  }
  for (const [field, value] of Object.entries(base)) {
    if (!Number.isFinite(value)) return err('invalid_number', { field });
  }
  const plus = shiftedFix(1);
  if (!plus.ok) return plus;
  const minus = shiftedFix(-1);
  if (!minus.ok) return minus;
  const eastPlus = projectToLocalPlane(fixPosition, plus.value.position);
  if (!eastPlus.ok) return eastPlus;
  const eastMinus = projectToLocalPlane(fixPosition, minus.value.position);
  if (!eastMinus.ok) return eastMinus;
  const gEast = (eastPlus.value.eastM - eastMinus.value.eastM) / (2 * stepRad);
  const gNorth = (eastPlus.value.northM - eastMinus.value.northM) / (2 * stepRad);
  const s2 = commonSigmaRad * commonSigmaRad;
  const covariance: CovarianceEnM2 = {
    varEastM2: base.varEastM2 + s2 * gEast * gEast,
    varNorthM2: base.varNorthM2 + s2 * gNorth * gNorth,
    covEastNorthM2: base.covEastNorthM2 + s2 * gEast * gNorth,
  };
  return Object.values(covariance).every(Number.isFinite)
    ? ok(covariance)
    : err('invalid_number', { field: 'covariance' });
}
