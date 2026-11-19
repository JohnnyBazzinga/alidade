import {
  BearingModel,
  initialAzimuthRad,
  solve,
  unprojectToLocalPlane,
  type Bearing,
  type Fix,
  type Position,
} from '@alidade/core';
import { act, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ellipse95 } from '@alidade/core';
import type { AppFeatureCollection, LayerPaint } from '../math/map/app-layer';
import { messageFor } from '../math/messages';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { FakeTimer } from '../test-support/fake-timer';
import { MapView } from './MapView';

const ORIGIN: Position = { latRad: 0.5, lonRad: -0.7 };
const at = (eastM: number, northM: number): Position => {
  const p = unprojectToLocalPlane(ORIGIN, { eastM, northM });
  if (!p.ok) throw new Error('position');
  return p.value;
};
const TARGET = at(0, 3000);
function bearing(id: string, observer: Position): Bearing {
  const az = initialAzimuthRad(observer, TARGET);
  if (!az.ok) throw new Error('azimuth');
  return {
    id,
    observer,
    positionAccuracyM: 5,
    timeUtcMs: 1,
    azimuthRad: az.value,
    azimuthSigmaRad: 0.02,
  };
}
const OBSERVERS = [
  { id: 'a', position: at(-800, 0) },
  { id: 'b', position: at(800, 0) },
];
const BEARINGS = OBSERVERS.map((o) => bearing(o.id, o.position));
const FIX: Fix = (() => {
  const f = solve(new BearingModel(), BEARINGS);
  if (!f.ok) throw new Error(f.reason);
  return f.value;
})();

describe('MapView (Req 15, 13.6)', () => {
  const timer = new FakeTimer();

  it('writes the observers, the bearings and the Fix with its ellipse to the map once it has loaded', () => {
    const lib = new FakeMapLibre();
    render(
      <MapView
        lib={lib}
        tiles={null}
        timer={timer}
        observers={OBSERVERS}
        bearings={BEARINGS}
        lineLengthM={5000}
        fix={FIX}
      />,
    );
    const map = lib.last();
    map.fire('load');
    const collection = (id: string) =>
      map.data.get(id) as { features: { properties: { kind: string } }[] };
    expect(collection('observers').features).toHaveLength(2);
    expect(collection('bearings').features.map((f) => f.properties.kind)).toEqual([
      'bearing-line',
      'bearing-line',
    ]);
    expect(collection('wedges').features).toHaveLength(2);
    expect(
      collection('fix')
        .features.map((f) => f.properties.kind)
        .sort(),
    ).toEqual(['fix', 'fix-ellipse-95']);
    expect(ellipse95(FIX.ellipse).ok).toBe(true);
  });

  it('clears the Fix when it is null and removes the map when unmounted', () => {
    const lib = new FakeMapLibre();
    const { rerender, unmount } = render(
      <MapView
        lib={lib}
        tiles={null}
        timer={timer}
        observers={OBSERVERS}
        bearings={BEARINGS}
        lineLengthM={5000}
        fix={FIX}
      />,
    );
    const map = lib.last();
    map.fire('load');
    rerender(
      <MapView
        lib={lib}
        tiles={null}
        timer={timer}
        observers={OBSERVERS}
        bearings={BEARINGS}
        lineLengthM={5000}
        fix={null}
      />,
    );
    expect((map.data.get('fix') as { features: unknown[] }).features).toHaveLength(0);
    unmount();
    expect(map.removeCount).toBe(1);
  });

  it('shows the Message of map_unavailable when the library cannot start', () => {
    const lib = new FakeMapLibre({ throwOnCreate: new Error('no webgl') });
    const { getByRole } = render(
      <MapView
        lib={lib}
        tiles={null}
        timer={timer}
        observers={[]}
        bearings={[]}
        lineLengthM={5000}
        fix={null}
      />,
    );
    expect(getByRole('alert').textContent).not.toContain('map_unavailable');
    expect(getByRole('alert').textContent).toMatch(/map/i);
  });

  it('shows the Message of tiles_unavailable when the map reports a tile error', () => {
    const lib = new FakeMapLibre();
    const { queryByRole, getByRole } = render(
      <MapView
        lib={lib}
        tiles={null}
        timer={timer}
        observers={[]}
        bearings={[]}
        lineLengthM={5000}
        fix={null}
      />,
    );
    expect(queryByRole('alert')).toBeNull();
    act(() => lib.last().fire('error'));
    expect(getByRole('alert').textContent).toMatch(/tile|map/i);
  });

  // Req 15.18: the worker did not start. The screen says the map cannot be drawn here, never that
  // the tiles failed, and it keeps saying so when new Bearings or a Fix arrive.
  it('shows the Message of map_unavailable when the worker does not start, and keeps it', () => {
    const lib = new FakeMapLibre();
    const props = {
      lib,
      tiles: null,
      timer,
      bearings: [],
      lineLengthM: 5000,
    } as const;
    const { getByRole, rerender } = render(<MapView {...props} observers={[]} fix={null} />);
    act(() => lib.last().fire('unavailable', { error: new Error('Worker failed to load.') }));
    const m = messageFor({ ok: false, reason: 'map_unavailable' });
    expect(getByRole('alert').textContent).toBe(m.whatHappened + m.whatToDo);
    act(() => lib.last().fire('load'));
    rerender(<MapView {...props} observers={OBSERVERS} fix={FIX} />);
    expect(getByRole('alert').textContent).toBe(m.whatHappened + m.whatToDo);
  });

  it('draws nothing while the library is still loading', () => {
    const { getByTestId } = render(
      <MapView
        lib={null}
        tiles={null}
        timer={timer}
        observers={OBSERVERS}
        bearings={[]}
        lineLengthM={5000}
        fix={null}
      />,
    );
    expect(getByTestId('map-container').childElementCount).toBe(0);
  });

  it('does not accept a Position in place of a Fix (type level, Req 13.6)', () => {
    // Checked by `pnpm typecheck`: the directive fails the build if the line below it compiles.
    const props: ComponentProps<typeof MapView> = {
      lib: null,
      tiles: null,
      timer,
      observers: [],
      bearings: [],
      lineLengthM: 1,
      // @ts-expect-error a Position has no covariance and no ellipse, so it is not a Fix
      fix: ORIGIN,
    };
    const bad = <MapView {...props} />;
    expect(bad).toBeDefined();
  });

  // Req 15.14, 15.17, D31.7: the `layers` prop is `setLayer` for each layer it holds and
  // `clearLayer` for each it held before and no longer does.
  describe('application layers (the layers prop)', () => {
    const DOT: LayerPaint = { kind: 'circle', colour: '#112233', radiusPx: 5 };
    const SHADE: LayerPaint = { kind: 'fill', colour: '#445566' };
    const dots = (lon: number): AppFeatureCollection => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'hotspot:0',
          geometry: { type: 'Point', coordinates: [lon, 30] },
          properties: { kind: 'hotspot', id: '0' },
        },
      ],
    });
    const view = (layers?: ComponentProps<typeof MapView>['layers'], lib = new FakeMapLibre()) => ({
      lib,
      element: (
        <MapView
          lib={lib}
          tiles={null}
          timer={timer}
          observers={OBSERVERS}
          bearings={BEARINGS}
          lineLengthM={5000}
          fix={FIX}
          {...(layers === undefined ? {} : { layers })}
        />
      ),
    });
    const appIds = (map: { layerIds(): string[] }) =>
      map.layerIds().filter((i) => i.startsWith('app-'));

    it('draws each layer, under the skeleton’s, once the map has loaded', () => {
      const { lib, element } = view([
        { id: 'hot', collection: dots(-40), paint: DOT },
        { id: 'zone', collection: dots(-41), paint: SHADE },
      ]);
      render(element);
      const map = lib.last();
      map.fire('load');
      expect(appIds(map)).toEqual(['app-hot', 'app-zone']);
      expect(map.layerIds().indexOf('app-zone')).toBeLessThan(
        map.layerIds().indexOf('wedges-fill'),
      );
      expect(map.data.get('app-hot')).toEqual(dots(-40));
    });

    it('changes the data and the paint of a layer, and removes one that is no longer there', () => {
      const first = view([
        { id: 'hot', collection: dots(-40), paint: DOT },
        { id: 'zone', collection: dots(-41), paint: SHADE },
      ]);
      const { rerender } = render(first.element);
      const map = first.lib.last();
      map.fire('load');
      const next = view(
        [{ id: 'hot', collection: dots(-39), paint: { ...DOT, radiusPx: 8 } }],
        first.lib,
      );
      rerender(next.element);
      expect(appIds(map)).toEqual(['app-hot']);
      expect(map.data.get('app-hot')).toEqual(dots(-39));
      expect(map.layers.find((l) => l.id === 'app-hot')?.paint).toMatchObject({
        'circle-radius': 8,
      });
      expect(map.data.has('app-zone')).toBe(false);
    });

    // Req 15.14 (H2): each layer says whether the map is fitted to it.
    describe('fitting to a layer', () => {
      type Box = [[number, number], [number, number]];
      const lastFit = (lib: FakeMapLibre) =>
        lib.last().fitBoundsCalls.at(-1)?.[0] as Box | undefined;
      const FAR = dots(-20);

      it('fits to a layer that asks for it, and only to that one', () => {
        const withFit = view([{ id: 'far', collection: FAR, paint: DOT, fit: true }]);
        render(withFit.element);
        withFit.lib.last().fire('load');
        expect(lastFit(withFit.lib)?.[1][0]).toBeCloseTo(-20, 5);

        const without = view([{ id: 'far', collection: FAR, paint: DOT }]);
        render(without.element);
        without.lib.last().fire('load');
        expect((lastFit(without.lib)?.[1][0] ?? 0) < -30).toBe(true);

        const explicit = view([{ id: 'far', collection: FAR, paint: DOT, fit: false }]);
        render(explicit.element);
        explicit.lib.last().fire('load');
        expect((lastFit(explicit.lib)?.[1][0] ?? 0) < -30).toBe(true);
      });

      it('fits to the layers that ask and not to the one that does not', () => {
        const { lib, element } = view([
          { id: 'near', collection: dots(-39), paint: DOT, fit: true },
          { id: 'far', collection: FAR, paint: DOT },
        ]);
        render(element);
        lib.last().fire('load');
        expect(lastFit(lib)?.[1][0]).toBeCloseTo(-39, 5);
      });

      it('fits to a layer that asks for it even with no observers', () => {
        const lib = new FakeMapLibre();
        render(
          <MapView
            lib={lib}
            tiles={null}
            timer={timer}
            observers={[]}
            bearings={[]}
            lineLengthM={5000}
            fix={null}
            layers={[{ id: 'far', collection: FAR, paint: DOT, fit: true }]}
          />,
        );
        lib.last().fire('load');
        expect(lastFit(lib)?.[0][0]).toBeCloseTo(-20, 5);
      });
    });

    it('has none without the prop, and does not disturb the Fix', () => {
      const { lib, element } = view();
      render(element);
      const map = lib.last();
      map.fire('load');
      expect(appIds(map)).toEqual([]);
      expect(map.layerIds().slice(-2)).toEqual(['fix-casing', 'fix-core']);
    });

    it('shows the Message of a layer the adapter refuses, and no raw code', () => {
      const { lib, element } = view([{ id: 'Bad Id', collection: dots(-40), paint: DOT }]);
      const { getByRole } = render(element);
      lib.last().fire('load');
      expect(getByRole('alert').textContent).not.toMatch(/invalid_number|Bad Id/);
      expect(appIds(lib.last())).toEqual([]);
    });
  });
});
