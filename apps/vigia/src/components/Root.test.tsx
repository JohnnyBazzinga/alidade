// The root of the page (Req 17.1; the lead's decision of 2026-11-21): the mode the page starts in,
// the switch between the phone's own sensors and the simulator, and the store of the phone, which
// runs only while the page is in device mode.

import { defaultSessionParameters } from '@alidade/ui';
import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { smokeScenes } from '../math/scenes/smoke-scenes';
import { SIMULATION_TEXT } from '../math/texts';
import { createFakeEnvironment } from '../test-support/fake-environment';
import { fixedSize } from '../test-support/fake-camera';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { SENSOR_OPTIONS } from '../test-support/simulation-driver';
import type { VigiaMode } from './environment';
import { Root } from './Root';

const built = smokeScenes();
if (!built.ok) throw new Error(built.reason);
const SCENES = built.value;

function mount(startMode: VigiaMode, hasDeviceOrientation = true) {
  const fake = createFakeEnvironment({ map: new FakeMapLibre() });
  const e = fake.environment;
  const utils = render(
    <Root
      startMode={startMode}
      hasDeviceOrientation={hasDeviceOrientation}
      deviceEnvironment={e}
      simulation={{
        catalogue: SCENES,
        base: {
          parameters: e.parameters,
          timer: e.timer,
          random: e.random,
          clipboard: e.clipboard,
          gate: e.gate,
          qr: e.qr,
          loadMap: e.loadMap,
          tiles: null,
          tilesFailure: null,
        },
        sessionParameters: defaultSessionParameters(),
        sensorOptions: SENSOR_OPTIONS,
        observe: fixedSize(390, 844),
      }}
    />,
  );
  const settle = async (fn: () => void = () => undefined) => {
    await act(async () => {
      fn();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
  };
  return { ...utils, fake, settle };
}

describe('the mode the page starts in', () => {
  it('device mode: the phone’s own Smoke screen, no banner', async () => {
    const r = mount('device');
    await r.settle();
    expect(r.getByTestId('smoke-screen')).toBeTruthy();
    expect(r.queryByText(SIMULATION_TEXT)).toBeNull();
    expect(r.queryByTestId('simulator-stash')).toBeNull();
  });

  it('Simulation mode: the banner and the simulated phones', async () => {
    const r = mount('simulation');
    await r.settle();
    expect(r.getByText(SIMULATION_TEXT)).toBeTruthy();
    expect(r.getByTestId('simulator-stash')).toBeTruthy();
    expect(r.getByTestId('smoke-screen')).toBeTruthy();
  });
});

describe('the switch of mode (Req 17.1)', () => {
  // Mira: the mode control is in the panel that the "Data and mode" tile opens.
  const control = (r: ReturnType<typeof mount>) => {
    const tile = r.getByTestId('data-tile');
    if (tile.getAttribute('aria-expanded') !== 'true') fireEvent.click(tile);
    return within(r.getByTestId('mode-control'));
  };

  it('goes from the phone to the simulator and back, by the control on the Smoke screen', async () => {
    const r = mount('device');
    await r.settle();
    const to1 = control(r).getByRole('button', { name: 'Simulator' });
    await r.settle(() => fireEvent.click(to1));
    expect(r.getByText(SIMULATION_TEXT)).toBeTruthy();
    expect(control(r).getByRole('button', { name: 'Simulator' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    const to2 = control(r).getByRole('button', { name: 'This phone' });
    await r.settle(() => fireEvent.click(to2));
    expect(r.queryByText(SIMULATION_TEXT)).toBeNull();
    expect(r.getByTestId('smoke-screen')).toBeTruthy();
  });

  it('has no control without DeviceOrientationEvent', async () => {
    const r = mount('simulation', false);
    await r.settle();
    expect(r.queryByTestId('mode-control')).toBeNull();
  });
});

describe('the store of the phone', () => {
  it('runs one timer in device mode, and only the two simulated phones’ after the switch', async () => {
    const r = mount('device');
    await r.settle();
    expect(r.fake.timer.running()).toBe(1);
    fireEvent.click(r.getByTestId('data-tile'));
    await r.settle(() =>
      fireEvent.click(
        within(r.getByTestId('mode-control')).getByRole('button', { name: 'Simulator' }),
      ),
    );
    // The first scene has two Stations: two phones, each with its expiry tick; the phone's is gone.
    expect(r.fake.timer.running()).toBe(2);
    r.unmount();
    expect(r.fake.timer.running()).toBe(0);
  });
});
