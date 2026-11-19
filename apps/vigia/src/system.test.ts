// The default Timer (Req 1.5): the one module with `setInterval`. Checked with Vitest's fake
// timers, so that no real time passes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { systemTimer } from './system';

describe('systemTimer (Req 1.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls back every interval until stopped, and stopping twice does nothing', () => {
    let calls = 0;
    const handle = systemTimer.start(() => {
      calls += 1;
    }, 1000);
    vi.advanceTimersByTime(3500);
    expect(calls).toBe(3);
    systemTimer.stop(handle);
    systemTimer.stop(handle);
    vi.advanceTimersByTime(5000);
    expect(calls).toBe(3);
  });

  it('gives each start its own handle', () => {
    const a = systemTimer.start(() => undefined, 10);
    const b = systemTimer.start(() => undefined, 10);
    expect(a.id).not.toBe(b.id);
    systemTimer.stop(a);
    systemTimer.stop(b);
  });
});
