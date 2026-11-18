import { describe, expect, it } from 'vitest';
import { MAX_APP_LAYERS } from '../../defaults';
import type { AppFeatureCollection, LayerPaint } from '../../math/map/app-layer';
import { fixFeatures } from '../../math/map/fix-features';
import type { TileSource } from '../../math/map/map-style';
import { FakeMapLibre } from '../../test-support/fake-maplibre';
import { FakeTimer } from '../../test-support/fake-timer';
import { fixAround } from '../../test-support/map-generators';
import { createMapAdapter } from './map-adapter';

const DEG = Math.PI / 180;
const TILES: TileSource = {
  tileUrlTemplates: ['https://tiles.invalid/{z}/{x}/{y}.png'],
  attribution: 'Synthetic tiles',
  minZoom: 0,
  maxZoom: 18,
  tileSizePx: 256,
};
const ORIGIN = { latRad: 30 * DEG, lonRad: -40 * DEG };
const FIX = fixAround(ORIGIN, { semiMajorM: 120, semiMinorM: 40, azimuthRad: 0.3 });

const DOT: LayerPaint = { kind: 'circle', colour: '#112233', radiusPx: 5 };
const OUTLINE: LayerPaint = { kind: 'line', colour: '#445566', widthPx: 3, dash: [2, 1] };
const SHADE: LayerPaint = { kind: 'fill', colour: '#778899', opacity: 0.3 };

function dots(...lonLat: [number, number][]): AppFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lonLat.map((coordinates, i) => ({
      type: 'Feature' as const,
      id: `hotspot:${i}`,
      geometry: { type: 'Point' as const, coordinates },
      properties: { kind: 'hotspot', id: String(i) },
    })),
  };
}

function setUp(tiles: TileSource | null = null, behaviour = {}) {
  const lib = new FakeMapLibre(behaviour);
  const created = createMapAdapter(lib, 'map', tiles, new FakeTimer());
  if (!created.ok) throw new Error(created.reason);
  return { adapter: created.value, map: lib.last() };
}

function appIds(map: { layerIds(): string[] }): string[] {
  return map.layerIds().filter((id) => id.startsWith('app-'));
}

describe('setLayer (Req 15.14)', () => {
  it('holds a layer until the map has loaded, then adds it', () => {
    const { adapter, map } = setUp();
    expect(adapter.setLayer('hot', dots([1, 2]), DOT)).toEqual({ ok: true, value: undefined });
    expect(map.addLayerCalls).toHaveLength(0);
    map.fire('load');
    expect(appIds(map)).toEqual(['app-hot']);
    expect(map.data.get('app-hot')).toEqual(dots([1, 2]));
  });

  it('adds, after the load, at once', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setLayer('hot', dots([1, 2]), DOT);
    expect(appIds(map)).toEqual(['app-hot']);
    expect(map.addSourceCalls).toEqual(['app-hot']);
  });

  it('draws a layer of each kind with the type and the filter of its kind', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setLayer('p', dots([1, 2]), DOT);
    adapter.setLayer('l', dots([1, 2]), OUTLINE);
    adapter.setLayer('f', dots([1, 2]), SHADE);
    const types = Object.fromEntries(
      map.layers.filter((l) => l.id.startsWith('app-')).map((l) => [l.id, l.type]),
    );
    expect(types).toEqual({ 'app-p': 'circle', 'app-l': 'line', 'app-f': 'fill' });
  });

  it('never adds a text layer, a sprite or a glyph', () => {
    const { adapter, map } = setUp(TILES);
    map.fire('load');
    adapter.setLayer('p', dots([1, 2]), DOT);
    expect(map.layers.some((l) => (l.type as string) === 'symbol')).toBe(false);
    expect(JSON.stringify(map.addLayerCalls)).not.toMatch(/text|glyph|sprite|font/);
    expect('glyphs' in map.options.style).toBe(false);
  });

  it('sits under every layer of the skeleton, with and without tiles (Req 15.16)', () => {
    for (const tiles of [null, TILES]) {
      const { adapter, map } = setUp(tiles);
      map.fire('load');
      const before = map.layerIds();
      adapter.setLayer('a', dots([1, 2]), DOT);
      adapter.setLayer('b', dots([1, 2]), OUTLINE);
      const after = map.layerIds();
      const app = appIds(map);
      expect(after.filter((id) => !id.startsWith('app-'))).toEqual(before);
      const wedges = after.indexOf('wedges-fill');
      for (const id of app) expect(after.indexOf(id)).toBeLessThan(wedges);
      expect(after.indexOf('fix-core')).toBe(after.length - 1);
      if (tiles !== null) expect(after.indexOf('tiles')).toBeLessThan(after.indexOf('app-a'));
      expect(after.indexOf('background')).toBe(0);
    }
  });

  it('stacks the layers in the order in which their ids were first set (Req 15.16)', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setLayer('c', dots([1, 2]), DOT);
    adapter.setLayer('a', dots([1, 2]), DOT);
    adapter.setLayer('b', dots([1, 2]), DOT);
    expect(appIds(map)).toEqual(['app-c', 'app-a', 'app-b']);
    adapter.setLayer('c', dots([3, 4]), DOT);
    expect(appIds(map)).toEqual(['app-c', 'app-a', 'app-b']);
    adapter.clearLayer('c');
    adapter.setLayer('c', dots([5, 6]), DOT);
    expect(appIds(map)).toEqual(['app-a', 'app-b', 'app-c']);
  });

  it('writes only the data when only the data changes', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setLayer('a', dots([1, 2]), DOT);
    const added = map.addLayerCalls.length;
    adapter.setLayer('a', dots([3, 4]), DOT);
    expect(map.addLayerCalls).toHaveLength(added);
    expect(map.removeLayerCalls).toHaveLength(0);
    expect(map.data.get('app-a')).toEqual(dots([3, 4]));
  });

  it('rebuilds a layer whose paint changed, and the ones above it, keeping the order', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setLayer('a', dots([1, 2]), DOT);
    adapter.setLayer('b', dots([1, 2]), DOT);
    adapter.setLayer('c', dots([1, 2]), DOT);
    adapter.setLayer('b', dots([7, 8]), OUTLINE);
    expect(appIds(map)).toEqual(['app-a', 'app-b', 'app-c']);
    expect(map.removeLayerCalls).toEqual(['app-c', 'app-b']);
    expect(map.layers.find((l) => l.id === 'app-b')?.type).toBe('line');
    expect(map.data.get('app-b')).toEqual(dots([7, 8]));
    expect(map.data.get('app-c')).toEqual(dots([1, 2]));
    expect(map.data.get('app-a')).toEqual(dots([1, 2]));
  });

  it('keeps the data of a held layer across a change of paint made before the load', () => {
    const { adapter, map } = setUp();
    adapter.setLayer('a', dots([1, 2]), DOT);
    adapter.setLayer('a', dots([3, 4]), SHADE);
    map.fire('load');
    expect(map.layers.find((l) => l.id === 'app-a')?.type).toBe('fill');
    expect(map.data.get('app-a')).toEqual(dots([3, 4]));
  });

  it('refuses the ninth layer, and still takes new data for one it holds', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(ids).toHaveLength(MAX_APP_LAYERS);
    for (const id of ids) expect(adapter.setLayer(id, dots([1, 2]), DOT).ok).toBe(true);
    expect(adapter.setLayer('i', dots([1, 2]), DOT)).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'layers',
    });
    expect(appIds(map)).toHaveLength(8);
    expect(adapter.setLayer('h', dots([9, 9]), DOT).ok).toBe(true);
    expect(map.data.get('app-h')).toEqual(dots([9, 9]));
    adapter.clearLayer('a');
    expect(adapter.setLayer('i', dots([1, 2]), DOT).ok).toBe(true);
  });

  it('leaves a layer as it was when a call is refused, whichever argument is wrong', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setLayer('a', dots([1, 2]), OUTLINE);
    const calls = map.addLayerCalls.length + map.removeLayerCalls.length + map.setDataCalls.length;
    const refused = [
      adapter.setLayer('a', dots([3, 4]), { kind: 'line', colour: 'red', widthPx: 1 } as never),
      adapter.setLayer('a', dots([Number.NaN, 4]), OUTLINE),
      adapter.setLayer('A', dots([3, 4]), OUTLINE),
      adapter.setLayer('fix', dots([3, 4]), OUTLINE),
    ];
    for (const r of refused) expect(r).toMatchObject({ ok: false, reason: 'invalid_number' });
    expect(map.addLayerCalls.length + map.removeLayerCalls.length + map.setDataCalls.length).toBe(
      calls,
    );
    expect(map.data.get('app-a')).toEqual(dots([1, 2]));
    expect(map.layers.find((l) => l.id === 'app-a')?.paint).toMatchObject({
      'line-color': '#445566',
    });
  });

  it('refuses each feature of a skeleton kind, so that a Fix is only drawn by setFix', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    for (const kind of ['observer', 'bearing-line', 'bearing-wedge', 'fix', 'fix-ellipse-95']) {
      const c = dots([1, 2]);
      const sneaky = {
        ...c,
        features: [{ ...c.features[0], properties: { kind, id: '0' } }],
      };
      expect(adapter.setLayer('a', sneaky as never, DOT)).toMatchObject({
        ok: false,
        reason: 'invalid_number',
        field: 'features[0].properties.kind',
      });
    }
    expect(appIds(map)).toEqual([]);
  });

  it('does not move the Fix, the Bearings or the observers', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setFix(FIX);
    const fix = map.data.get('fix');
    const observers = map.data.get('observers');
    adapter.setLayer('a', dots([1, 2]), DOT);
    adapter.setLayer('a', dots([3, 4]), SHADE);
    adapter.clearLayer('a');
    expect(map.data.get('fix')).toBe(fix);
    expect(map.data.get('observers')).toBe(observers);
    const built = fixFeatures(FIX, 72);
    expect(built.ok && map.data.get('fix')).toEqual(built.ok && built.value);
  });

  it('takes a copy: the caller changing its collection later changes nothing', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    const c = dots([1, 2]);
    adapter.setLayer('a', c, DOT);
    (c.features[0]?.geometry as unknown as { coordinates: number[] }).coordinates[0] = 50;
    adapter.setLayer('a', dots([1, 2]), SHADE);
    expect(map.data.get('app-a')).toEqual(dots([1, 2]));
  });
});

describe('clearLayer (Req 15.14)', () => {
  it('removes the layer and its source and leaves the others where they are', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setLayer('a', dots([1, 2]), DOT);
    adapter.setLayer('b', dots([1, 2]), DOT);
    adapter.setLayer('c', dots([1, 2]), DOT);
    expect(adapter.clearLayer('b')).toEqual({ ok: true, value: undefined });
    expect(appIds(map)).toEqual(['app-a', 'app-c']);
    expect(map.data.has('app-b')).toBe(false);
    expect(map.removeLayerCalls).toEqual(['app-b']);
    expect(map.removeSourceCalls).toEqual(['app-b']);
  });

  it('clears a layer that was only held, so that it never reaches the map', () => {
    const { adapter, map } = setUp();
    adapter.setLayer('a', dots([1, 2]), DOT);
    adapter.clearLayer('a');
    map.fire('load');
    expect(appIds(map)).toEqual([]);
    expect(map.addLayerCalls).toHaveLength(0);
  });

  it('is ok and changes nothing for an id it does not hold', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    expect(adapter.clearLayer('never')).toEqual({ ok: true, value: undefined });
    expect(map.removeLayerCalls).toHaveLength(0);
  });

  it('names a bad id', () => {
    const { adapter } = setUp();
    expect(adapter.clearLayer('A')).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'id',
    });
    expect(adapter.clearLayer('fix')).toMatchObject({ ok: false, field: 'id' });
  });

  it('does not touch the Fix', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setFix(FIX);
    const fix = map.data.get('fix');
    adapter.setLayer('a', dots([1, 2]), DOT);
    adapter.clearLayer('a');
    expect(map.data.get('fix')).toBe(fix);
    expect(map.layerIds()).toContain('fix-core');
  });
});

describe('what the library can do to a layer (D31.5)', () => {
  it('a throwing addLayer is map_unavailable with the name, and the layer is as it was', () => {
    const { adapter, map } = setUp(null, { addLayer: 'throw' });
    map.fire('load');
    const r = adapter.setLayer('a', dots([1, 2]), DOT);
    expect(r).toMatchObject({ ok: false, reason: 'map_unavailable', errorName: 'Error' });
    expect(appIds(map)).toEqual([]);
    expect(map.data.has('app-a')).toBe(false);
  });

  it('a throwing removeLayer is reported, and the layer is gone from the adapter', () => {
    const { adapter, map } = setUp(null, { removeLayer: 'throw' });
    map.fire('load');
    adapter.setLayer('a', dots([1, 2]), DOT);
    const failures: unknown[] = [];
    adapter.onError((f) => failures.push(f));
    expect(adapter.clearLayer('a')).toEqual({ ok: true, value: undefined });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ reason: 'tiles_unavailable' });
  });

  it('an error event of the library reaches onError as tiles_unavailable', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    const failures: unknown[] = [];
    adapter.onError((f) => failures.push(f));
    adapter.setLayer('a', dots([1, 2]), DOT);
    map.removeLayer('app-ghost');
    expect(failures).toMatchObject([{ reason: 'tiles_unavailable' }]);
  });
});

describe('fitToFeatures with layers (Req 15.16)', () => {
  it('ignores the application layers unless the caller passes their collections', () => {
    const { adapter, map } = setUp();
    map.fire('load');
    adapter.setObservers([{ id: 'o', position: ORIGIN }]);
    adapter.setLayer('far', dots([-39, 30.5]), DOT);
    expect(adapter.fitToFeatures(8).ok).toBe(true);
    const own = map.fitBoundsCalls.at(-1)?.[0] as [[number, number], [number, number]];
    expect(own[1][0]).toBeCloseTo(-40, 5);
    expect(adapter.fitToFeatures(8, [dots([-39, 30.5])]).ok).toBe(true);
    const withLayer = map.fitBoundsCalls.at(-1)?.[0] as [[number, number], [number, number]];
    expect(withLayer[1][0]).toBeCloseTo(-39, 5);
    expect(withLayer[1][1]).toBeCloseTo(30.5, 5);
  });
});

describe('destroy (Req 15.10)', () => {
  it('makes both operations fail with action_not_available', () => {
    const { adapter } = setUp();
    adapter.destroy();
    expect(adapter.setLayer('a', dots([1, 2]), DOT)).toMatchObject({
      ok: false,
      reason: 'action_not_available',
    });
    expect(adapter.clearLayer('a')).toMatchObject({ ok: false, reason: 'action_not_available' });
  });
});
