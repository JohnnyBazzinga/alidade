// The root of the page (Req 17.1, design §10; the lead's decision of 2026-11-21): the mode the page
// is in, and the control that changes it. In device mode the App runs over the phone's own
// environment and store, started when the page enters that mode and stopped when it leaves it; in
// Simulation mode the Simulation shell makes its own phones. `main.tsx` builds the environment from
// the browser's objects and decides the mode the page starts in.

import { useEffect, useState } from 'react';
import { App } from '../App';
import type { VigiaEnvironment, VigiaMode } from './environment';
import { SimulationShell, type SimulationShellProps } from './simulation/SimulationShell';
import { createVigiaStore } from './store';

export interface RootProps {
  readonly startMode: VigiaMode;
  /** From Sensors' `browserEnvironment()`: the mode control is shown only then (Req 17.1). */
  readonly hasDeviceOrientation: boolean;
  /** The environment of the phone itself; its store is made when the page enters device mode. */
  readonly deviceEnvironment: VigiaEnvironment;
  readonly simulation: Omit<SimulationShellProps, 'hasDeviceOrientation' | 'onModeChange'>;
}

function DevicePage(props: {
  readonly environment: VigiaEnvironment;
  readonly hasDeviceOrientation: boolean;
  readonly onModeChange: (mode: VigiaMode) => void;
}) {
  const [store] = useState(() => createVigiaStore(props.environment));
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  return (
    <App
      environment={props.environment}
      store={store}
      hasDeviceOrientation={props.hasDeviceOrientation}
      onModeChange={props.onModeChange}
    />
  );
}

export function Root({
  startMode,
  hasDeviceOrientation,
  deviceEnvironment,
  simulation,
}: RootProps) {
  const [mode, setMode] = useState<VigiaMode>(startMode);
  return mode === 'device' ? (
    <DevicePage
      environment={deviceEnvironment}
      hasDeviceOrientation={hasDeviceOrientation}
      onModeChange={setMode}
    />
  ) : (
    <SimulationShell
      {...simulation}
      hasDeviceOrientation={hasDeviceOrientation}
      onModeChange={setMode}
    />
  );
}
