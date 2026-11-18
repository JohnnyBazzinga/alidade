// The catalogue of Synthetic scenes (Req 17.1 to 17.3, design §7.16, D16).
//
// Every Position is built from one invented origin, 30° N 40° W, by offsets in metres on its Local
// plane (Core's `unprojectToLocalPlane`). That point is in the open North Atlantic, about 1 500 km
// west of the Canary Islands: no place, landmark or station of the catalogue is real, and nothing
// comes from `notes/`. The origin lies inside the WMM2025 validity window at the scripts' start
// and far from the magnetic poles (outside the blackout zone), which a test checks. The camera's
// calibration (70° on the diagonal of a 720 × 1280 image) is an invented value, not a measured one.

import { unprojectToLocalPlane, type Position } from '@alidade/core';
import { declinationAt, type SimulatorScript } from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';
import type { UiReason } from '../../reasons';
import type { CameraCalibration } from '../camera-calibration';
import { fromDeg } from '../degrees';
import { checkScene, type Station, type SyntheticScene, type Target } from './scene';
import { targetDirection } from './target-direction';

/** The synthetic origin: 30° N, 40° W. */
export const CATALOGUE_ORIGIN: Position = { latRad: fromDeg(30), lonRad: fromDeg(-40) };
/** 2026-09-21, inside the WMM2025 validity window. */
export const CATALOGUE_START_UTC_MS = 1_790_000_000_000;
export const CATALOGUE_EVENT_INTERVAL_MS = 50;

/** The synthetic camera: 70° on the diagonal of a 720 × 1280 image, 1-sigma 1°. Invented. */
export const CATALOGUE_CALIBRATION: CameraCalibration = {
  fovRad: fromDeg(70),
  fovAxis: 'diagonal',
  fovSigmaRad: fromDeg(1),
  imageWidthSourcePx: 720,
  imageHeightSourcePx: 1280,
};

export type StationSpec = {
  readonly id: string;
  readonly name: string;
  readonly eastM: number;
  readonly northM: number;
};
export type TargetSpec =
  | {
      readonly kind: 'landmark';
      readonly id: string;
      readonly label: string;
      readonly eastM: number;
      readonly northM: number;
      readonly heightM: number;
    }
  | {
      readonly kind: 'sun';
      readonly id: string;
      readonly label: string;
      readonly azimuthRad: number;
      readonly apparentAltitudeRad: number;
      readonly angularRadiusRad: number;
    };

export interface SceneSpec {
  readonly id: string;
  readonly name: string;
  readonly origin: Position;
  readonly calibration: CameraCalibration;
  readonly stations: readonly StationSpec[];
  readonly targets: readonly TargetSpec[];
}

/** A scene from offsets in metres on the Local plane of `origin` (the catalogue's own builder). */
export function sceneFromOffsets(spec: SceneSpec): UiResult<SyntheticScene> {
  const at = (eastM: number, northM: number) =>
    unprojectToLocalPlane(spec.origin, { eastM, northM });
  const stations: Station[] = [];
  for (const s of spec.stations) {
    const position = at(s.eastM, s.northM);
    if (!position.ok) return position;
    stations.push({ id: s.id, name: s.name, position: position.value });
  }
  const targets: Target[] = [];
  for (const t of spec.targets) {
    if (t.kind === 'sun') {
      targets.push(t);
      continue;
    }
    const position = at(t.eastM, t.northM);
    if (!position.ok) return position;
    targets.push({
      kind: 'landmark',
      id: t.id,
      label: t.label,
      position: position.value,
      heightM: t.heightM,
    });
  }
  return checkScene({
    id: spec.id,
    name: spec.name,
    calibration: spec.calibration,
    stations,
    targets,
  });
}

export interface CatalogueScene {
  readonly scene: SyntheticScene;
  /** One script per Station, each starting on `aimTargetId` and holding that pose. */
  readonly scripts: Readonly<Record<string, SimulatorScript>>;
  readonly aimTargetId: string;
  /** What the scene is for: a bearing (Vigia) or an altitude (Nonius). */
  readonly kind: 'bearing' | 'altitude';
  /** The reason whose Message the scene shows when its failure is reached; `null` for none. */
  readonly failure: UiReason | null;
  readonly description: string;
}

type ScriptChange = Partial<
  Omit<SimulatorScript, 'pose' | 'declinationRad' | 'position' | 'startUtcMs'>
> & {
  readonly position?: SimulatorScript['position'];
};

const STATIONS: readonly StationSpec[] = [
  { id: 'west', name: 'West post', eastM: -800, northM: 0 },
  { id: 'east', name: 'East post', eastM: 800, northM: 0 },
];
const LANDMARKS: readonly TargetSpec[] = [
  { kind: 'landmark', id: 'tower', label: 'Tower', eastM: 0, northM: 3000, heightM: 60 },
  { kind: 'landmark', id: 'mast', label: 'Mast', eastM: 2500, northM: 2000, heightM: 120 },
  { kind: 'landmark', id: 'ridge', label: 'Ridge', eastM: -3000, northM: 4000, heightM: 300 },
];
const SUN: TargetSpec = {
  kind: 'sun',
  id: 'sun',
  label: 'Sun',
  azimuthRad: fromDeg(200),
  apparentAltitudeRad: fromDeg(35),
  angularRadiusRad: fromDeg(0.267),
};

const DEFAULT_SCRIPT: Omit<SimulatorScript, 'pose' | 'declinationRad' | 'position'> = {
  startUtcMs: CATALOGUE_START_UTC_MS,
  eventIntervalMs: CATALOGUE_EVENT_INTERVAL_MS,
  orientationNoiseSigmaRad: 0,
  altitudeBiasRad: 0,
  frame: { kind: 'absolute', northErrorRad: 0, resets: [] },
  heading: null,
  screenAngleDeg: 0,
  orientation: 'available',
  orientationPermission: 'not_required',
  secureContext: true,
};

const RELATIVE: ScriptChange = {
  frame: { kind: 'relative', zeroRad: 1.1, resets: [] },
  heading: { biasRad: 0, noiseSigmaRad: fromDeg(0.3), jumps: [], reportedAccuracyDeg: 10 },
};

interface Entry {
  readonly id: string;
  readonly name: string;
  readonly kind: 'bearing' | 'altitude';
  readonly failure: UiReason | null;
  readonly description: string;
  readonly change: ScriptChange;
  readonly sun?: boolean;
  /** The reported accuracy of the Station's fix, 5 m unless stated. */
  readonly fixAccuracyM?: number;
}

const t = CATALOGUE_START_UTC_MS;

const ENTRIES: readonly Entry[] = [
  {
    id: 'steady',
    name: 'Steady phone',
    kind: 'bearing',
    failure: null,
    description: 'An Absolute-frame phone held still on the tower.',
    change: { orientationNoiseSigmaRad: fromDeg(0.05) },
  },
  {
    id: 'iphone',
    name: 'iPhone with a compass',
    kind: 'bearing',
    failure: 'no_yaw_reference',
    description:
      'A Relative-frame phone with a compass and an altitude bias of -3.3°: north must be set first.',
    change: { ...RELATIVE, altitudeBiasRad: fromDeg(-3.3) },
  },
  {
    id: 'compass-jumps',
    name: 'A compass that jumps',
    kind: 'bearing',
    failure: 'too_unsteady',
    description:
      'The compass jumps by 120° for half a second: north set across the jump is too uncertain to use.',
    change: {
      ...RELATIVE,
      heading: {
        biasRad: 0,
        noiseSigmaRad: fromDeg(0.3),
        jumps: [{ startUtcMs: t + 1000, durationMs: 500, sizeRad: fromDeg(120) }],
        reportedAccuracyDeg: 10,
      },
    },
  },
  {
    id: 'frame-reset',
    name: 'North lost after a page switch',
    kind: 'bearing',
    failure: 'frame_reset',
    description:
      'North is set, then the page is hidden at 4 s and the Relative frame moves: the capture is refused.',
    change: {
      ...RELATIVE,
      frame: {
        kind: 'relative',
        zeroRad: 1.1,
        resets: [{ timeUtcMs: t + 4000, cause: 'hidden', newZeroRad: 2.5 }],
      },
    },
  },
  {
    id: 'coarse',
    name: 'Coarse location',
    kind: 'bearing',
    failure: 'coarse_location',
    description: 'The phone knows its position only to 840 m.',
    change: {},
    fixAccuracyM: 840,
  },
  {
    id: 'location-denied',
    name: 'Location denied',
    kind: 'bearing',
    failure: 'position_unavailable',
    description: 'Location access is refused, so a bearing has no observer position.',
    change: { position: { kind: 'failure', reason: 'permission_denied' } },
  },
  {
    id: 'permission-required',
    name: 'Motion permission required',
    kind: 'bearing',
    failure: 'permission_required',
    description:
      'The browser needs a tap to share motion (iOS); started without asking, it sends nothing.',
    change: { orientationPermission: 'granted' },
  },
  {
    id: 'permission-denied',
    name: 'Motion permission denied',
    kind: 'bearing',
    failure: 'permission_denied',
    description: 'The user refuses motion access.',
    change: { orientationPermission: 'denied' },
  },
  {
    id: 'sensor-missing',
    name: 'No motion sensor',
    kind: 'bearing',
    failure: 'sensor_unavailable',
    description: 'A device with no orientation sensor.',
    change: { orientation: 'missing' },
  },
  {
    id: 'insecure',
    name: 'Insecure page',
    kind: 'bearing',
    failure: 'insecure_context',
    description: 'The page was opened over http.',
    change: { secureContext: false },
  },
  {
    id: 'sun',
    name: 'The Sun for Nonius',
    kind: 'altitude',
    failure: null,
    description: 'The camera held on the Sun, 35° up.',
    change: { orientationNoiseSigmaRad: fromDeg(0.05) },
    sun: true,
  },
];

/** Builds the eleven scenes (D16). Fails only if a constant above is wrong. */
export function buildCatalogue(): UiResult<readonly CatalogueScene[]> {
  const out: CatalogueScene[] = [];
  for (const entry of ENTRIES) {
    const built = sceneFromOffsets({
      id: entry.id,
      name: entry.name,
      origin: CATALOGUE_ORIGIN,
      calibration: CATALOGUE_CALIBRATION,
      stations: STATIONS,
      targets: entry.sun ? [SUN, ...LANDMARKS] : LANDMARKS,
    });
    if (!built.ok) return built;
    const scene = built.value;
    const aimTargetId = entry.sun ? 'sun' : 'tower';
    const aim = scene.targets.find((x) => x.id === aimTargetId);
    if (aim === undefined) return err('invalid_number', { field: 'aimTargetId' });
    const scripts: Record<string, SimulatorScript> = {};
    for (const station of scene.stations) {
      const direction = targetDirection(station, aim);
      if (!direction.ok) return direction;
      const declination = declinationAt(station.position, CATALOGUE_START_UTC_MS);
      if (!declination.ok) return declination;
      scripts[station.id] = {
        ...DEFAULT_SCRIPT,
        position: {
          kind: 'fix',
          position: station.position,
          reportedAccuracyM: entry.fixAccuracyM ?? 5,
          firstFixDelayMs: 0,
          fixIntervalMs: 1000,
        },
        ...entry.change,
        pose: [
          {
            timeUtcMs: CATALOGUE_START_UTC_MS,
            azimuthRad: direction.value.azimuthRad,
            apparentAltitudeRad: direction.value.apparentAltitudeRad,
            rollRad: 0,
          },
        ],
        declinationRad: declination.value.declinationRad,
        startUtcMs: CATALOGUE_START_UTC_MS,
      };
    }
    out.push({
      scene,
      scripts,
      aimTargetId,
      kind: entry.kind,
      failure: entry.failure,
      description: entry.description,
    });
  }
  return ok(out);
}
