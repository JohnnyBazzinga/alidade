// The question after a capture, with a smoke open (Req 4.3, as amended 2026-11-21): a view of its
// own, which replaces the camera and the readout. Its two answers are fully visible, the
// preselected one primary (the same smoke when the open smoke's newest sighting is within the
// maximum Incident age, a different one otherwise), and the breakdown of the bearing is under "Why
// this accuracy?" below them. With no smoke open there is no question: the Capture starts the
// smoke (Req 4.2), so this view is never rendered then.

import { CaptureSummary, type CapturedResult } from '@alidade/ui';
import type { VigiaFailure } from '../result';
import { TWO_SMOKES_TEXT } from '../math/texts';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';
import { useOpenAtTop } from './use-open-at-top';

export type SmokeAnswer = 'same' | 'new';

export interface ConfirmSmokeDialogProps {
  readonly preselected: SmokeAnswer;
  readonly captured: CapturedResult;
  readonly failure: VigiaFailure | null;
  readonly onAnswer: (answer: SmokeAnswer) => void;
  /** Leaves without saving the capture. */
  readonly onBack: () => void;
}

export function ConfirmSmokeDialog({
  preselected,
  captured,
  failure,
  onAnswer,
  onBack,
}: ConfirmSmokeDialogProps) {
  const ref = useOpenAtTop<HTMLElement>('question');
  const answer = (which: SmokeAnswer, label: string) => (
    <button
      type="button"
      data-preselected={preselected === which ? 'true' : 'false'}
      {...(preselected === which ? { 'data-primary': 'true' } : {})}
      onClick={() => onAnswer(which)}
      style={preselected === which ? LOOK.primaryButton : { ...LOOK.button, width: '100%' }}
    >
      {label}
    </button>
  );
  return (
    <section ref={ref} role="group" data-testid="confirm-smoke" style={LOOK.panel}>
      <h2 style={LOOK.title}>Is this the same smoke as before?</h2>
      <p style={LOOK.text}>{TWO_SMOKES_TEXT}</p>
      {failure !== null && <FailureNotice failure={failure} />}
      <div style={LOOK.stack}>
        {answer('same', 'The same smoke')}
        {answer('new', 'A different smoke')}
      </div>
      <CaptureSummary result={captured} compact />
      <button type="button" onClick={onBack} style={LOOK.button}>
        Back
      </button>
    </section>
  );
}
