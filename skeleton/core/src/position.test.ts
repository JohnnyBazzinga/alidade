import { describe, expect, it } from 'vitest';
import { TWO_PI_RAD } from './angle';
import {
  COINCIDENT_DISTANCE_M,
  EARTH_RADIUS_M,
  MAX_SUPPORTED_LAT_RAD,
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  isSupportedPosition,
  type Position,
} from './position';
import { wrappedDifferenceRad } from './test-support/angle-compare';
import { unwrapOk } from './test-support/result-helpers';

const rad = (angleDeg: number): number => (angleDeg * Math.PI) / 180;
const position = (latDeg: number, lonDeg: number): Position => ({
  latRad: rad(latDeg),
  lonRad: rad(lonDeg),
});
const ARCSECOND_RAD = rad(1 / 3600);
const failure = (reason: string) => ({ ok: false, reason });

describe('isSupportedPosition', () => {
  it('accepts the 89° limits and longitude π', () => {
    expect(isSupportedPosition({ latRad: MAX_SUPPORTED_LAT_RAD, lonRad: 0 })).toBe(true);
    expect(isSupportedPosition({ latRad: -MAX_SUPPORTED_LAT_RAD, lonRad: 0 })).toBe(true);
    expect(isSupportedPosition({ latRad: 0, lonRad: Math.PI })).toBe(true);
    expect(isSupportedPosition({ latRad: 0, lonRad: 0 })).toBe(true);
  });

  it('rejects latitudes beyond 89°, longitude -π, longitudes outside (-π, π] and non-finite values', () => {
    expect(isSupportedPosition(position(89.001, 0))).toBe(false);
    expect(isSupportedPosition(position(-89.001, 0))).toBe(false);
    expect(isSupportedPosition(position(90, 0))).toBe(false);
    expect(isSupportedPosition({ latRad: 0, lonRad: -Math.PI })).toBe(false);
    expect(isSupportedPosition({ latRad: 0, lonRad: Math.PI + 0.1 })).toBe(false);
    expect(isSupportedPosition({ latRad: Number.NaN, lonRad: 0 })).toBe(false);
    expect(isSupportedPosition({ latRad: 0, lonRad: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('greatCircleDistanceM', () => {
  it('is R·π/180 for one degree of latitude along a meridian', () => {
    const distanceM = unwrapOk(greatCircleDistanceM(position(0, 0), position(1, 0)));
    expect(distanceM).toBeCloseTo((EARTH_RADIUS_M * Math.PI) / 180, 6);
    // The same value written out: 111.195 km on the mean-radius sphere.
    expect(distanceM).toBeCloseTo(111195.08023, 4);
  });

  it('is R·π/2 for a quarter of the equator', () => {
    const distanceM = unwrapOk(greatCircleDistanceM(position(0, 0), position(0, 90)));
    expect(distanceM).toBeCloseTo((EARTH_RADIUS_M * Math.PI) / 2, 6);
  });

  it('is R·π for antipodal positions on the equator', () => {
    const distanceM = unwrapOk(greatCircleDistanceM(position(0, 0), position(0, 180)));
    expect(distanceM).toBeCloseTo(EARTH_RADIUS_M * Math.PI, 6);
  });

  // Regression: `2·asin(√haversine)` returned 20 015 114.25 m here, 0.19 m short, because it is
  // ill-conditioned near the antipode. The central angle is now `atan2(|cross|, dot)`.
  it('is R·π, to 1e-5 m, for antipodal positions off the equator', () => {
    const result = greatCircleDistanceM(position(10, 0), position(-10, 180));
    expect(Math.abs(unwrapOk(result) - EARTH_RADIUS_M * Math.PI)).toBeLessThan(1e-5);
  });

  it('satisfies the triangle inequality at the antipode, with the middle point on the path', () => {
    // 10°N 0° to 10°S 180° is a pair of antipodes. 50°N 0° lies on the route over the pole.
    const a = position(10, 0);
    const b = position(50, 0);
    const c = position(-10, 180);
    const viaBM = unwrapOk(greatCircleDistanceM(a, b)) + unwrapOk(greatCircleDistanceM(b, c));
    expect(unwrapOk(greatCircleDistanceM(a, c))).toBeLessThanOrEqual(viaBM + 1e-3);
    expect(Math.abs(viaBM - EARTH_RADIUS_M * Math.PI)).toBeLessThan(1e-5);
  });

  it('matches the published Land’s End to John o’ Groats distance', () => {
    // 50°03′59″N 005°42′53″W to 58°38′38″N 003°04′12″W: 968.9 km on a 6371 km sphere
    // (Movable Type Scripts, "Calculate distance, bearing and more between latitude/longitude
    // points"). The reference is rounded to 0.1 km.
    const landsEnd = position(50 + 3 / 60 + 59 / 3600, -(5 + 42 / 60 + 53 / 3600));
    const johnOGroats = position(58 + 38 / 60 + 38 / 3600, -(3 + 4 / 60 + 12 / 3600));
    const distanceM = unwrapOk(greatCircleDistanceM(landsEnd, johnOGroats));
    expect(Math.abs(distanceM - 968_900)).toBeLessThan(100);
  });

  it('is exactly zero from a position to itself', () => {
    const somewhere = position(-33.9, 151.2);
    expect(unwrapOk(greatCircleDistanceM(somewhere, somewhere))).toBe(0);
  });

  it('fails with unsupported_position for either argument', () => {
    const poleAdjacent = position(89.5, 0);
    expect(greatCircleDistanceM(poleAdjacent, position(0, 0))).toStrictEqual(
      failure('unsupported_position'),
    );
    expect(greatCircleDistanceM(position(0, 0), poleAdjacent)).toStrictEqual(
      failure('unsupported_position'),
    );
    expect(greatCircleDistanceM({ latRad: Number.NaN, lonRad: 0 }, position(0, 0))).toStrictEqual(
      failure('unsupported_position'),
    );
    expect(greatCircleDistanceM({ latRad: 0, lonRad: 4 }, position(0, 0))).toStrictEqual(
      failure('unsupported_position'),
    );
  });
});

describe('initialAzimuthRad', () => {
  it('is π/2 due east along the equator, and 0, π and 3π/2 for the other cardinal directions', () => {
    const origin = position(0, 0);
    expect(unwrapOk(initialAzimuthRad(origin, position(0, 0.1)))).toBeCloseTo(Math.PI / 2, 12);
    expect(unwrapOk(initialAzimuthRad(origin, position(0.1, 0)))).toBeCloseTo(0, 12);
    expect(unwrapOk(initialAzimuthRad(origin, position(-0.1, 0)))).toBeCloseTo(Math.PI, 12);
    expect(unwrapOk(initialAzimuthRad(origin, position(0, -0.1)))).toBeCloseTo(
      (3 * Math.PI) / 2,
      12,
    );
  });

  it('returns a value in [0, 2π)', () => {
    const azimuthRad = unwrapOk(initialAzimuthRad(position(10, 10), position(10, 9)));
    expect(azimuthRad).toBeGreaterThanOrEqual(0);
    expect(azimuthRad).toBeLessThan(TWO_PI_RAD);
  });

  it('is north of east when heading east along a parallel at 45°N (great circle bends poleward)', () => {
    // atan2(sin 10° cos 45°, cos 45° sin 45° - sin 45° cos 45° cos 10°) = 86.45997524°.
    const azimuthRad = unwrapOk(initialAzimuthRad(position(45, 0), position(45, 10)));
    expect(azimuthRad).toBeCloseTo(rad(86.45997524264362), 12);
  });

  it('matches the published Land’s End to John o’ Groats initial bearing of 009°07′11″', () => {
    // Movable Type Scripts, same example as the distance test. Rounded to one arcsecond.
    const landsEnd = position(50 + 3 / 60 + 59 / 3600, -(5 + 42 / 60 + 53 / 3600));
    const johnOGroats = position(58 + 38 / 60 + 38 / 3600, -(3 + 4 / 60 + 12 / 3600));
    const azimuthRad = unwrapOk(initialAzimuthRad(landsEnd, johnOGroats));
    expect(Math.abs(azimuthRad - rad(9 + 7 / 60 + 11 / 3600))).toBeLessThan(ARCSECOND_RAD);
  });

  it('fails with coincident_positions below 1e-3 m and succeeds above it', () => {
    const origin = position(20, 30);
    const northOf = (offsetM: number): Position => ({
      latRad: origin.latRad + offsetM / EARTH_RADIUS_M,
      lonRad: origin.lonRad,
    });
    expect(COINCIDENT_DISTANCE_M).toBe(1e-3);
    expect(initialAzimuthRad(origin, origin)).toStrictEqual(failure('coincident_positions'));
    expect(initialAzimuthRad(origin, northOf(5e-4))).toStrictEqual(failure('coincident_positions'));
    expect(unwrapOk(initialAzimuthRad(origin, northOf(2e-3)))).toBeCloseTo(0, 6);
  });

  it('fails with unsupported_position for either argument', () => {
    expect(initialAzimuthRad(position(89.5, 0), position(0, 0))).toStrictEqual(
      failure('unsupported_position'),
    );
    expect(initialAzimuthRad(position(0, 0), { latRad: 0, lonRad: Number.NaN })).toStrictEqual(
      failure('unsupported_position'),
    );
  });
});

describe('destinationPosition', () => {
  it('moves one degree east along the equator', () => {
    const destination = unwrapOk(
      destinationPosition(position(0, 0), Math.PI / 2, (EARTH_RADIUS_M * Math.PI) / 180),
    );
    expect(destination.latRad).toBeCloseTo(0, 12);
    expect(destination.lonRad).toBeCloseTo(rad(1), 12);
  });

  it('moves north along a meridian', () => {
    const destination = unwrapOk(
      destinationPosition(position(10, 20), 0, (EARTH_RADIUS_M * Math.PI) / 180),
    );
    expect(destination.latRad).toBeCloseTo(rad(11), 12);
    expect(destination.lonRad).toBeCloseTo(rad(20), 12);
  });

  it('matches the published destination 124.8 km from 53°19′14″N 001°43′47″W at 096°01′18″', () => {
    // Movable Type Scripts, "Destination point given distance and bearing from start point":
    // 53°11′18″N 000°08′00″E. The reference is rounded to one arcsecond.
    const start = position(53 + 19 / 60 + 14 / 3600, -(1 + 43 / 60 + 47 / 3600));
    const destination = unwrapOk(destinationPosition(start, rad(96 + 1 / 60 + 18 / 3600), 124_800));
    expect(Math.abs(destination.latRad - rad(53 + 11 / 60 + 18 / 3600))).toBeLessThan(
      ARCSECOND_RAD,
    );
    expect(Math.abs(destination.lonRad - rad(8 / 60))).toBeLessThan(ARCSECOND_RAD);
  });

  it('returns a longitude in (-π, π] when heading east across the 180° meridian', () => {
    const destination = unwrapOk(
      destinationPosition(position(0, 179.5), Math.PI / 2, (EARTH_RADIUS_M * Math.PI) / 180),
    );
    expect(destination.lonRad).toBeGreaterThan(-Math.PI);
    expect(destination.lonRad).toBeLessThanOrEqual(Math.PI);
    expect(destination.lonRad).toBeCloseTo(rad(-179.5), 12);
  });

  it('returns a longitude in (-π, π] when heading west across the 180° meridian', () => {
    const destination = unwrapOk(
      destinationPosition(position(0, -179.5), (3 * Math.PI) / 2, (EARTH_RADIUS_M * Math.PI) / 180),
    );
    expect(destination.lonRad).toBeGreaterThan(-Math.PI);
    expect(destination.lonRad).toBeLessThanOrEqual(Math.PI);
    expect(destination.lonRad).toBeCloseTo(rad(179.5), 12);
  });

  it('keeps longitude π as +π, never -π', () => {
    const destination = unwrapOk(
      destinationPosition(position(0, 179), Math.PI / 2, rad(1) * EARTH_RADIUS_M),
    );
    expect(destination.lonRad).toBeGreaterThan(-Math.PI);
    expect(Math.abs(wrappedDifferenceRad(destination.lonRad, Math.PI))).toBeLessThan(1e-12);
  });

  it('returns the start position for a distance of 0', () => {
    const start = position(40, -70);
    const destination = unwrapOk(destinationPosition(start, 1.234, 0));
    expect(destination.latRad).toBeCloseTo(start.latRad, 14);
    expect(destination.lonRad).toBeCloseTo(start.lonRad, 14);
  });

  // The generators of P-2.4 and P-2.5 keep only destinations that are Supported positions. The
  // two cases below are the destinations they drop.
  it('returns a destination beyond 89° as an unsupported position, without failing', () => {
    // 88.9°N plus 50 km north is about 89.35°N.
    const destination = unwrapOk(destinationPosition(position(88.9, 10), 0, 50_000));
    expect(destination.latRad).toBeGreaterThan(MAX_SUPPORTED_LAT_RAD);
    expect(isSupportedPosition(destination)).toBe(false);
  });

  it('passes over a pole: 300 km north from 88.5°N lands near 88.8°N on the opposite meridian', () => {
    const start = position(88.5, 10);
    const distanceM = 300_000;
    const destination = unwrapOk(destinationPosition(start, 0, distanceM));
    const overshootDeg = distanceM / EARTH_RADIUS_M / (Math.PI / 180) - 1.5;
    expect(destination.latRad).toBeCloseTo(rad(90 - overshootDeg), 9);
    expect(Math.abs(wrappedDifferenceRad(destination.lonRad, rad(10 + 180)))).toBeLessThan(1e-9);
    expect(isSupportedPosition(destination)).toBe(true);
    expect(unwrapOk(greatCircleDistanceM(start, destination))).toBeCloseTo(distanceM, 4);
  });

  it('fails with unsupported_position for a start beyond 89°', () => {
    expect(destinationPosition(position(89.5, 0), 0, 1000)).toStrictEqual(
      failure('unsupported_position'),
    );
  });

  it('fails with invalid_number for a non-finite azimuth or distance and for a negative distance', () => {
    const start = position(0, 0);
    expect(destinationPosition(start, Number.NaN, 1000)).toStrictEqual(failure('invalid_number'));
    expect(destinationPosition(start, Number.POSITIVE_INFINITY, 1000)).toStrictEqual(
      failure('invalid_number'),
    );
    expect(destinationPosition(start, 0, Number.NaN)).toStrictEqual(failure('invalid_number'));
    expect(destinationPosition(start, 0, Number.POSITIVE_INFINITY)).toStrictEqual(
      failure('invalid_number'),
    );
    expect(destinationPosition(start, 0, -1)).toStrictEqual(failure('invalid_number'));
  });
});
