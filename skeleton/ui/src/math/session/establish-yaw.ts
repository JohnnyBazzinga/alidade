// Establishing north (Req 11.1, design §7.8, D24): a Yaw reference from the compass (live only) or
// from a known azimuth (live, on the Camera axis, or frozen, over the Mark).

import {
  yawReferenceFromCompass,
  yawReferenceFromKnownAzimuth,
  type YawReference,
} from '@alidade/sensors';
import type { UiResult } from '../../result';
import { sightingWindowOf } from './freeze';
import { sigmaWithMark } from './mark-altitude';
import type { SessionParameters } from './parameters';
import type { YawSource } from './session-events';
import type { FrozenSighting, Session } from './session';

/**
 * A Yaw reference over the live history (`frozen` null) or over the Frozen sighting. A failure of
 * Sensors passes through, and the caller keeps the reference it held (Req 11.1). `compass_unreliable`
 * at a Screen angle other than 0 is Sensors'.
 */
export function establishYaw(
  session: Session,
  frozen: FrozenSighting | null,
  from: YawSource,
  parameters: SessionParameters,
  timeUtcMs: number,
): UiResult<YawReference> {
  if (frozen === null) {
    const window = sightingWindowOf(parameters, timeUtcMs);
    if (from.kind === 'compass') {
      return yawReferenceFromCompass({
        samples: session.history.samples,
        frameResets: session.history.frameResets,
        window,
        headingSigmaRad: parameters.headingSigmaRad,
      });
    }
    return yawReferenceFromKnownAzimuth({
      samples: session.history.samples,
      frameResets: session.history.frameResets,
      window,
      knownAzimuthRad: from.azimuthRad,
      knownSigmaRad: from.sigmaRad,
      northReference: from.northReference,
    });
  }
  // In `frozen`: only a known azimuth is offered (the caller checks), over the Frozen history and
  // window, with the Mark's Ray offset when there is one.
  if (from.kind === 'compass') return { ok: false, reason: 'action_not_available' };
  const { mark } = frozen;
  let knownSigmaRad = from.sigmaRad;
  if (mark !== null) {
    const combined = sigmaWithMark(frozen.history, frozen.window, mark, from.sigmaRad, parameters);
    if (!combined.ok) return combined;
    knownSigmaRad = combined.value;
  }
  return yawReferenceFromKnownAzimuth({
    samples: frozen.history.samples,
    frameResets: frozen.history.frameResets,
    window: frozen.window,
    knownAzimuthRad: from.azimuthRad,
    knownSigmaRad,
    northReference: from.northReference,
    ...(mark === null ? {} : { rayOffset: mark.offset }),
  });
}
