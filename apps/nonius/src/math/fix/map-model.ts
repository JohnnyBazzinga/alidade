// What the Map screen gives UI's `MapView` (Req 9.4, 9.5, 11.4; design D16, §7.7): the Fix, drawn
// with its ellipse by UI's `setFix` alone, and five application layers. Two places are drawn by
// renaming the `kind` of each feature of UI's `fixFeatures`, with the geometry untouched.

import { ellipse95, type Position } from '@alidade/core';
import { appFeature, fixFeatures, type AppFeature, type AppLayer } from '@alidade/ui';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { CalibrationInUse } from '../sight/index-error';
import type { PreparedSight, SetAside } from '../sight/prepare';
import { circleArc } from '../sphere/circle-arc';
import { refractionRad } from '../sun/refraction';
import { subsolarPoint } from '../sun/sun-wrapper';
import type { Assessment } from './assess';
import type { Comparison } from './comparison';
import type { ShownFix } from './solve-candidate';

export const MAP_LAYER_IDS = [
  'circles-used',
  'circles-set-aside',
  'places-area',
  'places-point',
  'gps',
] as const;

/** Whether every number reachable in `value` is finite (a Fix holds only numbers, strings and lists). */
function hasOnlyFiniteNumbers(value: unknown, depth = 0): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth > 8 || typeof value !== 'object' || value === null) return true;
  return Object.values(value).every((v) => hasOnlyFiniteNumbers(v, depth + 1));
}

/** Vertices of the ellipse polygon of a place (UI asks for at least 16). Unit: count. */
const ELLIPSE_VERTEX_COUNT = 72;
const USED_COLOUR = '#1F4E9E';
const SET_ASIDE_COLOUR = '#6B6B6B';
const PLACE_COLOUR = '#9C4A00';
const GPS_COLOUR = '#0B6E4F';

export interface MapModel {
  /** The Fix, for UI's `setFix`; `null` with none and with Two places. */
  readonly fix: ShownFix | null;
  readonly layers: readonly AppLayer[];
}

interface Circle {
  readonly id: string;
  readonly subsolar: Position;
  readonly radiusRad: number;
}

function usedCircle(p: PreparedSight): Circle {
  return {
    id: p.sight.id,
    subsolar: p.subsolar,
    radiusRad: Math.PI / 2 - p.observedGeometricAltitudeRad,
  };
}

/** The Circle of a set-aside Sight, or `null` when it cannot be made (refraction's domain, the Sun's range). */
function setAsideCircle(
  entry: SetAside,
  calibration: CalibrationInUse,
  params: NoniusParameters,
): Circle | null {
  const sight = entry.sight;
  const correctedRad =
    calibration.kind === 'index_error'
      ? sight.rawApparentAltitudeRad - calibration.indexError.valueRad
      : sight.rawApparentAltitudeRad;
  const refraction = refractionRad(correctedRad);
  const subsolar = subsolarPoint(sight.timeUtcMs, params);
  if (!refraction.ok || !subsolar.ok) return null;
  return {
    id: sight.id,
    subsolar: subsolar.value,
    radiusRad: Math.PI / 2 - (correctedRad - refraction.value),
  };
}

function arcFeatures(
  kind: string,
  circle: Circle,
  suffix: string,
  near: ShownFix,
  params: NoniusParameters,
): NoniusResult<AppFeature[]> {
  const e95 = ellipse95(near.ellipse);
  if (!e95.ok) return err('invalid_number', { field: 'ellipse' });
  const arcs = circleArc(
    circle.subsolar,
    circle.radiusRad,
    near.position,
    params.circleArcHalfLengthFactor * e95.value.semiMajorM,
    params.circleArcStepRad,
  );
  // A Circle that cannot be drawn near this Fix (the Fix at its centre) is left out, not an error.
  if (!arcs.ok) return ok([]);
  const out: AppFeature[] = [];
  for (const [k, positions] of arcs.value.entries()) {
    const feature = appFeature(kind, `${circle.id}${suffix}#${k}`, { type: 'line', positions });
    if (!feature.ok) return err(feature.reason, { id: circle.id });
    out.push(feature.value);
  }
  return ok(out);
}

function layer(
  id: (typeof MAP_LAYER_IDS)[number],
  features: readonly AppFeature[],
  paint: AppLayer['paint'],
  fit = false,
): AppLayer {
  // MapView fits the map to a layer that says `fit` and holds something; an empty one would make
  // the fit fail on a map that draws nothing.
  return {
    id,
    collection: { type: 'FeatureCollection', features },
    paint,
    ...(fit && features.length > 0 ? { fit: true } : {}),
  };
}

/**
 * The map of an Assessment and a Comparison. With one sight or none nothing is drawn (the circle is
 * in words only). Fails with `invalid_number` naming a parameter, and with the failure of UI's
 * `fixFeatures` for an ellipse that cannot be drawn (Req 9.5; the words still carry it).
 */
export function mapModel(
  assessment: Assessment,
  comparison: Comparison | null,
  params: NoniusParameters,
): NoniusResult<MapModel> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;

  // Nothing that is not a finite number leaves this function (Req 2.6): a Fix is checked whole.
  const fixes =
    assessment.kind === 'fix'
      ? [assessment.fix]
      : assessment.kind === 'two_places'
        ? assessment.places.map((p) => p.fix)
        : [];
  for (const f of fixes) {
    if (!hasOnlyFiniteNumbers(f)) return err('invalid_number', { field: 'fix' });
  }

  const used: AppFeature[] = [];
  const setAside: AppFeature[] = [];
  const area: AppFeature[] = [];
  const point: AppFeature[] = [];
  let fix: ShownFix | null = null;

  if (assessment.kind === 'fix' || assessment.kind === 'two_places') {
    const nears: { readonly suffix: string; readonly fix: ShownFix }[] =
      assessment.kind === 'fix'
        ? [{ suffix: '', fix: assessment.fix }]
        : assessment.places.map((p) => ({ suffix: `-${p.label}`, fix: p.fix }));
    if (assessment.kind === 'fix') {
      const drawn = fixFeatures(assessment.fix, ELLIPSE_VERTEX_COUNT);
      if (!drawn.ok) return err(drawn.reason, { field: drawn.field });
      fix = assessment.fix;
    } else {
      for (const p of assessment.places) {
        const drawn = fixFeatures(p.fix, ELLIPSE_VERTEX_COUNT);
        if (!drawn.ok) return err(drawn.reason, { field: drawn.field });
        const [pointFeature, areaFeature] = drawn.value.features;
        point.push({
          type: 'Feature',
          id: `place-${p.label}`,
          geometry: pointFeature.geometry,
          properties: { kind: 'place-point', id: `place-${p.label}` },
        });
        area.push({
          type: 'Feature',
          id: `place-${p.label}-area`,
          geometry: areaFeature.geometry,
          properties: { kind: 'place-area', id: `place-${p.label}-area` },
        });
      }
    }
    for (const near of nears) {
      for (const p of assessment.used) {
        const made = arcFeatures('circle-used', usedCircle(p), near.suffix, near.fix, params);
        if (!made.ok) return made;
        used.push(...made.value);
      }
      for (const entry of assessment.setAside) {
        const circle = setAsideCircle(entry, assessment.calibration, params);
        if (circle === null) continue;
        const made = arcFeatures('circle-set-aside', circle, near.suffix, near.fix, params);
        if (!made.ok) return made;
        setAside.push(...made.value);
      }
    }
  }

  const gps: AppFeature[] = [];
  if (comparison !== null) {
    const marker = appFeature('gps', 'gps', { type: 'point', position: comparison.gps });
    if (!marker.ok) return err(marker.reason, { field: 'gps' });
    gps.push(marker.value);
  }

  return ok({
    fix,
    layers: [
      layer('circles-used', used, { kind: 'line', colour: USED_COLOUR, widthPx: 3 }, true),
      layer('circles-set-aside', setAside, {
        kind: 'line',
        colour: SET_ASIDE_COLOUR,
        widthPx: 3,
        dash: [4, 3],
      }),
      layer('places-area', area, { kind: 'fill', colour: PLACE_COLOUR, opacity: 0.25 }, true),
      layer('places-point', point, { kind: 'circle', colour: PLACE_COLOUR, radiusPx: 7 }),
      layer('gps', gps, { kind: 'circle', colour: GPS_COLOUR, radiusPx: 7 }, true),
    ],
  });
}
