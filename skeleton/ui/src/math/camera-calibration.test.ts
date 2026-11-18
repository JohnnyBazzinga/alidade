import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  checkCalibration,
  focalLengthSourcePx,
  MIN_FOV_SIGMA_RAD,
  type CameraCalibration,
} from './camera-calibration';
import { fromDeg } from './degrees';

const VALID: CameraCalibration = {
  fovRad: fromDeg(70),
  fovAxis: 'diagonal',
  fovSigmaRad: fromDeg(1),
  imageWidthSourcePx: 720,
  imageHeightSourcePx: 1280,
};

function fail(field: string) {
  return { ok: false, reason: 'invalid_number', field };
}

describe('checkCalibration (Req 4.1)', () => {
  it('accepts a valid calibration unchanged', () => {
    expect(checkCalibration(VALID)).toEqual({ ok: true, value: VALID });
  });

  it('names fovRad outside (0, π) or not finite', () => {
    for (const fovRad of [0, -0.1, Math.PI, 4, Number.NaN, Infinity, -Infinity]) {
      expect(checkCalibration({ ...VALID, fovRad })).toEqual(fail('fovRad'));
    }
  });

  it('names fovAxis other than the three', () => {
    expect(checkCalibration({ ...VALID, fovAxis: 'depth' as 'width' })).toEqual(fail('fovAxis'));
  });

  it('accepts fovSigmaRad of 0.01° and refuses 0.0099°', () => {
    expect(MIN_FOV_SIGMA_RAD).toBe(fromDeg(0.01));
    expect(checkCalibration({ ...VALID, fovSigmaRad: fromDeg(0.01) }).ok).toBe(true);
    expect(checkCalibration({ ...VALID, fovSigmaRad: fromDeg(0.0099) })).toEqual(
      fail('fovSigmaRad'),
    );
    for (const fovSigmaRad of [0, -1, Number.NaN, Infinity]) {
      expect(checkCalibration({ ...VALID, fovSigmaRad })).toEqual(fail('fovSigmaRad'));
    }
  });

  it('refuses fovRad ± sigma that reaches 0 or π', () => {
    expect(checkCalibration({ ...VALID, fovRad: fromDeg(5), fovSigmaRad: fromDeg(5) })).toEqual(
      fail('fovSigmaRad'),
    );
    expect(checkCalibration({ ...VALID, fovRad: fromDeg(4), fovSigmaRad: fromDeg(5) })).toEqual(
      fail('fovSigmaRad'),
    );
    expect(checkCalibration({ ...VALID, fovRad: fromDeg(175.5), fovSigmaRad: fromDeg(5) })).toEqual(
      fail('fovSigmaRad'),
    );
    expect(checkCalibration({ ...VALID, fovRad: fromDeg(174), fovSigmaRad: fromDeg(5) }).ok).toBe(
      true,
    );
  });

  it('names a Source image size that is not finite and positive', () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      expect(checkCalibration({ ...VALID, imageWidthSourcePx: bad })).toEqual(
        fail('imageWidthSourcePx'),
      );
      expect(checkCalibration({ ...VALID, imageHeightSourcePx: bad })).toEqual(
        fail('imageHeightSourcePx'),
      );
    }
  });

  it('returns the first invalid field in the order of Req 4.1', () => {
    const allBad = {
      fovRad: Number.NaN,
      fovAxis: 'x' as 'width',
      fovSigmaRad: Number.NaN,
      imageWidthSourcePx: -1,
      imageHeightSourcePx: -1,
    };
    expect(checkCalibration(allBad)).toEqual(fail('fovRad'));
    expect(checkCalibration({ ...allBad, fovRad: 1 })).toEqual(fail('fovAxis'));
    expect(checkCalibration({ ...allBad, fovRad: 1, fovAxis: 'width' })).toEqual(
      fail('fovSigmaRad'),
    );
    expect(checkCalibration({ ...allBad, fovRad: 1, fovAxis: 'width', fovSigmaRad: 0.1 })).toEqual(
      fail('imageWidthSourcePx'),
    );
  });

  it('has no default: the argument is required and no default is exported', () => {
    expectTypeOf(checkCalibration).parameters.toEqualTypeOf<[CameraCalibration]>();
    expectTypeOf(focalLengthSourcePx).parameters.toEqualTypeOf<[CameraCalibration]>();
  });
});

describe('focalLengthSourcePx (Req 4.3)', () => {
  it('is (D / 2) / tan(fov / 2) for each axis', () => {
    const fov = fromDeg(60);
    const base = { ...VALID, fovRad: fov };
    const half = Math.tan(fov / 2); // 0.57735…
    const width = focalLengthSourcePx({ ...base, fovAxis: 'width' });
    const height = focalLengthSourcePx({ ...base, fovAxis: 'height' });
    const diagonal = focalLengthSourcePx({ ...base, fovAxis: 'diagonal' });
    expect(width.ok && Math.abs(width.value - 360 / half) < 1e-9).toBe(true);
    expect(height.ok && Math.abs(height.value - 640 / half) < 1e-9).toBe(true);
    expect(diagonal.ok && Math.abs(diagonal.value - Math.hypot(720, 1280) / 2 / half) < 1e-9).toBe(
      true,
    );
    // 360 / tan(30°) = 623.5382907…
    expect(width.ok && Math.abs(width.value - 623.5382907247958) < 1e-9).toBe(true);
  });

  it('fails for an invalid calibration', () => {
    expect(focalLengthSourcePx({ ...VALID, fovRad: 0 })).toEqual(fail('fovRad'));
  });
});
