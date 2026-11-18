// The Yaw status (Req 11.3, design §7.8): whether the Session's Yaw reference can still be used,
// by Sensors' rules (`resetBetween` and `invalidates`); the UI writes none of its own.

import {
  invalidates,
  resetBetween,
  type FrameResetEvent,
  type YawReference,
} from '@alidade/sensors';

export type YawStatusKind = 'none' | 'valid' | 'stale' | 'invalidated';

export interface YawStatus {
  readonly status: YawStatusKind;
  /** `max(0, now - established)`, never negative, never `NaN`. */
  readonly ageMs: number;
}

/**
 * `none` with no reference; `invalidated` when a Frame reset that invalidates it lies in the
 * closed interval from the time it was established to `nowUtcMs`; `stale` when its age exceeds
 * `maxAgeMs`; else `valid`. `invalidated` takes precedence over `stale`. A non-finite argument
 * gives `none` with age 0.
 */
export function yawStatus(
  yawReference: YawReference | null,
  frameResets: readonly FrameResetEvent[],
  nowUtcMs: number,
  maxAgeMs: number,
): YawStatus {
  if (
    yawReference === null ||
    !Number.isFinite(yawReference.establishedUtcMs) ||
    !Number.isFinite(nowUtcMs) ||
    !Number.isFinite(maxAgeMs)
  ) {
    return { status: 'none', ageMs: 0 };
  }
  const ageMs = Math.max(0, nowUtcMs - yawReference.establishedUtcMs);
  if (
    resetBetween(frameResets, yawReference.establishedUtcMs, nowUtcMs, (cause) =>
      invalidates(yawReference.frame, cause),
    )
  ) {
    return { status: 'invalidated', ageMs: Number.isFinite(ageMs) ? ageMs : 0 };
  }
  if (!Number.isFinite(ageMs)) return { status: 'none', ageMs: 0 };
  return { status: ageMs > maxAgeMs ? 'stale' : 'valid', ageMs };
}
