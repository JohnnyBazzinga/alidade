// The root of the page: Simulation mode when the browser has no orientation event, and a visible
// control to switch when it has (Req 13.1).

import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../adapters/storage';
import { defaultParameters } from '../math/parameters';
import { sunScenes } from '../math/scenes/sun-scenes';
import { fixedSize } from '../test-support/fixed-size';
import { FakeMapLibre } from '../test-support/fake-maplibre';
import { SENSOR_OPTIONS } from '../test-support/simulation-driver';
import { testEnvironment } from '../test-support/test-environment';
import { initialMode, Root } from './Root';
import { defaultSessionParameters } from '@alidade/ui';

describe('initialMode', () => {
  it('is simulation without the orientation event and device with it', () => {
    expect(initialMode({ hasDeviceOrientation: false })).toBe('simulation');
    expect(initialMode({ hasDeviceOrientation: true })).toBe('device');
  });
});

function mount(hasDeviceOrientation: boolean) {
  const parameters = defaultParameters();
  const scenes = sunScenes(parameters);
  if (!scenes.ok) throw new Error(scenes.reason);
  const t = testEnvironment();
  const lib = new FakeMapLibre();
  const utils = render(
    <Root
      startMode={initialMode({ hasDeviceOrientation })}
      hasDeviceOrientation={hasDeviceOrientation}
      deviceEnvironment={t.environment}
      simulation={{
        scenes: scenes.value,
        base: {
          parameters,
          timer: t.timer,
          storage: createMemoryStorage(),
          loadMap: () => Promise.resolve({ ok: true, value: lib }),
          tiles: null,
          tilesFailure: null,
        },
        sessionParameters: defaultSessionParameters(),
        sensorOptions: SENSOR_OPTIONS,
        observe: fixedSize(390, 844),
      }}
    />,
  );
  return { ...utils, q: within(utils.container) };
}

describe('Root', () => {
  it('starts in Simulation mode, with the banner, when the browser has no orientation event, and offers no switch', () => {
    const m = mount(false);
    expect(m.q.getByTestId('simulation-banner')).toBeTruthy();
    expect(m.q.queryByTestId('mode-control')).toBeNull();
  });

  it('starts on the phone when it has the event, offers the simulation on a visible control, and goes back', () => {
    const m = mount(true);
    expect(m.q.queryByTestId('simulation-banner')).toBeNull();
    fireEvent.click(m.q.getByRole('button', { name: 'Simulator' }));
    expect(m.q.getByTestId('simulation-banner')).toBeTruthy();
    fireEvent.click(m.q.getByRole('button', { name: 'This phone' }));
    expect(m.q.queryByTestId('simulation-banner')).toBeNull();
  });
});
