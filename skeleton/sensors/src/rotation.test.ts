import { describe, expect, it } from 'vitest';
import {
  cameraAxis,
  directionApparentAltitudeRad,
  directionAzimuthRad,
  type DeviceRotation,
  type EnuDirection,
} from './rotation';
import { angleErrorRad, rad } from './test-support/angle-compare';
import { expectOk } from './test-support/result-helpers';

function rotation(alphaDeg: number, betaDeg: number, gammaDeg: number): DeviceRotation {
  return { alphaRad: rad(alphaDeg), betaRad: rad(betaDeg), gammaRad: rad(gammaDeg) };
}

function azimuthOf(r: DeviceRotation) {
  return directionAzimuthRad(expectOk(cameraAxis(r)));
}

function altitudeOf(r: DeviceRotation): number {
  return expectOk(directionApparentAltitudeRad(expectOk(cameraAxis(r))));
}

describe('Camera axis examples (Req 2)', () => {
  it('is stable in gimbal lock, as the probe saw it: alpha alone says nothing', () => {
    // Upright (beta = 90°): the axis depends only on alpha + gamma, so two rotations whose alpha
    // differs by 70° point the same way.
    const a = expectOk(azimuthOf(rotation(10, 90, -10)));
    const b = expectOk(azimuthOf(rotation(80, 90, -80)));
    expect(angleErrorRad(a, 0)).toBeLessThanOrEqual(1e-12);
    expect(angleErrorRad(b, 0)).toBeLessThanOrEqual(1e-12);
  });

  it('points along known directions', () => {
    // Upright, alpha 0: due north, level.
    expect(angleErrorRad(expectOk(azimuthOf(rotation(0, 90, 0))), 0)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(altitudeOf(rotation(0, 90, 0)))).toBeLessThanOrEqual(1e-12);
    // alpha turns counterclockwise seen from above, so alpha 90° looks due west.
    expect(angleErrorRad(expectOk(azimuthOf(rotation(90, 90, 0))), rad(270))).toBeLessThanOrEqual(
      1e-12,
    );
    // Flat and face up: the rear camera looks straight down.
    expect(azimuthOf(rotation(0, 0, 0))).toEqual({ ok: false, reason: 'axis_vertical' });
    expect(Math.abs(altitudeOf(rotation(0, 0, 0)) - rad(-90))).toBeLessThanOrEqual(1e-12);
  });

  it('refuses an azimuth below a horizontal part of 1e-6 and gives one just above (Req 2.4)', () => {
    // beta = ε, gamma = 0, alpha = 0: the horizontal part is sin ε, pointing north.
    expect(azimuthOf({ alphaRad: 0, betaRad: 1e-6, gammaRad: 0 })).toEqual({
      ok: false,
      reason: 'axis_vertical',
    });
    const justAbove = expectOk(azimuthOf({ alphaRad: 0, betaRad: 1.0000001e-6, gammaRad: 0 }));
    expect(angleErrorRad(justAbove, 0)).toBeLessThanOrEqual(1e-12);
    // The altitude is still returned when the azimuth is not. It is -(90° - 1e-6 rad); `asin` of
    // `up = -cos(1e-6)` amplifies the rounding of `up` by about 1/sqrt(2(1 - |up|)) = 1e6 there, so
    // only about 1e-10 rad of agreement is available this close to the nadir.
    const nadirAltitudeRad = altitudeOf({ alphaRad: 0, betaRad: 1e-6, gammaRad: 0 });
    expect(Math.abs(nadirAltitudeRad - (-Math.PI / 2 + 1e-6))).toBeLessThanOrEqual(1e-9);
  });

  it('gives altitudes near the zenith, outside the property domains (Req 2.2, 2.4)', () => {
    // gamma = 0, beta = 90° + h: the camera is raised by h.
    expect(Math.abs(altitudeOf(rotation(0, 179, 0)) - rad(89))).toBeLessThanOrEqual(1e-12);
    expect(angleErrorRad(expectOk(azimuthOf(rotation(0, 179, 0))), 0)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(altitudeOf(rotation(0, 180, 0)) - rad(90))).toBeLessThanOrEqual(1e-12);
    expect(azimuthOf(rotation(0, 180, 0))).toEqual({ ok: false, reason: 'axis_vertical' });
  });

  it('names each non-finite angle (Req 2.6)', () => {
    const fine = rotation(10, 20, 30);
    for (const field of ['alphaRad', 'betaRad', 'gammaRad'] as const) {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(cameraAxis({ ...fine, [field]: bad })).toEqual({
          ok: false,
          reason: 'invalid_number',
          field,
        });
      }
    }
  });
});

describe('direction checks (D4)', () => {
  it('clamps an up component above 1 only by rounding (math-conventions)', () => {
    const rounding: EnuDirection = { east: 0, north: 0, up: 1 + 1e-13 };
    expect(expectOk(directionApparentAltitudeRad(rounding))).toBe(Math.PI / 2);
    const tooFar: EnuDirection = { east: 0, north: 0, up: 1 + 5e-10 };
    expect(directionApparentAltitudeRad(tooFar)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'up',
    });
  });

  it('refuses non-unit and non-finite directions', () => {
    expect(directionAzimuthRad({ east: 0, north: 2, up: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'direction',
    });
    expect(directionAzimuthRad({ east: Number.NaN, north: 1, up: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'east',
    });
  });
});
