import { MAX_RAY_OFFSET_RAD } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import type { CameraCalibration } from './camera-calibration';
import { fromDeg } from './degrees';
import {
  displayedFocalPx,
  focalLengthPx,
  offsetOfPixel,
  pointToRayOffset,
  rayOffsetToPoint,
} from './image-geometry';
import { imageLayout, type ImageFit, type ImageLayout } from './image-layout';

const CALIBRATION: CameraCalibration = {
  fovRad: fromDeg(70),
  fovAxis: 'diagonal',
  fovSigmaRad: fromDeg(1),
  imageWidthSourcePx: 720,
  imageHeightSourcePx: 1280,
};

function layoutOf(
  fit: ImageFit,
  source = { widthSourcePx: 720, heightSourcePx: 1280 },
  element = { widthPx: 390, heightPx: 844 },
): ImageLayout {
  const result = imageLayout(source, element, fit);
  if (!result.ok) throw new Error('layout');
  return result.value;
}

function focal(layout: ImageLayout, calibration: CameraCalibration): number {
  const result = displayedFocalPx(layout, calibration);
  if (!result.ok) throw new Error('focal');
  return result.value;
}

describe('displayedFocalPx (Req 4.3, 5.2, D7)', () => {
  it('is (Dd / 2) / tan(fov / 2) of the displayed image, by hand for both fits', () => {
    const half = Math.tan(fromDeg(35));
    // cover: displayed 474.75 × 844, diagonal 968.3…; contain: 390 × 693.33…, diagonal 795.6…
    expect(
      Math.abs(focal(layoutOf('cover'), CALIBRATION) - Math.hypot(474.75, 844) / 2 / half),
    ).toBeLessThan(1e-9);
    expect(
      Math.abs(
        focal(layoutOf('contain'), CALIBRATION) - Math.hypot(390, 1280 * (390 / 720)) / 2 / half,
      ),
    ).toBeLessThan(1e-9);
    expect(Math.abs(focal(layoutOf('cover'), CALIBRATION) - 691.4816)).toBeLessThan(1e-3);
  });

  it('gives the same focal length for a calibration of twice the size and the same aspect', () => {
    const twice = { ...CALIBRATION, imageWidthSourcePx: 1440, imageHeightSourcePx: 2560 };
    expect(focal(layoutOf('cover'), twice)).toBe(focal(layoutOf('cover'), CALIBRATION));
  });
});

describe('pointToRayOffset (Req 5.2, 5.4)', () => {
  it('gives the offset (0, 0) at the centre', () => {
    const result = pointToRayOffset(layoutOf('cover'), CALIBRATION, { xPx: 195, yPx: 422 });
    expect(result).toEqual({ ok: true, value: { rightRad: 0, upRad: 0 } });
  });

  it('gives 45° to the right at one focal length to the right, and up for a smaller y', () => {
    for (const fit of ['cover', 'contain'] as const) {
      const layout = layoutOf(fit);
      const f = focal(layout, CALIBRATION);
      const right = pointToRayOffset(layout, CALIBRATION, { xPx: 195 + f * 0.25, yPx: 422 });
      expect(right.ok && Math.abs(right.value.rightRad - Math.atan(0.25)) < 1e-12).toBe(true);
      const up = pointToRayOffset(layout, CALIBRATION, { xPx: 195, yPx: 422 - 100 });
      expect(
        up.ok && up.value.upRad > 0 && Math.abs(up.value.upRad - Math.atan(100 / f)) < 1e-12,
      ).toBe(true);
    }
  });

  it('fails in the order of Req 5.4', () => {
    const layout = layoutOf('contain');
    const inside = { xPx: 195, yPx: 422 };
    // 1. a point that is not finite wins over a missing calibration.
    expect(pointToRayOffset(layout, null, { xPx: Number.NaN, yPx: 1 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'xPx',
    });
    expect(pointToRayOffset(layout, null, { xPx: 1, yPx: Infinity })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'yPx',
    });
    // 2. calibration missing, invalid, mismatched; each wins over a point outside the image.
    const outside = { xPx: -50, yPx: -50 };
    expect(pointToRayOffset(layout, null, outside)).toEqual({
      ok: false,
      reason: 'calibration_missing',
    });
    expect(pointToRayOffset(layout, { ...CALIBRATION, fovRad: 0 }, outside)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'fovRad',
    });
    expect(
      pointToRayOffset(
        layout,
        { ...CALIBRATION, imageWidthSourcePx: 1280, imageHeightSourcePx: 720 },
        outside,
      ),
    ).toEqual({ ok: false, reason: 'calibration_mismatch' });
    // 3. outside the image.
    expect(pointToRayOffset(layout, CALIBRATION, outside)).toEqual({
      ok: false,
      reason: 'outside_image',
    });
    expect(pointToRayOffset(layout, CALIBRATION, inside).ok).toBe(true);
  });

  it('refuses a swapped stream with calibration_mismatch (Req 4.5)', () => {
    const swapped = layoutOf('cover', { widthSourcePx: 1280, heightSourcePx: 720 });
    expect(pointToRayOffset(swapped, CALIBRATION, { xPx: 195, yPx: 422 })).toEqual({
      ok: false,
      reason: 'calibration_mismatch',
    });
  });

  it('accepts a relative aspect difference of 1 % and refuses a larger one (Req 4.4)', () => {
    const layout = layoutOf('cover');
    const point = { xPx: 195, yPx: 422 };
    const near = { ...CALIBRATION, imageWidthSourcePx: 720 * 1.0099 };
    const far = { ...CALIBRATION, imageWidthSourcePx: 720 * 1.011 };
    expect(pointToRayOffset(layout, near, point).ok).toBe(true);
    expect(pointToRayOffset(layout, far, point)).toEqual({
      ok: false,
      reason: 'calibration_mismatch',
    });
  });

  it('refuses a point on a contain bar and accepts the same point under cover', () => {
    const point = { xPx: 195, yPx: 30 }; // the top bar of the contain layout is 0 to 75.33
    expect(pointToRayOffset(layoutOf('contain'), CALIBRATION, point)).toEqual({
      ok: false,
      reason: 'outside_image',
    });
    expect(pointToRayOffset(layoutOf('cover'), CALIBRATION, point).ok).toBe(true);
  });

  it('refuses a point outside the Element, with a tolerance of 1e-9 px', () => {
    const layout = layoutOf('cover');
    expect(pointToRayOffset(layout, CALIBRATION, { xPx: -1e-10, yPx: 10 }).ok).toBe(true);
    expect(pointToRayOffset(layout, CALIBRATION, { xPx: -1e-8, yPx: 10 }).ok).toBe(false);
    expect(pointToRayOffset(layout, CALIBRATION, { xPx: 390 + 1e-8, yPx: 10 }).ok).toBe(false);
    expect(pointToRayOffset(layout, CALIBRATION, { xPx: 10, yPx: 844 + 1e-8 }).ok).toBe(false);
  });

  describe('the 80° limit on each axis, both sides', () => {
    // A wide field of view makes the focal length short, so that 80° is inside the Element.
    const wide: CameraCalibration = {
      fovRad: fromDeg(170),
      fovAxis: 'width',
      fovSigmaRad: fromDeg(1),
      imageWidthSourcePx: 400,
      imageHeightSourcePx: 400,
    };
    const layout = layoutOf(
      'cover',
      { widthSourcePx: 400, heightSourcePx: 400 },
      { widthPx: 400, heightPx: 400 },
    );
    const f = focal(layout, wide);
    const step = 1e-6;

    it.each([
      ['right', 1, 0],
      ['left', -1, 0],
      ['up', 0, 1],
      ['down', 0, -1],
    ])('%s', (_name, sx, sy) => {
      const at = (offsetRad: number) => ({
        xPx: 200 + sx * f * Math.tan(offsetRad),
        yPx: 200 - sy * f * Math.tan(offsetRad),
      });
      expect(f * Math.tan(MAX_RAY_OFFSET_RAD)).toBeLessThan(200); // the test point is in the Element
      expect(pointToRayOffset(layout, wide, at(MAX_RAY_OFFSET_RAD - step)).ok).toBe(true);
      expect(pointToRayOffset(layout, wide, at(MAX_RAY_OFFSET_RAD + step))).toEqual({
        ok: false,
        reason: 'outside_field_of_view',
      });
    });
  });

  // The standing rule for limits (P-5.8): at exactly ±80° the round trip through the checked
  // inverse can land a few ulps beyond the limit, and Req 5.4 gives no tolerance, so it is
  // refused. This is the shrunk counterexample of P-5.8 as first written, and it records the
  // overshoot (one ulp, 2.2e-16 rad); the unchecked inverse is within 1e-9 of the offset.
  it('refuses, by one ulp, the round trip of an offset drawn exactly at -80° (P-5.8)', () => {
    const layout = layoutOf(
      'contain',
      { widthSourcePx: 4561, heightSourcePx: 64 },
      { widthPx: 956.4892982075617, heightPx: 1465.3363088085803 },
    );
    const calibration: CameraCalibration = {
      fovRad: 2.1045395113876513,
      fovAxis: 'height',
      fovSigmaRad: fromDeg(0.01),
      imageWidthSourcePx: 4561,
      imageHeightSourcePx: 64,
    };
    const offset = { rightRad: -MAX_RAY_OFFSET_RAD, upRad: 0 };
    const forward = rayOffsetToPoint(layout, calibration, offset);
    expect(forward.ok && forward.value.insideElement && forward.value.onImage).toBe(true);
    if (!forward.ok) return;
    const unchecked = offsetOfPixel(layout, focal(layout, calibration), forward.value.point);
    const overshoot = Math.abs(unchecked.rightRad) - MAX_RAY_OFFSET_RAD;
    expect(overshoot).toBeGreaterThan(0);
    expect(overshoot).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(unchecked.rightRad - offset.rightRad)).toBeLessThanOrEqual(1e-9);
    expect(pointToRayOffset(layout, calibration, forward.value.point)).toEqual({
      ok: false,
      reason: 'outside_field_of_view',
    });
  });

  it('does not throw for a hostile layout and names the field', () => {
    const bad = { ...layoutOf('cover'), elementWidthPx: Number.NaN };
    expect(pointToRayOffset(bad, CALIBRATION, { xPx: 1, yPx: 1 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'elementWidthPx',
    });
  });
});

describe('rayOffsetToPoint (Req 5.3, 5.5)', () => {
  it('is the inverse at the centre and at a known offset', () => {
    const layout = layoutOf('cover');
    const f = focal(layout, CALIBRATION);
    const centre = rayOffsetToPoint(layout, CALIBRATION, { rightRad: 0, upRad: 0 });
    expect(centre).toEqual({
      ok: true,
      value: { point: { xPx: 195, yPx: 422 }, insideElement: true, onImage: true },
    });
    const offset = rayOffsetToPoint(layout, CALIBRATION, {
      rightRad: fromDeg(10),
      upRad: fromDeg(-5),
    });
    expect(offset.ok).toBe(true);
    if (!offset.ok) return;
    expect(Math.abs(offset.value.point.xPx - (195 + f * Math.tan(fromDeg(10))))).toBeLessThan(1e-9);
    expect(Math.abs(offset.value.point.yPx - (422 + f * Math.tan(fromDeg(5))))).toBeLessThan(1e-9);
  });

  it('reports a point outside the Element and one on a contain bar', () => {
    const cover = rayOffsetToPoint(layoutOf('cover'), CALIBRATION, {
      rightRad: fromDeg(60),
      upRad: 0,
    });
    expect(cover.ok && !cover.value.insideElement && !cover.value.onImage).toBe(true);
    const contain = rayOffsetToPoint(layoutOf('contain'), CALIBRATION, {
      rightRad: 0,
      upRad: fromDeg(35),
    });
    expect(contain.ok).toBe(true);
    if (contain.ok) {
      expect(contain.value.insideElement).toBe(true);
      expect(contain.value.onImage).toBe(false);
    }
  });

  it('names rightRad or upRad for NaN, infinite and beyond the limit', () => {
    const layout = layoutOf('cover');
    const at = (rightRad: number, upRad: number) =>
      rayOffsetToPoint(layout, CALIBRATION, { rightRad, upRad });
    expect(at(Number.NaN, 0)).toEqual({ ok: false, reason: 'invalid_number', field: 'rightRad' });
    expect(at(0, Infinity)).toEqual({ ok: false, reason: 'invalid_number', field: 'upRad' });
    expect(at(MAX_RAY_OFFSET_RAD + 1e-9, 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'rightRad',
    });
    expect(at(0, -MAX_RAY_OFFSET_RAD - 1e-9)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'upRad',
    });
    expect(at(MAX_RAY_OFFSET_RAD, -MAX_RAY_OFFSET_RAD).ok).toBe(true);
  });

  it('needs a calibration', () => {
    expect(rayOffsetToPoint(layoutOf('cover'), null, { rightRad: 0, upRad: 0 })).toEqual({
      ok: false,
      reason: 'calibration_missing',
    });
  });
});

describe('focalLengthPx', () => {
  it('is the displayed width over two tan(fov/2) for the width axis', () => {
    const layout = layoutOf('cover');
    const f = focalLengthPx(layout, 'width', fromDeg(60));
    expect(f.ok && Math.abs(f.value - 474.75 / 2 / Math.tan(fromDeg(30))) < 1e-9).toBe(true);
  });
});
