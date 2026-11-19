// What the map screen gives UI's `MapView` (Req 5.5, 18.3, 18.7, design §7.18): the used observers
// and Bearings, the Fix (drawn with its ellipse by UI's `setFix`, never by Vigia), the length of
// the lines, and the two application layers that show the set-aside Sightings in grey dashes, so
// that a user sees which line was left out. No accuracy circle is drawn (Req 18.7).

import { destinationPosition, greatCircleDistanceM, type Bearing, type Fix } from '@alidade/core';
import { appFeature, type AppFeature, type AppLayer, type MapObserver } from '@alidade/ui';
import { err, ok, type VigiaResult } from '../../result';
import type { Assessment } from '../assessment/assess';
import { hasOnlyFiniteNumbers } from '../incident/incident-state';
import { checkParameters, type VigiaParameters } from '../parameters';

/** The two layers of the set-aside Sightings: with the wind Overlay's two, four of UI's eight. */
export const SET_ASIDE_LAYER_IDS = ['set-aside', 'set-aside-observers'] as const;

/** The grey of a Sighting that is not used. */
const SET_ASIDE_COLOUR = '#6B6B6B';
/** The length of a line with no Fix. */
const LINE_LENGTH_NO_FIX_M = 5000;
const LINE_LENGTH_FACTOR = 1.3;
const SHORTEST_LINE_M = 2000;
/** UI's longest line. */
const LONGEST_LINE_M = 500_000;

export interface MapModel {
  readonly observers: readonly MapObserver[];
  readonly bearings: readonly Bearing[];
  /** The Fix when the solve succeeded; UI draws its Point and 95 % ellipse together. */
  readonly fix: Fix | null;
  readonly lineLengthM: number;
  readonly layers: readonly AppLayer[];
}

/**
 * The map of an assessment. The line length is 5 000 m with no Fix, otherwise 1.3 times the
 * farthest used observer's distance to the Fix, clamped to `[2 000, 500 000]` m. Fails with
 * `invalid_number` naming a parameter, and with the failure of Core or of UI's `appFeature` for a
 * position it cannot use.
 */
export function mapModel(
  assessment: Assessment,
  parameters: VigiaParameters,
): VigiaResult<MapModel> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  const fix = assessment.fix?.ok ? assessment.fix.value : null;
  if (fix !== null && !hasOnlyFiniteNumbers(fix)) return err('invalid_number', { field: 'fix' });
  const used = assessment.used.map((e) => e.sighting.bearing);

  let lineLengthM = LINE_LENGTH_NO_FIX_M;
  if (fix !== null) {
    let farthestM = 0;
    for (const bearing of used) {
      const d = greatCircleDistanceM(bearing.observer, fix.position);
      if (!d.ok) return d;
      farthestM = Math.max(farthestM, d.value);
    }
    lineLengthM = Math.min(
      Math.max(LINE_LENGTH_FACTOR * farthestM, SHORTEST_LINE_M),
      LONGEST_LINE_M,
    );
  }

  const lines: AppFeature[] = [];
  const markers: AppFeature[] = [];
  for (const { entry } of assessment.setAside) {
    const { sightingId, bearing } = entry.sighting;
    const end = destinationPosition(bearing.observer, bearing.azimuthRad, lineLengthM);
    if (!end.ok) return end;
    const line = appFeature('set-aside', sightingId, {
      type: 'line',
      positions: [bearing.observer, end.value],
    });
    if (!line.ok) return err(line.reason, { field: line.field, id: sightingId });
    const marker = appFeature('set-aside-observer', sightingId, {
      type: 'point',
      position: bearing.observer,
    });
    if (!marker.ok) return err(marker.reason, { field: marker.field, id: sightingId });
    lines.push(line.value);
    markers.push(marker.value);
  }

  return ok({
    observers: assessment.used.map((e) => ({
      id: e.sighting.sightingId,
      position: e.sighting.bearing.observer,
    })),
    bearings: used,
    fix,
    lineLengthM,
    layers: [
      {
        id: SET_ASIDE_LAYER_IDS[0],
        collection: { type: 'FeatureCollection', features: lines },
        paint: { kind: 'line', colour: SET_ASIDE_COLOUR, widthPx: 3, dash: [4, 3] },
      },
      {
        id: SET_ASIDE_LAYER_IDS[1],
        collection: { type: 'FeatureCollection', features: markers },
        paint: { kind: 'circle', colour: SET_ASIDE_COLOUR, radiusPx: 5 },
      },
    ],
  });
}
