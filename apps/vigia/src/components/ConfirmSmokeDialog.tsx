// The question after a capture (Req 4.3, 22.9; design D25.7): a view of its own, under the compact
// header "New sighting". Today's title and sentence; the two answers as large option buttons of one
// style, each with its icon, neither preselected, each acting on one tap (the lead's departure (d)
// from the reference, Req 22.1); the Bearing card, its value with its North word and its 1-sigma by
// the one rule of Req 3.6, each labelled; "Why this accuracy?" in place; and Back.

import { CaptureSummary, Icon, ROLE_VARS, SIZES, type CapturedResult } from '@alidade/ui';
import { directionText, sigmaHeadlineText } from '../math/fix/format';
import type { VigiaFailure } from '../result';
import { BEARING_LABEL, QUESTION_TITLE, TWO_SMOKES_TEXT, UNCERTAINTY_LABEL } from '../math/texts';
import { FailureNotice } from './FailureNotice';
import { useHeader } from './header-context';
import { LOOK } from './look';
import { useOpenAtTop } from './use-open-at-top';

export type SmokeAnswer = 'same' | 'new';

export interface ConfirmSmokeDialogProps {
  readonly captured: CapturedResult;
  readonly failure: VigiaFailure | null;
  readonly onAnswer: (answer: SmokeAnswer) => void;
  /** Leaves without saving the capture. */
  readonly onBack: () => void;
}

const label = { ...LOOK.dim, fontSize: 16, lineHeight: 1.25 } as const;

export function ConfirmSmokeDialog({
  captured,
  failure,
  onAnswer,
  onBack,
}: ConfirmSmokeDialogProps) {
  const ref = useOpenAtTop<HTMLElement>('question');
  useHeader({ variant: 'compact', title: QUESTION_TITLE });
  const answer = (which: SmokeAnswer, words: string, icon: 'smoke' | 'pins') => (
    <button
      type="button"
      data-answer={which}
      onClick={() => onAnswer(which)}
      style={LOOK.optionButton}
    >
      <span style={LOOK.iconTile}>
        <Icon name={icon} />
      </span>
      {words}
    </button>
  );
  const bearing = captured.kind === 'bearing' ? captured.bearing : null;
  const direction =
    bearing === null ? null : directionText(bearing.azimuthRad, bearing.azimuthSigmaRad);
  return (
    <section
      ref={ref}
      role="group"
      data-testid="confirm-smoke"
      style={{ ...LOOK.stack, gap: SIZES.gapPx * 1.5 }}
    >
      <div style={LOOK.card}>
        <h2 style={LOOK.title}>Is this the same smoke as before?</h2>
        <p style={LOOK.text}>{TWO_SMOKES_TEXT}</p>
      </div>
      {failure !== null && <FailureNotice failure={failure} />}
      <div data-part="answers" style={{ ...LOOK.stack, gap: SIZES.gapPx * 1.5 }}>
        {answer('same', 'The same smoke', 'smoke')}
        {answer('new', 'A different smoke', 'pins')}
      </div>
      {bearing !== null && direction !== null && direction.ok && (
        <section data-testid="bearing-card" style={LOOK.card}>
          <div style={{ display: 'flex', gap: SIZES.gapPx * 2, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 auto' }}>
              <span data-part="bearing-label" style={label}>
                {BEARING_LABEL}
              </span>
              <span data-part="bearing-value" style={{ ...LOOK.readout, fontWeight: 700 }}>
                <Icon
                  name="navigation"
                  style={{
                    display: 'inline-block',
                    verticalAlign: '-5px',
                    marginRight: 8,
                    color: ROLE_VARS.accent,
                  }}
                />
                {direction.value.split(' ± ')[0]} true
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 auto' }}>
              <span data-part="sigma-label" style={label}>
                {UNCERTAINTY_LABEL}
              </span>
              <span data-part="sigma-value" style={{ ...LOOK.readout, fontWeight: 700 }}>
                {sigmaHeadlineText(bearing.azimuthSigmaRad)}
              </span>
            </div>
          </div>
          <CaptureSummary
            result={captured}
            compact
            showHeadline={false}
            sigmaText={sigmaHeadlineText}
          />
        </section>
      )}
      {bearing === null && (
        <CaptureSummary result={captured} compact sigmaText={sigmaHeadlineText} />
      )}
      <button type="button" onClick={onBack} style={LOOK.button}>
        <Icon name="chevron-left" />
        Back
      </button>
    </section>
  );
}
