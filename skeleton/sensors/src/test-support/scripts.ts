// Synthetic Simulator scripts for the tests.

import type { SimulatorScript } from '../simulator/simulator-script';
import { rad } from './angle-compare';

export const SCRIPT_START_UTC_MS = 1_790_000_000_000;

/** A still phone, upright, looking at 100° true, Relative frame with its zero at 30° true. */
export function baseScript(changes: Partial<SimulatorScript> = {}): SimulatorScript {
  return {
    startUtcMs: SCRIPT_START_UTC_MS,
    eventIntervalMs: 50,
    pose: [
      {
        timeUtcMs: SCRIPT_START_UTC_MS,
        azimuthRad: rad(100),
        apparentAltitudeRad: rad(5),
        rollRad: 0,
      },
    ],
    orientationNoiseSigmaRad: 0,
    altitudeBiasRad: 0,
    frame: { kind: 'relative', zeroRad: rad(30), resets: [] },
    heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
    screenAngleDeg: 0,
    declinationRad: rad(-4),
    position: {
      kind: 'fix',
      position: { latRad: rad(24.5), lonRad: rad(118.1) },
      reportedAccuracyM: 8,
      firstFixDelayMs: 500,
      fixIntervalMs: 1000,
    },
    orientation: 'available',
    orientationPermission: 'not_required',
    secureContext: true,
    ...changes,
  };
}
