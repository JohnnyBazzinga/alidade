// The closed set of failure reasons of Nonius (Req 2.2, design D2).
//
// `NoniusReason` is every `UiReason` (which includes every reason of Sensors and of Core)
// unchanged in meaning, plus the 11 of `NONIUS_ONLY_REASONS`. The list of UI's reasons is UI's
// own export (`UI_REASONS`); this file repeats none of it.

import { UI_REASONS, type UiReason } from '@alidade/ui';

/**
 * The reasons Nonius adds:
 *
 * - the limits of a sight: `sun_too_low`, `sun_too_high` (the corrected apparent altitude
 *   outside `[5°, 80°]`), `sight_time_unsupported` (a time outside the Sun wrapper's range, or a
 *   failure of the library), `sights_full`.
 * - the fix: `circles_do_not_meet` (no pair of Circles crosses), `fix_too_uncertain` (the 95 %
 *   semi-major axis exceeds the limit), `outlier` (the cause of a Sight Core set aside).
 * - the Index error: `index_error_implausible`.
 * - storage: `storage_unavailable`, `storage_corrupt`, `storage_version_unsupported`.
 */
export const NONIUS_ONLY_REASONS = {
  sun_too_low: true,
  sun_too_high: true,
  sight_time_unsupported: true,
  sights_full: true,
  circles_do_not_meet: true,
  fix_too_uncertain: true,
  outlier: true,
  index_error_implausible: true,
  storage_unavailable: true,
  storage_corrupt: true,
  storage_version_unsupported: true,
} as const;

export type NoniusOnlyReason = keyof typeof NONIUS_ONLY_REASONS;

export type NoniusReason = UiReason | NoniusOnlyReason;

/** Nonius's own reasons, as a list. */
export const NONIUS_ONLY_REASON_LIST: readonly NoniusOnlyReason[] = Object.freeze(
  Object.keys(NONIUS_ONLY_REASONS) as NoniusOnlyReason[],
);

/** Every member of `NoniusReason`: UI's list first, then Nonius's 11. */
export const NONIUS_REASONS: readonly NoniusReason[] = Object.freeze([
  ...UI_REASONS,
  ...NONIUS_ONLY_REASON_LIST,
]);
