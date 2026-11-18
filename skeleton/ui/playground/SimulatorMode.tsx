// Simulator mode (Req 18.2): the Simulator panel, the Scene image and `createSimulator`, with the
// scene's own calibration (Req 18.3).

import { useCallback } from 'react';
import {
  SimulatorPanel,
  type CatalogueScene,
  type Session,
  type SessionParameters,
  type ObserveElementSize,
  type SimulatorContext,
  type Timer,
} from '../src/index';
import type { SensorSourceOptions } from '@alidade/sensors';

export interface SimulatorModeProps {
  readonly catalogue: readonly CatalogueScene[];
  readonly timer: Timer;
  readonly parameters: SessionParameters;
  readonly sensorOptions: SensorSourceOptions;
  readonly tapSigmaPx: number;
  readonly onSession: (session: Session, where: string) => void;
  readonly observe?: ObserveElementSize;
}

export function SimulatorMode(props: SimulatorModeProps) {
  const { onSession } = props;
  const forward = useCallback(
    (session: Session, context: SimulatorContext) => onSession(session, context.station.name),
    [onSession],
  );
  return (
    <SimulatorPanel
      catalogue={props.catalogue}
      timer={props.timer}
      parameters={props.parameters}
      sensorOptions={props.sensorOptions}
      tapSigmaPx={props.tapSigmaPx}
      onSession={forward}
      observe={props.observe}
    />
  );
}
