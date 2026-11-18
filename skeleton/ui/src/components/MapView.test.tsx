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
});
