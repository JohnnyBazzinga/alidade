// The Map screen (design §9, §7.18; Req 1.10, 6.1, 6.11, 18.1 to 18.6): UI's MapView with the used
// observers, lines and Wedges, the Fix and its ellipse, the set-aside lines; the legend; the plain
// background with no Tile source and `host_not_allowed` for a refused one; `crosses_antimeridian`
// through the Message; and the Overlays panel, read generically, with a test-only Overlay.

import { appFeature, type AppLayer } from '@alidade/ui';
import { destinationPosition, type Position } from '@alidade/core';
import { act, fireEvent, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import type { Incident } from '../math/incident/incident-state';
import type {
  OverlayController,
  OverlayDefinition,
  OverlayState,
} from '../overlays/shared/math/overlay-types';
import { useOverlaySlot } from '../overlays/shared/components/OverlayPanel';
import { ok, err } from '../result';
import {
  createFakeEnvironment,
  type FakeEnvironmentOptions,
} from '../test-support/fake-environment';
import { FakeMapLibre, featuresOf } from '../test-support/fake-maplibre';
import {
  entryOfBearing,
  incidentOfEntries,
  pointingAt,
  postsIncident,
  TARGET,
} from '../test-support/geometry-fixtures';
import { ORIGIN, sightingIdOf } from '../test-support/incident-fixtures';
import { renderScreen, storedWith } from '../test-support/render-screen';
import { useEnvironment } from './environment';
import { MapScreen } from './MapScreen';
import { useVigia } from './store';

const DEG = Math.PI / 180;

function show(incidents: readonly Incident[], options: FakeEnvironmentOptions = {}) {
  const lib = new FakeMapLibre();
  const s = renderScreen(<MapScreen overlays={null} />, {
    map: lib,
    storedItems: storedWith(incidents),
    ...options,
  });
  return { ...s, lib };
}

async function loaded(s: { lib: FakeMapLibre; settle: (fn?: () => void) => Promise<void> }) {
  await s.settle();
  await s.settle(() => s.lib.last().fire('load'));
  return s.lib.last();
}

const messageText = (
  reason: 'crosses_antimeridian' | 'host_not_allowed' | 'overlay_unavailable',
) => {
  const m = messageFor({ ok: false, reason });
  return `${m.whatHappened} ${m.whatToDo}`;
};

/** Four posts, the fourth 30° off: Core sets it aside. */
function withOneSetAside(): Incident {
  return postsIncident(['west', 'east', 'side', 'southwest'], (post) => ({
    errorRad: post === 'southwest' ? 30 * DEG : 0,
  }));
}

describe('MapScreen (Req 18.1 to 18.3, 6.1)', () => {
  it('draws the used observers, their lines and Wedges, and the Fix with its ellipse', async () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    const map = await loaded(s);
    expect(featuresOf(map, 'observers')).toHaveLength(3);
    expect(featuresOf(map, 'bearings')).toHaveLength(3);
    expect(featuresOf(map, 'wedges')).toHaveLength(3);
    expect(
      featuresOf(map, 'fix')
        .map((f) => f.properties.kind)
        .sort(),
    ).toEqual(['fix', 'fix-ellipse-95']);
  });

  it('draws a set-aside sighting as a grey dashed line and marker, apart from the used ones', async () => {
    const s = show([withOneSetAside()]);
    const map = await loaded(s);
    expect(featuresOf(map, 'observers')).toHaveLength(3);
    expect(featuresOf(map, 'app-set-aside')).toHaveLength(1);
    expect(featuresOf(map, 'app-set-aside-observers')).toHaveLength(1);
    expect(s.getByTestId('map-legend').textContent).toContain('Grey dashed lines');
  });

  it('names every drawing in the legend, the Fix\u2019s with its 95 % area', async () => {
    const s = show([postsIncident(['west', 'east', 'side'])]);
    await loaded(s);
    const legend = s.getByTestId('map-legend').textContent ?? '';
    expect(legend).toContain(
      'The point and its ellipse: where the smoke probably is, and its 95 % area.',
    );
    expect(legend).toContain('observer');
    expect(legend).not.toContain('Grey dashed lines');
  });

  it('says in the legend when the sightings disagree, and still draws the Fix (Req 6.11)', async () => {
    const posts: Position[] = [
      [-800, 0],
      [800, 0],
      [4000, 3500],
    ].map(([e, n]) => offset(e ?? 0, n ?? 0));
    const incident = incidentOfEntries(
      posts.map((observer, i) =>
        entryOfBearing(
          i + 1,
          pointingAt(sightingIdOf(i + 1), observer, TARGET, i === 1 ? 15 * DEG : 0, {
            azimuthSigmaRad: 2 * DEG,
          }),
        ),
      ),
    );
    const s = show([incident]);
    const map = await loaded(s);
    expect(s.getByTestId('map-legend').textContent).toContain(
      'the best fit of sightings that do not agree',
    );
    expect(featuresOf(map, 'fix')).toHaveLength(2);
  });

  it('with no Tile source: the plain background, and says so', async () => {
    const s = show([postsIncident(['west', 'east'])]);
    await loaded(s);
    expect(s.getByTestId('map-legend').textContent).toContain('Plain background');
  });

  it('with a Tile source refused at start: host_not_allowed', async () => {
    const fake = createFakeEnvironment({ map: new FakeMapLibre() });
    const environment = { ...fake.environment, tilesFailure: err('host_not_allowed') };
    const s = renderScreen(<MapScreen overlays={null} />, {}, { ...fake, environment });
    await s.settle();
    expect(s.getAllByRole('alert').map((a) => a.textContent)).toContain(
      messageText('host_not_allowed'),
    );
  });

  it('shows crosses_antimeridian through its Message', async () => {
    const west = (distanceM: number) => {
      const p = destinationPosition(ORIGIN, 270 * DEG, distanceM);
      if (!p.ok) throw new Error('destination');
      return p.value;
    };
    // Two observers either side of 180°, both sighting north: the map cannot be fitted.
    // Westward from the origin the great circle reaches 180° near 16 010 km, at about 24° S.
    const a = west(15_990_000);
    const b = west(16_040_000);
    expect(Math.sign(a.lonRad)).not.toBe(Math.sign(b.lonRad));
    const north = (o: Position, n: number) =>
      entryOfBearing(n, { ...pointingAt(sightingIdOf(n), o, TARGET), azimuthRad: 0.1 });
    const s = show([incidentOfEntries([north(a, 1), north(b, 2)])]);
    await loaded(s);
    expect(s.getAllByRole('alert').map((x) => x.textContent)).toContain(
      messageText('crosses_antimeridian'),
    );
  });

  it('has no Overlays panel when the Overlays module is empty', async () => {
    const s = show([postsIncident(['west', 'east'])]);
    await loaded(s);
    expect(s.queryByTestId('overlay-panel')).toBeNull();
  });
});

function offset(eastM: number, northM: number): Position {
  const distance = Math.hypot(eastM, northM);
  const p = destinationPosition(ORIGIN, Math.atan2(eastM, northM), distance);
  if (!p.ok) throw new Error('destination');
  return p.value;
}

// --- a test-only Overlay (Req 1.10, 13.1, 18.4) ------------------------------------------------

const TEST_LAYER: AppLayer = (() => {
  const feature = appFeature('test-dot', 'one', { type: 'point', position: TARGET });
  if (!feature.ok) throw new Error('appFeature');
  return {
    id: 'test-dots',
    collection: { type: 'FeatureCollection', features: [feature.value] },
    paint: { kind: 'circle', colour: '#3366CC', radiusPx: 6 },
  };
})();

const TEST_URL = 'https://overlay.example.test/data';

/** A controller that asks the gate once when switched on and on Refresh, and nothing else. */
const TEST_OVERLAY: OverlayDefinition = {
  id: 'test',
  title: 'Test layer',
  sends: 'Switching this on sends one point, rounded, to the test Source.',
  sources: [{ name: 'Test Source', attribution: '© Test', termsUrl: 'terms of the test Source' }],
  create(deps): OverlayController {
    const listeners = new Set<() => void>();
    let state: OverlayState = {
      id: 'test',
      enabled: false,
      status: 'off',
      failure: null,
      layers: [],
      legend: [],
      words: [],
      fetchedUtcMs: null,
    };
    const set = (next: OverlayState) => {
      state = next;
      for (const l of [...listeners]) l();
    };
    const load = () => {
      set({ ...state, status: 'loading' });
      void deps.gate.get(TEST_URL).then((r) => {
        if (!r.ok) set({ ...state, status: 'failed', failure: r, layers: [], legend: [] });
        else {
          const now = deps.clock();
          set({
            ...state,
            status: 'ready',
            failure: null,
            layers: [TEST_LAYER],
            legend: [{ label: 'Blue dots: test data.', sourceName: 'Test Source', timeUtcMs: now }],
            words: [`The test says ${r.value}.`],
            fetchedUtcMs: now,
          });
        }
      });
    };
    return {
      getState: () => state,
      subscribe: (l) => {
        listeners.add(l);
        return () => void listeners.delete(l);
      },
      setEnabled: (enabled) => {
        if (enabled === state.enabled) return;
        set({ ...state, enabled, status: enabled ? state.status : 'off' });
        if (enabled) load();
        else set({ ...state, layers: [], legend: [], failure: null });
      },
      refresh: () => {
        if (state.enabled) load();
      },
      update: () => undefined,
    };
  },
};

function MapWithOverlays({ definitions }: { readonly definitions: readonly OverlayDefinition[] }) {
  const environment = useEnvironment();
  const { open } = useVigia();
  const slot = useOverlaySlot(definitions, environment, open);
  return <MapScreen overlays={slot} />;
}

function showOverlays(answer: 'refuse' | 'answer', definitions = [TEST_OVERLAY]) {
  const lib = new FakeMapLibre();
  const fake = createFakeEnvironment({ map: lib, storedItems: storedWith([withOneSetAside()]) });
  const calls: string[] = [];
  const environment = {
    ...fake.environment,
    gate: {
      get: (url: string) => {
        calls.push(url);
        return Promise.resolve(answer === 'refuse' ? err('overlay_unavailable') : ok('calm'));
      },
    },
  };
  const s = renderScreen(
    <MapWithOverlays definitions={definitions} />,
    {},
    { ...fake, environment },
  );
  return { ...s, lib, calls };
}

describe('the Overlays panel (Req 1.10, 13.1, 18.4)', () => {
  it('has a switch, off, and before the first use says what will be sent; no request is made', async () => {
    const s = showOverlays('answer');
    await loaded(s);
    const panel = s.getByTestId('overlay-panel');
    const toggle = within(panel).getByRole('switch', { name: 'Test layer' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(panel.textContent).toContain(TEST_OVERLAY.sends);
    expect(s.calls).toEqual([]);
  });

  it('once on: one request, its layer on the map, its legend with Source and time, its Source and words', async () => {
    const s = showOverlays('answer');
    const map = await loaded(s);
    await s.settle(() => fireEvent.click(s.getByRole('switch', { name: 'Test layer' })));
    await s.settle();
    expect(s.calls).toEqual([TEST_URL]);
    expect(featuresOf(map, 'app-test-dots')).toHaveLength(1);
    const legend = s.getByTestId('map-legend').textContent ?? '';
    expect(legend).toContain('Blue dots: test data. Source: Test Source, data of 14:13 UTC.');
    const panel = s.getByTestId('overlay-panel');
    expect(panel.textContent).toContain('Test Source. © Test. Terms: terms of the test Source');
    expect(panel.textContent).toContain('Fetched 14:13 UTC');
    expect(panel.textContent).toContain('The test says calm.');
    // The set-aside layers are still there: the Overlay's layer is added, nothing replaced.
    expect(featuresOf(map, 'app-set-aside')).toHaveLength(1);
  });

  it('asks again only on Refresh', async () => {
    const s = showOverlays('answer');
    await loaded(s);
    await s.settle(() => fireEvent.click(s.getByRole('switch', { name: 'Test layer' })));
    await s.settle(() => s.fake.timer.advance(3_600_000));
    expect(s.calls).toHaveLength(1);
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: 'Refresh Test layer' })));
    expect(s.calls).toHaveLength(2);
  });

  it('shows a failure beside the switch, and nothing else changes', async () => {
    const s = showOverlays('refuse');
    const map = await loaded(s);
    const before = {
      observers: featuresOf(map, 'observers').length,
      fix: featuresOf(map, 'fix').length,
    };
    await s.settle(() => fireEvent.click(s.getByRole('switch', { name: 'Test layer' })));
    await s.settle();
    const panel = s.getByTestId('overlay-panel');
    const item = within(panel).getByTestId('overlay-test');
    expect(within(item).getByRole('alert').textContent).toBe(messageText('overlay_unavailable'));
    const outside = s.getAllByRole('alert').filter((a) => !panel.contains(a));
    expect(outside).toEqual([]);
    expect(featuresOf(map, 'observers')).toHaveLength(before.observers);
    expect(featuresOf(map, 'fix')).toHaveLength(before.fix);
    expect(featuresOf(map, 'app-set-aside')).toHaveLength(1);
    expect(map.data.has('app-test-dots')).toBe(false);
  });

  it('has no panel with no Overlay registered', async () => {
    const s = showOverlays('answer', []);
    await loaded(s);
    expect(s.queryByTestId('overlay-panel')).toBeNull();
    await act(async () => undefined);
  });
});
