// An `ObserveElementSize` for tests (test support, not exported): jsdom does no layout, so the test
// says how big the element is and can resize it, as the UI's own test support does.

import type { ObserveElementSize } from '@alidade/ui';
import { act } from '@testing-library/react';

interface Size {
  readonly widthPx: number;
  readonly heightPx: number;
}

export function fakeObserver(initial: Size): {
  observe: ObserveElementSize;
  resize(size: Size): void;
} {
  const listeners = new Set<(size: Size) => void>();
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
  };
}
