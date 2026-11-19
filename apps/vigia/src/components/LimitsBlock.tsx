// The limits beside every Bearing and every Fix (Req 6.3, 16.1): UI's limits note, and with a Fix
// the assumption under which its ellipse is a 95 % region.

import { LimitsNote } from '@alidade/ui';
import { FIX_ASSUMPTION_TEXT } from '../math/texts';
import { LOOK } from './look';

export function LimitsBlock({ withFix }: { readonly withFix: boolean }) {
  return (
    <div data-testid="limits-block" style={LOOK.stack}>
      {withFix && <p style={LOOK.dim}>{FIX_ASSUMPTION_TEXT}</p>}
      <LimitsNote />
    </div>
  );
}
