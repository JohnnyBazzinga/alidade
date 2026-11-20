import { greatCircleDistanceM, isSupportedPosition } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { circleArc } from './circle-arc';
import { EARTH_RADIUS_M } from './earth';

const D = DEG_TO_RAD;

describe('P-9.9: arc vertices lie on their Circle (Req 9.9)', () => {
  // Generator: centre latitude uniform in [-80°, 80°], longitude in (-180°, 180°] (Core's longitude domain is (-π, π]; -180° is the same meridian as 180° and Core refuses it: an example test of its own); radius uniform
  // in [5°, 85°]; the Fix at a uniform azimuth and a distance from the Circle of up to 2° of arc
  // (a Fix near its Circle); half-length uniform in [1 km, 4 000 km]. Excludes a Fix at the centre
  // (an example test of its own refuses it).
  it('every vertex is Supported and at the Circle radius within 1e-3 m; no segment spans over 180° of longitude', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-9.9',
      fc.property(
        fc.double({ min: -80, max: 80, noNaN: true }),
        fc.double({ min: -179.999, max: 180, noNaN: true }),
        fc.double({ min: 5, max: 85, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: 1, max: 4000, noNaN: true }),
        (latDeg, lonDeg, radiusDeg, nearAzDeg, halfKm) => {
          const centre = { latRad: latDeg * D, lonRad: lonDeg * D };
          // `near` is a point 'radiusDeg' away from the centre at the chosen azimuth.
          const lat2 = Math.asin(
            Math.sin(centre.latRad) * Math.cos(radiusDeg * D) +
              Math.cos(centre.latRad) * Math.sin(radiusDeg * D) * Math.cos(nearAzDeg * D),
          );
          const lon2 =
            centre.lonRad +
            Math.atan2(
              Math.sin(nearAzDeg * D) * Math.sin(radiusDeg * D) * Math.cos(centre.latRad),
              Math.cos(radiusDeg * D) - Math.sin(centre.latRad) * Math.sin(lat2),
            );
          const near = { latRad: lat2, lonRad: Math.atan2(Math.sin(lon2), Math.cos(lon2)) };
          fc.pre(isSupportedPosition(near));
          const r = circleArc(centre, radiusDeg * D, near, halfKm * 1000, 0.25 * D);
          if (!r.ok) throw new Error(r.reason);
          let worst = 0;
          for (const seg of r.value) {
            const lons = seg.map((v) => v.lonRad);
            expect(Math.max(...lons) - Math.min(...lons)).toBeLessThanOrEqual(Math.PI + 1e-12);
            for (const v of seg) {
              expect(isSupportedPosition(v)).toBe(true);
              const d = greatCircleDistanceM(centre, v);
              if (!d.ok) throw new Error(d.reason);
              worst = Math.max(worst, Math.abs(d.value - radiusDeg * D * EARTH_RADIUS_M));
            }
          }
          tracker.record('vertexDistanceM', worst, '1e-3 m');
          expect(worst).toBeLessThan(1e-3);
        },
      ),
      tracker,
      { numRuns: cappedRuns(400) },
    );
    expect(tracker.worst('vertexDistanceM') ?? 1).toBeLessThan(1e-3);
  });
});
