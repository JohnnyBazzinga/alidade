// Where the sights come from (Req 13.1): shown only when the browser has the orientation event, so
// that a phone can also use the simulation and a laptop never needs this control.

import { COLOURS } from '@alidade/ui';
import type { NoniusMode } from './environment';
import { LOOK } from './look';

export interface ModeControlProps {
  readonly mode: NoniusMode;
  readonly onModeChange: (mode: NoniusMode) => void;
}

export function ModeControl({ mode, onModeChange }: ModeControlProps) {
  const option = (which: NoniusMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === which}
      onClick={() => {
        if (mode !== which) onModeChange(which);
      }}
      style={{
        ...LOOK.button,
        flex: '1 1 0',
        border: `1px solid ${mode === which ? COLOURS.brass : COLOURS.rule}`,
        color: mode === which ? COLOURS.brass : COLOURS.ink,
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      data-testid="mode-control"
      role="group"
      aria-label="Where the sights come from"
      style={LOOK.stack}
    >
      <p style={LOOK.dim}>Where the sights come from</p>
      <div style={LOOK.controls}>
        {option('device', 'This phone')}
        {option('simulation', 'Simulator')}
      </div>
    </div>
  );
}
