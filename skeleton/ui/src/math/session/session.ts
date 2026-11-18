// The Session: plain, immutable data (Req 8.1, design §6). `step` (step.ts) is the only function
// that advances it.

import type {
  AltitudeCapture,
  Declination,
  RayOffset,
  SampleHistory,
  SightingWindow,
  YawReference,
} from '@alidade/sensors';
import type { Bearing } from '@alidade/core';
import type { UiResult } from '../../result';
import type { UiReason } from '../../reasons';
import type { CameraCalibration } from '../camera-calibration';

/** What one Session captures: a bearing (Vigia) or an altitude (Nonius). */
export type SessionKind = 'bearing' | 'altitude';

export type SessionStateKind =
  'permission' | 'starting' | 'live' | 'frozen' | 'captured' | 'failed';

/**
 * A failure the Session records, with the time of the event (Req 8.7): in `failure` when the
 * state is `failed`, otherwise as the Notice. `reason`, `field`, `id`, `reportedAccuracyM` and
 * `errorName` are those of the failure, unchanged.
 */
export interface StampedFailure {
  readonly reason: UiReason;
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;
  readonly errorName?: string;
  readonly atUtcMs: number;
}

/** A failure the Session records without changing its state; one at a time (design D23). */
export type Notice = StampedFailure;

/** The Ray offset the user chose by tapping the frozen image, with what it is made of. */
export interface Mark {
  readonly offset: RayOffset;
  /** The Image angular sigma of the tapped point (Req 6). */
  readonly imageSigmaRad: number;
  /** The calibration the tap was turned into an offset with, kept for the captured result. */
  readonly calibration: CameraCalibration;
}

/**
 * Where a Yaw reference came from: the `establishYaw` event that set it (Req 13.5). Sensors'
 * `YawReference` does not say, so the Session keeps it beside the reference: `null` exactly when
 * there is no reference.
 */
export type YawReferenceSource = 'compass' | 'known-azimuth';

/** The sighting kept at a Freeze; later samples never change it (Req 10.3, design D6). */
export interface FrozenSighting {
  readonly history: SampleHistory;
  readonly window: SightingWindow;
  readonly yawReference: YawReference | null;
  readonly yawReferenceSource: YawReferenceSource | null;
  readonly declination: Declination | null;
  readonly mark: Mark | null;
  readonly frozenAtUtcMs: number;
}

export type Steadiness = 'steady' | 'settling' | 'unsteady';

/** An azimuth with the North reference it has: `relative` has none (Req 9.2). */
export interface LiveAzimuth {
  readonly northReference: 'true' | 'magnetic' | 'relative';
  readonly azimuthRad: number;
}

/** The numbers shown while the Session is live (Req 9.1). */
export interface LiveReadout {
  readonly timeUtcMs: number;
  readonly sampleCount: number;
  readonly newestSampleUtcMs: number;
  readonly azimuth: UiResult<LiveAzimuth>;
  readonly apparentAltitudeRad: UiResult<number>;
  readonly azimuthSpreadRad: number | null;
  readonly altitudeStdDevRad: number | null;
  readonly steadiness: Steadiness;
  readonly stale: boolean;
}

/**
 * The north part of a bearing's sigma (Req 13.5): the phone's own compass on the Absolute frame
 * with no Yaw reference (the heading 1-sigma of the parameters), or the Yaw reference's 1-sigma
 * with where it came from. The Declination is a part of its own.
 */
export interface CaptureNorth {
  readonly source: 'phone-compass' | YawReferenceSource;
  readonly sigmaRad: number;
}

/** What a capture carries, so that the screen can show what its uncertainty is made of (Req 12.6). */
export interface CaptureDetails {
  readonly mark: Mark | null;
  readonly yawReference: YawReference | null;
  /** The Declination Sensors used: `null` when the North reference was true (or an altitude). */
  readonly declination: Declination | null;
  readonly calibration: CameraCalibration | null;
  readonly sampleCount: number;
  readonly window: SightingWindow;
  /** The north part of a bearing's sigma; `null` for an altitude. */
  readonly north: CaptureNorth | null;
  /**
   * The lens-and-tap term as it enters the sigma: `ε / cos h` for a bearing, `ε` for an altitude
   * (Req 12.3, 12.4); `null` with no Mark.
   */
  readonly markSigmaRad: number | null;
}

export type CapturedResult = CaptureDetails &
  (
    | {
        readonly kind: 'bearing';
        readonly bearing: Bearing;
        /** The Spread of the azimuths, as Sensors summarised them for this capture (Req 12.6). */
        readonly azimuthSpreadRad: number;
      }
    | {
        readonly kind: 'altitude';
        readonly altitude: AltitudeCapture;
        /** The altitudes' standard deviation, Sensors' `sampleStdDevRad` (Req 12.6). */
        readonly altitudeStdDevRad: number;
      }
  );

export interface Session {
  readonly kind: SessionKind;
  readonly state: SessionStateKind;
  readonly history: SampleHistory;
  readonly yawReference: YawReference | null;
  readonly yawReferenceSource: YawReferenceSource | null;
  readonly declination: Declination | null;
  readonly readout: LiveReadout | null;
  readonly lastReadoutUtcMs: number | null;
  /** The largest event time seen. */
  readonly nowUtcMs: number | null;
  readonly frozen: FrozenSighting | null;
  readonly captured: CapturedResult | null;
  readonly failure: StampedFailure | null;
  readonly notice: Notice | null;
}
