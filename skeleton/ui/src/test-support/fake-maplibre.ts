// A fake of the map library (Req 15.13; test support, not exported): it records what it is given
// and lets the test fire `load` and `error`, throw on construction, or reject `setData`.

import type { MapLayer } from '../math/map/map-style';
import type {
  GeoJsonSourceLike,
  MapEventName,
  MapLibreLike,
  MapLike,
  MapOptionsLike,
} from '../adapters/map/maplibre-types';

export interface FakeMapOptions {
  /** Thrown by the constructor, as `maplibre-gl` throws `GPUInitializationError` without WebGL. */
  readonly throwOnCreate?: Error;
  /** How `setData` fails: by returning a rejected promise, or by throwing. */
  readonly setData?: 'resolve' | 'reject' | 'throw';
  /** `addLayer` throws (as a library that cannot add a layer might). */
  readonly addLayer?: 'ok' | 'throw';
  /** `removeLayer` throws. */
  readonly removeLayer?: 'ok' | 'throw';
}

export class FakeMap implements MapLike {
  readonly data = new Map<string, unknown>();
  readonly setDataCalls: { id: string; data: unknown }[] = [];
  readonly fitBoundsCalls: unknown[][] = [];
  readonly listeners = new Map<MapEventName, Set<(event: unknown) => void>>();
  removeCount = 0;
  /** The style's layers, then those added, in draw order (bottom first). */
  readonly layers: MapLayer[];
  readonly addSourceCalls: string[] = [];
  readonly addLayerCalls: { layer: MapLayer; beforeId: string }[] = [];
  readonly removeLayerCalls: string[] = [];
  readonly removeSourceCalls: string[] = [];
  private readonly sources = new Map<string, GeoJsonSourceLike>();

  constructor(
    readonly options: MapOptionsLike,
    private readonly behaviour: FakeMapOptions,
  ) {
    this.layers = [...options.style.layers];
    for (const [id, source] of Object.entries(options.style.sources)) {
      if ((source as { type?: string }).type !== 'geojson') continue;
      this.makeSource(id);
    }
  }

  private makeSource(id: string): void {
    this.sources.set(id, {
      setData: (d: unknown) => {
        this.setDataCalls.push({ id, data: d });
        if (this.behaviour.setData === 'throw') throw new Error('setData threw');
        if (this.behaviour.setData === 'reject') {
          const e = new Error('worker failed');
          e.name = 'WorkerError';
          return Promise.reject(e);
        }
        this.data.set(id, d);
        return Promise.resolve();
      },
    });
  }

  /** Like the library, a call that cannot be honoured fires `error` and changes nothing. */
  private refuse(message: string): void {
    const e = new Error(message);
    this.fire('error', { error: e });
  }

  addSource(id: string, source: { readonly type: 'geojson'; readonly data: unknown }): void {
    this.addSourceCalls.push(id);
    if (this.sources.has(id)) return this.refuse(`Source "${id}" already exists.`);
    this.makeSource(id);
    this.data.set(id, source.data);
  }

  addLayer(layer: MapLayer, beforeId: string): void {
    this.addLayerCalls.push({ layer, beforeId });
    if (this.behaviour.addLayer === 'throw') throw new Error('addLayer threw');
    if (this.layers.some((l) => l.id === layer.id))
      return this.refuse(`Layer "${layer.id}" already exists on this map.`);
    if (layer.source !== undefined && !this.sources.has(layer.source) && layer.source !== 'tiles')
      return this.refuse(`Source "${layer.source}" not found.`);
    // As the library does: no `beforeId` appends on top.
    const index =
      beforeId === undefined ? this.layers.length : this.layers.findIndex((l) => l.id === beforeId);
    if (index === -1)
      return this.refuse(`Cannot add layer "${layer.id}" before non-existing layer "${beforeId}".`);
    this.layers.splice(index, 0, layer);
  }

  removeLayer(id: string): void {
    this.removeLayerCalls.push(id);
    if (this.behaviour.removeLayer === 'throw') throw new Error('removeLayer threw');
    const index = this.layers.findIndex((l) => l.id === id);
    if (index === -1) return this.refuse(`Cannot remove non-existing layer "${id}".`);
    this.layers.splice(index, 1);
  }

  removeSource(id: string): void {
    this.removeSourceCalls.push(id);
    if (!this.sources.has(id)) return this.refuse(`Cannot remove non-existing source "${id}".`);
    if (this.layers.some((l) => l.source === id))
      return this.refuse(`Source "${id}" cannot be removed while layer uses it.`);
    this.sources.delete(id);
    this.data.delete(id);
  }

  /** The layers' ids, bottom first. */
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

  listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

export class FakeMapLibre implements MapLibreLike {
  readonly maps: FakeMap[] = [];
  constructor(private readonly behaviour: FakeMapOptions = {}) {}

  createMap(options: MapOptionsLike): MapLike {
    if (this.behaviour.throwOnCreate) throw this.behaviour.throwOnCreate;
    const map = new FakeMap(options, this.behaviour);
    this.maps.push(map);
    return map;
  }

  last(): FakeMap {
    const map = this.maps[this.maps.length - 1];
    if (map === undefined) throw new Error('no map');
    return map;
  }
}
