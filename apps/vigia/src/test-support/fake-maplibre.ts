// A fake of the map library (test support, not exported): a copy of UI's `FakeMapLibre` (UI D20:
// test support is copied, not exported), with its types taken from UI's exported `MapLibreLike`.
// It records the data of every source and the layers added, and lets a test fire `load`.

import type { MapLibreLike, MapLike } from '@alidade/ui';

type MapOptionsLike = Parameters<MapLibreLike['createMap']>[0];
type MapEventName = Parameters<MapLike['on']>[0];
type MapLayer = Parameters<MapLike['addLayer']>[0];
type GeoJsonSourceLike = NonNullable<ReturnType<MapLike['getSource']>>;

export class FakeMap implements MapLike {
  readonly data = new Map<string, unknown>();
  readonly fitBoundsCalls: unknown[][] = [];
  readonly listeners = new Map<MapEventName, Set<(event: unknown) => void>>();
  readonly layers: MapLayer[];
  removeCount = 0;
  private readonly sources = new Map<string, GeoJsonSourceLike>();

  constructor(readonly options: MapOptionsLike) {
    this.layers = [...options.style.layers];
    for (const [id, source] of Object.entries(options.style.sources)) {
      if ((source as { type?: string }).type !== 'geojson') continue;
      this.makeSource(id);
    }
  }

  private makeSource(id: string): void {
    this.sources.set(id, {
      setData: (d: unknown) => {
        this.data.set(id, d);
        return Promise.resolve();
      },
    } as GeoJsonSourceLike);
  }

  addSource(id: string, source: { readonly type: 'geojson'; readonly data: unknown }): void {
    if (this.sources.has(id)) return;
    this.makeSource(id);
    this.data.set(id, source.data);
  }

  addLayer(layer: MapLayer, beforeId: string): void {
    if (this.layers.some((l) => l.id === layer.id)) return;
    const index =
      beforeId === undefined ? this.layers.length : this.layers.findIndex((l) => l.id === beforeId);
    this.layers.splice(index < 0 ? this.layers.length : index, 0, layer);
  }

  removeLayer(id: string): void {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index >= 0) this.layers.splice(index, 1);
  }

  removeSource(id: string): void {
    this.sources.delete(id);
    this.data.delete(id);
  }

  layerIds(): string[] {
    return this.layers.map((l) => l.id);
  }

  on(type: MapEventName, listener: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
    return { unsubscribe: () => void set.delete(listener) };
  }

  getSource(id: string): GeoJsonSourceLike | undefined {
    return this.sources.get(id);
  }

  fitBounds(...args: unknown[]): void {
    this.fitBoundsCalls.push(args);
  }

  remove(): void {
    this.removeCount += 1;
  }

  fire(type: MapEventName, event: unknown = {}): void {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(event);
  }
}

export class FakeMapLibre implements MapLibreLike {
  readonly maps: FakeMap[] = [];

  createMap(options: MapOptionsLike): MapLike {
    const map = new FakeMap(options);
    this.maps.push(map);
    return map;
  }

  last(): FakeMap {
    const map = this.maps[this.maps.length - 1];
    if (map === undefined) throw new Error('no map');
    return map;
  }
}

/** The features of a source of the fake map, as the adapter gave them. */
export function featuresOf(
  map: FakeMap,
  sourceId: string,
): { properties: { kind: string; id: string } }[] {
  const data = map.data.get(sourceId) as
    { features?: { properties: { kind: string; id: string } }[] } | undefined;
  return data?.features ?? [];
}
