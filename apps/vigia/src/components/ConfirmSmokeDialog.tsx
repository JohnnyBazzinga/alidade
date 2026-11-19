// The question after a capture (Req 4.2, 4.3): which smoke this sighting is of. Nothing is added
// until the user answers. With a smoke open, both answers are offered and the preselected one is
// the primary control: "the same smoke" when the open smoke's newest sighting is within the
// maximum Incident age, "a different smoke" otherwise. With none open, the one answer starts a
// smoke, so that no smoke is started without the user's act.

import type { VigiaFailure } from '../result';
import { TWO_SMOKES_TEXT } from '../math/texts';
import { FailureNotice } from './FailureNotice';
import { LOOK } from './look';

export type SmokeAnswer = 'same' | 'new';

export interface ConfirmSmokeDialogProps {
  /** `null` when no smoke is open. */
  readonly preselected: SmokeAnswer | null;
  readonly failure: VigiaFailure | null;
  readonly onAnswer: (answer: SmokeAnswer) => void;
}

export function ConfirmSmokeDialog({ preselected, failure, onAnswer }: ConfirmSmokeDialogProps) {
  const answer = (which: SmokeAnswer, label: string) => (
    <button
      type="button"
      data-preselected={preselected === which ? 'true' : 'false'}
      onClick={() => onAnswer(which)}
      style={preselected === which ? LOOK.primaryButton : { ...LOOK.button, width: '100%' }}
    >
      {label}
    </button>
  );
  return (
    <section role="group" data-testid="confirm-smoke" style={LOOK.panel}>
      {preselected === null ? (
        <>
          <h2 style={LOOK.title}>Keep this sighting</h2>
          <p style={LOOK.text}>This sighting starts a new smoke on this phone.</p>
          {failure !== null && <FailureNotice failure={failure} />}
          <button
            type="button"
            data-preselected="true"
            onClick={() => onAnswer('new')}
            style={LOOK.primaryButton}
          >
            Start a new smoke with this sighting
          </button>
        </>
      ) : (
        <>
          <h2 style={LOOK.title}>Is this the same smoke as before?</h2>
          <p style={LOOK.text}>{TWO_SMOKES_TEXT}</p>
          {failure !== null && <FailureNotice failure={failure} />}
          <div style={LOOK.stack}>
            {answer('same', 'The same smoke')}
            {answer('new', 'A different smoke')}
          </div>
        </>
      )}
    </section>
  );
}
