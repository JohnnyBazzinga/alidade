import { describe, expect, it, vi } from 'vitest';

const created: unknown[] = [];
const calls: unknown[][] = [];

// A stand-in for the library's module: a `Map` class with the four members the adapter uses.
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor(options: unknown) {
      created.push(options);
    }
    on() {
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
});
