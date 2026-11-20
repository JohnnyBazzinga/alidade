// The Sight screen (design §9; Req 4.1 to 4.9, 6.5), full screen with no tabs. After a capture it
// makes a Sight from the capture and the Sun side of the Frozen sighting and gives it to the
// store; a refusal is shown beside the controls through `messageFor`.

import type { CapturedResult, FrozenSighting } from '@alidade/ui';
import { useCallback, useState } from 'react';
import { toDeg } from '../math/degrees';
import { calibrationText, sigmaDegText } from '../math/fix/format';
import { calibrationInUse } from '../math/sight/index-error';
import { sightFromCapture, independentSigmaRad, type Sight } from '../math/sight/sight';
import { sunSideFromFrozen } from '../math/sight/sun-side';
import type { NoniusFailure } from '../result';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { GuidanceBlock } from './GuidanceBlock';
import { LOOK } from './look';
import { PrimaryAction } from './PrimaryAction';
import { SunSightingPane } from './SunSightingPane';
import { useNonius, useStore } from './store';

export interface SightScreenProps {
  /** Back to the screen the user came from. */
  readonly onDone: () => void;
}

function takenText(sight: Sight, correctedRad: number, sigmaRad: number): string {
  const altitude = toDeg(correctedRad);
  const sigma = sigmaDegText(sigmaRad);
  const side =
    sight.sunSide === null
      ? 'Sun side: none (the compass helps to tell two places apart)'
      : 'Sun side: yes';
  return `Sight taken: ${altitude.ok ? altitude.value.toFixed(1) : '?'}° ± ${sigma.ok ? sigma.value : '?'}°. ${side}.${sight.simulated ? ' This sight is simulated.' : ''}`;
}

export function SightScreen({ onDone }: SightScreenProps) {
  const environment = useEnvironment();
  const store = useStore();
  const { state } = useNonius();
  const [taken, setTaken] = useState<string | null>(null);
  const [failure, setFailure] = useState<NoniusFailure | null>(null);
  const [count, setCount] = useState(0);
  const calibration = calibrationInUse(state.indexError);
  const calibrationLine = calibrationText(calibration, environment.clock(), environment.parameters);

  const onCapture = useCallback(
    (captured: CapturedResult, frozen: FrozenSighting | null) => {
      const current = store.getSnapshot().state;
      const inUse = calibrationInUse(current.indexError);
      const sunSide = frozen === null ? null : sunSideFromFrozen(frozen, environment.parameters);
      const made = sightFromCapture(
        captured,
        sunSide,
        current.sights.map((s) => s.id),
        inUse,
        environment.mode === 'simulation',
        environment.parameters,
      );
      if (!made.ok) {
        setFailure(made);
        setTaken(null);
        return;
      }
      const added = store.dispatch({ kind: 'capture', sight: made.value });
      if (!added.ok) {
        setFailure(added);
        setTaken(null);
        return;
      }
      const corrected =
        made.value.rawApparentAltitudeRad -
        (inUse.kind === 'index_error' ? inUse.indexError.valueRad : 0);
      const independent = independentSigmaRad(
        made.value.sampleStdDevRad,
        made.value.markSigmaRad,
        corrected,
        environment.parameters,
      );
      const common = inUse.kind === 'index_error' ? inUse.indexError.sigmaRad : inUse.sigmaRad;
      setFailure(null);
      setTaken(
        takenText(
          made.value,
          corrected,
          Math.hypot(independent.ok ? independent.value : 0, common),
        ),
      );
      setCount((n) => n + 1);
    },
    [store, environment],
  );

  const simulation = environment.mode === 'simulation';
  const info = (
    <>
      <section data-testid="calibration-line" style={LOOK.panel}>
        <p style={LOOK.readout}>{calibrationLine.ok ? calibrationLine.value : ''}</p>
      </section>
      <GuidanceBlock collapsed={count > 0} />
    </>
  );

  return (
    <section data-testid="sight-screen" style={LOOK.stack}>
      <h1 style={LOOK.title}>Sight the Sun</h1>
      {/* On a phone the safety words come first. In Simulation mode the reviewer's controls come
          first, so that Freeze is on the first screen, and the guidance, which is about the real
          Sun, after them (task group 13, B; Vigia's task 21.4). */}
      {!simulation && info}
      <SunSightingPane onCapture={onCapture} />
      {failure !== null && <FailureNotice failure={failure} />}
      {taken !== null && (
        <p data-testid="sight-taken" style={LOOK.readout}>
          {taken}
        </p>
      )}
      {simulation && info}
      <PrimaryAction>
        <button type="button" data-primary="true" onClick={onDone} style={LOOK.primaryButton}>
          Done
        </button>
      </PrimaryAction>
    </section>
  );
}
