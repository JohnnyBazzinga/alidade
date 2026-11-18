// An `ObserveElementSize` for tests (design D22; test support, not exported): jsdom does no
// layout, so the test says how big the element is and can resize it.

import { act } from '@testing-library/react';
import type { ObserveElementSize } from '../components/dom-size';
import type { PixelSize } from '../math/image-layout';

export function fakeObserver(initial: PixelSize): {
  observe: ObserveElementSize;
  resize(size: PixelSize): void;
  listeners(): number;
} {
  const listeners = new Set<(size: PixelSize) => void>();
  return {
    observe: (_element, listener) => {
      listeners.add(listener);
      listener(initial);
      return () => void listeners.delete(listener);
    },
    resize(size) {
      act(() => {
        for (const l of [...listeners]) l(size);
      });
    },
    listeners: () => listeners.size,
  };
}
