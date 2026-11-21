// The reviewer's path (design §10, §12; Req 17.3, 17.6, 17.7, 21.2): with a fake Timer, a fake map,
// memory storage, the in-memory network and a Network gate that records and refuses every call, a
// reviewer on a laptop chooses a scene, Starts, Freezes, Captures (by the crosshair and by a Mark
// on the smoke), answers "same smoke", changes the Station, shares a sighting to another phone,
// adds it in that phone's Inbox, and sees the merged Fix, its words, the advice, the Emergency
// text, and the map. Each of the four scenes runs on a copy with the orientation noise at 0, so
// that each captured Bearing equals the Target's true azimuth to 1e-8 rad; the one wrong post is
// the one that is 12° off. The gate is never called.

import {
  greatCircleDistanceM,
  initialAzimuthRad,
  projectToLocalPlane,
  wrapPi,
  type Position,
} from '@alidade/core';
import type { CatalogueScene, Session } from '@alidade/ui';
import { fireEvent, within } from '@testing-library/react';
import { describe, expect, inject, it } from 'vitest';
import { messageFor } from '../../math/messages';
import { SIMULATION_TEXT } from '../../math/texts';
import { QR_ONE_LINE_TEXT } from '../../math/texts';
import { OVERLAYS } from '../../overlays';
import { OVERLAYS as CUT } from '../../overlays-empty';
import { featuresOf } from '../../test-support/fake-maplibre';
import { postsIncident } from '../../test-support/geometry-fixtures';
import { renderScreen, storedWith } from '../../test-support/render-screen';
import { mountSimulation, noiseFree, scenesOfTheApp } from '../../test-support/simulation-driver';
import { ShareSheet } from '../ShareSheet';

type Harness = ReturnType<typeof mountSimulation>;

const rad = (angleDeg: number) => (angleDeg * Math.PI) / 180;
const outlierMessage = () => {
  const m = messageFor({ ok: false, reason: 'outlier' });
  return `${m.whatHappened} ${m.whatToDo}`;
};

interface SceneExpectation {
  readonly id: string;
  /**
   * `natural`: each post takes its sighting first, a code is sent and the answer is "the same
   * smoke" (Req 4.8). `old`: the later posts first receive the earlier posts' codes, and then
   * sight the same smoke (the order of the first form of the requirement).
   */
  readonly order: 'natural' | 'old';
  readonly stations: readonly string[];
  readonly used: number;
  readonly setAside: number;
  /** The text the Smoke screen shows, piece by piece (the Fix's words, the advice). */
  readonly smoke: readonly string[];
  /** The text of the Emergency tab, piece by piece. */
  readonly emergency: readonly string[];
}

const SIM_LINE = SIMULATION_TEXT;
const NOT_CHECKED = 'Two sightings cannot check each other.';

const SCENES: readonly SceneExpectation[] = [
  {
    id: 'two-posts',
    order: 'natural',
    stations: ['west', 'east'],
    used: 2,
    setAside: 0,
    smoke: [
      '2 sightings, 2 used',
      'Probably here: 30.027° N, 40.000° W, within about 820 m (95 %).',
      'The 95 % area is an ellipse with semi-axes 750 m and 200 m, long axis north to south (0°).',
      'Geometry: poor.',
      'take a further sighting from the east or the west of the smoke, about 3.1 km from it.',
    ],
    emergency: [SIM_LINE, 'Geometry: poor.', NOT_CHECKED],
  },
  {
    id: 'three-posts',
    order: 'natural',
    stations: ['west', 'east', 'side'],
    used: 3,
    setAside: 0,
    smoke: [
      '3 sightings, 3 used',
      'Probably here: 30.027° N, 40.000° W, within about 330 m (95 %).',
      'The 95 % area is an ellipse with semi-axes 260 m and 200 m, long axis north to south (0°).',
      'Geometry: good. The lines cross at a good angle.',
      'The geometry is good; a further sighting from anywhere still helps',
    ],
    emergency: [SIM_LINE, 'Geometry: good.', 'Three sightings can show that they disagree'],
  },
  {
    id: 'four-posts-one-wrong',
    order: 'old',
    stations: ['west', 'east', 'side', 'southwest'],
    used: 3,
    setAside: 1,
    smoke: [
      '4 sightings, 3 used',
      'Probably here: 30.027° N, 40.000° W, within about 330 m (95 %).',
      'The 95 % area is an ellipse with semi-axes 260 m and 200 m, long axis north to south (0°).',
      'Based on 3 sightings (1 set aside);',
      '1 sighting did not agree with the others and was set aside.',
    ],
    emergency: [SIM_LINE, 'Based on 3 sightings (1 set aside);', 'Geometry: good.'],
  },
  {
    id: 'almost-in-line',
    order: 'old',
    stations: ['front', 'back'],
    used: 2,
    setAside: 0,
    smoke: [
      '2 sightings, 2 used',
      'Probably here: 30.027° N, 40.000° W, within about 8.6 km (95 %).',
      'The 95 % area is an ellipse with semi-axes 8.5 km and 240 m, long axis north to south (179°).',
      'Geometry: poor.',
      'The sightings cross at a narrow angle (under 20 degrees).',
      'take a further sighting from the west or the east of the smoke, about 3.0 km from it.',
    ],
    emergency: [SIM_LINE, 'Geometry: poor.', NOT_CHECKED],
  },
];

const labelOf = (stationId: string, scene: CatalogueScene) => {
  const station = scene.scene.stations.find((s) => s.id === stationId);
  if (station === undefined) throw new Error(`no station ${stationId}`);
  return `the phone at the ${station.name.toLowerCase()}`;
};

/**
 * The reviewer's flow on the scene: the first post sights a new smoke by the crosshair; each next
 * post receives every earlier post's own sighting (shared by that post's phone, added in this
 * phone's Inbox) and sights the same smoke, by a Mark when its place in the order is odd.
 * Ends on the Smoke screen of the last post.
 */
async function runFlow(m: Harness, scene: CatalogueScene, stations: readonly string[]) {
  const first = stations[0];
  if (first === undefined) throw new Error('no station');
  if (scene.scene.id !== 'two-posts') {
    await m.openSight();
    await m.chooseScene(scene.scene.id);
    await m.click('Back');
  }
  await m.sight(first, 'crosshair', 'new');
  const advice: string[] = [];
  for (const [k, station] of stations.entries()) {
    if (k === 0) continue;
    for (const earlier of stations.slice(0, k)) {
      await m.switchTo(earlier);
      await m.shareOwnSightingTo(labelOf(station, scene));
    }
    await m.switchTo(station);
    await m.addEverythingWaiting();
    await m.sight(station, k % 2 === 1 ? 'mark' : 'crosshair', 'same', true);
    advice.push(m.queryByTestId('advice')?.textContent ?? '');
  }
  return { advice };
}

/** What a phone's Smoke screen says of the Fix: its position, its area and what it rests on. */
function fixOf(m: Harness): string {
  const text = m.text('smoke-screen');
  const start = text.indexOf('Probably here:');
  const end = text.indexOf('Geometry:');
  if (start < 0 || end < start) throw new Error('no Fix on the Smoke screen');
  // "About D km north of where you took your last sighting" is the phone's own: left out.
  return text.slice(start, end).replace(/About [^]*?\(at least 95 %\)\./, '');
}

/**
 * The natural order (Req 4.8): every post takes its sighting first, so each phone has started its
 * own smoke; then the first post sends its code to the second, which answers "the same smoke" and
 * has the Fix; then the second sends its own back, and both phones show the same Fix and give a
 * sighting the same Incident id; any other posts then exchange their own sightings with all.
 */
async function runNaturalFlow(m: Harness, scene: CatalogueScene, stations: readonly string[]) {
  const [first, second] = stations;
  if (first === undefined || second === undefined) throw new Error('two posts at least');
  if (scene.scene.id !== 'two-posts') {
    await m.openSight();
    await m.chooseScene(scene.scene.id);
    await m.click('Back');
  }
  for (const [k, station] of stations.entries()) {
    await m.sight(station, k % 2 === 1 ? 'mark' : 'crosshair', 'new');
  }
  // Each phone has its own smoke, with an id of its own.
  const idsBefore: Record<string, string> = {};
  for (const station of stations) {
    await m.switchTo(station);
    idsBefore[station] = await m.incidentIdOfThisPhone();
  }
  const exchange = async (from: string, to: string) => {
    await m.switchTo(from);
    await m.shareOwnSightingTo(labelOf(to, scene));
    await m.switchTo(to);
    await m.addByJoining();
  };

  // One code, one answer: the second post has the Fix.
  await m.switchTo(second);
  const aloneText = m.text('smoke-screen');
  expect(aloneText).not.toContain('Probably here');
  await exchange(first, second);
  const afterTheFirst = fixOf(m);
  // The other direction: both phones show the same Fix and the same smoke.
  await exchange(second, first);
  const onTheFirst = fixOf(m);
  const idOnTheFirst = await m.incidentIdOfThisPhone();
  await m.switchTo(second);
  const onTheSecond = fixOf(m);
  const idOnTheSecond = await m.incidentIdOfThisPhone();

  // The other posts: each receives every other post's own sighting and sends its own to them.
  for (const station of stations.slice(2)) {
    for (const other of stations.filter((s) => s !== station)) await exchange(other, station);
    for (const other of stations.filter((s) => s !== station)) await exchange(station, other);
  }
  const final: Record<string, { fix: string; incidentId: string }> = {};
  for (const station of stations) {
    await m.switchTo(station);
    final[station] = { fix: fixOf(m), incidentId: await m.incidentIdOfThisPhone() };
  }
  return { idsBefore, afterTheFirst, onTheFirst, onTheSecond, idOnTheFirst, idOnTheSecond, final };
}

/** Every captured Bearing a Session reported, once each, with the Station it was taken at. */
function capturesOf(m: Harness) {
  const seen = new Set<object>();
  const out: { stationId: string; azimuthRad: number; marked: boolean; session: Session }[] = [];
  for (const { session, context } of m.sessions) {
    const captured = session.captured;
    if (session.state !== 'captured' || captured === null || captured.kind !== 'bearing') continue;
    if (seen.has(captured)) continue;
    seen.add(captured);
    out.push({
      stationId: context.station.id,
      azimuthRad: captured.bearing.azimuthRad,
      marked: captured.mark !== null,
      session,
    });
  }
  return out;
}

function truthAzimuthRad(scene: CatalogueScene, stationId: string): number {
  const station = scene.scene.stations.find((s) => s.id === stationId);
  const target = scene.scene.targets.find((t) => t.id === 'smoke');
  if (station === undefined || target === undefined || target.kind !== 'landmark') {
    throw new Error('scene');
  }
  const azimuth = initialAzimuthRad(station.position, target.position);
  if (!azimuth.ok) throw new Error('azimuth');
  return azimuth.value;
}

async function loadMap(m: Harness) {
  await m.tab('Map');
  await m.settle();
  await m.settle(() => m.map().fire('load'));
  return m.map();
}

describe('the reviewer’s path on each scene, noise 0 (Req 17.3, 17.6, 17.7)', () => {
  for (const expected of SCENES) {
    it(`${expected.id}: the flow to its end, the words, the advice, the set-aside cause, the map`, async () => {
      const scenes = noiseFree(scenesOfTheApp());
      const scene = scenes.find((s) => s.scene.id === expected.id);
      if (scene === undefined) throw new Error('scene');
      const m = mountSimulation({ scenes });
      await m.settle();
      if (expected.order === 'natural') await runNaturalFlow(m, scene, expected.stations);
      else await runFlow(m, scene, expected.stations);

      // Each captured Bearing is on the Target (the wrong post: 12° off), by crosshair and by Mark.
      const captures = capturesOf(m);
      expect(captures.map((c) => c.stationId)).toEqual(expected.stations);
      const errors: string[] = [];
      for (const c of captures) {
        const wrong = expected.id === 'four-posts-one-wrong' && c.stationId === 'southwest';
        const difference = wrapPi(c.azimuthRad - truthAzimuthRad(scene, c.stationId));
        if (!difference.ok) throw new Error('wrapPi');
        const errorRad = Math.abs(difference.value - (wrong ? rad(12) : 0));
        errors.push(`${c.stationId}${c.marked ? ' (mark)' : ''} ${errorRad.toExponential(2)}`);
        expect(errorRad).toBeLessThanOrEqual(1e-8);
      }
      // The report of the checkpoint: each Bearing's azimuth error against the Target, in rad.
      console.log(`azimuth errors, ${expected.id}: ${errors.join(', ')}`);
      expect(captures.some((c) => c.marked)).toBe(true);
      expect(captures.some((c) => !c.marked)).toBe(true);

      // The Smoke screen: the Fix's words and the advice.
      const smoke = m.text('smoke-screen');
      for (const piece of expected.smoke) expect(smoke, piece).toContain(piece);

      // The Sightings tab: each sighting used or set aside with the Message of its cause.
      await m.tab('Sightings');
      const rows = m.getAllByTestId('sighting-row');
      expect(rows).toHaveLength(expected.stations.length);
      expect(rows.filter((r) => r.dataset.used === 'true')).toHaveLength(expected.used);
      const setAside = rows.filter((r) => r.dataset.used === 'false');
      expect(setAside).toHaveLength(expected.setAside);
      if (expected.id === 'four-posts-one-wrong') {
        // The post that is 12° off is the fourth, the phone in hand: its own sighting.
        expect(setAside[0]?.textContent).toContain('this phone');
        expect(setAside[0]?.textContent).toContain(`Set aside: ${outlierMessage()}`);
      }

      // The Emergency tab: the text of §7.12 with the SIMULATION line.
      await m.tab('Emergency');
      const emergency = m.text('emergency-screen');
      for (const piece of expected.emergency) expect(emergency, piece).toContain(piece);
      expect(emergency.indexOf(SIM_LINE)).toBeGreaterThan(-1);

      // The map: observers, Wedges, lines, the Fix and its ellipse, the set-aside layers.
      const map = await loadMap(m);
      expect(featuresOf(map, 'observers')).toHaveLength(expected.used);
      expect(featuresOf(map, 'wedges')).toHaveLength(expected.used);
      expect(featuresOf(map, 'bearings')).toHaveLength(expected.used);
      expect(
        featuresOf(map, 'fix')
          .map((f) => f.properties.kind)
          .sort(),
      ).toEqual(['fix', 'fix-ellipse-95']);
      expect(featuresOf(map, 'app-set-aside')).toHaveLength(expected.setAside);
      expect(featuresOf(map, 'app-set-aside-observers')).toHaveLength(expected.setAside);

      // Nothing went to the network, and nothing failed.
      expect(m.gate.calls).toEqual([]);
      expect(m.alerts()).toEqual([]);
    });
  }

  it('three-posts: after the second capture the advice points east and west, after the third the geometry is good', async () => {
    const scenes = noiseFree(scenesOfTheApp());
    const scene = scenes.find((s) => s.scene.id === 'three-posts');
    if (scene === undefined) throw new Error('scene');
    const m = mountSimulation({ scenes });
    await m.settle();
    const { advice } = await runFlow(m, scene, ['west', 'east', 'side']);
    expect(advice[0]).toContain('from the east or the west of the smoke, about 3.1 km from it');
    expect(advice[1]).toContain('The geometry is good');
  });

  it('two-posts: the advice points east and west, about 3.1 km', async () => {
    const scenes = noiseFree(scenesOfTheApp());
    const scene = scenes.find((s) => s.scene.id === 'two-posts');
    if (scene === undefined) throw new Error('scene');
    const m = mountSimulation({ scenes });
    await m.settle();
    const { advice } = await runFlow(m, scene, ['west', 'east']);
    expect(advice[0]).toContain('from the east or the west of the smoke, about 3.1 km from it');
  });

  it('the same 12° on side is not set aside: the limit that Req 5.4 states', async () => {
    const scenes = noiseFree(scenesOfTheApp()).map((c) =>
      c.scene.id !== 'four-posts-one-wrong'
        ? c
        : {
            ...c,
            scripts: Object.fromEntries(
              Object.entries(c.scripts).map(([id, s]) => [
                id,
                {
                  ...s,
                  frame: {
                    kind: 'absolute' as const,
                    northErrorRad: id === 'side' ? rad(12) : 0,
                    resets: [],
                  },
                },
              ]),
            ),
          },
    );
    const scene = scenes.find((s) => s.scene.id === 'four-posts-one-wrong');
    if (scene === undefined) throw new Error('scene');
    const m = mountSimulation({ scenes });
    await m.settle();
    await runFlow(m, scene, ['west', 'east', 'side', 'southwest']);
    await m.tab('Sightings');
    const rows = m.getAllByTestId('sighting-row');
    expect(rows.filter((r) => r.dataset.used === 'false')).toHaveLength(0);
  });
});

/** Whether `p` lies inside the closed ring (even-odd rule), both in metres on one plane. */
function insideRing(
  p: { eastM: number; northM: number },
  ring: readonly { eastM: number; northM: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a === undefined || b === undefined) continue;
    if (a.northM > p.northM !== b.northM > p.northM) {
      const x = ((b.eastM - a.eastM) * (p.northM - a.northM)) / (b.northM - a.northM) + a.eastM;
      if (p.eastM < x) inside = !inside;
    }
  }
  return inside;
}

describe('the natural order: each post sights first, then a code is sent (Req 4.8, 4.9)', () => {
  for (const [id, stations] of [
    ['two-posts', ['west', 'east']],
    ['three-posts', ['west', 'east', 'side']],
  ] as const) {
    it(`${id}: one code and the answer "the same smoke" give the Fix, and both ways give both phones the same Fix and the same smoke`, async () => {
      const scenes = noiseFree(scenesOfTheApp());
      const scene = scenes.find((s) => s.scene.id === id);
      if (scene === undefined) throw new Error('scene');
      const m = mountSimulation({ scenes });
      await m.settle();
      const run = await runNaturalFlow(m, scene, stations);

      // Each phone started a smoke of its own: the ids differ.
      const before = Object.values(run.idsBefore);
      expect(new Set(before).size).toBe(stations.length);
      const smallest = [...before].sort()[0];

      // The first code and one answer: the receiving phone has a position.
      expect(run.afterTheFirst).toContain('Probably here: 30.027° N, 40.000° W');
      expect(run.afterTheFirst).toContain('2 sightings');
      // The other direction: the same Fix and the same smoke on both phones.
      expect(run.onTheFirst).toBe(run.afterTheFirst);
      expect(run.onTheSecond).toBe(run.afterTheFirst);
      expect(run.idOnTheFirst).toBe(run.idOnTheSecond);

      // Every post ends with one smoke, the smallest of the first ids, and one Fix.
      const ends = Object.values(run.final);
      expect(new Set(ends.map((e) => e.incidentId))).toEqual(new Set([smallest]));
      expect(new Set(ends.map((e) => e.fix)).size).toBe(1);
      expect(ends[0]?.fix).toContain(`${stations.length} sightings`);

      // Nothing went to the network, and nothing failed.
      expect(m.gate.calls).toEqual([]);
      expect(m.alerts()).toEqual([]);
    });
  }
});

describe('the scene with the catalogue’s noise (Req 17.7)', () => {
  it('three-posts: the smoke lies inside the 95 % ellipse the map draws', async () => {
    const scenes = scenesOfTheApp();
    const scene = scenes.find((s) => s.scene.id === 'three-posts');
    const target = scene?.scene.targets.find((t) => t.id === 'smoke');
    if (scene === undefined || target === undefined || target.kind !== 'landmark') {
      throw new Error('scene');
    }
    const m = mountSimulation({ scenes });
    await m.settle();
    await runFlow(m, scene, ['west', 'east', 'side']);
    const map = await loadMap(m);
    const fix = featuresOf(map, 'fix') as unknown as {
      geometry: { coordinates: unknown };
      properties: { kind: string };
    }[];
    const point = fix.find((f) => f.properties.kind === 'fix');
    const ellipse = fix.find((f) => f.properties.kind === 'fix-ellipse-95');
    const [lonDeg, latDeg] = point?.geometry.coordinates as [number, number];
    const centre: Position = { latRad: rad(latDeg), lonRad: rad(lonDeg) };
    const local = (p: Position) => {
      const r = projectToLocalPlane(centre, p);
      if (!r.ok) throw new Error('project');
      return r.value;
    };
    const ring = (ellipse?.geometry.coordinates as [number, number][][])[0]?.map(([lo, la]) =>
      local({ latRad: rad(la), lonRad: rad(lo) }),
    );
    expect(ring?.length).toBe(73);
    expect(insideRing(local(target.position), ring ?? [])).toBe(true);
    expect(m.gate.calls).toEqual([]);
  });
});

describe('while the browser reports offline (Req 17.6, 10.7)', () => {
  it('the capture, the Fix, the words and the Emergency text work, and the gate is never called', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      expect(navigator.onLine).toBe(false);
      const scenes = noiseFree(scenesOfTheApp());
      const scene = scenes.find((s) => s.scene.id === 'two-posts');
      if (scene === undefined) throw new Error('scene');
      const m = mountSimulation({ scenes });
      await m.settle();
      await runFlow(m, scene, ['west', 'east']);
      expect(m.text('smoke-screen')).toContain('Probably here: 30.027° N, 40.000° W');
      await m.tab('Emergency');
      expect(m.text('emergency-screen')).toContain(SIM_LINE);
      expect(m.gate.calls).toEqual([]);
    } finally {
      Reflect.deleteProperty(navigator, 'onLine');
    }
  });

  it('a phone’s Share sheet shows the QR and says that the other phone needs a connection', async () => {
    // Simulation mode has no QR (Req 17.4); on a phone the QR is shown, and said not to work
    // without a connection on the other phone.
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      const incident = postsIncident(['west', 'east']);
      const entry = incident.entries[0];
      if (entry === undefined) throw new Error('entry');
      const s = renderScreen(
        <ShareSheet
          sightingId={entry.sighting.sightingId}
          onClose={() => undefined}
          onPrivacy={() => undefined}
        />,
        { href: 'https://app.example.test/', storedItems: storedWith([incident]) },
      );
      // Task 23.7: the QR is a view of its own, with the one line beside it (Req 10.6, 10.7).
      await s.settle(() =>
        fireEvent.click(s.getByRole('button', { name: 'Show QR code (someone beside you)' })),
      );
      const qr = within(s.getByTestId('qr-view'));
      expect(qr.getByTestId('qr-link')).toBeTruthy();
      expect(s.getByTestId('qr-view').querySelector('svg')).not.toBeNull();
      expect(s.getByTestId('qr-view').querySelector('img')).toBeNull();
      expect(s.getByTestId('qr-view').textContent).toContain(QR_ONE_LINE_TEXT);
    } finally {
      Reflect.deleteProperty(navigator, 'onLine');
    }
  });
});

describe('with the Overlays module as this project has it (Req 1.10)', () => {
  it('runs the flow: with the Overlays cut there is no panel; with them registered the Wind switch is off and nothing is asked', async () => {
    if (inject('overlaysCut')) expect(OVERLAYS).toBe(CUT);
    const scenes = noiseFree(scenesOfTheApp());
    const scene = scenes.find((s) => s.scene.id === 'two-posts');
    if (scene === undefined) throw new Error('scene');
    const m = mountSimulation({ scenes });
    await m.settle();
    await runFlow(m, scene, ['west', 'east']);
    await loadMap(m);
    if (inject('overlaysCut')) {
      expect(m.queryByTestId('overlay-panel')).toBeNull();
    } else {
      const panel = within(m.getByTestId('overlay-panel'));
      expect(panel.getByRole('switch', { name: 'Wind' }).getAttribute('aria-checked')).toBe(
        'false',
      );
      expect(m.map().data.get('app-wind')).toBeUndefined();
    }
    expect(m.gate.calls).toEqual([]);
  });
});

/** `[lonDeg, latDeg]` pairs of every feature of a source of the fake map. */
function coordinatesOf(m: Harness, sourceId: string): Position[] {
  const data = m.map().data.get(sourceId) as
    { features?: { geometry: { coordinates: unknown } }[] } | undefined;
  const out: Position[] = [];
  for (const f of data?.features ?? []) {
    const c = f.geometry.coordinates as unknown[];
    const list = (Array.isArray(c[0]) ? c : [c]) as [number, number][];
    for (const [lonDeg, latDeg] of list) out.push({ latRad: rad(latDeg), lonRad: rad(lonDeg) });
  }
  return out;
}

const distanceM = (a: Position, b: Position): number => {
  const d = greatCircleDistanceM(a, b);
  if (!d.ok) throw new Error('distance');
  return d.value;
};

// The wind Overlay in the reviewer's path (task 17.5, Req 13, 17.4, the lead's decision of
// 2026-11-22): the fixture is read, no network is touched, the arrow stands beside the ellipse and
// the map is fitted as it was. It runs only where the Overlays are registered.
describe.skipIf(inject('overlaysCut'))('the wind Overlay in the Simulation flow', () => {
  async function twoPostsWithWind() {
    const scenes = noiseFree(scenesOfTheApp());
    const scene = scenes.find((s) => s.scene.id === 'two-posts');
    if (scene === undefined) throw new Error('scene');
    const m = mountSimulation({ scenes });
    await m.settle();
    await runFlow(m, scene, ['west', 'east']);
    await loadMap(m);
    return m;
  }
  const windSwitch = (m: Harness) =>
    within(m.getByTestId('overlay-panel')).getByRole('switch', { name: 'Wind' });

  it('switched on, reads the fixture and draws the arrow outside the 95 % ellipse, with the gate never called', async () => {
    const m = await twoPostsWithWind();
    const fixFeatures = featuresOf(m.map(), 'fix') as unknown as {
      geometry: { coordinates: unknown };
      properties: { kind: string };
    }[];
    const point = fixFeatures.find((f) => f.properties.kind === 'fix');
    const [fixLon, fixLat] = point?.geometry.coordinates as [number, number];
    const fix: Position = { latRad: rad(fixLat), lonRad: rad(fixLon) };
    const ring = coordinatesOfFeature(
      fixFeatures.find((f) => f.properties.kind === 'fix-ellipse-95'),
    );
    const ellipseRadiusM = Math.max(...ring.map((v) => distanceM(fix, v)));
    expect(ellipseRadiusM).toBeGreaterThan(500);

    await m.settle(() => fireEvent.click(windSwitch(m)));
    expect(windSwitch(m).getAttribute('aria-checked')).toBe('true');

    const shaft = coordinatesOf(m, 'app-wind');
    const head = coordinatesOf(m, 'app-wind-head');
    expect(shaft).toHaveLength(2);
    expect(head).toHaveLength(3);
    for (const v of [...shaft, ...head]) {
      expect(distanceM(fix, v), 'the arrow is outside the ellipse').toBeGreaterThan(ellipseRadiusM);
    }
    // 15 % of the map's lines (lines of 3 953 m or so), and not more than a line.
    const lengthM = distanceM(shaft[0] as Position, shaft[1] as Position);
    expect(lengthM).toBeGreaterThan(500);
    expect(lengthM).toBeLessThan(700);
    // The Fix and its ellipse are still the map's own, untouched.
    expect(featuresOf(m.map(), 'fix').length).toBe(fixFeatures.length);

    const panel = m.getByTestId('overlay-panel').textContent ?? '';
    expect(panel).toContain('Wind from the south-west (225°) at 4.2 m/s, valid 14:13 UTC');
    expect(panel).toContain('CC BY 4.0');
    expect(m.getByTestId('map-legend').textContent).toContain('Wind arrow');
    expect(m.gate.calls).toEqual([]);
    expect(m.alerts()).toEqual([]);
  });

  it('does not change what the map is fitted to', async () => {
    const m = await twoPostsWithWind();
    // UI's MapView fits again whenever its layers change (it did when the set-aside layers
    // came), so a switch makes one more call; what matters is that every call has the bounds of
    // the observers and the ellipse alone.
    const first = JSON.stringify(m.map().fitBoundsCalls.at(-1));
    expect(m.map().fitBoundsCalls.length).toBeGreaterThan(0);
    await m.settle(() => fireEvent.click(windSwitch(m)));
    expect(m.map().data.get('app-wind')).toBeDefined();
    await m.settle(() =>
      fireEvent.click(
        within(m.getByTestId('overlay-panel')).getByRole('button', { name: 'Refresh Wind' }),
      ),
    );
    for (const call of m.map().fitBoundsCalls) expect(JSON.stringify(call)).toBe(first);
  });

  it('switched off, takes the arrow away, and the sighting guidance says that smoke drifts downwind only while it is shown', async () => {
    const m = await twoPostsWithWind();
    const leans = 'The smoke leans downwind, so aim lower down the column, at its base.';
    await m.tab('Smoke');
    await m.openSight();
    expect(m.getByTestId('guidance').textContent).not.toContain(leans);
    await m.click('Back');
    await m.tab('Map');
    await m.settle(() => fireEvent.click(windSwitch(m)));
    await m.tab('Smoke');
    await m.openSight();
    expect(m.getByTestId('guidance').textContent).toContain(leans);
    await m.click('Back');
    await m.tab('Map');
    await m.settle(() => fireEvent.click(windSwitch(m)));
    expect(windSwitch(m).getAttribute('aria-checked')).toBe('false');
    expect(coordinatesOf(m, 'app-wind')).toEqual([]);
    expect(m.gate.calls).toEqual([]);
  });
});

/** The positions of one feature of the fake map's data. */
function coordinatesOfFeature(
  feature: { geometry: { coordinates: unknown } } | undefined,
): Position[] {
  const c = feature?.geometry.coordinates as [number, number][][] | undefined;
  return (c?.[0] ?? []).map(([lonDeg, latDeg]) => ({ latRad: rad(latDeg), lonRad: rad(lonDeg) }));
}
