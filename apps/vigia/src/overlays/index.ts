// The one registration point of the Overlays (design D15, Req 1.10). The wind Overlay joins this
// list in task group 17; the hotspot Overlay is the second release. Only `src/App.tsx` imports
// this module; the cut build replaces it by `src/overlays-empty.ts`.

import type { OverlayDefinition } from './shared/math/overlay-types';

export const OVERLAYS: readonly OverlayDefinition[] = [];
