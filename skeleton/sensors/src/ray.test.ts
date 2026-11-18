import { describe, expect, it } from 'vitest';
import { offAxisRay, rayDirection, rayOffsetOfDirection } from './ray';
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

describe('rayOffsetOfDirection examples (Req 3.10, 3.11)', () => {
  const ray = (rightDeg: number, upDeg: number) =>
    expectOk(offAxisRay(NORTH, { rightRad: rad(rightDeg), upRad: rad(upDeg) }));

  it('places a direction 10° right of the axis at (10°, 0)', () => {
    const offset = expectOk(rayOffsetOfDirection(NORTH, ray(10, 0)));
    expect(offset).not.toBeNull();
    expect(Math.abs((offset?.rightRad ?? 1) - rad(10))).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(offset?.upRad ?? 1)).toBeLessThanOrEqual(1e-12);
  });

  it('gives the zero offset for the Camera axis', () => {
    const axis = expectOk(cameraAxis(NORTH));
    const offset = expectOk(rayOffsetOfDirection(NORTH, axis));
    expect(Math.abs(offset?.rightRad ?? 1)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(offset?.upRad ?? 1)).toBeLessThanOrEqual(1e-12);
  });

  it('accepts an offset of exactly 80° and returns null just beyond it, on each axis', () => {
    expect(expectOk(rayOffsetOfDirection(NORTH, ray(79.999, 0)))).not.toBeNull();
    expect(expectOk(rayOffsetOfDirection(NORTH, ray(80, 0)))).not.toBeNull();
    // A direction 80.001° to the right is not an offset the rays can name: null, not a failure.
    const beyond = { east: Math.sin(rad(80.001)), north: Math.cos(rad(80.001)), up: 0 };
    expect(expectOk(rayOffsetOfDirection(NORTH, beyond))).toBeNull();
    const above = { east: 0, north: Math.cos(rad(80.001)), up: Math.sin(rad(80.001)) };
    expect(expectOk(rayOffsetOfDirection(NORTH, above))).toBeNull();
    const below = { east: 0, north: Math.cos(rad(80.001)), up: -Math.sin(rad(80.001)) };
    expect(expectOk(rayOffsetOfDirection(NORTH, below))).toBeNull();
  });

  it('returns null behind the camera and exactly 90° from the axis', () => {
    expect(expectOk(rayOffsetOfDirection(NORTH, { east: 0, north: -1, up: 0 }))).toBeNull();
    expect(expectOk(rayOffsetOfDirection(NORTH, { east: 1, north: 0, up: 0 }))).toBeNull();
    expect(expectOk(rayOffsetOfDirection(NORTH, { east: 0, north: 0, up: -1 }))).toBeNull();
  });

  it('names the invalid field, and refuses a direction that is not a unit vector', () => {
    const north = { east: 0, north: 1, up: 0 };
    expect(rayOffsetOfDirection({ ...NORTH, alphaRad: Number.NaN }, north)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'alphaRad',
    });
    expect(rayOffsetOfDirection(NORTH, { east: Number.NaN, north: 1, up: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'east',
    });
    expect(rayOffsetOfDirection(NORTH, { east: 0, north: 2, up: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'direction',
    });
  });
});
