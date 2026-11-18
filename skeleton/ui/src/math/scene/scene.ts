// The Synthetic scene (Req 16.1, design §7.13): an invented place, as plain data. Every scene,
// Station and Target of this package is synthetic (Req 17.1).

import { isSupportedPosition, type Position } from '@alidade/core';
import { err, ok, type UiResult } from '../../result';
import { checkCalibration, type CameraCalibration } from '../camera-calibration';
import { fromDeg } from '../degrees';

export interface Station {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
}

/**
 * A landmark (its true direction from a Station comes from geodesy, with an apparent altitude of
 * `atan2(heightM, distanceM)`: a synthetic simplification that ignores the curvature of the Earth
 * and refraction), or the Sun (its direction is given).
 */
export type Target =
  | {
      readonly kind: 'landmark';
      readonly id: string;
      readonly label: string;
      readonly position: Position;
      /** Height above the observer, in metres. */
      readonly heightM: number;
    }
  | {
      readonly kind: 'sun';
      readonly id: string;
      readonly label: string;
      /** True azimuth. */
      readonly azimuthRad: number;
      readonly apparentAltitudeRad: number;
      readonly angularRadiusRad: number;
    };

export interface SyntheticScene {
  readonly id: string;
  readonly name: string;
  /** The calibration of the synthetic camera. */
  readonly calibration: CameraCalibration;
  readonly stations: readonly Station[];
  readonly targets: readonly Target[];
}

/** The Sun's altitude limit in a scene: a pose cannot aim beyond 80° (Sensors 12.10). */
const MAX_SUN_ALTITUDE_RAD = fromDeg(80);

function text(x: unknown): boolean {
  return typeof x === 'string' && x.trim() !== '';
}

/** Validates a scene, naming the first invalid field, or the id of an unsupported Position. */
export function checkScene(s: SyntheticScene): UiResult<SyntheticScene> {
  if (!text(s.id)) return err('invalid_number', { field: 'id' });
  if (!text(s.name)) return err('invalid_number', { field: 'name' });
  const calibration = checkCalibration(s.calibration);
  if (!calibration.ok) return calibration;
  if (s.stations.length < 2) return err('invalid_number', { field: 'stations' });
  const stationIds = new Set<string>();
  for (const station of s.stations) {
    if (!text(station.id) || stationIds.has(station.id))
      return err('invalid_number', { field: 'stations.id', id: station.id });
    stationIds.add(station.id);
    if (!isSupportedPosition(station.position))
      return err('unsupported_position', { id: station.id });
  }
  const targetIds = new Set<string>();
  for (const target of s.targets) {
    if (!text(target.id) || targetIds.has(target.id))
      return err('invalid_number', { field: 'targets.id', id: target.id });
    targetIds.add(target.id);
    if (target.kind === 'landmark') {
      if (!isSupportedPosition(target.position))
        return err('unsupported_position', { id: target.id });
      if (!Number.isFinite(target.heightM))
        return err('invalid_number', { field: 'heightM', id: target.id });
    } else {
      if (!Number.isFinite(target.azimuthRad))
        return err('invalid_number', { field: 'azimuthRad', id: target.id });
      if (
        !Number.isFinite(target.apparentAltitudeRad) ||
        Math.abs(target.apparentAltitudeRad) > MAX_SUN_ALTITUDE_RAD
      ) {
        return err('invalid_number', { field: 'apparentAltitudeRad', id: target.id });
      }
      if (
        !Number.isFinite(target.angularRadiusRad) ||
        !(target.angularRadiusRad > 0) ||
        target.angularRadiusRad >= Math.PI / 4
      ) {
        return err('invalid_number', { field: 'angularRadiusRad', id: target.id });
      }
    }
  }
  return ok(s);
}
