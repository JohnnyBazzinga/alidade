// The default Timer of the Playground (Req 1.5, design D9): the one module of the package that
// calls `setInterval` and `clearInterval`. Everything else waits through an injected Timer.

import type { Timer, TimerHandle } from '../src/index';

const handles = new Map<number, ReturnType<typeof setInterval>>();
let nextId = 1;

export const systemTimer: Timer = {
  start(callback, intervalMs): TimerHandle {
    const id = nextId;
    nextId += 1;
    handles.set(id, setInterval(callback, intervalMs));
    return { id };
  },
  stop(handle) {
    const interval = handles.get(handle.id);
    if (interval !== undefined) clearInterval(interval);
    handles.delete(handle.id);
  },
};
