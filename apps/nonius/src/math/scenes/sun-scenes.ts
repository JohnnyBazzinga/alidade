// The synthetic scenes of the reviewer's path (Req 13.2, 13.3, 13.7; design §10). A scene is a day,
// the Sight times on it and the phone's error; `catalogueSceneAt` makes the UI scene for one Sight
// time: UI's Simulator keeps its Sun still, so each Sight time has a scene of its own, with the Sun
// where the Sun wrapper puts it then, and one Station per Sight time to carry that time.

import {
  CATALOGUE_CALIBRATION,
  CATALOGUE_ORIGIN,
  sceneFromOffsets,
  scriptForStation,
  type CatalogueScene,
  type StationSpec,
} from '@alidade/ui';
import type { Position } from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { utcClockText } from '../civil-time';
import { DEG_TO_RAD } from '../degrees';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { IndexError } from '../sight/index-error';
import { sunAt } from '../sun/sun-at';

export interface NoniusScene {
  readonly id: string;
  readonly name: string;
  /** The invented observer: UI's synthetic origin. */
  readonly truth: Position;
  readonly sightTimesUtcMs: readonly number[];
  /** The phone's scripted altitude bias (the iPhone case of UI's catalogue). Unit: rad. */
  readonly altitudeBiasRad: number;
  /** An extra altitude error of a script, by index of its Sight time. Unit: rad. */
  readonly addedErrorRad: Readonly<Record<number, number>>;
  /** The orientation noise of the scripted phone, 1-sigma. Unit: rad. */
  readonly orientationNoiseSigmaRad: number;
  /** The scene's own Index error record, marked simulated; `null` for an uncalibrated phone. */
  readonly indexError: IndexError | null;
  readonly description: string;
}

/** 2026-12-21T00:00Z in milliseconds since the Unix epoch (the test checks it against the calendar). */
const DAY_START_UTC_MS = 1797811200000;
const utc = (hour: number, minute: number): number =>
  DAY_START_UTC_MS + (hour * 60 + minute) * 60_000;

/** The scripted bias of every scene: -3.3°, the iPhone 13 against the Sun (math-conventions probe). */
const SCENE_BIAS_RAD = -3.3 * DEG_TO_RAD;
/** The orientation noise of a script's phone: 0.05°, as UI's catalogue. Unit: rad. */
const SCRIPT_NOISE_RAD = 0.05 * DEG_TO_RAD;
/** The scene's own Index error record: -3.2° ± 0.25° (Req 13.2), simulation values. */
const SCENE_INDEX_ERROR: IndexError = {
  valueRad: -3.2 * DEG_TO_RAD,
  sigmaRad: 0.25 * DEG_TO_RAD,
  sightCount: 5,
  measuredUtcMs: DAY_START_UTC_MS + 9 * 3_600_000,
  simulated: true,
};
/** The error added to the second sight of scene (c); raised in 1° steps up to 8° if the disagreement is not said (design §10). */
const DISAGREEMENT_ERROR_RAD = 3 * DEG_TO_RAD;
/** The Sun's angular radius, 16′. Unit: rad. */
const SUN_RADIUS_RAD = 0.267 * DEG_TO_RAD;
/** A script starts this long before its Sight time, so that the first freeze UI allows has its window's middle at the Sight time. Unit: ms. */
const SCRIPT_LEAD_MS = 500;

const GOOD_DAY_TIMES: readonly number[] = [utc(11, 40), utc(14, 40), utc(17, 40)];

/** The scenes of design §10. Fails with the failure of `checkParameters`. */
export function sunScenes(params: NoniusParameters): NoniusResult<readonly NoniusScene[]> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const base = {
    truth: CATALOGUE_ORIGIN,
    altitudeBiasRad: SCENE_BIAS_RAD,
    addedErrorRad: {},
    orientationNoiseSigmaRad: SCRIPT_NOISE_RAD,
    indexError: SCENE_INDEX_ERROR,
  };
  return ok([
    {
      ...base,
      id: 'good-day',
      name: 'A good day',
      sightTimesUtcMs: GOOD_DAY_TIMES,
      description: 'Three sights about three hours apart, with the phone’s index error measured.',
    },
    {
      ...base,
      id: 'too-close',
      name: 'Sights too close in time',
      sightTimesUtcMs: [utc(13, 0), utc(13, 40)],
      description:
        'Two sights 40 minutes apart: the position is poor, and the advice says to wait.',
    },
    {
      ...base,
      id: 'too-close-10min',
      name: 'Sights ten minutes apart',
      sightTimesUtcMs: [utc(13, 0), utc(13, 10)],
      description: 'Two sights 10 minutes apart: too close to give a position.',
    },
    {
      ...base,
      id: 'one-disagrees',
      name: 'One sight disagrees',
      sightTimesUtcMs: GOOD_DAY_TIMES,
      addedErrorRad: { 1: DISAGREEMENT_ERROR_RAD },
      description: 'Three sights, the second taken with an error: the sights do not agree.',
    },
    {
      ...base,
      id: 'uncalibrated',
      name: 'A phone never calibrated',
      sightTimesUtcMs: GOOD_DAY_TIMES,
      indexError: null,
      description:
        'The sights of a good day with no index error: measure it and see the difference.',
    },
  ]);
}

/**
 * The UI scene for Sight time `sightIndex` of `scene`: one Station per Sight time, all at the
 * truth, and the Sun as the one Target, in the direction `sunAt(truth, tₖ)` gives (apparent
 * altitude). Each Station's script starts 500 ms before its Sight time, with the scene's bias and
 * its added error, and the Declination of Sensors' model. Fails with `invalid_number` for an index
 * that is not one of the Sight times, and with the failure of the Sun wrapper or of UI.
 */
export function catalogueSceneAt(
  scene: NoniusScene,
  sightIndex: number,
  params: NoniusParameters,
): NoniusResult<CatalogueScene> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  const time = Number.isInteger(sightIndex) ? scene.sightTimesUtcMs[sightIndex] : undefined;
  if (time === undefined) return err('invalid_number', { field: 'sightIndex' });
  const sun = sunAt(scene.truth, time, params);
  if (!sun.ok) return sun;
  const stations: StationSpec[] = scene.sightTimesUtcMs.map((t, j) => ({
    id: `sight-${j + 1}`,
    name: `Sight ${j + 1}, ${utcClockText(t)}`,
    eastM: 0,
    northM: 0,
  }));
  const built = sceneFromOffsets({
    id: `${scene.id}-${sightIndex + 1}`,
    name: `${scene.name}, sight ${sightIndex + 1}`,
    origin: scene.truth,
    calibration: CATALOGUE_CALIBRATION,
    stations,
    targets: [
      {
        kind: 'sun',
        id: 'sun',
        label: 'Sun',
        azimuthRad: sun.value.trueAzimuthRad,
        apparentAltitudeRad: sun.value.apparentAltitudeRad,
        angularRadiusRad: SUN_RADIUS_RAD,
      },
    ],
  });
  if (!built.ok) return built;
  const made: Record<string, CatalogueScene['scripts'][string]> = {};
  for (const [j, t] of scene.sightTimesUtcMs.entries()) {
    const station = built.value.stations[j];
    if (station === undefined) return err('invalid_number', { field: 'stations' });
    const script = scriptForStation(built.value, station.id, 'sun', {
      startUtcMs: t - SCRIPT_LEAD_MS,
      altitudeBiasRad: scene.altitudeBiasRad + (scene.addedErrorRad[j] ?? 0),
      orientationNoiseSigmaRad: scene.orientationNoiseSigmaRad,
      frame: { kind: 'absolute', northErrorRad: 0, resets: [] },
    });
    if (!script.ok) return script;
    made[station.id] = script.value;
  }
  return ok({
    scene: built.value,
    scripts: made,
    aimTargetId: 'sun',
    kind: 'altitude',
    failure: null,
    description: scene.description,
  });
}
