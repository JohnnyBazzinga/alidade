// Minimal types for the non-standard orientation APIs the probe depends on.
// These are not in lib.dom.d.ts: webkitCompassHeading/Accuracy are iOS-only
// additions to DeviceOrientationEvent, and requestPermission() is the iOS 13+
// gesture gate for motion data.

export interface WebKitCompassDeviceOrientationEvent extends DeviceOrientationEvent {
  /** Compass heading of the top of the device, clockwise from true north, in degrees. */
  webkitCompassHeading?: number;
  /** 1-sigma-ish compass accuracy in degrees; large when the compass needs calibration. */
  webkitCompassAccuracy?: number;
}

export interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

// A DeviceOrientationEvent that carries iOS compass data, with the heading
// narrowed to a definite number (the guard below guarantees this).
export type CompassDeviceOrientationEvent = WebKitCompassDeviceOrientationEvent & {
  webkitCompassHeading: number;
};

export function isCompassEvent(
  e: DeviceOrientationEvent,
): e is CompassDeviceOrientationEvent {
  return typeof (e as WebKitCompassDeviceOrientationEvent).webkitCompassHeading === 'number';
}
