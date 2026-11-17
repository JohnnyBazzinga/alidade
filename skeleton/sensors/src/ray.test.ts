import { describe, expect, it } from 'vitest';
import { offAxisRay, rayDirection } from './ray';
import {
  cameraAxis,
  directionApparentAltitudeRad,
  directionAzimuthRad,
  type DeviceRotation,
} from './rotation';
import { angleErrorRad, rad } from './test-support/angle-compare';
import { expectOk } from './test-support/result-helpers';

/** Upright, looking due north. */
const NORTH: DeviceRotation = { alphaRad: 0, betaRad: Math.PI / 2, gammaRad: 0 };

function look(rightDeg: number, upDeg: number): { azimuthRad: number; altitudeRad: number } {
  const ray = expectOk(offAxisRay(NORTH, { rightRad: rad(rightDeg), upRad: rad(upDeg) }));
  return {
    azimuthRad: expectOk(directionAzimuthRad(ray)),
    altitudeRad: expectOk(directionApparentAltitudeRad(ray)),
  };
}

describe('Off-axis ray examples (Req 3)', () => {
  it('turns right and up as the screen does', () => {
    const right = look(10, 0);
    expect(angleErrorRad(right.azimuthRad, rad(10))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(right.altitudeRad)).toBeLessThanOrEqual(1e-12);
    const up = look(0, 10);
    expect(angleErrorRad(up.azimuthRad, 0)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(up.altitudeRad - rad(10))).toBeLessThanOrEqual(1e-12);
  });

  it('accepts 80° and refuses beyond it or non-finite, naming the field (Req 3.3)', () => {
    expect(offAxisRay(NORTH, { rightRad: rad(80), upRad: rad(-80) }).ok).toBe(true);
    for (const rightRad of [rad(80.0001), rad(-80.0001), Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(offAxisRay(NORTH, { rightRad, upRad: 0 })).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'rightRad',
      });
    }
    expect(offAxisRay(NORTH, { rightRad: 0, upRad: rad(81) })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'upRad',
    });
  });

  it('uses the Camera axis when no offset is given (Req 3.5)', () => {
    expect(rayDirection(NORTH)).toEqual(cameraAxis(NORTH));
    expect(offAxisRay({ ...NORTH, betaRad: Number.NaN }, { rightRad: 0, upRad: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'betaRad',
    });
  });
});
