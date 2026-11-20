import { ATTRIBUTION_STRIP_PX } from '../../math/map/attribution-style';
import type { Bearing } from '@alidade/core';
import { describe, expect, it, vi } from 'vitest';
import { ELLIPSE_VERTEX_COUNT } from '../../defaults';
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

  // Req 15.2 as amended on 2026-11-20 (task 31): the attribution is shown in full at all times. The
  // library's default is compact on a map under 640 px wide, a toggle that collapses when the map is
  // moved; `compact: false` keeps it open (maplibre-gl 6.16's `AttributionControl._updateCompact`).
  it('passes the container and the style, interactive, and an attribution control that is never compact', () => {
    const { map } = setUp(TILES);
    expect(map.options.container).toBe('map');
    expect(map.options.interactive).toBe(true);
    expect(map.options.attributionControl).toEqual({ compact: false });
    expect((map.options.style.sources.tiles as { attribution: string }).attribution).toBe(
      'Synthetic tiles',
    );
  });

  it('creates the attribution control the same way with no Tile source, and with every Tile source', () => {
    expect(setUp(null).map.options.attributionControl).toEqual({ compact: false });
    expect(
      setUp({ ...TILES, attribution: 'Map data by a synthetic provider' }).map.options
        .attributionControl,
    ).toEqual({
      compact: false,
    });
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
    // Task 31 continued (Req 15.2): the bottom keeps the attribution's strip clear as well.
    expect(options).toEqual({
      padding: { top: 20, right: 20, bottom: 20 + ATTRIBUTION_STRIP_PX, left: 20 },
      animate: false,
    });
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

  // Task group 30 (design D34): with a Fix the view is fitted to the observers and the Fix with its
  // 95 % ellipse, not to the ends of the lines, which are drawn past the Fix and made the ellipse a
  // few pixels across. With no Fix the lines are what there is to see, and the view holds them.
  it('with a Fix, fits the observers and the ellipse and not the far ends of the lines', () => {
    const { adapter, map } = setUp();
    const south = { latRad: ORIGIN.latRad - 3000 / 6_371_008.8, lonRad: ORIGIN.lonRad };
    adapter.setObservers([{ id: 'o', position: south }]);
    adapter.setBearings([{ ...BEARING, observer: south, azimuthRad: 0 }], 50_000);
    type Box = [[number, number], [number, number]];
    const box = () => map.fitBoundsCalls.at(-1)?.[0] as Box;

    expect(adapter.fitToFeatures(0).ok).toBe(true);
    const withoutFix = box();
    // The line runs 50 km north: about 0.45° of latitude.
    expect(withoutFix[1][1] - withoutFix[0][1]).toBeGreaterThan(0.4);

    adapter.setFix(FIX);
    expect(adapter.fitToFeatures(0).ok).toBe(true);
    const [[w, s], [e, n]] = box();
    const ellipse = fixFeatures(FIX, ELLIPSE_VERTEX_COUNT);
    if (!ellipse.ok) throw new Error(ellipse.reason);
    const polygon = ellipse.value.features[1].geometry;
    if (polygon.type !== 'Polygon') throw new Error('no polygon');
    const ring = polygon.coordinates[0] ?? [];
    const lats = ring.map((c) => c[1]);
    const lons = ring.map((c) => c[0]);
    expect(s).toBeCloseTo((south.latRad * 180) / Math.PI, 9);
    expect(n).toBeCloseTo(Math.max(...lats), 9);
    expect(w).toBeCloseTo(Math.min(...lons), 9);
    expect(e).toBeCloseTo(Math.max(...lons), 9);

    adapter.clearFix();
    expect(adapter.fitToFeatures(0).ok).toBe(true);
    expect(box()).toEqual(withoutFix);
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
    // Req 15.14 adds `setLayer` and `clearLayer`: a general layer of the application's own, which
    // refuses a feature of a skeleton kind (Req 15.15), so it cannot draw a Fix either.
    expect(Object.keys(adapter).sort()).toEqual([
      'clearFix',
      'clearLayer',
      'destroy',
      'fitToFeatures',
      'onError',
      'setBearings',
      'setFix',
      'setLayer',
      'setObservers',
    ]);
  });
});

describe('a worker that does not start (Req 15.18)', () => {
  it('delivers map_unavailable, never tiles_unavailable, before or after load', () => {
    for (const loadFirst of [false, true]) {
      const { adapter, map, timer } = setUp(TILES);
      if (loadFirst) map.fire('load');
      const seen: unknown[] = [];
      adapter.onError((f) => seen.push(f));
      map.fire('unavailable', { error: new Error('Worker failed to load.') });
      expect(seen).toEqual([{ ok: false, reason: 'map_unavailable', errorName: 'Error' }]);
      // The map draws nothing now, so a tile or a write that fails afterwards is not reported as
      // the tiles' fault, and the failure is not repeated.
      timer.advance(5000);
      map.fire('error', { error: new Error('404') });
      map.fire('unavailable', { error: new Error('Worker failed to load.') });
      expect(seen).toHaveLength(1);
    }
  });
});
