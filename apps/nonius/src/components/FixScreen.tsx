// The Fix screen (design §9; Req 6.7, 8, 9.1 to 9.3, 9.7, 10, 11, 16.3), drawn as Mira draws it in
// the author's design of 2026-11-28: the warning never to look at the Sun as the title; before any
// sight, how to sight under it; the Sun dial with "Sight the Sun"; the Calibration in use as a card
// (a warning card with "Measure the index error" when the phone was never calibrated); the rule of
// thumb with its drawing; How it works as a tile. With sights, the Calibration in use comes before
// the position (Req 9.3), and the position before the dial. Everything is in the page's flow, with
// no fixed row: the screen's primary action is the dial's button, or the control that fixes what
// is not ready. A refusal is shown beside the control that was refused.
import { Icon, ROLE_VARS } from '@alidade/ui';
import { useMemo, useState } from 'react';
import {
  comparisonWords,
  fixWords,
  leadAndRest,
  START,
  type WordLine,
} from '../math/fix/fix-words';
import type { NoniusFailure } from '../result';
import { SunDial } from './art/SunDial';
import { CalibrationCard } from './CalibrationCard';
import { TurnDrawing } from './art/TurnDrawing';
import { useEnvironment } from './environment';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { useNonius, useStore } from './store';

export interface FixScreenProps {
  readonly onSight: () => void;
  readonly onMeasureIndexError: () => void;
  readonly onHowItWorks: () => void;
}

function Line({ line }: { readonly line: WordLine }) {
  if (line.kind === 'disagreement') {
    return <p style={{ ...LOOK.cardTitle, color: ROLE_VARS.warnInk }}>{line.text}</p>;
  }
  if (line.kind === 'position')
    return <p style={{ ...LOOK.readout, fontSize: 17, fontWeight: 700 }}>{line.text}</p>;
  if (line.kind === 'limits') return <p style={LOOK.dim}>{line.text}</p>;
  return <p style={LOOK.text}>{line.text}</p>;
}

/** A tile that opens a view: its words and a chevron. */
function Tile({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={LOOK.tile}>
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>{label}</span>
      <Icon name="chevron-right" style={{ width: 16, height: 16, color: ROLE_VARS.inkDim }} />
    </button>
  );
}

/** The least turn as the rule says it ("20°"), for the drawing's label. */
function turnLabel(rule: string): string | null {
  const m = /at least (\d+)°/.exec(rule);
  return m === null ? null : `${m[1]}°`;
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
  const words = lines !== null && lines.ok ? lines.value : [];
  const calibrationLine = words[0];
  const rule = words.find((l) => l.kind === 'rule');
  const rest = words.slice(1).filter((l) => l.kind !== 'start' && l.kind !== 'rule');
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
  const sightIsPrimary = !twoPlaces && !measureIsPrimary;

  // The warning never to look at the Sun is the title in every state; how to sight, before any sight.
  const [title, lead] = leadAndRest(START);

  const measure = (
    <button
      type="button"
      {...(measureIsPrimary ? { 'data-primary': 'true' } : {})}
      onClick={onMeasureIndexError}
      style={measureIsPrimary ? LOOK.primaryButton : LOOK.button}
    >
      Measure the index error
      <Icon name="chevron-right" style={{ width: 14, height: 14 }} />
    </button>
  );

  const calibrationCard =
    calibrationLine === undefined ? null : (
      <CalibrationCard text={calibrationLine.text} uncalibrated={uncalibrated}>
        {measure}
      </CalibrationCard>
    );

  return (
    <section data-testid="fix-screen" data-kind={kind} style={LOOK.stack}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={LOOK.title}>{title}</h1>
        {words.some((l) => l.kind === 'start') && <p style={LOOK.dim}>{lead}</p>}
      </div>
      {snapshot.notices.map((n) => (
        <FailureNotice
          key={n.reason}
          failure={{ ok: false, reason: n.reason }}
          {...(n.count === undefined ? {} : { count: n.count })}
        />
      ))}
      {failure !== null && <FailureNotice failure={failure} />}
      {kind === 'empty' ? (
        <>
          <SunDial primary={sightIsPrimary} onSight={onSight} />
          {calibrationCard}
        </>
      ) : (
        <>
          {calibrationCard}
          {rest.length > 0 && (
            <section data-testid="fix-words" style={LOOK.card}>
              {rest.map((line, i) => (
                <Line key={`${line.kind}-${i}`} line={line} />
              ))}
              {twoPlaces && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(['A', 'B'] as const).map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      data-primary="true"
                      onClick={() => store.chooseUserPlace(i as 0 | 1)}
                      style={LOOK.primaryButton}
                    >
                      I am near {label}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          {kind === 'fix' && (
            <section data-testid="comparison-area" style={LOOK.card}>
              <button type="button" onClick={() => void compare()} style={LOOK.button}>
                {asking ? 'Asking for the location…' : "Compare with this phone's GPS"}
              </button>
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
          <SunDial primary={sightIsPrimary} onSight={onSight} />
        </>
      )}
      {rule !== undefined && (
        <section data-testid="rule-card" style={{ ...LOOK.card, flexDirection: 'row', gap: 14 }}>
          <TurnDrawing label={turnLabel(leadAndRest(rule.text)[0])} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <p style={{ ...LOOK.cardTitle, fontSize: 14 }}>{leadAndRest(rule.text)[0]}</p>
            <p style={{ ...LOOK.dim, fontSize: 13 }}>{leadAndRest(rule.text)[1]}</p>
          </div>
        </section>
      )}
      {snapshot.userChoice !== null && (
        <Tile label="Undo my choice" onClick={() => store.undoChoice()} />
      )}
      <Tile label="How it works" onClick={onHowItWorks} />
    </section>
  );
}
