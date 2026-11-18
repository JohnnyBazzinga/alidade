import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkCalibration } from '../math/camera-calibration';
import { pointToRayOffset } from '../math/image-geometry';
import {
  calibrationFor,
  closed,
  elementSize,
  fieldOfViewStressCase,
  layoutCase,
  POINT_OFFSET_LIMIT_RAD,
  pointInOffsetSpace,
  rayOffset,
  sourceSize,
  uniform,
  uniformInteger,
} from './generators';

function draw<T>(arbitrary: fc.Arbitrary<T>, n = 2000, seed = 11): T[] {
  return fc.sample(arbitrary, { numRuns: n, seed });
}

describe('uniform, closed, uniformInteger', () => {
  it('stay in their intervals and draw both ends of a closed one', () => {
    const half = draw(uniform(2, 5));
    expect(half.every((x) => x >= 2 && x < 5)).toBe(true);
    const both = draw(closed(-1, 1));
    expect(both.every((x) => x >= -1 && x <= 1)).toBe(true);
    expect(both).toContain(-1);
    expect(both).toContain(1);
    const ints = draw(uniformInteger(3, 7));
    expect(new Set(ints)).toEqual(new Set([3, 4, 5, 6, 7]));
  });
});

describe('sourceSize and elementSize (design §8)', () => {
  it('draw integer sources in [64, 8192] with the ends, and elements in [64, 4096]', () => {
    const sources = draw(sourceSize());
    for (const s of sources) {
      expect(Number.isInteger(s.widthSourcePx) && Number.isInteger(s.heightSourcePx)).toBe(true);
      expect(Math.min(s.widthSourcePx, s.heightSourcePx)).toBeGreaterThanOrEqual(64);
      expect(Math.max(s.widthSourcePx, s.heightSourcePx)).toBeLessThanOrEqual(8192);
    }
    expect(sources.some((s) => s.widthSourcePx === 64)).toBe(true);
    expect(sources.some((s) => s.heightSourcePx === 8192)).toBe(true);
    for (const e of draw(elementSize())) {
      expect(e.widthPx).toBeGreaterThanOrEqual(64);
      expect(e.widthPx).toBeLessThanOrEqual(4096);
      expect(e.heightPx).toBeGreaterThanOrEqual(64);
      expect(e.heightPx).toBeLessThanOrEqual(4096);
    }
  });
});

describe('calibrationFor', () => {
  it('draws valid calibrations whose size is the source or a multiple of it with its aspect', () => {
    const source = { widthSourcePx: 720, heightSourcePx: 1280 };
    const cals = draw(calibrationFor(source));
    for (const c of cals) {
      expect(checkCalibration(c).ok).toBe(true);
      expect(Math.abs(c.imageWidthSourcePx / c.imageHeightSourcePx - 720 / 1280)).toBeLessThan(
        1e-12,
      );
    }
    expect(cals.some((c) => c.imageWidthSourcePx === 720)).toBe(true);
    expect(cals.some((c) => c.imageWidthSourcePx !== 720)).toBe(true);
    expect(new Set(cals.map((c) => c.fovAxis))).toEqual(new Set(['width', 'height', 'diagonal']));
    expect(Math.min(...cals.map((c) => c.fovRad))).toBeGreaterThanOrEqual((20 * Math.PI) / 180);
    expect(Math.max(...cals.map((c) => c.fovRad))).toBeLessThanOrEqual((150 * Math.PI) / 180);
  });
});

describe('layoutCase and pointInOffsetSpace', () => {
  const cases = draw(
    layoutCase().chain((c) => pointInOffsetSpace(c)),
    3000,
  );

  it('draws the ill-conditioned corner about one time in four, with F near 0.067', () => {
    const corner = cases.filter((c) => c.focalPx < 0.1);
    expect(corner.length / cases.length).toBeGreaterThan(0.18);
    expect(corner.length / cases.length).toBeLessThan(0.32);
    for (const c of corner) {
      expect(c.focalPx).toBeGreaterThan(0.06);
      expect(c.fit).toBe('contain');
    }
  });

  it('draws both fits and the three axes in ordinary cases', () => {
    expect(new Set(cases.map((c) => c.fit))).toEqual(new Set(['cover', 'contain']));
    expect(new Set(cases.map((c) => c.calibration.fovAxis))).toEqual(
      new Set(['width', 'height', 'diagonal']),
    );
  });

  it('draws only points inside the Element and, under contain, on the image, within ±79°', () => {
    for (const c of cases) {
      const { layout, point, offset } = c;
      expect(Math.abs(offset.rightRad)).toBeLessThanOrEqual(POINT_OFFSET_LIMIT_RAD);
      expect(Math.abs(offset.upRad)).toBeLessThanOrEqual(POINT_OFFSET_LIMIT_RAD);
      expect(point.xPx).toBeGreaterThanOrEqual(-1e-9);
      expect(point.xPx).toBeLessThanOrEqual(layout.elementWidthPx + 1e-9);
      expect(point.yPx).toBeGreaterThanOrEqual(-1e-9);
      expect(point.yPx).toBeLessThanOrEqual(layout.elementHeightPx + 1e-9);
      // The checked function accepts every drawn point (so the generator discards nothing).
      expect(pointToRayOffset(layout, c.calibration, point).ok).toBe(true);
    }
  });

  it('draws points away from the centre and the centre itself', () => {
    expect(cases.some((c) => c.offset.rightRad === 0 && c.offset.upRad === 0)).toBe(false);
    const ordinary = cases.filter((c) => c.focalPx > 1);
    expect(ordinary.filter((c) => Math.abs(c.offset.rightRad) > 0.3).length).toBeGreaterThan(100);
  });
});

describe('rayOffset', () => {
  it('draws within ±80° and the ends', () => {
    const offsets = draw(rayOffset());
    const limit = (80 * Math.PI) / 180;
    expect(offsets.every((o) => Math.abs(o.rightRad) <= limit && Math.abs(o.upRad) <= limit)).toBe(
      true,
    );
    expect(offsets.some((o) => o.rightRad === limit)).toBe(true);
    expect(offsets.some((o) => o.upRad === -limit)).toBe(true);
    expect(offsets.some((o) => o.rightRad === 0)).toBe(true);
  });
});

describe('fieldOfViewStressCase', () => {
  it('draws layouts where the field of view refuses some points of the image and others not', () => {
    const reasons = new Set<string>();
    for (const c of draw(fieldOfViewStressCase(), 400)) {
      expect(c.calibration.fovAxis).toBe('width');
      expect(c.element.widthPx).toBeLessThanOrEqual(128);
      for (const x of [0, c.layout.elementWidthPx / 2]) {
        for (const y of [0, c.layout.elementHeightPx / 2, c.layout.elementHeightPx]) {
          const result = pointToRayOffset(c.layout, c.calibration, { xPx: x, yPx: y });
          reasons.add(result.ok ? 'ok' : result.reason);
        }
      }
    }
    expect(reasons).toEqual(new Set(['ok', 'outside_field_of_view', 'outside_image']));
  });
});
