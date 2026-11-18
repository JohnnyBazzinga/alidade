# Requirement coverage — skeleton-ui

Generated at checkpoint 26, again after the corrections of D29 and D30, and extended by hand for task group 27 (criteria 15.14 to 15.17 and 17.13 to 17.15, checked against the test files with the same rule), from the test files: a criterion is listed against every test file that
cites it (`Req N.M`, lists, ranges and a whole requirement `Req N`) or names its property
(`P-N.M`). File names are relative to `skeleton/ui/src` (or `playground/`), without `.test`.
Criteria no test cites by number are listed with what covers them.

| Criterion | Covered by |
|---|---|
| 1.1 | purity |
| 1.2 | purity |
| 1.3 | purity |
| 1.4 | adapters/map/maplibre-loader, purity |
| 1.5 | purity |
| 1.6 | purity |
| 1.7 | purity |
| 1.8 | purity |
| 1.9 | purity |
| 1.10 | math/degrees, purity |
| 2.1 | math/hostile-map-scene.property, math/hostile.property |
| 2.2 | math/messages, reasons |
| 2.3 | reasons |
| 2.4 | reasons |
| 2.5 | *not cited:* step.property (P-8.12: every carried failure is in `failure` or the Notice), components/FailureNotice, adapters/camera (failures reach the `onEnded` listeners), components/MapView (adapter failures shown) |
| 2.6 | math/hostile-map-scene.property, math/hostile.property, math/panel/panel-bounds, math/session/step |
| 3.1 | *not cited:* messages (completeness against `UI_REASONS`), components/FailureNotice (one test per UI reason) |
| 3.2 | math/messages |
| 3.3 | math/messages, math/messages.property |
| 3.4 | math/messages, math/session/step |
| 3.5 | math/messages |
| 3.6 | components/FailureNotice |
| 3.7 | math/messages |
| 3.8 | math/display-format |
| 3.9 | math/display-format, math/display-format.property |
| 3.10 | math/display-format, math/display-format.property |
| 3.11 | math/messages, math/messages.property |
| 4.1 | math/camera-calibration, math/camera-calibration.property |
| 4.2 | *not cited:* camera-calibration ("has no default"), defaults (Req 19.3), playground/Playground.integration (`calibration_missing` before the values are applied) |
| 4.3 | math/camera-calibration, math/image-geometry |
| 4.4 | math/image-geometry |
| 4.5 | math/image-geometry |
| 4.6 | math/camera-calibration.property |
| 4.7 | math/camera-calibration.property |
| 5.1 | math/image-layout |
| 5.2 | math/image-geometry, math/image-geometry.property, math/scene/limits, math/scene/scene.property |
| 5.3 | math/image-geometry |
| 5.4 | components/MarkRing, math/image-geometry |
| 5.5 | math/image-geometry |
| 5.6 | *not cited:* by construction: `pointToRayOffset(layout, calibration, point)` takes no sample and no Screen angle; review only |
| 5.7 | math/image-geometry.property |
| 5.8 | math/image-geometry, math/image-geometry.property |
| 5.9 | math/image-geometry.property |
| 5.10 | math/image-geometry.property |
| 5.11 | math/image-geometry.property |
| 5.12 | math/image-geometry.property |
| 5.13 | math/image-geometry.property |
| 5.14 | math/image-geometry.property |
| 5.15 | math/image-geometry.property |
| 5.16 | *not cited:* step.property (P-8.11: every run twice, deep-equal), purity (no clock, randomness or I/O in the Math layer) |
| 6.1 | math/ray-uncertainty |
| 6.2 | math/ray-uncertainty |
| 6.3 | *not cited:* capture (the Mark and its Image angular sigma in the captured result), components/CaptureSummary ("Lens and tap ±…") |
| 6.4 | math/ray-uncertainty.property |
| 6.5 | math/ray-uncertainty.property |
| 6.6 | math/ray-uncertainty |
| 7.1 | adapters/camera/camera-adapter |
| 7.2 | adapters/camera/camera-adapter |
| 7.3 | adapters/camera/camera-adapter |
| 7.4 | adapters/camera/camera-adapter |
| 7.5 | adapters/camera/camera-adapter |
| 7.6 | adapters/camera/camera-adapter |
| 7.7 | adapters/camera/camera-adapter |
| 7.8 | adapters/camera/camera-adapter |
| 7.9 | adapters/camera/camera-adapter |
| 7.10 | adapters/camera/camera-adapter |
| 7.11 | *not cited:* adapters/camera/camera-adapter (50 example tests against `FakeCameraSurface`, by criterion 7.1 to 7.10) |
| 8.1 | *not cited:* step.property (P-8.11 on deep-frozen states), purity |
| 8.2 | *not cited:* the `SessionEvent` type, and step (every event kind in the table-driven transition tests) |
| 8.3 | components/SightingScreen, components/session-driver, math/session/step, math/session/step.property |
| 8.4 | math/session/step, math/session/step.property |
| 8.5 | math/session/step |
| 8.6 | math/session/step |
| 8.7 | math/session/step |
| 8.8 | math/session/step |
| 8.9 | math/session/step.property |
| 8.10 | math/session/step.property |
| 8.11 | math/session/step.property |
| 8.12 | math/session/step, math/session/step.property |
| 8.13 | components/session-driver, math/session/step |
| 8.14 | math/session/step, math/session/yaw-loss.property |
| 8.15 | math/session/step, math/session/yaw-loss.property |
| 8.16 | math/session/freeze.property, math/session/step.property, math/session/yaw-loss, math/session/yaw-loss.property |
| 9.1 | components/Readout |
| 9.2 | math/session/readout |
| 9.3 | math/session/readout |
| 9.4 | math/session/readout |
| 9.5 | math/session/readout |
| 9.6 | math/session/readout |
| 9.7 | components/session-driver |
| 9.8 | components/session-driver |
| 9.9 | math/session/readout.property |
| 9.10 | math/session/readout.property |
| 9.11 | math/session/readout.property |
| 9.12 | components/session-driver |
| 10.1 | math/session/capture, math/session/freeze.property |
| 10.2 | math/session/capture |
| 10.3 | math/session/capture, math/session/step |
| 10.4 | components/CameraImage |
| 10.5 | math/session/capture |
| 10.6 | math/session/capture |
| 10.7 | math/session/capture |
| 10.8 | math/session/step.property, math/session/yaw-loss |
| 10.9 | math/session/freeze.property |
| 10.10 | math/session/freeze.property |
| 11.1 | components/KnownAzimuthForm, math/session/capture, math/session/step.property |
| 11.2 | *not cited:* readout ("Relative frame, no valid Yaw reference: relative"), components/YawStatusBar (`none`), components/SightingScreen ("says north is not set") |
| 11.3 | math/session/yaw-status |
| 11.4 | components/SightingScreen, components/YawStatusBar |
| 11.5 | math/session/capture |
| 11.6 | math/session/capture |
| 11.7 | math/session/yaw-status, math/session/yaw-status.property |
| 11.8 | math/session/yaw-status.property |
| 11.9 | components/SightingScreen, math/session/step, math/session/yaw-loss, math/session/yaw-loss.property |
| 12.1 | math/session/capture |
| 12.2 | math/session/capture |
| 12.3 | math/session/capture |
| 12.4 | math/session/capture |
| 12.5 | math/session/capture |
| 12.6 | components/CaptureSummary, math/session/capture, math/session/capture-details, math/session/capture-details.property |
| 12.7 | math/session/capture |
| 12.8 | math/session/capture, math/session/capture-details.property, math/session/freeze.property |
| 12.9 | math/session/capture, math/session/step.property |
| 12.10 | math/session/capture, math/session/freeze.property |
| 13.1 | components/Reticle |
| 13.2 | components/theme, math/contrast, math/map/map-style |
| 13.3 | components/MarkRing |
| 13.4 | components/Readout, components/SightingScreen |
| 13.5 | components/CaptureSummary, math/session/capture-details, math/session/capture-details.property |
| 13.6 | components/CaptureSummary, components/FixSummary, components/MapView |
| 13.7 | components/ControlBar |
| 13.8 | components/ImageSurface |
| 13.9 | components/SightingScreen |
| 13.10 | math/contrast, math/contrast.property |
| 13.11 | components/theme |
| 13.12 | components/ControlBar, components/MarkRing, components/Reticle |
| 14.1 | math/map/map-geometry |
| 14.2 | math/map/map-geometry |
| 14.3 | math/map/map-geometry |
| 14.4 | math/map/map-geometry |
| 14.5 | math/map/map-geometry |
| 14.6 | math/map/map-geometry |
| 14.7 | math/map/map-geometry, math/map/map-geometry.property |
| 14.8 | math/map/map-geometry.property |
| 14.9 | math/map/map-geometry.property |
| 14.10 | math/map/map-geometry.property |
| 14.11 | math/map/map-geometry.property |
| 14.12 | math/map/map-geometry.property |
| 14.13 | math/map/map-geometry.property |
| 14.14 | math/map/map-geometry |
| 15.1 | adapters/map/map-adapter, adapters/map/maplibre-loader, adapters/map/maplibre-loader-adapt |
| 15.2 | adapters/map/map-adapter, math/map/map-style |
| 15.3 | adapters/map/map-adapter |
| 15.4 | math/map/map-style |
| 15.5 | adapters/map/map-adapter |
| 15.6 | adapters/map/map-adapter |
| 15.7 | math/map/map-style |
| 15.8 | adapters/map/map-adapter |
| 15.9 | adapters/map/map-adapter, math/map/map-style |
| 15.10 | adapters/map/map-adapter |
| 15.11 | adapters/map/map-adapter.property |
| 15.12 | adapters/map/map-adapter.property |
| 15.13 | *not cited:* adapters/map/map-adapter (example tests against `FakeMapLibre`, by criterion 15.1 to 15.10) |
| 15.14 | math/map/app-feature, adapters/map/app-feature.property (P-15.18), adapters/map/map-adapter.layers, adapters/map/map-adapter, components/MapView, math/map/app-layer, math/map/app-layer.property (P-15.15) |
| 15.15 | adapters/map/map-adapter.layers, adapters/map/map-adapter.property (P-15.17), math/map/app-layer, math/map/app-layer.property (P-15.15) |
| 15.16 | adapters/map/map-adapter.layers, adapters/map/map-adapter.property (P-15.17), math/map/map-style |
| 15.17 | adapters/map/map-adapter.property (P-15.17, with P-15.11 and P-15.12 on the same sequences), components/MapView |
| 16.1 | math/scene/scene |
| 16.2 | math/scene/scene |
| 16.3 | math/scene/end-to-end.property, math/scene/scene, math/scene/scene.property |
| 16.4 | math/scene/scene, purity |
| 16.5 | components/SceneImage |
| 16.6 | components/SceneImage |
| 16.7 | math/scene/limits, math/scene/scene.property |
| 16.8 | math/scene/end-to-end.property, math/scene/limits |
| 16.9 | math/scene/scene, math/scene/scene.property |
| 16.10 | math/scene/scene.property |
| 16.11 | math/scene/scene |
| 17.1 | components/catalogue-scenes |
| 17.2 | components/catalogue-scenes |
| 17.3 | components/catalogue-scenes |
| 17.4 | components/SimulatorPanel, math/panel/panel-state |
| 17.5 | components/SimulatorPanel, math/hostile-map-scene.property, math/panel/panel-bounds, math/panel/panel-state |
| 17.6 | components/SimulatorPanel, components/SimulatorPanel.failure |
| 17.7 | components/SimulatorPanel |
| 17.8 | math/panel/panel-state.property |
| 17.9 | *not cited:* components/SimulatorPanel, components/SimulatorPanel.failure (criteria 17.4 to 17.7, 17.10, 17.11), components/catalogue-scenes (17.2, 17.3, one per scene) |
| 17.10 | components/ImageSurface, components/SimulatorPanel, math/scene/scene |
| 17.11 | components/ImageSurface, components/SimulatorPanel |
| 17.12 | math/scene/scene.property |
| 17.13 | math/scene/script-for-station, math/hostile-map-scene.property (P-2.6) |
| 17.14 | math/scene/catalogue-regression (against `fixtures/catalogue-before-task-27.json`) |
| 17.15 | math/scene/script-for-station, math/scene/script-for-station.property (P-17.15) |
| 18.1 | *not cited:* purity (the fixed file list; index.ts exports nothing from `playground`), `build:playground` at checkpoint 26 |
| 18.2 | playground/Playground.integration |
| 18.3 | playground/Playground.integration |
| 18.4 | components/FixSummary, components/KnownAzimuthForm, playground/Playground.integration |
| 18.5 | *not cited:* `playground/main.tsx` reads the two variables; adapters/map/map-adapter ("no Tile source": no raster source, no request); playground/Playground.integration runs with `tiles: null` |
| 18.6 | math/panel/panel-state |
| 18.7 | purity |
| 18.8 | *not cited:* playground/Playground.integration (every alert equals a `messageFor` text) |
| 18.9 | playground/Playground.integration |
| 18.10 | components/DeviceSighting, playground/Playground.integration (the Playground's device-mode tests, unchanged) |
| 19.1 | defaults, math/session/parameters |
| 19.2 | math/session/parameters |
| 19.3 | math/session/parameters |
| 19.4 | math/session/parameters, math/session/step, math/session/yaw-loss.property |
| 19.5 | defaults |
| 20.1 | purity |
| 20.2 | *not cited:* purity (exactly the five runtime dependencies); the justifications are in design §3 |
| 20.3 | *not cited:* purity (the dependency list is exact); review |
| 20.4 | purity |
| 20.5 | purity |
| 20.6 | *not cited:* design §3 records each publication date; checked by hand at each install (tasks 1.2 to 1.4); not testable |
| 21.1 | *not cited:* every `*.property.test.ts` (each names its property and requirements); the count check of checkpoint 26 |
| 21.2 | *not cited:* every `components/*.test.tsx` and playground/Playground.integration (jsdom, Simulator, `FakeTimer`, `FakeCameraSurface`, `FakeMapLibre`) |
| 21.3 | *not cited:* adapters/camera/camera-adapter, adapters/map/map-adapter, adapters/map/map-adapter.property |
| 21.4 | components/FailureNotice, components/session-driver, math/session/step |
| 21.5 | *not cited:* messages (completeness), step.property (P-8.10) |
| 21.6 | *not cited:* the kept counterexamples: scene (P-16.9 horizon), components/MarkRing (the Mark at the corner, found by the Playground test) |
| 21.7 | *not cited:* `package.json` scripts (`vitest run`, no watch); no task runs `dev` |
