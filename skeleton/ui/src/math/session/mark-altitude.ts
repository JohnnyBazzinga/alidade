// The apparent altitude of a Mark's Off-axis ray (Req 12.3), shared by `capture` and by
// `establishYaw` in `frozen`, which combine the Image angular sigma with `1 / cos(h)`.

import {
  directionApparentAltitudeRad,
  rayDirection,
  selectWindow,
  type OrientationSample,
  type SampleHistory,
  type SightingWindow,
} from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';
import type { SessionParameters } from './parameters';
import type { Mark } from './session';

/** The newest sample of a window: the last of those with the largest time. */
export function newestSample(samples: readonly OrientationSample[]): OrientationSample | undefined {
  let newest: OrientationSample | undefined;
  for (const sample of samples) {
    if (newest === undefined || sample.timeUtcMs >= newest.timeUtcMs) newest = sample;
  }
  return newest;
}

/**
 * `hypot(sigmaRad, imageSigmaRad / cos(h))` with `h` the apparent altitude of the Off-axis ray of
 * the Mark under the newest sample of the window (Req 12.3, 11.1); `axis_vertical` when `|h|`
 * exceeds `maxMarkAltitudeRad`. Used only with a Mark.
 */
export function sigmaWithMark(
  history: SampleHistory,
  window: SightingWindow,
  mark: Mark,
  sigmaRad: number,
  parameters: Pick<SessionParameters, 'maxMarkAltitudeRad'>,
): UiResult<number> {
  const selected = selectWindow(history.samples, window);
  if (!selected.ok) return selected;
  const sample = newestSample(selected.value);
  if (sample === undefined) return err('insufficient_samples');
  const direction = rayDirection(sample.rotation, mark.offset);
  if (!direction.ok) return direction;
  const altitude = directionApparentAltitudeRad(direction.value);
  if (!altitude.ok) return altitude;
  if (!(Math.abs(altitude.value) <= parameters.maxMarkAltitudeRad)) return err('axis_vertical');
  const term = mark.imageSigmaRad / Math.cos(altitude.value);
  const combined = Math.hypot(sigmaRad, term);
  return Number.isFinite(combined) ? ok(combined) : err('invalid_number', { field: 'sigmaRad' });
}

/**
 * The lens-and-tap term of a bearing with a Mark as it enters the sigma, `ε / cos(h)` (Req 12.3,
 * 13.5), by the same expression as `sigmaWithMark`.
 */
export function markAzimuthTermRad(
  history: SampleHistory,
  window: SightingWindow,
  mark: Mark,
  parameters: Pick<SessionParameters, 'maxMarkAltitudeRad'>,
): UiResult<number> {
  const selected = selectWindow(history.samples, window);
  if (!selected.ok) return selected;
  const sample = newestSample(selected.value);
  if (sample === undefined) return err('insufficient_samples');
  const direction = rayDirection(sample.rotation, mark.offset);
  if (!direction.ok) return direction;
  const altitude = directionApparentAltitudeRad(direction.value);
  if (!altitude.ok) return altitude;
  if (!(Math.abs(altitude.value) <= parameters.maxMarkAltitudeRad)) return err('axis_vertical');
  const term = mark.imageSigmaRad / Math.cos(altitude.value);
  return Number.isFinite(term) ? ok(term) : err('invalid_number', { field: 'markSigmaRad' });
}
