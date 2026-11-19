// The Fix in words (Req 6.1 to 6.4, 6.7, 6.11, design §7.8): built from a Core `Fix`, which always
// has its Ellipse, so no position reaches this component without its uncertainty. A disagreement
// is the first thing, in the alert's colour; then the position with its metres in one sentence,
// the 95 % area, the distance from this phone with its interval when the phone knows where it is,
// what it rests on, the geometry and the warnings. The limits are the LimitsBlock's.

import type { Fix } from '@alidade/core';
import { useMemo } from 'react';
import type { Assessment } from '../math/assessment/assess';
import { fixWords } from '../math/fix/fix-words';
import { fromYouWords } from '../math/fix/from-you';
import type { VigiaParameters } from '../math/parameters';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import type { OwnPosition } from './store';

export interface FixWordsViewProps {
  readonly fix: Fix;
  readonly assessment: Assessment;
  readonly nowUtcMs: number;
  readonly ownPosition: OwnPosition | null;
  readonly parameters: VigiaParameters;
}

export function FixWordsView({
  fix,
  assessment,
  nowUtcMs,
  ownPosition,
  parameters,
}: FixWordsViewProps) {
  const words = useMemo(
    () => fixWords(fix, assessment, nowUtcMs, parameters),
    [fix, assessment, nowUtcMs, parameters],
  );
  const fromYou = useMemo(
    () => (ownPosition === null ? null : fromYouWords(fix, ownPosition.position, parameters)),
    [fix, ownPosition, parameters],
  );
  if (!words.ok) return <FailureNotice failure={words} />;
  const w = words.value;
  return (
    <>
      {w.disagreement !== null && (
        <div style={LOOK.alertPanel}>
          <p data-testid="disagreement" style={LOOK.alertText}>
            {w.disagreement}
          </p>
        </div>
      )}
      <section data-testid="fix-words" style={LOOK.panel}>
        <p data-testid="fix-headline" style={{ ...LOOK.readout, fontWeight: 700 }}>
          {w.headline}
        </p>
        <p style={LOOK.text}>{w.area}</p>
        {fromYou !== null &&
          (fromYou.ok ? (
            <p data-testid="from-you" style={LOOK.readout}>
              {fromYou.value}
            </p>
          ) : (
            <FailureNotice failure={fromYou} />
          ))}
        <p style={LOOK.text}>{w.basis}</p>
        <p style={LOOK.text}>{w.geometry}</p>
        {w.warnings.map((warning) => (
          <p key={warning} style={{ ...LOOK.text, color: LOOK.alertText.color }}>
            {warning}
          </p>
        ))}
      </section>
    </>
  );
}
