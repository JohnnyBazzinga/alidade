// Minimal structural types of the part of `maplibre-gl` the Map adapter uses (filled in by task 17).
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
export {};
