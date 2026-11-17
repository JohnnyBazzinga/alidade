import { describe, expect, it } from 'vitest';
import { cameraAxis, directionApparentAltitudeRad, directionAzimuthRad } from '../rotation';
import { angleErrorRad, rad } from '../test-support/angle-compare';
import { referenceRotate } from '../test-support/reference-rotation';
import { expectOk } from '../test-support/result-helpers';
import { eulerDegreesFromRotation, rotationFromDirection } from './direction-to-rotation';

describe('rotationFromDirection (D18, §7.12)', () => {
  it('gives beta = 90°, gamma = 0 for an upright phone with no roll (exact gimbal lock)', () => {
    const rotation = expectOk(rotationFromDirection(rad(30), 0, 0));
    expect(Math.abs(rotation.betaRad - Math.PI / 2)).toBeLessThanOrEqual(1e-15);
    expect(rotation.gammaRad).toBe(0);
    const azimuthRad = expectOk(directionAzimuthRad(expectOk(cameraAxis(rotation))));
    expect(angleErrorRad(azimuthRad, rad(30))).toBeLessThanOrEqual(1e-15);
  });

  it('points the camera where asked, with a roll', () => {
    const rotation = expectOk(rotationFromDirection(rad(200), rad(25), rad(40)));
    const axis = expectOk(cameraAxis(rotation));
    expect(angleErrorRad(expectOk(directionAzimuthRad(axis)), rad(200))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(expectOk(directionApparentAltitudeRad(axis)) - rad(25))).toBeLessThanOrEqual(
      1e-12,
    );
  });

  it('rolls the screen counterclockwise as the user sees it for a positive roll', () => {
    // Upright facing north and rolled 90°: the top of the screen (device +y) turns to the west,
    // the camera still looks north.
    const rotation = expectOk(rotationFromDirection(0, 0, Math.PI / 2));
    const top = referenceRotate(rotation, [0, 1, 0]);
    expect(Math.abs(top.east + 1) + Math.abs(top.north) + Math.abs(top.up)).toBeLessThanOrEqual(
      1e-12,
    );
    const axis = expectOk(cameraAxis(rotation));
    expect(angleErrorRad(expectOk(directionAzimuthRad(axis)), 0)).toBeLessThanOrEqual(1e-12);
    expect(rotation.gammaRad >= -Math.PI / 2 && rotation.gammaRad < Math.PI / 2).toBe(true);
  });

  it('refuses non-finite input', () => {
    expect(rotationFromDirection(Number.NaN, 0, 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'azimuthRad',
    });
    expect(rotationFromDirection(0, Number.POSITIVE_INFINITY, 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'apparentAltitudeRad',
    });
  });
});

describe('eulerDegreesFromRotation (§7.12)', () => {
  it('maps an alpha that rounds to 360° back to 0°', () => {
    const justBelow = 2 * Math.PI - 2 * Number.EPSILON;
    expect(justBelow * (180 / Math.PI)).toBe(360); // the rounding this guards against
    const degrees = eulerDegreesFromRotation({ alphaRad: justBelow, betaRad: 0.5, gammaRad: 0.25 });
    expect(degrees.alphaDeg).toBe(0);
  });

  it('maps a gamma that rounds to 90° into range by the same rotation', () => {
    const justBelow = Math.PI / 2 - 1e-17; // rounds to π/2, whose degrees are exactly 90
    const rotation = { alphaRad: 1, betaRad: 0.3, gammaRad: justBelow };
    const degrees = eulerDegreesFromRotation(rotation);
    expect(degrees.gammaDeg).toBe(-90);
    expect(degrees.alphaDeg >= 0 && degrees.alphaDeg < 360).toBe(true);
    expect(degrees.betaDeg >= -180 && degrees.betaDeg < 180).toBe(true);
    const before = expectOk(cameraAxis(rotation));
    const after = expectOk(
      cameraAxis({
        alphaRad: rad(degrees.alphaDeg),
        betaRad: rad(degrees.betaDeg),
        gammaRad: rad(degrees.gammaDeg),
      }),
    );
    expect(
      Math.abs(before.east - after.east) +
        Math.abs(before.north - after.north) +
        Math.abs(before.up - after.up),
    ).toBeLessThanOrEqual(1e-14);
  });

  it('maps a beta that rounds to 180° to -180°', () => {
    const degrees = eulerDegreesFromRotation({
      alphaRad: 1,
      betaRad: Math.PI - 1e-17,
      gammaRad: 0,
    });
    expect(degrees.betaDeg).toBe(-180);
  });
});
