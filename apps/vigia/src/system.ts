// The defaults of the Clock and the Timer (Req 1.5, design §2, §5): the one module that names
// `setInterval` and `clearInterval`. The Clock is Sensors' `systemClock`, passed on from here so
// that the composition root takes both defaults from one place. Everything else receives them
// injected.

import type { Timer, TimerHandle } from '@alidade/ui';

export { systemClock } from '@alidade/sensors';

const running = new Map<number, ReturnType<typeof setInterval>>();
let nextId = 1;

export const systemTimer: Timer = {
  start(callback, intervalMs): TimerHandle {
    const id = nextId;
    nextId += 1;
    running.set(id, setInterval(callback, intervalMs));
    return { id };
  },
  stop(handle) {
    const interval = running.get(handle.id);
    if (interval === undefined) return;
    clearInterval(interval);
    running.delete(handle.id);
  },
};
