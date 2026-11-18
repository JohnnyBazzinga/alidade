// The Live readout (Req 9, design §7.7, D8): built from Sensors' primitives, and repeating none of
// their rules. It cannot call `captureBearing`: a readout has no Position fix, and it shows a
// magnetic azimuth where the capture would fail with `declination_unknown`. P-9.9 holds it to the
// capture.

import {
  applyYawReference,
  directionApparentAltitudeRad,
  directionAzimuthRad,
  rayDirection,
  resetBetween,
  selectWindow,
  summariseAltitudes,
  summariseAzimuths,
  trueAzimuthFromMagnetic,
  type Declination,
  type OrientationSample,
  type SampleHistory,
  type YawReference,
} from '@alidade/sensors';
import { err, ok, type UiFailure, type UiResult } from '../../result';
import type { LiveAzimuth, LiveReadout, Steadiness } from './session';
import type { SessionParameters } from './parameters';
import { yawStatus } from './yaw-status';

/**
 * `steady` at or below `steadyBelowRad`, `unsteady` above `unsteadyAboveRad`, else `settling`
 * (Req 9.4). With no Spread (no azimuth) it is `unsteady`.
 */
export function steadiness(
  spreadRad: number | null,
  parameters: Pick<SessionParameters, 'steadyBelowRad' | 'unsteadyAboveRad'>,
): Steadiness {
  if (spreadRad === null || !Number.isFinite(spreadRad)) return 'unsteady';
  if (spreadRad <= parameters.steadyBelowRad) return 'steady';
  return spreadRad > parameters.unsteadyAboveRad ? 'unsteady' : 'settling';
}

interface AzimuthOutcome {
  readonly azimuth: UiResult<LiveAzimuth>;
  readonly spreadRad: number | null;
}

function failedAzimuth(failure: UiFailure): AzimuthOutcome {
  return { azimuth: failure, spreadRad: null };
}

function azimuthOf(
  samples: readonly OrientationSample[],
  resets: SampleHistory['frameResets'],
  yawReference: YawReference | null,
  declination: Declination | null,
  parameters: SessionParameters,
  endUtcMs: number,
): AzimuthOutcome {
  const first = samples[0];
  if (first === undefined) return failedAzimuth(err('insufficient_samples'));
  const frame = first.frame;
  // The window has no single frame if its samples differ (Req 9.2, Sensors 8.8).
  if (samples.some((sample) => sample.frame !== frame)) return failedAzimuth(err('frame_reset'));
  const startUtcMs = endUtcMs - parameters.windowLengthMs;
  if (frame === 'relative' && resetBetween(resets, startUtcMs, endUtcMs)) {
    return failedAzimuth(err('frame_reset'));
  }
  const status = yawStatus(yawReference, resets, endUtcMs, parameters.yawReferenceMaxAgeMs);
  const usable =
    yawReference !== null && status.status === 'valid' && yawReference.frame === frame
      ? yawReference
      : null;

  const azimuthsRad: number[] = [];
  let reference: 'true' | 'magnetic' | 'relative' =
    usable !== null ? usable.northReference : frame === 'absolute' ? 'magnetic' : 'relative';
  for (const sample of samples) {
    const direction = rayDirection(sample.rotation);
    if (!direction.ok) return failedAzimuth(direction);
    const frameAzimuth = directionAzimuthRad(direction.value);
    if (!frameAzimuth.ok) return failedAzimuth(frameAzimuth);
    let azimuthRad = frameAzimuth.value;
    if (usable !== null) {
      const referenced = applyYawReference(azimuthRad, usable);
      if (!referenced.ok) return failedAzimuth(referenced);
      azimuthRad =
        referenced.value.northReference === 'true'
          ? referenced.value.azimuthRad
          : referenced.value.magneticAzimuthRad;
    }
    if (reference === 'magnetic' && declination !== null) {
      // `true` only when a Declination is held and the azimuth is magnetic (Req 9.2).
      const trueAzimuth = trueAzimuthFromMagnetic(azimuthRad, declination);
      if (!trueAzimuth.ok) return failedAzimuth(trueAzimuth);
      azimuthRad = trueAzimuth.value;
    }
    azimuthsRad.push(azimuthRad);
  }
  if (reference === 'magnetic' && declination !== null) reference = 'true';
  const summary = summariseAzimuths(azimuthsRad);
  if (!summary.ok) {
    return failedAzimuth(summary.reason === 'undefined_mean' ? err('too_unsteady') : summary);
  }
  return {
    azimuth: ok({ northReference: reference, azimuthRad: summary.value.meanRad }),
    spreadRad: summary.value.spreadRad,
  };
}

/**
 * The Live readout of the Sighting window that ends at `endUtcMs`, or `null` when the window holds
 * no sample (Req 9.6). The readout shows what it has, so it asks Sensors' `selectWindow` for one
 * sample and a staleness limit equal to the window's own length (which no selected sample can
 * exceed), and reports staleness itself against `sampleStalenessMs` (design G6).
 */
export function liveReadout(
  history: SampleHistory,
  yawReference: YawReference | null,
  declination: Declination | null,
  parameters: SessionParameters,
  endUtcMs: number,
): LiveReadout | null {
  const selected = selectWindow(history.samples, {
    endUtcMs,
    windowLengthMs: parameters.windowLengthMs,
    minSampleCount: 1,
    sampleStalenessMs: parameters.windowLengthMs,
  });
  if (!selected.ok) return null;
  const samples = selected.value;
  let newestSampleUtcMs = Number.NEGATIVE_INFINITY;
  for (const sample of samples) newestSampleUtcMs = Math.max(newestSampleUtcMs, sample.timeUtcMs);

  const altitudesRad: number[] = [];
  let altitudeFailure: UiResult<number> | null = null;
  for (const sample of samples) {
    const direction = rayDirection(sample.rotation);
    if (!direction.ok) {
      altitudeFailure = direction;
      break;
    }
    const altitude = directionApparentAltitudeRad(direction.value);
    if (!altitude.ok) {
      altitudeFailure = altitude;
      break;
    }
    altitudesRad.push(altitude.value);
  }
  let apparentAltitudeRad: UiResult<number>;
  let altitudeStdDevRad: number | null = null;
  if (altitudeFailure !== null) {
    apparentAltitudeRad = altitudeFailure;
  } else {
    const summary = summariseAltitudes(altitudesRad);
    if (summary.ok) {
      apparentAltitudeRad = ok(summary.value.meanRad + parameters.altitudeCalibration.offsetRad);
      altitudeStdDevRad = summary.value.stdDevRad;
    } else {
      apparentAltitudeRad = summary;
    }
  }

  const outcome = azimuthOf(
    samples,
    history.frameResets,
    yawReference,
    declination,
    parameters,
    endUtcMs,
  );
  return {
    timeUtcMs: endUtcMs,
    sampleCount: samples.length,
    newestSampleUtcMs,
    azimuth: outcome.azimuth,
    apparentAltitudeRad,
    azimuthSpreadRad: outcome.spreadRad,
    altitudeStdDevRad,
    steadiness: steadiness(outcome.spreadRad, parameters),
    stale: endUtcMs - newestSampleUtcMs > parameters.sampleStalenessMs,
  };
}

/** The readout with `stale` recomputed at `nowUtcMs` (a `tick` that does not republish). */
export function withStaleness(
  readout: LiveReadout,
  nowUtcMs: number,
  parameters: Pick<SessionParameters, 'sampleStalenessMs'>,
): LiveReadout {
  const stale = nowUtcMs - readout.newestSampleUtcMs > parameters.sampleStalenessMs;
  return stale === readout.stale ? readout : { ...readout, stale };
}
