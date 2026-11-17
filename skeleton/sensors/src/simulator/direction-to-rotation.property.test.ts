import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cameraAxis, directionApparentAltitudeRad, directionAzimuthRad } from '../rotation';
import { angleErrorRad, rad } from '../test-support/angle-compare';
import { cameraPose, isNearLockPose } from '../test-support/generators';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { eulerDegreesFromRotation, rotationFromDirection } from './direction-to-rotation';

describe('Simulator rotation properties', () => {
  // P-12.6 — validates Req 12.6: the raw angles the Simulator generates without noise lie in the
  // W3C ranges and, through the Camera axis formula of Req 2 (not through `rotationMatrix`), give
  // back the camera azimuth and altitude within 1e-9 rad.
  it('P-12.6: generated angles are in range and give back the direction', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-12.6',
      fc.property(cameraPose(), (pose) => {
        const rotation = rotationFromDirection(
          pose.azimuthRad,
          pose.apparentAltitudeRad,
          pose.rollRad,
        );
        if (!rotation.ok) return false;
        const { alphaDeg, betaDeg, gammaDeg } = eulerDegreesFromRotation(rotation.value);
        const inRange =
          alphaDeg >= 0 &&
          alphaDeg < 360 &&
          betaDeg >= -180 &&
          betaDeg < 180 &&
          gammaDeg >= -90 &&
          gammaDeg < 90;
        const axis = cameraAxis({
          alphaRad: rad(alphaDeg),
          betaRad: rad(betaDeg),
          gammaRad: rad(gammaDeg),
        });
        if (!axis.ok) return false;
        const azimuth = directionAzimuthRad(axis.value);
        const altitude = directionApparentAltitudeRad(axis.value);
        if (!azimuth.ok || !altitude.ok) return false;
        const azimuthError = angleErrorRad(azimuth.value, pose.azimuthRad);
        const altitudeError = Math.abs(altitude.value - pose.apparentAltitudeRad);
        const where = isNearLockPose(pose) ? 'near gimbal lock' : 'elsewhere';
        const label = `azimuth=${pose.azimuthRad} altitude=${pose.apparentAltitudeRad} roll=${pose.rollRad}`;
        tracker.record(`azimuth error (${where})`, azimuthError, '1e-9', label);
        tracker.record(`altitude error (${where})`, altitudeError, '1e-9', label);
        return inRange && azimuthError <= 1e-9 && altitudeError <= 1e-9;
      }),
      tracker,
    );
  });
});
