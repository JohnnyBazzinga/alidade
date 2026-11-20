// The root of the page (design §9, §10; Req 13.1): the phone's own App, or the Simulation shell.
// The page starts in Simulation mode when the browser has no orientation event, and offers the
// simulation on a visible control when it has.

import { useState } from 'react';
import { App } from '../App';
import type { NoniusEnvironment, NoniusMode } from './environment';
import { ModeControl } from './ModeControl';
import { SimulationShell, type SimulationShellProps } from './simulation/SimulationShell';
import { createNoniusStore } from './store';

export interface RootProps {
  readonly startMode: NoniusMode;
  /** From Sensors' `browserEnvironment()`: the mode control is shown only then (Req 13.1). */
  readonly hasDeviceOrientation: boolean;
  /** The environment of the phone itself; its store is made when the page enters device mode. */
  readonly deviceEnvironment: NoniusEnvironment;
  readonly simulation: Omit<SimulationShellProps, 'hasDeviceOrientation' | 'onModeChange'>;
}

/** Simulation mode without the browser's orientation event (a feature test made by the caller). */
export function initialMode(input: { readonly hasDeviceOrientation: boolean }): NoniusMode {
  return input.hasDeviceOrientation ? 'device' : 'simulation';
}

function DevicePage(props: {
  readonly environment: NoniusEnvironment;
  readonly hasDeviceOrientation: boolean;
  readonly onModeChange: (mode: NoniusMode) => void;
}) {
  const [store] = useState(() => createNoniusStore(props.environment));
  return (
    <App
      environment={props.environment}
      store={store}
      {...(props.hasDeviceOrientation
        ? { modeControl: <ModeControl mode="device" onModeChange={props.onModeChange} /> }
        : {})}
    />
  );
}

export function Root({
  startMode,
  hasDeviceOrientation,
  deviceEnvironment,
  simulation,
}: RootProps) {
  const [mode, setMode] = useState<NoniusMode>(startMode);
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
