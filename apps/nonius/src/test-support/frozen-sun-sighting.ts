// A Frozen sighting of the Sun made the way the app makes it (test support, not exported): a UI
// Synthetic scene with the Sun as its Target, a script for its Station, Sensors' Simulator, and
// UI's `step` fed with the events the Simulator produces, to the Freeze (and, for a Relative
// frame, the Yaw reference from a known azimuth).

import type { Position } from '@alidade/core';
import {
  createSimulator,
  declinationAt,
  SIGHTING_WINDOW_LENGTH_MS,
  type Declination,
  type SimulatorScript,
} from '@alidade/sensors';
import {
  CATALOGUE_CALIBRATION,
  createSession,
  defaultSessionParameters,
  scriptForStation,
  sceneFromOffsets,
  step,
  type FrozenSighting,
  type Session,
} from '@alidade/ui';
import { ARCMIN_TO_RAD } from '../math/degrees';

export interface FrozenSunSpec {
  /** The observer. */
  readonly truth: Position;
  /** The script starts here; the freeze is two windows later. Within the WMM's years. */
  readonly startUtcMs: number;
  /** The Sun's true azimuth and apparent altitude, held for the whole script. */
  readonly azimuthRad: number;
  readonly apparentAltitudeRad: number;
  readonly frame: 'absolute' | 'relative';
  /** Relative frame only: the true azimuth of the frame's zero. */
  readonly zeroRad?: number;
  /** Relative frame only: a Yaw reference from the known true azimuth of the camera axis. */
  readonly knownAzimuth?: boolean;
  readonly altitudeBiasRad?: number;
  readonly noiseSigmaRad?: number;
  readonly seed?: number;
}

export interface FrozenSun {
  readonly frozen: FrozenSighting;
  readonly session: Session;
  /** The Declination the script was made with (`declinationAt` at the Station and start). */
  readonly declination: Declination;
  readonly script: SimulatorScript;
}

const SIMULATOR_OPTIONS = {
  listeningTimeoutMs: 3000,
  positionTimeoutMs: 30_000,
  positionConfidenceScale: 1,
};

function must<T>(r: { ok: true; value: T } | { ok: false; reason: string }, what: string): T {
  if (!r.ok) throw new Error(`${what} failed: ${r.reason}`);
  return r.value;
}

export function frozenSunSighting(spec: FrozenSunSpec): FrozenSun {
  const scene = must(
    sceneFromOffsets({
      id: 'sun-test',
      name: 'Sun test',
      origin: spec.truth,
      calibration: CATALOGUE_CALIBRATION,
      stations: [
        { id: 'one', name: 'Sight 1', eastM: 0, northM: 0 },
        { id: 'two', name: 'Sight 2', eastM: 100, northM: 0 },
      ],
      targets: [
        {
          kind: 'sun',
          id: 'sun',
          label: 'Sun',
          azimuthRad: spec.azimuthRad,
          apparentAltitudeRad: spec.apparentAltitudeRad,
          angularRadiusRad: 16 * ARCMIN_TO_RAD,
        },
      ],
    }),
    'scene',
  );
  const script = must(
    scriptForStation(scene, 'one', 'sun', {
      startUtcMs: spec.startUtcMs,
      altitudeBiasRad: spec.altitudeBiasRad ?? 0,
      orientationNoiseSigmaRad: spec.noiseSigmaRad ?? 0,
      frame:
        spec.frame === 'absolute'
          ? { kind: 'absolute', northErrorRad: 0, resets: [] }
          : { kind: 'relative', zeroRad: spec.zeroRad ?? 1, resets: [] },
    }),
    'script',
  );
  const sim = must(createSimulator(script, spec.seed ?? 1, SIMULATOR_OPTIONS), 'simulator');
  const parameters = defaultSessionParameters();
  let session = must(createSession('altitude', parameters), 'session');
  const feed = (event: Parameters<typeof step>[1]): void => {
    session = step(session, event, parameters).session;
  };
  const startMs = script.startUtcMs;
  feed({
    kind: 'permissionResult',
    timeUtcMs: startMs,
    result: { ok: true, value: 'not_required' },
  });
  feed({
    kind: 'orientationStarted',
    timeUtcMs: startMs,
    result: { ok: true, value: spec.frame },
  });
  sim.source.onOrientation((result) => {
    if (result.ok) feed({ kind: 'sample', timeUtcMs: result.value.timeUtcMs, result });
  });
  void sim.source.requestOrientationPermission();
  void sim.source.startOrientation();
  must(sim.controls.advanceTo(startMs + 2 * SIGHTING_WINDOW_LENGTH_MS), 'advance');
  const freezeMs = sim.source.now();
  sim.source.stop();
  feed({ kind: 'freeze', timeUtcMs: freezeMs });
  if (spec.knownAzimuth === true) {
    feed({
      kind: 'establishYaw',
      timeUtcMs: freezeMs,
      from: {
        kind: 'knownAzimuth',
        azimuthRad: spec.azimuthRad,
        sigmaRad: 0.01,
        northReference: 'true',
      },
    });
  }
  if (session.frozen === null) throw new Error(`not frozen: ${session.state}`);
  const declination = must(
    declinationAt(scene.stations[0]?.position ?? spec.truth, startMs),
    'declination',
  );
  return { frozen: session.frozen, session, declination, script };
}
