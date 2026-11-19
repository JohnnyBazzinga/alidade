import { describe, expect, it } from 'vitest';
import {
  BearingModel,
  COLOCATED_OBSERVERS_M,
  DIVERGING_RESIDUAL_RAD,
  MAX_FIX_RANGE_M,
  MIN_CROSSING_ANGLE_RAD,
  POOR_GEOMETRY_CROSSING_RAD,
} from './bearing-model';
import { projectToLocalPlane, unprojectToLocalPlane, type LocalPoint } from './local-plane';
import type { Fix } from './measurement-model';
import type { Bearing } from './observation';
import {
  EARTH_RADIUS_M,
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  type Position,
} from './position';
import { err } from './result';
import { wrappedDifferenceRad } from './test-support/angle-compare';
import { makeBearing } from './test-support/bearings';
import { centralDifferencePartials } from './test-support/finite-differences';
import { unwrapOk } from './test-support/result-helpers';

const model = new BearingModel();
const rad = (angleDeg: number): number => (angleDeg * Math.PI) / 180;
const position = (latDeg: number, lonDeg: number): Position => ({
  latRad: rad(latDeg),
  lonRad: rad(lonDeg),
});
/** The position at (eastM, northM) on the Local plane of `origin`. */
const at = (origin: Position, eastM: number, northM: number): Position =>
  unwrapOk(unprojectToLocalPlane(origin, { eastM, northM }));
const failure = (reason: string) => ({ ok: false, reason });

describe('BearingModel.validate and idOf', () => {
  it('validate delegates to validateBearing and idOf returns the id', () => {
    const valid = makeBearing({ id: 'obs-1' });
    expect(model.validate(valid)).toStrictEqual({ ok: true, value: undefined });
    expect(model.validate(makeBearing({ id: 'obs-2', azimuthRad: 7 }))).toStrictEqual(
      err('invalid_observation', { field: 'azimuthRad', id: 'obs-2' }),
    );
    expect(model.idOf(valid)).toBe('obs-1');
  });
});

describe('BearingModel.evaluate', () => {
  const origin = position(10, 20);

  it('wraps the residual: measured 0.01 and predicted 2π - 0.01 give +0.02, not about -2π', () => {
    // Req 6.7. A target 100 km away at azimuth 2π - 0.01 from an observer at the origin.
    const observer = position(0, 0);
    const target = unwrapOk(destinationPosition(observer, 2 * Math.PI - 0.01, 100_000));
    const candidate = unwrapOk(projectToLocalPlane(observer, target));
    const observation = makeBearing({ id: 'a', observer, azimuthRad: 0.01 });

    const evaluation = unwrapOk(model.evaluate(observation, candidate, observer));
    expect(Math.abs(evaluation.predictedRad - (2 * Math.PI - 0.01))).toBeLessThan(1e-9);
    expect(evaluation.residualRad).toBeGreaterThan(0);
    expect(Math.abs(evaluation.residualRad - 0.02)).toBeLessThan(1e-12);
  });

  it('gives a negative residual when the measured azimuth is the smaller side of the wrap', () => {
    const observer = position(0, 0);
    const target = unwrapOk(destinationPosition(observer, 0.01, 100_000));
    const candidate = unwrapOk(projectToLocalPlane(observer, target));
    const observation = makeBearing({ id: 'a', observer, azimuthRad: 2 * Math.PI - 0.01 });
    const evaluation = unwrapOk(model.evaluate(observation, candidate, observer));
    expect(Math.abs(evaluation.residualRad - -0.02)).toBeLessThan(1e-12);
  });

  it('predicts the initial azimuth from the observer to the candidate', () => {
    const observer = position(10, 20);
    const candidate: LocalPoint = { eastM: 3000, northM: -4000 };
    const target = at(origin, candidate.eastM, candidate.northM);
    const observation = makeBearing({ id: 'a', observer });
    const evaluation = unwrapOk(model.evaluate(observation, candidate, origin));
    expect(evaluation.predictedRad).toBe(unwrapOk(initialAzimuthRad(observer, target)));
  });

  describe('effective sigma', () => {
    // sqrt(sigmaRad² + (positionSigmaM / rangeM)²) with rangeM floored at 1 m (Req 6.3).
    const observer = origin;
    const sigmaRad = rad(2);
    const observation = makeBearing({
      id: 'a',
      observer,
      azimuthSigmaRad: sigmaRad,
      positionAccuracyM: 100,
    });
    const effectiveSigmaAt = (northM: number): number =>
      unwrapOk(model.evaluate(observation, { eastM: 0, northM }, origin)).effectiveSigmaRad;
    // The range comes from the great-circle distance, which is accurate to about 1e-10 m at
    // these short ranges, so compare to a relative 1e-8 (the sigma moves by 1 in 2e9 per 1e-10 m
    // of range at 2 m).
    const expectSigma = (northM: number, expected: number): void => {
      expect(Math.abs(effectiveSigmaAt(northM) - expected)).toBeLessThan(1e-8 * expected);
    };

    it('combines the azimuth sigma and the position accuracy over the range', () => {
      expectSigma(1000, Math.hypot(sigmaRad, 100 / 1000));
      expectSigma(50_000, Math.hypot(sigmaRad, 100 / 50_000));
    });

    it('floors the range at 1 m', () => {
      expectSigma(2, Math.hypot(sigmaRad, 100 / 2));
      expectSigma(1.01, Math.hypot(sigmaRad, 100 / 1.01));
      expectSigma(0.9, Math.hypot(sigmaRad, 100));
      expectSigma(0.01, Math.hypot(sigmaRad, 100));
    });

    it('is the azimuth sigma alone when the position accuracy is 0', () => {
      const exact = makeBearing({
        id: 'b',
        observer,
        azimuthSigmaRad: sigmaRad,
        positionAccuracyM: 0,
      });
      const evaluation = unwrapOk(model.evaluate(exact, { eastM: 0, northM: 1000 }, origin));
      expect(evaluation.effectiveSigmaRad).toBeCloseTo(sigmaRad, 14);
    });
  });

  describe('failures', () => {
    it('propagates unsupported_position when the candidate unprojects beyond 89°', () => {
      const nearPole = position(88.9, 0);
      const observation = makeBearing({ id: 'a', observer: position(88.9, 1) });
      expect(model.evaluate(observation, { eastM: 0, northM: 20_000 }, nearPole)).toStrictEqual(
        failure('unsupported_position'),
      );
    });

    it('propagates coincident_positions when the candidate is within 1e-3 m of the observer', () => {
      const observation = makeBearing({ id: 'a', observer: origin });
      expect(model.evaluate(observation, { eastM: 0, northM: 5e-4 }, origin)).toStrictEqual(
        failure('coincident_positions'),
      );
      expect(model.evaluate(observation, { eastM: 0, northM: 0 }, origin)).toStrictEqual(
        failure('coincident_positions'),
      );
      expect(model.evaluate(observation, { eastM: 0, northM: 2e-3 }, origin).ok).toBe(true);
    });

    it('fails with unsupported_position for an unsupported origin', () => {
      const observation = makeBearing({ id: 'a', observer: origin });
      expect(model.evaluate(observation, { eastM: 1, northM: 1 }, position(89.5, 0))).toStrictEqual(
        failure('unsupported_position'),
      );
    });

    it('fails with invalid_number for a non-finite candidate', () => {
      const observation = makeBearing({ id: 'a', observer: origin });
      expect(model.evaluate(observation, { eastM: Number.NaN, northM: 0 }, origin)).toStrictEqual(
        failure('invalid_number'),
      );
      expect(
        model.evaluate(observation, { eastM: 0, northM: Number.POSITIVE_INFINITY }, origin),
      ).toStrictEqual(failure('invalid_number'));
    });

    it('fails with invalid_observation, naming the field, for an invalid bearing', () => {
      const invalid = makeBearing({ id: 'a', observer: origin, azimuthRad: Number.NaN });
      expect(model.evaluate(invalid, { eastM: 1000, northM: 1000 }, origin)).toStrictEqual(
        err('invalid_observation', { field: 'azimuthRad', id: 'a' }),
      );
    });
  });

  // Shrunk counterexample of the first P-6.5 run (task 10), kept as an example (testing.md
  // rule 5). The
  // observer is 50 m due north of the target and the origin is 2.7 km away. The true north
  // partial is about 1e-10 rad/m; with longitudes quantised to 8.9e-16 rad the finite
  // difference read exactly 0 and missed the analytic value by more than 1e-10.
  it('matches finite differences for the first P-6.5 counterexample at a 50 m range', () => {
    const target: Position = { latRad: 0, lonRad: 0 };
    const observer: Position = { latRad: 0.00000784805068861308, lonRad: 0 };
    const counterexampleOrigin: Position = {
      latRad: 0.0004179361127959528,
      lonRad: 0.00003589065251841106,
    };
    const candidate = unwrapOk(projectToLocalPlane(counterexampleOrigin, target));
    const observation = makeBearing({
      id: 'a',
      observer,
      azimuthRad: unwrapOk(initialAzimuthRad(observer, target)),
    });
    const analytic = unwrapOk(model.evaluate(observation, candidate, counterexampleOrigin));
    // The counterexample was found with the original 0.1 m step; it is kept at that step, where
    // the quantisation bug showed, and checked at the 1 m step of Req 6.5 as well.
    const numeric = centralDifferencePartials(
      model,
      observation,
      candidate,
      counterexampleOrigin,
      0.1,
    );
    const numericAtRequiredStep = centralDifferencePartials(
      model,
      observation,
      candidate,
      counterexampleOrigin,
      1,
    );
    const agrees = (analyticValue: number, numericValue: number): boolean =>
      Math.abs(analyticValue - numericValue) <= 1e-2 * Math.abs(numericValue) ||
      Math.abs(analyticValue - numericValue) <= 1e-10;
    expect(agrees(analytic.partialEastRadPerM, numeric.partialEastRadPerM)).toBe(true);
    expect(agrees(analytic.partialNorthRadPerM, numeric.partialNorthRadPerM)).toBe(true);
    expect(agrees(analytic.partialEastRadPerM, numericAtRequiredStep.partialEastRadPerM)).toBe(
      true,
    );
    expect(agrees(analytic.partialNorthRadPerM, numericAtRequiredStep.partialNorthRadPerM)).toBe(
      true,
    );
  });

  // Shrunk counterexample of P-6.5 after the 10 m margin and the 1 m step (task 10), kept as an
  // example (testing.md rule 5). The candidate is 0.86 mm from the origin, so the tangent-plane
  // limit of design D16 is used, 10 m inside the -89° limit, with the observer 50 m away. The
  // 60-digit value of the north partial is -9.902e-11 rad/m; the limit returns 4e-14, because
  // it leaves out the meridian convergence across those 0.86 mm. D16 now uses the limit only
  // below 1e-9 m, so this candidate takes the polar chain rule.
  it('matches finite differences 10 m inside the 89° limit, 0.86 mm from the origin', () => {
    const target: Position = { latRad: -1.5533414646648156, lonRad: 3.141592653589793 };
    const observer: Position = { latRad: -1.5533336166141312, lonRad: 3.141592653589793 };
    const marginOrigin: Position = { latRad: -1.5533414645612686, lonRad: -3.1415926486380283 };
    const candidate = unwrapOk(projectToLocalPlane(marginOrigin, target));
    const observation = makeBearing({
      id: 'a',
      observer,
      azimuthRad: unwrapOk(initialAzimuthRad(observer, target)),
    });
    const analytic = unwrapOk(model.evaluate(observation, candidate, marginOrigin));
    const numeric = centralDifferencePartials(model, observation, candidate, marginOrigin, 1);
    const agrees = (analyticValue: number, numericValue: number): boolean =>
      Math.abs(analyticValue - numericValue) <= 1e-2 * Math.abs(numericValue) ||
      Math.abs(analyticValue - numericValue) <= 1e-10;
    expect(agrees(analytic.partialEastRadPerM, numeric.partialEastRadPerM)).toBe(true);
    expect(agrees(analytic.partialNorthRadPerM, numeric.partialNorthRadPerM)).toBe(true);
  });

  // Regression from the stress region of the second D16 review (task 10): a target 57 m inside
  // the -89° limit, the observer 50.6 m due east, the origin 2.5 mm away. With the latitude of
  // destinationPosition computed by asin, whose condition number is 1/cos(lat) ≈ 57 here, the
  // rounding of the unprojected latitude was amplified enough that the east partial missed the
  // 1 m finite difference by 3.7e-10 rad/m. With atan2 the latitude is well-conditioned.
  it('matches finite differences 57 m inside the 89° limit with the observer due east at 50 m', () => {
    const target: Position = { latRad: -1.5533340776319224, lonRad: 1.6850994800520773 };
    const observer: Position = { latRad: -1.5533340758263248, lonRad: 1.685554279291924 };
    const stressOrigin: Position = { latRad: -1.5533340775898965, lonRad: 1.6850994574685683 };
    const candidate = unwrapOk(projectToLocalPlane(stressOrigin, target));
    const observation = makeBearing({
      id: 'a',
      observer,
      azimuthRad: unwrapOk(initialAzimuthRad(observer, target)),
    });
    const analytic = unwrapOk(model.evaluate(observation, candidate, stressOrigin));
    const numeric = centralDifferencePartials(model, observation, candidate, stressOrigin, 1);
    const agrees = (analyticValue: number, numericValue: number): boolean =>
      Math.abs(analyticValue - numericValue) <= 1e-2 * Math.abs(numericValue) ||
      Math.abs(analyticValue - numericValue) <= 1e-10;
    expect(agrees(analytic.partialEastRadPerM, numeric.partialEastRadPerM)).toBe(true);
    expect(agrees(analytic.partialNorthRadPerM, numeric.partialNorthRadPerM)).toBe(true);
  });

  describe('partial derivatives at the origin', () => {
    // Three observers 5 km from a target and 120° apart: the target is exactly their centroid,
    // so the model's own origin is the target and the candidate is at the origin (design D16).
    const target = position(30, 100);
    const observers = [0, 120, 240].map((azimuthDeg) =>
      unwrapOk(destinationPosition(target, rad(azimuthDeg), 5000)),
    );
    const observations = observers.map((observer, index) =>
      makeBearing({
        id: `o${index}`,
        observer,
        azimuthRad: unwrapOk(initialAzimuthRad(observer, target)),
      }),
    );

    it('has the centroid of the three observers at the target', () => {
      const centroid = unwrapOk(model.origin(observations));
      expect(unwrapOk(greatCircleDistanceM(centroid, target))).toBeLessThan(1e-6);
    });

    it('matches central finite differences at a candidate on the origin', () => {
      const origin = unwrapOk(model.origin(observations));
      const candidate = unwrapOk(projectToLocalPlane(origin, target));
      expect(Math.hypot(candidate.eastM, candidate.northM)).toBeLessThan(1e-6);
      for (const observation of observations) {
        const analytic = unwrapOk(model.evaluate(observation, candidate, origin));
        const numeric = centralDifferencePartials(model, observation, candidate, origin, 1);
        // Req 6.5: within a relative 1e-2 or an absolute 1e-10 rad/m of the finite difference.
        const agrees = (analyticValue: number, numericValue: number): boolean =>
          Math.abs(analyticValue - numericValue) <= 1e-2 * Math.abs(numericValue) ||
          Math.abs(analyticValue - numericValue) <= 1e-10;
        expect(agrees(analytic.partialEastRadPerM, numeric.partialEastRadPerM)).toBe(true);
        expect(agrees(analytic.partialNorthRadPerM, numeric.partialNorthRadPerM)).toBe(true);
        // The azimuth changes by 1/range radians per metre across the line of sight and not at
        // all along it, so the gradient has length 1/5000 whichever side the observer is on.
        const gradientRadPerM = Math.hypot(
          analytic.partialEastRadPerM,
          analytic.partialNorthRadPerM,
        );
        expect(Math.abs(gradientRadPerM * 5000 - 1)).toBeLessThan(1e-3);
      }
    });

    it('has the textbook partials for an observer due south of the candidate', () => {
      // Observer 5 km due south, candidate at the origin: azimuth is 0, a move east by dE
      // turns it by dE/5000 rad, and a move north does not change it.
      const origin = target;
      const observer = at(origin, 0, -5000);
      const observation = makeBearing({ id: 'a', observer, azimuthRad: 0 });
      const evaluation = unwrapOk(model.evaluate(observation, { eastM: 0, northM: 0 }, origin));
      expect(evaluation.partialEastRadPerM).toBeCloseTo(1 / 5000, 7);
      expect(Math.abs(evaluation.partialNorthRadPerM)).toBeLessThan(1e-10);
    });
  });
});

// The band that P-6.5 and P-6.6 exclude: a target less than 10 m inside the 89° latitude limit
// (Req 6.5, 6.6). There the model must fail cleanly rather than compute on a position outside the
// Supported region.
describe('BearingModel.evaluate near the 89° limit', () => {
  it('returns unsupported_position, never a NaN, for a candidate that unprojects beyond the limit', () => {
    // The target is 0.5 m inside -89°, so it is Supported. The candidate is 5 m farther south on
    // the Local plane of an origin 2 km north of it: 4.5 m past the limit, far beyond rounding.
    const nearLimit: Position = { latRad: -rad(89) + 0.5 / EARTH_RADIUS_M, lonRad: 0.3 };
    const planeOrigin = unwrapOk(destinationPosition(nearLimit, 0, 2000));
    const observer = unwrapOk(destinationPosition(nearLimit, rad(70), 5000));
    const observation = makeBearing({
      id: 'a',
      observer,
      azimuthRad: unwrapOk(initialAzimuthRad(observer, nearLimit)),
    });
    const atTarget = unwrapOk(projectToLocalPlane(planeOrigin, nearLimit));
    const beyond = { eastM: atTarget.eastM, northM: atTarget.northM - 5 };

    expect(unprojectToLocalPlane(planeOrigin, beyond)).toStrictEqual(
      failure('unsupported_position'),
    );
    expect(model.evaluate(observation, beyond, planeOrigin)).toStrictEqual(
      failure('unsupported_position'),
    );
  });

  it('fails the same way when a 1 m finite-difference step crosses the limit', () => {
    // A target 0.5 m inside -89°, on the Local plane of an origin 2 km due north of it. Plane
    // south is very nearly geographic south here, so a 1 m step south crosses the limit.
    const nearLimit: Position = { latRad: -rad(89) + 0.5 / EARTH_RADIUS_M, lonRad: 0.3 };
    const planeOrigin = unwrapOk(destinationPosition(nearLimit, 0, 2000));
    const stencilObserver = unwrapOk(destinationPosition(nearLimit, rad(70), 5000));
    const stencilObservation = makeBearing({
      id: 'b',
      observer: stencilObserver,
      azimuthRad: unwrapOk(initialAzimuthRad(stencilObserver, nearLimit)),
    });
    const candidate = unwrapOk(projectToLocalPlane(planeOrigin, nearLimit));

    // At the candidate itself the model succeeds: the target is Supported.
    expect(model.evaluate(stencilObservation, candidate, planeOrigin).ok).toBe(true);
    // One step south, past the limit, it fails cleanly; one step north it succeeds.
    const south = { eastM: candidate.eastM, northM: candidate.northM - 1 };
    const north = { eastM: candidate.eastM, northM: candidate.northM + 1 };
    expect(model.evaluate(stencilObservation, south, planeOrigin)).toStrictEqual(
      failure('unsupported_position'),
    );
    expect(model.evaluate(stencilObservation, north, planeOrigin).ok).toBe(true);
  });
});

describe('BearingModel.origin', () => {
  it('is the centroid of the observers', () => {
    const observers = [position(10, 30), position(-10, 30)];
    const centroid = unwrapOk(
      model.origin(observers.map((observer, index) => makeBearing({ id: `o${index}`, observer }))),
    );
    expect(centroid.latRad).toBeCloseTo(0, 12);
    expect(centroid.lonRad).toBeCloseTo(rad(30), 12);
  });

  it('is on the 180° meridian, not at 0°, for observers on both sides of it', () => {
    const centroid = unwrapOk(
      model.origin([
        makeBearing({ id: 'a', observer: position(0, 179) }),
        makeBearing({ id: 'b', observer: position(0, -179) }),
      ]),
    );
    expect(centroid.lonRad).toBeGreaterThan(-Math.PI);
    expect(centroid.lonRad).toBeLessThanOrEqual(Math.PI);
    expect(Math.abs(wrappedDifferenceRad(centroid.lonRad, Math.PI))).toBeLessThan(1e-12);
    expect(centroid.latRad).toBeCloseTo(0, 12);
  });

  it('does not depend on the order of the observers', () => {
    const a = makeBearing({ id: 'a', observer: position(10, 20) });
    const b = makeBearing({ id: 'b', observer: position(11, 22) });
    const c = makeBearing({ id: 'c', observer: position(9, 21) });
    const forward = unwrapOk(model.origin([a, b, c]));
    const reversed = unwrapOk(model.origin([c, b, a]));
    expect(unwrapOk(greatCircleDistanceM(forward, reversed))).toBeLessThan(1e-6);
  });

  it('fails with unsupported_position when the observers cancel out', () => {
    expect(
      model.origin([
        makeBearing({ id: 'a', observer: position(0, 0) }),
        makeBearing({ id: 'b', observer: position(0, 180) }),
      ]),
    ).toStrictEqual(failure('unsupported_position'));
  });

  it('fails with unsupported_position when the centroid is within 1° of a pole', () => {
    expect(
      model.origin([
        makeBearing({ id: 'a', observer: position(88.9, 0) }),
        makeBearing({ id: 'b', observer: position(88.9, 180) }),
      ]),
    ).toStrictEqual(failure('unsupported_position'));
  });
});

describe('BearingModel.startEstimate', () => {
  const origin = position(0, 0);
  const place = (id: string, eastM: number, northM: number, azimuthDeg: number): Bearing =>
    makeBearing({ id, observer: at(origin, eastM, northM), azimuthRad: rad(azimuthDeg) });
  const startOf = (observations: readonly Bearing[]): LocalPoint =>
    unwrapOk(model.startEstimate(observations, origin));

  it('is the intersection of the two lines with the largest crossing angle', () => {
    // a: 5 km south, sighting north (the line E = 0). b: 5 km east, sighting west (the line
    // N = 0). They cross at 90° at the origin. c is 5 km west, sighting 10°; its crossings with
    // a and b are 10° and 80°, and its lines meet theirs elsewhere.
    const start = startOf([
      place('a', 0, -5000, 0),
      place('b', 5000, 0, 270),
      place('c', -5000, 0, 10),
    ]);
    expect(Math.abs(start.eastM)).toBeLessThan(1e-6);
    expect(Math.abs(start.northM)).toBeLessThan(1e-6);
  });

  it('breaks a tie between equal crossing angles by id, whatever the input order', () => {
    // a sights north along E = 0. b (heading east from N = 1000) and c (heading west from
    // N = -1000) both cross it at 90°. The tie goes to the pair (a, b), which meets near
    // (0, 1000); the pair (a, c) would meet near (0, -1000), 2 km away. The lines follow the
    // great circles (design D18), so b's line bends slightly and the meeting point is about
    // 2e-4 m from (0, 1000).
    const a = place('a', 0, -5000, 0);
    const b = place('b', -5000, 1000, 90);
    const c = place('c', 5000, -1000, 270);
    const orders = [
      [a, b, c],
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ];
    for (const order of orders) {
      const start = startOf(order);
      expect(Math.abs(start.eastM)).toBeLessThan(0.01);
      expect(Math.abs(start.northM - 1000)).toBeLessThan(0.01);
    }
  });

  it('fails with singular_geometry for parallel and anti-parallel bearings', () => {
    expect(
      model.startEstimate([place('a', 0, 0, 30), place('b', 3000, 0, 30)], origin),
    ).toStrictEqual(failure('singular_geometry'));
    expect(
      model.startEstimate([place('a', 0, 0, 30), place('b', 3000, 0, 210)], origin),
    ).toStrictEqual(failure('singular_geometry'));
  });

  it('fails with singular_geometry at a 0.4° crossing and succeeds at 0.5°', () => {
    const a = place('a', 0, 0, 0);
    expect(model.startEstimate([a, place('b', 3000, 0, 0.4)], origin)).toStrictEqual(
      failure('singular_geometry'),
    );
    const atLimit = makeBearing({
      id: 'b',
      observer: at(origin, 3000, 0),
      azimuthRad: MIN_CROSSING_ANGLE_RAD,
    });
    const result = unwrapOk(model.startEstimate([a, atLimit], origin));
    expect(Number.isFinite(result.eastM) && Number.isFinite(result.northM)).toBe(true);
    // Two lines 0.5° apart that start 3 km apart meet about 3000 / tan(0.5°) = 344 km away.
    expect(Math.hypot(result.eastM, result.northM)).toBeGreaterThan(300_000);
  });

  it('fails with unsupported_position for an unsupported origin', () => {
    expect(
      model.startEstimate([place('a', 0, -5000, 0), place('b', 5000, 0, 270)], position(89.5, 0)),
    ).toStrictEqual(failure('unsupported_position'));
  });
});

describe('BearingModel.geometryCheck', () => {
  const origin = position(0, 0);
  /** Two observers 1 km apart whose bearings differ by `crossingRad`. */
  const pairWithCrossing = (crossingRad: number): Bearing[] => [
    makeBearing({ id: 'a', observer: at(origin, 0, 0), azimuthRad: 0 }),
    makeBearing({ id: 'b', observer: at(origin, 1000, 0), azimuthRad: crossingRad }),
  ];

  it('fails with singular_geometry below 0.5° and for parallel bearings', () => {
    expect(model.geometryCheck(pairWithCrossing(rad(0.49)))).toStrictEqual(
      failure('singular_geometry'),
    );
    expect(model.geometryCheck(pairWithCrossing(0))).toStrictEqual(failure('singular_geometry'));
    expect(model.geometryCheck(pairWithCrossing(Math.PI))).toStrictEqual(
      failure('singular_geometry'),
    );
  });

  it('warns poor_geometry from 0.5° up to, but not including, 20°', () => {
    const poor = { ok: true, value: { warnings: ['poor_geometry'] } };
    expect(model.geometryCheck(pairWithCrossing(MIN_CROSSING_ANGLE_RAD))).toStrictEqual(poor);
    expect(model.geometryCheck(pairWithCrossing(rad(19.9)))).toStrictEqual(poor);
  });

  it('has no warning from 20° up', () => {
    const good = { ok: true, value: { warnings: [] } };
    expect(model.geometryCheck(pairWithCrossing(POOR_GEOMETRY_CROSSING_RAD))).toStrictEqual(good);
    expect(model.geometryCheck(pairWithCrossing(rad(90)))).toStrictEqual(good);
  });

  it('measures the crossing angle between the lines, not between the azimuths', () => {
    // 170° apart is the same pair of lines as 10° apart: poor geometry.
    expect(model.geometryCheck(pairWithCrossing(rad(170)))).toStrictEqual({
      ok: true,
      value: { warnings: ['poor_geometry'] },
    });
    // Across the 0 / 360 boundary: 350° and 10° are 20° apart.
    const acrossZero = [
      makeBearing({ id: 'a', observer: at(origin, 0, 0), azimuthRad: rad(350) }),
      makeBearing({ id: 'b', observer: at(origin, 1000, 0), azimuthRad: rad(10) }),
    ];
    expect(model.geometryCheck(acrossZero).ok).toBe(true);
  });

  it('uses the largest crossing angle over all pairs', () => {
    const three = [
      makeBearing({ id: 'a', observer: at(origin, 0, 0), azimuthRad: 0 }),
      makeBearing({ id: 'b', observer: at(origin, 1000, 0), azimuthRad: rad(1) }),
      makeBearing({ id: 'c', observer: at(origin, 2000, 0), azimuthRad: rad(45) }),
    ];
    expect(model.geometryCheck(three)).toStrictEqual({ ok: true, value: { warnings: [] } });
  });

  describe('colocated observers', () => {
    const colocatedPair = (separationM: number, secondAzimuthRad: number): Bearing[] => [
      makeBearing({ id: 'a', observer: at(origin, 0, 0), azimuthRad: 0 }),
      makeBearing({ id: 'b', observer: at(origin, separationM, 0), azimuthRad: secondAzimuthRad }),
    ];

    it('fails with colocated_observers when every pair is under 1 m apart', () => {
      expect(COLOCATED_OBSERVERS_M).toBe(1);
      expect(model.geometryCheck(colocatedPair(0.5, rad(90)))).toStrictEqual(
        failure('colocated_observers'),
      );
      expect(model.geometryCheck(colocatedPair(0.999, rad(90)))).toStrictEqual(
        failure('colocated_observers'),
      );
      expect(model.geometryCheck(colocatedPair(1.001, rad(90))).ok).toBe(true);
    });

    it('takes precedence over singular_geometry', () => {
      // Colocated and parallel: both apply, and colocated_observers is the one reported.
      expect(model.geometryCheck(colocatedPair(0.5, 0))).toStrictEqual(
        failure('colocated_observers'),
      );
    });

    it('does not apply when only some of the observers are colocated', () => {
      const three = [
        makeBearing({ id: 'a', observer: at(origin, 0, 0), azimuthRad: 0 }),
        makeBearing({ id: 'b', observer: at(origin, 0.5, 0), azimuthRad: rad(90) }),
        makeBearing({ id: 'c', observer: at(origin, 10, 0), azimuthRad: rad(45) }),
      ];
      expect(model.geometryCheck(three).ok).toBe(true);
    });
  });
});

describe('BearingModel.postSolveCheck', () => {
  const origin = position(0, 0);
  const observations = [
    makeBearing({ id: 'a', observer: at(origin, -5000, 0) }),
    makeBearing({ id: 'b', observer: at(origin, 5000, 0) }),
  ];
  const fixOf = (residualsRad: readonly number[], fixPosition: Position = origin): Fix => ({
    position: fixPosition,
    covariance: { varEastM2: 1, varNorthM2: 1, covEastNorthM2: 0 },
    ellipse: { semiMajorM: 1, semiMinorM: 1, azimuthRad: 0 },
    residuals: observations.map((observation, index) => ({
      id: observation.id,
      residualRad: residualsRad[index] ?? 0,
      normalisedResidual: 0,
      studentisedResidual: 0,
    })),
    iterations: 3,
    warnings: [],
    excludedIds: [],
  });

  it('accepts a fix near the origin with small residuals, with no warnings', () => {
    expect(model.postSolveCheck(fixOf([0.01, -0.02]), origin, observations)).toStrictEqual({
      ok: true,
      value: { warnings: [] },
    });
  });

  it('fails with diverging_bearings when a residual exceeds 90° in magnitude', () => {
    expect(DIVERGING_RESIDUAL_RAD).toBe(Math.PI / 2);
    expect(model.postSolveCheck(fixOf([0, rad(91)]), origin, observations)).toStrictEqual(
      failure('diverging_bearings'),
    );
    expect(model.postSolveCheck(fixOf([-rad(120), 0]), origin, observations)).toStrictEqual(
      failure('diverging_bearings'),
    );
  });

  it('accepts a residual of exactly 90°, which does not exceed it', () => {
    expect(model.postSolveCheck(fixOf([Math.PI / 2, 0]), origin, observations).ok).toBe(true);
  });

  it('fails with out_of_range for a fix more than 500 km from the origin it is given', () => {
    expect(MAX_FIX_RANGE_M).toBe(500_000);
    const far = at(origin, 0, 0);
    const farFix = unwrapOk(destinationPosition(far, rad(90), 501_000));
    const nearFix = unwrapOk(destinationPosition(far, rad(90), 499_000));
    expect(model.postSolveCheck(fixOf([0, 0], farFix), origin, observations)).toStrictEqual(
      failure('out_of_range'),
    );
    expect(model.postSolveCheck(fixOf([0, 0], nearFix), origin, observations).ok).toBe(true);
  });

  it('measures the range from the origin argument, not from anywhere else', () => {
    const fixPosition = unwrapOk(destinationPosition(origin, rad(90), 600_000));
    expect(model.postSolveCheck(fixOf([0, 0], fixPosition), origin, observations)).toStrictEqual(
      failure('out_of_range'),
    );
    // The same fix, checked against an origin 100 km from it, is in range.
    const nearbyOrigin = unwrapOk(destinationPosition(fixPosition, rad(270), 100_000));
    expect(model.postSolveCheck(fixOf([0, 0], fixPosition), nearbyOrigin, observations).ok).toBe(
      true,
    );
  });

  it('reports diverging_bearings before out_of_range when both apply', () => {
    const farFix = unwrapOk(destinationPosition(origin, rad(90), 600_000));
    expect(model.postSolveCheck(fixOf([rad(100), 0], farFix), origin, observations)).toStrictEqual(
      failure('diverging_bearings'),
    );
  });

  it('fails with invalid_observation when an observation has no residual in the fix', () => {
    const fix = { ...fixOf([0, 0]), residuals: [] };
    expect(model.postSolveCheck(fix, origin, observations)).toStrictEqual(
      err('invalid_observation', { field: 'residuals', id: 'a' }),
    );
  });

  it('fails with invalid_number for a non-finite residual', () => {
    expect(model.postSolveCheck(fixOf([Number.NaN, 0]), origin, observations)).toStrictEqual(
      failure('invalid_number'),
    );
  });
});

describe('BearingModel totality (design D17)', () => {
  const origin = position(0, 0);
  const one = [makeBearing({ id: 'a' })];
  const fix: Fix = {
    position: origin,
    covariance: { varEastM2: 1, varNorthM2: 1, covEastNorthM2: 0 },
    ellipse: { semiMajorM: 1, semiMinorM: 1, azimuthRad: 0 },
    residuals: [],
    iterations: 1,
    warnings: [],
    excludedIds: [],
  };

  it.each([
    ['an empty array', [] as Bearing[]],
    ['a one-element array', one],
  ])('every observation-set method returns insufficient_observations for %s', (_name, set) => {
    const insufficient = failure('insufficient_observations');
    expect(model.origin(set)).toStrictEqual(insufficient);
    expect(model.startEstimate(set, origin)).toStrictEqual(insufficient);
    expect(model.geometryCheck(set)).toStrictEqual(insufficient);
    expect(model.postSolveCheck(fix, origin, set)).toStrictEqual(insufficient);
  });

  it('every observation-set method returns invalid_observation for an invalid bearing', () => {
    const set = [makeBearing({ id: 'a' }), makeBearing({ id: 'b', azimuthRad: Number.NaN })];
    const invalid = err('invalid_observation', { field: 'azimuthRad', id: 'b' });
    expect(model.origin(set)).toStrictEqual(invalid);
    expect(model.startEstimate(set, origin)).toStrictEqual(invalid);
    expect(model.geometryCheck(set)).toStrictEqual(invalid);
    expect(model.postSolveCheck(fix, origin, set)).toStrictEqual(invalid);
  });
});

describe('the bearing model on the Earth model', () => {
  it('uses the sphere of radius 6 371 008.8 m for its partials', () => {
    // At the tangent-plane limit, ∂lat/∂north is 1/R: an observer due south at range r, with
    // the candidate on the origin, sees its azimuth change by (1/r) rad per metre east.
    expect(EARTH_RADIUS_M).toBe(6_371_008.8);
  });
});
