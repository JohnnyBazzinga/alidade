import { CONFIDENCE_95_SCALE, type Position } from '@alidade/core';
import { fixFeatures } from '@alidade/ui';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { compare } from './comparison';
import type { ShownFix } from './solve-candidate';

const D = DEG_TO_RAD;
const params = defaultParameters();

describe('P-11.6: the inside test agrees with the polygon that fixFeatures draws (Req 11.6)', () => {
  // Generator: a Fix at latitude uniform in [-60°, 60°], longitude in [-170°, 170°]; 95 % semi-axes
  // uniform in [1 km, 2 000 km] (minor not above major); the long axis uniform in [0, π). The
  // polygon's vertices (UI's `fixFeatures`) are tested: each must give m² = scale² within 1e-6
  // relative, so the point is inside just under it and outside just over it.
  it('every vertex of the 95 % polygon gives m² equal to the scale squared', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-11.6',
      fc.property(
        fc.double({ min: -60, max: 60, noNaN: true }),
        fc.double({ min: -170, max: 170, noNaN: true }),
        fc.double({ min: 1, max: 2000, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 3.14, noNaN: true }),
        (latDeg, lonDeg, majorKm, ratio, azimuthRad) => {
          const a95 = majorKm * 1000;
          const b95 = a95 * ratio;
          const sa = a95 / CONFIDENCE_95_SCALE;
          const sb = b95 / CONFIDENCE_95_SCALE;
          const s = Math.sin(azimuthRad);
          const c = Math.cos(azimuthRad);
          const fix = {
            position: { latRad: latDeg * D, lonRad: lonDeg * D },
            covariance: {
              varEastM2: sa * sa * s * s + sb * sb * c * c,
              covEastNorthM2: (sa * sa - sb * sb) * s * c,
              varNorthM2: sa * sa * c * c + sb * sb * s * s,
            },
            ellipse: { semiMajorM: sa, semiMinorM: sb, azimuthRad },
            residuals: [],
            excludedIds: [],
            warnings: [],
            cost: 0,
            iterations: 1,
          } as unknown as ShownFix;
          const features = fixFeatures(fix, 32);
          if (!features.ok) throw new Error(features.reason);
          const ring = features.value.features[1].geometry;
          if (ring.type !== 'Polygon') throw new Error('not a polygon');
          const vertices = (ring.coordinates[0] ?? []).slice(0, -1);
          for (const [lon, lat] of vertices) {
            const gps: Position = { latRad: (lat ?? 0) * D, lonRad: (lon ?? 0) * D };
            const r = compare(fix, gps, params);
            if (!r.ok) throw new Error(r.reason);
            tracker.record(
              'm2 relative',
              Math.abs(r.value.mahalanobisSquared / CONFIDENCE_95_SCALE ** 2 - 1),
              '1e-6',
            );
          }
        },
      ),
      tracker,
      { numRuns: cappedRuns(400) },
    );
    expect(tracker.worst('m2 relative') ?? 1).toBeLessThan(1e-6);
  });
});
