// The offer of the simulator on the Sight screen (Req 17.1; the lead's decision of 2026-11-21).
// Desktop browsers define `DeviceOrientationEvent` and have no sensor, so a reviewer on a laptop
// starts in device mode. When device mode has started and no orientation event has arrived, the
// Sight screen offers "Try the simulator instead" beside the refusal.

import {
  createSimulator,
  type SensorSource,
  type SimulatorControls,
  type SimulatorScript,
} from '@alidade/sensors';
import { buildCatalogue, defaultSessionParameters } from '@alidade/ui';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { FakeCameraSurface, fixedSize } from '../test-support/fake-camera';
import { createFakeEnvironment, recordingSightingSource } from '../test-support/fake-environment';
import { renderScreen } from '../test-support/render-screen';
import type { SightingSource } from './environment';
import { SightScreen } from './SightScreen';
import { createVigiaStore } from './store';

const OFFER = 'Try the simulator instead';
const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

const catalogue = buildCatalogue();
if (!catalogue.ok) throw new Error(catalogue.reason);
const steady = catalogue.value.find((c) => c.scene.id === 'steady');
const station = steady?.scene.stations[0];
const found = station === undefined ? undefined : steady?.scripts[station.id];
if (found === undefined) throw new Error('the steady scene has no script');
const SCRIPT: SimulatorScript = found;

function mount(script: SimulatorScript, withOffer = true) {
  const sensors = { controls: null as SimulatorControls | null };
  const sighting: SightingSource = {
    kind: 'device',
    createSource: () => {
      const sim = createSimulator(script, 1, OPTIONS);
      if (!sim.ok) return sim;
      sensors.controls = sim.value.controls;
      const source: SensorSource = sim.value.source;
      return { ok: true, value: source };
    },
    cameraSurface: new FakeCameraSurface(),
    sessionParameters: defaultSessionParameters(),
    observe: fixedSize(360, 640),
  };
  const fake = createFakeEnvironment({ sighting });
  const offers: string[] = [];
  const screen = renderScreen(
    <SightScreen
      onBack={() => undefined}
      onAdded={() => undefined}
      {...(withOffer ? { onTrySimulator: () => void offers.push('offered') } : {})}
    />,
    {},
    fake,
  );
  const start = () =>
    screen.settle(() => {
      const el = screen.container.querySelector<HTMLElement>('[data-control="start"]');
      if (el === null) throw new Error('no start');
      fireEvent.click(el);
    });
  const advance = async (ms: number) => {
    for (let t = 50; t <= ms; t += 50) {
      await screen.settle(() => {
        sensors.controls?.advanceTo(script.startUtcMs + t);
        fake.timer.advance(50);
      });
    }
  };
  const state = () => screen.getByTestId('sighting-screen').dataset.state;
  return { ...screen, offers, start, advance, state };
}

describe('the offer of the simulator on the Sight screen', () => {
  it('is made when Start finds no motion sensor and no event arrived', async () => {
    const s = mount({ ...SCRIPT, orientation: 'missing' });
    await s.settle();
    await s.start();
    await s.advance(3500);
    expect(s.state()).toBe('failed');
    expect(s.getByRole('button', { name: OFFER })).toBeTruthy();
  });

  it('is made when the user refuses the motion permission', async () => {
    const s = mount({ ...SCRIPT, orientationPermission: 'denied' });
    await s.settle();
    await s.start();
    await s.advance(500);
    expect(s.state()).toBe('failed');
    expect(s.getByRole('button', { name: OFFER })).toBeTruthy();
  });

  it('calls the handler once when tapped', async () => {
    const s = mount({ ...SCRIPT, orientation: 'missing' });
    await s.settle();
    await s.start();
    await s.advance(3500);
    await s.settle(() => fireEvent.click(s.getByRole('button', { name: OFFER })));
    expect(s.offers).toEqual(['offered']);
  });

  it('is not made before Start', async () => {
    const s = mount({ ...SCRIPT, orientation: 'missing' });
    await s.settle();
    expect(s.state()).toBe('permission');
    expect(s.queryByRole('button', { name: OFFER })).toBeNull();
  });

  it('is not made while the phone’s events arrive', async () => {
    const s = mount(SCRIPT);
    await s.settle();
    await s.start();
    await s.advance(1500);
    expect(s.state()).toBe('live');
    expect(s.queryByRole('button', { name: OFFER })).toBeNull();
  });

  it('is not made when the screen has no way to change the mode', async () => {
    const s = mount({ ...SCRIPT, orientation: 'missing' }, false);
    await s.settle();
    await s.start();
    await s.advance(3500);
    expect(s.state()).toBe('failed');
    expect(s.queryByRole('button', { name: OFFER })).toBeNull();
  });

  it('is not made in Simulation mode', async () => {
    const fake = createFakeEnvironment({
      mode: 'simulation',
      sighting: recordingSightingSource([]),
    });
    const s = renderScreen(
      <SightScreen
        onBack={() => undefined}
        onAdded={() => undefined}
        onTrySimulator={() => undefined}
      />,
      {},
      fake,
    );
    await s.settle();
    expect(s.queryByRole('button', { name: OFFER })).toBeNull();
  });
});

describe('the offer through the App (Req 17.1)', () => {
  it('asks the page for Simulation mode when tapped', async () => {
    const sighting: SightingSource = {
      kind: 'device',
      createSource: () => {
        const sim = createSimulator({ ...SCRIPT, orientation: 'missing' }, 1, OPTIONS);
        if (!sim.ok) return sim;
        return { ok: true, value: sim.value.source };
      },
      cameraSurface: new FakeCameraSurface(),
      sessionParameters: defaultSessionParameters(),
      observe: fixedSize(360, 640),
    };
    const fake = createFakeEnvironment({ sighting });
    const store = createVigiaStore(fake.environment);
    store.start();
    const modes: string[] = [];
    const utils = render(
      <App
        environment={fake.environment}
        store={store}
        hasDeviceOrientation
        onModeChange={(mode) => void modes.push(mode)}
      />,
    );
    const settle = async (fn: () => void = () => undefined) => {
      await act(async () => {
        fn();
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
      });
    };
    await settle(() => fireEvent.click(utils.getByRole('button', { name: 'Sight the smoke' })));
    await settle(() => {
      const el = utils.container.querySelector<HTMLElement>('[data-control="start"]');
      if (el === null) throw new Error('no start');
      fireEvent.click(el);
    });
    for (let i = 0; i < 70; i += 1) await settle(() => fake.timer.advance(50));
    await settle(() => fireEvent.click(utils.getByRole('button', { name: OFFER })));
    expect(modes).toEqual(['simulation']);
  });
});
