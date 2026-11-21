// The device-mode Sight screen on the Simulator as its Sensor source and a fake camera (test
// support, not exported): what `SightScreen.test.tsx` and `sight-first-screen.test.tsx` mount.

import {
  createSimulator,
  type SensorSource,
  type SimulatorControls,
  type SimulatorScript,
} from '@alidade/sensors';
import { buildCatalogue, defaultSessionParameters } from '@alidade/ui';
import { fireEvent } from '@testing-library/react';
import type { SightingSource } from '../components/environment';
import { SightScreen } from '../components/SightScreen';
import { FakeCameraSurface, fixedSize } from './fake-camera';
import { createFakeEnvironment, type FakeEnvironmentOptions } from './fake-environment';
import { renderScreen } from './render-screen';

const SIMULATOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

const catalogue = buildCatalogue();
if (!catalogue.ok) throw new Error(catalogue.reason);
const steady = catalogue.value.find((c) => c.scene.id === 'steady');
const firstStation = steady?.scene.stations[0];
const found = firstStation === undefined ? undefined : steady?.scripts[firstStation.id];
if (found === undefined) throw new Error('the steady scene has no script');
export const STEADY_SCRIPT: SimulatorScript = found;

export interface DeviceSightOptions {
  readonly stored?: Record<string, string>;
  readonly extra?: FakeEnvironmentOptions;
  /** A Relative-frame phone with no north set: "Set north from the compass" is the action. */
  readonly relative?: boolean;
  readonly windShown?: boolean;
  readonly onTrySimulator?: () => void;
}

/** The device-mode Sighting source on the Simulator and a fake camera, and what drives it. */
export function deviceSource(relative = false) {
  const script: SimulatorScript = relative
    ? { ...STEADY_SCRIPT, frame: { kind: 'relative', zeroRad: 2, resets: [] } }
    : STEADY_SCRIPT;
  const sensors = { controls: null as SimulatorControls | null };
  const camera = new FakeCameraSurface();
  const sighting: SightingSource = {
    kind: 'device',
    createSource: () => {
      const sim = createSimulator(script, 1, SIMULATOR_OPTIONS);
      if (!sim.ok) return sim;
      sensors.controls = sim.value.controls;
      const source: SensorSource = sim.value.source;
      return { ok: true, value: source };
    },
    cameraSurface: camera,
    sessionParameters: defaultSessionParameters(),
    observe: fixedSize(360, 640),
  };
  return { script, sensors, camera, sighting };
}

export function mountDeviceSight(options: DeviceSightOptions = {}) {
  const { script, sensors, camera, sighting } = deviceSource(options.relative === true);
  const fake = createFakeEnvironment({
    ...options.extra,
    sighting,
    storedItems: options.stored ?? {},
  });
  const calls: string[] = [];
  const screen = renderScreen(
    <SightScreen
      windShown={options.windShown ?? false}
      onBack={() => void calls.push('back')}
      onAdded={(id) => void calls.push(`added:${id}`)}
      {...(options.onTrySimulator === undefined ? {} : { onTrySimulator: options.onTrySimulator })}
    />,
    {},
    fake,
  );
  const press = (id: string) =>
    screen.settle(() => {
      const el = screen.container.querySelector<HTMLElement>(`[data-control="${id}"]`);
      if (el === null) throw new Error(`no control ${id}`);
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
  const toLive = async () => {
    await screen.settle();
    await press('start');
    await advance(1500);
  };
  const captureOnCrosshair = async () => {
    await toLive();
    await press('freeze');
    await press('capture');
  };
  const entries = () => screen.store.getSnapshot().open?.incident.entries.length ?? 0;
  return { ...screen, camera, calls, press, advance, toLive, captureOnCrosshair, entries };
}
