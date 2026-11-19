// The banner at the top of every screen in Simulation mode (design §9, Req 17.4), in the page's
// flow: it never covers a control.

import { COLOURS, SIZES } from '@alidade/ui';
import { SIMULATION_BANNER_TEXT } from '../math/texts';
import { LOOK } from './look';

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
      {SIMULATION_BANNER_TEXT}
    </p>
  );
}
