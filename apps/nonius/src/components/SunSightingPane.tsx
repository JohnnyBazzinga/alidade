// The sighting of the Sun, shared by the Sight screen and the Index error screen (Req 4.1, 4.3,
// 4.4): UI's `DeviceSighting` with the kind altitude on a phone, or the shell's Simulator panel.
// It keeps the last Frozen sighting it saw and, on each new altitude capture, hands both to the
// screen. It asks for no location (the altitude Session asks for none).

import {
  DeviceSighting,
  type CapturedResult,
  type FrozenSighting,
  type Session,
} from '@alidade/ui';
import { useCallback, useRef } from 'react';
import { useEnvironment } from './environment';
import { LOOK } from './look';

/** A tap is refused on a phone: there is no field of view (Req 4.3). */
const NO_TAP_SIGMA_PX = Number.NaN;

export const SIMULATION_VALUES_TEXT =
  'In Simulation mode the camera is the scene: the field of view and the tap\u2019s error are simulation values.';

export interface SunSightingPaneProps {
  readonly onCapture: (captured: CapturedResult, frozen: FrozenSighting | null) => void;
  readonly onSession?: (session: Session) => void;
}

export function SunSightingPane({ onCapture, onSession }: SunSightingPaneProps) {
  const environment = useEnvironment();
  const lastFrozen = useRef<FrozenSighting | null>(null);
  const lastCaptured = useRef<CapturedResult | null>(null);

  const handle = useCallback(
    (session: Session) => {
      if (session.frozen !== null) lastFrozen.current = session.frozen;
      if (session.state === 'frozen' && session.captured === null) lastCaptured.current = null;
      if (
        session.state === 'captured' &&
        session.captured !== null &&
        session.captured.kind === 'altitude' &&
        session.captured !== lastCaptured.current
      ) {
        lastCaptured.current = session.captured;
        onCapture(session.captured, lastFrozen.current);
      }
      onSession?.(session);
    },
    [onCapture, onSession],
  );

  const source = environment.sighting;
  if (source.kind === 'simulation') {
    return (
      <>
        {source.render(handle)}
        <p style={LOOK.dim}>{SIMULATION_VALUES_TEXT}</p>
      </>
    );
  }
  return (
    <DeviceSighting
      createSource={source.createSource}
      cameraSurface={source.cameraSurface}
      timer={environment.timer}
      parameters={source.sessionParameters}
      calibration={null}
      tapSigmaPx={NO_TAP_SIGMA_PX}
      kind="altitude"
      onSession={handle}
      {...(source.observe === undefined ? {} : { observe: source.observe })}
    />
  );
}
