// A Timer for tests (design D9; test support, not exported): time moves only by `advance(ms)`,
// which runs every due callback in order of its due time.

import type { Timer, TimerHandle } from '../components/timer';

interface Entry {
  readonly id: number;
  readonly callback: () => void;
  readonly intervalMs: number;
  dueMs: number;
}

export class FakeTimer implements Timer {
  private nowMs = 0;
  private nextId = 1;
  private readonly entries = new Map<number, Entry>();

  start(callback: () => void, intervalMs: number): TimerHandle {
    const id = this.nextId;
    this.nextId += 1;
    const step = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 1;
    this.entries.set(id, { id, callback, intervalMs: step, dueMs: this.nowMs + step });
    return { id };
  }

  stop(handle: TimerHandle): void {
    this.entries.delete(handle.id);
  }

  /** The number of Timers running. */
  running(): number {
    return this.entries.size;
  }

  /** Moves time forward by `ms`, running each callback as it falls due. */
  advance(ms: number): void {
    const endMs = this.nowMs + ms;
    for (;;) {
      let next: Entry | undefined;
      for (const entry of this.entries.values()) {
        if (entry.dueMs <= endMs && (next === undefined || entry.dueMs < next.dueMs)) next = entry;
      }
      if (next === undefined) break;
      this.nowMs = next.dueMs;
      next.dueMs += next.intervalMs;
      next.callback();
    }
    this.nowMs = endMs;
  }
}
