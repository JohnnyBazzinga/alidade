import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { wrapPiN } from '../../test-support/angles';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD, HOURS_TO_DEG } from '../degrees';
import { defaultParameters } from '../parameters';
import { sunPosition } from './sun-wrapper';

const params = defaultParameters();
const D = DEG_TO_RAD;
const HOUR_MS = 3_600_000;

/**
 * Generator: UTC milliseconds uniform in [2000-01-01, 2050-01-01) (the wrapper's range), whole
 * milliseconds. Nothing excluded.
 */
const timeArb = fc.integer({
  min: params.sunModelStartUtcMs,
  max: params.sunModelEndUtcMs - 1,
});

function position(t: number): { sunDeclinationRad: number; ghaRad: number } {
  const r = sunPosition(t, params);
  if (!r.ok) throw new Error(`sunPosition failed at ${t}: ${r.reason}`);
  return r.value;
}

describe('P-3.6: declination bound, GHA range, equation of time (Req 3.6)', () => {
  it('holds over the whole range of the wrapper', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.6',
      fc.property(timeArb, (t) => {
        const { sunDeclinationRad, ghaRad } = position(t);
        const hoursOfDay = (((t % 86_400_000) + 86_400_000) % 86_400_000) / HOUR_MS;
        const eotRad = Math.abs(wrapPiN(ghaRad - (HOURS_TO_DEG * hoursOfDay - 180) * D));
        tracker.record(
          '|declination| over 23.45°, rad',
          Math.max(0, Math.abs(sunDeclinationRad) - 23.45 * D),
          '0',
          `t = ${t}`,
        );
        tracker.record(
          'equation of time over 4.5°, rad',
          Math.max(0, eotRad - 4.5 * D),
          '0',
          `t = ${t}`,
        );
        expect(Math.abs(sunDeclinationRad)).toBeLessThanOrEqual(23.45 * D);
        expect(ghaRad).toBeGreaterThanOrEqual(0);
        expect(ghaRad).toBeLessThan(2 * Math.PI);
        expect(eotRad).toBeLessThanOrEqual(4.5 * D);
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
  });
});

describe('P-3.7: rates (Req 3.7)', () => {
  // Generator: t as above and a duration uniform in [1 min, 6 h] whole milliseconds; a pair
  // whose end lies outside the range is discarded (counted).
  it('advances the GHA by 15° per hour within 0.006° per hour, and the declination by at most 0.017° per hour', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.7',
      fc.property(timeArb, fc.integer({ min: 60_000, max: 6 * HOUR_MS }), (t, duration) => {
        fc.pre(t + duration < params.sunModelEndUtcMs);
        const a = position(t);
        const b = position(t + duration);
        const hours = duration / HOUR_MS;
        const ghaErrPerHour =
          Math.abs(wrapPiN(b.ghaRad - a.ghaRad - HOURS_TO_DEG * D * hours)) / hours;
        const decRatePerHour = Math.abs(b.sunDeclinationRad - a.sunDeclinationRad) / hours;
        tracker.record(
          'GHA rate error, rad per hour',
          ghaErrPerHour,
          `${0.006 * D}`,
          `t = ${t}, d = ${duration}`,
        );
        tracker.record(
          'declination rate, rad per hour',
          decRatePerHour,
          `${0.017 * D}`,
          `t = ${t}, d = ${duration}`,
        );
        expect(ghaErrPerHour).toBeLessThanOrEqual(0.006 * D);
        expect(decRatePerHour).toBeLessThanOrEqual(0.017 * D);
      }),
      tracker,
      { numRuns: cappedRuns(20_000) },
    );
  });

  it('has a test of its own for the discard at the end of the range', () => {
    const last = params.sunModelEndUtcMs - 1;
    expect(sunPosition(last, params).ok).toBe(true);
    expect(sunPosition(last + 60_000, params).ok).toBe(false);
  });
});
