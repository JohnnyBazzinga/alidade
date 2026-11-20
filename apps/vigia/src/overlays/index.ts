// The one registration point of the Overlays (design D15, Req 1.10). The wind Overlay is the only
// one of the first release; the hotspot Overlay is the second release. To cut the wind Overlay,
// delete `./wind/` and its line here. Only `src/App.tsx` imports this module; the cut build
// replaces it by `src/overlays-empty.ts`.

import type { OverlayDefinition } from './shared/math/overlay-types';
import { WIND_DEFINITION } from './wind/components/wind-definition';

export const OVERLAYS: readonly OverlayDefinition[] = [WIND_DEFINITION];
