import { describe, expect, it, vi } from 'vitest';

const created: unknown[] = [];
const calls: unknown[][] = [];
/** The order of what the loader did: `setWorkerUrl <url>` and `new Map`. */
const order: string[] = [];
const realListeners: { type: string; listener: (event: unknown) => void }[] = [];

// The worker's address as the build gives it (Req 15.18); the real `?url` module is Vite's.
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({
  default: 'https://example.test/assets/maplibre-gl-worker-abc.mjs',
}));

// A stand-in for the library's module: a `Map` class with the four members the adapter uses.
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: (url: string) => {
    order.push(`setWorkerUrl ${url}`);
  },
  Map: class {
    constructor(options: unknown) {
      created.push(options);
      order.push('new Map');
    }
    on(type: string, listener: (event: unknown) => void) {
      realListeners.push({ type, listener });
      return { unsubscribe: () => undefined };
    }
    getSource(id: string) {
      return id === 'fix' ? { setData: () => Promise.resolve() } : { type: 'raster' };
    }
    fitBounds() {
      return this;
    }
    addSource(...args: unknown[]) {
      calls.push(['addSource', ...args]);
      return this;
    }
    addLayer(...args: unknown[]) {
      calls.push(['addLayer', ...args]);
      return this;
    }
    removeLayer(...args: unknown[]) {
      calls.push(['removeLayer', ...args]);
    }
    removeSource(...args: unknown[]) {
      calls.push(['removeSource', ...args]);
      return this;
    }
    remove() {}
  },
}));

describe('loadMapLibre adapts the module (Req 15.1)', () => {
  it("constructs the library's Map and exposes only GeoJSON sources", async () => {
    const { loadMapLibre } = await import('./maplibre-loader');
    const lib = await loadMapLibre();
    if (!lib.ok) throw new Error(lib.reason);
    const map = lib.value.createMap({
      container: 'c',
      style: { version: 8, sources: {}, layers: [] },
      interactive: true,
    });
    expect(created).toHaveLength(1);
    expect(map.getSource('fix')).toBeDefined();
    expect(map.getSource('tiles')).toBeUndefined();
  });

  // D31.6: the four calls an application layer needs reach the library with the same arguments.
  it("passes addSource, addLayer, removeLayer and removeSource to the library's Map", async () => {
    const { loadMapLibre } = await import('./maplibre-loader');
    const lib = await loadMapLibre();
    if (!lib.ok) throw new Error(lib.reason);
    const map = lib.value.createMap({
      container: 'c',
      style: { version: 8, sources: {}, layers: [] },
      interactive: true,
    });
    const source = { type: 'geojson' as const, data: { type: 'FeatureCollection', features: [] } };
    const layer = { id: 'app-a', type: 'circle' as const, source: 'app-a', paint: {} };
    calls.length = 0;
    map.addSource('app-a', source);
    map.addLayer(layer, 'wedges-fill');
    map.removeLayer('app-a');
    map.removeSource('app-a');
    expect(calls).toEqual([
      ['addSource', 'app-a', source],
      ['addLayer', layer, 'wedges-fill'],
      ['removeLayer', 'app-a'],
      ['removeSource', 'app-a'],
    ]);
  });

  // Req 15.18: the installed version finds its worker beside its own module unless told; the build
  // emits it as a file of its own, so the loader gives the library that file's address first.
  it('gives the library the address of its worker before any map is made', async () => {
    const { loadMapLibre } = await import('./maplibre-loader');
    order.length = 0;
    const lib = await loadMapLibre();
    if (!lib.ok) throw new Error(lib.reason);
    lib.value.createMap({
      container: 'c',
      style: { version: 8, sources: {}, layers: [] },
      interactive: true,
    });
    expect(order).toEqual([
      'setWorkerUrl https://example.test/assets/maplibre-gl-worker-abc.mjs',
      'new Map',
    ]);
  });

  // Req 15.18: a worker that does not start is told apart from a tile that does not load. The text
  // is the one `maplibre-gl` 6.16.0 fires (read in `dist/maplibre-gl.mjs`).
  it("sends the library's worker failure to 'unavailable' and every other error to 'error'", async () => {
    const { loadMapLibre } = await import('./maplibre-loader');
    const lib = await loadMapLibre();
    if (!lib.ok) throw new Error(lib.reason);
    realListeners.length = 0;
    const map = lib.value.createMap({
      container: 'c',
      style: { version: 8, sources: {}, layers: [] },
      interactive: true,
    });
    const seen: string[] = [];
    map.on('error', () => seen.push('error'));
    map.on('unavailable', () => seen.push('unavailable'));
    const fireReal = (event: unknown) => {
      for (const l of realListeners) if (l.type === 'error') l.listener(event);
    };
    fireReal({ error: new Error('Worker failed to load. Check that the worker URL is correct.') });
    expect(seen).toEqual(['unavailable']);
    seen.length = 0;
    fireReal({ error: new Error('AJAXError: Not Found (404)') });
    fireReal({});
    expect(seen).toEqual(['error', 'error']);
  });
});
