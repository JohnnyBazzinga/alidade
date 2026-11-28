// The Calibration in use as Mira draws it (Req 9.3, 16.3; the author's design of 2026-11-28): with
// no Index error, a warning card, its icon, the first sentence as its title and the rest under it;
// with one, a white card with the Index error in the numeric font. The controls that change it
// (measure, remove) come under the words, inside the card. The words are the formatter's, whole.
import { Icon, ROLE_VARS } from '@alidade/ui';
import type { ReactNode } from 'react';
import { leadAndRest } from '../math/fix/fix-words';
import { LOOK } from './look';

export interface CalibrationCardProps {
  /** The Calibration in use in words (`calibrationText`). */
  readonly text: string;
  /** The phone's altitude was never calibrated: the warning card. */
  readonly uncalibrated: boolean;
  readonly children?: ReactNode;
}

export function CalibrationCard({ text, uncalibrated, children }: CalibrationCardProps) {
  if (!uncalibrated) {
    return (
      <section data-testid="calibration-line" style={LOOK.card}>
        <p style={LOOK.readout}>{text}</p>
        {children}
      </section>
    );
  }
  const [lead, rest] = leadAndRest(text);
  return (
    <section data-testid="calibration-line" role="note" style={LOOK.alertPanel}>
      <div style={{ display: 'flex', gap: 12 }}>
        <Icon
          name="warning"
          style={{ flex: '0 0 auto', width: 22, height: 22, marginTop: 1, color: ROLE_VARS.ink }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <p style={LOOK.cardTitle}>{lead}</p>
          {rest !== '' && (
            <p style={{ ...LOOK.alertText, fontSize: 13, lineHeight: 1.45 }}>{rest}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
