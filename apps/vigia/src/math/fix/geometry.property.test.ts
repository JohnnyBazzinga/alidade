// P-7.8 (Req 7.1, 7.8) and P-6.9 (Req 6.4, 6.9): the Geometry class is a pure function of the
// warnings and the Ellipse, and the half-interval of the distance is the shadow of UI's drawn 95 %
// ellipse.

import { ellipse95, projectToLocalPlane } from '@alidade/core';
import { ELLIPSE_VERTEX_COUNT, fixFeatures } from '@alidade/ui';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed, fixCase, uniform } from '../../test-support/generators';
import { PARAMETERS } from '../../test-support/incident-fixtures';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { geometryClass } from './geometry-class';
import { halfIntervalM } from './from-you';

describe('P-7.8: the Geometry class (Req 7.1, 7.8)', () => {
  // Generator: `fixCase` (Ellipses of 1 m to 100 km, circles one draw in six, warnings none or
  // poor_geometry), and the same Fix with every field but the Ellipse and the warnings changed.
  it('is poor iff poor_geometry or an elongation of at least the long ratio, fair from the fair ratio, else good', () => {
    checkProperty(
      'P-7.8',
      fc.property(fixCase(), uniform(-1, 1), (fix, shift) => {
        const result = geometryClass(fix, PARAMETERS);
        if (!result.ok) throw new Error(`failed: ${result.reason}`);
        const ratio = fix.ellipse.semiMajorM / fix.ellipse.semiMinorM;
        const poor = fix.warnings.includes('poor_geometry') || ratio >= PARAMETERS.longEllipseRatio;
        const expected = poor ? 'poor' : ratio >= PARAMETERS.fairEllipseRatio ? 'fair' : 'good';
        if (result.value !== expected)
          throw new Error(`${result.value}, expected ${expected} at ${ratio}`);
        // Only the warnings and the Ellipse matter.
        const other = {
          ...fix,
          position: { latRad: fix.position.latRad * 0.5, lonRad: shift },
          covariance: { varEastM2: 1, varNorthM2: 2, covEastNorthM2: 0 },
          residuals: [{ id: 'x', residualRad: shift, normalisedResidual: 10 * shift }],
          iterations: 40,
          excludedIds: ['y'],
        };
        const again = geometryClass(other, PARAMETERS);
        if (!again.ok || again.value !== result.value) throw new Error('depends on another field');
      }),
      new ErrorTracker(),
      { numRuns: cappedRuns(10_000) },
    );
  });
});

describe('P-6.9: the half-interval of the distance (Req 6.4, 6.9)', () => {
  // Generator: `fixCase` and a direction in [0, 2π) (with the major axis, its opposite and the two
  // directions at right angles to it drawn one draw in five). The polygon is UI's `fixFeatures`
  // with its own vertex count, projected on Core's Local plane at the Fix.
  it('lies between the semi-axes, equals the extent of the drawn ellipse, and the axes at θ = 0 and π/2', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-6.9',
      fc.property(
        fixCase(),
        fc.oneof(
          { weight: 4, arbitrary: closed(0, 2 * Math.PI) },
          { weight: 1, arbitrary: fc.constantFrom(0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2) },
        ),
        fc.boolean(),
        (fix, raw, relative) => {
          const e95 = ellipse95(fix.ellipse);
          if (!e95.ok) throw new Error('ellipse95');
          const { semiMajorM: a, semiMinorM: b, azimuthRad: mu } = e95.value;
          const direction = relative ? mu + raw : raw;
          const h = halfIntervalM(e95.value, direction);
          if (!h.ok) throw new Error('halfIntervalM failed');
          if (!(h.value >= b * (1 - 1e-12) && h.value <= a * (1 + 1e-12)))
            throw new Error(`${h.value} outside [${b}, ${a}]`);
          // The extent of the polygon on the direction.
          const features = fixFeatures(fix, ELLIPSE_VERTEX_COUNT);
          if (!features.ok) throw new Error(`fixFeatures failed: ${features.reason}`);
          const geometry = features.value.features[1].geometry;
          const ring = geometry.type === 'Polygon' ? (geometry.coordinates[0] ?? []) : [];
          if (ring.length < 16) throw new Error('no ring');
          let extent = 0;
          for (const [lonDeg, latDeg] of ring) {
            const p = projectToLocalPlane(fix.position, {
              latRad: (latDeg * Math.PI) / 180,
              lonRad: (lonDeg * Math.PI) / 180,
            });
            if (!p.ok) throw new Error('project');
            extent = Math.max(
              extent,
              p.value.eastM * Math.sin(direction) + p.value.northM * Math.cos(direction),
            );
          }
          tracker.record('|h − extent| / a95', Math.abs(h.value - extent) / a, '1e-3');
          if (Math.abs(h.value - extent) > 1e-3 * a)
            throw new Error(`h ${h.value}, extent ${extent}`);
          // At θ = 0 the semi-major axis, at θ = π/2 the semi-minor axis.
          const along = halfIntervalM(e95.value, mu);
          const across = halfIntervalM(e95.value, mu + Math.PI / 2);
          if (!along.ok || !across.ok) throw new Error('failed');
          tracker.record('|h(0) − a95| / a95', Math.abs(along.value - a) / a, '1e-9');
          tracker.record('|h(π/2) − b95| / a95', Math.abs(across.value - b) / a, '1e-9');
          if (Math.abs(along.value - a) > 1e-9 * a || Math.abs(across.value - b) > 1e-9 * a)
            throw new Error('axes');
        },
      ),
      tracker,
      { numRuns: cappedRuns(5000) },
    );
  });
});
