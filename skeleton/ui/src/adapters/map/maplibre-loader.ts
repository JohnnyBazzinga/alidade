// The one module that loads `maplibre-gl` (Req 1.4, 20.2): by a dynamic `import()`, so that
// importing the package does not load it. It adapts the library to the minimal types the Map
// adapter is written against; the casts are confined to this file.
//
// The worker (Req 15.18, amendment of 2026-11-19). `maplibre-gl` 6.16.0 runs its parsing in a Web
// Worker loaded from a separate file, `dist/maplibre-gl-worker.mjs`. Unless it is told the address
// (`setWorkerUrl`), it looks for that file beside its own module, which a bundler does not emit, so
// in the built page no worker started and nothing was ever drawn. The loader imports the file with
// Vite's `?url` suffix, which makes the build copy it beside the page's other files and gives its
// address relative to the importing script, and passes that to `setWorkerUrl` before any map is
// made. When a worker still does not start, the library fires `error` with the text
// `WORKER_FAILURE_TEXT` (read in its `dist/maplibre-gl.mjs`); the adapted map gives that event to
// `unavailable` listeners only, so that the adapter reports `map_unavailable` and not the tiles.
// The `?url` module is declared in `maplibre-worker-url.d.ts`, which a package that type-checks this
// source lists in its `tsconfig.json`, as it does Sensors' `magvar.d.ts`.

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
  readonly setWorkerUrl?: (url: string) => void;
}

/** The start of the message `maplibre-gl` 6.16.0 fires when a worker fails to load. */
export const WORKER_FAILURE_TEXT = 'Worker failed to load';

/** Whether a library `error` event says that its worker did not start. */
function isWorkerFailure(event: unknown): boolean {
  if (typeof event !== 'object' || event === null) return false;
  const error = (event as { error?: unknown }).error;
  return error instanceof Error && error.message.startsWith(WORKER_FAILURE_TEXT);
}

function adapt(map: RealMap): MapLike {
  return {
    on: (type, listener) => {
      if (type === 'load') return map.on('load', listener);
      const worker = type === 'unavailable';
      return map.on('error', (event) => {
        if (isWorkerFailure(event) === worker) listener(event);
      });
    },
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
    const [loaded, worker] = await Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
    ]);
    const module = loaded as unknown as RealModule & { default?: RealModule };
    const real = typeof module.Map === 'function' ? module : module.default;
    if (real === undefined || typeof real.Map !== 'function') return err('map_unavailable');
    // Without the worker's address the library cannot start its worker (Req 15.18).
    if (typeof real.setWorkerUrl !== 'function' || typeof worker.default !== 'string') {
      return err('map_unavailable');
    }
    real.setWorkerUrl(worker.default);
    const MapClass = real.Map;
    return ok({ createMap: (options: MapOptionsLike) => adapt(new MapClass(options)) });
  } catch (error) {
    const name = error instanceof Error ? error.name : undefined;
    return err('map_unavailable', name === undefined ? {} : { errorName: name });
  }
}
