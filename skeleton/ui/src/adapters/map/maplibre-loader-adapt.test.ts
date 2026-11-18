import { describe, expect, it, vi } from 'vitest';

const created: unknown[] = [];

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
});
