// The cut test (design D21, Req 1.10): in the `no-overlays` project the registry `src/overlays`
// is the empty module `src/overlays-empty.ts`, and in every other project it is the real one.

import { describe, expect, inject, it } from 'vitest';
import { OVERLAYS } from '../overlays';
import { OVERLAYS as CUT } from '../overlays-empty';

describe('the Overlays registry (D21)', () => {
  it('is the empty module exactly when the Overlays are cut', () => {
    if (inject('overlaysCut')) expect(OVERLAYS).toBe(CUT);
    else expect(OVERLAYS).not.toBe(CUT);
    expect(CUT).toEqual([]);
  });
});
