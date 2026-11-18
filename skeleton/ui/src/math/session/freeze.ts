// Freeze (Req 10.1 to 10.3, design §7.6, D6): the Frozen sighting is the Session's own immutable
// history at the moment of the event, so a Freeze costs no copy and nothing delivered afterwards
// can reach it.

import { wrapPi } from '@alidade/core';
import { selectWindow, type SightingWindow } from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';
import type { SessionParameters } from './parameters';
import type { FrozenSighting, Session } from './session';

/** The Sighting window that ends at `endUtcMs`, with the limits of the parameters. */
export function sightingWindowOf(parameters: SessionParameters, endUtcMs: number): SightingWindow {
  return {
    endUtcMs,
    windowLengthMs: parameters.windowLengthMs,
    minSampleCount: parameters.minSampleCount,
    sampleStalenessMs: parameters.sampleStalenessMs,
  };
}

/**
 * The checks of a Freeze, in this order, the first failure being returned (Req 10.1, 10.2): (1)
 * Sensors' `selectWindow` over the samples (`insufficient_samples` or `stale_samples`: Sensors'
 * rule, not a copy of it); (2) the Screen angle of the newest selected sample is not `null` and
 * within `screenAngleToleranceRad` of 0, else `portrait_required`. On success the Frozen sighting.
 */
export function freeze(
  session: Session,
  parameters: SessionParameters,
  timeUtcMs: number,
): UiResult<FrozenSighting> {
  const window = sightingWindowOf(parameters, timeUtcMs);
  const selected = selectWindow(session.history.samples, window);
  if (!selected.ok) return selected;
  let newest = selected.value[0];
  for (const sample of selected.value) {
    if (newest === undefined || sample.timeUtcMs >= newest.timeUtcMs) newest = sample;
  }
  const angle = newest?.screenAngleRad ?? null;
  if (angle === null) return err('portrait_required');
  const wrapped = wrapPi(angle);
  if (!wrapped.ok || Math.abs(wrapped.value) > parameters.screenAngleToleranceRad) {
    return err('portrait_required');
  }
  return ok({
    history: session.history,
    window,
    yawReference: session.yawReference,
    yawReferenceSource: session.yawReferenceSource,
    declination: session.declination,
    mark: null,
    frozenAtUtcMs: timeUtcMs,
  });
}
