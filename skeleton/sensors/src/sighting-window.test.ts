import { describe, expect, it } from 'vitest';
import { resetBetween, selectWindow, type SightingWindow } from './sighting-window';

const WINDOW: SightingWindow = {
  endUtcMs: 10_000,
  windowLengthMs: 1000,
  minSampleCount: 2,
  sampleStalenessMs: 500,
};

function at(...timesUtcMs: number[]) {
  return timesUtcMs.map((timeUtcMs, index) => ({ timeUtcMs, index }));
}

describe('selectWindow (§7.4)', () => {
  it('includes both edges and excludes 1 ms beyond each, keeping input order (Req 8.1)', () => {
    const selected = selectWindow(at(10_000, 8_999, 9_000, 10_001, 9_500), WINDOW);
    expect(selected).toEqual({
      ok: true,
      value: at(10_000, 8_999, 9_000, 10_001, 9_500).filter((_, i) => i !== 1 && i !== 3),
    });
  });

  it('fails with insufficient_samples below the minimum (Req 8.6)', () => {
    const tenRequired = { ...WINDOW, minSampleCount: 10 };
    const nine = at(...Array.from({ length: 9 }, (_, i) => 9_100 + i * 100));
    expect(selectWindow(nine, tenRequired)).toEqual({ ok: false, reason: 'insufficient_samples' });
    expect(
      selectWindow(at(...Array.from({ length: 10 }, (_, i) => 9_050 + i * 100)), tenRequired).ok,
    ).toBe(true);
  });

  it('fails with stale_samples when the newest is beyond the limit, not at it (Req 8.7)', () => {
    expect(selectWindow(at(9_100, 9_499), WINDOW)).toEqual({ ok: false, reason: 'stale_samples' });
    expect(selectWindow(at(9_100, 9_500), WINDOW).ok).toBe(true);
  });

  it('checks insufficient_samples before stale_samples', () => {
    expect(selectWindow(at(9_100), WINDOW)).toEqual({ ok: false, reason: 'insufficient_samples' });
  });

  it('validates the window (Req 10.3)', () => {
    expect(selectWindow([], { ...WINDOW, windowLengthMs: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'windowLengthMs',
    });
    expect(selectWindow([], { ...WINDOW, minSampleCount: 2.5 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'minSampleCount',
    });
  });
});

describe('resetBetween (D9)', () => {
  const resets = [{ timeUtcMs: 5_000, cause: 'hidden' as const }];

  it('uses a closed interval in either order', () => {
    expect(resetBetween(resets, 5_000, 6_000)).toBe(true);
    expect(resetBetween(resets, 6_000, 5_000)).toBe(true);
    expect(resetBetween(resets, 4_000, 4_999)).toBe(false);
    expect(resetBetween(resets, 5_001, 4_000)).toBe(true);
  });

  it('counts only the causes it is told to', () => {
    expect(resetBetween(resets, 0, 10_000, (cause) => cause === 'frame_change')).toBe(false);
  });
});
