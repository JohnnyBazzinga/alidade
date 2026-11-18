import type { Bearing } from '@alidade/core';
import { describe, expect, it, vi } from 'vitest';
import { fixFeatures } from '../../math/map/fix-features';
import type { TileSource } from '../../math/map/map-style';
import { FakeMapLibre } from '../../test-support/fake-maplibre';
import { FakeTimer } from '../../test-support/fake-timer';
import { fixAround } from '../../test-support/map-generators';
import { createMapAdapter, type MapAdapter } from './map-adapter';

const DEG = Math.PI / 180;

interface NodeEvents {
  on(event: string, listener: (reason: unknown) => void): void;
  off(event: string, listener: (reason: unknown) => void): void;
}
const TILES: TileSource = {
  tileUrlTemplates: ['https://tiles.invalid/{z}/{x}/{y}.png'],
  attribution: 'Synthetic tiles',
  minZoom: 0,
  maxZoom: 18,
  tileSizePx: 256,
};
const ORIGIN = { latRad: 30 * DEG, lonRad: -40 * DEG };
const FIX = fixAround(ORIGIN, { semiMajorM: 120, semiMinorM: 40, azimuthRad: 0.3 });
const BROKEN = fixAround(ORIGIN, { semiMajorM: Number.NaN, semiMinorM: 40, azimuthRad: 0.3 });
const BEARING: Bearing = {
  id: 'b1',
  observer: ORIGIN,
  positionAccuracyM: 5,
  timeUtcMs: 0,
  azimuthRad: 1,
  azimuthSigmaRad: 2 * DEG,
};

function setUp(tiles: TileSource | null = null, behaviour = {}) {
  const lib = new FakeMapLibre(behaviour);
  const timer = new FakeTimer();
  const created = createMapAdapter(lib, 'map', tiles, timer);
  if (!created.ok) throw new Error(created.reason);
  return { lib, timer, adapter: created.value, map: lib.last() };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('creating the map (Req 15.1, 15.2, 15.3)', () => {
  it('without WebGL: the constructor throws, and the caller gets map_unavailable with the error name', () => {
    const gpu = new Error('WebGL2 is required');
    gpu.name = 'GPUInitializationError';
    const lib = new FakeMapLibre({ throwOnCreate: gpu });
    expect(createMapAdapter(lib, 'map', null, new FakeTimer())).toEqual({
      ok: false,
      reason: 'map_unavailable',
      errorName: 'GPUInitializationError',
    });
  });

  it('a throw of a non-error is map_unavailable too', () => {
    const lib = {
      createMap: () => {
        throw 'nope';
      },
    };
    expect(createMapAdapter(lib, 'map', null, new FakeTimer())).toEqual({
      ok: false,
      reason: 'map_unavailable',
    });
  });

  it('passes the container and the style, interactive, and leaves the attribution control to its default', () => {
    const { map } = setUp(TILES);
    expect(map.options.container).toBe('map');
    expect(map.options.interactive).toBe(true);
    expect('attributionControl' in map.options).toBe(false);
    expect((map.options.style.sources.tiles as { attribution: string }).attribution).toBe(
      'Synthetic tiles',
    );
  });

  it('with no Tile source: no raster source, nothing that could make a request', () => {
    const { map } = setUp(null);
    expect(Object.keys(map.options.style.sources).sort()).toEqual([
      'bearings',
      'fix',
      'observers',
      'wedges',
    ]);
    expect(JSON.stringify(map.options.style)).not.toMatch(/https?:/);
  });

  it('checks each rule of the Tile source, naming the field', () => {
    const cases: [Partial<TileSource>, string][] = [
      [{ tileUrlTemplates: [] }, 'tileUrlTemplates'],
      [{ tileUrlTemplates: ['https://t.invalid/{z}/{x}.png'] }, 'tileUrlTemplates'],
      [{ tileUrlTemplates: ['https://t.invalid/{x}/{y}.png'] }, 'tileUrlTemplates'],
      [{ attribution: '' }, 'attribution'],
      [{ attribution: '   ' }, 'attribution'],
      [{ minZoom: Number.NaN }, 'minZoom'],
      [{ maxZoom: Infinity }, 'maxZoom'],
      [{ minZoom: 10, maxZoom: 5 }, 'maxZoom'],
      [{ tileSizePx: 0 }, 'tileSizePx'],
    ];
    for (const [patch, field] of cases) {
      const lib = new FakeMapLibre();
      expect(createMapAdapter(lib, 'map', { ...TILES, ...patch }, new FakeTimer())).toEqual({
        ok: false,
        reason: 'invalid_number',
        field,
      });
      expect(lib.maps).toHaveLength(0);
    }
  });
});

describe('writing data (Req 15.5, 15.6, D12)', () => {
  it('holds every write until load, then writes the latest of each source once', () => {
    const { adapter, map } = setUp();
    expect(adapter.setObservers([{ id: 'o1', position: ORIGIN }]).ok).toBe(true);
    expect(adapter.setFix(FIX).ok).toBe(true);
    expect(adapter.setObservers([{ id: 'o2', position: ORIGIN }]).ok).toBe(true);
    expect(map.setDataCalls).toHaveLength(0);
    map.fire('load');
    expect(map.setDataCalls.map((c) => c.id).sort()).toEqual([
      'bearings',
      'fix',
      'observers',
      'wedges',
    ]);
    const observers = map.data.get('observers') as { features: { properties: { id: string } }[] };
    expect(observers.features.map((f) => f.properties.id)).toEqual(['o2']);
  });

  it('writes a Fix and its ellipse in one setData of the fix source, equal to fixFeatures', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    const before = map.setDataCalls.length;
    expect(adapter.setFix(FIX).ok).toBe(true);
    const calls = map.setDataCalls.slice(before);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.id).toBe('fix');
    const expected = fixFeatures(FIX, 72);
    expect(expected.ok && calls[0]?.data).toEqual(expected.ok ? expected.value : null);
  });

  it('a failed setFix clears the earlier Fix and returns the failure', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setFix(FIX);
    expect(adapter.setFix(BROKEN)).toEqual({ ok: false, reason: 'invalid_number' });
    expect(map.data.get('fix')).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('a failed setObservers or setBearings leaves the map as it was', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setObservers([{ id: 'o1', position: ORIGIN }]);
    adapter.setBearings([BEARING], 5000);
    const before = map.setDataCalls.length;
    expect(adapter.setObservers([{ id: 'bad', position: { latRad: 2, lonRad: 0 } }]).ok).toBe(
      false,
    );
    expect(adapter.setBearings([BEARING], 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'lineLengthM',
    });
    expect(map.setDataCalls.length).toBe(before);
  });

  it('splits a Bearing into its line and its Wedge', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setBearings([BEARING, { ...BEARING, id: 'b2' }], 5000);
    const kinds = (id: string) =>
      (map.data.get(id) as { features: { properties: { kind: string } }[] }).features.map(
        (f) => f.properties.kind,
      );
    expect(kinds('bearings')).toEqual(['bearing-line', 'bearing-line']);
    expect(kinds('wedges')).toEqual(['bearing-wedge', 'bearing-wedge']);
  });

  it('fits the view to everything held, the ellipse included, without animation', () => {
    const { adapter, map } = setUp();
    expect(adapter.fitToFeatures(20)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'coordinates',
    });
    adapter.setFix(FIX);
    expect(adapter.fitToFeatures(20).ok).toBe(true);
    const [bounds, options] = map.fitBoundsCalls[0] ?? [];
    expect(options).toEqual({ padding: 20, animate: false });
    const [[w, s], [e, n]] = bounds as [[number, number], [number, number]];
    // The 95 % ellipse is 294 m long: the box is wider than a point.
    expect(e - w).toBeGreaterThan(0.001);
    expect(n - s).toBeGreaterThan(0.001);
    expect(adapter.fitToFeatures(-1)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'paddingPx',
    });
  });
});

describe('errors (Req 15.8)', () => {
  it('delivers tiles_unavailable at most once per interval, and keeps drawing', () => {
    const { adapter, map, timer } = setUp(TILES);
    map.fire('load');
    const seen: unknown[] = [];
    adapter.onError((f) => seen.push(f));
    const tileError = new Error('404');
    tileError.name = 'AJAXError';
    map.fire('error', { error: tileError });
    map.fire('error', { error: tileError });
    timer.advance(999);
    map.fire('error', { error: tileError });
    expect(seen).toEqual([{ ok: false, reason: 'tiles_unavailable', errorName: 'AJAXError' }]);
    timer.advance(1);
    map.fire('error', { error: tileError });
    expect(seen).toHaveLength(2);
    expect(adapter.setFix(FIX).ok).toBe(true);
  });

  it('a setData that rejects: the call returns ok, and onError gets tiles_unavailable; no unhandled rejection', async () => {
    // Vitest also fails the run on any unhandled rejection; this makes the check explicit.
    const unhandled = vi.fn();
    const proc = (globalThis as unknown as { process: NodeEvents }).process;
    proc.on('unhandledRejection', unhandled);
    try {
      const { adapter, map } = setUp(null, { setData: 'reject' });
      const seen: unknown[] = [];
      adapter.onError((f) => seen.push(f));
      map.fire('load');
      expect(adapter.setFix(FIX)).toEqual({ ok: true, value: undefined });
      await flush();
      await new Promise((r) => setTimeout(r, 0));
      expect(seen).toEqual([{ ok: false, reason: 'tiles_unavailable', errorName: 'WorkerError' }]);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      proc.off('unhandledRejection', unhandled);
    }
  });

  it('a setData that throws is reported the same way and never escapes', () => {
    const { adapter, map } = setUp(null, { setData: 'throw' });
    const seen: unknown[] = [];
    adapter.onError((f) => seen.push(f));
    expect(() => map.fire('load')).not.toThrow();
    expect(adapter.setObservers([{ id: 'o', position: ORIGIN }]).ok).toBe(true);
    expect(seen).toEqual([{ ok: false, reason: 'tiles_unavailable', errorName: 'Error' }]);
  });

  it('a throwing onError listener does not stop the others', () => {
    const { adapter, map } = setUp();
    const seen: unknown[] = [];
    adapter.onError(() => {
      throw new Error('listener');
    });
    adapter.onError((f) => seen.push(f));
    map.fire('error', {});
    expect(seen).toHaveLength(1);
  });
});

describe('destroy (Req 15.10)', () => {
  it('removes the map once, every listener and the Timer; later calls are action_not_available', () => {
    const { adapter, map, timer } = setUp();
    adapter.onError(() => undefined);
    map.fire('error', {});
    expect(timer.running()).toBe(1);
    adapter.destroy();
    adapter.destroy();
    expect(map.removeCount).toBe(1);
    expect(map.listenerCount()).toBe(0);
    expect(timer.running()).toBe(0);
    const gone = { ok: false, reason: 'action_not_available' };
    const all: ((a: MapAdapter) => unknown)[] = [
      (a) => a.setObservers([]),
      (a) => a.setBearings([], 1000),
      (a) => a.setFix(FIX),
      (a) => a.clearFix(),
      (a) => a.fitToFeatures(0),
    ];
    for (const call of all) expect(call(adapter)).toEqual(gone);
    expect(() => map.fire('load')).not.toThrow();
  });
});

describe('the API (Req 15.5, 15.9, D13)', () => {
  it('has no operation that draws a Position as a Fix, and adds no control', () => {
    const { adapter } = setUp();
    expect(Object.keys(adapter).sort()).toEqual([
      'clearFix',
      'destroy',
      'fitToFeatures',
      'onError',
      'setBearings',
      'setFix',
      'setObservers',
    ]);
  });
});
