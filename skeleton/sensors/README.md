# @alidade/sensors

What the phone knows, as plain data: device orientation turned into a camera direction, the
position from GPS, magnetic declination, the choice of a sighting window, and the capture of one
bearing or one altitude from it. A browser source and a seeded simulator sit behind the same
`SensorSource` interface, so everything above runs without going outside. It depends on
`@alidade/core` and, for the magnetic model, on `magvar` (imported by one wrapper module only).

Import everything from the package root. This is the only package that touches the browser's
orientation, geolocation, visibility and permission APIs; the rest of the skeleton receives plain data.

```ts
import { createSimulator, captureBearing, declinationAt } from '@alidade/sensors';
```

## What it exports

- `SensorResult`, `SensorFailure`, `SensorReason`, `SENSOR_REASONS`: the result type and the closed set of failure reasons (Core's plus the sensors' own).
- `cameraAxis`, `directionAzimuthRad`, `directionApparentAltitudeRad`, `DeviceRotation`, `EnuDirection`: the rear camera's direction from the full device rotation.
- `offAxisRay`, `rayDirection`, `rayOffsetOfDirection`, `RayOffset`: a tapped point off the optical axis.
- `orientationSampleFromEvent`, `OrientationSample`, `OrientationFrame`, `RawOrientationEvent`: one orientation event, validated.
- `yawReferenceFromCompass`, `yawReferenceFromKnownAzimuth`, `applyYawReference`, `YawReference`: the reference that fixes north for a relative frame.
- `declinationAt`, `trueAzimuthFromMagnetic`, `Declination`: magnetic declination from the World Magnetic Model.
- `positionFixFromReading`, `checkPositionFix`, `PositionFix`, `GeolocationReading`: a GPS reading with its 1-sigma.
- `createSampleHistory`, `addOrientationSample`, `addPositionFix`, `addFrameReset`, `SampleHistory`: the recent samples and frame resets.
- `selectWindow`, `resetBetween`, `invalidates`, `summariseAzimuths`, `summariseAltitudes`, `SightingWindow`: which samples make a sighting, and how they are summarised.
- `captureBearing`, `captureAltitude`, `BearingCaptureInput`, `AltitudeCaptureInput`, `AltitudeCapture`: one sighting from a window, with its sigma.
- `AltitudeCalibration`, `UNCALIBRATED_ALTITUDE`, `HEADING_SIGMA_RAD`, `SIGHTING_WINDOW_LENGTH_MS`: defaults and the phone's altitude calibration.
- `SensorSource`, `SensorSourceOptions`, `createBrowserSensorSource`, `browserEnvironment`, `systemClock`: the interface and the browser's implementation.
- `createSimulator`, `SimulatorControls`, `SimulatorScript`, `PoseKeyframe`, `TruePose`: the seeded simulator behind the same interface.

## From a sensor to a measurement model

A capture is the input of a measurement model. `captureBearing` gives Core's `Bearing`, which
Core's `BearingModel` solves for a position. `captureAltitude` gives an apparent altitude, which
Nonius corrects and feeds to its own altitude model. A new kind of sighting adds a capture in the
app and a model that implements `MeasurementModel`; neither changes this package. The interface is
in [`../core/src/measurement-model.ts`](../core/src/measurement-model.ts), with a worked sketch in
[Core's README](../core/README.md), and the two real models are
[`../core/src/bearing-model.ts`](../core/src/bearing-model.ts) and
[`../../apps/nonius/src/math/fix/altitude-model.ts`](../../apps/nonius/src/math/fix/altitude-model.ts).

## Tests

| Command                                    | What it runs                                |
| ------------------------------------------ | ------------------------------------------- |
| `pnpm --filter @alidade/sensors test`      | every test once, properties at 200 cases    |
| `pnpm --filter @alidade/sensors test:deep` | the property files at the checkpoint counts |
