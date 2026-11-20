// The re-centred solve (Req 7.8, 5.11, design D9, §7.2): the only caller of Core's `solve`.

import {
  greatCircleDistanceM,
  isSupportedPosition,
  solve,
  type Fix,
  type Position,
  type SolverOptions,
} from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import { createAltitudeModel, type AltitudeObservation } from './altitude-model';

/**
 * Core's `solve` from `start`, then again with the model made at the Fix it returned, until a Fix
 * lies within `RECENTRE_TOLERANCE_M` of the one before; at most `MAX_RECENTRE_ROUNDS` calls, and
 * `not_converged` when they run out. At least two calls are made. By Req 5.11 no call evaluates
 * the model beyond `PLANE_LIMIT_M` from its origin: a call whose solution lies beyond fails with
 * `out_of_range`, which is returned. `solveFn` is Core's `solve`; tests give a double.
 */
export function recentredSolve(
  observations: readonly AltitudeObservation[],
  start: Position,
  options: SolverOptions,
  params: NoniusParameters,
  solveFn: typeof solve = solve,
): NoniusResult<Fix> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!isSupportedPosition(start)) return err('unsupported_position', { field: 'start' });
  let origin = start;
  let previous: Position | null = null;
  for (let round = 1; round <= params.maxRecentreRounds; round += 1) {
    const model = createAltitudeModel(origin, params);
    if (!model.ok) return model;
    const fix = solveFn(model.value, observations, options);
    if (!fix.ok) return fix;
    if (previous !== null) {
      const moved = greatCircleDistanceM(fix.value.position, previous);
      if (!moved.ok) return moved;
      if (moved.value < params.recentreToleranceM) return ok(fix.value);
    }
    previous = fix.value.position;
    origin = fix.value.position;
  }
  return err('not_converged');
}
