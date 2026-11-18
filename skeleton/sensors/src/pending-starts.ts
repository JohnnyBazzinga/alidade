// The waiting starts of one kind (orientation or position) and their deadlines (design D21).
// Internal; the browser Adapter and the Simulator share it. Each source keeps one timer per kind,
// set for `nextDeadlineUtcMs()`, and calls `settleExpired` when it fires.

interface Waiting<T> {
  readonly deadlineUtcMs: number;
  readonly resolve: (value: T) => void;
}

export class PendingStarts<T> {
  #waiting: Waiting<T>[] = [];

  /** A start that settles with the next value, or when `deadlineUtcMs` has passed. */
  add(deadlineUtcMs: number): Promise<T> {
    return new Promise<T>((resolve) => {
      this.#waiting.push({ deadlineUtcMs, resolve });
    });
  }

  /** Settles every waiting start with `value`. */
  settleAll(value: T): void {
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const start of waiting) start.resolve(value);
  }

  /** Settles the starts whose deadline is at or before `nowUtcMs` with `value`. */
  settleExpired(nowUtcMs: number, value: T): void {
    const expired = this.#waiting.filter((start) => start.deadlineUtcMs <= nowUtcMs);
    this.#waiting = this.#waiting.filter((start) => start.deadlineUtcMs > nowUtcMs);
    for (const start of expired) start.resolve(value);
  }

  /** The earliest deadline still waiting, or `undefined`. */
  nextDeadlineUtcMs(): number | undefined {
    let next: number | undefined;
    for (const start of this.#waiting) {
      if (next === undefined || start.deadlineUtcMs < next) next = start.deadlineUtcMs;
    }
    return next;
  }

  get size(): number {
    return this.#waiting.length;
  }
}
