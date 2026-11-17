import type { DeviceRotation } from '../rotation';

/** True for the draws within 1e-2 rad of `beta = ±π/2`, which the reports give separately. */
export function isNearGimbalLock(r: DeviceRotation): boolean {
  return Math.abs(Math.abs(r.betaRad) - Math.PI / 2) < 1e-2;
}

/** The report name of a quantity, split by whether the case is near gimbal lock. */
export function lockLabel(name: string, r: DeviceRotation): string {
  return `${name} (${isNearGimbalLock(r) ? 'near gimbal lock' : 'elsewhere'})`;
}

/** A compact description of a rotation for the reports. */
export function describeRotation(r: DeviceRotation): string {
  return `alpha=${r.alphaRad} beta=${r.betaRad} gamma=${r.gammaRad}`;
}
