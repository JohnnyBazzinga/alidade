// A fake of the map library (Req 15.13; test support, not exported): it records what it is given
// and lets the test fire `load` and `error`, throw on construction, or reject `setData`.

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
}

export class FakeMap implements MapLike {
  readonly data = new Map<string, unknown>();
  readonly setDataCalls: { id: string; data: unknown }[] = [];
  readonly fitBoundsCalls: unknown[][] = [];
  readonly listeners = new Map<MapEventName, Set<(event: unknown) => void>>();
  removeCount = 0;
  private readonly sources = new Map<string, GeoJsonSourceLike>();

  constructor(
    readonly options: MapOptionsLike,
    private readonly behaviour: FakeMapOptions,
  ) {
    for (const [id, source] of Object.entries(options.style.sources)) {
      if ((source as { type?: string }).type !== 'geojson') continue;
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
