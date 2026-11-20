// The Map screen (Req 9.4 to 9.6, 11.4; design §9, D16).

import { CATALOGUE_ORIGIN } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../math/degrees';
import { defaultParameters } from '../math/parameters';
import { appWrap } from '../test-support/app-wrap';
import { featuresOf } from '../test-support/fake-maplibre';
import { noiseFreeSights } from '../test-support/noise-free';
import { renderScreen } from '../test-support/render-screen';
import { testEnvironment } from '../test-support/test-environment';
import { MapScreen } from './MapScreen';

const params = defaultParameters();
const D = DEG_TO_RAD;
const T = [
  Date.UTC(2026, 11, 21, 11, 40),
  Date.UTC(2026, 11, 21, 14, 40),
  Date.UTC(2026, 11, 21, 17, 40),
];

async function show(times: number[], sunSide: boolean, over = {}) {
  const t = testEnvironment(over);
  const w = appWrap(t);
  noiseFreeSights(CATALOGUE_ORIGIN, times, 0, sunSide, params).forEach((s) =>
    w.store.dispatch({ kind: 'capture', sight: s }),
  );
  w.store.dispatch({
    kind: 'save_index_error',
    indexError: {
      valueRad: 0,
      sigmaRad: 0.1 * D,
      sightCount: 1,
      measuredUtcMs: T[2] ?? 0,
      simulated: false,
    },
  });
  const screen = renderScreen(<MapScreen />, w.wrap);
  await screen.settle();
  await screen.settle(() => t.maplibre.last().fire('load'));
  return { t, store: w.store, screen, map: t.maplibre.last(), q: within(screen.container) };
}

const kinds = (
  map: ReturnType<typeof featuresOf> extends never ? never : Parameters<typeof featuresOf>[0],
  id: string,
) => featuresOf(map, id).map((f) => f.properties.kind);

describe('MapScreen', () => {
  it('draws the Fix only through setFix (the skeleton’s fix source), with one arc per used Sight', async () => {
    const m = await show(T, true);
    expect(kinds(m.map, 'fix').sort()).toEqual(['fix', 'fix-ellipse-95']);
    expect(kinds(m.map, 'app-circles-used').length).toBeGreaterThanOrEqual(3);
    expect(kinds(m.map, 'app-places-point')).toEqual([]);
    expect(kinds(m.map, 'app-gps')).toEqual([]);
  });

  it('draws Two places through layers, labelled A and B, and nothing in the fix source', async () => {
    const m = await show([T[0] ?? 0, T[2] ?? 0], false);
    expect(kinds(m.map, 'fix')).toEqual([]);
    expect(kinds(m.map, 'app-places-point')).toEqual(['place-point', 'place-point']);
    expect(kinds(m.map, 'app-places-area')).toEqual(['place-area', 'place-area']);
    const legend = m.q.getByTestId('map-legend').textContent ?? '';
    expect(legend).toContain('A and B');
  });

  it('draws the GPS marker in its own layer after a Comparison, never as the Fix', async () => {
    const m = await show(T, true);
    await m.screen.settle(() => void m.store.compareWithGps());
    expect(kinds(m.map, 'app-gps')).toEqual(['gps']);
    expect(kinds(m.map, 'fix').sort()).toEqual(['fix', 'fix-ellipse-95']);
    expect(m.q.getByTestId('map-legend').textContent).toContain('GPS');
  });

  it('draws nothing and says so with no sight, and with one sight only the words say where', async () => {
    const m = await show([T[0] ?? 0], false);
    expect(kinds(m.map, 'fix')).toEqual([]);
    expect(m.q.getByText(/The map shows the position once two sights give one/)).toBeTruthy();
  });

  it('says the plain background makes no request when there is no Tile source', async () => {
    const m = await show(T, true);
    expect(m.q.getByTestId('map-legend').textContent).toContain(
      'no tile server is asked for anything',
    );
  });

  it('names the tile source with its attribution and terms, under the map', async () => {
    const m = await show(T, true, {
      tileSourceNote: {
        sourceName: 'Example Tiles',
        attribution: '© Example contributors',
        termsUrl: 'https://example.test/terms',
      },
    });
    const legend = m.q.getByTestId('map-legend').textContent ?? '';
    expect(legend).toContain('Example Tiles');
    expect(legend).toContain('© Example contributors');
    expect(legend).toContain('https://example.test/terms');
  });

  it('shows host_not_allowed through messageFor when the tile source was refused', async () => {
    const m = await show(T, true, { tilesFailure: { ok: false, reason: 'host_not_allowed' } });
    expect(within(m.screen.container).getAllByRole('alert').length).toBeGreaterThan(0);
    expect(m.screen.container.textContent).not.toContain('host_not_allowed');
    fireEvent.click(document.body);
  });
});

type Ring = { geometry: { type: string; coordinates: unknown } }[];
/** The `[lon, lat]` pairs of every geometry of a source of the fake map. */
function coordinatesOf(map: ReturnType<typeof Object>, source: string): [number, number][] {
  const data = (map as { data: Map<string, { features?: Ring }> }).data.get(source);
  const out: [number, number][] = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') out.push([c[0], c[1] as number]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  for (const f of data?.features ?? []) walk(f.geometry.coordinates);
  return out;
}

describe('MapScreen fits the map to what it draws (task group 13, C)', () => {
  const lastFit = (map: { fitBoundsCalls: unknown[][] }) => {
    const call = map.fitBoundsCalls[map.fitBoundsCalls.length - 1];
    if (call === undefined) throw new Error('the map was never fitted');
    const [bounds, options] = call as [
      [[number, number], [number, number]],
      { padding: { top: number; bottom: number } },
    ];
    return {
      west: bounds[0][0],
      south: bounds[0][1],
      east: bounds[1][0],
      north: bounds[1][1],
      options,
    };
  };
  const inside = (b: ReturnType<typeof lastFit>, [lon, lat]: [number, number]) =>
    lon >= b.west - 1e-9 && lon <= b.east + 1e-9 && lat >= b.south - 1e-9 && lat <= b.north + 1e-9;

  it('contains the ellipse, the arcs near the Fix and the comparison marker, with the ellipse a third of the width or more', async () => {
    const m = await show(T, true);
    await m.screen.settle(() => void m.store.compareWithGps());
    const b = lastFit(m.map);
    const ellipse = coordinatesOf(m.map, 'fix');
    expect(ellipse.length).toBeGreaterThan(16);
    for (const c of ellipse) expect(inside(b, c)).toBe(true);
    for (const c of coordinatesOf(m.map, 'app-circles-used')) expect(inside(b, c)).toBe(true);
    for (const c of coordinatesOf(m.map, 'app-gps')) expect(inside(b, c)).toBe(true);
    const lons = ellipse.map((c) => c[0]);
    const ellipseWidth = Math.max(...lons) - Math.min(...lons);
    expect(ellipseWidth / (b.east - b.west)).toBeGreaterThanOrEqual(1 / 3);
    // Not the world: an area of a few hundred kilometres.
    expect(b.east - b.west).toBeLessThan(20);
  });

  it('keeps the bottom margin the skeleton keeps for the attribution', async () => {
    const m = await show(T, true);
    const { options } = lastFit(m.map);
    expect(options.padding.bottom).toBeGreaterThan(options.padding.top);
  });

  it('says that Two places too far apart for one map cannot be fitted, and still draws both (Req 9.5)', async () => {
    // The two places of the good-day sights are 11 700 km apart, near 87° S and 30° N: with their
    // ellipses the longitudes span more than 180°, which UI's fit refuses (`crosses_antimeridian`).
    const m = await show([T[0] ?? 0, T[2] ?? 0], false);
    expect(coordinatesOf(m.map, 'app-places-point')).toHaveLength(2);
    expect(m.map.fitBoundsCalls).toHaveLength(0);
    expect(m.q.getByRole('alert').textContent).toContain('too far apart to show on one map');
  });

  it('makes no fit, and shows no failure, when nothing is drawn', async () => {
    const m = await show([T[0] ?? 0], false);
    expect(m.map.fitBoundsCalls).toHaveLength(0);
    expect(m.q.queryAllByRole('alert')).toHaveLength(0);
  });
});
