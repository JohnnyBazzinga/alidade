// The wind arrow on the map (design §7.16, Req 13.3, 18.4; the lead's decision of 2026-11-22).
//
// Where it is drawn. The arrow is anchored on the Fix (with no Fix, on the midpoint of the
// observers) and not on the rounded request point, which can lie several kilometres from it. It
// stands on the line through the anchor along the wind, entirely outside the circle that holds the
// Fix's 95 % ellipse, with a gap of half its length between that circle and its nearer end. So it
// never covers the Fix or the ellipse, and it points either away from them (downwind side) or at
// them (upwind side). The side is the downwind one unless that would leave the part of the map the
// observers and the ellipse already fit (the box of the observers and the circle, made as wide as it
// is tall when it is taller: a map at least as wide as it is tall shows at least that); then the
// upwind one if that stays inside; if neither does, the downwind one.
//
// How large. Its length is 15 % of the length of the map's lines, and at least 300 m. The head is
// two strokes 0.3 of the length long, 30 degrees off straight back from the tip.
//
// What it does not do. The layers set no `fit`, so the map is fitted to the same things with or
// without it, and UI draws application layers under its own, so the Fix, its point and its ellipse
// are on top of it.

import {
  destinationPosition,
  isSupportedPosition,
  projectToLocalPlane,
  wrapTwoPi,
  type Position,
} from '@alidade/core';
import { appFeature, type AppFeature, type AppLayer } from '@alidade/ui';
import { err, ok, type VigiaResult } from '../../../result';
import type { WindReading } from './wind-parse';

/** The two layers of the wind Overlay: with the model's two, four of UI's eight. */
export const WIND_LAYER_IDS = ['wind', 'wind-head'] as const;

/** The shortest the arrow is drawn, in metres. */
export const WIND_ARROW_MIN_LENGTH_M = 300;
/** The arrow's length as a share of the length of the map's lines. */
const ARROW_LINE_FRACTION = 0.15;
/** The gap between the ellipse's circle and the arrow, as a share of its length. */
const GAP_FRACTION = 0.5;
/** The length of each stroke of the head, as a share of the arrow's length. */
const WING_FRACTION = 0.3;
/** The head's strokes leave the tip at this angle from the direction of travel: 30 degrees off straight back. */
const WING_ANGLE_RAD = (5 * Math.PI) / 6;
const WIND_COLOUR = '#0B4F8A';
const WIND_WIDTH_PX = 4;

/** What the arrow is placed against. */
export interface WindDrawing {
  /** The Fix, or the midpoint of the observers. */
  readonly anchor: Position;
  /** The semi-major axis of the Fix's 95 % ellipse, metres; `0` with no Fix. */
  readonly clearRadiusM: number;
  /** The length of the map's lines, metres. */
  readonly lineLengthM: number;
  /** The used observers (they decide what part of the map is certain to be in view). */
  readonly observers: readonly Position[];
}

export interface WindArrow {
  /** `downwind`: beyond the Fix in the direction the wind blows. `upwind`: on the side it comes from, pointing at the Fix. */
  readonly side: 'downwind' | 'upwind';
  readonly tail: Position;
  readonly tip: Position;
  readonly wingA: Position;
  readonly wingB: Position;
  readonly lengthM: number;
  /** The gap between the circle of the ellipse and the nearer end. */
  readonly gapM: number;
}

interface Region {
  readonly minEastM: number;
  readonly maxEastM: number;
  readonly minNorthM: number;
  readonly maxNorthM: number;
}

/** The part of the map that is certain to be in view, relative to the anchor. */
function visibleRegion(drawing: WindDrawing): VigiaResult<Region> {
  let minE = -drawing.clearRadiusM;
  let maxE = drawing.clearRadiusM;
  let minN = -drawing.clearRadiusM;
  let maxN = drawing.clearRadiusM;
  for (const observer of drawing.observers) {
    const p = projectToLocalPlane(drawing.anchor, observer);
    if (!p.ok) return p;
    minE = Math.min(minE, p.value.eastM);
    maxE = Math.max(maxE, p.value.eastM);
    minN = Math.min(minN, p.value.northM);
    maxN = Math.max(maxN, p.value.northM);
  }
  const width = maxE - minE;
  const height = maxN - minN;
  if (height > width) {
    const centre = (minE + maxE) / 2;
    minE = centre - height / 2;
    maxE = centre + height / 2;
  }
  return ok({ minEastM: minE, maxEastM: maxE, minNorthM: minN, maxNorthM: maxN });
}

/** The vertices of an arrow with its tip `tipM` along `directionRad` from the anchor, in the local plane. */
function planarVertices(
  toRad: number,
  tailM: number,
  tipM: number,
  wingM: number,
): readonly (readonly [number, number])[] {
  const along = (distanceM: number): readonly [number, number] => [
    distanceM * Math.sin(toRad),
    distanceM * Math.cos(toRad),
  ];
  const tip = along(tipM);
  const wing = (turn: number): readonly [number, number] => [
    tip[0] + wingM * Math.sin(toRad + turn),
    tip[1] + wingM * Math.cos(toRad + turn),
  ];
  return [along(tailM), tip, wing(WING_ANGLE_RAD), wing(-WING_ANGLE_RAD)];
}

function inside(region: Region, vertices: readonly (readonly [number, number])[]): boolean {
  return vertices.every(
    ([e, n]) =>
      e >= region.minEastM &&
      e <= region.maxEastM &&
      n >= region.minNorthM &&
      n <= region.maxNorthM,
  );
}

/**
 * Where the arrow is, as described at the top of this file. Fails with `invalid_number` naming
 * `directionFromRad`, `clearRadiusM`, `lineLengthM` or `observers`, and `unsupported_position` for a
 * position that is not Supported.
 */
export function windArrow(reading: WindReading, drawing: WindDrawing): VigiaResult<WindArrow> {
  if (!Number.isFinite(reading.directionFromRad)) {
    return err('invalid_number', { field: 'directionFromRad' });
  }
  if (!Number.isFinite(drawing.clearRadiusM) || drawing.clearRadiusM < 0) {
    return err('invalid_number', { field: 'clearRadiusM' });
  }
  if (!Number.isFinite(drawing.lineLengthM) || drawing.lineLengthM <= 0) {
    return err('invalid_number', { field: 'lineLengthM' });
  }
  if (!isSupportedPosition(drawing.anchor) || !drawing.observers.every(isSupportedPosition)) {
    return err('unsupported_position');
  }

  const lengthM = Math.max(WIND_ARROW_MIN_LENGTH_M, ARROW_LINE_FRACTION * drawing.lineLengthM);
  const gapM = GAP_FRACTION * lengthM;
  const nearM = drawing.clearRadiusM + gapM;
  const farM = nearM + lengthM;
  const wingM = WING_FRACTION * lengthM;
  const to = wrapTwoPi(reading.directionFromRad + Math.PI);
  if (!to.ok) return to;
  const toRad = to.value;

  const region = visibleRegion(drawing);
  if (!region.ok) return region;
  const downwindFits = inside(region.value, planarVertices(toRad, nearM, farM, wingM));
  const upwindFits = inside(region.value, planarVertices(toRad, -farM, -nearM, wingM));
  const side = downwindFits || !upwindFits ? 'downwind' : 'upwind';

  // Distances from the anchor along the direction of travel: negative on the upwind side.
  const tailAlongM = side === 'downwind' ? nearM : -farM;
  const tipAlongM = side === 'downwind' ? farM : -nearM;
  const at = (alongM: number): VigiaResult<Position> =>
    alongM >= 0
      ? destinationPosition(drawing.anchor, toRad, alongM)
      : destinationPosition(drawing.anchor, toRad + Math.PI, -alongM);
  const tail = at(tailAlongM);
  const tip = at(tipAlongM);
  if (!tail.ok) return tail;
  if (!tip.ok) return tip;
  const wings: Position[] = [];
  for (const turn of [WING_ANGLE_RAD, -WING_ANGLE_RAD]) {
    const wingAzimuth = wrapTwoPi(toRad + turn);
    if (!wingAzimuth.ok) return wingAzimuth;
    const wing = destinationPosition(tip.value, wingAzimuth.value, wingM);
    if (!wing.ok) return wing;
    wings.push(wing.value);
  }
  const [wingA, wingB] = wings;
  if (wingA === undefined || wingB === undefined) return err('invalid_number');
  return ok({ side, tail: tail.value, tip: tip.value, wingA, wingB, lengthM, gapM });
}

function lineFeature(kind: string, positions: readonly Position[]): VigiaResult<AppFeature> {
  const feature = appFeature(kind, 'wind', { type: 'line', positions });
  return feature.ok ? ok(feature.value) : err(feature.reason, { field: feature.field });
}

/**
 * The two layers of the wind arrow: the shaft and the head, in one blue, none with `fit`.
 * Fails as `windArrow` does.
 */
export function windLayers(
  reading: WindReading,
  drawing: WindDrawing,
): VigiaResult<readonly AppLayer[]> {
  const arrow = windArrow(reading, drawing);
  if (!arrow.ok) return arrow;
  const shaft = lineFeature('wind-shaft', [arrow.value.tail, arrow.value.tip]);
  if (!shaft.ok) return shaft;
  const head = lineFeature('wind-head', [arrow.value.wingA, arrow.value.tip, arrow.value.wingB]);
  if (!head.ok) return head;
  const paint = { kind: 'line', colour: WIND_COLOUR, widthPx: WIND_WIDTH_PX } as const;
  return ok([
    {
      id: WIND_LAYER_IDS[0],
      collection: { type: 'FeatureCollection', features: [shaft.value] },
      paint,
    },
    {
      id: WIND_LAYER_IDS[1],
      collection: { type: 'FeatureCollection', features: [head.value] },
      paint,
    },
  ]);
}

/**
 * The middle of the observers on the sphere: the direction of the sum of their unit vectors, so
 * that observers either side of the antimeridian are not averaged through the other side of the
 * world. Fails with `invalid_number` naming `observers` for none, or for observers that cancel
 * (opposite sides of the Earth), and `unsupported_position` for one that is not Supported.
 */
export function observersMidpoint(observers: readonly Position[]): VigiaResult<Position> {
  if (observers.length === 0) return err('invalid_number', { field: 'observers' });
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of observers) {
    if (!isSupportedPosition(p)) return err('unsupported_position');
    x += Math.cos(p.latRad) * Math.cos(p.lonRad);
    y += Math.cos(p.latRad) * Math.sin(p.lonRad);
    z += Math.sin(p.latRad);
  }
  const norm = Math.hypot(x, y, z) / observers.length;
  if (!(norm > 1e-6)) return err('invalid_number', { field: 'observers' });
  // -π is the same meridian as π and is not a Supported longitude.
  const lonRad = Math.atan2(y, x);
  const midpoint = {
    latRad: Math.atan2(z, Math.hypot(x, y)),
    lonRad: lonRad <= -Math.PI ? Math.PI : lonRad,
  };
  return isSupportedPosition(midpoint) ? ok(midpoint) : err('unsupported_position');
}
