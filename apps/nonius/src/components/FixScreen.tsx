// The Fix screen (design §9; Req 6.7, 8, 9.1 to 9.3, 9.7, 10, 11): where I am and how far to trust
// it, then the Calibration in use, before anything else. Everything is in the page's flow; the
// screen's primary action is in the row above the tab bar (`PrimaryAction`). A refusal is shown
// beside the control that was refused.

import { useMemo, useState } from 'react';
import { comparisonWords, fixWords, type WordLine } from '../math/fix/fix-words';
import type { NoniusFailure } from '../result';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { PrimaryAction } from './PrimaryAction';
import { useNonius, useStore } from './store';

export interface FixScreenProps {
  readonly onSight: () => void;
  readonly onMeasureIndexError: () => void;
  readonly onHowItWorks: () => void;
}

function Line({ line }: { readonly line: WordLine }) {
  if (line.kind === 'disagreement') {
    return <p style={LOOK.alertText}>{line.text}</p>;
  }
  if (line.kind === 'position')
    return <p style={{ ...LOOK.readout, fontWeight: 700 }}>{line.text}</p>;
  if (line.kind === 'limits') return <p style={LOOK.dim}>{line.text}</p>;
  return <p style={LOOK.text}>{line.text}</p>;
}

export function FixScreen({ onSight, onMeasureIndexError, onHowItWorks }: FixScreenProps) {
  const environment = useEnvironment();
  const store = useStore();
  const snapshot = useNonius();
  const [asking, setAsking] = useState(false);
  const nowUtcMs = environment.clock();
  const assessment = snapshot.assessment;

  const lines = useMemo(
    () => (assessment.ok ? fixWords(assessment.value, nowUtcMs, environment.parameters) : null),
    [assessment, nowUtcMs, environment.parameters],
  );
  const failure: NoniusFailure | null = !assessment.ok
    ? assessment
    : lines !== null && !lines.ok
      ? lines
      : null;
  const kind = assessment.ok ? assessment.value.kind : 'failed';
  const calibration = assessment.ok ? assessment.value.calibration : null;
  const uncalibrated = calibration === null || calibration.kind === 'uncalibrated';
  const calibrationLine = lines !== null && lines.ok ? lines.value[0] : undefined;
  const rest = lines !== null && lines.ok ? lines.value.slice(1) : [];

  const comparison = snapshot.comparison;
  const comparisonText =
    comparison === null
      ? null
      : comparisonWords(comparison, !uncalibrated, environment.mode === 'simulation');

  const compare = async (): Promise<void> => {
    setAsking(true);
    await store.compareWithGps();
    setAsking(false);
  };

  // What is not ready is said once, and the control that fixes it is the prominent one.
  const twoPlaces = kind === 'two_places';
  const measureIsPrimary = !twoPlaces && uncalibrated && (kind === 'fix' || kind === 'failed');
  const primary = (id: string, label: string, onClick: () => void) => (
    <button key={id} type="button" data-primary="true" onClick={onClick} style={LOOK.primaryButton}>
      {label}
    </button>
  );
  const plain = (id: string, label: string, onClick: () => void) => (
    <button key={id} type="button" onClick={onClick} style={LOOK.button}>
      {label}
    </button>
  );

  return (
    <section data-testid="fix-screen" data-kind={kind} style={LOOK.stack}>
      <h1 style={LOOK.title}>Fix</h1>
      {snapshot.notices.map((n) => (
        <FailureNotice
          key={n.reason}
          failure={{ ok: false, reason: n.reason }}
          {...(n.count === undefined ? {} : { count: n.count })}
        />
      ))}
      {failure !== null && <FailureNotice failure={failure} />}
      {calibrationLine !== undefined && (
        <section data-testid="calibration-line" style={uncalibrated ? LOOK.alertPanel : LOOK.panel}>
          <p style={uncalibrated ? LOOK.alertText : LOOK.readout}>{calibrationLine.text}</p>
        </section>
      )}
      <section data-testid="fix-words" style={LOOK.panel}>
        {rest.map((line, i) => (
          <Line key={`${line.kind}-${i}`} line={line} />
        ))}
      </section>
      {kind === 'fix' && (
        <section data-testid="comparison-area" style={LOOK.panel}>
          {plain(
            'compare',
            asking ? 'Asking for the location…' : "Compare with this phone's GPS",
            () => void compare(),
          )}
          {snapshot.comparisonFailure !== null && (
            <FailureNotice failure={snapshot.comparisonFailure} />
          )}
          {comparisonText !== null && comparisonText.ok && (
            <p data-testid="comparison" style={LOOK.text}>
              {comparisonText.value}
            </p>
          )}
        </section>
      )}
      <div style={LOOK.controls}>
        {snapshot.userChoice !== null && plain('undo', 'Undo my choice', () => store.undoChoice())}
        {!measureIsPrimary && plain('measure', 'Measure the index error', onMeasureIndexError)}
        {plain('how', 'How it works', onHowItWorks)}
      </div>
      <PrimaryAction>
        {twoPlaces ? (
          <>
            {primary('a', 'I am near A', () => store.chooseUserPlace(0))}
            {primary('b', 'I am near B', () => store.chooseUserPlace(1))}
            {plain('sight', 'Sight the Sun', onSight)}
          </>
        ) : measureIsPrimary ? (
          <>
            {primary('measure', 'Measure the index error', onMeasureIndexError)}
            {plain('sight', 'Sight the Sun', onSight)}
          </>
        ) : (
          primary('sight', 'Sight the Sun', onSight)
        )}
      </PrimaryAction>
    </section>
  );
}
