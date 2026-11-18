// Generators of the scene properties (design §8 `sceneCase`, `dragCase`; test support, not
// exported). Scenes come from the catalogue's own builder, with random offsets.

import {
  createSimulator,
  type DeviceRotation,
  type OrientationSample,
  type TruePose,
} from '@alidade/sensors';
import fc from 'fast-check';
import { sceneFromOffsets, type TargetSpec } from '../math/scene/catalogue';
import type { SyntheticScene } from '../math/scene/scene';
import { targetDirection } from '../math/scene/target-direction';
import { closed, layoutCase, uniform, uniformInteger, type LayoutCase } from './generators';
import { fixtureScript } from './session-fixtures';

const DEG = Math.PI / 180;

/**
 * A pose: azimuth in [0, 2π), apparent altitude in [-max, max] (ends drawn; max 80° unless
 * stated), roll in [-π, π),
 * with one draw in eight near the gimbal lock (altitude within 1e-6 rad of 0 with a roll of
 * ±π/2, where the Euler angles change fastest).
 */
export function pose(maxAltitudeRad = 80 * DEG): fc.Arbitrary<TruePose> {
  return fc.oneof(
    {
      weight: 7,
      arbitrary: fc.record({
        azimuthRad: uniform(0, 2 * Math.PI),
        apparentAltitudeRad: closed(-maxAltitudeRad, maxAltitudeRad),
        rollRad: uniform(-Math.PI, Math.PI),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        azimuthRad: uniform(0, 2 * Math.PI),
        apparentAltitudeRad: closed(-1e-6, 1e-6),
        rollRad: fc.constantFrom(Math.PI / 2, -Math.PI / 2),
      }),
    },
  );
}

export interface SceneCase {
  readonly scene: SyntheticScene;
  readonly stationIndex: number;
  readonly pose: TruePose;
  readonly layout: LayoutCase;
}

/**
 * `sceneCase`: an origin at latitude [-60°, 60°] and any longitude; 2 or 3 Stations and 1 to 5
 * landmarks at offsets within 20 km (each axis within ±14 km), landmarks at heights in
 * [-500, 2000] m (or all 0 with `flat`), and a Sun one draw in three (azimuth any in [0, 2π),
 * altitude [-80°, 80°], radius [0.1°, 1°]); a pose (`pose`); a `layoutCase`, whose calibration is
 * the scene's. Cases with a Target under 1 m from the chosen Station are discarded (an example
 * covers `coincident_positions`).
 */
export function sceneCase(flat = false, maxAltitudeRad = 80 * DEG): fc.Arbitrary<SceneCase> {
  const offset = closed(-14_000, 14_000);
  return fc
    .record({
      lat: closed(-60 * DEG, 60 * DEG),
      lon: uniform(-Math.PI, Math.PI),
      stations: fc.array(fc.record({ eastM: offset, northM: offset }), {
        minLength: 2,
        maxLength: 3,
      }),
      landmarks: fc.array(
        fc.record({
          eastM: offset,
          northM: offset,
          heightM: flat ? fc.constant(0) : closed(-500, 2000),
        }),
        { minLength: 1, maxLength: 5 },
      ),
      sun: flat
        ? fc.constant(null)
        : fc.option(
            fc.record({
              azimuthRad: uniform(0, 2 * Math.PI),
              apparentAltitudeRad: closed(-80 * DEG, 80 * DEG),
              angularRadiusRad: closed(0.1 * DEG, DEG),
            }),
            { freq: 2 },
          ),
      stationIndex: uniformInteger(0, 2),
      pose: pose(maxAltitudeRad),
      layout: layoutCase(),
    })
    .map((d) => {
      const targets: TargetSpec[] = d.landmarks.map((l, i) => ({
        kind: 'landmark',
        id: `t${i}`,
        label: `T${i}`,
        ...l,
      }));
      if (d.sun !== null) targets.push({ kind: 'sun', id: 'sun', label: 'Sun', ...d.sun });
      const built = sceneFromOffsets({
        id: 'case',
        name: 'Case',
        origin: { latRad: d.lat, lonRad: d.lon },
        calibration: d.layout.calibration,
        stations: d.stations.map((s, i) => ({ id: `s${i}`, name: `S${i}`, ...s })),
        targets,
      });
      return { built, d };
    })
    .filter(({ built, d }) => {
      if (!built.ok) return false;
      const station = built.value.stations[d.stationIndex % built.value.stations.length];
      return (
        station !== undefined && built.value.targets.every((t) => targetDirection(station, t).ok)
      );
    })
    .map(({ built, d }) => {
      if (!built.ok) throw new Error('filtered');
      return {
        scene: built.value,
        stationIndex: d.stationIndex % built.value.stations.length,
        pose: d.pose,
        layout: d.layout,
      };
    });
}

const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

/**
 * A noise-free Absolute-frame Simulator with Declination 0, aimed at `pose`: its true rotation
 * (Sensors 12.12) and the next Orientation sample it delivers.
 */
export function simulatedPose(p: TruePose): {
  trueRotation: DeviceRotation;
  sample: OrientationSample;
} {
  const script = fixtureScript({ declinationRad: 0 });
  const created = createSimulator(script, 1, OPTIONS);
  if (!created.ok) throw new Error(created.reason);
  const { source, controls } = created.value;
  const aimed = controls.aim(p);
  if (!aimed.ok) throw new Error(aimed.reason);
  const rotation = controls.trueRotation();
  if (!rotation.ok) throw new Error(rotation.reason);
  let sample: OrientationSample | null = null;
  source.onOrientation((r) => {
    if (r.ok && sample === null) sample = r.value;
  });
  void source.startOrientation();
  controls.advanceTo(script.startUtcMs + script.eventIntervalMs);
  source.stop();
  if (sample === null) throw new Error('no sample');
  return { trueRotation: rotation.value, sample };
}

/** `dragCase`: a `pose`, drags dx, dy in [-4096, 4096] px (0 drawn), F in [50, 20 000] px. */
export function dragCase(): fc.Arbitrary<{
  pose: TruePose;
  dxPx: number;
  dyPx: number;
  focalPx: number;
}> {
  const drag = fc.oneof(
    { weight: 1, arbitrary: fc.constant(0) },
    { weight: 9, arbitrary: closed(-4096, 4096) },
  );
  return fc.record({ pose: pose(), dxPx: drag, dyPx: drag, focalPx: closed(50, 20_000) });
}
