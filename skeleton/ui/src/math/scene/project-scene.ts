// The Scene image's geometry (Req 16.3, 16.4, design D14, §7.13): each Target's Pixel point from
// the true Device rotation, through Sensors' inverse of the Off-axis ray and the image geometry of
// Req 5. The UI holds no rotation matrix of its own.

import {
  cameraAxis,
  directionApparentAltitudeRad,
  directionAzimuthRad,
  rayOffsetOfDirection,
  type DeviceRotation,
  type EnuDirection,
} from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';
import { fromDeg } from '../degrees';
import { displayedFocalPx, rayOffsetToPoint } from '../image-geometry';
import type { ImageLayout, PixelPoint } from '../image-layout';
import type { Station, SyntheticScene } from './scene';
import { targetDirection } from './target-direction';

export interface ProjectedTarget {
  readonly id: string;
  readonly kind: 'landmark' | 'sun';
  readonly label: string;
  /** `null` when the Target is behind the camera or beyond 80° of offset. */
  readonly point: PixelPoint | null;
  /**
   * In front of the camera, within `MAX_RAY_OFFSET_RAD`, inside the Element and on the image
   * (Req 16.3): a Target on a `contain` bar is not visible, so every visible Target can be tapped.
   */
  readonly visible: boolean;
  /** The Sun's radius in CSS pixels, `F · tan(angularRadius)`; `null` for a landmark. */
  readonly radiusPx: number | null;
}

export interface HorizonLine {
  readonly a: PixelPoint;
  readonly b: PixelPoint;
}

export interface ProjectedScene {
  readonly focalPx: number;
  readonly targets: readonly ProjectedTarget[];
  /** The horizon clipped to the part of the Element the image covers, or `null` when not in view. */
  readonly horizon: HorizonLine | null;
}

/** The East-North-Up unit vector of an azimuth and an apparent altitude. */
export function enuOf(azimuthRad: number, apparentAltitudeRad: number): EnuDirection {
  const c = Math.cos(apparentAltitudeRad);
  return {
    east: Math.sin(azimuthRad) * c,
    north: Math.cos(azimuthRad) * c,
    up: Math.sin(apparentAltitudeRad),
  };
}

/** Near level, the two horizon directions are this far either side of the camera's azimuth. */
const HORIZON_SPREAD_RAD = fromDeg(20);

/**
 * From this camera altitude on, the horizon is built from its foot (§7.13); below it, from the
 * pair. At 45° the foot is `F` from the centre, far enough to give the line's direction, and the
 * pair's points are within 80° of offset at every roll for altitudes up to 75°.
 */
export const HORIZON_FOOT_FROM_RAD = fromDeg(45);

/**
 * The infinite line through `p` and `q` clipped to `[0, w] × [0, h]` (Liang–Barsky), or `null`
 * when it misses the rectangle.
 */
export function clipLine(
  p: PixelPoint,
  q: PixelPoint,
  widthPx: number,
  heightPx: number,
): HorizonLine | null {
  const dx = q.xPx - p.xPx;
  const dy = q.yPx - p.yPx;
  let t0 = Number.NEGATIVE_INFINITY;
  let t1 = Number.POSITIVE_INFINITY;
  const edges: [number, number][] = [
    [-dx, p.xPx],
    [dx, widthPx - p.xPx],
    [-dy, p.yPx],
    [dy, heightPx - p.yPx],
  ];
  for (const [d, r] of edges) {
    if (d === 0) {
      if (r < 0) return null;
      continue;
    }
    const t = r / d;
    if (d < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (!(t0 <= t1) || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return {
    a: { xPx: p.xPx + t0 * dx, yPx: p.yPx + t0 * dy },
    b: { xPx: p.xPx + t1 * dx, yPx: p.yPx + t1 * dy },
  };
}

function pixelOf(
  layout: ImageLayout,
  scene: SyntheticScene,
  rotation: DeviceRotation,
  direction: EnuDirection,
): UiResult<{ point: PixelPoint; insideElement: boolean; onImage: boolean } | null> {
  const offset = rayOffsetOfDirection(rotation, direction);
  if (!offset.ok) return offset;
  if (offset.value === null) return ok(null);
  return rayOffsetToPoint(layout, scene.calibration, offset.value);
}

/** Projects every Target of `scene` seen from `station` with the camera at `trueRotation`. */
export function projectScene(
  scene: SyntheticScene,
  station: Station,
  trueRotation: DeviceRotation,
  layout: ImageLayout,
): UiResult<ProjectedScene> {
  const focal = displayedFocalPx(layout, scene.calibration);
  if (!focal.ok) return focal;
  const targets: ProjectedTarget[] = [];
  for (const target of scene.targets) {
    const direction = targetDirection(station, target);
    if (!direction.ok) return direction;
    const projected = pixelOf(
      layout,
      scene,
      trueRotation,
      enuOf(direction.value.azimuthRad, direction.value.apparentAltitudeRad),
    );
    if (!projected.ok) return projected;
    const radiusPx = target.kind === 'sun' ? focal.value * Math.tan(target.angularRadiusRad) : null;
    if (radiusPx !== null && !Number.isFinite(radiusPx))
      return err('invalid_number', { field: 'angularRadiusRad' });
    targets.push({
      id: target.id,
      kind: target.kind,
      label: target.label,
      point: projected.value === null ? null : projected.value.point,
      visible: projected.value !== null && projected.value.insideElement && projected.value.onImage,
      radiusPx,
    });
  }
  return ok({ focalPx: focal.value, targets, horizon: horizonOf(scene, trueRotation, layout) });
}

/** The part of the Element that the image covers (the whole Element under `cover`). */
function imageRect(layout: ImageLayout): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, layout.leftPx),
    y0: Math.max(0, layout.topPx),
    x1: Math.min(layout.elementWidthPx, layout.leftPx + layout.displayedWidthPx),
    y1: Math.min(layout.elementHeightPx, layout.topPx + layout.displayedHeightPx),
  };
}

/** A line through `p` and `q`, clipped to the part of the Element that the image covers. */
function clipToImage(p: PixelPoint, q: PixelPoint, layout: ImageLayout): HorizonLine | null {
  const r = imageRect(layout);
  const shift = (x: PixelPoint) => ({ xPx: x.xPx - r.x0, yPx: x.yPx - r.y0 });
  const clipped = clipLine(shift(p), shift(q), r.x1 - r.x0, r.y1 - r.y0);
  if (clipped === null) return null;
  return {
    a: { xPx: clipped.a.xPx + r.x0, yPx: clipped.a.yPx + r.y0 },
    b: { xPx: clipped.b.xPx + r.x0, yPx: clipped.b.yPx + r.y0 },
  };
}

/** The camera's own azimuth and altitude, or `null` when the camera points straight up or down. */
function cameraDirection(
  rotation: DeviceRotation,
): { azimuthRad: number; altitudeRad: number } | null {
  const axis = cameraAxis(rotation);
  if (!axis.ok) return null;
  const azimuth = directionAzimuthRad(axis.value);
  const altitude = directionApparentAltitudeRad(axis.value);
  if (!azimuth.ok || !altitude.ok) return null;
  return { azimuthRad: azimuth.value, altitudeRad: altitude.value };
}

/**
 * The horizon from two horizon points at the camera's azimuth ± 20° (for a camera near level),
 * unclipped. Internal; exported for the example test at the switch.
 */
export function horizonByPair(
  scene: SyntheticScene,
  rotation: DeviceRotation,
  layout: ImageLayout,
): readonly [PixelPoint, PixelPoint] | null {
  const camera = cameraDirection(rotation);
  if (camera === null) return null;
  const points: PixelPoint[] = [];
  for (const side of [-1, 1]) {
    const projected = pixelOf(
      layout,
      scene,
      rotation,
      enuOf(camera.azimuthRad + side * HORIZON_SPREAD_RAD, 0),
    );
    if (!projected.ok || projected.value === null) return null;
    points.push(projected.value.point);
  }
  const [p, q] = points;
  if (p === undefined || q === undefined) return null;
  if (Math.hypot(q.xPx - p.xPx, q.yPx - p.yPx) < 1e-12) return null;
  return [p, q];
}

/**
 * The horizon from its foot: the horizon point at the camera's own azimuth is the point of the
 * horizon line nearest the image centre (its angle from the Camera axis is the camera's altitude,
 * at any roll), so the line passes through it perpendicular to the segment from the centre.
 * Unclipped; two points of the line. Internal; exported for the example test at the switch.
 */
export function horizonByFoot(
  scene: SyntheticScene,
  rotation: DeviceRotation,
  layout: ImageLayout,
): readonly [PixelPoint, PixelPoint] | null {
  const camera = cameraDirection(rotation);
  if (camera === null) return null;
  const projected = pixelOf(layout, scene, rotation, enuOf(camera.azimuthRad, 0));
  if (!projected.ok || projected.value === null) return null;
  const foot = projected.value.point;
  const dx = foot.xPx - layout.elementWidthPx / 2;
  const dy = foot.yPx - layout.elementHeightPx / 2;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return null;
  // A unit vector along the line, perpendicular to the segment from the centre to the foot.
  return [foot, { xPx: foot.xPx - dy / length, yPx: foot.yPx + dx / length }];
}

function horizonOf(
  scene: SyntheticScene,
  rotation: DeviceRotation,
  layout: ImageLayout,
): HorizonLine | null {
  const camera = cameraDirection(rotation);
  if (camera === null) return null;
  const points =
    Math.abs(camera.altitudeRad) >= HORIZON_FOOT_FROM_RAD
      ? horizonByFoot(scene, rotation, layout)
      : horizonByPair(scene, rotation, layout);
  return points === null ? null : clipToImage(points[0], points[1], layout);
}
