// Public API of @alidade/sensors. Every export goes through this file (Req 1.6); nothing from
// `test-support` is exported, and neither are the internal helpers (`ok`, `err`,
// `rotationMatrix`, `wmmField`, `wmmDeclinationSigmaRad`, `ListenerSet`, `PendingStarts`,
// `summariseAzimuths`, `summariseAltitudes`, `rss`). The three summaries are not total on their
// own (design §7.5); they are exported only once they are made total.
//
// Failures are values: every fallible function returns a `SensorResult`, whose closed set of
// reasons, `SensorReason`, is Core's `Reason` plus the reasons documented in `sensor-result.ts`
// (Req 11.1).

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
export { MAX_RAY_OFFSET_RAD, offAxisRay, rayDirection } from './ray';
export type { RayOffset } from './ray';

export { orientationSampleFromEvent } from './orientation-sample';
export type {
  OrientationFrame,
  OrientationSample,
  RawOrientationEvent,
} from './orientation-sample';
export type { FrameResetCause, FrameResetEvent } from './frame-reset';
export type { SightingWindow } from './sighting-window';

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
export type { PageResetCause, PoseKeyframe, SimulatorScript } from './simulator/simulator-script';
