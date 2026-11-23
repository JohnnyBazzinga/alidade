// The Sight screen (design §9, D23; Req 3.1, 3.3, 3.7, 3.10, 4.2, 4.3, 4.11, 16.2). On a phone it is
// UI's sighting screen through UI's `DeviceSighting` in the docked layout: the aiming line and "How
// to aim", the camera, the compact readout, and a bar at the foot with Back beside the current action;
// with no Camera calibration and no tap sigma, so the sighting is along the crosshair and the image
// takes no taps (Req 3.3). In Simulation mode the shell renders the Simulator's source in the flow
// layout. The capture itself is the skeleton's: Vigia reimplements none of it (Req 3.1).
//
// A capture with no smoke open starts the smoke at once, with no question (Req 4.2): the Capture is
// the act. With one open, the question (Req 4.3) is a view of its own that replaces the camera.
// Nothing is added until it is answered.

import { DeviceSighting, Icon, SIZES, type CapturedResult, type Session } from '@alidade/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SIMULATION_VALUES_TEXT } from '../math/texts';
import type { VigiaFailure } from '../result';
import { ConfirmSmokeDialog, type SmokeAnswer } from './ConfirmSmokeDialog';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { GuidanceBlock } from './GuidanceBlock';
import { IdleScene } from './art/IdleScene';
import { HowToCards } from './HowToCards';
import { LOOK } from './look';
import { useStore, useVigia } from './store';
import { useOpenAtTop } from './use-open-at-top';

/** The icons of the docked bar's controls (Req 22.8, design D25.5), by the UI's control ids. */
const CONTROL_ICONS = {
  start: 'camera',
  'north-compass': 'compass',
  capture: 'camera',
  unfreeze: 'video',
} as const;

export interface SightScreenProps {
  /** A wind reading is shown on the map (Req 13.5): the guidance says that smoke drifts downwind. */
  readonly windShown?: boolean;
  readonly onBack: () => void;
  /** The capture was added to a smoke: the App opens the Smoke screen on it (Req 4.11). */
  readonly onAdded: (sightingId: string) => void;
  /**
   * Switches the page to Simulation mode. When given, a phone-mode screen whose sensors never
   * sent an event offers it beside the refusal (Req 17.1): a desktop browser has the event type
   * and no sensor.
   */
  readonly onTrySimulator?: () => void;
}

/** A tap is refused on a phone: there is no field of view (Req 3.3, Open question U1). */
const NO_TAP_SIGMA_PX = Number.NaN;

export function SightScreen({
  onBack,
  onAdded,
  onTrySimulator,
  windShown = false,
}: SightScreenProps) {
  const environment = useEnvironment();
  const store = useStore();
  const { open } = useVigia();
  const [session, setSession] = useState<Session | null>(null);
  // The captured result that the user has answered, or has left behind with a refusal.
  const [done, setDone] = useState<CapturedResult | null>(null);
  const [failure, setFailure] = useState<VigiaFailure | null>(null);
  const started = useRef<CapturedResult | null>(null);
  // A capture that happened in front of the user: the Session went from `frozen` to `captured`
  // while this screen was on. A captured result that a panel hands over again (a phone or a scene
  // that changed) is not one: nothing is added for it without a question or an act (Req 3.8, 4.2).
  const previous = useRef<Session['state'] | null>(null);
  const [fresh, setFresh] = useState<CapturedResult | null>(null);

  const onSession = useCallback((next: Session) => {
    if (next.state === 'captured' && next.captured !== null && previous.current === 'frozen') {
      setFresh(next.captured);
    }
    previous.current = next.state;
    setSession(next);
  }, []);

  const captured =
    session !== null &&
    session.state === 'captured' &&
    session.captured !== null &&
    session.captured.kind === 'bearing' &&
    session.captured !== done
      ? session.captured
      : null;
  const smokeOpen = open !== null;

  // Neither answer is preselected (Req 4.3 as amended 2026-11-22, Req 22.1 (d), 22.9): the age of
  // the open smoke no longer changes the view.

  // No smoke open: the Capture starts the smoke (Req 4.2), once for each captured result.
  useEffect(() => {
    if (captured === null || captured.kind !== 'bearing' || smokeOpen) return;
    if (fresh !== captured || started.current === captured) return;
    started.current = captured;
    const result = store.capture(captured.bearing, 'new');
    if (!result.ok) {
      setFailure(result);
      return;
    }
    setDone(captured);
    onAdded(result.value.sightingId);
  }, [captured, fresh, smokeOpen, store, onAdded]);

  const answer = (which: SmokeAnswer): void => {
    if (captured === null || captured.kind !== 'bearing') return;
    const result = store.capture(captured.bearing, which);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    setDone(captured);
    onAdded(result.value.sightingId);
  };

  const source = environment.sighting;
  const viewRef = useOpenAtTop<HTMLElement>(captured === null ? 'sight' : 'capture-view');
  // Started, refused, and not one orientation event arrived: the sensors are not there.
  const noSensorEvent =
    source.kind === 'device' &&
    session !== null &&
    session.state === 'failed' &&
    session.history.samples.length === 0;

  // The question: a view of its own, in place of the camera.
  if (captured !== null && smokeOpen) {
    return (
      // On a phone the Sight route has no padding (the docked column): the question has its own.
      <section
        ref={viewRef}
        data-testid="sight-question"
        style={{ ...LOOK.stack, padding: source.kind === 'device' ? SIZES.gapPx * 1.5 : 0 }}
      >
        <ConfirmSmokeDialog
          captured={captured}
          failure={failure}
          onAnswer={answer}
          onBack={onBack}
        />
      </section>
    );
  }
  // The store refused a first capture: its Message, and a way back to the sighting.
  if (captured !== null && failure !== null) {
    return (
      <section ref={viewRef} data-testid="sight-refused" style={LOOK.stack}>
        <FailureNotice failure={failure} />
        <button
          type="button"
          onClick={() => {
            setDone(captured);
            setFailure(null);
          }}
          style={LOOK.button}
        >
          Back to the sighting
        </button>
      </section>
    );
  }

  if (source.kind === 'device') {
    return (
      <section data-testid="sight-screen" style={{ display: 'block' }}>
        <DeviceSighting
          createSource={source.createSource}
          cameraSurface={source.cameraSurface}
          timer={environment.timer}
          parameters={source.sessionParameters}
          calibration={null}
          tapSigmaPx={NO_TAP_SIGMA_PX}
          onSession={onSession}
          layout="docked"
          back={{ label: 'Back', onPress: onBack }}
          aim={<GuidanceBlock windShown={windShown} />}
          intro={<HowToCards />}
          idleImage={<IdleScene />}
          controlIcons={CONTROL_ICONS}
          extra={
            noSensorEvent && onTrySimulator !== undefined ? (
              <button
                type="button"
                onClick={onTrySimulator}
                style={{ ...LOOK.button, margin: SIZES.gapPx }}
              >
                Try the simulator instead
              </button>
            ) : undefined
          }
          {...(source.observe === undefined ? {} : { observe: source.observe })}
        />
      </section>
    );
  }
  return (
    <section data-testid="sight-screen" style={LOOK.stack}>
      <div style={LOOK.controls}>
        <button type="button" onClick={onBack} style={LOOK.button}>
          <Icon name="chevron-left" />
          Back
        </button>
      </div>
      {source.render(onSession)}
      <p style={LOOK.dim}>{SIMULATION_VALUES_TEXT}</p>
      <GuidanceBlock windShown={windShown} />
    </section>
  );
}
