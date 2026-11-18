// The browser, seen through exactly the calls the Adapter makes (design D1). This is the only file
// of the package that reads browser globals or the system clock. It detects features only; it
// never reads the user-agent string or any browser or platform name (Req 4.1).

export type WindowEventType =
  'deviceorientation' | 'deviceorientationabsolute' | 'blur' | 'pagehide';

/** The part of `navigator.geolocation` the Adapter uses. */
export interface GeolocationLike {
  watchPosition(
    onReading: (position: unknown) => void,
    onError: (error: unknown) => void,
    options: { readonly enableHighAccuracy: boolean; readonly maximumAge: number },
  ): unknown;
  clearWatch(watchId: unknown): void;
}

export interface BrowserEnvironment {
  readonly isSecureContext: boolean;
  /** `DeviceOrientationEvent` exists. */
  readonly hasDeviceOrientation: boolean;
  /** `'ondeviceorientationabsolute' in window` (Req 4.2). */
  readonly supportsAbsoluteOrientation: boolean;
  /** `DeviceOrientationEvent.requestPermission`, where it exists (iOS), else `null` (Req 11.3). */
  readonly requestOrientationPermission: (() => Promise<unknown>) | null;
  addWindowListener(type: WindowEventType, listener: (event: unknown) => void): void;
  removeWindowListener(type: WindowEventType, listener: (event: unknown) => void): void;
  addVisibilityListener(listener: () => void): void;
  removeVisibilityListener(listener: () => void): void;
  visibilityState(): string;
  /** `screen.orientation.angle` in degrees, or `null` (Req 4.9). */
  screenAngleDeg(): number | null;
  readonly geolocation: GeolocationLike | null;
  setTimer(callback: () => void, durationMs: number): unknown;
  clearTimer(handle: unknown): void;
}

/** The environment of the page this runs in. Without a `window` (a worker, a server), no sensor. */
export function browserEnvironment(): BrowserEnvironment {
  const hasWindow = typeof window !== 'undefined';
  const hasDocument = typeof document !== 'undefined';
  const orientationEvent =
    typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined;
  const requestPermission: unknown =
    orientationEvent === undefined ? undefined : Reflect.get(orientationEvent, 'requestPermission');
  const geolocation =
    typeof navigator !== 'undefined' && 'geolocation' in navigator
      ? navigator.geolocation
      : undefined;
  return {
    isSecureContext: hasWindow && window.isSecureContext === true,
    hasDeviceOrientation: orientationEvent !== undefined,
    supportsAbsoluteOrientation: hasWindow && 'ondeviceorientationabsolute' in window,
    requestOrientationPermission:
      typeof requestPermission === 'function'
        ? () => Promise.resolve(Reflect.apply(requestPermission, orientationEvent, []))
        : null,
    addWindowListener: (type, listener) => {
      if (hasWindow) window.addEventListener(type, listener);
    },
    removeWindowListener: (type, listener) => {
      if (hasWindow) window.removeEventListener(type, listener);
    },
    addVisibilityListener: (listener) => {
      if (hasDocument) document.addEventListener('visibilitychange', listener);
    },
    removeVisibilityListener: (listener) => {
      if (hasDocument) document.removeEventListener('visibilitychange', listener);
    },
    visibilityState: () => (hasDocument ? document.visibilityState : 'visible'),
    screenAngleDeg: () => {
      if (typeof screen === 'undefined' || screen.orientation === undefined) return null;
      const angle = screen.orientation.angle;
      return typeof angle === 'number' ? angle : null;
    },
    geolocation:
      geolocation === undefined
        ? null
        : {
            watchPosition: (onReading, onError, options) =>
              geolocation.watchPosition(onReading, onError, options),
            clearWatch: (watchId) => {
              if (typeof watchId === 'number') geolocation.clearWatch(watchId);
            },
          },
    setTimer: (callback, durationMs) => setTimeout(callback, durationMs),
    clearTimer: (handle) => {
      if (typeof handle === 'number' || typeof handle === 'object') {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      }
    },
  };
}

/** The system clock: milliseconds since the Unix epoch, UTC. */
export const systemClock = (): number => Date.now();
