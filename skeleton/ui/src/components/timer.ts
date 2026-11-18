// The Timer (design D9): the only way the Components layer waits. It repeats; a one-shot is a
// `start` whose callback calls `stop`. The Playground provides the one implementation over
// `setInterval` (`playground/system-timer.ts`); tests use `FakeTimer`.

/** An opaque handle of a started Timer. */
export interface TimerHandle {
  readonly id: number;
}

export interface Timer {
  /** Calls `callback` every `intervalMs` until stopped. */
  start(callback: () => void, intervalMs: number): TimerHandle;
  /** Stops the callback of `handle`; stopping twice does nothing. */
  stop(handle: TimerHandle): void;
}
