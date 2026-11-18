// The Simulator script of one Station of a Synthetic scene (Req 17.13, 17.15, design D31.8, D31.9):
// the camera starts pointed at one Target and holds that pose. The catalogue is built through it
// (Req 17.14), and an app builds the scripts of its own scenes the same way.

import { declinationAt, type SimulatorScript } from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';
import { fromDeg } from '../degrees';
import { checkScene, type SyntheticScene } from './scene';
import { targetDirection } from './target-direction';

/** 2026-09-21T09:46:40Z, inside the years of the Declination model: the default start time. */
export const SCRIPT_START_UTC_MS = 1_790_000_000_000;
/** The default interval between Orientation events: 50 ms. */
export const SCRIPT_EVENT_INTERVAL_MS = 50;
/** The default reported accuracy of the Station's Position fix: 5 m. */
export const SCRIPT_FIX_ACCURACY_M = 5;
/**
 * The steepest pose the Simulator accepts, 80°: Sensors states it (`MAX_POSE_ALTITUDE_RAD`) and
 * does not export it, so it is written here and a test checks that the Simulator accepts it and
 * refuses a hair beyond.
 */
export const MAX_SCRIPT_ALTITUDE_RAD = fromDeg(80);

/**
 * What a script varies: every field of `SimulatorScript` except the pose, the Declination, the
 * position and the start time, which the function sets; plus the start time, the accuracy of the
 * Station's fix, and `position` to replace that fix (for example a denied location).
 */
export type StationScriptOptions = Partial<
  Omit<SimulatorScript, 'pose' | 'declinationRad' | 'position' | 'startUtcMs'>
> & {
  readonly startUtcMs?: number;
  readonly fixAccuracyM?: number;
  readonly position?: SimulatorScript['position'];
};

/** A steady, noise-free, Absolute-frame phone on a secure page: the catalogue's defaults. */
const DEFAULT_SCRIPT: Omit<SimulatorScript, 'pose' | 'declinationRad' | 'position' | 'startUtcMs'> =
  {
    eventIntervalMs: SCRIPT_EVENT_INTERVAL_MS,
    orientationNoiseSigmaRad: 0,
    altitudeBiasRad: 0,
    frame: { kind: 'absolute', northErrorRad: 0, resets: [] },
    heading: null,
    screenAngleDeg: 0,
    orientation: 'available',
    orientationPermission: 'not_required',
    secureContext: true,
  };

const MAX_SCAN_DEPTH = 8;

/** The dotted path of the first number that is not finite, or `null`. Bounded in depth. */
function firstNonFinite(value: unknown, path: string, depth: number): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (depth >= MAX_SCAN_DEPTH || typeof value !== 'object' || value === null) return null;
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const found = firstNonFinite(item, `${path}[${i}]`, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const [key, item] of Object.entries(value)) {
    const found = firstNonFinite(item, path === '' ? key : `${path}.${key}`, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function clamp(altitudeRad: number): number {
  return Math.max(-MAX_SCRIPT_ALTITUDE_RAD, Math.min(MAX_SCRIPT_ALTITUDE_RAD, altitudeRad));
}

/**
 * The script of Station `stationId` of `scene`, starting on Target `aimTargetId` (Req 17.13): one
 * pose keyframe at the start time, the Target's true azimuth and apparent altitude from
 * `targetDirection` (the altitude clamped to ±80°, Req 17.15), roll 0, held; the Declination of the
 * Station at the start time; the Station's fix; the defaults above; then `options`.
 *
 * Fails with: the failure of `checkScene` for a scene that is not valid; `invalid_number` naming
 * `stationId` or `aimTargetId` for an id the scene does not have, or the dotted path of an option
 * that is a number and not finite; `coincident_positions` for a Target under 1 m away; Sensors'
 * failure when it cannot give the Declination at that place and time. It does not check the other
 * fields: the Simulator's own validation does, and says which. Never throws.
 */
export function scriptForStation(
  scene: SyntheticScene,
  stationId: string,
  aimTargetId: string,
  options: StationScriptOptions = {},
): UiResult<SimulatorScript> {
  const checked = checkScene(scene);
  if (!checked.ok) return checked;
  const station = scene.stations.find((s) => s.id === stationId);
  if (station === undefined) return err('invalid_number', { field: 'stationId' });
  const aim = scene.targets.find((t) => t.id === aimTargetId);
  if (aim === undefined) return err('invalid_number', { field: 'aimTargetId' });
  const bad = firstNonFinite(options, '', 0);
  if (bad !== null) return err('invalid_number', { field: bad });

  const direction = targetDirection(station, aim);
  if (!direction.ok) return direction;
  const {
    startUtcMs = SCRIPT_START_UTC_MS,
    fixAccuracyM = SCRIPT_FIX_ACCURACY_M,
    ...rest
  } = options;
  const declination = declinationAt(station.position, startUtcMs);
  if (!declination.ok) return declination;

  // An option that is present but `undefined` does not replace a default.
  const overrides = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  return ok({
    ...DEFAULT_SCRIPT,
    position: {
      kind: 'fix',
      position: station.position,
      reportedAccuracyM: fixAccuracyM,
      firstFixDelayMs: 0,
      fixIntervalMs: 1000,
    },
    ...overrides,
    pose: [
      {
        timeUtcMs: startUtcMs,
        azimuthRad: direction.value.azimuthRad,
        apparentAltitudeRad: clamp(direction.value.apparentAltitudeRad),
        rollRad: 0,
      },
    ],
    declinationRad: declination.value.declinationRad,
    startUtcMs,
  });
}
