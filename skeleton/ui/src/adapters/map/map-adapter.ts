// The Map adapter (Req 15, design §7.11, D12, D13): a thin layer over the map library, injected.
// It declares the style once and only ever sets data. A Fix is drawn only through `setFix(fix)`,
// which writes the single result of `fixFeatures` (the Point and its 95 % ellipse) in one
// `setData` of one source; there is no operation that draws a Position as a Fix.

import type { Bearing, Fix } from '@alidade/core';
import {
  ELLIPSE_VERTEX_COUNT,
  MAP_ERROR_REPORT_INTERVAL_MS,
  WEDGE_ARC_STEP_RAD,
} from '../../defaults';
import { err, ok, type UiFailure, type UiResult } from '../../result';
import type { Timer, TimerHandle } from '../../components/timer';
import { bearingFeatures } from '../../math/map/bearing-features';
import { fixFeatures, type FixFeatureCollection } from '../../math/map/fix-features';
import { EMPTY_COLLECTION, type Feature, type FeatureCollection } from '../../math/map/geojson';
import { mapBounds } from '../../math/map/map-bounds';
import {
  buildMapStyle,
  GEOJSON_SOURCE_IDS,
  type GeoJsonSourceId,
  type TileSource,
} from '../../math/map/map-style';
import { observerFeatures, type MapObserver } from '../../math/map/observer-features';
import type { MapLibreLike, MapLike, SubscriptionLike } from './maplibre-types';

export type Unsubscribe = () => void;

export interface MapAdapter {
  setObservers(observers: readonly MapObserver[]): UiResult<void>;
  setBearings(bearings: readonly Bearing[], lineLengthM: number): UiResult<void>;
  /** The only way to draw a Fix: its Point and its 95 % ellipse, together (Req 15.5, 15.6). */
  setFix(fix: Fix): UiResult<void>;
  clearFix(): UiResult<void>;
  fitToFeatures(paddingPx: number): UiResult<void>;
  /** `tiles_unavailable` when a tile or a source fails, at most once per report interval. */
  onError(listener: (failure: UiFailure) => void): Unsubscribe;
  destroy(): void;
}

/** Validates a Tile source (Req 15.2), naming the first invalid field. */
export function checkTileSource(tiles: TileSource): UiResult<TileSource> {
  const templates = tiles.tileUrlTemplates;
  if (
    !Array.isArray(templates) ||
    templates.length === 0 ||
    !templates.every(
      (t) => typeof t === 'string' && t.includes('{z}') && t.includes('{x}') && t.includes('{y}'),
    )
  ) {
    return err('invalid_number', { field: 'tileUrlTemplates' });
  }
  if (typeof tiles.attribution !== 'string' || tiles.attribution.trim() === '') {
    return err('invalid_number', { field: 'attribution' });
  }
  for (const field of ['minZoom', 'maxZoom'] as const) {
    const z = tiles[field];
    if (!Number.isFinite(z) || z < 0 || z > 24) return err('invalid_number', { field });
  }
  if (tiles.minZoom > tiles.maxZoom) return err('invalid_number', { field: 'maxZoom' });
  if (!Number.isFinite(tiles.tileSizePx) || !(tiles.tileSizePx > 0)) {
    return err('invalid_number', { field: 'tileSizePx' });
  }
  return ok(tiles);
}

function nameOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const inner = (error as { error?: unknown }).error;
    const target = inner instanceof Error ? inner : error;
    const name = (target as { name?: unknown }).name;
    if (typeof name === 'string' && name !== '') return name;
  }
  return undefined;
}

/**
 * Creates the map in `container` with the style of `tiles` (or a plain background with none).
 * `map_unavailable` when the library cannot start (it throws without WebGL), with the error's
 * name in `errorName`; `invalid_number` naming a bad Tile source field. Never throws.
 */
export function createMapAdapter(
  lib: MapLibreLike,
  container: HTMLElement | string,
  tiles: TileSource | null,
  timer: Timer,
  errorReportIntervalMs: number = MAP_ERROR_REPORT_INTERVAL_MS,
): UiResult<MapAdapter> {
  if (tiles !== null) {
    const checked = checkTileSource(tiles);
    if (!checked.ok) return checked;
  }
  if (!Number.isFinite(errorReportIntervalMs) || !(errorReportIntervalMs >= 1)) {
    return err('invalid_number', { field: 'errorReportIntervalMs' });
  }
  let map: MapLike;
  try {
    map = lib.createMap({ container, style: buildMapStyle(tiles), interactive: true });
  } catch (error) {
    const name = nameOf(error);
    return err('map_unavailable', name === undefined ? {} : { errorName: name });
  }

  const latest: Record<GeoJsonSourceId, FeatureCollection> = {
    observers: EMPTY_COLLECTION,
    wedges: EMPTY_COLLECTION,
    bearings: EMPTY_COLLECTION,
    fix: EMPTY_COLLECTION,
  };
  let loaded = false;
  let destroyed = false;
  const listeners = new Set<(failure: UiFailure) => void>();
  let throttle: TimerHandle | null = null;
  const subscriptions: SubscriptionLike[] = [];

  /** Delivers `tiles_unavailable` to the listeners, at most once per interval (Req 15.8). */
  const report = (error: unknown): void => {
    if (destroyed || throttle !== null) return;
    const name = nameOf(error);
    const failure = err('tiles_unavailable', name === undefined ? {} : { errorName: name });
    for (const listener of [...listeners]) {
      try {
        listener(failure);
      } catch {
        // A throwing listener does not stop the others or the map.
      }
    }
    throttle = timer.start(() => {
      if (throttle !== null) timer.stop(throttle);
      throttle = null;
    }, errorReportIntervalMs);
  };

  /** Writes one source. `setData` may throw or return a promise that rejects: both are reported. */
  const write = (id: GeoJsonSourceId): UiResult<void> => {
    if (!loaded) return ok(undefined);
    try {
      const source = map.getSource(id);
      if (source === undefined) return err('map_unavailable', { field: id });
      const pending = source.setData(latest[id]);
      if (pending !== undefined && typeof pending.then === 'function') {
        pending.then(undefined, (error: unknown) => report(error));
      }
    } catch (error) {
      report(error);
    }
    return ok(undefined);
  };

  const store = (id: GeoJsonSourceId, collection: FeatureCollection): UiResult<void> => {
    latest[id] = collection;
    return write(id);
  };

  try {
    subscriptions.push(
      map.on('load', () => {
        if (destroyed || loaded) return;
        loaded = true;
        for (const id of GEOJSON_SOURCE_IDS) write(id);
      }),
      map.on('error', (event) => report(event)),
    );
  } catch (error) {
    try {
      map.remove();
    } catch {
      // Already failing; the failure below is what the caller sees.
    }
    const name = nameOf(error);
    return err('map_unavailable', name === undefined ? {} : { errorName: name });
  }

  const gone = (): UiResult<never> => err('action_not_available');

  return ok({
    setObservers(observers) {
      if (destroyed) return gone();
      const built = observerFeatures(observers);
      return built.ok ? store('observers', built.value) : built;
    },
    setBearings(bearings, lineLengthM) {
      if (destroyed) return gone();
      const lines: Feature[] = [];
      const wedges: Feature[] = [];
      for (const bearing of bearings) {
        const built = bearingFeatures(bearing, lineLengthM, WEDGE_ARC_STEP_RAD);
        if (!built.ok) return built;
        for (const f of built.value.features)
          (f.properties.kind === 'bearing-wedge' ? wedges : lines).push(f);
      }
      latest.wedges = { type: 'FeatureCollection', features: wedges };
      const w = write('wedges');
      const l = store('bearings', { type: 'FeatureCollection', features: lines });
      return w.ok ? l : w;
    },
    setFix(fix) {
      if (destroyed) return gone();
      const built: UiResult<FixFeatureCollection> = fixFeatures(fix, ELLIPSE_VERTEX_COUNT);
      if (!built.ok) {
        // Any earlier Fix is cleared, so the map never shows a Fix the caller has replaced.
        store('fix', EMPTY_COLLECTION);
        return built;
      }
      return store('fix', built.value);
    },
    clearFix() {
      if (destroyed) return gone();
      return store('fix', EMPTY_COLLECTION);
    },
    fitToFeatures(paddingPx) {
      if (destroyed) return gone();
      if (!Number.isFinite(paddingPx) || paddingPx < 0)
        return err('invalid_number', { field: 'paddingPx' });
      const bounds = mapBounds(GEOJSON_SOURCE_IDS.map((id) => latest[id]));
      if (!bounds.ok) return bounds;
      const b = bounds.value;
      try {
        map.fitBounds(
          [
            [b.westDeg, b.southDeg],
            [b.eastDeg, b.northDeg],
          ],
          { padding: paddingPx, animate: false },
        );
      } catch (error) {
        const name = nameOf(error);
        return err('map_unavailable', name === undefined ? {} : { errorName: name });
      }
      return ok(undefined);
    },
    onError(listener) {
      if (destroyed) return () => undefined;
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (throttle !== null) timer.stop(throttle);
      throttle = null;
      for (const s of subscriptions.splice(0)) {
        try {
          s.unsubscribe();
        } catch {
          // Removing a listener of a map that is going away cannot fail usefully.
        }
      }
      listeners.clear();
      try {
        map.remove();
      } catch {
        // The map is dropped either way.
      }
    },
  });
}
