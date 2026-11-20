// The Sights screen (design §9; Req 4.9, 8.4, 12.3, 12.4, 15.5, 15.6): the count statement, the
// span of the set, each Sight with its corrected altitude and total sigma, and the controls that
// delete (each asks once).

import { useMemo, useState } from 'react';
import { ageText, utcClockText, utcDateText } from '../math/civil-time';
import { toDeg } from '../math/degrees';
import { calibrationText, sigmaDegText } from '../math/fix/format';
import { countStatement } from '../math/fix/statements';
import { messageFor } from '../math/messages';
import { calibrationInUse } from '../math/sight/index-error';
import { prepareSights } from '../math/sight/prepare';
import type { Sight } from '../math/sight/sight';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { useNonius, useStore } from './store';

export interface SightsScreenProps {
  readonly onMeasureIndexError: () => void;
}

type Confirming =
  | { readonly kind: 'delete'; readonly id: string }
  | { readonly kind: 'again' }
  | { readonly kind: 'index' }
  | null;

function degreesText(rad: number): string {
  const deg = toDeg(rad);
  return deg.ok ? deg.value.toFixed(1) : '?';
}

export function SightsScreen({ onMeasureIndexError }: SightsScreenProps) {
  const environment = useEnvironment();
  const store = useStore();
  const { state, assessment } = useNonius();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const nowUtcMs = environment.clock();
  const calibration = calibrationInUse(state.indexError);

  const rows = useMemo(() => {
    const prepared = prepareSights(state.sights, calibration, environment.parameters);
    const outliers = new Set(
      assessment.ok
        ? assessment.value.setAside.filter((s) => s.cause === 'outlier').map((s) => s.sight.id)
        : [],
    );
    return state.sights.map((sight) => {
      const p = prepared.ok
        ? prepared.value.prepared.find((x) => x.sight.id === sight.id)
        : undefined;
      const aside = prepared.ok
        ? prepared.value.setAside.find((x) => x.sight.id === sight.id)
        : undefined;
      const cause = aside?.cause ?? (outliers.has(sight.id) ? ('outlier' as const) : null);
      return { sight, prepared: p, cause };
    });
  }, [state, assessment, calibration, environment.parameters]);

  const used = rows.filter((r) => r.cause === null).length;
  const calibrationLine = calibrationText(calibration, nowUtcMs, environment.parameters);
  const times = state.sights.map((s) => s.timeUtcMs);
  const span =
    times.length === 0
      ? null
      : `Sights from ${utcClockText(Math.min(...times))} to ${utcClockText(Math.max(...times))}, ${utcDateText(Math.max(...times))}.`;

  const answer = (yes: string, no: string, onYes: () => void) => (
    <div style={LOOK.controls}>
      <button
        type="button"
        style={LOOK.dangerButton}
        onClick={() => {
          onYes();
          setConfirming(null);
        }}
      >
        {yes}
      </button>
      <button type="button" style={LOOK.button} onClick={() => setConfirming(null)}>
        {no}
      </button>
    </div>
  );

  const rowText = (sight: Sight, r: (typeof rows)[number]): string => {
    const corrected =
      r.prepared?.correctedApparentAltitudeRad ??
      sight.rawApparentAltitudeRad -
        (calibration.kind === 'index_error' ? calibration.indexError.valueRad : 0);
    const sigma =
      r.prepared === undefined
        ? null
        : sigmaDegText(Math.hypot(r.prepared.independentSigmaRad, r.prepared.commonSigmaRad));
    const altitude = `${degreesText(corrected)}°${sigma !== null && sigma.ok ? ` ± ${sigma.value}°` : ''}`;
    const when = `${utcClockText(sight.timeUtcMs)}, ${ageText(nowUtcMs - sight.timeUtcMs)}`;
    const side = sight.sunSide === null ? 'Sun side: none' : 'Sun side: yes';
    const status =
      r.cause === null
        ? 'used'
        : `set aside: ${messageFor({ ok: false, reason: r.cause }).whatHappened}`;
    return `${altitude}. ${when}. ${side}. ${status}${sight.simulated ? '. simulated' : ''}`;
  };

  return (
    <section data-testid="sights-screen" style={LOOK.stack}>
      <h1 style={LOOK.title}>Sights</h1>
      {assessment.ok === false && <FailureNotice failure={assessment} />}
      <section data-testid="calibration-line" style={LOOK.panel}>
        <p style={LOOK.readout}>{calibrationLine.ok ? calibrationLine.value : ''}</p>
        {state.indexError !== null && confirming?.kind !== 'index' && (
          <button
            type="button"
            style={LOOK.button}
            onClick={() => setConfirming({ kind: 'index' })}
          >
            Remove the index error
          </button>
        )}
        {confirming?.kind === 'index' &&
          answer('Yes, remove the index error', 'Keep it', () =>
            store.dispatch({ kind: 'remove_index_error' }),
          )}
        <button type="button" style={LOOK.button} onClick={onMeasureIndexError}>
          Measure the index error
        </button>
      </section>
      <section style={LOOK.panel}>
        <p style={LOOK.text}>{countStatement(used)}</p>
        {span !== null && <p style={LOOK.text}>{span}</p>}
        <p style={LOOK.text}>
          All the sights of a set must be taken from one place. After moving, start again.
        </p>
      </section>
      {rows.map((r) => (
        <article key={r.sight.id} data-testid="sight-row" style={LOOK.panel}>
          <p style={LOOK.text}>{rowText(r.sight, r)}</p>
          {confirming?.kind === 'delete' && confirming.id === r.sight.id ? (
            answer('Yes, delete this sight', 'Keep it', () =>
              store.dispatch({ kind: 'delete', id: r.sight.id }),
            )
          ) : (
            <button
              type="button"
              style={LOOK.dangerButton}
              onClick={() => setConfirming({ kind: 'delete', id: r.sight.id })}
            >
              Delete
            </button>
          )}
        </article>
      ))}
      {state.sights.length > 0 &&
        (confirming?.kind === 'again' ? (
          answer('Yes, delete all sights', 'Keep my sights', () =>
            store.dispatch({ kind: 'start_again' }),
          )
        ) : (
          <button
            type="button"
            style={LOOK.dangerButton}
            onClick={() => setConfirming({ kind: 'again' })}
          >
            Start again
          </button>
        ))}
    </section>
  );
}
