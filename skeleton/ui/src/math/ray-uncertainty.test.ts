import { describe, expect, it } from 'vitest';
import type { CameraCalibration } from './camera-calibration';
import { fromDeg } from './degrees';
import { imageLayout } from './image-layout';
import { imageAngularSigmaRad } from './ray-uncertainty';

/**
 * A 1000 × 2000 source shown 1:1 in a 1000 × 2000 element, field of view 90° along the width:
 * F = (1000 / 2) / tan(45°) = 500 CSS pixels exactly.
 */
const CALIBRATION: CameraCalibration = {
  fovRad: Math.PI / 2,
  fovAxis: 'width',
  fovSigmaRad: fromDeg(1),
  imageWidthSourcePx: 1000,
  imageHeightSourcePx: 2000,
};

function layout() {
  const result = imageLayout(
    { widthSourcePx: 1000, heightSourcePx: 2000 },
    { widthPx: 1000, heightPx: 2000 },
    'cover',
  );
  if (!result.ok) throw new Error('layout');
  return result.value;
}

describe('imageAngularSigmaRad (Req 6.1, 6.2, 6.6)', () => {
  it('is tapSigmaPx / F at the centre: 1/500 for F = 500 and tapSigmaPx = 1 (Req 6.6)', () => {
    const result = imageAngularSigmaRad(layout(), CALIBRATION, { xPx: 500, yPx: 1000 }, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Math.abs(result.value - 1 / 500)).toBeLessThanOrEqual(1e-12);
  });

  it('has no lens part at the centre and no finger part for tapSigmaPx = 0', () => {
    const centre = imageAngularSigmaRad(layout(), CALIBRATION, { xPx: 500, yPx: 1000 }, 0);
    expect(centre).toEqual({ ok: true, value: 0 });
    // Off the centre with a perfect finger, only the lens remains: by hand at r = 500 = F.
    const r = 500;
    const f = 500;
    const fPlus = 500 / Math.tan((CALIBRATION.fovRad + CALIBRATION.fovSigmaRad) / 2);
    const fMinus = 500 / Math.tan((CALIBRATION.fovRad - CALIBRATION.fovSigmaRad) / 2);
    const expected = Math.max(
      Math.abs(Math.atan(r / fPlus) - Math.atan(r / f)),
      Math.abs(Math.atan(r / fMinus) - Math.atan(r / f)),
    );
    const edge = imageAngularSigmaRad(layout(), CALIBRATION, { xPx: 1000, yPx: 1000 }, 0);
    expect(edge.ok && Math.abs(edge.value - expected) <= 1e-15).toBe(true);
    // About 0.5° (a 1° sigma on a 90° field changes the 45° angle by about half a degree).
    expect(expected).toBeGreaterThan(fromDeg(0.4));
    expect(expected).toBeLessThan(fromDeg(0.6));
  });

  it('adds the two parts in quadrature', () => {
    const point = { xPx: 1000, yPx: 1000 };
    const lens = imageAngularSigmaRad(layout(), CALIBRATION, point, 0);
    const both = imageAngularSigmaRad(layout(), CALIBRATION, point, 3);
    if (!lens.ok || !both.ok) throw new Error('unexpected failure');
    const tap = 3 / Math.hypot(500, 500);
    expect(Math.abs(both.value - Math.hypot(lens.value, tap))).toBeLessThanOrEqual(1e-15);
  });

  it('refuses a tapSigmaPx that is negative, NaN or infinite, naming it', () => {
    for (const tap of [-1, Number.NaN, Infinity, -Infinity, -1e-300]) {
      expect(imageAngularSigmaRad(layout(), CALIBRATION, { xPx: 1, yPx: 1 }, tap)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'tapSigmaPx',
      });
    }
  });

  it('passes the failures of the point through, and needs a calibration', () => {
    expect(imageAngularSigmaRad(layout(), null, { xPx: 1, yPx: 1 }, 1)).toEqual({
      ok: false,
      reason: 'calibration_missing',
    });
    expect(imageAngularSigmaRad(layout(), CALIBRATION, { xPx: -5, yPx: 1 }, 1)).toEqual({
      ok: false,
      reason: 'outside_image',
    });
    expect(imageAngularSigmaRad(layout(), CALIBRATION, { xPx: Number.NaN, yPx: 1 }, 1)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'xPx',
    });
  });
});
