import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deepSame } from './deep-same';
import { cappedRuns, MIN_PROPERTY_RUNS, propertyRuns, seedFrom } from './fast-check-setup';
import { checkProperty, ErrorTracker, propertyReports } from './property-report';

describe('shared fast-check configuration', () => {
  it('runs every property for the provided count without per-test settings', () => {
    let runCount = 0;
    fc.assert(
      fc.property(fc.integer(), () => {
        runCount += 1;
      }),
    );
    expect(propertyRuns()).toBeGreaterThanOrEqual(MIN_PROPERTY_RUNS);
    expect(runCount).toBe(propertyRuns());
  });

  it('caps the expensive properties and never goes below 200', () => {
    expect(cappedRuns(1000)).toBe(Math.max(MIN_PROPERTY_RUNS, Math.min(propertyRuns(), 1000)));
    expect(cappedRuns(50)).toBe(MIN_PROPERTY_RUNS);
    expect(cappedRuns(1_000_000)).toBe(propertyRuns());
  });
});

// A seed for a whole run, given as `VIGIA_PROPERTY_SEED` (the lead, 2026-11-20: run the P-2.6
// entries of task group 20 deep with five seeds). None given: fast-check draws its own.
describe('the seed of a run', () => {
  it('is a 32-bit integer read from the variable, or none when it is not set', () => {
    expect(seedFrom(undefined)).toBeNull();
    expect(seedFrom('898952540')).toBe(898952540);
    expect(seedFrom('-333382481')).toBe(-333382481);
    expect(seedFrom('0')).toBe(0);
  });

  it('refuses text that is not such an integer, so that a typing slip is not a silent random run', () => {
    for (const bad of ['', ' 1', '1.5', 'abc', '1e3', '2147483648', '-2147483649', 'NaN']) {
      expect(() => seedFrom(bad), bad).toThrow();
    }
  });
});

describe('checkProperty', () => {
  it('records the case count, the discards, the cost and the worst error', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-test',
      fc.property(fc.integer({ min: 0, max: 99 }), (n) => {
        fc.pre(n !== 0);
        tracker.record('value', n / 100, '1');
      }),
      tracker,
      { seed: 1, numRuns: 300 },
    );
    const report = propertyReports().find((r) => r.id === 'P-test');
    expect(report?.numRuns).toBe(300);
    expect(report?.numSkips).toBeGreaterThan(0);
    expect(report?.msPerCase).toBeGreaterThan(0);
    expect(tracker.worst('value')).toBeLessThanOrEqual(0.99);
    expect(tracker.worst('value')).toBeGreaterThan(0.9);
  });

  it('reports a deliberately failing property as failing', () => {
    const tracker = new ErrorTracker();
    expect(() =>
      checkProperty(
        'P-fail',
        fc.property(fc.integer(), (n) => n < 10),
        tracker,
        { seed: 1 },
      ),
    ).toThrow(/Property failed/);
    expect(propertyReports().some((r) => r.id === 'P-fail')).toBe(false);
  });
});

describe('deepSame', () => {
  it('tells -0 from 0 and NaN from NaN only by Object.is', () => {
    expect(deepSame({ a: [0] }, { a: [-0] })).toBe(false);
    expect(deepSame({ a: [Number.NaN] }, { a: [Number.NaN] })).toBe(true);
    expect(deepSame({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true);
    expect(deepSame({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepSame([1], { 0: 1 })).toBe(false);
  });
});
