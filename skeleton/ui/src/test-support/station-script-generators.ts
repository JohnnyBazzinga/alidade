// Generator of the scene-building property (design §8 `stationScriptCase`, P-17.15; test support,
// not exported).

import fc from 'fast-check';
import { sceneFromOffsets, type TargetSpec } from '../math/scene/scene-from-offsets';
import type { StationScriptOptions } from '../math/scene/script-for-station';
import type { SyntheticScene } from '../math/scene/scene';
import { targetDirection } from '../math/scene/target-direction';
import { closed, uniform, uniformInteger } from './generators';

const DEG = Math.PI / 180;
/** 2026-01-01T00:00:00Z and 2028-12-31T00:00:00Z: inside the years of the Declination model. */
const START_MIN_UTC_MS = 1_767_225_600_000;
const START_MAX_UTC_MS = 1_861_833_600_000;

export interface StationScriptCase {
  readonly scene: SyntheticScene;
  readonly stationId: string;
  readonly aimTargetId: string;
  readonly options: StationScriptOptions;
}

/**
 * `stationScriptCase`: an origin at latitude [-60°, 60°] and any longitude; 2 or 3 Stations and 1
 * to 4 landmarks at offsets within ±35 000 m on each axis (about 50 km from the origin at the
 * corner), heights in [-5000, 5000] m (ends drawn); one landmark draw in eight is placed 1 to 50 m
 * from Station 0 and at least 4 000 m up or down, so that the altitude clamp is exercised often;
 * a Sun one draw in three (any azimuth, altitude [-80°, 80°], radius [0.1°, 1°]); a Station and a
 * Target drawn from them; options, each present or absent: `startUtcMs` in [2026-01-01,
 * 2028-12-31], noise in [0, 2°], an Absolute frame with a north error in [-10°, 10°] or a
 * Relative frame with a zero in [0, 2π), a fix accuracy in [1, 840] m. Cases with a Target under
 * 1 m from the chosen Station are discarded (an example covers `coincident_positions`).
 */
export function stationScriptCase(): fc.Arbitrary<StationScriptCase> {
  const offset = closed(-35_000, 35_000);
  const landmark = fc.oneof(
    {
      weight: 7,
      arbitrary: fc.record({
        near: fc.constant(false),
        eastM: offset,
        northM: offset,
        heightM: closed(-5000, 5000),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        near: fc.constant(true),
        eastM: uniform(1, 50),
        northM: uniform(-50, 50),
        heightM: fc.oneof(closed(4000, 5000), closed(-5000, -4000)),
      }),
    },
  );
  return fc
    .record({
      lat: closed(-60 * DEG, 60 * DEG),
      lon: uniform(-Math.PI, Math.PI),
      stations: fc.array(fc.record({ eastM: offset, northM: offset }), {
        minLength: 2,
        maxLength: 3,
      }),
      landmarks: fc.array(landmark, { minLength: 1, maxLength: 4 }),
      sun: fc.option(
        fc.record({
          azimuthRad: uniform(0, 2 * Math.PI),
          apparentAltitudeRad: closed(-80 * DEG, 80 * DEG),
          angularRadiusRad: closed(0.1 * DEG, DEG),
        }),
        { freq: 3 },
      ),
      stationIndex: uniformInteger(0, 2),
      targetIndex: uniformInteger(0, 5),
      startUtcMs: fc.option(closed(START_MIN_UTC_MS, START_MAX_UTC_MS), { freq: 2 }),
      noiseSigmaRad: fc.option(closed(0, 2 * DEG), { freq: 2 }),
      frame: fc.option(
        fc.oneof(
          closed(-10 * DEG, 10 * DEG).map((northErrorRad) => ({
            kind: 'absolute' as const,
            northErrorRad,
            resets: [],
          })),
          uniform(0, 2 * Math.PI).map((zeroRad) => ({
            kind: 'relative' as const,
            zeroRad,
            resets: [],
          })),
        ),
        { freq: 2 },
      ),
      fixAccuracyM: fc.option(closed(1, 840), { freq: 2 }),
    })
    .map((d) => {
      const first = d.stations[0] ?? { eastM: 0, northM: 0 };
      const targets: TargetSpec[] = d.landmarks.map((l, i) => ({
        kind: 'landmark',
        id: `t${i}`,
        label: `T${i}`,
        eastM: l.near ? first.eastM + l.eastM : l.eastM,
        northM: l.near ? first.northM + l.northM : l.northM,
        heightM: l.heightM,
      }));
      if (d.sun !== null) targets.push({ kind: 'sun', id: 'sun', label: 'Sun', ...d.sun });
      const built = sceneFromOffsets({
        id: 'case',
        name: 'Case',
        origin: { latRad: d.lat, lonRad: d.lon },
        calibration: {
          fovRad: 70 * DEG,
          fovAxis: 'diagonal',
          fovSigmaRad: DEG,
          imageWidthSourcePx: 720,
          imageHeightSourcePx: 1280,
        },
        stations: d.stations.map((s, i) => ({ id: `s${i}`, name: `S${i}`, ...s })),
        targets,
      });
      return { built, d };
    })
    .filter(({ built, d }) => {
      if (!built.ok) return false;
      const station = built.value.stations[d.stationIndex % built.value.stations.length];
      const target = built.value.targets[d.targetIndex % built.value.targets.length];
      return station !== undefined && target !== undefined && targetDirection(station, target).ok;
    })
    .map(({ built, d }) => {
      if (!built.ok) throw new Error('filtered');
      const station = built.value.stations[d.stationIndex % built.value.stations.length];
      const target = built.value.targets[d.targetIndex % built.value.targets.length];
      if (station === undefined || target === undefined) throw new Error('filtered');
      const options: StationScriptOptions = {
        ...(d.startUtcMs === null ? {} : { startUtcMs: d.startUtcMs }),
        ...(d.noiseSigmaRad === null ? {} : { orientationNoiseSigmaRad: d.noiseSigmaRad }),
        ...(d.frame === null ? {} : { frame: d.frame }),
        ...(d.fixAccuracyM === null ? {} : { fixAccuracyM: d.fixAccuracyM }),
      };
      return { scene: built.value, stationId: station.id, aimTargetId: target.id, options };
    });
}
