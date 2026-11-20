import { describe, expect, it, vi } from 'vitest';
import { fixedSize } from './fixed-size';

describe('fixedSize', () => {
  it('tells the listener the size once, at once, and the stop does nothing', () => {
    const listener = vi.fn();
    const stop = fixedSize(390, 844)({} as unknown as HTMLElement, listener);
    expect(listener).toHaveBeenCalledExactlyOnceWith({ widthPx: 390, heightPx: 844 });
    expect(stop()).toBeUndefined();
  });
});
