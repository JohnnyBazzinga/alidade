import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { projectToLocalPlane, unprojectToLocalPlane } from './local-plane';
import { destinationPosition, greatCircleDistanceM, isSupportedPosition } from './position';
import { azimuth, logUniformBetween, supportedPosition } from './test-support/generators';
import { unwrapOk } from './test-support/result-helpers';

// Domain shared by P-3.3 and P-3.5: a Supported origin and a Supported position within 1000 km
// of it, reached from the origin along a drawn azimuth in [0, 2π) at a distance drawn
// log-uniformly from 1e-10 m to 1000 km (`logUniformBetween`). That is 16
// decades: one decade (1/16 of the cases) lies inside the 1e-9 m collapse of Req 3.4 and six
// more (6/16) between 1e-9 m and 1e-3 m, so the band near the origin, where the projection is
// most delicate, is exercised on every run, together with far positions.
// Destinations that are not Supported positions (within 1° of a pole) are discarded.
const originAndNearbyPosition = fc
  .tuple(supportedPosition, azimuth, logUniformBetween(1e-10, 1e6))
  .map(([origin, azimuthRad, distanceM]) => ({
    origin,
    position: unwrapOk(destinationPosition(origin, azimuthRad, distanceM)),
  }))
  .filter(({ position }) => isSupportedPosition(position));

describe('local plane properties', () => {
  // Property P-3.3: projecting and unprojecting returns the position. Validates Requirement 3.3.
  it('P-3.3: project then unproject returns a position within 1e-4 m of the original', () => {
    fc.assert(
      fc.property(originAndNearbyPosition, ({ origin, position }) => {
        const point = unwrapOk(projectToLocalPlane(origin, position));
        const returned = unwrapOk(unprojectToLocalPlane(origin, point));
        expect(unwrapOk(greatCircleDistanceM(returned, position))).toBeLessThan(1e-4);
      }),
    );
  });

  // Property P-3.5: the projection preserves distance from the origin.
  // Validates Requirement 3.5.
  it('P-3.5: the length of the projected vector equals the great-circle distance within 1e-6 m', () => {
    fc.assert(
      fc.property(originAndNearbyPosition, ({ origin, position }) => {
        const point = unwrapOk(projectToLocalPlane(origin, position));
        const distanceM = unwrapOk(greatCircleDistanceM(origin, position));
        expect(Math.abs(Math.hypot(point.eastM, point.northM) - distanceM)).toBeLessThan(1e-6);
      }),
    );
  });
});
