// The reviewer's hands on the simulation shell (test support, not exported): mount it with fakes
// and press what a reviewer presses. Simulator time moves only through the fake Timer.

import type { SimulatorContext } from '@alidade/ui';
import { defaultSessionParameters, type Session } from '@alidade/ui';
import { act, fireEvent, render, within } from '@testing-library/react';
import { SimulationShell } from '../components/simulation/SimulationShell';
import { createMemoryStorage, type NoniusStorage } from '../adapters/storage';
import { defaultParameters } from '../math/parameters';
import { sunScenes, type NoniusScene } from '../math/scenes/sun-scenes';
import { fixedSize } from './fixed-size';
import { FakeMapLibre } from './fake-maplibre';
import { FakeTimer } from './fake-timer';

export const SENSOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

export function scenesOfTheApp(): readonly NoniusScene[] {
  const built = sunScenes(defaultParameters());
  if (!built.ok) throw new Error(`sunScenes: ${built.reason}`);
  return built.value;
}

/** A copy of the scenes with no noise and both the bias and the Index error at -3.3° (Req 13.6). */
export function noiseFreeCopy(scenes: readonly NoniusScene[]): readonly NoniusScene[] {
  return scenes.map((s) => ({
    ...s,
    orientationNoiseSigmaRad: 0,
    indexError: s.indexError === null ? null : { ...s.indexError, valueRad: s.altitudeBiasRad },
  }));
}

export interface MountOptions {
  readonly scenes?: readonly NoniusScene[];
  readonly storage?: NoniusStorage;
  readonly modes?: string[];
  readonly hasDeviceOrientation?: boolean;
}

export function mountSimulation(options: MountOptions = {}) {
  const parameters = defaultParameters();
  const timer = new FakeTimer();
  const lib = new FakeMapLibre();
  const sessions: { session: Session; context: SimulatorContext }[] = [];
  const utils = render(
    <SimulationShell
      scenes={options.scenes ?? scenesOfTheApp()}
      base={{
        parameters,
        timer,
        storage: options.storage ?? createMemoryStorage(),
        loadMap: () => Promise.resolve({ ok: true, value: lib }),
        tiles: null,
        tilesFailure: null,
      }}
      sessionParameters={{
        ...defaultSessionParameters(),
        altitudeCalibration: { offsetRad: 0, sigmaRad: 0 },
      }}
      sensorOptions={SENSOR_OPTIONS}
      hasDeviceOrientation={options.hasDeviceOrientation ?? false}
      onModeChange={(mode) => void options.modes?.push(mode)}
      observe={fixedSize(390, 844)}
      onSession={(session, context) => void sessions.push({ session, context })}
    />,
  );
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
  const click = (name: string | RegExp) =>
    settle(() => fireEvent.click(q.getByRole('button', { name })));
  const tab = (name: string) => settle(() => fireEvent.click(q.getByRole('tab', { name })));
  const ticks = async (n: number) => {
    for (let i = 0; i < n; i += 1) await settle(() => timer.advance(100));
  };
  const choose = (label: string, value: string) =>
    settle(() => fireEvent.change(q.getByLabelText(label), { target: { value } }));
  const text = (testId: string) => q.getByTestId(testId).textContent ?? '';

  /** From a tab to the Sight screen, live after a little over a second, frozen and captured, and back. */
  const sight = async () => {
    await click('Sight the Sun');
    await press('start');
    await ticks(12);
    await press('freeze');
    await press('capture');
    const state = q.getByTestId('sighting-screen').dataset.state;
    if (state !== 'captured') throw new Error(`not captured: ${state}`);
    await click('Done');
  };
  const nextSightTime = () => click('Next sight time');

  return {
    ...utils,
    q,
    timer,
    lib,
    sessions,
    settle,
    press,
    click,
    tab,
    ticks,
    choose,
    text,
    sight,
    nextSightTime,
  };
}
