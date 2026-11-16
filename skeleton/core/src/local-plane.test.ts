import { describe, expect, it } from 'vitest';
import { LOCAL_PLANE_COLLAPSE_M, projectToLocalPlane, unprojectToLocalPlane } from './local-plane';
import {
  COINCIDENT_DISTANCE_M,
  EARTH_RADIUS_M,
  greatCircleDistanceM,
  type Position,
} from './position';
import { unwrapOk } from './test-support/result-helpers';

const rad = (angleDeg: number): number => (angleDeg * Math.PI) / 180;
const position = (latDeg: number, lonDeg: number): Position => ({
  latRad: rad(latDeg),
  lonRad: rad(lonDeg),
});
const failure = (reason: string) => ({ ok: false, reason });

describe('projectToLocalPlane', () => {
  const equatorOrigin = position(0, 0);

  it('projects a point 1 km due east of an equatorial origin to (1000, 0)', () => {
    const dueEast: Position = { latRad: 0, lonRad: 1000 / EARTH_RADIUS_M };
    const point = unwrapOk(projectToLocalPlane(equatorOrigin, dueEast));
    expect(point.eastM).toBeCloseTo(1000, 6);
    expect(point.northM).toBeCloseTo(0, 6);
  });

  it('projects a point 1 km due north to (0, 1000)', () => {
    const dueNorth: Position = { latRad: 1000 / EARTH_RADIUS_M, lonRad: 0 };
    const point = unwrapOk(projectToLocalPlane(equatorOrigin, dueNorth));
    expect(point.eastM).toBeCloseTo(0, 6);
    expect(point.northM).toBeCloseTo(1000, 6);
  });

  it('projects points to the west and south with negative components', () => {
    const point = unwrapOk(
      projectToLocalPlane(equatorOrigin, {
        latRad: -2000 / EARTH_RADIUS_M,
        lonRad: -3000 / EARTH_RADIUS_M,
      }),
    );
    expect(point.eastM).toBeLessThan(0);
    expect(point.northM).toBeLessThan(0);
    expect(Math.hypot(point.eastM, point.northM)).toBeCloseTo(Math.hypot(2000, 3000), 2);
  });

  it('uses a collapse threshold of 1e-9 m, separate from the 1e-3 m coincidence threshold', () => {
    expect(LOCAL_PLANE_COLLAPSE_M).toBe(1e-9);
    expect(COINCIDENT_DISTANCE_M).toBe(1e-3);
  });

  // Req 3.4: the origin, and any position less than 1e-9 m from it, projects to (0, 0).
  it('projects the origin, and a position 1e-10 m from it, to (0, 0)', () => {
    const origin = position(35, 120);
    const nearby: Position = {
      latRad: origin.latRad + 1e-10 / EARTH_RADIUS_M,
      lonRad: origin.lonRad,
    };
    expect(projectToLocalPlane(origin, origin)).toStrictEqual({
      ok: true,
      value: { eastM: 0, northM: 0 },
    });
    expect(projectToLocalPlane(origin, nearby)).toStrictEqual({
      ok: true,
      value: { eastM: 0, northM: 0 },
    });
  });

  // Between 1e-9 m and 1e-3 m the projection must not fail with coincident_positions, which is
  // the failure of the public initialAzimuthRad, and must satisfy Req 3.3 and 3.5.
  it.each([1e-6, 5e-4, 9e-4])(
    'projects a position %s m from the origin without failing, and round-trips it',
    (offsetM) => {
      const origin = position(35, 120);
      const nearby: Position = {
        latRad: origin.latRad + offsetM / EARTH_RADIUS_M,
        lonRad: origin.lonRad,
      };
      const point = unwrapOk(projectToLocalPlane(origin, nearby));
      // Req 3.5: the length of the vector equals the distance within 1e-6 m.
      const distanceM = unwrapOk(greatCircleDistanceM(origin, nearby));
      expect(Math.abs(Math.hypot(point.eastM, point.northM) - distanceM)).toBeLessThan(1e-6);
      // Due north, so the vector points north.
      expect(point.northM).toBeCloseTo(offsetM, 8);
      expect(Math.abs(point.eastM)).toBeLessThan(1e-8);
      // Req 3.3: back to the original within 1e-4 m.
      const returned = unwrapOk(unprojectToLocalPlane(origin, point));
      expect(unwrapOk(greatCircleDistanceM(returned, nearby))).toBeLessThan(1e-4);
    },
  );

  // Shrunk counterexample from the first run of P-3.5, kept as an example (testing.md rule 5).
  // Under the old 1e-3 m collapse it projected to (0, 0), 1e-6 m short of its distance.
  it('keeps the length of the vector equal to the distance for the P-3.5 counterexample', () => {
    const origin = position(0, 0);
    const nearby: Position = { latRad: 1.5696101377226161e-13, lonRad: 0 };
    const point = unwrapOk(projectToLocalPlane(origin, nearby));
    const distanceM = unwrapOk(greatCircleDistanceM(origin, nearby));
    expect(distanceM).toBeCloseTo(1e-6, 12);
    expect(Math.abs(Math.hypot(point.eastM, point.northM) - distanceM)).toBeLessThan(1e-6);
    expect(point.northM).toBeCloseTo(1e-6, 12);
  });

  it('fails with unsupported_position for an unsupported origin or position', () => {
    expect(projectToLocalPlane(position(89.5, 0), equatorOrigin)).toStrictEqual(
      failure('unsupported_position'),
    );
    expect(projectToLocalPlane(equatorOrigin, { latRad: Number.NaN, lonRad: 0 })).toStrictEqual(
      failure('unsupported_position'),
    );
  });
});

describe('unprojectToLocalPlane', () => {
  const equatorOrigin = position(0, 0);

  it('converts 1 km east of an equatorial origin to a longitude of 1000/R', () => {
    const result = unwrapOk(unprojectToLocalPlane(equatorOrigin, { eastM: 1000, northM: 0 }));
    expect(result.latRad).toBeCloseTo(0, 12);
    expect(result.lonRad).toBeCloseTo(1000 / EARTH_RADIUS_M, 12);
  });

  it('converts 1 km north to a latitude of 1000/R', () => {
    const result = unwrapOk(unprojectToLocalPlane(equatorOrigin, { eastM: 0, northM: 1000 }));
    expect(result.latRad).toBeCloseTo(1000 / EARTH_RADIUS_M, 12);
    expect(result.lonRad).toBeCloseTo(0, 12);
  });

  it('returns the origin itself for a vector shorter than 1e-9 m', () => {
    const origin = position(-20, 80);
    expect(unprojectToLocalPlane(origin, { eastM: 0, northM: 0 })).toStrictEqual({
      ok: true,
      value: origin,
    });
    expect(unprojectToLocalPlane(origin, { eastM: 4e-10, northM: -4e-10 })).toStrictEqual({
      ok: true,
      value: origin,
    });
  });

  it('does not return the origin for a vector of 2e-9 m or 1e-6 m', () => {
    const origin = position(-20, 80);
    for (const lengthM of [2e-9, 1e-6]) {
      const returned = unwrapOk(unprojectToLocalPlane(origin, { eastM: 0, northM: lengthM }));
      expect(returned).not.toStrictEqual(origin);
      expect(unwrapOk(greatCircleDistanceM(origin, returned))).toBeCloseTo(lengthM, 9);
    }
  });

  it('fails with unsupported_position when the point lies within 1° of a pole', () => {
    // 88.9°N plus 20 km north is about 89.08°N.
    expect(unprojectToLocalPlane(position(88.9, 0), { eastM: 0, northM: 20_000 })).toStrictEqual(
      failure('unsupported_position'),
    );
  });

  it('fails with unsupported_position for an unsupported origin', () => {
    expect(unprojectToLocalPlane(position(89.5, 0), { eastM: 1, northM: 1 })).toStrictEqual(
      failure('unsupported_position'),
    );
  });

  it('fails with invalid_number for a non-finite component', () => {
    expect(unprojectToLocalPlane(equatorOrigin, { eastM: Number.NaN, northM: 0 })).toStrictEqual(
      failure('invalid_number'),
    );
    expect(
      unprojectToLocalPlane(equatorOrigin, { eastM: 0, northM: Number.POSITIVE_INFINITY }),
    ).toStrictEqual(failure('invalid_number'));
  });
});
