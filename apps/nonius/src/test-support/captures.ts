// Altitude captures and Sights built directly, for tests (test support, not exported).

import type { CapturedResult } from '@alidade/ui';
import type { Sight } from '../math/sight/sight';

export interface CaptureSpec {
  readonly apparentAltitudeRad: number;
  readonly sampleStdDevRad?: number;
  readonly markSigmaRad?: number | null;
  readonly frozenAtUtcMs?: number;
  readonly windowLengthMs?: number;
}

/** An altitude `CapturedResult` as UI's Session makes it with the calibration `{ 0, 0 }`. */
export function altitudeCapture(spec: CaptureSpec): CapturedResult {
  const sampleStdDevRad = spec.sampleStdDevRad ?? 0.001;
  const windowLengthMs = spec.windowLengthMs ?? 1000;
  return {
    kind: 'altitude',
    altitude: {
      apparentAltitudeRad: spec.apparentAltitudeRad,
      sigmaRad: sampleStdDevRad,
      sampleStdDevRad,
      calibration: { offsetRad: 0, sigmaRad: 0 },
      sampleCount: 20,
    },
    altitudeStdDevRad: sampleStdDevRad,
    mark: null,
    yawReference: null,
    declination: null,
    calibration: null,
    sampleCount: 20,
    window: {
      endUtcMs: spec.frozenAtUtcMs ?? 1_790_000_000_000,
      windowLengthMs,
      minSampleCount: 5,
      sampleStalenessMs: 500,
    },
    north: null,
    markSigmaRad: spec.markSigmaRad ?? null,
  };
}

/** A Sight with every field given a plausible value; `over` replaces fields. */
export function sightOf(over: Partial<Sight> = {}): Sight {
  return {
    id: 'sight-1',
    timeUtcMs: Date.UTC(2026, 11, 21, 14, 40),
    rawApparentAltitudeRad: 0.5,
    sampleStdDevRad: 0.001,
    markSigmaRad: 0,
    sunSide: null,
    simulated: false,
    ...over,
  };
}
