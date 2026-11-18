// Minimal structural types of the part of `maplibre-gl` the Map adapter uses (Req 15.1, design
// §7.11). The adapter is written against these; the loader adapts the real library to them, and
// `FakeMapLibre` implements them in tests.
//
// What task 1.5(d) found by reading `maplibre-gl` 6.16.0's `dist/maplibre-gl.d.ts` and source
// (nothing was imported under jsdom):
// - `new Map(options: MapOptions)`. `MapOptions.container: HTMLElement | string` is required;
//   `style?: StyleSpecification | string`; `interactive?: boolean` (default true);
//   `attributionControl?: false | AttributionControlOptions`. It is NOT a boolean `true`: leave it
//   out (the default adds the attribution control) or pass an options object.
// - `getSource<TSource extends Source>(id): TSource | undefined`. `Source` itself has no
//   `setData`; the GeoJSON source does: `setData(data: GeoJSON | string): Promise<void>`. The
//   promise can reject, so the adapter must catch it; our `GeoJsonSourceLike.setData` returns it.
// - `on(type, listener)` returns a `Subscription { unsubscribe(): void }`; `off(type, listener)`
//   also exists and returns the map. Event names `load` (MapLibreEvent), `error` (ErrorEvent with
//   `.error`) and `sourcedata` (MapSourceDataEvent) are in `MapEventType`.
// - `fitBounds(bounds: LngLatBoundsLike, options?: FitBoundsOptions): this`; `[[w, s], [e, n]]` is
//   a valid `LngLatBoundsLike`; `animate: false` and `padding` are `FitBoundsOptions`.
// - `remove(): void`.
// - Missing WebGL: the constructor THROWS `GPUInitializationError` (`name` of that class) from
//   `_setupPainter` when `getContext('webgl2')` is null. It is not emitted as an `error` event on
//   first construction (it is emitted only when a lost context fails to be restored).

import type { MapLayer, MapStyle } from '../../math/map/map-style';

/** What the adapter passes to the constructor. `attributionControl` is left out (its default). */
export interface MapOptionsLike {
  readonly container: HTMLElement | string;
  readonly style: MapStyle;
  readonly interactive: boolean;
}

/** The GeoJSON source's one operation; in `maplibre-gl` 6.x it returns a promise. */
export interface GeoJsonSourceLike {
  setData(data: unknown): Promise<void> | void;
}

export type MapEventName = 'load' | 'error';

export interface SubscriptionLike {
  unsubscribe(): void;
}

export interface MapLike {
  on(type: MapEventName, listener: (event: unknown) => void): SubscriptionLike;
  getSource(id: string): GeoJsonSourceLike | undefined;
  /**
   * Application layers (design D31.6), read in `maplibre-gl` 6.16's `Map`: `addSource(id,
   * source)`, `addLayer(layer, beforeId?)` (puts the layer immediately below `beforeId`),
   * `removeLayer(id)`, `removeSource(id)`. A call that cannot be honoured (a duplicate id, a
   * `beforeId` that does not exist) fires an `error` event and returns; a throw is possible too.
   */
  addSource(id: string, source: { readonly type: 'geojson'; readonly data: unknown }): void;
  addLayer(layer: MapLayer, beforeId: string): void;
  removeLayer(id: string): void;
  removeSource(id: string): void;
  fitBounds(
    bounds: readonly [readonly [number, number], readonly [number, number]],
    options: { readonly padding: number; readonly animate: false },
  ): void;
  remove(): void;
}

export interface MapLibreLike {
  createMap(options: MapOptionsLike): MapLike;
}
