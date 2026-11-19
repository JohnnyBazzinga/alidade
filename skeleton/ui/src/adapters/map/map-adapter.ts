// The Map adapter (Req 15, design §7.11, D12, D13): a thin layer over the map library, injected.
// It declares the style once and only ever sets data. A Fix is drawn only through `setFix(fix)`,
// which writes the single result of `fixFeatures` (the Point and its 95 % ellipse) in one
// `setData` of one source; there is no operation that draws a Position as a Fix.

import type { Bearing, Fix } from '@alidade/core';
import {
  ELLIPSE_VERTEX_COUNT,
  MAP_ERROR_REPORT_INTERVAL_MS,
  MAX_APP_LAYERS,
  WEDGE_ARC_STEP_RAD,
} from '../../defaults';
import { err, ok, type UiFailure, type UiResult } from '../../result';
import type { Timer, TimerHandle } from '../../components/timer';
import {
  appLayerKey,
  appLayerSpec,
  checkLayerCollection,
  checkLayerId,
  checkLayerPaint,
  type AppFeatureCollection,
  type LayerPaint,
} from '../../math/map/app-layer';
import { bearingFeatures } from '../../math/map/bearing-features';
import { fixFeatures, type FixFeatureCollection } from '../../math/map/fix-features';
import { EMPTY_COLLECTION, type Feature, type FeatureCollection } from '../../math/map/geojson';
import { mapBounds, type HasGeometries } from '../../math/map/map-bounds';
import {
  APP_LAYERS_BEFORE_ID,
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
  /**
   * Fits the map to what it draws. The application layers are included only through `extra`, the
   * collections the caller passes (Req 15.16).
   */
  fitToFeatures(paddingPx: number, extra?: readonly HasGeometries[]): UiResult<void>;
  /**
   * Draws a layer of the application's own, under every layer of the skeleton, in the order in
   * which the ids were first set (Req 15.14 to 15.16, design D31). `invalid_number` naming the
   * field for an `id`, a `paint`, a ninth layer (`layers`) or a `collection` that is not valid
   * (Req 15.15); the layer is then as it was. A feature of a skeleton kind is refused: a Fix is
   * drawn by `setFix` alone.
   */
  setLayer(id: string, collection: AppFeatureCollection, paint: LayerPaint): UiResult<void>;
  /** Removes an application layer; `ok` for an id that is not held. */
  clearLayer(id: string): UiResult<void>;
  /**
   * `tiles_unavailable` when a tile or a source fails, at most once per report interval;
   * `map_unavailable`, once, when the library's worker does not start (Req 15.18), after which
   * nothing more is reported, because the map draws nothing.
   */
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
  // Application layers (D31.4): what the caller asked for, in the order its ids were first set, and
  // what the live map holds (in order, with the paint and the data each was built or last written
  // with). `syncAppLayers` makes the second equal the first.
  const appLayers = new Map<string, { collection: AppFeatureCollection; paint: LayerPaint }>();
  const mappedOrder: string[] = [];
  const mappedPaint = new Map<string, string>();
  const mappedData = new Map<string, AppFeatureCollection>();
  const listeners = new Set<(failure: UiFailure) => void>();
  let throttle: TimerHandle | null = null;
  /** Set when the library's worker did not start (Req 15.18): the map can draw nothing. */
  let unavailable = false;
  const subscriptions: SubscriptionLike[] = [];

  const deliver = (failure: UiFailure): void => {
    for (const listener of [...listeners]) {
      try {
        listener(failure);
      } catch {
        // A throwing listener does not stop the others or the map.
      }
    }
  };

  /** Delivers `map_unavailable` once, and silences the tiles' reports from then on. */
  const reportUnavailable = (error: unknown): void => {
    if (destroyed || unavailable) return;
    unavailable = true;
    const name = nameOf(error);
    deliver(err('map_unavailable', name === undefined ? {} : { errorName: name }));
  };

  /** Delivers `tiles_unavailable` to the listeners, at most once per interval (Req 15.8). */
  const report = (error: unknown): void => {
    if (destroyed || unavailable || throttle !== null) return;
    const name = nameOf(error);
    deliver(err('tiles_unavailable', name === undefined ? {} : { errorName: name }));
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

  /** Removes one application layer and its source from the live map. Throws what the map throws. */
  const removeMapped = (id: string): void => {
    const key = appLayerKey(id);
    try {
      map.removeLayer(key);
      map.removeSource(key);
    } finally {
      const at = mappedOrder.indexOf(id);
      if (at !== -1) mappedOrder.splice(at, 1);
      mappedPaint.delete(id);
      mappedData.delete(id);
    }
  };

  /** Adds one application layer, with its data, before the skeleton's first data layer. */
  const addMapped = (
    id: string,
    layer: { collection: AppFeatureCollection; paint: LayerPaint },
  ): void => {
    const key = appLayerKey(id);
    map.addSource(key, { type: 'geojson', data: layer.collection });
    try {
      map.addLayer(appLayerSpec(id, layer.paint), APP_LAYERS_BEFORE_ID);
    } catch (error) {
      try {
        map.removeSource(key);
      } catch {
        // The source is left behind; the failure below is what the caller sees.
      }
      throw error;
    }
    mappedOrder.push(id);
    mappedPaint.set(id, JSON.stringify(layer.paint));
    mappedData.set(id, layer.collection);
  };

  /**
   * Makes the live map hold the layers in `appLayers`, in their order (D31.4): finds the first
   * place where the two differ in id or paint, removes the mapped layers from there to the end,
   * adds the wanted ones from there, and writes new data to the ones before it. Nothing is done
   * before the map has loaded. Throws what the map throws; the state it keeps is true.
   */
  const syncAppLayers = (): void => {
    if (!loaded) return;
    const wanted = [...appLayers.keys()];
    let same = 0;
    while (same < mappedOrder.length && same < wanted.length) {
      const id = wanted[same] as string;
      const layer = appLayers.get(id);
      if (
        mappedOrder[same] !== id ||
        layer === undefined ||
        mappedPaint.get(id) !== JSON.stringify(layer.paint)
      )
        break;
      same += 1;
    }
    while (mappedOrder.length > same) removeMapped(mappedOrder[mappedOrder.length - 1] as string);
    for (const id of wanted.slice(same)) {
      const layer = appLayers.get(id);
      if (layer !== undefined) addMapped(id, layer);
    }
    for (const id of wanted.slice(0, same)) {
      const layer = appLayers.get(id);
      if (layer === undefined || mappedData.get(id) === layer.collection) continue;
      mappedData.set(id, layer.collection);
      try {
        const source = map.getSource(appLayerKey(id));
        const pending = source?.setData(layer.collection);
        if (pending !== undefined && typeof pending.then === 'function') {
          pending.then(undefined, (error: unknown) => report(error));
        }
      } catch (error) {
        report(error);
      }
    }
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
        try {
          syncAppLayers();
        } catch (error) {
          report(error);
        }
      }),
      map.on('error', (event) => report(event)),
      map.on('unavailable', (event) => reportUnavailable(event)),
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
    fitToFeatures(paddingPx, extra) {
      if (destroyed) return gone();
      if (!Number.isFinite(paddingPx) || paddingPx < 0)
        return err('invalid_number', { field: 'paddingPx' });
      const bounds = mapBounds([
        ...GEOJSON_SOURCE_IDS.map((id) => latest[id]),
        ...(Array.isArray(extra) ? extra : []),
      ]);
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
    setLayer(id, collection, paint) {
      if (destroyed) return gone();
      const checkedId = checkLayerId(id);
      if (!checkedId.ok) return checkedId;
      const checkedPaint = checkLayerPaint(paint);
      if (!checkedPaint.ok) return checkedPaint;
      if (!appLayers.has(id) && appLayers.size >= MAX_APP_LAYERS)
        return err('invalid_number', { field: 'layers' });
      const checkedCollection = checkLayerCollection(collection);
      if (!checkedCollection.ok) return checkedCollection;
      const previous = appLayers.get(id);
      appLayers.set(id, { collection: checkedCollection.value, paint: checkedPaint.value });
      try {
        syncAppLayers();
      } catch (error) {
        if (previous === undefined) appLayers.delete(id);
        else appLayers.set(id, previous);
        try {
          syncAppLayers();
        } catch {
          // The map is left as it is; the next call makes it match again.
        }
        const name = nameOf(error);
        return err('map_unavailable', name === undefined ? {} : { errorName: name });
      }
      return ok(undefined);
    },
    clearLayer(id) {
      if (destroyed) return gone();
      const checkedId = checkLayerId(id);
      if (!checkedId.ok) return checkedId;
      if (!appLayers.delete(id)) return ok(undefined);
      if (mappedPaint.has(id)) {
        try {
          removeMapped(id);
        } catch (error) {
          report(error);
        }
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
      appLayers.clear();
      mappedOrder.length = 0;
      mappedPaint.clear();
      mappedData.clear();
      try {
        map.remove();
      } catch {
        // The map is dropped either way.
      }
    },
  });
}
