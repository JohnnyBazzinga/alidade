// Shared fast-check generators (design §8). Each documents the domain it draws from and what it
// excludes (testing.md rule 4).

import { MAX_RAY_OFFSET_RAD, type RayOffset } from '@alidade/sensors';
import fc from 'fast-check';
import type { CameraCalibration } from '../math/camera-calibration';
import { displayedFocalPx } from '../math/image-geometry';
import {
  imageLayout,
  type ImageFit,
  type ImageLayout,
  type PixelPoint,
  type PixelSize,
  type SourceSize,
} from '../math/image-layout';

const TWO_POW_53 = 2 ** 53;

/**
 * A double drawn uniformly from [min, max). `fc.double` is not used for this: it draws evenly
 * over the representable doubles, so most of its draws are tiny in magnitude. 53 random bits
 * give a uniform fraction; `noBias` stops fast-check favouring small integers (and so `min`).
 */
export function uniform(min: number, max: number): fc.Arbitrary<number> {
  return fc.noBias(fc.integer({ min: 0, max: TWO_POW_53 - 1 })).map((n) => {
    const value = min + (max - min) * (n / TWO_POW_53);
    return value < max ? value : min; // rounding can reach max; keep the interval half-open
  });
}

/** A double uniform in [min, max], with both ends drawn on purpose (one draw in ten). */
export function closed(min: number, max: number): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(min, max) },
    { weight: 9, arbitrary: uniform(min, max) },
  );
}

/** An integer uniform in [min, max] (`noBias`, so that the ends are not favoured). */
export function uniformInteger(min: number, max: number): fc.Arbitrary<number> {
  return fc.noBias(fc.integer({ min, max }));
}

// ---------------------------------------------------------------------------------------------
// Image geometry (design §8)

const DEG = Math.PI / 180;

/** `sourceSize`: width and height integers in [64, 8192], the ends included. Excludes the rest. */
export function sourceSize(): fc.Arbitrary<SourceSize> {
  const side = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(64, 8192) },
    { weight: 6, arbitrary: uniformInteger(64, 8192) },
  );
  return fc.record({ widthSourcePx: side, heightSourcePx: side });
}

/** `elementSize`: width and height real in [64, 4096], the ends included. Excludes the rest. */
export function elementSize(): fc.Arbitrary<PixelSize> {
  return fc.record({ widthPx: closed(64, 4096), heightPx: closed(64, 4096) });
}

/**
 * `calibration`, for a given Source image: `fovRad` in [20°, 150°], `fovSigmaRad` in
 * [0.01°, 5°] (ends drawn), `fovAxis` each of the three, and an image size that is either the
 * source's own or a positive multiple `k` in [0.25, 4] of it (so the aspect ratio matches and
 * the size differs, Req 5.7; the draw that exposes a focal length taken from the wrong size).
 * Excludes calibrations whose aspect ratio differs (examples of their own).
 */
export function calibrationFor(source: SourceSize): fc.Arbitrary<CameraCalibration> {
  return fc
    .record({
      fovRad: closed(20 * DEG, 150 * DEG),
      fovAxis: fc.constantFrom('width' as const, 'height' as const, 'diagonal' as const),
      fovSigmaRad: closed(0.01 * DEG, 5 * DEG),
      k: fc.oneof(fc.constant(1), closed(0.25, 4)),
    })
    .map(({ k, ...rest }) => ({
      ...rest,
      imageWidthSourcePx: source.widthSourcePx * k,
      imageHeightSourcePx: source.heightSourcePx * k,
    }));
}

export interface LayoutCase {
  readonly source: SourceSize;
  readonly element: PixelSize;
  readonly fit: ImageFit;
  readonly calibration: CameraCalibration;
  readonly layout: ImageLayout;
  /** The focal length in CSS pixels of the calibration's field of view on the displayed image. */
  readonly focalPx: number;
}

/**
 * The ill-conditioned corner (design §7.4): a source 8192 × 64 (or 64 × 8192) shown under
 * `contain` in an Element 64 × 4096 (or 4096 × 64), field of view 150° along the short axis of
 * the source, so that the displayed short side is 0.5 CSS pixels and `F ≈ 0.067`.
 * (The first design said "the element at its largest": that gives a displayed side of 32
 * pixels, not 0.5; the corner needs the Element's width, not its height, at the smallest.)
 */
function illConditionedCase(): fc.Arbitrary<{
  source: SourceSize;
  element: PixelSize;
  fit: ImageFit;
  fovAxis: 'width' | 'height';
}> {
  return fc.constantFrom(
    {
      source: { widthSourcePx: 8192, heightSourcePx: 64 },
      element: { widthPx: 64, heightPx: 4096 },
      fit: 'contain' as const,
      fovAxis: 'height' as const,
    },
    {
      source: { widthSourcePx: 64, heightSourcePx: 8192 },
      element: { widthPx: 4096, heightPx: 64 },
      fit: 'contain' as const,
      fovAxis: 'width' as const,
    },
  );
}

function build(
  source: SourceSize,
  element: PixelSize,
  fit: ImageFit,
  calibration: CameraCalibration,
): LayoutCase {
  const layout = imageLayout(source, element, fit);
  if (!layout.ok) throw new Error(`generator produced an invalid layout: ${layout.reason}`);
  const focal = displayedFocalPx(layout.value, calibration);
  if (!focal.ok) throw new Error(`generator produced an invalid calibration: ${focal.reason}`);
  return { source, element, fit, calibration, layout: layout.value, focalPx: focal.value };
}

/**
 * `layoutCase`: a `sourceSize`, an `elementSize`, `fit` each of two, a `calibration` for the
 * source, and its layout. One draw in four is the ill-conditioned corner above (with
 * `fovRad = 150°`, a size of the calibration equal to the source's or a multiple of it).
 */
export function layoutCase(): fc.Arbitrary<LayoutCase> {
  const ordinary = fc
    .tuple(sourceSize(), elementSize(), fc.constantFrom('cover' as const, 'contain' as const))
    .chain(([source, element, fit]) =>
      calibrationFor(source).map((calibration) => build(source, element, fit, calibration)),
    );
  const corner = illConditionedCase().chain(({ source, element, fit, fovAxis }) =>
    calibrationFor(source).map((calibration) =>
      build(source, element, fit, { ...calibration, fovAxis, fovRad: 150 * DEG }),
    ),
  );
  return fc.oneof({ weight: 3, arbitrary: ordinary }, { weight: 1, arbitrary: corner });
}

export interface PointCase extends LayoutCase {
  readonly offset: RayOffset;
  readonly point: PixelPoint;
}

/** The largest offset the generator draws for `pointInOffsetSpace`: 79° (Req 5.7). */
export const POINT_OFFSET_LIMIT_RAD = 79 * DEG;

/**
 * `pointInOffsetSpace`: a `rightRad`, `upRad` uniform (ends drawn) over the offsets, within
 * ±`limitRad` (79° by default; P-6.5 uses 75°), whose Pixel point lies inside the Element and, under `contain`, on the displayed image.
 * Drawing in offset space, not pixel space, makes the `F ≈ 0.07` case produce points at all (all
 * of them lie within `5 F` of the centre); the range of each offset is cut to the visible
 * rectangle so that nothing is discarded. Every layout contains the centre, so the range is
 * never empty. Excludes points outside the Element or on a bar (examples of their own).
 */
export function pointInOffsetSpace(
  c: LayoutCase,
  limitRad: number = POINT_OFFSET_LIMIT_RAD,
): fc.Arbitrary<PointCase> {
  const { layout, focalPx } = c;
  const ew = layout.elementWidthPx;
  const eh = layout.elementHeightPx;
  const xMin = c.fit === 'contain' ? Math.max(0, layout.leftPx) : 0;
  const xMax = c.fit === 'contain' ? Math.min(ew, layout.leftPx + layout.displayedWidthPx) : ew;
  const yMin = c.fit === 'contain' ? Math.max(0, layout.topPx) : 0;
  const yMax = c.fit === 'contain' ? Math.min(eh, layout.topPx + layout.displayedHeightPx) : eh;
  const range = (lo: number, hi: number, centre: number) => {
    const a = Math.max(-limitRad, Math.atan((lo - centre) / focalPx));
    const b = Math.min(limitRad, Math.atan((hi - centre) / focalPx));
    return closed(Math.min(a, 0), Math.max(b, 0));
  };
  return fc
    .record({
      rightRad: range(xMin, xMax, ew / 2),
      // `y` grows downward: up = atan(-(y - eh/2)/F), so the up range is the mirrored y range.
      upRad: range(-yMax, -yMin, -eh / 2),
    })
    .map((offset) => {
      const point = {
        xPx: ew / 2 + focalPx * Math.tan(offset.rightRad),
        yPx: eh / 2 - focalPx * Math.tan(offset.upRad),
      };
      return { ...c, offset, point };
    });
}

/** `rayOffset`: `rightRad`, `upRad` each in [-80°, 80°], ends and 0 drawn. */
export function rayOffset(): fc.Arbitrary<RayOffset> {
  return fc.record({
    rightRad: fc.oneof(
      { weight: 1, arbitrary: fc.constant(0) },
      { weight: 9, arbitrary: closed(-MAX_RAY_OFFSET_RAD, MAX_RAY_OFFSET_RAD) },
    ),
    upRad: fc.oneof(
      { weight: 1, arbitrary: fc.constant(0) },
      { weight: 9, arbitrary: closed(-MAX_RAY_OFFSET_RAD, MAX_RAY_OFFSET_RAD) },
    ),
  });
}

/**
 * `fieldOfViewStressCase` (P-5.15): a tall source (64 wide, 4096 to 8192 high) in a narrow, tall
 * Element (64 to 128 wide, 1024 to 4096 high), either fit, the field of view along the width
 * (120° to 150°). The displayed width is then about the Element's width, so `F` is a few pixels
 * and the vertical offsets of the Element's far points exceed 80°: the case in which a point on
 * the image is refused for its field of view, which the ordinary draws reach in about 0.6 % of
 * draws. Excluded from every other property (it is a narrow family, not the general domain).
 */
export function fieldOfViewStressCase(): fc.Arbitrary<LayoutCase> {
  return fc
    .record({
      heightSourcePx: uniformInteger(4096, 8192),
      widthPx: closed(64, 128),
      heightPx: closed(1024, 4096),
      fit: fc.constantFrom('cover' as const, 'contain' as const),
      fovRad: closed(120 * DEG, 150 * DEG),
    })
    .chain(({ heightSourcePx, widthPx, heightPx, fit, fovRad }) => {
      const source = { widthSourcePx: 64, heightSourcePx };
      return calibrationFor(source).map((calibration) =>
        build(source, { widthPx, heightPx }, fit, { ...calibration, fovAxis: 'width', fovRad }),
      );
    });
}
