import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cappedRuns,
  CAPPED_PROPERTY_RUNS,
  MIN_PROPERTY_RUNS,
  propertyRuns,
} from './fast-check-setup';
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

  it('caps the expensive properties at 10 000 cases', () => {
    expect(cappedRuns()).toBe(Math.min(propertyRuns(), CAPPED_PROPERTY_RUNS));
    expect(cappedRuns()).toBeGreaterThanOrEqual(MIN_PROPERTY_RUNS);
  });
});

describe('checkProperty', () => {
  it('records the case count, the discards and the worst error', () => {
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
    expect(tracker.worst('value')).toBeLessThanOrEqual(0.99);
    expect(tracker.worst('value')).toBeGreaterThan(0.9);
  });

  it('fails when the property fails', () => {
    const tracker = new ErrorTracker();
    expect(() =>
      checkProperty(
        'P-fail',
        fc.property(fc.integer(), (n) => n < 10),
        tracker,
        { seed: 1 },
      ),
    ).toThrow();
  });
});
