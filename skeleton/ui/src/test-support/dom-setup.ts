// Setup of the `components` project (test support, not exported): unmounts what each test
// rendered, and gives jsdom a `PointerEvent` if it has none.

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(globalThis, 'PointerEvent', { value: PointerEventPolyfill });
}
