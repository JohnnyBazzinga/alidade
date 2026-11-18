// Public API of @alidade/ui (Req 1.7, design §6). Every export goes through this file; nothing
// from `playground` or `test-support` is exported, and neither are the internal helpers (`ok`,
// `err`, the unchecked geometry `offsetOfPixel`, the horizon builders). Importing this file does
// not load `maplibre-gl`: only `loadMapLibre` does, by a dynamic import (Req 1.4).
//
// An app that shows the map imports `maplibre-gl/dist/maplibre-gl.css` itself (see README.md).

// Results and reasons
export type { UiFailure, UiResult } from './result';
export { UI_REASONS } from './reasons';
export type { UiOnlyReason, UiReason } from './reasons';

// Defaults (Req 19)
export {
  ELLIPSE_VERTEX_COUNT,
  MAP_ERROR_REPORT_INTERVAL_MS,
  MAX_MARK_ALTITUDE_RAD,
  MAX_PANEL_ELAPSED_MS,
  MAX_PANEL_TICK_MS,
  MIN_CONTRAST_RATIO,
  MIN_READOUT_FONT_PX,
  MIN_TOUCH_TARGET_PX,
  PRIMARY_CONTROL_HEIGHT_PX,
  READOUT_INTERVAL_MS,
  SCREEN_ANGLE_TOLERANCE_RAD,
  SIMULATOR_TICK_MS,
  SPACING_PX,
  STEADY_BELOW_RAD,
  UNSTEADY_ABOVE_RAD,
  WEDGE_ARC_STEP_RAD,
} from './defaults';
export { checkSessionParameters, defaultSessionParameters } from './math/session/parameters';
export type { SessionParameters } from './math/session/parameters';

// Display, messages, contrast
export { fromDeg, toDeg } from './math/degrees';
export {
  formatAzimuthDeg,
  formatSignedDeg,
  NO_VALUE_TEXT,
  parseDegrees,
} from './math/display-format';
export { messageFor } from './math/messages';
export type { Message } from './math/messages';
export { contrastRatio, relativeLuminance } from './math/contrast';
export type { Rgb } from './math/contrast';

// Calibration and image geometry
export { checkCalibration, focalLengthSourcePx } from './math/camera-calibration';
export type { CameraCalibration, FovAxis } from './math/camera-calibration';
export { imageLayout } from './math/image-layout';
export type { ImageFit, ImageLayout, PixelPoint, PixelSize, SourceSize } from './math/image-layout';
export { displayedFocalPx, pointToRayOffset, rayOffsetToPoint } from './math/image-geometry';
export type { PointOnImage } from './math/image-geometry';
export { imageAngularSigmaRad } from './math/ray-uncertainty';

// The Session
export { createSession, step } from './math/session/step';
export type { StepResult } from './math/session/step';
export { liveReadout, steadiness } from './math/session/readout';
export { yawStatus } from './math/session/yaw-status';
export type { YawStatus, YawStatusKind } from './math/session/yaw-status';
export type {
  CaptureDetails,
  CaptureNorth,
  CapturedResult,
  FrozenSighting,
  LiveAzimuth,
  LiveReadout,
  Mark,
  Notice,
  Session,
  SessionKind,
  SessionStateKind,
  StampedFailure,
  Steadiness,
  YawReferenceSource,
} from './math/session/session';
export type {
  ActionEvent,
  ActionRequest,
  DataEvent,
  SessionEffect,
  SessionEvent,
  YawSource,
} from './math/session/session-events';

// Map geometry
export { observerFeatures } from './math/map/observer-features';
export type { MapObserver } from './math/map/observer-features';
export { bearingFeatures, MAX_LINE_LENGTH_M } from './math/map/bearing-features';
export { fixFeatures } from './math/map/fix-features';
export type { FixFeatureCollection } from './math/map/fix-features';
export { mapBounds } from './math/map/map-bounds';
export type { MapBounds } from './math/map/map-bounds';
export { buildMapStyle } from './math/map/map-style';
export type { MapStyle, TileSource } from './math/map/map-style';
export type { Feature, FeatureCollection, FeatureKind, Geometry } from './math/map/geojson';

// The synthetic scene, the Simulator panel's state, diagnostics
export { checkScene } from './math/scene/scene';
export type { Station, SyntheticScene, Target } from './math/scene/scene';
export { targetDirection } from './math/scene/target-direction';
export type { TrueDirection } from './math/scene/target-direction';
export { projectScene } from './math/scene/project-scene';
export type { HorizonLine, ProjectedScene, ProjectedTarget } from './math/scene/project-scene';
export { aimAfterDrag } from './math/scene/aim';
export { buildCatalogue, CATALOGUE_CALIBRATION, CATALOGUE_ORIGIN } from './math/scene/catalogue';
export type { CatalogueScene } from './math/scene/catalogue';
export { panelStep } from './math/panel/panel-state';
export type {
  PanelAction,
  PanelSpeed,
  PanelState,
  PanelStepResult,
} from './math/panel/panel-state';
export { eventRateHz } from './math/diagnostics/event-rate';

// Adapters
export { createMapAdapter, checkTileSource } from './adapters/map/map-adapter';
export type { MapAdapter } from './adapters/map/map-adapter';
export { loadMapLibre } from './adapters/map/maplibre-loader';
export type { MapLibreLike, MapLike } from './adapters/map/maplibre-types';
export { createCameraAdapter } from './adapters/camera/camera-adapter';
export type {
  CameraAdapter,
  CameraStartRequest,
  CameraStream,
} from './adapters/camera/camera-adapter';
export { browserCameraSurface } from './adapters/camera/browser-camera-surface';
export type {
  CameraConstraints,
  CameraSurface,
  MediaStreamLike,
  TrackLike,
  VideoSink,
} from './adapters/camera/camera-surface';

// Components
export type { Timer, TimerHandle } from './components/timer';
export { createSessionDriver } from './components/session-driver';
export type { DriverDeps, SessionDriver } from './components/session-driver';
export { useSightingSession } from './components/use-sighting-session';
export type { SightingSession, SightingSessionDeps } from './components/use-sighting-session';
export { observeElementSize, useElementSize } from './components/dom-size';
export type { ObserveElementSize } from './components/dom-size';
export { COLOURS, FONT_STACK, PALETTE_PAIRS, SIZES } from './components/theme';
export type { PalettePair } from './components/theme';
export { CameraImage } from './components/CameraImage';
export { CaptureSummary } from './components/CaptureSummary';
export { ControlBar } from './components/ControlBar';
export type { ControlSpec } from './components/ControlBar';
export { FailureNotice } from './components/FailureNotice';
export { FixSummary } from './components/FixSummary';
export { ImageSurface } from './components/ImageSurface';
export type { AimGesture } from './components/ImageSurface';
export { KnownAzimuthForm } from './components/KnownAzimuthForm';
export { LimitsNote } from './components/LimitsNote';
export { MapView } from './components/MapView';
export { MarkRing } from './components/MarkRing';
export { Readout } from './components/Readout';
export { Reticle } from './components/Reticle';
export { SceneImage } from './components/SceneImage';
export { SightingScreen } from './components/SightingScreen';
export { SimulatorPanel } from './components/SimulatorPanel';
export type { SimulatorContext } from './components/SimulatorPanel';
export { YawStatusBar } from './components/YawStatusBar';
