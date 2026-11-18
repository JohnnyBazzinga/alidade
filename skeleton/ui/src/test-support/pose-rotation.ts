// The true Device rotation of a pose, read from a noise-free Simulator aimed at it (Sensors 12.12;
// test support, not exported). The UI has no rotation matrix of its own (Req 16.4).

import { createSimulator, type DeviceRotation, type TruePose } from '@alidade/sensors';
import { fixtureScript } from './session-fixtures';

const OPTIONS = { listeningTimeoutMs: 3000, positionTimeoutMs: 30_000, positionConfidenceScale: 1 };

export function rotationOfPose(pose: TruePose): DeviceRotation {
  const created = createSimulator(fixtureScript({ declinationRad: 0 }), 1, OPTIONS);
  if (!created.ok) throw new Error(created.reason);
  const aimed = created.value.controls.aim(pose);
  if (!aimed.ok) throw new Error(aimed.reason);
  const rotation = created.value.controls.trueRotation();
  if (!rotation.ok) throw new Error(rotation.reason);
  return rotation.value;
}
