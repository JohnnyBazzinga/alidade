import type { Bearing } from '../observation';

const DEFAULT_SIGMA_RAD = 2 * (Math.PI / 180);

/** A valid Bearing with sensible defaults: only `id` is required. */
export function makeBearing(fields: Partial<Bearing> & { id: string }): Bearing {
  return {
    observer: { latRad: 0, lonRad: 0 },
    positionAccuracyM: 5,
    timeUtcMs: 0,
    azimuthRad: 0,
    azimuthSigmaRad: DEFAULT_SIGMA_RAD,
    ...fields,
  };
}
