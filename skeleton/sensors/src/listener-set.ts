// Isolated delivery to the listeners of one kind (Req 11.11, design D22). Internal; the browser
// Adapter and the Simulator share it.

export type Unsubscribe = () => void;

/**
 * The listeners of one kind. `deliver` calls each listener registered when delivery starts, in
 * registration order, over a copy of the set, so a listener that unsubscribes itself or another
 * during delivery does not disturb the loop. Each call is isolated: a value a listener throws goes
 * to the error callback, when one was given, and the other listeners still receive the value. A
 * value the error callback itself throws is dropped. The source keeps running in every case.
 */
export class ListenerSet<T> {
  readonly #listeners = new Set<(value: T) => void>();
  readonly #onListenerError: ((error: unknown) => void) | undefined;

  constructor(onListenerError?: (error: unknown) => void) {
    this.#onListenerError = onListenerError;
  }

  add(listener: (value: T) => void): Unsubscribe {
    // A wrapper, so that adding the same function twice gives two independent registrations.
    const registration = (value: T): void => listener(value);
    this.#listeners.add(registration);
    return () => {
      this.#listeners.delete(registration);
    };
  }

  deliver(value: T): void {
    for (const listener of [...this.#listeners]) {
      if (!this.#listeners.has(listener)) continue; // unsubscribed earlier in this delivery
      try {
        listener(value);
      } catch (error) {
        this.#report(error);
      }
    }
  }

  get size(): number {
    return this.#listeners.size;
  }

  #report(error: unknown): void {
    if (this.#onListenerError === undefined) return;
    try {
      this.#onListenerError(error);
    } catch {
      // Dropped (Req 11.11): an error callback that throws cannot stop delivery.
    }
  }
}
