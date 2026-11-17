import fc from 'fast-check';
import { describe, it } from 'vitest';
import { offAxisRay } from './ray';
import { cameraAxis } from './rotation';
import { deviceRotation, rayOffset } from './test-support/generators';
import { checkProperty, ErrorTracker } from './test-support/property-report';
import { angleBetweenRad, referenceUnrotate } from './test-support/reference-rotation';
import { describeRotation, lockLabel } from './test-support/rotation-labels';

describe('Off-axis ray properties', () => {
  // P-3.6 — validates Req 3.6: an Off-axis ray has unit length within 1e-12.
  it('P-3.6: an Off-axis ray is a unit vector', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.6',
      fc.property(deviceRotation(), rayOffset(), (r, o) => {
        const ray = offAxisRay(r, o);
        if (!ray.ok) return false;
        const error = Math.abs(Math.hypot(ray.value.east, ray.value.north, ray.value.up) - 1);
        tracker.record(lockLabel('length − 1', r), error, '1e-12', describeRotation(r));
        return error <= 1e-12;
      }),
      tracker,
    );
  });

  // P-3.7 — validates Req 3.7: the ray of the offset (0, 0) equals the Camera axis of the closed
  // formula within 1e-12 per component.
  it('P-3.7: the zero offset is the Camera axis', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.7',
      fc.property(deviceRotation(), (r) => {
        const ray = offAxisRay(r, { rightRad: 0, upRad: 0 });
        const axis = cameraAxis(r);
        if (!ray.ok || !axis.ok) return false;
        const error = Math.max(
          Math.abs(ray.value.east - axis.value.east),
          Math.abs(ray.value.north - axis.value.north),
          Math.abs(ray.value.up - axis.value.up),
        );
        tracker.record(lockLabel('component difference', r), error, '1e-12', describeRotation(r));
        return error <= 1e-12;
      }),
      tracker,
    );
  });

  // P-3.8 — validates Req 3.8: mapping the ray back with the transpose of R (built independently,
  // one inverse rotation at a time) gives back the offsets by atan2(x, -z) and atan2(y, -z)
  // within 1e-9 rad.
  it('P-3.8: the transpose gives back the offsets', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.8',
      fc.property(deviceRotation(), rayOffset(), (r, o) => {
        const ray = offAxisRay(r, o);
        if (!ray.ok) return false;
        const [x, y, z] = referenceUnrotate(r, ray.value);
        const rightError = Math.abs(Math.atan2(x, -z) - o.rightRad);
        const upError = Math.abs(Math.atan2(y, -z) - o.upRad);
        const label = `${describeRotation(r)} right=${o.rightRad} up=${o.upRad}`;
        tracker.record(lockLabel('rightRad error', r), rightError, '1e-9', label);
        tracker.record(lockLabel('upRad error', r), upError, '1e-9', label);
        return rightError <= 1e-9 && upError <= 1e-9;
      }),
      tracker,
    );
  });

  // P-3.9 — validates Req 3.9: the angle between the ray and the Camera axis is
  // atan(hypot(tan right, tan up)) within 1e-9 rad.
  it('P-3.9: the angle from the axis is the pinhole angle', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.9',
      fc.property(deviceRotation(), rayOffset(), (r, o) => {
        const ray = offAxisRay(r, o);
        const axis = cameraAxis(r);
        if (!ray.ok || !axis.ok) return false;
        const expected = Math.atan(Math.hypot(Math.tan(o.rightRad), Math.tan(o.upRad)));
        const error = Math.abs(angleBetweenRad(ray.value, axis.value) - expected);
        tracker.record(lockLabel('angle error', r), error, '1e-9', describeRotation(r));
        return error <= 1e-9;
      }),
      tracker,
    );
  });
});
