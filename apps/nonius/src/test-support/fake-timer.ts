// A Timer for tests (design D3; test support, not exported): time moves only by `advance(ms)`,
// which runs every due callback in order of its due time. Copied from UI's, with `nowMs()` added
// for the tests of the store and the Transports.

import type { Timer, TimerHandle } from '@alidade/ui';

interface Entry {
  readonly id: number;
  readonly callback: () => void;
  readonly intervalMs: number;
  dueMs: number;
}

export class FakeTimer implements Timer {
  private currentMs = 0;
  private nextId = 1;
  private readonly entries = new Map<number, Entry>();

  start(callback: () => void, intervalMs: number): TimerHandle {
    const id = this.nextId;
    this.nextId += 1;
    const step = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 1;
    this.entries.set(id, { id, callback, intervalMs: step, dueMs: this.currentMs + step });
    return { id };
  }

  stop(handle: TimerHandle): void {
    this.entries.delete(handle.id);
  }

  /** The number of Timers running. */
  running(): number {
    return this.entries.size;
  }

  /** Milliseconds of fake time that have passed. */
  nowMs(): number {
    return this.currentMs;
  }

  /** Moves time forward by `ms`, running each callback as it falls due. */
  advance(ms: number): void {
    const endMs = this.currentMs + ms;
    for (;;) {
      let next: Entry | undefined;
      for (const entry of this.entries.values()) {
        if (entry.dueMs <= endMs && (next === undefined || entry.dueMs < next.dueMs)) next = entry;
      }
      if (next === undefined) break;
      this.currentMs = next.dueMs;
      next.dueMs += next.intervalMs;
      next.callback();
    }
    this.currentMs = endMs;
  }
}
