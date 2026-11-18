// Sighting windows (design §7.4): which samples a capture or a Yaw reference reads, and whether a
// Frame reset lies in an interval.

import type { FrameResetCause } from './frame-reset';
import {
  checkDurationMs,
  checkSampleCount,
  checkTimeUtcMs,
  checkWindowLengthMs,
} from './parameters';
import { err, ok, type SensorResult } from './sensor-result';

/** The window `[endUtcMs - windowLengthMs, endUtcMs]` and its limits. */
export interface SightingWindow {
  readonly endUtcMs: number;
  readonly windowLengthMs: number;
  readonly minSampleCount: number;
  readonly sampleStalenessMs: number;
}

/** Validates a window's numbers (Req 10.3), naming the offending field. */
export function checkWindow(sightingWindow: SightingWindow): SensorResult<SightingWindow> {
  const checks = [
    checkTimeUtcMs(sightingWindow.endUtcMs, 'endUtcMs'),
    checkWindowLengthMs(sightingWindow.windowLengthMs, 'windowLengthMs'),
    checkSampleCount(sightingWindow.minSampleCount, 'minSampleCount'),
    checkDurationMs(sightingWindow.sampleStalenessMs, 'sampleStalenessMs'),
  ];
  for (const check of checks) if (!check.ok) return check;
  return ok(sightingWindow);
}

/** The start of a window. */
export function windowStartUtcMs(sightingWindow: SightingWindow): number {
  return sightingWindow.endUtcMs - sightingWindow.windowLengthMs;
}

/**
 * The items whose `timeUtcMs` lies in the closed window, in input order. Fails with
 * `insufficient_samples` if fewer than `minSampleCount` lie in it, then with `stale_samples` if
 * the newest of them is more than `sampleStalenessMs` before the window's end (Req 8.6, 8.7).
 * Items outside the window are never read, so they cannot change the result (Req 8.13).
 */
export function selectWindow<T extends { readonly timeUtcMs: number }>(
  items: readonly T[],
  sightingWindow: SightingWindow,
): SensorResult<readonly T[]> {
  const checked = checkWindow(sightingWindow);
  if (!checked.ok) return checked;
  const startUtcMs = windowStartUtcMs(sightingWindow);
  const selected = items.filter(
    (item) => item.timeUtcMs >= startUtcMs && item.timeUtcMs <= sightingWindow.endUtcMs,
  );
  if (selected.length < sightingWindow.minSampleCount) return err('insufficient_samples');
  let newestUtcMs = Number.NEGATIVE_INFINITY;
  for (const item of selected) newestUtcMs = Math.max(newestUtcMs, item.timeUtcMs);
  if (sightingWindow.endUtcMs - newestUtcMs > sightingWindow.sampleStalenessMs)
    return err('stale_samples');
  return ok(selected);
}

/**
 * Whether any reset accepted by `counts` lies in the closed interval between `aUtcMs` and
 * `bUtcMs`, in either order (D9).
 */
export function resetBetween(
  resets: readonly { readonly timeUtcMs: number; readonly cause: FrameResetCause }[],
  aUtcMs: number,
  bUtcMs: number,
  counts: (cause: FrameResetCause) => boolean = () => true,
): boolean {
  const fromUtcMs = Math.min(aUtcMs, bUtcMs);
  const toUtcMs = Math.max(aUtcMs, bUtcMs);
  return resets.some(
    (reset) => reset.timeUtcMs >= fromUtcMs && reset.timeUtcMs <= toUtcMs && counts(reset.cause),
  );
}
