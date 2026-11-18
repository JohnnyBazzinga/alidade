// An in-memory browser for the Adapter's example tests (Req 13.2, 13.5): it records every call,
// lets a test dispatch events and advance time, and counts what is still live. Synthetic only.

import type {
  BrowserEnvironment,
  GeolocationLike,
  WindowEventType,
} from '../browser/browser-environment';

interface Timer {
  readonly id: number;
  readonly atUtcMs: number;
  readonly callback: () => void;
}

interface Watch {
  readonly id: number;
  readonly onReading: (position: unknown) => void;
  readonly onError: (error: unknown) => void;
  readonly options: unknown;
}

export interface FakeBrowserOptions {
  isSecureContext?: boolean;
  hasDeviceOrientation?: boolean;
  supportsAbsoluteOrientation?: boolean;
  /** `null`: no `requestPermission` (Android, desktop). Otherwise what it resolves to, or `'reject'`. */
  permission?: null | 'granted' | 'denied' | 'reject';
  hasGeolocation?: boolean;
  screenAngleDeg?: number | null;
  startUtcMs?: number;
  /** Method names that throw when called, to exercise the Adapter's guards (D20). */
  throwOn?: readonly string[];
}

export class FakeBrowserEnvironment implements BrowserEnvironment {
  nowUtcMs: number;
  readonly calls: string[] = [];
  readonly isSecureContext: boolean;
  readonly hasDeviceOrientation: boolean;
  readonly supportsAbsoluteOrientation: boolean;
  readonly requestOrientationPermission: (() => Promise<unknown>) | null;
  readonly geolocation: GeolocationLike | null;
  screenAngle: number | null;
  visibility = 'visible';
  readonly watchOptions: unknown[] = [];

  readonly #windowListeners = new Map<WindowEventType, Set<(event: unknown) => void>>();
  readonly #visibilityListeners = new Set<() => void>();
  #timers: Timer[] = [];
  #watches: Watch[] = [];
  #nextId = 1;
  readonly #throwOn: ReadonlySet<string>;

  constructor(options: FakeBrowserOptions = {}) {
    this.nowUtcMs = options.startUtcMs ?? 1_790_000_000_000;
    this.isSecureContext = options.isSecureContext ?? true;
    this.hasDeviceOrientation = options.hasDeviceOrientation ?? true;
    this.supportsAbsoluteOrientation = options.supportsAbsoluteOrientation ?? false;
    this.screenAngle = options.screenAngleDeg === undefined ? 0 : options.screenAngleDeg;
    this.#throwOn = new Set(options.throwOn ?? []);
    const permission = options.permission === undefined ? null : options.permission;
    this.requestOrientationPermission =
      permission === null
        ? null
        : () => {
            this.#record('requestPermission');
            return permission === 'reject'
              ? Promise.reject(new Error('NotAllowedError'))
              : Promise.resolve(permission);
          };
    this.geolocation =
      options.hasGeolocation === false
        ? null
        : {
            watchPosition: (onReading, onError, watchOptions) => {
              this.#record('watchPosition');
              const id = this.#nextId++;
              this.#watches.push({ id, onReading, onError, options: watchOptions });
              this.watchOptions.push(watchOptions);
              return id;
            },
            clearWatch: (watchId) => {
              this.#record('clearWatch');
              this.#watches = this.#watches.filter((watch) => watch.id !== watchId);
            },
          };
  }

  /** The clock to inject into the Adapter. */
  readonly clock = (): number => {
    this.#record('clock');
    return this.nowUtcMs;
  };

  #record(name: string): void {
    this.calls.push(name);
    if (this.#throwOn.has(name)) throw new Error(`fake ${name} throws`);
  }

  addWindowListener(type: WindowEventType, listener: (event: unknown) => void): void {
    this.#record(`addWindowListener:${type}`);
    const set = this.#windowListeners.get(type) ?? new Set();
    set.add(listener);
    this.#windowListeners.set(type, set);
  }

  removeWindowListener(type: WindowEventType, listener: (event: unknown) => void): void {
    this.#record(`removeWindowListener:${type}`);
    this.#windowListeners.get(type)?.delete(listener);
  }

  addVisibilityListener(listener: () => void): void {
    this.#record('addVisibilityListener');
    this.#visibilityListeners.add(listener);
  }

  removeVisibilityListener(listener: () => void): void {
    this.#record('removeVisibilityListener');
    this.#visibilityListeners.delete(listener);
  }

  visibilityState(): string {
    this.#record('visibilityState');
    return this.visibility;
  }

  screenAngleDeg(): number | null {
    this.#record('screenAngleDeg');
    return this.screenAngle;
  }

  setTimer(callback: () => void, durationMs: number): unknown {
    this.#record('setTimer');
    const id = this.#nextId++;
    this.#timers.push({ id, atUtcMs: this.nowUtcMs + durationMs, callback });
    return id;
  }

  clearTimer(handle: unknown): void {
    this.#record('clearTimer');
    this.#timers = this.#timers.filter((timer) => timer.id !== handle);
  }

  // --- Test controls -------------------------------------------------------------------------

  /** Moves the clock forward by `durationMs`, firing every due timer at its own time, in order. */
  advance(durationMs: number): void {
    const targetUtcMs = this.nowUtcMs + durationMs;
    for (;;) {
      const due = this.#timers
        .filter((timer) => timer.atUtcMs <= targetUtcMs)
        .sort((a, b) => a.atUtcMs - b.atUtcMs || a.id - b.id)[0];
      if (due === undefined) break;
      this.#timers = this.#timers.filter((timer) => timer.id !== due.id);
      this.nowUtcMs = Math.max(this.nowUtcMs, due.atUtcMs);
      due.callback();
    }
    this.nowUtcMs = targetUtcMs;
  }

  /** Dispatches an event to the window listeners of `type`. */
  dispatch(type: WindowEventType, event: unknown = {}): void {
    for (const listener of [...(this.#windowListeners.get(type) ?? [])]) listener(event);
  }

  /** Changes `document.visibilityState` and dispatches `visibilitychange`. */
  setVisibility(state: 'visible' | 'hidden'): void {
    this.visibility = state;
    for (const listener of [...this.#visibilityListeners]) listener();
  }

  /** Delivers a reading to every live watch. */
  deliverPosition(latitude: number, longitude: number, accuracy: number): void {
    for (const watch of [...this.#watches])
      watch.onReading({ coords: { latitude, longitude, accuracy } });
  }

  /** Delivers a geolocation error with `code` to every live watch. */
  deliverPositionError(code: number): void {
    for (const watch of [...this.#watches]) watch.onError({ code, message: `code ${code}` });
  }

  count(name: string): number {
    return this.calls.filter((call) => call === name).length;
  }

  get liveWindowListeners(): number {
    let total = 0;
    for (const set of this.#windowListeners.values()) total += set.size;
    return total;
  }

  liveListeners(type: WindowEventType): number {
    return this.#windowListeners.get(type)?.size ?? 0;
  }

  get liveVisibilityListeners(): number {
    return this.#visibilityListeners.size;
  }

  get liveWatches(): number {
    return this.#watches.length;
  }

  get liveTimers(): number {
    return this.#timers.length;
  }
}

/** A `deviceorientation`-like event, in degrees. */
export function orientationEvent(fields: {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute?: unknown;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}): Record<string, unknown> {
  return { absolute: false, ...fields };
}
