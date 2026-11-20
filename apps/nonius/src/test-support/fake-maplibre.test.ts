import { describe, expect, it } from 'vitest';
import { FakeMapLibre, featuresOf } from './fake-maplibre';

const options = {
  style: {
    version: 8,
    sources: { fix: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    layers: [{ id: 'background', type: 'background' }],
  },
} as unknown as Parameters<FakeMapLibre['createMap']>[0];

describe('FakeMapLibre (test support)', () => {
  it('records the maps it creates and returns the last', () => {
    const lib = new FakeMapLibre();
    expect(() => lib.last()).toThrow();
    lib.createMap(options);
    const second = lib.createMap(options);
    expect(lib.maps).toHaveLength(2);
    expect(lib.last()).toBe(second as unknown as ReturnType<FakeMapLibre['last']>);
  });

  it('keeps the data a source is given and the layers added and removed', async () => {
    const lib = new FakeMapLibre();
    lib.createMap(options);
    const map = lib.last();
    const data = {
      type: 'FeatureCollection',
      features: [{ properties: { kind: 'fix', id: 'a' } }],
    };
    await map.getSource('fix')?.setData(data as never);
    expect(featuresOf(map, 'fix')).toHaveLength(1);
    map.addLayer({ id: 'extra', type: 'line', source: 'fix' } as never, undefined as never);
    expect(map.layerIds()).toEqual(['background', 'extra']);
    map.removeLayer('extra');
    expect(map.layerIds()).toEqual(['background']);
  });

  it('delivers fired events to listeners until they unsubscribe', () => {
    const lib = new FakeMapLibre();
    lib.createMap(options);
    const map = lib.last();
    let count = 0;
    const sub = map.on('load', () => {
      count += 1;
    });
    map.fire('load');
    sub.unsubscribe();
    map.fire('load');
    expect(count).toBe(1);
  });
});
