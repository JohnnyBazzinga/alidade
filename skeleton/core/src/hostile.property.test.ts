import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as core from './index';
import type { Reason } from './result';
import {
  hostileCovariance,
  hostileEllipse,
  hostileFix,
  hostileFixForObservations,
  hostileBearing,
  hostileLocalPoint,
  hostileNumber,
  hostileObservationSet,
  hostilePosition,
  hostileSolverOptions,
  hostileWire,
  validBearing,
} from './test-support/generators';
import { createStubModel, type StubObservation } from './test-support/stub-model';
import { ok } from './result';

// Property P-9.8: no exported function throws, and none returns NaN or an infinity, for any
// input that passes type checking. Validates Requirements 9.8 and 1.9.
//
// What counts as type-correct here: any double for a `number` (NaN, ±Infinity, ±0, subnormals,
// ±MAX_VALUE and the values just past every limit of the package), any string for a `string`
// (empty, lone surrogates), arrays of any length, and anything at all for `parseBearing`'s
// `unknown` (boxed values, maps, sets, bigints, dates, typed arrays, null-prototype objects,
// sparse arrays, cycles). Not covered, because the static type would be a lie: sparse arrays
// passed where `Bearing[]` is expected (their holes read as undefined), objects whose property
// reads throw (getters, Proxies), and values cast with `as` to a type they do not have.

/** The twelve failure reasons of Req 11.4: a failure must carry one of them. */
const REASONS: readonly Reason[] = [
  'invalid_number',
  'undefined_mean',
  'coincident_positions',
  'unsupported_position',
  'invalid_observation',
  'unsupported_format',
  'not_converged',
  'singular_geometry',
  'insufficient_observations',
  'colocated_observers',
  'diverging_bearings',
  'out_of_range',
];

/** True when every number reachable from `value` is finite. */
function allNumbersFinite(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || value === null) return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((entry) => allNumbersFinite(entry, seen));
}

/**
 * Calls `call`, which must not throw, and checks what it returns: a Result is either a failure
 * with a reason from the closed set, or a success whose numbers are all finite.
 */
function expectTotal(call: () => unknown): void {
  let returned: unknown;
  expect(() => {
    returned = call();
  }).not.toThrow();
  if (typeof returned === 'object' && returned !== null && 'ok' in returned) {
    const result = returned as { ok: boolean; reason?: unknown; value?: unknown };
    if (result.ok) {
      expect(allNumbersFinite(result.value)).toBe(true);
    } else {
      expect(REASONS).toContain(result.reason);
    }
  } else {
    expect(allNumbersFinite(returned)).toBe(true);
  }
}

const model = new core.BearingModel();

describe('P-9.8: every exported function is total', () => {
  it('covers every function the package exports', () => {
    const exportedValues = Object.keys(core).sort();
    expect(exportedValues).toStrictEqual(
      [
        'BearingModel',
        'CONFIDENCE_95_SCALE',
        'angularDifference',
        'circularMean',
        'degToRad',
        'destinationPosition',
        'ellipse95',
        'ellipseFromCovariance',
        'greatCircleDistanceM',
        'initialAzimuthRad',
        'isSupportedPosition',
        'parseBearing',
        'projectToLocalPlane',
        'radToDeg',
        'serialiseBearing',
        'solve',
        'unprojectToLocalPlane',
        'validateBearing',
        'wrapPi',
        'wrapTwoPi',
      ].sort(),
    );
    expect(Number.isFinite(core.CONFIDENCE_95_SCALE)).toBe(true);
  });

  it('angle functions: wrapTwoPi, wrapPi, angularDifference, degToRad, radToDeg, circularMean', () => {
    fc.assert(
      fc.property(
        hostileNumber,
        hostileNumber,
        fc.array(hostileNumber, { maxLength: 8 }),
        (a, b, list) => {
          expectTotal(() => core.wrapTwoPi(a));
          expectTotal(() => core.wrapPi(a));
          expectTotal(() => core.angularDifference(a, b));
          expectTotal(() => core.degToRad(a));
          expectTotal(() => core.radToDeg(a));
          expectTotal(() => core.circularMean(list));
        },
      ),
    );
  });

  it('position functions: isSupportedPosition, greatCircleDistanceM, initialAzimuthRad, destinationPosition', () => {
    fc.assert(
      fc.property(
        hostilePosition,
        hostilePosition,
        hostileNumber,
        hostileNumber,
        (a, b, azimuthRad, distanceM) => {
          expectTotal(() => core.isSupportedPosition(a));
          expect(typeof core.isSupportedPosition(a)).toBe('boolean');
          expectTotal(() => core.greatCircleDistanceM(a, b));
          expectTotal(() => core.initialAzimuthRad(a, b));
          expectTotal(() => core.destinationPosition(a, azimuthRad, distanceM));
        },
      ),
    );
  });

  it('local plane functions: projectToLocalPlane, unprojectToLocalPlane', () => {
    fc.assert(
      fc.property(
        hostilePosition,
        hostilePosition,
        hostileLocalPoint,
        (origin, position, point) => {
          expectTotal(() => core.projectToLocalPlane(origin, position));
          expectTotal(() => core.unprojectToLocalPlane(origin, point));
        },
      ),
    );
  });

  it('observation functions: validateBearing, serialiseBearing, parseBearing', () => {
    fc.assert(
      fc.property(hostileBearing, hostileWire, (bearing, wire) => {
        expectTotal(() => core.validateBearing(bearing));
        expectTotal(() => core.serialiseBearing(bearing));
        expectTotal(() => core.parseBearing(wire));
      }),
    );
  });

  it('ellipse functions: ellipseFromCovariance, ellipse95', () => {
    fc.assert(
      fc.property(hostileCovariance, hostileEllipse, (covariance, ellipse) => {
        expectTotal(() => core.ellipseFromCovariance(covariance));
        expectTotal(() => core.ellipse95(ellipse));
      }),
    );
  });

  it('BearingModel methods called directly: validate, idOf, origin, startEstimate, geometryCheck', () => {
    fc.assert(
      fc.property(
        hostileBearing,
        hostileObservationSet,
        hostilePosition,
        (bearing, set, origin) => {
          expectTotal(() => model.validate(bearing));
          expect(typeof model.idOf(bearing)).toBe('string');
          expectTotal(() => model.origin(set));
          expectTotal(() => model.startEstimate(set, origin));
          expectTotal(() => model.geometryCheck(set));
        },
      ),
    );
  });

  it('BearingModel.evaluate called directly', () => {
    fc.assert(
      fc.property(
        hostileBearing,
        hostileLocalPoint,
        hostilePosition,
        (bearing, candidate, origin) => {
          expectTotal(() => model.evaluate(bearing, candidate, origin));
        },
      ),
    );
  });

  it('BearingModel.evaluate at plausible candidates, around a valid origin', () => {
    // Candidates up to 300 km from a Supported origin reach the partial-derivative code paths
    // that a hostile candidate (mostly rejected at once) does not.
    fc.assert(
      fc.property(
        validBearing,
        fc.record({
          eastM: fc.double({ min: -3e5, max: 3e5, noNaN: true }),
          northM: fc.double({ min: -3e5, max: 3e5, noNaN: true }),
        }),
        hostilePosition,
        (bearing, candidate, origin) => {
          expectTotal(() => model.evaluate(bearing, candidate, origin));
          expectTotal(() => model.evaluate(bearing, candidate, bearing.observer));
        },
      ),
    );
  });

  it('BearingModel.postSolveCheck called directly', () => {
    fc.assert(
      fc.property(
        hostileFix,
        hostileFixForObservations,
        hostilePosition,
        hostileObservationSet,
        (fix, matched, origin, set) => {
          expectTotal(() => model.postSolveCheck(fix, origin, set));
          expectTotal(() => model.postSolveCheck(matched.fix, origin, matched.observations));
        },
      ),
    );
  });

  it('solve with a model that returns hostile numbers', () => {
    // A MeasurementModel is an input of solve too. This stub returns hostile numbers wherever it
    // can: its origin, its start, its observations' fields and any field of every Evaluation.
    const hostileStubObservation: fc.Arbitrary<StubObservation> = fc.record({
      id: fc.string({ maxLength: 4 }),
      partialEastRadPerM: fc.oneof(hostileNumber, fc.constant(1e-3)),
      partialNorthRadPerM: fc.oneof(hostileNumber, fc.constant(1e-3)),
      measuredRad: fc.oneof(hostileNumber, fc.constant(0.1)),
      sigmaRad: fc.oneof(hostileNumber, fc.constant(0.01)),
    });
    const evaluationOverride = fc.record(
      {
        predictedRad: hostileNumber,
        residualRad: hostileNumber,
        effectiveSigmaRad: hostileNumber,
        partialEastRadPerM: hostileNumber,
        partialNorthRadPerM: hostileNumber,
      },
      { requiredKeys: [] },
    );
    fc.assert(
      fc.property(
        hostilePosition,
        hostileLocalPoint,
        fc.uniqueArray(hostileStubObservation, { maxLength: 6, selector: (entry) => entry.id }),
        fc.option(evaluationOverride, { nil: undefined }),
        hostileSolverOptions,
        (origin, start, observations, override, options) => {
          const stub = createStubModel({
            origin: ok(origin),
            start: ok(start),
            ...(override === undefined
              ? {}
              : {
                  overrideEvaluation: (_observation, _candidate, normal) => ({
                    ...normal,
                    ...override,
                  }),
                }),
          });
          expectTotal(() => core.solve(stub, observations, options));
        },
      ),
    );
  });

  it('solve', () => {
    fc.assert(
      fc.property(hostileObservationSet, hostileSolverOptions, (set, options) => {
        expectTotal(() => core.solve(model, set, options));
        expectTotal(() => core.solve(model, set));
        expectTotal(() => core.solve(model, set, { outlierRejection: true }));
      }),
      { numRuns: 500 },
    );
  });
});
