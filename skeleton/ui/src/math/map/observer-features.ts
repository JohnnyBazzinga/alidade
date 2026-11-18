// Observers on the map (Req 14.2).

import { isSupportedPosition, type Position } from '@alidade/core';
import { err, ok, type UiResult } from '../../result';
import { collection, feature, lonLat, type Feature, type FeatureCollection } from './geojson';

export interface MapObserver {
  readonly id: string;
  readonly position: Position;
}

/** One Point per observer, `kind: 'observer'`; an unsupported Position is `unsupported_position`. */
export function observerFeatures(observers: readonly MapObserver[]): UiResult<FeatureCollection> {
  const features: Feature[] = [];
  for (const observer of observers) {
    if (!isSupportedPosition(observer.position)) {
      return err('unsupported_position', { id: observer.id });
    }
    const coordinates = lonLat(observer.position);
    if (coordinates === null) return err('invalid_number', { id: observer.id });
    features.push(feature('observer', observer.id, { type: 'Point', coordinates }));
  }
  return ok(collection(features));
}
