import { UI_REASONS } from '@alidade/ui';
import { describe, expect, it } from 'vitest';
import { NONIUS_ONLY_REASON_LIST, NONIUS_ONLY_REASONS, NONIUS_REASONS } from './reasons';

// Req 2.2: the closed set is every UI reason and exactly these 11.
const REQ_2_2 = [
  'sun_too_low',
  'sun_too_high',
  'sight_time_unsupported',
  'sights_full',
  'circles_do_not_meet',
  'fix_too_uncertain',
  'outlier',
  'index_error_implausible',
  'storage_unavailable',
  'storage_corrupt',
  'storage_version_unsupported',
];

describe('Nonius reasons (Req 2.2)', () => {
  it('adds exactly the 11 reasons of the requirement', () => {
    expect([...NONIUS_ONLY_REASON_LIST].sort()).toEqual([...REQ_2_2].sort());
    expect(Object.keys(NONIUS_ONLY_REASONS).sort()).toEqual([...REQ_2_2].sort());
  });

  it('adds nothing UI already knows, and no reason of the dropped design', () => {
    const ui = new Set<string>(UI_REASONS);
    expect(NONIUS_ONLY_REASON_LIST.filter((r) => ui.has(r))).toEqual([]);
    expect(NONIUS_ONLY_REASON_LIST as readonly string[]).not.toContain('two_places_fit');
  });

  it('covers every UI reason and nothing else, once each', () => {
    expect(NONIUS_REASONS).toHaveLength(UI_REASONS.length + 11);
    expect(new Set(NONIUS_REASONS).size).toBe(NONIUS_REASONS.length);
    expect([...NONIUS_REASONS].sort()).toEqual([...UI_REASONS, ...REQ_2_2].sort());
  });
});
