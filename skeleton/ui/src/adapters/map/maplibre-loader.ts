// The one module that loads `maplibre-gl` (Req 1.4, 20.2): by a dynamic `import()`, so that
// importing the package does not load it. It adapts the library to the minimal types the Map
// adapter is written against; the casts are confined to this file.

import { err, ok, type UiResult } from '../../result';
import type { GeoJsonSourceLike, MapLibreLike, MapLike, MapOptionsLike } from './maplibre-types';

interface RealMap {
  on(type: string, listener: (event: unknown) => void): { unsubscribe(): void };
  getSource(id: string): unknown;
  addSource(id: string, source: unknown): unknown;
  addLayer(layer: unknown, beforeId?: string): unknown;
  removeLayer(id: string): unknown;
  removeSource(id: string): unknown;
  fitBounds(bounds: unknown, options: unknown): unknown;
  remove(): void;
}

interface RealModule {
  readonly Map: new (options: unknown) => RealMap;
}

function adapt(map: RealMap): MapLike {
  return {
    on: (type, listener) => map.on(type, listener),
    getSource: (id) => {
      const source = map.getSource(id) as { setData?: unknown } | undefined;
      return source !== undefined && typeof source.setData === 'function'
        ? (source as unknown as GeoJsonSourceLike)
        : undefined;
    },
    addSource: (id, source) => {
      map.addSource(id, source);
    },
    addLayer: (layer, beforeId) => {
      map.addLayer(layer, beforeId);
    },
    removeLayer: (id) => {
      map.removeLayer(id);
    },
    removeSource: (id) => {
      map.removeSource(id);
    },
    fitBounds: (bounds, options) => {
      map.fitBounds(bounds, options);
    },
    remove: () => map.remove(),
  };
}

/** The library, or `map_unavailable` (with the error's name) if it cannot be loaded. */
export async function loadMapLibre(): Promise<UiResult<MapLibreLike>> {
  try {
    const module = (await import('maplibre-gl')) as unknown as RealModule & {
      default?: RealModule;
    };
    const real = typeof module.Map === 'function' ? module : module.default;
    if (real === undefined || typeof real.Map !== 'function') return err('map_unavailable');
    const MapClass = real.Map;
    return ok({ createMap: (options: MapOptionsLike) => adapt(new MapClass(options)) });
  } catch (error) {
    const name = error instanceof Error ? error.name : undefined;
    return err('map_unavailable', name === undefined ? {} : { errorName: name });
  }
}
