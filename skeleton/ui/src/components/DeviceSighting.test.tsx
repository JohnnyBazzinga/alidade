// `DeviceSighting` (Req 18.10, G6 of the Vigia design): the phone's Sensor source and the rear
// camera on the sighting screen, started from one tap and stopped on unmount. Tested with the
// fakes of the package: the Simulator as the Sensor source, a fake Timer, a fake camera surface.

import {
  createSimulator,
  type SensorSource,
  type SimulatorControls,
  type SimulatorScript,
} from '@alidade/sensors';
import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultSessionParameters } from '../math/session/parameters';
import { buildCatalogue } from '../math/scene/catalogue';
import type { Session } from '../math/session/session';
import { messageFor } from '../math/messages';
import { FakeCameraSurface } from '../test-support/fake-camera-surface';
import { fakeObserver } from '../test-support/fake-observe';
import { FakeTimer } from '../test-support/fake-timer';
import { DeviceSighting } from './DeviceSighting';

const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };
const PARAMETERS = defaultSessionParameters();

const catalogue = buildCatalogue();
if (!catalogue.ok) throw new Error(catalogue.reason);
const steady = catalogue.value.find((c) => c.scene.id === 'steady');
const station = steady?.scene.stations[0];
const script = station === undefined ? undefined : steady?.scripts[station.id];
if (script === undefined) throw new Error('the steady scene has no script');
const SCRIPT: SimulatorScript = script;

function mount() {
  const timer = new FakeTimer();
  const camera = new FakeCameraSurface();
  const sensors = { controls: null as SimulatorControls | null, permissionCalls: 0, stops: 0 };
  const createSource = () => {
    const sim = createSimulator(SCRIPT, 1, OPTIONS);
    if (!sim.ok) return sim;
    sensors.controls = sim.value.controls;
    const real = sim.value.source;
    // A recording view of the real Simulator source: every other member is the source's own.
    const source: SensorSource = Object.assign(Object.create(real) as SensorSource, {
      requestOrientationPermission: () => {
        sensors.permissionCalls += 1;
        return real.requestOrientationPermission();
      },
      stop: () => {
        sensors.stops += 1;
        real.stop();
      },
    });
    return { ok: true as const, value: source };
  };
  const sessions: Session[] = [];
  const onSession = (session: Session) => void sessions.push(session);
  const utils = render(
    <DeviceSighting
      createSource={createSource}
      cameraSurface={camera}
      timer={timer}
      parameters={PARAMETERS}
      calibration={null}
      tapSigmaPx={Number.NaN}
      cameraRequest={{}}
      onSession={onSession}
      observe={fakeObserver({ widthPx: 390, heightPx: 844 }).observe}
    />,
  );
  const q = within(utils.container);
  const settle = async (fn: () => void = () => undefined) => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  const press = (id: string) =>
    settle(() => {
      const el = utils.container.querySelector<HTMLElement>(`[data-control="${id}"]`);
      if (el === null) throw new Error(`no control ${id}`);
      fireEvent.click(el);
    });
  const advance = async (ms: number) => {
    for (let t = 50; t <= ms; t += 50) {
      await settle(() => {
        sensors.controls?.advanceTo(SCRIPT.startUtcMs + t);
        timer.advance(50);
      });
    }
  };
  const state = () => q.getByTestId('sighting-screen').dataset.state;
  const alerts = () => q.queryAllByRole('alert').map((a) => a.textContent);
  return { ...utils, ...q, camera, sensors, sessions, settle, press, advance, state, alerts };
}

const messageText = (reason: 'calibration_missing') => {
  const m = messageFor({ ok: false, reason });
  return m.whatHappened + m.whatToDo;
};

describe('DeviceSighting (Req 18.10)', () => {
  it('starts the rear camera and asks for motion from the one tap', async () => {
    const m = mount();
    await m.settle();
    expect(m.state()).toBe('permission');
    expect(m.camera.calls).toEqual([]);
    expect(m.sensors.permissionCalls).toBe(0);
    await m.press('start');
    expect(m.sensors.permissionCalls).toBe(1);
    expect(m.camera.calls).toEqual([
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
    ]);
    expect(m.state()).toBe('starting');
    expect(m.getByTestId('camera-video')).toBeTruthy();
    await m.advance(1500);
    expect(m.state()).toBe('live');
  });

  it('shows calibration_missing for a Mark without a calibration, and no mark', async () => {
    const m = mount();
    await m.settle();
    await m.press('start');
    await m.advance(1500);
    await m.press('freeze');
    const surface = m.getByTestId('image-surface');
    await m.settle(() => {
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 50, clientY: 50 });
    });
    expect(m.alerts()).toEqual([messageText('calibration_missing')]);
    expect(m.queryByTestId('mark-ring')).toBeNull();
  });

  it('captures on the crosshair and reports the Session to the caller', async () => {
    const m = mount();
    await m.settle();
    await m.press('start');
    await m.advance(1500);
    await m.press('freeze');
    await m.press('capture');
    expect(m.state()).toBe('captured');
    const last = m.sessions[m.sessions.length - 1];
    expect(last?.state).toBe('captured');
    expect(last?.captured?.kind).toBe('bearing');
  });

  it('stops the camera and the Sensor source when it is unmounted', async () => {
    const m = mount();
    await m.settle();
    await m.press('start');
    await m.advance(500);
    const stream = m.camera.streams[0];
    expect(stream).toBeDefined();
    expect(stream?.tracks.every((t) => t.stopped)).toBe(false);
    const stopsBefore = m.sensors.stops;
    m.unmount();
    expect(stream?.tracks.every((t) => t.stopped)).toBe(true);
    expect(m.sensors.stops).toBeGreaterThan(stopsBefore);
  });

  it('stops a camera that was still starting when it is unmounted', async () => {
    const m = mount();
    m.camera.behaviour = { kind: 'hang' };
    await m.settle();
    await m.press('start');
    m.unmount();
    await m.settle(() => m.camera.release());
    expect(m.camera.streams.every((s) => s.tracks.every((t) => t.stopped))).toBe(true);
  });
});
