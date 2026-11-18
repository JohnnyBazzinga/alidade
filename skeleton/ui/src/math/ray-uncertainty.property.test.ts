import { offAxisRay, type DeviceRotation, type EnuDirection } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { propertyRuns } from '../test-support/fast-check-setup';
import { closed, layoutCase, pointInOffsetSpace } from '../test-support/generators';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { fromDeg } from './degrees';
import { pointToRayOffset } from './image-geometry';
import { imageAngularSigmaRad } from './ray-uncertainty';

const IDENTITY: DeviceRotation = { alphaRad: 0, betaRad: 0, gammaRad: 0 };

function angleBetween(a: EnuDirection, b: EnuDirection): number {
  const cx = a.north * b.up - a.up * b.north;
  const cy = a.up * b.east - a.east * b.up;
  const cz = a.east * b.north - a.north * b.east;
  return Math.atan2(Math.hypot(cx, cy, cz), a.east * b.east + a.north * b.north + a.up * b.up);
}

// P-6.4 (Req 6.4): the Image angular sigma is finite, at least εTap, and equals εTap within 1e-12
// at the centre of the Element. Domain: layoutCase, points within ±79° (pointInOffsetSpace),
// tapSigmaPx in [0, 50] (ends drawn). εTap = tapSigmaPx / hypot(r, F), computed here.
describe('P-6.4 image angular sigma', () => {
  it('is finite, at least εTap, and εTap at the centre', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-6.4',
      fc.property(
        layoutCase().chain((c) => pointInOffsetSpace(c)),
        closed(0, 50),
        (c, tapSigmaPx) => {
          const sigma = imageAngularSigmaRad(c.layout, c.calibration, c.point, tapSigmaPx);
          if (!sigma.ok || !Number.isFinite(sigma.value)) return false;
          const r = Math.hypot(
            c.point.xPx - c.layout.elementWidthPx / 2,
            c.point.yPx - c.layout.elementHeightPx / 2,
          );
          const epsilonTap = tapSigmaPx / Math.hypot(r, c.focalPx);
          // Shortfall below εTap, relative: hypot(a, b) >= a up to rounding of a few ulps.
          tracker.record(
            'shortfall below εTap, relative',
            Math.max(0, (epsilonTap - sigma.value) / Math.max(epsilonTap, 1e-300)),
            '2.2e-16 (one ulp)',
          );
          const centre = { xPx: c.layout.elementWidthPx / 2, yPx: c.layout.elementHeightPx / 2 };
          const atCentre = imageAngularSigmaRad(c.layout, c.calibration, centre, tapSigmaPx);
          if (!atCentre.ok) return false;
          const centreError = Math.abs(atCentre.value - tapSigmaPx / c.focalPx);
          tracker.record(
            'centre vs εTap [rad]',
            centreError,
            '1e-12',
            `F=${c.focalPx.toPrecision(3)}`,
          );
          return sigma.value >= epsilonTap * (1 - 2.2e-16) && centreError <= 1e-12;
        },
      ),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});

// P-6.5 (Req 6.5): within ±75° of offset, the angle between the Off-axis rays (Sensors, identity
// rotation) of the same Pixel point under fovRad and under fovRad ± fovSigmaRad does not exceed
// the Image angular sigma by more than 1e-9 rad. Domain: as P-6.4 with offsets within ±75°
// (at ±75° the same pixel under fovRad + fovSigmaRad stays inside the 80° Sensors accepts).
describe('P-6.5 the sigma covers the field-of-view uncertainty', () => {
  it('is at least the angle between the rays under fovRad and fovRad ± sigma', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-6.5',
      fc.property(
        layoutCase().chain((c) => pointInOffsetSpace(c, fromDeg(75))),
        closed(0, 50),
        (c, tapSigmaPx) => {
          const sigma = imageAngularSigmaRad(c.layout, c.calibration, c.point, tapSigmaPx);
          const base = pointToRayOffset(c.layout, c.calibration, c.point);
          if (!sigma.ok || !base.ok) return false;
          const baseRay = offAxisRay(IDENTITY, base.value);
          if (!baseRay.ok) return false;
          let worst = 0;
          for (const delta of [c.calibration.fovSigmaRad, -c.calibration.fovSigmaRad]) {
            const variant = { ...c.calibration, fovRad: c.calibration.fovRad + delta };
            const offset = pointToRayOffset(c.layout, variant, c.point);
            if (!offset.ok) return false;
            const ray = offAxisRay(IDENTITY, offset.value);
            if (!ray.ok) return false;
            worst = Math.max(worst, angleBetween(baseRay.value, ray.value) - sigma.value);
          }
          tracker.record('angle minus sigma [rad]', worst, '1e-9', `F=${c.focalPx.toPrecision(3)}`);
          return worst <= 1e-9;
        },
      ),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});
