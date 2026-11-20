// A Sensor source on the Sun script of UI's catalogue, recording what the screens ask of it (test
// support, not exported), with the steps that bring a Session to live, frozen and captured.

import {
  createSimulator,
  type SensorResult,
  type SensorSource,
  type SimulatorControls,
  type SimulatorScript,
} from '@alidade/sensors';
import { buildCatalogue } from '@alidade/ui';

const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

function sunScript(): SimulatorScript {
  const catalogue = buildCatalogue();
  if (!catalogue.ok) throw new Error(catalogue.reason);
  const entry = catalogue.value.find((c) => c.scene.id === 'sun');
  const station = entry?.scene.stations[0];
  const script = station === undefined ? undefined : entry?.scripts[station.id];
  if (script === undefined) throw new Error('no sun script');
  return script;
}

export const SUN_SCRIPT: SimulatorScript = sunScript();

export interface SunSensors {
  readonly createSource: () => SensorResult<SensorSource>;
  readonly calls: { positionCalls: number; permissionCalls: number };
  controls(): SimulatorControls;
}

export function sunSensors(): SunSensors {
  const calls = { positionCalls: 0, permissionCalls: 0 };
  let current: SimulatorControls | null = null;
  return {
    calls,
    controls: () => {
      if (current === null) throw new Error('no source yet');
      return current;
    },
    createSource: () => {
      const sim = createSimulator(SUN_SCRIPT, 1, OPTIONS);
      if (!sim.ok) return sim;
      current = sim.value.controls;
      const real = sim.value.source;
      const source: SensorSource = Object.assign(Object.create(real) as SensorSource, {
        startPosition: () => {
          calls.positionCalls += 1;
          return real.startPosition();
        },
        requestOrientationPermission: () => {
          calls.permissionCalls += 1;
          return real.requestOrientationPermission();
        },
      });
      return { ok: true as const, value: source };
    },
  };
}
