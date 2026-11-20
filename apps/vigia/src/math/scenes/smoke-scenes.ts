// The four Synthetic scenes of the reviewer's path (design §10, Req 17.2, 17.8), built with UI's
// `sceneFromOffsets` and `scriptForStation` from the synthetic origin 30° N, 40° W and the
// catalogue's calibration. Every Station and the Target are offsets in metres from the origin; the
// Target is the "Smoke column", 3 000 m north, and each Station's script starts pointed at it.
// Nothing here is a real place.

import {
  CATALOGUE_CALIBRATION,
  CATALOGUE_ORIGIN,
  sceneFromOffsets,
  scriptForStation,
  type CatalogueScene,
  type StationScriptOptions,
  type StationSpec,
  type TargetSpec,
} from '@alidade/ui';
import type { SimulatorScript } from '@alidade/sensors';
import { err, ok, type VigiaResult } from '../../result';
import { fromDeg } from '../degrees';

/** The Target every scene aims at (the id of the Smoke column). */
export const SMOKE_TARGET_ID = 'smoke';

/** The smoke: 3 000 m north of the origin, 100 m high (design §10). */
const SMOKE: TargetSpec = {
  kind: 'landmark',
  id: SMOKE_TARGET_ID,
  label: 'Smoke column',
  eastM: 0,
  northM: 3000,
  heightM: 100,
};

const WEST: StationSpec = { id: 'west', name: 'West post', eastM: -800, northM: 0 };
const EAST: StationSpec = { id: 'east', name: 'East post', eastM: 800, northM: 0 };
const SIDE: StationSpec = { id: 'side', name: 'Side post', eastM: 3100, northM: 3000 };
const SOUTHWEST: StationSpec = {
  id: 'southwest',
  name: 'Southwest post',
  eastM: -2500,
  northM: -500,
};
const FRONT: StationSpec = { id: 'front', name: 'Front post', eastM: 0, northM: 0 };
const BACK: StationSpec = { id: 'back', name: 'Back post', eastM: 420, northM: -3000 };

interface SceneDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly stations: readonly StationSpec[];
  /** The Station whose script is pointed 12 degrees off, if any. */
  readonly wrongStationId?: string;
}

const DEFINITIONS: readonly SceneDefinition[] = [
  {
    id: 'two-posts',
    name: 'Two posts',
    description:
      'Two posts 1.6 km apart look north at one smoke: a Fix with a long ellipse, and the advice on where to stand next.',
    stations: [WEST, EAST],
  },
  {
    id: 'three-posts',
    name: 'Three posts',
    description:
      'The two posts, then a third off the line: the advice points at it and the ellipse becomes round.',
    stations: [WEST, EAST, SIDE],
  },
  {
    id: 'four-posts-one-wrong',
    name: 'Four posts, one wrong',
    description:
      'Four posts; the fourth is pointed 12 degrees off, and the solver sets it aside as an outlier.',
    stations: [WEST, EAST, SIDE, SOUTHWEST],
    wrongStationId: 'southwest',
  },
  {
    id: 'almost-in-line',
    name: 'Two posts almost in line',
    description:
      'Two posts that look along nearly the same line: the lines cross at about 4 degrees, and the app says the smoke could be much nearer or farther.',
    stations: [FRONT, BACK],
  },
];

/** The orientation noise of the catalogue's steady scene: 0.05 degrees (design §10). */
const ORIENTATION_NOISE_DEG = 0.05;
/** The deliberate north error of the wrong Station: 12 degrees (design §10). */
const WRONG_NORTH_ERROR_DEG = 12;

/**
 * The four scenes as the Simulator panel takes them, in the order `two-posts`, `three-posts`,
 * `four-posts-one-wrong`, `almost-in-line`. Fails with the failure of UI's builders, which a
 * constant above being wrong would cause.
 */
export function smokeScenes(): VigiaResult<readonly CatalogueScene[]> {
  const noiseRad = fromDeg(ORIENTATION_NOISE_DEG);
  if (!noiseRad.ok) return noiseRad;
  const wrongRad = fromDeg(WRONG_NORTH_ERROR_DEG);
  if (!wrongRad.ok) return wrongRad;

  const scenes: CatalogueScene[] = [];
  for (const definition of DEFINITIONS) {
    const built = sceneFromOffsets({
      id: definition.id,
      name: definition.name,
      origin: CATALOGUE_ORIGIN,
      calibration: CATALOGUE_CALIBRATION,
      stations: definition.stations,
      targets: [SMOKE],
    });
    if (!built.ok) return built;
    const scripts: Record<string, SimulatorScript> = {};
    for (const station of built.value.stations) {
      const options: StationScriptOptions = {
        orientationNoiseSigmaRad: noiseRad.value,
        ...(station.id === definition.wrongStationId
          ? { frame: { kind: 'absolute', northErrorRad: wrongRad.value, resets: [] } }
          : {}),
      };
      const script = scriptForStation(built.value, station.id, SMOKE_TARGET_ID, options);
      if (!script.ok) return script;
      scripts[station.id] = script.value;
    }
    if (Object.keys(scripts).length !== definition.stations.length) {
      return err('invalid_number', { field: 'stations' });
    }
    scenes.push({
      scene: built.value,
      scripts,
      aimTargetId: SMOKE_TARGET_ID,
      kind: 'bearing',
      failure: null,
      description: definition.description,
    });
  }
  return ok(scenes);
}
