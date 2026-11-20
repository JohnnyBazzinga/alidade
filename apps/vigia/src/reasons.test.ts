import { SENSOR_REASONS } from '@alidade/sensors';
import { UI_REASONS } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import {
  VIGIA_ONLY_REASONS,
  VIGIA_ONLY_REASON_LIST,
  VIGIA_REASONS,
  type VigiaOnlyReason,
} from './reasons';

/** The 22 reasons of Req 2.2, typed out on purpose: a drift in the source fails here. */
const REQ_2_2 = [
  'code_damaged',
  'code_too_long',
  'code_version_unsupported',
  'code_not_a_sighting',
  'link_too_long',
  'incident_unknown',
  'incident_full',
  'sighting_conflict',
  'simulation_not_shareable',
  'sighting_too_old',
  'sighting_time_implausible',
  'outlier',
  'hidden_by_user',
  'storage_unavailable',
  'storage_corrupt',
  'storage_version_unsupported',
  'clipboard_unavailable',
  'host_not_allowed',
  'overlay_unavailable',
  'overlay_stale',
  'transport_unavailable',
  'random_unavailable',
] as const satisfies readonly VigiaOnlyReason[];

/**
 * The reason added by design §7.4a (2026-11-21), proposed there and not yet in Req 2.2's list of
 * 22: a join that cannot be made (a simulation and a real smoke, or too many former ids).
 */
const ADDED_BY_THE_JOIN = ['incident_not_joinable'] as const satisfies readonly VigiaOnlyReason[];

/** The three of the hotspot Overlay (second release): in no list of the first release. */
const HOTSPOT_REASONS = [
  'overlay_needs_key',
  'overlay_area_too_large',
  'hotspot_footprint_unknown',
];

describe('VIGIA_REASONS (Req 2.2, design D2)', () => {
  it('has the 22 reasons of Req 2.2 and the one of the join, no more and no fewer', () => {
    expect(REQ_2_2).toHaveLength(22);
    const all = [...REQ_2_2, ...ADDED_BY_THE_JOIN].sort();
    expect([...VIGIA_ONLY_REASON_LIST].sort()).toEqual(all);
    expect(Object.keys(VIGIA_ONLY_REASONS).sort()).toEqual(all);
  });

  it('is every UI reason, unchanged and first, then the 23 of Vigia: 70 in all', () => {
    expect(UI_REASONS).toHaveLength(47);
    expect(UI_REASONS.slice(0, SENSOR_REASONS.length)).toEqual(SENSOR_REASONS);
    expect(VIGIA_REASONS).toHaveLength(70);
    expect(VIGIA_REASONS.slice(0, UI_REASONS.length)).toEqual(UI_REASONS);
    expect(VIGIA_REASONS.slice(UI_REASONS.length)).toEqual(VIGIA_ONLY_REASON_LIST);
  });

  it('has no duplicate: none of the 23 is a UI reason', () => {
    expect(new Set(VIGIA_REASONS).size).toBe(VIGIA_REASONS.length);
  });

  it('does not hold the three hotspot reasons of the second release', () => {
    for (const reason of HOTSPOT_REASONS) {
      expect(VIGIA_REASONS as readonly string[]).not.toContain(reason);
    }
  });

  it('is frozen, and so is the list of the 23', () => {
    expect(Object.isFrozen(VIGIA_REASONS)).toBe(true);
    expect(Object.isFrozen(VIGIA_ONLY_REASON_LIST)).toBe(true);
  });
});
