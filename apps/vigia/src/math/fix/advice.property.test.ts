// P-7.7 (Req 7.7): the advised directions shrink the 95 % ellipse more than a sighting from the
// same distance along its major axis, and shrink it. The hypothetical Bearings here are built by
// the test with Core, as the advice describes them, and solved by Core.

import {
  BearingModel,
  destinationPosition,
  ellipse95,
  initialAzimuthRad,
  solve,
  type Bearing,
  type Fix,
  type Position,
} from '@alidade/core';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cappedRuns, isDeepRun } from '../../test-support/fast-check-setup';
import { entryOfBearing, incidentOfEntries } from '../../test-support/geometry-fixtures';
import {
  consistentBearings,
  largestCrossingRad,
  uniformInteger,
} from '../../test-support/generators';
import { NOW_UTC_MS, PARAMETERS } from '../../test-support/incident-fixtures';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { assess } from '../assessment/assess';
import { nextSightingAdvice } from './advice';

/** The 95 % area after adding a Bearing from `from` toward the Fix, like the least precise used one. */
function areaAfter(fix: Fix, used: readonly Bearing[], from: Position): number | null {
  const azimuth = initialAzimuthRad(from, fix.position);
  if (!azimuth.ok) return null;
  const hypothetical: Bearing = {
    id: 'test-hypothetical',
    observer: from,
    positionAccuracyM: Math.max(...used.map((b) => b.positionAccuracyM)),
    timeUtcMs: Math.max(...used.map((b) => b.timeUtcMs)),
    azimuthRad: azimuth.value,
    azimuthSigmaRad: Math.max(...used.map((b) => b.azimuthSigmaRad)),
  };
  const after = solve(new BearingModel(), [...used, hypothetical]);
  if (!after.ok) return null;
  const e = ellipse95(after.value.ellipse);
  return e.ok ? Math.PI * e.value.semiMajorM * e.value.semiMinorM : null;
}

function at(fix: Fix, azimuthRad: number, distanceM: number): Position {
  const p = destinationPosition(fix.position, azimuthRad, distanceM);
  if (!p.ok) throw new Error('destination');
  return p.value;
}

describe('P-7.7: the next-sighting advice (Req 7.7)', () => {
  // Generator: `consistentBearings(2 or 3)` (observers 500 m to 15 km from one target, sigmas 0.5°
  // to 3°), sets whose largest crossing angle is under 30° discarded, and Fixes with an
  // elongation under 1.5 discarded (both counted: Req 7.7's domain). Counter (reported, not
  // failing): the cases in which an advised direction gave the smallest area among 36 directions
  // at 10° steps, within 1 %.
  const counter = { cases: 0, best: 0 };
  it('shrinks the area at least as much as a sighting along the major axis, and shrinks it', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-7.7',
      fc.property(
        uniformInteger(2, 3).chain((n) => consistentBearings(n)),
        (set) => {
          fc.pre(largestCrossingRad(set.bearings) >= (30 * Math.PI) / 180);
          const incident = incidentOfEntries(set.bearings.map((b, i) => entryOfBearing(i + 1, b)));
          const a = assess(incident, NOW_UTC_MS, PARAMETERS);
          if (!a.ok) throw new Error('assess');
          fc.pre(a.value.fix?.ok === true);
          const fix = a.value.fix?.ok ? a.value.fix.value : null;
          if (fix === null) throw new Error('no Fix');
          fc.pre(fix.ellipse.semiMajorM / fix.ellipse.semiMinorM >= 1.5);
          const advice = nextSightingAdvice(a.value, PARAMETERS);
          if (!advice.ok || advice.value.kind !== 'fix') throw new Error('no advice with a Fix');
          const used = a.value.used.map((e) => e.sighting.bearing);
          const { distanceM, directionsRad, areaBeforeM2 } = advice.value;
          const advisedAreas = directionsRad.map((d) =>
            areaAfter(fix, used, at(fix, d, distanceM)),
          );
          const mu = fix.ellipse.azimuthRad;
          const majorAreas = [mu, mu + Math.PI].map((d) =>
            areaAfter(fix, used, at(fix, d, distanceM)),
          );
          fc.pre(advisedAreas.every((x) => x !== null) && majorAreas.every((x) => x !== null));
          for (const advised of advisedAreas as number[]) {
            for (const major of majorAreas as number[]) {
              tracker.record('advised / along the axis − 1', advised / major - 1, '≤ 1e-6');
              if (advised > major * (1 + 1e-6))
                throw new Error(`advised ${advised} m² above ${major} m² along the axis`);
            }
            if (advised > areaBeforeM2 * (1 + 1e-6))
              throw new Error(`advised ${advised} m² above ${areaBeforeM2} m² before`);
          }
          counter.cases += 1;
          const all = Array.from({ length: 36 }, (_, k) =>
            areaAfter(fix, used, at(fix, (k * Math.PI) / 18, distanceM)),
          ).filter((x): x is number => x !== null);
          const smallest = Math.min(...all);
          if (Math.min(...(advisedAreas as number[])) <= smallest * 1.01) counter.best += 1;
        },
      ),
      tracker,
      { numRuns: cappedRuns(2000) },
    );
    if (isDeepRun()) {
      console.log(
        `[deep] P-7.7 counter: the advised direction was the best of 36 within 1 % in ${counter.best} of ${counter.cases} cases ` +
          `(${((100 * counter.best) / Math.max(1, counter.cases)).toFixed(1)} %)`,
      );
    }
  });
});
