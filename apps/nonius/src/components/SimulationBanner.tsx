// The banner at the top of every screen in Simulation mode (Req 13.1), in the page's flow: it
// never covers a control.

import { COLOURS, SIZES } from '@alidade/ui';
import { LOOK } from './look';

export const SIMULATION_TEXT =
  'Simulation: the Sun, the sights and the places on this page are made up. Nothing here is a real position.';

export function SimulationBanner() {
  return (
    <p
      role="status"
      data-testid="simulation-banner"
      style={{
        ...LOOK.text,
        fontWeight: 700,
        padding: SIZES.gapPx,
        color: COLOURS.brassInk,
        background: COLOURS.brass,
      }}
    >
      {SIMULATION_TEXT}
    </p>
  );
}
