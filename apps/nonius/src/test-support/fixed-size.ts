// An element of a fixed size, for UI's `observe` (test support, not exported): jsdom does no layout.

import type { ObserveElementSize } from '@alidade/ui';

export function fixedSize(widthPx: number, heightPx: number): ObserveElementSize {
  return (_element, listener) => {
    listener({ widthPx, heightPx });
    return () => undefined;
  };
}
