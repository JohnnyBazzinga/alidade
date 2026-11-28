// Where the sights come from (Req 13.1): shown only when the browser has the orientation event, so
// that a phone can also use the simulation and a laptop never needs this control. Mira draws it as
// two segments in a pale pill, the chosen one dark (Req 16.3; the author's design of 2026-11-28).

import { BODY_FONT_STACK, ROLE_VARS } from '@alidade/ui';
import type { NoniusMode } from './environment';
import { LOOK } from './look';

export interface ModeControlProps {
  readonly mode: NoniusMode;
  readonly onModeChange: (mode: NoniusMode) => void;
}

/** The segments' height (Mira: 46, in a pill of 4 around them). */
const SEGMENT_PX = 46;

export function ModeControl({ mode, onModeChange }: ModeControlProps) {
  const option = (which: NoniusMode, label: string) => {
    const chosen = mode === which;
    return (
      <button
        type="button"
        aria-pressed={chosen}
        onClick={() => {
          if (!chosen) onModeChange(which);
        }}
        style={{
          minHeight: SEGMENT_PX,
          minWidth: 0,
          padding: '0 8px',
          border: 'none',
          borderRadius: SEGMENT_PX / 2,
          background: chosen ? ROLE_VARS.ink : 'transparent',
          color: chosen ? ROLE_VARS.card : ROLE_VARS.ink,
          fontFamily: BODY_FONT_STACK,
          fontSize: 15,
          fontWeight: chosen ? 800 : 600,
          cursor: 'pointer',
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      data-testid="mode-control"
      role="group"
      aria-label="Where the sights come from"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}
    >
      <p style={{ ...LOOK.dim, fontSize: 13 }}>Where the sights come from</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 4,
          padding: 4,
          borderRadius: (SEGMENT_PX + 8) / 2,
          background: ROLE_VARS.raised,
        }}
      >
        {option('device', 'This phone')}
        {option('simulation', 'Simulator')}
      </div>
    </div>
  );
}
