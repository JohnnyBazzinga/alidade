// The Index error screen (design §9, D6, D17; Req 15): step 1 asks the phone's location once, on
// the user's act; step 2 takes Sun sights on the same altitude Session and shows each difference
// `dₖ`, the mean and the sigma as they come. The location and the calibration sights live in this
// screen's state only: Save stores the Index error and drops them, Cancel drops everything, and
// neither ever reaches the store's state (Req 15.5, 15.9).

import type { PositionFix } from '@alidade/sensors';
import { useCallback, useState } from 'react';
import { toDeg } from '../math/degrees';
import { lengthText95, sigmaDegText } from '../math/fix/format';
import { calibrationDifferenceRad } from '../math/sight/calibration-difference';
import { calibrationInUse, indexErrorFromSights } from '../math/sight/index-error';
import { sightFromCapture, type Sight } from '../math/sight/sight';
import type { NoniusFailure } from '../result';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { GuidanceBlock } from './GuidanceBlock';
import { LOOK } from './look';
import { PrimaryAction } from './PrimaryAction';
import { SunSightingPane } from './SunSightingPane';
import { useStore } from './store';

export interface IndexErrorScreenProps {
  /** The Index error was saved. */
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

/** A signed angle in degrees to a tenth, with a true minus sign and no `-0`. */
function signedDegText(rad: number): string {
  const deg = toDeg(rad);
  if (!deg.ok) return '?';
  const tenths = Math.round(deg.value * 10);
  return `${tenths < 0 ? '\u2212' : ''}${(Math.abs(tenths) / 10).toFixed(1)}°`;
}

function accuracyText(accuracyM: number): string {
  if (accuracyM < 1000) return `${Math.max(1, Math.ceil(accuracyM))} m`;
  const text = lengthText95(accuracyM);
  return text.ok ? text.value : 'unknown';
}

export function IndexErrorScreen({ onDone, onCancel }: IndexErrorScreenProps) {
  const environment = useEnvironment();
  const store = useStore();
  const [place, setPlace] = useState<PositionFix | null>(null);
  const [asking, setAsking] = useState(false);
  const [placeFailure, setPlaceFailure] = useState<NoniusFailure | null>(null);
  const [sights, setSights] = useState<readonly Sight[]>([]);
  const [captureFailure, setCaptureFailure] = useState<NoniusFailure | null>(null);
  const [saveFailure, setSaveFailure] = useState<NoniusFailure | null>(null);
  const simulated = environment.mode === 'simulation';

  const ask = async (): Promise<void> => {
    setAsking(true);
    setPlaceFailure(null);
    const located = await environment.askLocation();
    setAsking(false);
    if (located.ok) setPlace(located.value);
    else setPlaceFailure(located);
  };

  const onCapture = useCallback(
    (captured: Parameters<typeof sightFromCapture>[0]) => {
      if (place === null) return;
      setSights((current) => {
        // Raw altitudes: no Index error applies to a calibration sight (Req 15.3).
        const made = sightFromCapture(
          captured,
          null,
          current.map((s) => s.id),
          calibrationInUse(null),
          simulated,
          environment.parameters,
        );
        if (!made.ok) {
          setCaptureFailure(made);
          return current;
        }
        setCaptureFailure(null);
        setSaveFailure(null);
        return [...current, made.value];
      });
    },
    [place, simulated, environment.parameters],
  );

  const differences =
    place === null
      ? []
      : sights.map((s) => ({
          sight: s,
          d: calibrationDifferenceRad(s, place.position, environment.parameters),
        }));
  const preview =
    place === null || sights.length === 0
      ? null
      : indexErrorFromSights(sights, place, simulated, environment.parameters);

  const save = (): void => {
    if (preview === null) return;
    if (!preview.ok) {
      setSaveFailure(preview);
      return;
    }
    const saved = store.dispatch({ kind: 'save_index_error', indexError: preview.value });
    if (!saved.ok) {
      setSaveFailure(saved);
      return;
    }
    setPlace(null);
    setSights([]);
    onDone();
  };
  const cancel = (): void => {
    setPlace(null);
    setSights([]);
    onCancel();
  };

  const sigma = preview !== null && preview.ok ? sigmaDegText(preview.value.sigmaRad) : null;

  return (
    <section data-testid="index-error-screen" style={LOOK.stack}>
      <h1 style={LOOK.title}>Measure the index error</h1>
      <p style={LOOK.text}>
        At a place this phone knows, a few Sun sights are compared with the altitude the Sun has
        there and then. The constant difference is the phone&apos;s index error, as on a sextant.
        Every position then uses it.
      </p>
      <section style={LOOK.panel}>
        <h2 style={LOOK.title}>Step 1: where you are</h2>
        {place === null ? (
          <>
            <p style={LOOK.text}>
              Stand where the phone&apos;s location is good, then ask for it. It is used only to
              compute the Sun&apos;s altitude for this, never used for a Fix, and not kept.
            </p>
            {simulated && (
              <p style={LOOK.dim}>
                In Simulation mode the place is the scene&apos;s true position.
              </p>
            )}
            <button
              type="button"
              data-primary="true"
              disabled={asking}
              onClick={() => void ask()}
              style={LOOK.primaryButton}
            >
              Use this phone&apos;s location
            </button>
            {placeFailure !== null && <FailureNotice failure={placeFailure} />}
          </>
        ) : (
          <p style={LOOK.text}>
            Location known, accurate to about {accuracyText(place.reportedAccuracyM)}
            {simulated ? ' (the scene\u2019s true position, simulated)' : ''}. It is used only to
            compute the Sun&apos;s altitude for this, never used for a Fix, and not kept.
          </p>
        )}
      </section>
      {place !== null && (
        <>
          <GuidanceBlock collapsed={sights.length > 0} />
          <SunSightingPane onCapture={onCapture} />
          {captureFailure !== null && <FailureNotice failure={captureFailure} />}
          {differences.length > 0 && (
            <section style={LOOK.panel}>
              <h2 style={LOOK.title}>Step 2: the differences</h2>
              {differences.map(({ sight, d }, i) => (
                <p key={sight.id} data-testid="difference" style={LOOK.text}>
                  Sight {i + 1}: measured minus computed{' '}
                  {d.ok ? signedDegText(d.value) : 'could not be told'}
                </p>
              ))}
              {preview !== null && preview.ok && sigma !== null && sigma.ok && (
                <p data-testid="index-error-preview" style={{ ...LOOK.readout, fontWeight: 700 }}>
                  Index error {signedDegText(preview.value.valueRad)} ± {sigma.value}° from{' '}
                  {preview.value.sightCount} {preview.value.sightCount === 1 ? 'sight' : 'sights'}
                </p>
              )}
            </section>
          )}
        </>
      )}
      <PrimaryAction>
        {sights.length > 0 && (
          <section data-testid="save-area" style={LOOK.stack}>
            {saveFailure !== null && <FailureNotice failure={saveFailure} />}
            <button type="button" data-primary="true" onClick={save} style={LOOK.primaryButton}>
              Save
            </button>
          </section>
        )}
        <button type="button" onClick={cancel} style={LOOK.button}>
          Cancel
        </button>
      </PrimaryAction>
    </section>
  );
}
