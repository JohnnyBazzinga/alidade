import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MIN_PROPERTY_RUNS } from './fast-check-setup';

describe('shared fast-check configuration', () => {
  it('runs every property for at least 200 cases without per-test settings', () => {
    let runCount = 0;
    fc.assert(
      fc.property(fc.integer(), () => {
        runCount += 1;
      }),
    );
    expect(MIN_PROPERTY_RUNS).toBeGreaterThanOrEqual(200);
    expect(runCount).toBe(MIN_PROPERTY_RUNS);
  });
});
