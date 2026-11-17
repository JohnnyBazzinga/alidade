import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cameraAxis, directionApparentAltitudeRad, directionAzimuthRad } from './rotation';
import { angleErrorRad } from './test-support/angle-compare';
import {
  deviceRotation,
  horizontalPart,
  smallRotationChange,
  uniform,
} from './test-support/generators';
import { checkProperty, ErrorTracker } from './test-support/property-report';
import { angleBetweenRad, referenceRotate } from './test-support/reference-rotation';
import { describeRotation, lockLabel } from './test-support/rotation-labels';

describe('Camera axis properties', () => {
  // P-2.7 — validates Req 2.7: the Camera axis has unit length within 1e-12.
  it('P-2.7: the Camera axis is a unit vector', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-2.7',
      fc.property(deviceRotation(), (r) => {
        const axis = cameraAxis(r);
        if (!axis.ok) return false;
        const error = Math.abs(Math.hypot(axis.value.east, axis.value.north, axis.value.up) - 1);
        tracker.record(lockLabel('length − 1', r), error, '1e-12', describeRotation(r));
        return error <= 1e-12;
      }),
      tracker,
    );
  });

  // P-2.8 — validates Req 2.8: the closed formula equals Rz·Rx·Ry applied to (0, 0, -1), built
  // independently in test-support/reference-rotation.ts, within 1e-12 per component.
  it('P-2.8: the closed formula equals the product of the elementary rotations', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-2.8',
      fc.property(deviceRotation(), (r) => {
        const axis = cameraAxis(r);
        if (!axis.ok) return false;
        const reference = referenceRotate(r, [0, 0, -1]);
        const error = Math.max(
          Math.abs(axis.value.east - reference.east),
          Math.abs(axis.value.north - reference.north),
          Math.abs(axis.value.up - reference.up),
        );
        tracker.record(lockLabel('component difference', r), error, '1e-12', describeRotation(r));
        return error <= 1e-12;
      }),
      tracker,
    );
  });

  // P-2.9 — validates Req 2.9: for axes with a horizontal part of at least 1e-3, adding δ to alpha
  // turns the azimuth by -δ within 1e-9 rad (wrapped) and leaves the altitude unchanged within
  // 1e-12 rad. The domain is `horizontalRotation`; the horizontal-part condition is applied with
  // `fc.pre` here, rather than a filter, so that the discards are counted in the report.
  it('P-2.9: alpha turns the azimuth and leaves the altitude', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-2.9',
      fc.property(
        deviceRotation(),
        fc.oneof(fc.constantFrom(-2 * Math.PI, 0, 2 * Math.PI), uniform(-2 * Math.PI, 2 * Math.PI)),
        (r, deltaRad) => {
          fc.pre(horizontalPart(r) >= 1e-3);
          const turned = { ...r, alphaRad: r.alphaRad + deltaRad };
          const before = cameraAxis(r);
          const after = cameraAxis(turned);
          if (!before.ok || !after.ok) return false;
          const azBefore = directionAzimuthRad(before.value);
          const azAfter = directionAzimuthRad(after.value);
          const altBefore = directionApparentAltitudeRad(before.value);
          const altAfter = directionApparentAltitudeRad(after.value);
          if (!azBefore.ok || !azAfter.ok || !altBefore.ok || !altAfter.ok) return false;
          const azimuthError = angleErrorRad(azAfter.value, azBefore.value - deltaRad);
          const altitudeError = Math.abs(altAfter.value - altBefore.value);
          const label = `${describeRotation(r)} delta=${deltaRad}`;
          tracker.record(lockLabel('azimuth error', r), azimuthError, '1e-9', label);
          tracker.record(lockLabel('altitude change', r), altitudeError, '1e-12', label);
          return azimuthError <= 1e-9 && altitudeError <= 1e-12;
        },
      ),
      tracker,
    );
  });

  // P-2.10 — validates Req 2.10: the angle between the axes before and after a change of at most
  // 1e-3 rad in each angle does not exceed |Δα| + |Δβ| + |Δγ| + 1e-12 (continuity, including at
  // beta near 90°).
  it('P-2.10: the axis is continuous in the rotation', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-2.10',
      fc.property(deviceRotation(), smallRotationChange(), (r, d) => {
        const before = cameraAxis(r);
        const after = cameraAxis({
          alphaRad: r.alphaRad + d.alphaRad,
          betaRad: r.betaRad + d.betaRad,
          gammaRad: r.gammaRad + d.gammaRad,
        });
        if (!before.ok || !after.ok) return false;
        const bound = Math.abs(d.alphaRad) + Math.abs(d.betaRad) + Math.abs(d.gammaRad);
        const excess = angleBetweenRad(before.value, after.value) - bound;
        tracker.record(lockLabel('angle − bound', r), excess, '≤ 1e-12', describeRotation(r));
        return excess <= 1e-12;
      }),
      tracker,
    );
  });
});
