// Scenes from offsets in metres (Req 17.13, design D31.8): the catalogue's own builder, now
// exported for the apps. A Position is built from the scene's origin by an offset on its Local
// plane (Core's `unprojectToLocalPlane`); the result goes through `checkScene`.

import { unprojectToLocalPlane, type Position } from '@alidade/core';
import type { UiResult } from '../../result';
import type { CameraCalibration } from '../camera-calibration';
import { checkScene, type Station, type SyntheticScene, type Target } from './scene';

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
