import { POOR_GEOMETRY_CROSSING_RAD, type Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { angleOfCutRad, rawTimesArb, truthArb, usableTimes } from '../../test-support/generators';
import { preparedAt } from '../../test-support/noise-free';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { sunAt } from '../sun/sun-at';
import { nextSightAdvice } from './advice';

const D = DEG_TO_RAD;
const params = defaultParameters();

describe('P-10.2: the advised time meets both conditions and no earlier one does (Req 10.2)', () => {
  // Generator: as P-7.3 (truth latitude in [-70°, 70°], 2 to 6 sights over 2 to 9 hours from a
  // start in 2026 to 2029, the Sun within the limits at each), and `now` a time in the hour after
  // the newest sight. Discarded and counted: sets with the Sun outside the limits at a time.
  it('names a grid time at which the Sun is within the limits and has turned by the advice angle, and no earlier grid time does', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-10.2',
      fc.property(
        truthArb(70),
        rawTimesArb(2, 6, 2, 9),
        fc.integer({ min: 0, max: 3_600_000 }),
        (truth, times, afterMs) => {
          fc.pre(usableTimes(truth, times, 0, params));
          const prepared = preparedAt(truth, times, params);
          const newest = Math.max(...times);
          const now = newest + afterMs;
          const advice = nextSightAdvice(truth, prepared, now, params);
          if (!advice.ok) throw new Error(advice.reason);
          const a0 = sunAt(truth, newest, params);
          if (!a0.ok) throw new Error(a0.reason);
          const meets = (k: number): boolean => {
            const s = sunAt(truth, now + k * params.adviceScanStepMs, params);
            if (!s.ok) return false;
            return (
              s.value.apparentAltitudeRad >= params.minSightAltitudeRad &&
              s.value.apparentAltitudeRad <= params.maxSightAltitudeRad &&
              angleOfCutRad(s.value.trueAzimuthRad, a0.value.trueAzimuthRad) >= params.adviceTurnRad
            );
          };
          const last = Math.floor(params.adviceScanHorizonMs / params.adviceScanStepMs);
          if (advice.value.kind === 'wait') {
            const k = advice.value.waitMs / params.adviceScanStepMs;
            expect(Number.isInteger(k)).toBe(true);
            expect(meets(k)).toBe(true);
            for (let j = 1; j < k; j += 1) expect(meets(j), `earlier step ${j}`).toBe(false);
            tracker.record('wait, steps', k, String(last));
          } else {
            for (let j = 1; j <= last; j += 1) expect(meets(j), `step ${j}`).toBe(false);
          }
        },
      ),
      tracker,
      { numRuns: cappedRuns(500) },
    );
  });
});

describe('P-10.7: the rule of thumb, as a counter (Req 10.7)', () => {
  // Reported, not bounded: the share of first sights, over latitudes 60° S to 60° N by 5° and one
  // date in each month, after which waiting FIRST_WAIT_MS gives an Angle of cut of at least 20°.
  it('reports the share of first sights after which two hours give 20°', () => {
    const tracker = new ErrorTracker();
    let sights = 0;
    let good = 0;
    const lon = 0;
    for (let lat = -60; lat <= 60; lat += 5) {
      for (let month = 0; month < 12; month += 1) {
        const place: Position = { latRad: lat * D, lonRad: lon };
        for (let minute = 0; minute < 24 * 60; minute += 30) {
          const t = Date.UTC(2026, month, 15, 0, minute);
          const first = sunAt(place, t, params);
          const later = sunAt(place, t + params.firstWaitMs, params);
          if (!first.ok || !later.ok) continue;
          const inLimits = (h: number) =>
            h >= params.minSightAltitudeRad && h <= params.maxSightAltitudeRad;
          if (!inLimits(first.value.apparentAltitudeRad)) continue;
          sights += 1;
          const cut = angleOfCutRad(first.value.trueAzimuthRad, later.value.trueAzimuthRad);
          if (inLimits(later.value.apparentAltitudeRad) && cut >= POOR_GEOMETRY_CROSSING_RAD)
            good += 1;
        }
      }
    }
    expect(sights).toBeGreaterThan(1000);
    tracker.record(
      'share of first sights with a 20° cut after the wait',
      good / sights,
      'report only',
    );
    // Reported, not bounded: the share is an input to the lead's judgement.
    expect(good).toBeLessThanOrEqual(sights);
    // Printed by the property report in the deep run.
    checkProperty(
      'P-10.7',
      fc.property(fc.constant(0), () => undefined),
      tracker,
      { numRuns: 1 },
    );
  });
});
