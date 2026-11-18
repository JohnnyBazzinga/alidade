// Capture (Req 12, design §7.9): Sensors' capture of the Frozen sighting, with the Mark's Image
// angular sigma added to the sigma.

import { validateBearing } from '@alidade/core';
import {
  captureAltitude,
  captureBearing,
  MAX_CAPTURE_SIGMA_RAD,
  selectWindow,
} from '@alidade/sensors';
import { err, ok, type UiResult } from '../../result';
import { captureSpreadRad } from './capture-spread';
import { markAzimuthTermRad, sigmaWithMark } from './mark-altitude';
import type { SessionParameters } from './parameters';
import type { CaptureNorth, CapturedResult, FrozenSighting, SessionKind } from './session';

/**
 * The capture of a Frozen sighting. A failure of Sensors passes through (the Session stays
 * `frozen`). With no Mark the result equals Sensors' exactly (Req 12.5); with one, the sigma is
 * `hypot(σ, ε / cos h)` for a bearing and `hypot(σ, ε)` for an altitude (Req 12.3, 12.4).
 */
export function captureFrozen(
  kind: SessionKind,
  frozen: FrozenSighting,
  parameters: SessionParameters,
): UiResult<CapturedResult> {
  const { history, window, mark } = frozen;
  const selected = selectWindow(history.samples, window);
  if (!selected.ok) return selected;
  const common = {
    mark,
    yawReference: frozen.yawReference,
    calibration: mark === null ? null : mark.calibration,
    sampleCount: selected.value.length,
    window,
  };
  if (kind === 'altitude') {
    const altitude = captureAltitude({
      samples: history.samples,
      window,
      calibration: parameters.altitudeCalibration,
      ...(mark === null ? {} : { rayOffset: mark.offset }),
    });
    if (!altitude.ok) return altitude;
    const sigmaRad =
      mark === null
        ? altitude.value.sigmaRad
        : Math.hypot(altitude.value.sigmaRad, mark.imageSigmaRad);
    if (!Number.isFinite(sigmaRad)) return err('invalid_number', { field: 'sigmaRad' });
    return ok({
      kind: 'altitude',
      altitude: mark === null ? altitude.value : { ...altitude.value, sigmaRad },
      altitudeStdDevRad: altitude.value.sampleStdDevRad,
      ...common,
      declination: null,
      north: null,
      markSigmaRad: mark === null ? null : mark.imageSigmaRad,
    });
  }
  const positionFix = history.positionFix;
  if (positionFix === null) return err('position_unavailable');
  const bearing = captureBearing({
    id: `bearing-${frozen.frozenAtUtcMs}`,
    timeUtcMs: frozen.frozenAtUtcMs,
    samples: history.samples,
    frameResets: history.frameResets,
    window,
    ...(mark === null ? {} : { rayOffset: mark.offset }),
    ...(frozen.yawReference === null ? {} : { yawReference: frozen.yawReference }),
    yawReferenceMaxAgeMs: parameters.yawReferenceMaxAgeMs,
    headingSigmaRad: parameters.headingSigmaRad,
    ...(frozen.declination === null ? {} : { declination: frozen.declination }),
    positionFix,
    positionStalenessMs: parameters.positionStalenessMs,
    coarseLocationLimitM: parameters.coarseLocationLimitM,
  });
  if (!bearing.ok) return bearing;
  // What Sensors used (its table of North references): the Yaw reference when there is one, else
  // the phone's own compass; the Declination exactly when the North reference was magnetic.
  const y = frozen.yawReference;
  const declination = y === null || y.northReference === 'magnetic' ? frozen.declination : null;
  // `step` sets the source with the reference, so a reference without one is not a Session's.
  if (y !== null && frozen.yawReferenceSource === null) {
    return err('invalid_number', { field: 'yawReferenceSource' });
  }
  const north: CaptureNorth = {
    source: y === null ? 'phone-compass' : (frozen.yawReferenceSource ?? 'compass'),
    sigmaRad: y === null ? parameters.headingSigmaRad : y.sigmaRad,
  };
  const spread = captureSpreadRad({
    samples: history.samples,
    window,
    rayOffset: mark === null ? null : mark.offset,
    yawReference: y,
    declination,
  });
  if (!spread.ok) return spread;
  const details = { ...common, declination, north, azimuthSpreadRad: spread.value };
  if (mark === null) {
    return ok({ kind: 'bearing', bearing: bearing.value, ...details, markSigmaRad: null });
  }
  const sigma = sigmaWithMark(history, window, mark, bearing.value.azimuthSigmaRad, parameters);
  if (!sigma.ok) return sigma;
  if (!(sigma.value <= MAX_CAPTURE_SIGMA_RAD)) return err('too_unsteady');
  const term = markAzimuthTermRad(history, window, mark, parameters);
  if (!term.ok) return term;
  const marked = { ...bearing.value, azimuthSigmaRad: sigma.value };
  const valid = validateBearing(marked);
  if (!valid.ok) return valid;
  return ok({ kind: 'bearing', bearing: marked, ...details, markSigmaRad: term.value });
}
