// Advice in time (Req 10.2, 10.7, design D15, §7.6): how long to wait for the next sight, from how
// the Sun's azimuth turns at the Fix over the coming hours. No solve.

import {
  angularDifference,
  isSupportedPosition,
  POOR_GEOMETRY_CROSSING_RAD,
  type Position,
} from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { utcClockText, waitText } from '../civil-time';
import { toDeg } from '../degrees';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { PreparedSight } from '../sight/prepare';
import { sunAt } from '../sun/sun-at';

export type Advice =
  | { readonly kind: 'wait'; readonly waitMs: number; readonly atUtcMs: number }
  | { readonly kind: 'not_today' };

/**
 * `A₀` is the Sun's azimuth at the Fix at the newest used Sight's time. For `k = 1, 2, …` while
 * `k · ADVICE_SCAN_STEP_MS ≤ ADVICE_SCAN_HORIZON_MS`, `s` is the Sun at the Fix at `now + k · step`;
 * the first `k` with `s`'s apparent altitude in the limits and an Angle of cut with `A₀` of at
 * least `ADVICE_TURN_RAD` gives `wait`; none gives `not_today`. A step at which the Sun cannot be
 * computed (far below the horizon, where there is no apparent altitude) is not a candidate.
 */
export function nextSightAdvice(
  fix: Position,
  prepared: readonly PreparedSight[],
  nowUtcMs: number,
  params: NoniusParameters,
): NoniusResult<Advice> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!isSupportedPosition(fix)) return err('unsupported_position', { field: 'fix' });
  if (!Number.isFinite(nowUtcMs)) return err('invalid_number', { field: 'nowUtcMs' });
  if (prepared.length === 0) return err('insufficient_observations');
  const newestUtcMs = Math.max(...prepared.map((p) => p.sight.timeUtcMs));
  const first = sunAt(fix, newestUtcMs, params);
  if (!first.ok) return first;
  for (let k = 1; k * params.adviceScanStepMs <= params.adviceScanHorizonMs; k += 1) {
    const atUtcMs = nowUtcMs + k * params.adviceScanStepMs;
    const sun = sunAt(fix, atUtcMs, params);
    if (!sun.ok) continue;
    const inLimits =
      sun.value.apparentAltitudeRad >= params.minSightAltitudeRad &&
      sun.value.apparentAltitudeRad <= params.maxSightAltitudeRad;
    if (!inLimits) continue;
    const difference = angularDifference(sun.value.trueAzimuthRad, first.value.trueAzimuthRad);
    if (!difference.ok) continue;
    const delta = Math.abs(difference.value);
    if (Math.min(delta, Math.PI - delta) >= params.adviceTurnRad) {
      return ok({ kind: 'wait', waitMs: k * params.adviceScanStepMs, atUtcMs });
    }
  }
  return ok({ kind: 'not_today' });
}

const COMPUTED_AT_THE_FIX =
  'It is computed at the Fix, which may be far from the observer, so the time is approximate.';

/** The advice in words (Req 10.2); `usedCount` of two or three adds that a sight also checks them. */
export function adviceWords(advice: Advice, usedCount: number, params: NoniusParameters): string {
  if (advice.kind === 'not_today') {
    return 'The Sun\u2019s direction will not change enough before it sets, or before the horizon: sight again tomorrow from the same place.';
  }
  const text = `Advice: next sight in about ${waitText(advice.waitMs, params.adviceScanStepMs)}, at ${utcClockText(advice.atUtcMs)}, or later.`;
  const check =
    usedCount === 2 || usedCount === 3
      ? ' With the sights you have, a further sight also lets them be checked.'
      : '';
  return `${text}${check} ${COMPUTED_AT_THE_FIX}`;
}

/** The rule of thumb, for when there is no Shown Fix (Req 10.7). */
export function ruleOfThumb(params: NoniusParameters): string {
  const turn = toDeg(POOR_GEOMETRY_CROSSING_RAD);
  const degrees = turn.ok ? Math.round(turn.value) : 20;
  return `The Sun\u2019s direction must change by at least ${degrees}° between sights. Away from midday at middle latitudes it turns by about 8° to 16° an hour, so wait about ${waitText(params.firstWaitMs, 60_000)} after the latest sight. A morning sight and an afternoon sight usually cross well.`;
}
