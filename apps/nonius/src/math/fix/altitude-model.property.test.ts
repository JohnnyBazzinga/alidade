import {
  initialAzimuthRad,
  projectToLocalPlane,
  unprojectToLocalPlane,
  type Position,
} from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { propertyRuns } from '../../test-support/fast-check-setup';
import { timeArb, truthArb } from '../../test-support/generators';
import { noiseFreeSights, preparedOf } from '../../test-support/noise-free';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationInUse } from '../sight/index-error';
import { EARTH_RADIUS_M } from '../sphere/earth';
import { sunAt } from '../sun/sun-at';
import { createAltitudeModel, observationsOf } from './altitude-model';

const D = DEG_TO_RAD;
const params = defaultParameters();

function must<T>(r: { ok: true; value: T } | { ok: false; reason: string }, what: string): T {
  if (!r.ok) throw new Error(`${what}: ${r.reason}`);
  return r.value;
}

/** The Sun's altitude at a position by the formula of Req 5.2, written out in the test. */
function altitudeOf(position: Position, subsolar: Position): number {
  const s =
    Math.sin(position.latRad) * Math.sin(subsolar.latRad) +
    Math.cos(position.latRad) *
      Math.cos(subsolar.latRad) *
      Math.cos(position.lonRad - subsolar.lonRad);
  return Math.asin(Math.max(-1, Math.min(1, s)));
}

/**
 * Generator for P-5.8 and P-5.9: a candidate position (latitude in [-85°, 85°], any longitude) and
 * a time in 2026 to 2029. Discarded and counted: a pair at which the Sun's apparent altitude is
 * outside [5°, 80°].
 */
const placeAndTime = fc.tuple(truthArb(85), timeArb(2026, 2029));

describe('P-5.8: the partial derivatives of the altitude model (Req 5.8)', () => {
  it('are (sin A, cos A) / R at the centre, within a relative 1e-6', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.8 centre',
      fc.property(placeAndTime, ([place, t]) => {
        const sun = sunAt(place, t, params);
        fc.pre(sun.ok);
        if (!sun.ok) return;
        fc.pre(sun.value.apparentAltitudeRad >= 5 * D && sun.value.apparentAltitudeRad <= 80 * D);
        const prepared = preparedOf(
          noiseFreeSights(place, [t], 0, false, params),
          calibrationInUse(null),
          params,
        );
        const observation = must(observationsOf(prepared, 'independent', 0), 'observations')[0];
        if (observation === undefined) throw new Error('no observation');
        const model = must(createAltitudeModel(place, params), 'model');
        const e = must(model.evaluate(observation, { eastM: 0, northM: 0 }, place), 'evaluate');
        const azimuth = must(initialAzimuthRad(place, observation.subsolar), 'azimuth');
        const east = Math.sin(azimuth) / EARTH_RADIUS_M;
        const north = Math.cos(azimuth) / EARTH_RADIUS_M;
        const errorEast = Math.abs(e.partialEastRadPerM - east) / (1 / EARTH_RADIUS_M);
        const errorNorth = Math.abs(e.partialNorthRadPerM - north) / (1 / EARTH_RADIUS_M);
        tracker.record(
          'partial, relative to 1/R',
          Math.max(errorEast, errorNorth),
          '1e-6',
          `t = ${t}`,
        );
        expect(errorEast).toBeLessThanOrEqual(1e-6);
        expect(errorNorth).toBeLessThanOrEqual(1e-6);
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });

  it('agree with central differences of step 10 m on the Local plane of any origin within 1 000 km', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.8 elsewhere',
      fc.property(
        placeAndTime,
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.double({ min: 0, max: params.planeLimitM * 0.99, noNaN: true }),
        ([place, t], bearing, offsetM) => {
          const sun = sunAt(place, t, params);
          fc.pre(sun.ok);
          if (!sun.ok) return;
          fc.pre(sun.value.apparentAltitudeRad >= 5 * D && sun.value.apparentAltitudeRad <= 80 * D);
          const origin = must(
            unprojectToLocalPlane(place, {
              eastM: offsetM * Math.sin(bearing),
              northM: offsetM * Math.cos(bearing),
            }),
            'origin',
          );
          const candidate = must(projectToLocalPlane(origin, place), 'candidate');
          const prepared = preparedOf(
            noiseFreeSights(place, [t], 0, false, params),
            calibrationInUse(null),
            params,
          );
          const observation = must(observationsOf(prepared, 'independent', 0), 'observations')[0];
          if (observation === undefined) throw new Error('no observation');
          const model = must(createAltitudeModel(origin, params), 'model');
          const e = must(model.evaluate(observation, candidate, origin), 'evaluate');
          const at = (eastM: number, northM: number): number =>
            altitudeOf(
              must(unprojectToLocalPlane(origin, { eastM, northM }), 'point'),
              observation.subsolar,
            );
          const step = 10;
          const refEast =
            (at(candidate.eastM + step, candidate.northM) -
              at(candidate.eastM - step, candidate.northM)) /
            (2 * step);
          const refNorth =
            (at(candidate.eastM, candidate.northM + step) -
              at(candidate.eastM, candidate.northM - step)) /
            (2 * step);
          const within = (a: number, b: number) =>
            Math.abs(a - b) <= Math.max(1e-3 * Math.abs(b), 1e-12);
          const miss = Math.max(
            Math.abs(e.partialEastRadPerM - refEast) / Math.max(1e-3 * Math.abs(refEast), 1e-12),
            Math.abs(e.partialNorthRadPerM - refNorth) / Math.max(1e-3 * Math.abs(refNorth), 1e-12),
          );
          tracker.record(
            'partial against the 10 m difference, in tolerances',
            miss,
            '1',
            `t = ${t}`,
          );
          expect(within(e.partialEastRadPerM, refEast)).toBe(true);
          expect(within(e.partialNorthRadPerM, refNorth)).toBe(true);
        },
      ),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

describe('P-5.9: the residual of a noise-free sight at the truth (Req 5.9)', () => {
  it('is below 1e-9 rad', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-5.9',
      fc.property(placeAndTime, ([place, t]) => {
        const sun = sunAt(place, t, params);
        fc.pre(sun.ok);
        if (!sun.ok) return;
        fc.pre(sun.value.apparentAltitudeRad >= 5 * D && sun.value.apparentAltitudeRad <= 80 * D);
        const prepared = preparedOf(
          noiseFreeSights(place, [t], 0, false, params),
          calibrationInUse(null),
          params,
        );
        const observation = must(observationsOf(prepared, 'independent', 0), 'observations')[0];
        if (observation === undefined) throw new Error('no observation');
        const model = must(createAltitudeModel(place, params), 'model');
        const e = must(model.evaluate(observation, { eastM: 0, northM: 0 }, place), 'evaluate');
        tracker.record('residual, rad', Math.abs(e.residualRad), '1e-9', `t = ${t}`);
        expect(Math.abs(e.residualRad)).toBeLessThan(1e-9);
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});
