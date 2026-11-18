// The integration test of the Playground (Req 18.9, design §9): the simulated DOM, the real
// Simulator source, a fake Timer, a fake camera and a fake map.

import { projectToLocalPlane, wrapPi, type Position } from '@alidade/core';
import { createSimulator, type SimulatorControls } from '@alidade/sensors';
import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  buildCatalogue,
  messageFor,
  targetDirection,
  type CatalogueScene,
  type UiReason,
} from '../src/index';
import { FakeCameraSurface } from '../src/test-support/fake-camera-surface';
import { FakeMapLibre, type FakeMap } from '../src/test-support/fake-maplibre';
import { fakeObserver } from '../src/test-support/fake-observe';
import { FakeTimer } from '../src/test-support/fake-timer';
import { Playground, type PlaygroundDeps } from './Playground';

const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

const built = buildCatalogue();
if (!built.ok) throw new Error(built.reason);
const CATALOGUE: readonly CatalogueScene[] = built.value;

/**
 * The catalogue with the orientation noise set to 0 in every script. The steady scene of the
 * catalogue has 0.05° of noise (design §7.16), so that its sigma is not only the floors; with it
 * no capture can equal the true azimuth to the `1e-8` rad of Req 18.9. Nothing else changes.
 */
const NOISE_FREE: readonly CatalogueScene[] = CATALOGUE.map((c) => ({
  ...c,
  scripts: Object.fromEntries(
    Object.entries(c.scripts).map(([id, s]) => [id, { ...s, orientationNoiseSigmaRad: 0 }]),
  ),
}));

interface Collection {
  readonly features: readonly {
    readonly geometry: { readonly type: string; readonly coordinates: unknown };
    readonly properties: { readonly kind: string; readonly id: string };
  }[];
}

function mount(over: Partial<PlaygroundDeps> = {}) {
  const timer = new FakeTimer();
  const lib = new FakeMapLibre();
  const camera = new FakeCameraSurface();
  const deps: PlaygroundDeps = {
    timer,
    hasDeviceOrientation: false,
    tiles: null,
    loadMapLibre: () => Promise.resolve({ ok: true, value: lib }),
    cameraSurface: camera,
    createDeviceSource: () => ({ ok: false, reason: 'sensor_unavailable' }),
    catalogue: { ok: true, value: NOISE_FREE },
    sensorOptions: OPTIONS,
    observe: fakeObserver({ widthPx: 390, heightPx: 844 }).observe,
    ...over,
  };
  const utils = render(<Playground deps={deps} />);
  const q = within(utils.container);
  const settle = async (fn: () => void = () => undefined) => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  const control = (id: string) => {
    const el = utils.container.querySelector<HTMLElement>(`[data-control="${id}"]`);
    if (el === null) throw new Error(`no control ${id}`);
    return el;
  };
  const press = (id: string) => settle(() => fireEvent.click(control(id)));
  const click = (text: string) => settle(() => fireEvent.click(q.getByText(text)));
  const ticks = async (n: number) => {
    for (let i = 0; i < n; i += 1) await settle(() => timer.advance(100));
  };
  const state = () => q.getByTestId('sighting-screen').dataset.state;
  const applyTapSigma = async (text: string) => {
    fireEvent.change(q.getByLabelText(/Tap 1-sigma/), { target: { value: text } });
    await click('Apply');
  };
  /** Taps the Target's pixel on the frozen Scene image. */
  const markTarget = async (targetId: string) => {
    const g = q
      .getByTestId('scene-image')
      .querySelector<SVGGElement>(`[data-target-id="${targetId}"]`);
    const x = g?.getAttribute('data-x-px');
    const y = g?.getAttribute('data-y-px');
    if (x == null || y == null) throw new Error(`target ${targetId} not visible`);
    const xPx = Number(x);
    const yPx = Number(y);
    const surface = q.getByTestId('image-surface');
    await settle(() => {
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: xPx, clientY: yPx });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: xPx, clientY: yPx });
    });
  };
  /** Start, play two seconds, pause: the Session is live. */
  const toLive = async () => {
    await press('start');
    await click('Play');
    await ticks(20);
    await click('Pause');
  };
  const map = (): FakeMap => lib.last();
  const data = (id: string) => (map().data.get(id) ?? { features: [] }) as Collection;
  const alerts = () => q.queryAllByRole('alert').map((a) => a.textContent);
  return {
    ...utils,
    ...q,
    timer,
    lib,
    camera,
    settle,
    press,
    click,
    ticks,
    state,
    applyTapSigma,
    markTarget,
    toLive,
    map,
    data,
    alerts,
  };
}

const messageText = (reason: UiReason) => {
  const m = messageFor({ ok: false, reason });
  return m.whatHappened + m.whatToDo;
};

/** Whether `p` lies inside the closed ring `ring` of `{ eastM, northM }` (even-odd rule). */
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

const radOf = (deg: number) => (deg * Math.PI) / 180;

/** Runs the whole flow of Req 18.9 on `catalogue`'s steady scene, both Stations. */
async function twoStationFix(catalogue: readonly CatalogueScene[]) {
  const m = mount({ catalogue: { ok: true, value: catalogue } });
  await m.settle();
  await m.settle(() => m.map().fire('load'));
  await m.applyTapSigma('1');
  for (const station of ['west', 'east']) {
    if (station === 'east') {
      await m.settle(() =>
        fireEvent.change(m.getByLabelText('Station'), { target: { value: 'east' } }),
      );
      expect(m.state()).toBe('permission');
    }
    await m.toLive();
    expect(m.state()).toBe('live');
    await m.press('freeze');
    expect(m.state()).toBe('frozen');
    await m.markTarget('tower');
    expect(m.getByTestId('mark-ring')).toBeTruthy();
    await m.press('capture');
    expect(m.state()).toBe('captured');
  }
  return m;
}

const steady = (catalogue: readonly CatalogueScene[]) => {
  const entry = catalogue.find((c) => c.scene.id === 'steady');
  if (entry === undefined) throw new Error('steady');
  return entry;
};

describe('the Playground through the Simulator (Req 18.9)', () => {
  it('starts in simulator mode with no DeviceOrientationEvent, and in device mode with one', () => {
    const sim = mount();
    expect(sim.getByTestId('playground').dataset.mode).toBe('simulator');
    sim.unmount();
    const device = mount({ hasDeviceOrientation: true });
    expect(device.getByTestId('playground').dataset.mode).toBe('device');
  });

  it('two Stations sight the Tower: two observers, two Wedges, one Fix with its ellipse around the Tower', async () => {
    const m = await twoStationFix(NOISE_FREE);
    const entry = steady(NOISE_FREE);
    const tower = entry.scene.targets.find((t) => t.id === 'tower');
    if (tower === undefined || tower.kind !== 'landmark') throw new Error('tower');

    // The captures: each azimuth equals the Tower's true direction from its Station within 1e-8.
    const items = [...m.getByTestId('capture-list').querySelectorAll<HTMLElement>('li')];
    expect(items.map((i) => i.dataset.kind)).toEqual(['bearing', 'bearing']);
    entry.scene.stations.forEach((station, k) => {
      const truth = targetDirection(station, tower);
      if (!truth.ok) throw new Error('truth');
      const d = wrapPi(Number(items[k]?.dataset.azimuthRad) - truth.value.azimuthRad);
      if (!d.ok) throw new Error('wrap');
      expect(Math.abs(d.value)).toBeLessThanOrEqual(1e-8);
      expect(items[k]?.textContent).toMatch(
        new RegExp(`^${station.name}: bearing \\d+\\.\\d° true ±\\d+\\.\\d°$`),
      );
    });

    // What the fake map holds.
    expect(m.data('observers').features.map((f) => f.properties.kind)).toEqual([
      'observer',
      'observer',
    ]);
    expect(m.data('wedges').features.map((f) => f.properties.kind)).toEqual([
      'bearing-wedge',
      'bearing-wedge',
    ]);
    expect(m.data('bearings').features.map((f) => f.properties.kind)).toEqual([
      'bearing-line',
      'bearing-line',
    ]);
    const fix = m.data('fix').features;
    expect(fix.map((f) => f.properties.kind).sort()).toEqual(['fix', 'fix-ellipse-95']);

    // The Tower lies inside the 95 % ellipse the map draws.
    const point = fix.find((f) => f.properties.kind === 'fix');
    const ellipse = fix.find((f) => f.properties.kind === 'fix-ellipse-95');
    const [lonDeg, latDeg] = point?.geometry.coordinates as [number, number];
    const centre: Position = { latRad: radOf(latDeg), lonRad: radOf(lonDeg) };
    const local = (p: Position) => {
      const r = projectToLocalPlane(centre, p);
      if (!r.ok) throw new Error('project');
      return r.value;
    };
    const ring = (ellipse?.geometry.coordinates as [number, number][][])[0]?.map(([lo, la]) =>
      local({ latRad: radOf(la), lonRad: radOf(lo) }),
    );
    expect(ring?.length).toBe(73);
    expect(insideRing(local(tower.position), ring ?? [])).toBe(true);
    expect(m.alerts()).toEqual([]);

    // The Fix in words beside the list (Req 18.4).
    expect(m.getByTestId('fix-summary').textContent).toMatch(
      /^Fix from 2 bearings: \d+\.\d{4}° N, \d+\.\d{4}° W\. 95 % ellipse: semi-axes \d+ m and \d+ m\.$/,
    );
  });

  it('shows the summary of the last capture once, in captured and after Take another (Req 18.4)', async () => {
    const m = mount();
    await m.settle();
    await m.applyTapSigma('1');
    await m.toLive();
    await m.press('freeze');
    await m.press('capture');
    expect(m.state()).toBe('captured');
    expect(m.getAllByTestId('capture-summary')).toHaveLength(1);
    await m.press('again');
    expect(m.state()).toBe('live');
    expect(m.getAllByTestId('capture-summary')).toHaveLength(1);
    // One Bearing: no Fix yet, and nothing said about one.
    expect(m.queryByTestId('fix-summary')).toBeNull();
  });

  it('the same flow on the noisy steady scene of the catalogue still puts the Tower inside the ellipse', async () => {
    const m = await twoStationFix(CATALOGUE);
    const fix = m.data('fix').features;
    expect(fix.map((f) => f.properties.kind).sort()).toEqual(['fix', 'fix-ellipse-95']);
    const tower = steady(CATALOGUE).scene.targets.find((t) => t.id === 'tower');
    if (tower === undefined || tower.kind !== 'landmark') throw new Error('tower');
    const point = fix.find((f) => f.properties.kind === 'fix');
    const [lonDeg, latDeg] = point?.geometry.coordinates as [number, number];
    const centre: Position = { latRad: radOf(latDeg), lonRad: radOf(lonDeg) };
    const local = (p: Position) => {
      const r = projectToLocalPlane(centre, p);
      if (!r.ok) throw new Error('project');
      return r.value;
    };
    const ring = (
      fix.find((f) => f.properties.kind === 'fix-ellipse-95')?.geometry.coordinates as [
        number,
        number,
      ][][]
    )[0]?.map(([lo, la]) => local({ latRad: radOf(la), lonRad: radOf(lo) }));
    expect(insideRing(local(tower.position), ring ?? [])).toBe(true);
  });

  it('with one capture the map has its observer and Wedge and no Fix', async () => {
    const m = mount();
    await m.settle();
    await m.settle(() => m.map().fire('load'));
    await m.applyTapSigma('1');
    await m.toLive();
    await m.press('freeze');
    await m.press('capture');
    expect(m.data('observers').features).toHaveLength(1);
    expect(m.data('wedges').features).toHaveLength(1);
    expect(m.data('fix').features).toHaveLength(0);
  });

  it('the permission-denied scene shows its Message', async () => {
    const m = mount();
    await m.settle();
    await m.settle(() =>
      fireEvent.change(m.getByLabelText('Scene'), { target: { value: 'permission-denied' } }),
    );
    await m.press('start');
    await m.click('Play');
    await m.ticks(3);
    expect(m.state()).toBe('failed');
    expect(m.alerts()).toEqual([messageText('permission_denied')]);
    expect(m.container.querySelector('[data-control="restart"]')?.textContent).toBe('Start again');
  });

  it('a Mark before the tap 1-sigma is applied shows the Message of calibration_missing', async () => {
    const m = mount();
    await m.settle();
    await m.toLive();
    await m.press('freeze');
    await m.markTarget('tower');
    expect(m.alerts()).toEqual([messageText('calibration_missing')]);
    expect(m.queryByTestId('mark-ring')).toBeNull();
    // The crosshair works without it (Req 18.3).
    await m.press('capture');
    expect(m.state()).toBe('captured');
  });
});

describe('the Playground in device mode (Req 18.2, 18.3)', () => {
  function deviceSetup() {
    const entry = steady(NOISE_FREE);
    const station = entry.scene.stations[0];
    const script = station === undefined ? undefined : entry.scripts[station.id];
    if (script === undefined) throw new Error('script');
    let controls: SimulatorControls | null = null;
    const m = mount({
      hasDeviceOrientation: true,
      createDeviceSource: () => {
        const sim = createSimulator(script, 1, OPTIONS);
        if (!sim.ok) return sim;
        controls = sim.value.controls;
        return { ok: true, value: sim.value.source };
      },
    });
    const advance = async (ms: number) => {
      for (let t = 50; t <= ms; t += 50) {
        await m.settle(() => {
          controls?.advanceTo(script.startUtcMs + t);
          m.timer.advance(50);
        });
      }
    };
    return { m, advance };
  }

  it('Start asks for motion and starts the rear camera from the one tap', async () => {
    const { m } = deviceSetup();
    await m.settle();
    await m.press('start');
    expect(m.camera.calls).toEqual([
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
    ]);
    expect(m.state()).toBe('starting');
    expect(m.getByTestId('camera-video')).toBeTruthy();
  });

  it('a Mark without a calibration shows calibration_missing, and the crosshair still captures', async () => {
    const { m, advance } = deviceSetup();
    await m.settle();
    await m.press('start');
    await advance(1500);
    expect(m.state()).toBe('live');
    await m.press('freeze');
    const surface = m.getByTestId('image-surface');
    await m.settle(() => {
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 50, clientY: 50 });
    });
    expect(m.alerts()).toEqual([messageText('calibration_missing')]);
    await m.press('capture');
    expect(m.state()).toBe('captured');
  });

  it('a refused camera fails the Session with the camera Message', async () => {
    const { m } = deviceSetup();
    const err = new Error('denied');
    err.name = 'NotAllowedError';
    m.camera.behaviour = { kind: 'reject', error: err };
    await m.settle();
    await m.press('start');
    expect(m.state()).toBe('failed');
    expect(m.alerts()).toEqual([messageText('camera_permission_denied')]);
  });

  it('applies a calibration whose image size is the running stream`s', async () => {
    const { m } = deviceSetup();
    await m.settle();
    await m.press('start');
    fireEvent.change(m.getByLabelText(/Field of view/), { target: { value: '70' } });
    fireEvent.change(m.getByLabelText(/Its 1-sigma, degrees/), { target: { value: '1' } });
    await m.applyTapSigma('1');
    expect(m.getByTestId('calibration-state').textContent).toBe('Applied.');
  });

  it('refuses to apply a calibration before the camera runs', async () => {
    const { m } = deviceSetup();
    await m.settle();
    fireEvent.change(m.getByLabelText(/Field of view/), { target: { value: '70' } });
    fireEvent.change(m.getByLabelText(/Its 1-sigma, degrees/), { target: { value: '1' } });
    await m.applyTapSigma('1');
    expect(m.alerts()).toEqual([messageText('calibration_missing')]);
  });
});
