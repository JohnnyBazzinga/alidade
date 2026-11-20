// The mode the page starts in (Req 17.1; the lead's decision of 2026-11-21). Desktop browsers
// define `DeviceOrientationEvent` and have no sensor, so the feature test alone would start a
// reviewer on a laptop in device mode. The page opened with `?mode=simulator` starts in Simulation
// mode whatever the browser has; without `DeviceOrientationEvent` it always does. A feature test,
// never the user-agent string.

export type StartMode = 'device' | 'simulation';

/** Whether the page address asks for the simulator: the first `mode` parameter is `simulator`. */
export function simulatorRequested(address: string): boolean {
  const cut = address.indexOf('#');
  const withoutFragment = cut < 0 ? address : address.slice(0, cut);
  const start = withoutFragment.indexOf('?');
  if (start < 0) return false;
  return new URLSearchParams(withoutFragment.slice(start + 1)).get('mode') === 'simulator';
}

export function initialMode(input: {
  readonly hasDeviceOrientation: boolean;
  readonly address: string;
}): StartMode {
  return input.hasDeviceOrientation && !simulatorRequested(input.address) ? 'device' : 'simulation';
}
