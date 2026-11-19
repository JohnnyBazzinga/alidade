// The closed set of failure reasons of Vigia (Req 2.2, design D2).
//
// `VigiaReason` is every `UiReason` (which includes every reason of Sensors and of Core)
// unchanged in meaning, plus the 22 of `VIGIA_ONLY_REASONS`. The list of UI's reasons is UI's own
// export (`UI_REASONS`); this file repeats none of it. The three reasons of the hotspot Overlay
// (`overlay_needs_key`, `overlay_area_too_large`, `hotspot_footprint_unknown`) are the second
// release's and are not here.

import { UI_REASONS, type UiReason } from '@alidade/ui';

/**
 * The reasons Vigia adds:
 *
 * - code and link: `code_damaged` (check value wrong, text cut, a character outside the
 *   alphabet), `code_too_long`, `code_version_unsupported` (an unknown version or kind),
 *   `code_not_a_sighting` (empty text, or a pasted message that has no link and is not a code),
 *   `link_too_long` (the page address leaves no room for a link of at most 160 characters).
 * - Incident and merge: `incident_unknown`, `incident_full`, `sighting_conflict` (the same id
 *   with different content), `simulation_not_shareable`.
 * - the four set-aside causes that Req 5.2 shows through `messageFor`: `sighting_too_old`,
 *   `sighting_time_implausible`, `outlier`, `hidden_by_user`.
 * - storage and clipboard: `storage_unavailable`, `storage_corrupt`,
 *   `storage_version_unsupported`, `clipboard_unavailable`.
 * - network and Overlays: `host_not_allowed`, `overlay_unavailable` (any failure of a request,
 *   and a response that cannot be read), `overlay_stale`.
 * - `transport_unavailable`, and `random_unavailable` (no secure random source).
 */
export const VIGIA_ONLY_REASONS = {
  code_damaged: true,
  code_too_long: true,
  code_version_unsupported: true,
  code_not_a_sighting: true,
  link_too_long: true,
  incident_unknown: true,
  incident_full: true,
  sighting_conflict: true,
  simulation_not_shareable: true,
  sighting_too_old: true,
  sighting_time_implausible: true,
  outlier: true,
  hidden_by_user: true,
  storage_unavailable: true,
  storage_corrupt: true,
  storage_version_unsupported: true,
  clipboard_unavailable: true,
  host_not_allowed: true,
  overlay_unavailable: true,
  overlay_stale: true,
  transport_unavailable: true,
  random_unavailable: true,
} as const satisfies Record<VigiaOnlyReason, true>;

export type VigiaOnlyReason =
  | 'code_damaged'
  | 'code_too_long'
  | 'code_version_unsupported'
  | 'code_not_a_sighting'
  | 'link_too_long'
  | 'incident_unknown'
  | 'incident_full'
  | 'sighting_conflict'
  | 'simulation_not_shareable'
  | 'sighting_too_old'
  | 'sighting_time_implausible'
  | 'outlier'
  | 'hidden_by_user'
  | 'storage_unavailable'
  | 'storage_corrupt'
  | 'storage_version_unsupported'
  | 'clipboard_unavailable'
  | 'host_not_allowed'
  | 'overlay_unavailable'
  | 'overlay_stale'
  | 'transport_unavailable'
  | 'random_unavailable';

export type VigiaReason = UiReason | VigiaOnlyReason;

/** Vigia's own reasons, as a list. `satisfies` above makes the compiler hold it to the type. */
export const VIGIA_ONLY_REASON_LIST: readonly VigiaOnlyReason[] = Object.freeze(
  Object.keys(VIGIA_ONLY_REASONS) as VigiaOnlyReason[],
);

/** Every member of `VigiaReason`: UI's list first, then Vigia's 22 (69 in all). */
export const VIGIA_REASONS: readonly VigiaReason[] = Object.freeze([
  ...UI_REASONS,
  ...VIGIA_ONLY_REASON_LIST,
]);
