// The Overlays module of the cut build (design D21, Req 1.10): no Overlay. The `no-overlays` test
// project aliases `src/overlays/index.ts` to this file, and every test but the Overlays' own runs
// against it.

import type { OverlayDefinition } from './overlays/shared/math/overlay-types';

export const OVERLAYS: readonly OverlayDefinition[] = [];
