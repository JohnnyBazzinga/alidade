// The Sight screen (design §9; Req 3.1 to 3.8, 4.2, 4.3, 16.2), full screen with no tabs. On a
// phone it is UI's sighting screen through UI's `DeviceSighting`, with no Camera calibration and
// no tap sigma, so the sighting is along the crosshair and a tap is refused by the skeleton
// (Req 3.3); in Simulation mode the shell renders the Simulator's source. The capture itself is
// the skeleton's: Vigia reimplements none of it (Req 3.1).
//
// After a capture the question of Req 4.3 comes first on the screen, because answering it is the
// next thing to do; nothing is added until it is answered. The guidance is in view before the
// first capture and one tap away after it. In Simulation mode the reviewer's controls come first
// (the post is chosen under the banner, then the scene and Start in the panel), and the guidance,
// which is about real smoke, after them (task 21.4): before it, Start was below the first screen.

import { DeviceSighting, type CapturedResult, type Session } from '@alidade/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { newestTimeUtcMs } from '../math/incident/incident-state';
import { SIMULATION_VALUES_TEXT } from '../math/texts';
import type { VigiaFailure } from '../result';
import { ConfirmSmokeDialog, type SmokeAnswer } from './ConfirmSmokeDialog';
import { useEnvironment } from './environment';
import { GuidanceBlock } from './GuidanceBlock';
import { LOOK } from './look';
import { useStore, useVigia } from './store';

export interface SightScreenProps {
  readonly onBack: () => void;
  /** The capture was added to a smoke: the App goes back to the Smoke screen. */
  readonly onAdded: () => void;
  /**
   * Switches the page to Simulation mode. When given, a phone-mode screen whose sensors never
   * sent an event offers it beside the refusal (Req 17.1): a desktop browser has the event type
   * and no sensor.
   */
  readonly onTrySimulator?: () => void;
}

/** A tap is refused on a phone: there is no field of view (Req 3.3, Open question U1). */
const NO_TAP_SIGMA_PX = Number.NaN;

export function SightScreen({ onBack, onAdded, onTrySimulator }: SightScreenProps) {
  const environment = useEnvironment();
  const store = useStore();
  const { open } = useVigia();
  const [session, setSession] = useState<Session | null>(null);
  const [answered, setAnswered] = useState<CapturedResult | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [failure, setFailure] = useState<VigiaFailure | null>(null);
  const lastCaptured = useRef<CapturedResult | null>(null);

  const onSession = useCallback((next: Session) => {
    setSession(next);
    if (next.captured !== null && next.captured !== lastCaptured.current) {
      lastCaptured.current = next.captured;
      setCaptureCount((n) => n + 1);
      setFailure(null);
    }
  }, []);

  const captured =
    session !== null &&
    session.state === 'captured' &&
    session.captured !== null &&
    session.captured.kind === 'bearing' &&
    session.captured !== answered
      ? session.captured
      : null;

  const preselected = useMemo((): SmokeAnswer | null => {
    if (captured === null || open === null) return null;
    const ageMs = environment.clock() - newestTimeUtcMs(open.incident);
    return ageMs <= environment.parameters.maxIncidentAgeMs ? 'same' : 'new';
  }, [captured, open, environment]);

  const answer = (which: SmokeAnswer): void => {
    if (captured === null || captured.kind !== 'bearing') return;
    const result = store.capture(captured.bearing, which);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    setAnswered(captured);
    onAdded();
  };

  const source = environment.sighting;
  // Started, refused, and not one orientation event arrived: the sensors are not there.
  const noSensorEvent =
    source.kind === 'device' &&
    session !== null &&
    session.state === 'failed' &&
    session.history.samples.length === 0;
  return (
    <section data-testid="sight-screen" style={LOOK.stack}>
      <div style={LOOK.controls}>
        <button type="button" onClick={onBack} style={LOOK.button}>
          Back
        </button>
      </div>
      {captured !== null && (
        <ConfirmSmokeDialog preselected={preselected} failure={failure} onAnswer={answer} />
      )}
      {source.kind === 'device' ? (
        <>
          <GuidanceBlock collapsed={captureCount > 0} windShown={false} />
          <DeviceSighting
            createSource={source.createSource}
            cameraSurface={source.cameraSurface}
            timer={environment.timer}
            parameters={source.sessionParameters}
            calibration={null}
            tapSigmaPx={NO_TAP_SIGMA_PX}
            onSession={onSession}
            {...(source.observe === undefined ? {} : { observe: source.observe })}
          />
          {noSensorEvent && onTrySimulator !== undefined && (
            <button type="button" onClick={onTrySimulator} style={LOOK.button}>
              Try the simulator instead
            </button>
          )}
        </>
      ) : (
        <>
          {source.render(onSession)}
          <p style={LOOK.dim}>{SIMULATION_VALUES_TEXT}</p>
          <GuidanceBlock collapsed={captureCount > 0} windShown={false} />
        </>
      )}
    </section>
  );
}
