// The one module that asks the phone's location (Req 1.4, 11.2, 15.2; design D17). The Comparison
// and the Index error screen are its only callers, each only on the user's act. It makes a Sensor
// source of its own, calls `startPosition` once, checks the fix against the Coarse location limit
// and stops the source after the first fix or failure.

import {
  checkPositionFix,
  type PositionFix,
  type SensorResult,
  type SensorSource,
} from '@alidade/sensors';
import { err, ok, type NoniusFailure, type NoniusResult } from '../result';

export interface LocationLimits {
  /** The Clock that says when the fix is used. */
  readonly clock: () => number;
  readonly positionStalenessMs: number;
  readonly coarseLocationLimitM: number;
}

function fromSensor(failure: Extract<SensorResult<never>, { ok: false }>): NoniusFailure {
  const { field, id, reportedAccuracyM, errorName } = failure as {
    field?: string;
    id?: string;
    reportedAccuracyM?: number;
    errorName?: string;
  };
  return err(failure.reason, {
    ...(field === undefined ? {} : { field }),
    ...(id === undefined ? {} : { id }),
    ...(reportedAccuracyM === undefined ? {} : { reportedAccuracyM }),
    ...(errorName === undefined ? {} : { errorName }),
  });
}

/** Asks once. Never throws: a rejection is `position_unavailable`. */
export async function askLocationOnce(
  createSource: () => SensorResult<SensorSource>,
  limits: LocationLimits,
): Promise<NoniusResult<PositionFix>> {
  if (!Number.isFinite(limits.positionStalenessMs) || limits.positionStalenessMs <= 0) {
    return err('invalid_number', { field: 'positionStalenessMs' });
  }
  if (!Number.isFinite(limits.coarseLocationLimitM) || limits.coarseLocationLimitM <= 0) {
    return err('invalid_number', { field: 'coarseLocationLimitM' });
  }
  const created = createSource();
  if (!created.ok) return fromSensor(created);
  const source = created.value;
  try {
    const located = await source.startPosition();
    if (!located.ok) return fromSensor(located);
    const checked = checkPositionFix(located.value, {
      atUtcMs: limits.clock(),
      positionStalenessMs: limits.positionStalenessMs,
      coarseLocationLimitM: limits.coarseLocationLimitM,
    });
    return checked.ok ? ok(checked.value) : fromSensor(checked);
  } catch (error) {
    const name: unknown =
      typeof error === 'object' && error !== null ? Reflect.get(error, 'name') : undefined;
    return err('position_unavailable', typeof name === 'string' ? { errorName: name } : {});
  } finally {
    source.stop();
  }
}
