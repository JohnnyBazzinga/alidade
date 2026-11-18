// Public API of @alidade/sensors. Every export goes through this file (Req 1.6); nothing from
// `test-support` is exported, and neither are the internal helpers (`ok`, `err`,
// `rotationMatrix`, `checkDirection`, `wmmField`, `wmmDeclinationSigmaRad`, `ListenerSet`,
// `PendingStarts`, `rss`). The rules a user interface must apply exactly as the captures do are
// exported (Req 1.10): `selectWindow`, `resetBetween`, `summariseAzimuths`, `summariseAltitudes`,
// `invalidates` and `SENSOR_REASONS`; the two summaries were made total first (design D25).
//
// Failures are values: every fallible function returns a `SensorResult`, whose closed set of
// reasons, `SensorReason`, is Core's `Reason` plus the reasons documented in `sensor-result.ts`
// (Req 11.1).

export { SENSOR_REASONS } from './sensor-result';
export type { SensorFailure, SensorReason, SensorResult } from './sensor-result';

export {
  COARSE_LOCATION_LIMIT_M,
  FRAME_RESET_RETENTION_MS,
  HEADING_SIGMA_RAD,
  LISTENING_TIMEOUT_MS,
  MIN_SAMPLE_COUNT,
  POSITION_CONFIDENCE_SCALE,
  POSITION_STALENESS_MS,
  POSITION_TIMEOUT_MS,
  SAMPLE_RETENTION_MS,
  SAMPLE_STALENESS_MS,
  SIGHTING_WINDOW_LENGTH_MS,
  UNCALIBRATED_ALTITUDE,
  YAW_REFERENCE_MAX_AGE_MS,
} from './defaults';
export type { AltitudeCalibration } from './defaults';

export { cameraAxis, directionApparentAltitudeRad, directionAzimuthRad } from './rotation';
export type { DeviceRotation, EnuDirection } from './rotation';
export { MAX_RAY_OFFSET_RAD, offAxisRay, rayDirection, rayOffsetOfDirection } from './ray';
export type { RayOffset } from './ray';

export { orientationSampleFromEvent } from './orientation-sample';
export type {
  OrientationFrame,
  OrientationSample,
  RawOrientationEvent,
} from './orientation-sample';
export { invalidates } from './frame-reset';
export type { FrameResetCause, FrameResetEvent } from './frame-reset';
export { resetBetween, selectWindow } from './sighting-window';
export type { SightingWindow } from './sighting-window';
export { summariseAltitudes, summariseAzimuths } from './circular-summary';
export type { AltitudeSummary, AzimuthSummary } from './circular-summary';

export {
  applyYawReference,
  yawReferenceFromCompass,
  yawReferenceFromKnownAzimuth,
} from './yaw-reference';
export type {
  CompassYawInput,
  KnownAzimuthYawInput,
  NorthReference,
  ReferencedAzimuth,
  YawReference,
} from './yaw-reference';

export { declinationAt, trueAzimuthFromMagnetic } from './declination';
export type { Declination } from './declination';

export { checkPositionFix, positionFixFromReading } from './position-fix';
export type { GeolocationReading, PositionFix, PositionFixLimits } from './position-fix';

export {
  captureAltitude,
  captureBearing,
  MAX_CAPTURE_SIGMA_RAD,
  MIN_CAPTURE_SIGMA_RAD,
} from './capture';
export type { AltitudeCapture, AltitudeCaptureInput, BearingCaptureInput } from './capture';

export {
  addFrameReset,
  addOrientationSample,
  addPositionFix,
  createSampleHistory,
} from './sample-history';
export type { SampleHistory, SampleHistoryRetention } from './sample-history';

export type { SensorSource, SensorSourceOptions, Unsubscribe } from './sensor-source';
export { browserEnvironment, systemClock } from './browser/browser-environment';
export type {
  BrowserEnvironment,
  GeolocationLike,
  WindowEventType,
} from './browser/browser-environment';
export { createBrowserSensorSource } from './browser/browser-sensor-source';

export { createSimulator, MAX_SIMULATOR_ADVANCE_MS } from './simulator/simulator';
export type { SimulatorControls } from './simulator/simulator';
export type {
  PageResetCause,
  PoseKeyframe,
  SimulatorScript,
  TruePose,
} from './simulator/simulator-script';
