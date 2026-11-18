import { wrapPi } from '@alidade/core';
import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messageFor } from '../math/messages';
import { buildCatalogue, type CatalogueScene } from '../math/scene/catalogue';
import type { Session } from '../math/session/session';
import { fakeObserver } from '../test-support/fake-observe';
import { FakeTimer } from '../test-support/fake-timer';
import { PARAMETERS } from '../test-support/session-fixtures';
import { SimulatorPanel, type SimulatorContext } from './SimulatorPanel';

const built = buildCatalogue();
if (!built.ok) throw new Error(built.reason);
const CATALOGUE: readonly CatalogueScene[] = built.value;
const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

function mount(initialSceneId = 'steady') {
  const timer = new FakeTimer();
  const observer = fakeObserver({ widthPx: 390, heightPx: 844 });
  const seen: { session: Session; context: SimulatorContext }[] = [];
  const onSession = (session: Session, context: SimulatorContext) =>
    seen.push({ session, context });
  const utils = render(
    <SimulatorPanel
      catalogue={CATALOGUE}
      timer={timer}
      parameters={PARAMETERS}
      sensorOptions={OPTIONS}
      tapSigmaPx={1}
      initialSceneId={initialSceneId}
      observe={observer.observe}
      onSession={onSession}
    />,
  );
  const q = within(utils.container);
  const click = async (label: string) => {
    await act(async () => {
      fireEvent.click(q.getByText(label));
    });
  };
  const ticks = async (n: number) => {
    for (let i = 0; i < n; i += 1) {
      await act(async () => {
        timer.advance(100);
      });
    }
  };
  const last = () => seen[seen.length - 1]?.session;
  const state = () => q.getByTestId('sighting-screen').dataset.state;
  const cameraDeg = () => {
    const t = q.getByTestId('truth').querySelector('[data-part="camera"]')?.textContent ?? '';
    const m = /azimuth ([\d.]+)°/.exec(t);
    if (!m) throw new Error(t);
    return Number(m[1]) * (Math.PI / 180);
  };
  const start = async () => {
    await act(async () => {
      fireEvent.click(utils.container.querySelector('[data-control="start"]') as HTMLElement);
    });
  };
  const toLive = async () => {
    await start();
    await click('Play');
    await ticks(20);
    await click('Pause');
  };
  return {
    ...utils,
    ...q,
    timer,
    seen,
    click,
    ticks,
    last,
    state,
    cameraDeg,
    start,
    toLive,
    observer,
  };
}

describe('SimulatorPanel (Req 17.4 to 17.7, 17.10, 17.11)', () => {
  it('offers the eleven scenes and the Stations of the chosen one', () => {
    const { getByLabelText } = mount();
    const scenes = [...getByLabelText('Scene').querySelectorAll('option')].map(
      (o) => o.textContent,
    );
    expect(scenes).toHaveLength(11);
    const stations = [...getByLabelText('Station').querySelectorAll('option')].map(
      (o) => o.textContent,
    );
    expect(stations).toEqual(['West post', 'East post']);
  });

  it('plays: each tick advances the Simulator and the Session reaches live', async () => {
    const m = mount();
    await m.start();
    expect(m.state()).toBe('starting');
    await m.click('Play');
    await m.ticks(20);
    expect(m.state()).toBe('live');
    expect(m.last()?.history.samples.length).toBeGreaterThan(10);
  });

  it('has no running Timer of its own when paused or stopped, and one while playing', async () => {
    const m = mount();
    await m.start();
    const driverTimers = m.timer.running();
    await m.click('Play');
    expect(m.timer.running()).toBe(driverTimers + 1);
    await m.click('Pause');
    expect(m.timer.running()).toBe(driverTimers);
    m.unmount();
    expect(m.timer.running()).toBe(0);
  });

  it('a tick while paused adds nothing; a step advances by one tick times the speed', async () => {
    const m = mount();
    await m.start();
    await m.ticks(5);
    expect(m.last()?.history.samples.length).toBe(0);
    await m.click('Step');
    const one = m.last()?.history.samples.length ?? 0;
    expect(one).toBe(3); // the samples at 0, 50 and 100 ms of the scripted 50 ms interval
    fireEvent.change(m.getByLabelText('Speed'), { target: { value: '4' } });
    await m.click('Step');
    expect((m.last()?.history.samples.length ?? 0) - one).toBe(8); // 400 ms
  });

  it('disables Pause and Step in the state that makes them meaningless', async () => {
    const m = mount();
    expect((m.getByText('Pause') as HTMLButtonElement).disabled).toBe(true);
    await m.click('Play');
    expect((m.getByText('Play') as HTMLButtonElement).disabled).toBe(true);
    expect((m.getByText('Step') as HTMLButtonElement).disabled).toBe(true);
  });

  it('validates the seed: text that is not a non-negative integer is shown through invalid_number', async () => {
    const m = mount();
    for (const bad of ['abc', '-1', '1.5', '', '4294967296']) {
      fireEvent.change(m.getByLabelText('Seed'), { target: { value: bad } });
      const alert = m.getByRole('alert').textContent;
      const msg = messageFor({ ok: false, reason: 'invalid_number' });
      expect(alert).toBe(msg.whatHappened + msg.whatToDo);
    }
    fireEvent.change(m.getByLabelText('Seed'), { target: { value: '7' } });
    expect(m.queryByRole('alert')).toBeNull();
  });

  it('a change of scene, Station, seed or a restart makes a new Session and stops the old one', async () => {
    const m = mount();
    await m.toLive();
    expect(m.state()).toBe('live');
    const timersWhileLive = m.timer.running();
    expect(timersWhileLive).toBe(1);
    fireEvent.change(m.getByLabelText('Station'), { target: { value: 'east' } });
    expect(m.state()).toBe('permission');
    expect(m.timer.running()).toBe(0); // the old driver's Timer was stopped
    expect(m.seen[m.seen.length - 1]?.context.station.id).toBe('east');
    await m.start();
    await m.click('Play');
    await m.ticks(20);
    expect(m.state()).toBe('live');
    await m.click('Restart');
    expect(m.state()).toBe('permission');
    fireEvent.change(m.getByLabelText('Seed'), { target: { value: '9' } });
    expect(m.state()).toBe('permission');
    fireEvent.change(m.getByLabelText('Scene'), { target: { value: 'sun' } });
    expect(m.seen[m.seen.length - 1]?.context.scene.id).toBe('sun');
    expect(m.seen[m.seen.length - 1]?.context.kind).toBe('altitude');
  });

  it('shows the truth as text: the camera and each Target from the Station', () => {
    const { getByTestId } = mount();
    const truth = getByTestId('truth');
    expect(truth.querySelector('[data-part="camera"]')?.textContent).toMatch(
      /^Camera: azimuth \d+\.\d° true, altitude -?\d+\.\d°$/,
    );
    const targets = [...truth.querySelectorAll('[data-part="target"]')].map((t) => t.textContent);
    expect(targets).toHaveLength(3);
    expect(targets[0]).toMatch(/^Tower: azimuth 14\.9° true, altitude 1\.1°$/);
  });

  it('aims by a drag while the Session is not frozen: the scene follows the pointer', async () => {
    const m = mount();
    await m.toLive();
    const before = m.cameraDeg();
    const surface = m.getByTestId('image-surface');
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 400 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 400 });
    const moved = wrapPi(m.cameraDeg() - before);
    if (!moved.ok) throw new Error('wrap');
    expect(moved.value).toBeLessThan(-0.05); // dragged right: the azimuth decreases
  });

  it('aims by the arrow keys in steps of 1°', async () => {
    const m = mount();
    await m.toLive();
    const before = m.cameraDeg();
    const surface = m.getByTestId('image-surface');
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    const d = wrapPi(m.cameraDeg() - before);
    if (!d.ok) throw new Error('wrap');
    expect(d.value).toBeCloseTo(Math.PI / 180, 2);
    fireEvent.keyDown(surface, { key: 'ArrowLeft' });
    expect(Math.abs(m.cameraDeg() - before)).toBeLessThan(0.002);
  });

  it('does not aim while frozen, and a tap there is a Mark', async () => {
    const m = mount();
    await m.toLive();
    await m.click('Freeze');
    expect(m.state()).toBe('frozen');
    const before = m.cameraDeg();
    const surface = m.getByTestId('image-surface');
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 400 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 200, clientY: 400 });
    expect(m.cameraDeg()).toBe(before);
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 400 });
    expect(m.cameraDeg()).toBe(before);
    expect(m.last()?.frozen?.mark).not.toBeNull();
    expect(m.getByTestId('mark-ring')).toBeTruthy();
  });

  it('keeps the Scene image as it was at the Freeze while the simulation goes on', async () => {
    const m = mount();
    await m.toLive();
    await m.click('Freeze');
    const frame = m.getByTestId('scene-image').innerHTML;
    await m.click('Play');
    await m.ticks(10);
    expect(m.getByTestId('scene-image').innerHTML).toBe(frame);
  });

  it('shows the failure of the chosen scene through its own Message', async () => {
    const m = mount('permission-denied');
    await m.start();
    await m.click('Play');
    await m.ticks(2);
    expect(m.state()).toBe('failed');
    const msg = messageFor({ ok: false, reason: 'permission_denied' });
    expect(m.getByRole('alert').textContent).toBe(msg.whatHappened + msg.whatToDo);
  });
});
