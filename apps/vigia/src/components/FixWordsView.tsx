// The Fix in words (Req 6.1 to 6.4, 6.7, 6.11, 6.12, design §7.8, D23.5): built from a Core `Fix`,
// which always has its Ellipse, so no position reaches this component without its uncertainty.
// Two parts, because the first screen of a smoke with a Fix was 287 words long:
//   - `first`: a disagreement (in the alert's colour, first), the position with its 95 % radius in
//     one sentence, how many sightings it rests on, and every warning that applies, poor geometry
//     with its sentence included;
//   - `details`: the 95 % area, what it rests on with the ages and the number set aside, the
//     distance from this phone with its interval, the geometry sentence when the class is not
//     `poor`, and what the ellipse does and does not say.

import type { Fix } from '@alidade/core';
import { useMemo } from 'react';
import type { Assessment } from '../math/assessment/assess';
import { fixWords } from '../math/fix/fix-words';
import { fromYouWords } from '../math/fix/from-you';
import { geometryClass } from '../math/fix/geometry-class';
import type { VigiaParameters } from '../math/parameters';
import { FailureNotice } from './FailureNotice';
import { ROLE_VARS } from '@alidade/ui';
import { IconRow, InlineIcon } from './cards/parts';
import { LOOK } from './look';
import type { OwnPosition } from './store';

export interface FixWordsViewProps {
  readonly fix: Fix;
  readonly assessment: Assessment;
  readonly nowUtcMs: number;
  readonly ownPosition: OwnPosition | null;
  readonly parameters: VigiaParameters;
  readonly part: 'first' | 'details';
}

export function FixWordsView({
  fix,
  assessment,
  nowUtcMs,
  ownPosition,
  parameters,
  part,
}: FixWordsViewProps) {
  const words = useMemo(
    () => fixWords(fix, assessment, nowUtcMs, parameters),
    [fix, assessment, nowUtcMs, parameters],
  );
  const fromYou = useMemo(
    () => (ownPosition === null ? null : fromYouWords(fix, ownPosition.position, parameters)),
    [fix, ownPosition, parameters],
  );
  const geometry = useMemo(() => geometryClass(fix, parameters), [fix, parameters]);
  if (!words.ok) return part === 'first' ? <FailureNotice failure={words} /> : null;
  const w = words.value;
  const poor = geometry.ok && geometry.value === 'poor';
  const used = assessment.used.length;
  if (part === 'first') {
    return (
      <>
        {w.disagreement !== null && (
          <div style={LOOK.alertPanel}>
            <p data-testid="disagreement" style={LOOK.alertText}>
              <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
              {w.disagreement}
            </p>
          </div>
        )}
        {/* The Fix card (Req 22.6): the position with its 95 % radius and how many it rests on. */}
        <section data-testid="fix-words" style={LOOK.card}>
          <IconRow icon="pin">
            <p data-testid="fix-headline" style={{ ...LOOK.readout, fontWeight: 700 }}>
              {w.headline}
            </p>
          </IconRow>
          <IconRow icon="pins">
            <p data-testid="first-basis" style={LOOK.text}>
              {`Based on ${used} ${used === 1 ? 'sighting' : 'sightings'}.`}
            </p>
          </IconRow>
        </section>
        {w.warnings.map((warning) => (
          <div key={warning} style={LOOK.statusCard('warning')}>
            <p data-part="warning" style={LOOK.alertText}>
              <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
              {warning}
            </p>
          </div>
        ))}
        {poor && (
          <div style={LOOK.statusCard('warning')}>
            <p data-part="poor-geometry" style={LOOK.alertText}>
              <InlineIcon name="warning" colour={ROLE_VARS.warnIcon} />
              {w.geometry}
            </p>
          </div>
        )}
      </>
    );
  }
  return (
    <>
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
      {!poor && <p style={LOOK.text}>{w.geometry}</p>}
    </>
  );
}
