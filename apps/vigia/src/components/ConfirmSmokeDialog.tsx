// The question after a capture (Req 4.3, 22.9; design D25.7): a view of its own, under the compact
// header "New sighting". Today's title and sentence; the two answers as large option buttons of one
// style, each with its icon, neither preselected, each acting on one tap (the lead's departure (d)
// from the reference, Req 22.1); the Bearing card, its value with its North word and its 1-sigma by
// the one rule of Req 3.6, each labelled; "Why this accuracy?" in place; and Back.

import { CaptureSummary, Icon, ROLE_VARS, SIZES, type CapturedResult } from '@alidade/ui';
import { directionText, sigmaHeadlineText } from '../math/fix/format';
import type { VigiaFailure } from '../result';
import {
  BEARING_LABEL,
  DISCARD_CAPTURE_LABEL,
  QUESTION_CAPTION,
  TWO_SMOKES_TEXT,
  UNCERTAINTY_LABEL,
} from '../math/texts';
import { FailureNotice } from './FailureNotice';
import { useHeader } from './header-context';
import { LOOK, SHAPE } from './look';
import { useOpenAtTop } from './use-open-at-top';

export type SmokeAnswer = 'same' | 'new';

export interface ConfirmSmokeDialogProps {
  readonly captured: CapturedResult;
  readonly failure: VigiaFailure | null;
  readonly onAnswer: (answer: SmokeAnswer) => void;
  /** Leaves without saving the capture. */
  readonly onBack: () => void;
}

const label = { ...LOOK.caption, fontSize: 11 } as const;
const value = {
  ...LOOK.numeral,
  fontSize: 28,
  letterSpacing: '-0.8px',
  whiteSpace: 'nowrap',
} as const;

export function ConfirmSmokeDialog({
  captured,
  failure,
  onAnswer,
  onBack,
}: ConfirmSmokeDialogProps) {
  const ref = useOpenAtTop<HTMLElement>('question');
  useHeader({ variant: 'none' });
  const answer = (which: SmokeAnswer, words: string, icon: 'smoke' | 'pins') => (
    <button
      type="button"
      data-answer={which}
      onClick={() => onAnswer(which)}
      style={LOOK.optionButton}
    >
      <span style={LOOK.optionIcon}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={LOOK.caption}>{QUESTION_CAPTION}</p>
        <h2 style={{ ...LOOK.title, fontSize: 30, lineHeight: 1.08, letterSpacing: '-1px' }}>
          Is this the same smoke as before?
        </h2>
        <p style={{ ...LOOK.dim, fontSize: 14 }}>{TWO_SMOKES_TEXT}</p>
      </div>
      {failure !== null && <FailureNotice failure={failure} />}
      <div data-part="answers" style={{ ...LOOK.stack, gap: SIZES.gapPx * 1.5 }}>
        {answer('same', 'The same smoke', 'smoke')}
        {answer('new', 'A different smoke', 'pins')}
      </div>
      {bearing !== null && direction !== null && direction.ok && (
        <section data-testid="bearing-card" style={LOOK.card}>
          {/* The two values side by side on one tinted band, a rule between them. */}
          <div
            data-part="values"
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              padding: '14px 0',
              background: ROLE_VARS.raised,
              borderRadius: SHAPE.tileRadius,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                flex: '1 1 auto',
                padding: '0 14px',
              }}
            >
              <span data-part="bearing-label" style={label}>
                {BEARING_LABEL}
              </span>
              <span data-part="bearing-value" style={value}>
                {direction.value.split(' ± ')[0]} <span style={LOOK.caption}>true</span>
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                flex: '0 1 auto',
                minWidth: 0,
                padding: '0 14px',
                borderLeft: `1px solid ${ROLE_VARS.rule}`,
              }}
            >
              <span data-part="sigma-label" style={label}>
                {/* Never broken inside "(1-sigma)": the label wraps at its space only. */}
                {UNCERTAINTY_LABEL.slice(0, UNCERTAINTY_LABEL.lastIndexOf(' '))}{' '}
                <span style={{ whiteSpace: 'nowrap' }}>
                  {UNCERTAINTY_LABEL.slice(UNCERTAINTY_LABEL.lastIndexOf(' ') + 1)}
                </span>
              </span>
              <span data-part="sigma-value" style={value}>
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
      <button type="button" data-part="discard" onClick={onBack} style={LOOK.button}>
        <Icon name="trash" />
        {DISCARD_CAPTURE_LABEL}
      </button>
    </section>
  );
}
