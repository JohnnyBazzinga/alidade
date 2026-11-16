# Design Document — `skeleton-sensors`

## 1. Context and scope

`skeleton-sensors` is `skeleton/sensors` (package `@alidade/sensors`). It turns device data
into plain data for the rest of the skeleton: Orientation samples with the full Device
rotation, Off-axis rays, Position fixes, Frame reset events, the World Magnetic Model
declination, and, from a Sighting window, one Core `Bearing` or one apparent altitude. It also
ships a seeded Simulator source behind the same interface. This design implements the
approved `requirements.md` as written; it does not restate or alter the requirements.

The package covers, in this order of dependency:

1. Its own Result type and closed reason set (Req 11.1).
2. Default parameters (Req 10).
3. Device rotation, Camera axis and Off-axis rays (Req 2, 3).
4. Orientation samples and Frame reset events (Req 4).
5. Sighting windows and circular statistics (Req 8, 9).
6. Yaw references (Req 5).
7. Declination: conversion and the World Magnetic Model (Req 6).
8. Position fixes (Req 7).
9. Bearing and altitude captures (Req 8, 9).
10. The Sensor source interface, the browser Adapters and the Simulator source (Req 4, 7, 11, 12).

The camera image, freezing a frame and turning a tap into a Ray offset belong to the
`skeleton-ui` spec. This design writes no code and creates no tasks.

## 2. Conventions adherence

All of `.kiro/steering/math-conventions.md` is binding, including the probe findings:

- Internal math is radians. Degrees appear only in the Raw orientation event and the
  geolocation reading (the browser boundary), in the Simulator's raw events (which imitate that
  boundary), and in the call to the World Magnetic Model package, which takes degrees. Every
  conversion uses Core's `degToRad` and `radToDeg`.
- Every numeric name carries its unit suffix: `alphaRad`, `timeUtcMs`, `windowLengthMs`,
  `reportedAccuracyM`, `sigmaRad`, `sigmaM`. Durations take `Ms` (the new math-conventions row);
  instants take `UtcMs`. Unit-vector components (`east`, `north`, `up`), sample counts and the
  confidence scale are dimensionless and carry no suffix, as in math-conventions' own formula
  for the camera axis.
- An azimuth is named by its North reference: `azimuthRad` is from true north,
  `magneticAzimuthRad` from magnetic north, `relativeAzimuthRad` from a Relative frame's zero.
  Every altitude from the camera is an apparent altitude and is named `apparentAltitudeRad`.
- The camera azimuth and altitude come from the full rotation; no function reads `alpha` or
  `gamma` alone (Req 2.3). `webkitCompassHeading` is never turned into an `alpha` (Req 4.4).
- The difference of two angles is `wrapPi(a − b)`; the mean of angles is the circular mean.
  The mean of altitudes is arithmetic (Req 9.1): altitudes lie in `[-π/2, π/2]` and do not wrap.
- `asin` arguments are clamped only when the excess is below `1e-12`; a larger excess returns
  `invalid_number`.
- Every Position fix carries its 1-sigma, every capture its 1-sigma, every Yaw reference and
  Declination its 1-sigma (math-conventions, Uncertainty).
- No `NaN` or `Infinity` leaves a public function; floating-point values are never compared
  with `===` except where a value is exact by construction (a Screen angle of `0` is compared
  as `|wrapPi(screenAngleRad)| ≤ 1e-12`, Section 7.6).

## 3. The World Magnetic Model dependency (proposal)

Req 6.6 needs the WMM2025 declination from a pinned dependency. `tech.md` forbids hand-writing
something a pinned dependency does well; the WMM is a degree-12 spherical-harmonic model with
168 coefficients and their secular variation, well beyond 30 lines.

**Proposed: `magvar` 2.2.0** (npm, <https://github.com/dpyeates/magvar>).

| Property | Value |
|---|---|
| Licence | MIT |
| Unpacked size | 22 351 bytes (three source files and the licence), no runtime dependencies |
| Model | WMM2025 coefficients only; `MODEL_EPOCH = 2025.0`, `MODEL_VALID_UNTIL = 2030.0` |
| Module format | CommonJS, no TypeScript types |
| API used | `calculateMagneticField(decimalYear, latitudeDeg, longitudeDeg, heightKm)`, which returns `declination` (degrees, rounded to `0.01°`) and `h`, the horizontal intensity (nT, rounded to `0.1`) |
| Checked against the official values | all 112 published WMM2025 test points (100 in `WMM2025_TestValues.txt` from the coefficient archive, 12 in `WMM2025_TEST_VALUES.txt`), heights `0` to `100 km`: every declination equal to the published value at its `0.01°` precision |

The official test values were obtained from NOAA NCEI on the day of this design:

- `https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt`
  (SHA-256 `ae289c94e2200e4deeae2dfdedf543a8a0e93096512b30d6a754199731f570d0`), and
- `WMM2025COF/WMM2025_TestValues.txt` inside
  `https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip`
  (SHA-256 of the text file `e6975b093dddeb6153e0b23cc418425c438167e7c5b1dd795da379cb654f5819`).

Both are US Government works in the public domain. They become a read-only fixture (Section 9).

**Rejected: `geomagnetism` 0.2.0** (Apache-2.0, 72 885 bytes, four models from WMM2015 to
WMM2025, typed). Its WMM2025 entry is valid only to `2029-11-13`, not `2030.0`; it takes a
`Date` and computes the decimal year with a 365-day year; it throws outside its dates. Against
the same 112 points its largest declination error was `0.005°`, so it is accurate enough, but the
wrong end date would turn the last seven weeks of WMM2025 into `declination_unknown`, and the
other three models are dead weight.

**Risks of `magvar` and how the design handles them:**

- *No types.* `src/magvar.d.ts` declares the one function and its return type. Only `wmm.ts`
  imports the package (enforced by the purity test).
- *CommonJS.* Node 24 resolves the named import (checked); Vite pre-bundles CommonJS
  dependencies in development and converts them in the build.
- *It warns on the console outside its dates and throws on a non-finite year.* `wmm.ts` checks
  the dates and every number before calling it, so neither path is reached.
- *Its other entry points read the clock* (`magvar()` and `magneticField()` default to now).
  `wmm.ts` calls only `calculateMagneticField` with an explicit decimal year.
- *Module-level scratch arrays.* Calls are synchronous, so this is safe on one thread; it
  would not be safe to share across workers. Nothing here uses workers.
- *Rounding to `0.01°`.* This is 1/50 of the `0.5°` 1-sigma of Req 6.6.

If the reviewer rejects `magvar`, the alternative is `geomagnetism` with `wmm.ts` enforcing the
official `[2025.0, 2030.0)` window itself. That keeps its own window check, so dates after
`2029-11-13` would still fail inside the package and come back as `declination_unknown`.

## 4. Design decisions

- **D1 — Two layers, separated by folder.** Every Adapter lives under `src/browser/`.
  Everything else is the Math layer, including the Simulator, which uses only a simulated
  Clock and a seeded generator. Inside `src/browser/`, only `browser-environment.ts` reads
  globals (`window`, `document`, `navigator`, `screen`, `DeviceOrientationEvent`, `Date.now`,
  `setTimeout`). It builds a `BrowserEnvironment`, a narrow interface of exactly the calls the
  Adapter makes. The Adapter receives that interface, so the example tests pass a fake (Req
  13.2) and the purity test can check the rule by file (Section 10).

- **D2 — Sensors has its own Result type.** `SensorReason` is Core's `Reason` plus the 19
  reasons of Req 11.1. `SensorFailure` has Core's `Failure` fields (`reason`, `field`, `id`) and
  an optional `reportedAccuracyM`, set only on `coarse_location` (Req 7.4). `SensorResult<T>` is
  Core's `Success<T>` or a `SensorFailure`. A Core `Failure` is a `SensorFailure`, so Core's
  failures pass through unchanged (Req 8.4). Core is not edited (Req 11.1). As in Core, the `ok`
  and `err` helpers are internal.

- **D3 — The Camera axis has two independent computations.** `cameraAxis` uses the closed
  formula of Req 2.1. `rotationMatrix` multiplies the three elementary matrices and is used for
  Off-axis rays (Req 3.1). Property P-3.7 checks that the zero-offset ray equals the closed
  formula. P-2.8 checks the formula against a third matrix product, built in `test-support` from
  the elementary matrices and not imported from the source, so neither computation is checked
  against itself.

- **D4 — Azimuth and altitude are separate functions.** `directionAzimuthRad(d)` returns
  `axis_vertical` when `hypot(east, north) < 1e-6` (Req 2.4).
  `directionApparentAltitudeRad(d)` always succeeds for a unit vector, so the altitude is still
  returned when the azimuth is not (Req 2.4). Both functions are exported and accept any
  `EnuDirection`. They return `invalid_number` unless every component is finite and the length
  is within `1e-9` of `1`.

- **D5 — The Spread is computed about the mean.** The direct formula, `R̄ = |Σ e^{iθ}|/n`, then
  `sqrt(-2 ln R̄)`, cancels catastrophically near `R̄ = 1`. On 20 000 sets of 2 to 200 identical
  azimuths it returned up to `1.0e-7 rad`, which fails Req 8.14's `1e-12`. The design first finds
  the circular mean `μ = atan2(Σ sin θ, Σ cos θ)`, then computes
  `q = 1 − R̄ = (2/n) Σ sin²(wrapPi(θᵢ − μ)/2)` without cancellation, and the Spread as
  `sqrt(−2 · log1p(−q))`. On the same sets it returned at most `4.8e-15 rad`. In exact arithmetic
  the two are equal, because `R̄ = (1/n) Σ cos(θᵢ − μ)` when `μ` is the resultant direction. If
  `q ≥ 1 − 1e-9` (Core's `undefined_mean` threshold on `R̄`), the mean is undefined. A capture
  then returns `too_unsteady`, because its Spread is unbounded (Req 8.10), and a Yaw reference
  returns Core's `undefined_mean`.

- **D6 — One normaliser for real and simulated events.** `orientationSampleFromEvent(raw,
  timeUtcMs, screenAngleDeg)` turns a plain Raw orientation event into an Orientation sample.
  The browser Adapter calls it after copying the DOM event's fields into a plain object (with
  `typeof` checks, since the event is untrusted input). The Simulator calls it on the raw events
  it generates (Req 12.2). The frame comes from the event alone: a `deviceorientationabsolute`
  event, or `absolute === true`, is Absolute (Req 4.3).

- **D7 — Which events the Adapter listens to is fixed when it starts.** If the environment
  reports `supportsAbsoluteOrientation` (`'ondeviceorientationabsolute' in window`), the Adapter
  listens only to `deviceorientationabsolute` (Req 4.2); otherwise only to `deviceorientation`.
  No user-agent string is read (Req 4.1); the purity test rejects `userAgent`, `platform` and
  `vendor` anywhere in the package. The Adapter keeps the frame of the last sample it delivered
  and emits a `frame_change` reset before a sample in a different frame (Req 4.8).

- **D8 — Every capture checks in a fixed order and returns the first failure.** The order is
  given in Section 7.9. A fixed order makes failures deterministic. It also puts the checks the
  user can act on (position, too few samples) before the ones that depend on them.

- **D9 — When a Yaw reference is valid.** A Yaw reference records `establishedUtcMs`, the end
  of its own Sighting window (Req 5.4). An operation that uses it fails with:
  - `frame_reset` if any Frame reset lies in the closed interval from the earlier of
    `establishedUtcMs` and the operation's window start to the later of `establishedUtcMs` and
    the operation's window end (Req 5.11). This covers a reference established before the window
    and, in the frozen-image flow, one established after it.
  - `stale_yaw_reference` if `|endUtcMs − establishedUtcMs|` exceeds the maximum age (Req 5.12).

- **D10 — A Yaw reference is built from Relative-frame samples only.** Both constructors count
  and use only the Relative-frame samples in the window. Absolute-frame samples in that window
  are ignored, and too few Relative-frame samples gives `insufficient_samples` (Req 5.9). A
  capture of Absolute-frame samples does not use a Yaw reference (Req 8.2); if one is passed, it
  is ignored.

- **D11 — The Declination function is separate from the math that uses it.** `declinationAt`
  returns a `Declination` value, and the captures take that value as data (Req 6.2). An app
  calls `declinationAt` once per capture, or uses a Sun calibration instead. The captures never
  call the WMM themselves, so their properties need no model.

- **D12 — Decimal year, validity and blackout zone.** The WMM evaluates at a decimal year,
  defined here as `y + (t − Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) − Date.UTC(y, 0, 1))`,
  where `y` is the calendar year containing `t`. The year is found by checking the five years
  2025 to 2029 in turn, so no `Date` object is built and no clock is read. `Date.UTC` is a pure
  function of its arguments. A time before `Date.UTC(2025, 0, 1)` or at or after
  `Date.UTC(2030, 0, 1)` returns `declination_unknown` (Req 6.7). NOAA's own software counts whole
  days and ignores the time of day; the difference is under one day, which is at most `0.007°` of
  declination at the published test points' largest rate (`2.49°/year`, at 89°N) and about
  `0.0003°` at typical rates. A horizontal intensity below `2000 nT` (the WMM2025 report's
  blackout zone) returns `declination_unknown` (Req 6.8). On a 0.5° × 1° grid in 2027, the
  blackout zone reaches as far from the poles as `61.5°` of latitude. The height is `0 km` (Req 6.6), because
  `Position` has no height.

- **D13 — The position 1-sigma is set when the fix is made.** `positionFixFromReading(reading,
  timeUtcMs, confidenceScale)` stores both `reportedAccuracyM` and
  `sigmaM = reportedAccuracyM / confidenceScale` (Req 7.3). The Sensor source receives the scale
  when it is created. A fix therefore never exists without its 1-sigma. The Adapter calls
  `watchPosition` with `enableHighAccuracy: true`, `maximumAge: 0` (so a cached reading cannot
  arrive with a receipt time that hides its age) and `timeout` set to the position timeout.

- **D14 — Permission flow.** The Sensor source's `requestOrientationPermission()` is the only
  code that calls `DeviceOrientationEvent.requestPermission` (Req 11.2), and it does so once per
  call. `startOrientation()` never calls it. If no sample arrives within the listening timeout,
  `startOrientation()` returns `permission_required` when the browser has `requestPermission` and
  this source has not been granted through it, and `sensor_unavailable` otherwise (Req 11.5).
  On iOS, a page that was already granted permission in the same session still receives events
  without a new request, so it starts normally.

- **D15 — Orientation and position start separately.** `startOrientation()` and
  `startPosition()` are separate (Req 7.1). Nonius calls only the first. `stop()` stops both.

- **D16 — The Simulator runs on a simulated clock that the caller advances.** `createSimulator`
  returns `{ source, controls }`. `source` is a `SensorSource` (Req 12.1). `controls.advanceTo(t)`
  delivers, in time order, every scheduled event with a time up to `t`. When several events
  share a time, Frame resets come first, then Orientation samples, then Position fixes. The
  promises of `startOrientation()` and `startPosition()` settle during `advanceTo`, as the real
  ones settle as real time passes. The listening and position timeouts are measured in
  simulated time.

- **D17 — The Simulator's random numbers.** A seeded `sfc32` generator, about 15 lines, gives
  uniform doubles; normal draws use Box–Muller. Writing it follows the `tech.md` rule against a
  dependency for under 30 lines. Because `Math.sin`, `Math.cos` and `Math.log` may differ in the
  last bit between JavaScript engines, determinism is promised on one engine (Req 12.4).

- **D18 — Simulated events come from a direction and a roll.** The Simulator turns a camera
  direction (azimuth in the frame, measured altitude) and a roll into W3C Euler angles
  (Section 7.12). This is the inverse of the rotation, including the gimbal-lock case of an
  upright phone. Property P-12.6 checks it against the Camera axis formula.

- **D19 — Altitude standard deviation divides by `n`.** The standard deviation of the
  samples' altitudes in Req 9.3 is `sqrt((1/n) Σ (hᵢ − h̄)²)`, computed about the mean in two
  passes. It is the arithmetic counterpart of the Spread, which also divides by `n`, so a still
  hand reads as `0` either way.

- **D20 — Every exported function is total (Req 11.8).** For any type-correct input, every
  exported function returns a failure or a success whose numbers are all finite; none throws.
  This covers the Simulator's constructor with any script and the browser source with any
  environment. A callback from the environment that throws (a fake, or a browser bug) is
  caught at the Adapter boundary and reported as `sensor_unavailable`.

## 5. Module layout

One concept per file, kebab-case, tests next to code (`structure.md`, `testing.md`).

```
skeleton/sensors/
  package.json            dependencies: @alidade/core (workspace), magvar 2.2.0 (exact)
  vitest.config.ts        default run, provides propertyRuns = 200
  vitest.deep.config.ts   checkpoint run, provides propertyRuns = 100 000 (Section 8)
  fixtures/wmm2025/       official WMM2025 test values, read-only, with SOURCE.md
  src/
    index.ts              public API surface only (re-exports)
    sensor-result.ts      SensorReason, SensorFailure, SensorResult; internal ok/err
    defaults.ts           the named constants of Req 10 and UNCALIBRATED_ALTITUDE
    parameters.ts         validation of durations, counts, sigmas, scales, limits (Req 10.3)
    rotation.ts           DeviceRotation, EnuDirection, cameraAxis, rotationMatrix,
                          directionAzimuthRad, directionApparentAltitudeRad
    ray.ts                RayOffset, offAxisRay, rayDirection (axis or ray)
    orientation-sample.ts RawOrientationEvent, OrientationSample, orientationSampleFromEvent
    frame-reset.ts        FrameResetCause, FrameResetEvent
    sighting-window.ts    SightingWindow, selectWindow, resetBetween
    circular-summary.ts   summariseAzimuths (D5), summariseAltitudes (D19)
    yaw-reference.ts      YawReference, yawReferenceFromCompass, yawReferenceFromKnownAzimuth,
                          applyYawReference
    declination.ts        Declination, WMM_DECLINATION_SIGMA_RAD, trueAzimuthFromMagnetic,
                          declinationAt
    wmm.ts                decimalYearFromUtcMs, wmmField (the only import of magvar)
    magvar.d.ts           type declaration of the one magvar function used
    position-fix.ts       GeolocationReading, PositionFix, positionFixFromReading, checkPositionFix
    capture.ts            captureBearing, captureAltitude
    sensor-source.ts      SensorSource, SensorSourceOptions, Unsubscribe
    browser/
      browser-environment.ts  BrowserEnvironment, browserEnvironment(), systemClock
      browser-sensor-source.ts createBrowserSensorSource
    simulator/
      simulator-script.ts     SimulatorScript and its validation
      seeded-random.ts        sfc32 and normal draws (D17)
      direction-to-rotation.ts rotationFromDirection (D18)
      simulator.ts            createSimulator, SimulatorControls
    test-support/
      fast-check-setup.ts     sets numRuns from the provided propertyRuns
      generators.ts           shared generators of Section 8
      reference-rotation.ts   independent elementary-matrix product (D3)
      angle-compare.ts        wrapped-difference assertions
      fake-browser.ts         FakeBrowserEnvironment, records every call
      fixtures.ts             parsers for the WMM fixture files (import.meta.glob ?raw)
```

Dependency direction inside `sensors` (nothing imports upward; only Core's `index.ts` is
imported, never a deep path):

```
index.ts -> * (re-export only)
browser/browser-sensor-source.ts -> browser/browser-environment.ts (types only), sensor-source.ts,
    orientation-sample.ts, frame-reset.ts, position-fix.ts, parameters.ts, sensor-result.ts
simulator/simulator.ts -> simulator/*, sensor-source.ts, orientation-sample.ts, frame-reset.ts,
    position-fix.ts, parameters.ts, sensor-result.ts
capture.ts -> yaw-reference.ts, declination.ts, position-fix.ts, sighting-window.ts,
    circular-summary.ts, ray.ts, rotation.ts, parameters.ts, @alidade/core
yaw-reference.ts -> sighting-window.ts, circular-summary.ts, ray.ts, rotation.ts, parameters.ts
declination.ts -> wmm.ts, @alidade/core
wmm.ts -> magvar
ray.ts -> rotation.ts
rotation.ts, orientation-sample.ts, position-fix.ts, circular-summary.ts -> @alidade/core,
    sensor-result.ts
```

## 6. Data model

All types are exported from `src/index.ts` unless marked internal.

```ts
// sensor-result.ts — Req 11.1, D2
import type { Reason, Success } from '@alidade/core';

export type SensorReason =
  | Reason                      // every Core reason, passed through unchanged
  | 'permission_denied'         // Req 7.6, 11.4
  | 'permission_required'       // Req 11.5
  | 'sensor_unavailable'        // Req 2.5, 11.5, 11.6
  | 'insecure_context'          // Req 11.7
  | 'position_unavailable'      // Req 7.6
  | 'position_timeout'          // Req 7.6
  | 'coarse_location'           // Req 7.4
  | 'stale_position'            // Req 7.7
  | 'invalid_position'          // Req 7.5
  | 'axis_vertical'             // Req 2.4
  | 'compass_unreliable'        // Req 5.6, 5.7, 5.9
  | 'no_yaw_reference'          // Req 5.13
  | 'stale_yaw_reference'       // Req 5.12
  | 'frame_reset'               // Req 5.10, 5.11, 8.8
  | 'declination_unknown'       // Req 6.4, 6.7, 6.8
  | 'insufficient_samples'      // Req 5.9, 8.6, 9.4
  | 'stale_samples'             // Req 5.10, 8.7, 9.4
  | 'too_unsteady'              // Req 8.10
  | 'invalid_altitude';         // Req 9.6

export interface SensorFailure {
  readonly ok: false;
  readonly reason: SensorReason;
  readonly field?: string;
  readonly id?: string;
  readonly reportedAccuracyM?: number;   // only with coarse_location (Req 7.4)
}
export type SensorResult<T> = Success<T> | SensorFailure;

// rotation.ts — Req 2
export interface DeviceRotation {        // W3C Euler angles, converted to radians
  readonly alphaRad: number;
  readonly betaRad: number;
  readonly gammaRad: number;
}
export interface EnuDirection {          // unit vector, dimensionless components
  readonly east: number;
  readonly north: number;
  readonly up: number;
}

// ray.ts — Req 3
export interface RayOffset {             // each in [-80°, 80°]
  readonly rightRad: number;
  readonly upRad: number;
}

// orientation-sample.ts — Req 4
export type OrientationFrame = 'absolute' | 'relative';
export interface RawOrientationEvent {   // plain copy of a DeviceOrientationEvent, degrees
  readonly type: 'deviceorientation' | 'deviceorientationabsolute';
  readonly alphaDeg: number | null;
  readonly betaDeg: number | null;
  readonly gammaDeg: number | null;
  readonly absolute: boolean;
  readonly webkitCompassHeadingDeg: number | null;
  readonly webkitCompassAccuracyDeg: number | null;
}
export interface OrientationSample {
  readonly timeUtcMs: number;            // from the Clock (Req 1.4)
  readonly frame: OrientationFrame;
  readonly rotation: DeviceRotation;     // full rotation, kept for Off-axis rays (Req 3.4)
  readonly screenAngleRad: number | null;      // Req 4.9
  readonly magneticHeadingRad: number | null;  // webkitCompassHeading, [0, 2π)
  readonly compassAccuracyRad: number | null;  // webkitCompassAccuracy; may be negative
}

// frame-reset.ts — Req 4.7, 4.8
export type FrameResetCause = 'hidden' | 'blur' | 'pagehide' | 'restart' | 'frame_change';
export interface FrameResetEvent {
  readonly timeUtcMs: number;
  readonly cause: FrameResetCause;
}

// sighting-window.ts
export interface SightingWindow {
  readonly endUtcMs: number;
  readonly windowLengthMs: number;       // > 0
  readonly minSampleCount: number;       // integer >= 1
  readonly sampleStalenessMs: number;    // >= 0
}

// yaw-reference.ts — Req 5
export interface YawReference {
  readonly offsetRad: number;            // (-π, π]
  readonly sigmaRad: number;             // >= 0
  readonly northReference: 'true' | 'magnetic';
  readonly establishedUtcMs: number;     // end of its Sighting window (Req 5.4)
}
export type ReferencedAzimuth =          // labelled with its North reference (Req 4.6)
  | { readonly northReference: 'true'; readonly azimuthRad: number }
  | { readonly northReference: 'magnetic'; readonly magneticAzimuthRad: number };

// declination.ts — Req 6
export interface Declination {
  readonly declinationRad: number;       // positive east, |·| <= π/2
  readonly sigmaRad: number;             // >= 0
}

// position-fix.ts — Req 7
export interface GeolocationReading {    // plain copy of GeolocationCoordinates, degrees
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
  readonly accuracyM: number;
}
export interface PositionFix {
  readonly position: Position;           // Core Position, Supported
  readonly reportedAccuracyM: number;    // as the browser reported it
  readonly sigmaM: number;               // reportedAccuracyM / confidence scale (Req 7.3)
  readonly timeUtcMs: number;            // from the Clock
}

// capture.ts — Req 8, 9
export interface BearingCaptureInput {
  readonly id: string;
  readonly timeUtcMs: number;
  readonly samples: readonly OrientationSample[];
  readonly frameResets: readonly FrameResetEvent[];
  readonly window: SightingWindow;
  readonly rayOffset?: RayOffset;
  readonly yawReference?: YawReference;
  readonly yawReferenceMaxAgeMs: number;
  readonly headingSigmaRad: number;      // Absolute frame's North-reference 1-sigma (Req 8.3)
  readonly declination?: Declination;
  readonly positionFix: PositionFix;
  readonly positionStalenessMs: number;
  readonly coarseLocationLimitM: number;
}
export interface AltitudeCalibration {
  readonly offsetRad: number;
  readonly sigmaRad: number;
}
export interface AltitudeCaptureInput {
  readonly samples: readonly OrientationSample[];
  readonly window: SightingWindow;
  readonly calibration: AltitudeCalibration;   // required (Req 9.2)
  readonly rayOffset?: RayOffset;
}
export interface AltitudeCapture {
  readonly apparentAltitudeRad: number;
  readonly sigmaRad: number;             // sqrt(sd² + calibration.sigmaRad²)
  readonly sampleStdDevRad: number;      // D19
  readonly calibration: AltitudeCalibration;
  readonly sampleCount: number;
}

// sensor-source.ts — Req 4, 7, 11, 12
export type Unsubscribe = () => void;
export interface SensorSourceOptions {
  readonly listeningTimeoutMs: number;
  readonly positionTimeoutMs: number;
  readonly positionConfidenceScale: number;
}
export interface SensorSource {
  now(): number;                          // the Clock that stamps this source's data
  requestOrientationPermission(): Promise<SensorResult<'granted' | 'not_required'>>;
  startOrientation(): Promise<SensorResult<OrientationFrame>>;   // frame of the first sample
  startPosition(): Promise<SensorResult<PositionFix>>;           // first fix or failure
  stop(): void;
  onOrientation(listener: (sample: SensorResult<OrientationSample>) => void): Unsubscribe;
  onFrameReset(listener: (event: FrameResetEvent) => void): Unsubscribe;
  onPosition(listener: (fix: SensorResult<PositionFix>) => void): Unsubscribe;
}
```

Constants (`defaults.ts`, Req 10.1; each documented with its source):

| Name | Value |
|---|---|
| `SIGHTING_WINDOW_LENGTH_MS` | `1000` |
| `MIN_SAMPLE_COUNT` | `10` (assumes at least 10 Hz, Req 10.4) |
| `SAMPLE_STALENESS_MS` | `500` |
| `POSITION_STALENESS_MS` | `30 000` |
| `COARSE_LOCATION_LIMIT_M` | `100` |
| `LISTENING_TIMEOUT_MS` | `3000` |
| `POSITION_TIMEOUT_MS` | `30 000` |
| `YAW_REFERENCE_MAX_AGE_MS` | `60 000` |
| `HEADING_SIGMA_RAD` | `2 · π/180` |
| `POSITION_CONFIDENCE_SCALE` | `1` |
| `UNCALIBRATED_ALTITUDE` | `{ offsetRad: 0, sigmaRad: 3.5 · π/180 }` |

`WMM_DECLINATION_SIGMA_RAD = 0.5 · π/180` lives in `declination.ts`. It is a property of the
model, not a tunable parameter.

Browser and Simulator constructors:

```ts
// browser/browser-environment.ts (Adapter)
export interface BrowserEnvironment {
  readonly isSecureContext: boolean;
  readonly hasDeviceOrientation: boolean;          // DeviceOrientationEvent exists
  readonly supportsAbsoluteOrientation: boolean;   // 'ondeviceorientationabsolute' in window
  readonly requestOrientationPermission: (() => Promise<unknown>) | null;
  addWindowListener(type: WindowEventType, listener: (event: unknown) => void): void;
  removeWindowListener(type: WindowEventType, listener: (event: unknown) => void): void;
  addVisibilityListener(listener: () => void): void;
  removeVisibilityListener(listener: () => void): void;
  visibilityState(): string;
  screenAngleDeg(): number | null;
  readonly geolocation: GeolocationLike | null;
  setTimer(callback: () => void, durationMs: number): unknown;
  clearTimer(handle: unknown): void;
}
export function browserEnvironment(): BrowserEnvironment;   // reads the globals
export const systemClock: () => number;                      // Date.now

// browser/browser-sensor-source.ts
export function createBrowserSensorSource(environment: BrowserEnvironment, clock: () => number,
  options: SensorSourceOptions): SensorResult<SensorSource>;

// simulator/simulator.ts
export interface SimulatorControls {
  advanceTo(timeUtcMs: number): SensorResult<void>;  // must not go backwards
}
export function createSimulator(script: SimulatorScript, seed: number,
  options: SensorSourceOptions): SensorResult<{ source: SensorSource; controls: SimulatorControls }>;
```

`SimulatorScript` (plain data, validated by `createSimulator`; Req 12.3):

```ts
export interface PoseKeyframe {          // true camera direction; linear in between
  readonly timeUtcMs: number;
  readonly azimuthRad: number;           // true
  readonly apparentAltitudeRad: number;  // in [-80°, 80°]
  readonly rollRad: number;
}
export interface SimulatorScript {
  readonly startUtcMs: number;
  readonly eventIntervalMs: number;      // > 0
  readonly pose: readonly PoseKeyframe[];         // >= 1, strictly increasing times
  readonly orientationNoiseSigmaRad: number;      // added to azimuth, altitude and roll
  readonly altitudeBiasRad: number;               // added to measured altitude (iOS: about -3.3°)
  readonly frame:
    | { readonly kind: 'absolute'; readonly northErrorRad: number }
    | { readonly kind: 'relative'; readonly zeroRad: number;     // true azimuth of the zero
        readonly resets: readonly { readonly timeUtcMs: number; readonly cause: FrameResetCause;
                                    readonly newZeroRad: number }[] };
  readonly heading: null | {             // webkitCompassHeading (Relative frame only)
    readonly biasRad: number;
    readonly noiseSigmaRad: number;
    readonly jumps: readonly { readonly startUtcMs: number; readonly durationMs: number;
                               readonly sizeRad: number }[];
    readonly reportedAccuracyDeg: number;         // e.g. a constant 10, as on the iPhone
  };
  readonly screenAngleDeg: number | null;
  readonly declinationRad: number;
  readonly position:
    | null
    | { readonly kind: 'fix'; readonly position: Position; readonly reportedAccuracyM: number;
        readonly firstFixDelayMs: number; readonly fixIntervalMs: number }
    | { readonly kind: 'failure';
        readonly reason: 'permission_denied' | 'position_unavailable' | 'position_timeout' };
  readonly orientation: 'available' | 'missing';
  readonly orientationPermission: 'not_required' | 'granted' | 'denied';
  readonly secureContext: boolean;
}
```

## 7. Algorithms

### 7.1 Rotation (`rotation.ts`)

`cameraAxis(r)`: if any angle is not finite, return `invalid_number` naming it (Req 2.6).
Otherwise apply the closed formula of Req 2.1 directly.

`rotationMatrix(r)`: `Rz(α) · Rx(β) · Ry(γ)` as a product of the elementary matrices
`Rz(α) = [[cα, −sα, 0], [sα, cα, 0], [0, 0, 1]]`, `Rx(β) = [[1, 0, 0], [0, cβ, −sβ], [0, sβ, cβ]]`,
`Ry(γ) = [[cγ, 0, sγ], [0, 1, 0], [−sγ, 0, cγ]]`. Internal; used by `ray.ts`.

`directionAzimuthRad(d)`: validate (D4); if `hypot(east, north) < 1e-6` return `axis_vertical`;
else `wrapTwoPi(atan2(east, north))`.

`directionApparentAltitudeRad(d)`: validate (D4); `asin(up)`, with `up` clamped into `[-1, 1]`
only when the excess is below `1e-12`, else `invalid_number` (math-conventions). D4 accepts a
length within `1e-9` of `1`, so a caller's vector can still have `up` above `1` by more than
`1e-12`; it then fails instead of returning a wrong altitude. The vectors of `cameraAxis` and
`offAxisRay` are unit to rounding (P-2.7, P-3.6) and never reach that case.

### 7.2 Off-axis ray (`ray.ts`)

`offAxisRay(r, o)`: validate `o` (finite, `|·| ≤ 80°`, else `invalid_number` naming `rightRad`
or `upRad`, Req 3.3) and `r`. Form `d = (tan o.rightRad, tan o.upRad, −1)`, divide it by its
`hypot`, and return `rotationMatrix(r) · d`. At `80°`, `tan` is about `5.67`, so nothing is
ill-conditioned.

`rayDirection(r, o?)` returns `offAxisRay(r, o)` when an offset is given and `cameraAxis(r)`
otherwise. Every capture goes through it (Req 3.5).

### 7.3 Orientation samples (`orientation-sample.ts`)

`orientationSampleFromEvent(raw, timeUtcMs, screenAngleDeg)`:

1. If `alphaDeg`, `betaDeg` or `gammaDeg` is `null`, return `sensor_unavailable` (Req 2.5).
2. If any of them, or `timeUtcMs`, is not finite, return `invalid_number` naming it.
3. Frame: `absolute` if `raw.type === 'deviceorientationabsolute'` or `raw.absolute === true`,
   else `relative` (Req 4.3).
4. Rotation: each angle through `degToRad`. Values outside the W3C ranges are accepted, because
   the formulas hold for any angle.
5. Heading: if `webkitCompassHeadingDeg` is finite, `magneticHeadingRad =
   wrapTwoPi(degToRad(heading))`; otherwise `null`. Accuracy: finite gives `degToRad(accuracy)`,
   keeping the sign; otherwise `null`. Neither field causes the sample to fail.
6. Screen angle: finite gives `wrapTwoPi(degToRad(angle))`; otherwise `null`.

### 7.4 Sighting window (`sighting-window.ts`)

`selectWindow(samples, w)` validates `w` (Req 10.3) and keeps the samples with
`w.endUtcMs − w.windowLengthMs ≤ timeUtcMs ≤ w.endUtcMs`, in input order. It fails with
`insufficient_samples` if fewer than `w.minSampleCount` remain. It fails with `stale_samples` if
`w.endUtcMs − max(timeUtcMs) > w.sampleStalenessMs`. Samples outside the window are never read,
so adding them leaves the result exactly unchanged (Req 8.13).

`resetBetween(resets, fromUtcMs, toUtcMs)` is true if any reset time lies in the closed interval
`[min(from, to), max(from, to)]`.

### 7.5 Circular and linear summaries (`circular-summary.ts`)

`summariseAzimuths(azimuthsRad)` returns `{ meanRad, spreadRad }` or `undefined_mean`, using
D5:

```
S = Σ sin θᵢ,  C = Σ cos θᵢ,  μ = wrapTwoPi(atan2(S, C))
q = (2/n) Σ sin²(wrapPi(θᵢ − μ) / 2)        // = 1 − R̄
if q ≥ 1 − 1e-9: undefined_mean
spread = sqrt(−2 · log1p(−q))
```

`summariseAltitudes(altitudesRad)` returns `{ meanRad, stdDevRad }` with
`meanRad = (Σ hᵢ)/n` and `stdDevRad = sqrt((1/n) Σ (hᵢ − meanRad)²)` (D19).

`rss(a, b) = hypot(a, b)` combines 1-sigmas (Req 5.3, 6.3, 8.3, 9.3).

### 7.6 Yaw reference (`yaw-reference.ts`)

`yawReferenceFromCompass({ samples, frameResets, window, headingSigmaRad })`:

1. Validate the parameters (Req 10.3).
2. Keep the Relative-frame samples (D10) and run `selectWindow` on them. This gives
   `insufficient_samples` or `stale_samples` (Req 5.9, 5.10).
3. If a reset lies in `[end − length, end]`, return `frame_reset` (Req 5.10).
4. Usable samples are those with a non-null `magneticHeadingRad` and a `compassAccuracyRad` that
   is `null` or not negative (Req 5.8). If fewer than `minSampleCount` are usable, return
   `compass_unreliable` (Req 5.9).
5. For each usable sample, compute the Camera axis, its altitude and its relative azimuth.
   - If the altitude is outside `[-30°, 30°]`, return `compass_unreliable` (Req 5.6).
   - If `screenAngleRad` is `null` or `|wrapPi(screenAngleRad)| > 1e-12`, return
     `compass_unreliable` (Req 5.7).
   - The axis cannot be vertical within `±30°`, so `axis_vertical` does not occur here.
6. Compute the differences `δᵢ = wrapPi(magneticHeadingRad − relativeAzimuthRad)` and their
   `summariseAzimuths`, which can fail with `undefined_mean`.
7. Return `offsetRad = wrapPi(mean)`, `sigmaRad = rss(spread, headingSigmaRad)` (Req 5.3),
   `northReference: 'magnetic'` and `establishedUtcMs = end`.

The Reported compass accuracy enters only at step 4 (Req 5.8). It is never read for the sigma.

`yawReferenceFromKnownAzimuth({ samples, frameResets, window, knownAzimuthRad, knownSigmaRad,
northReference, rayOffset? })`: steps 1 to 3 as above. Then, for each sample, take
`rayDirection` and its azimuth (`axis_vertical` is returned if it occurs). Compute
`summariseAzimuths` of those azimuths, giving `m` and its spread. Return
`offsetRad = wrapPi(knownAzimuthRad − m)`, `sigmaRad = rss(knownSigmaRad, spread)` (Req 5.2, 5.3)
and the stated North reference.

`applyYawReference(relativeAzimuthRad, y)` returns a `ReferencedAzimuth` with the value
`wrapTwoPi(relativeAzimuthRad + y.offsetRad)` (Req 5.5).

### 7.7 Declination (`declination.ts`, `wmm.ts`)

`trueAzimuthFromMagnetic(magneticAzimuthRad, declination | undefined)`:
- no declination gives `declination_unknown` (Req 6.4);
- invalid values give `invalid_number` (Req 6.5);
- otherwise `wrapTwoPi(m + declinationRad)` (Req 6.1).

`declinationAt(position, timeUtcMs)`:

1. A non-finite time gives `invalid_number`. A position that is not Supported gives
   `unsupported_position` (Core's `isSupportedPosition`; Req 6.9).
2. `decimalYearFromUtcMs(timeUtcMs)` (D12): outside `[Date.UTC(2025,0,1), Date.UTC(2030,0,1))`
   gives `declination_unknown` (Req 6.7).
3. `wmmField(decimalYear, latDeg, lonDeg, 0)` calls magvar's `calculateMagneticField`, with the
   degrees from Core's `radToDeg`. It checks that the returned `declination` and `h` are finite;
   a non-finite value gives `declination_unknown` (it cannot happen inside the checked domain,
   but the function stays total).
4. `h < 2000` (nT) gives `declination_unknown` (Req 6.8, D12).
5. Return `{ declinationRad: degToRad(declination), sigmaRad: WMM_DECLINATION_SIGMA_RAD }`
   (Req 6.6).

`wmmField` also takes a height in kilometres. Only the fixture test passes one other than `0`, to
check the published points at their own heights (Req 6.10). It is internal.

### 7.8 Position (`position-fix.ts`)

`positionFixFromReading(reading, timeUtcMs, confidenceScale)`:
- validate the scale (`invalid_number`) and the time;
- non-finite coordinates, a non-finite or negative accuracy, or a converted position that is not
  Supported give `invalid_position` (Req 7.5);
- otherwise return the fix with `sigmaM = accuracyM / confidenceScale` (Req 7.3, D13).

`checkPositionFix(fix, { atUtcMs, positionStalenessMs, coarseLocationLimitM })`:
- re-validate the fix (`invalid_position`; the fix may come from anywhere, D20);
- `atUtcMs − fix.timeUtcMs > positionStalenessMs` gives `stale_position` (Req 7.7);
- `fix.reportedAccuracyM > coarseLocationLimitM` gives `coarse_location`, with
  `reportedAccuracyM` (Req 7.4).

The Coarse location test uses the reported accuracy, not `sigmaM`, because that is the figure
the browser shows and the user can compare.

### 7.9 Bearing capture (`capture.ts`)

`captureBearing(input)` runs these steps in order and returns the first failure (D8):

1. **Parameters.** Validate the window, `yawReferenceMaxAgeMs`, `headingSigmaRad`,
   `positionStalenessMs` and `coarseLocationLimitM` (Req 10.3), `rayOffset` (Req 3.3),
   `declination` (Req 6.5), the Yaw reference's numbers, and `timeUtcMs`. Each failure is
   `invalid_number` naming its field.
2. **Position.** `checkPositionFix(positionFix, { atUtcMs: window.endUtcMs, … })` (Req 8.5).
3. **Window.** `selectWindow` (Req 8.6, 8.7).
4. **Frame.** If the samples in the window are not all in one frame, return `frame_reset`
   (Req 8.8).
5. **Relative frame only:**
   - a reset in the window gives `frame_reset`;
   - no Yaw reference gives `no_yaw_reference` (Req 5.13);
   - `resetBetween(establishedUtcMs, …)` over the span of D9 gives `frame_reset` (Req 5.11);
   - an age above the maximum gives `stale_yaw_reference` (Req 5.12).
6. **Declination.** If the North reference is magnetic (Absolute frame, or a magnetic Yaw
   reference) and no Declination is given, return `declination_unknown` (Req 6.4, 8.9).
7. **Per sample, in input order.** Take `rayDirection(rotation, rayOffset)` and its azimuth;
   `axis_vertical` is returned, never dropped (Req 8.9). Turn the azimuth into a true azimuth:
   Relative through `applyYawReference`, then Declination if magnetic; Absolute through
   Declination directly (Req 8.2).
8. **Summary.** `summariseAzimuths` of the true azimuths; `undefined_mean` becomes
   `too_unsteady` (D5).
9. **Sigma.** The North-reference 1-sigma `σN` is the Yaw reference's `sigmaRad` (Relative) or
   `headingSigmaRad` (Absolute), combined with `rss` with the Declination's `sigmaRad` when
   Declination was applied. `σ = max(0.01°, rss(spread, σN))`. If `σ > 45°`, return
   `too_unsteady` (Req 8.3, 8.10).
10. **Bearing.** Build `{ id, observer: positionFix.position, positionAccuracyM:
    positionFix.sigmaM, timeUtcMs, azimuthRad: mean, azimuthSigmaRad: σ }` and return
    `validateBearing` of it: the Bearing on success, Core's failure otherwise (Req 8.4).

The floor `0.01°` is Core's `MIN_AZIMUTH_SIGMA_RAD`, and the `45°` limit equals Core's
`MAX_AZIMUTH_SIGMA_RAD`. Sensors defines them again with the same expression (Core does not
export them), and an example test checks that the two agree, through `validateBearing`
accepting `0.01°` and `45°` and rejecting values just outside.

### 7.10 Altitude capture (`capture.ts`)

`captureAltitude({ samples, window, calibration, rayOffset? })`:

1. Validate the window, the offset and the calibration (Req 9.5, 10.3).
2. `selectWindow` (Req 9.4).
3. For each sample, compute the altitude of its `rayDirection`.
4. `summariseAltitudes` gives the mean and the standard deviation.
5. `apparentAltitudeRad = mean + calibration.offsetRad`; outside `[-π/2, π/2]` gives
   `invalid_altitude` (Req 9.6).
6. `sigmaRad = rss(stdDev, calibration.sigmaRad)` (Req 9.3).

Frame resets and the frame do not matter for altitude: `alpha`'s zero does not change `up`.

### 7.11 Browser Adapter (`browser/browser-sensor-source.ts`)

`createBrowserSensorSource(env, clock, options)` validates the options (Req 10.3) and returns a
source. Every call into `env` and `clock` is wrapped so that a throw becomes
`sensor_unavailable` (D20).

`requestOrientationPermission()`:
- `env.isSecureContext` false gives `insecure_context`;
- `requestOrientationPermission === null` gives `ok('not_required')` (Req 11.3);
- otherwise call it once. `"granted"` gives `ok('granted')` and marks the source as granted.
  Any other value, or a rejection, gives `permission_denied` (Req 11.4).

`startOrientation()`:
1. `isSecureContext` false gives `insecure_context`, before any other `env` call (Req 11.7).
2. `hasDeviceOrientation` false gives `sensor_unavailable` (Req 11.6).
3. If the source was started before and stopped, emit `{ cause: 'restart' }` at `clock()`
   (Req 4.7).
4. Add one listener: `deviceorientationabsolute` if `supportsAbsoluteOrientation`, else
   `deviceorientation` (D7, Req 4.2, 4.3). Add `blur` and `pagehide` window listeners and a
   visibility listener.
5. Start a timer of `listeningTimeoutMs`. If it fires before a valid sample, settle with
   `permission_required` or `sensor_unavailable` (D14, Req 11.5), keeping the listeners (a late
   permission grant then still delivers samples).
6. On each orientation event:
   - copy it into a `RawOrientationEvent` (non-numbers become `null`);
   - call `orientationSampleFromEvent(raw, clock(), env.screenAngleDeg())`;
   - if the frame changed since the last valid sample, emit `frame_change` first (Req 4.8);
   - deliver the Result to the listeners;
   - the first valid sample clears the timer and settles the promise with its frame.
7. `visibilitychange` emits `{ cause: 'hidden' }` only when `visibilityState()` is `"hidden"`;
   `blur` emits `blur`; `pagehide` emits `pagehide`.

`startPosition()`:
- not secure gives `insecure_context`;
- `geolocation === null` gives `sensor_unavailable`;
- otherwise call `watchPosition(onReading, onError, { enableHighAccuracy: true, maximumAge: 0,
  timeout: positionTimeoutMs })` (D13);
- each reading becomes `positionFixFromReading(copy, clock(), positionConfidenceScale)`;
- each error maps by its code: `1` gives `permission_denied`, `2` `position_unavailable`, `3`
  `position_timeout` (Req 7.6), and any other code `position_unavailable`;
- the first Result settles the promise, and every Result goes to the listeners.

`stop()` removes every listener added, clears the watch and the timer, and settles any pending
start with `sensor_unavailable` (Req 11.9). A later start is a restart.

### 7.12 Simulator (`simulator/`)

`createSimulator(script, seed, options)` validates the script, the seed (an integer in
`[0, 2³²)`) and the options. Any failure is `invalid_number` naming the field; a pose list that
is empty or not strictly increasing in time is `invalid_number` with `field: 'pose'`. It returns
`{ source, controls }`.

**Schedule.**
- Orientation events fall at `startUtcMs + k · eventIntervalMs` for `k = 0, 1, …`, from the
  `startOrientation()` call on.
- Resets fall at their scripted times.
- Position readings start at `start + firstFixDelayMs` and repeat every `fixIntervalMs`, from
  `startPosition()` on.
- `advanceTo(t)` fails with `invalid_number` if `t` is earlier than the current time. Otherwise
  it delivers every event in `(now, t]` in time order, with ties ordered as in D16.

**Pose at time `t`.** The pose is held before the first keyframe and after the last. Between two
keyframes it is interpolated linearly: altitude and roll directly, and azimuth along the wrapped
difference, `A₀ + s · wrapPi(A₁ − A₀)`.

**One orientation event.** Noise is drawn per event, independently, from the seeded generator:

```
A, h, ρ  = pose(t) + N(0, orientationNoiseSigmaRad) each
hMeasured = h + altitudeBiasRad
frameAzimuth = absolute: wrapTwoPi(A − declinationRad + northErrorRad)
               relative: wrapTwoPi(A − zeroRad(t))     // zeroRad(t) after the latest reset
(α, β, γ) = rotationFromDirection(frameAzimuth, hMeasured, ρ)
heading   = relative and heading ≠ null:
            wrapTwoPi(A − declinationRad + biasRad + N(0, noiseSigmaRad) + jumps active at t)
raw = { type: absolute ? 'deviceorientationabsolute' : 'deviceorientation',
        alphaDeg, betaDeg, gammaDeg (radToDeg), absolute,
        webkitCompassHeadingDeg: radToDeg(heading) or null,
        webkitCompassAccuracyDeg: reportedAccuracyDeg or null }
sample = orientationSampleFromEvent(raw, t, screenAngleDeg)     // same code as the Adapter
```

The draws are made in a fixed order (azimuth, altitude, roll, heading) whether or not a sigma is
zero, so that changing one sigma does not shift the others' random streams.

**`rotationFromDirection(A, h, ρ)`** (D18). Build the device axes in ENU:
- the camera axis `c = (cos h · sin A, cos h · cos A, sin h)` and the device `z = −c`;
- the zero-roll right axis `x₀ = (cos A, −sin A, 0)`, which is horizontal and to the right of
  the view, and `y₀ = z × x₀`;
- the roll: `x = cos ρ · x₀ + sin ρ · y₀` and `y = −sin ρ · x₀ + cos ρ · y₀`.

The matrix `M = [x y z]` (columns) equals `Rz(α)Rx(β)Ry(γ)`, whose bottom row is
`(−cβ sγ, sβ, cβ cγ)` and middle column `(−cβ sα, cα cβ, sβ)`. Extraction:

```
cβ = hypot(M20, M22), with the sign of M22 (so that cos γ ≥ 0, γ ∈ [−π/2, π/2])
if |cβ| < 1e-12 (gimbal lock: phone exactly upright or face-down):
    β = atan2(M21, 0), γ = 0, α = atan2(M10, M00)
else:
    β = atan2(M21, cβ), γ = atan2(−M20/cβ, M22/cβ), α = atan2(−M01/cβ, M11/cβ)
if γ = π/2 exactly: (α, β, γ) ← (α + π, π − β, −π/2)     // same rotation, W3C range
α ← wrapTwoPi(α), β ← wrapPi(β), and β = π becomes −π     // β ∈ [−π, π)
```

`(α, β, π/2)` and `(α + π, π − β, −π/2)` are the same rotation; a scratch check over 10 000
random `α`, `β` matched every matrix entry within `1.2e-15`.

The Simulator then converts to degrees with `radToDeg`, and the rounding can push a value onto
the open end of its W3C range: an `α` just below `2π` converts to exactly `360`. After
conversion, `alphaDeg ≥ 360` becomes `alphaDeg − 360`, `betaDeg ≥ 180` becomes `betaDeg − 360`,
and `gammaDeg ≥ 90` is mapped by the same identity in degrees, `(α + 180, 180 − β, γ − 180)`,
then re-ranged. P-12.6 asserts the ranges on the degree values the event carries.

A scratch check over 200 000 random directions and rolls (altitudes within `80°`) returned the
direction through the Camera axis formula within `1.8e-15 rad`, and the exactly upright case
returned `β = 90°`, `γ = 0` with an azimuth error of `0`.

**Other script fields.**
- *Position:* a `fix` script delivers `positionFixFromReading` of the scripted reading.
- *Failures:* a `failure` script delivers that reason at `firstFixDelayMs` (`0` if absent).
- *`orientation: 'missing'`:* `startOrientation()` returns `sensor_unavailable`.
- *`secureContext: false`:* every start and the permission request return `insecure_context`.
- *Permission:* `orientationPermission` gives the outcome of `requestOrientationPermission()`.
  When it is `'granted'` or `'denied'` and the permission was not requested and granted first,
  no events are delivered, and `startOrientation()` settles with `permission_required` after the
  listening timeout, in simulated time. This is what an iPhone does.

## 8. Correctness Properties

Every property below is implemented with `fast-check` and runs at least 200 cases in the
default `pnpm test`. Each one names the property and the requirement it validates in a comment
above the test. Angles are compared with `wrapPi(a − b)`, and tolerances are the requirements'.
A failing property is classified as a bug in the code, the property or the requirement before
anything changes (testing.md rule 1). A shrunk counterexample that reveals a real bug is kept as
an example test (rule 5).

**Checkpoint runs at 100 000 cases.** `vitest.config.ts` provides `propertyRuns = 200`.
`vitest.deep.config.ts` provides `propertyRuns = 100 000` and runs only `*.property.test.ts`.
The shared setup reads the value with Vitest's `inject` and passes it to
`fc.configureGlobal`. Before each checkpoint, `pnpm --filter @alidade/sensors test:deep` runs:

- at 100 000 cases: P-2.7, P-2.8, P-2.9, P-2.10, P-3.6, P-3.7, P-3.8, P-3.9, P-5.14, P-5.15,
  P-6.11, P-7.9, P-7.10, P-8.11, P-8.12, P-8.14, P-8.15, P-9.7, P-9.8, P-9.9 and P-12.6;
- at 10 000 cases, because each case runs a whole simulation or calls every exported function:
  P-8.13, P-11.8, P-12.7 and P-12.8. These properties set
  `numRuns: Math.min(propertyRuns, 10_000)`.

The 100 000-case list covers the places where floating-point behaviour is the risk:
- the gimbal lock at `beta = ±90°` (P-2.9, P-2.10, P-12.6);
- the `1e-12` identities of the Spread (P-8.14, P-9.7);
- the wrap at `0 / 2π` (P-8.15);
- the inverse rotations (P-3.8, P-12.6).

The checkpoint report gives the count and the worst error for each.

Shared generators (`test-support/generators.ts`, domains stated in each):

- **`deviceRotation`**: `alpha ∈ [0, 2π)`, `beta ∈ [−π, π)`, `gamma ∈ [−π/2, π/2)`, as in
  Req 2.7. One draw in eight is biased to the edge cases: `beta = ±π/2` exactly and within `1e-9`
  of it (the upright phone, in gimbal lock, as the probe found), `beta = 0` (flat), `gamma = 0`,
  `gamma = −π/2`, and `alpha = 0`.
- **`horizontalRotation`**: `deviceRotation` filtered on a Camera axis horizontal part `≥ 1e-3`
  (Req 2.9), which removes the phone lying within about `0.06°` of flat (face up or face down).
  The discard rate, including the biased `beta = 0`, `gamma = 0` draws, is measured and stated
  when the generator is written.
- **`smallRotationChange`**: `Δα, Δβ, Δγ ∈ [−1e-3, 1e-3]` each, ends included.
- **`rayOffset`**: `rightRad, upRad ∈ [−80°, 80°]`, ends and `0` included.
- **`compassScenario`**: a relative azimuth in `[0, 2π)`, an offset in `(−π, π]`, 1 to 50
  samples, each with altitude in `[−30°, 30°]` and roll in `[−π, π)`. Each sample's rotation comes
  from `rotationFromDirection` (verified by P-12.6). The scenario has Screen angle `0`, headings
  `wrapTwoPi(relative + offset)` exactly, and a window that contains every sample (Req 5.14).
- **`knownAzimuthScenario`**: one `horizontalRotation` repeated over 1 to 50 sample times, a
  known azimuth in `[0, 2π)` and a known sigma in `[0, 45°]` (Req 5.15).
- **`clusteredCapture`**: 2 to 200 Relative-frame samples whose relative azimuths lie within
  `30°` of a centre in `[0, 2π)`, at altitudes in `[−30°, 30°]`. It also draws a Yaw reference
  with any offset in `(−π, π]` and North reference `true`, a sigma in `[0, 10°]`, and a valid
  Position fix within the limits. Adding `δ` to the Yaw reference's offset adds `δ` to every true
  azimuth, which is how Req 8.11's rotation is applied end to end. A `straddling` variant puts the
  centre within `30°` of `0` (Req 8.15). An `identical` variant repeats one rotation (Req 8.14).
- **`altitudeSet`**: 2 to 200 altitudes in `[−80°, 80°]`, each realised as a rotation through
  `rotationFromDirection` with a random azimuth and roll, plus a shift `δ` drawn from the range
  that keeps every altitude in `[−80°, 80°]`. Calibration offsets lie in `[−10°, 10°]` and
  calibration sigmas in `[0, 10°]`.
- **`geolocationReading`**: latitude in `[−89°, 89°]`, longitude in `(−180°, 180°]` and accuracy
  in `[0, 10 000]` m, ends included; confidence scale in `[0.1, 10]`.
- **`simulatorScript`**: valid scripts drawn over every field of Section 6, with event
  intervals of `5` to `100` ms, 1 to 5 keyframes, both frames, 0 to 3 resets, and headings
  present or not. A `noiseFree` variant sets every noise, bias, jump and frame error to zero
  (P-12.6, P-12.7).
- **`hostileInput`**: for each exported function, inputs that are type-correct but hostile:
  - any double for a `number`: `NaN`, `±Infinity`, `±0`, subnormals, `±MAX_VALUE`, and the values
    just past every limit of the package (`80°`, `±30°`, `π/2`, `1e-6`, `2000 nT` boundary points,
    the WMM dates);
  - `null` for every nullable field;
  - empty arrays and arrays of up to 300 samples;
  - samples out of time order, duplicate times and resets at window edges;
  - Yaw references established after the window;
  - scripts with every field at a limit.

  Not covered, because the static type would be a lie: values cast with `as` to a type they do
  not have, and objects whose property reads throw.

| ID | Validates (Req) | Generator domain | Property assertion |
|----|---|----|----|
| P-2.7 | 2.7 | `deviceRotation` | `‖cameraAxis‖ = 1` within `1e-12` |
| P-2.8 | 2.8 | `deviceRotation` | `cameraAxis` equals the independent `Rz·Rx·Ry · (0,0,−1)` of `reference-rotation.ts` within `1e-12` per component |
| P-2.9 | 2.9 | `horizontalRotation`; `δ ∈ [−2π, 2π]` | azimuth changes by `−δ` within `1e-9` (wrapped); altitude unchanged within `1e-12` |
| P-2.10 | 2.10 | `deviceRotation`; `smallRotationChange` | `atan2(‖a × b‖, a · b) ≤ |Δα| + |Δβ| + |Δγ| + 1e-12` |
| P-3.6 | 3.6 | `deviceRotation`; `rayOffset` | `‖offAxisRay‖ = 1` within `1e-12` |
| P-3.7 | 3.7 | `deviceRotation` | `offAxisRay(r, (0, 0))` equals `cameraAxis(r)` within `1e-12` per component |
| P-3.8 | 3.8 | `deviceRotation`; `rayOffset` | `Rᵀ · ray` gives back `rightRad`, `upRad` by `atan2(x, −z)`, `atan2(y, −z)` within `1e-9` |
| P-3.9 | 3.9 | `deviceRotation`; `rayOffset` | angle(ray, axis) `= atan(hypot(tan r, tan u))` within `1e-9` |
| P-5.14 | 5.14 | `compassScenario` | Yaw reference offset equals the offset within `1e-9` (wrapped); applying it reproduces every heading within `1e-9` |
| P-5.15 | 5.15 | `knownAzimuthScenario` | applying the reference to the relative azimuth gives the known azimuth within `1e-9`; `sigmaRad` equals the known sigma within `1e-12` |
| P-6.11 | 6.11 | magnetic azimuth `∈ [0, 2π)`; declination `∈ [−π/2, π/2]` | true and back with the negated declination returns the input within `1e-12` (wrapped) |
| P-7.9 | 7.9 | `geolocationReading` | `latRad`, `lonRad` within `1e-15` of `degToRad` of the input; reported accuracy identical |
| P-7.10 | 7.10 | `geolocationReading` and scale | `sigmaM = accuracy / scale` within relative `1e-15` |
| P-8.11 | 8.11 | `clusteredCapture`; `δ ∈ [0, 2π)` added to the Yaw reference offset | captured azimuth moves by `δ` within `1e-9` (wrapped); `azimuthSigmaRad` unchanged within `1e-12` |
| P-8.12 | 8.12 | `clusteredCapture`; a random permutation | azimuth and sigma each change by at most `1e-12` |
| P-8.13 | 8.13 | `clusteredCapture`; 1 to 50 extra samples timed outside the window, inserted anywhere | capture deep-equal to the original |
| P-8.14 | 8.14 | `clusteredCapture` `identical` | Spread `0` within `1e-12`; sigma `= max(0.01°, σN)` within `1e-12` |
| P-8.15 | 8.15 | `clusteredCapture` `straddling` | `capture(set)` equals `capture(set rotated π) − π` within `1e-9` (wrapped) |
| P-9.7 | 9.7 | one altitude `∈ [−80°, 80°]` repeated 2 to 200 times; offset `∈ [−10°, 10°]`; calibration sigma | apparent altitude `= h + offset` within `1e-12`; sigma `=` calibration sigma within `1e-12` |
| P-9.8 | 9.8 | `altitudeSet` with shift `δ` | apparent altitude moves by `δ` within `1e-12`; sigma unchanged within `1e-12` |
| P-9.9 | 9.9 | `altitudeSet`; a random permutation | apparent altitude and sigma change by at most `1e-12` |
| P-11.8 | 11.8 | `hostileInput` to every exported function, the Simulator and the browser source with a hostile fake environment | no call throws; every Result is a failure or a success whose numbers are all finite |
| P-12.6 | 12.6 | azimuth `∈ [0, 2π)`, altitude `∈ [−80°, 80°]`, roll `∈ [−π, π)`; one draw in eight at altitude `0` and roll `0` exactly (gimbal lock) | the raw event's angles lie in the W3C ranges; through `cameraAxis` they give back azimuth and altitude within `1e-9` |
| P-12.7 | 12.7 | `simulatorScript` `noiseFree`, Relative frame, altitudes `∈ [−30°, 30°]`, Screen angle `0`, heading present | `yawReferenceFromCompass` then `captureBearing` with `{ declinationRad: scripted, sigmaRad: 0.5° }` gives the scripted true azimuth within `1e-9` (wrapped) |
| P-12.8 | 12.8 | `simulatorScript`; seed `∈ [0, 2³²)` | two runs of the same script and seed give deep-equal event sequences, with `Object.is` on every number |

Notes on the properties:

- **Independence.**
  - P-2.8 uses a matrix product written in `test-support`, not `rotationMatrix` (D3).
  - P-3.8 inverts with the transpose and `atan2`, which `ray.ts` does not use.
  - P-12.6 checks `rotationFromDirection` through the closed Camera-axis formula, not through
    `rotationMatrix`.
- **P-5.14, P-8.11 to P-8.15 and P-12.7 depend on `rotationFromDirection`** to build rotations
  with a chosen direction. That function is verified first, by P-12.6, at 100 000 cases.
- **P-8.11 rotates through the Yaw reference.** Adding `δ` to the offset adds `δ` to every
  sample's true azimuth exactly as Req 8.11 states. It goes through the whole capture, not only
  `summariseAzimuths`.
- **P-8.14 is the property that D5 exists for.** The direct formula fails it (Section 9 keeps
  the counterexample).
- **Excluded degenerate cases have their own tests** (testing.md rule 4):
  - axes within `1e-3` of vertical, excluded from P-2.9, are tested at `1e-6` (`axis_vertical`)
    and just above it;
  - altitudes beyond `±80°`, excluded from P-9.7 to P-9.9 and P-12.6, are tested at `89°` and
    `90°`;
  - offsets beyond `80°` are tested at `80°` exactly and just above it.

## 9. Statistical and example tests

These are not `fast-check` properties. They are deterministic.

**Statistical (fixed seed, testing.md):**

- **Spread of a wrapped normal (Req 8.16).** Draw 2000 azimuths with the Simulator's `sfc32` and
  Box–Muller, at a fixed seed, from a normal of 1-sigma `1°` around `350°`, wrapped. Assert that
  `summariseAzimuths(...).spreadRad` lies within `5 %` of `1°`. The expected sampling error of
  the estimate is about `σ/√(2n) ≈ 1.6 %`.
- **Seed check.** The same script at three fixed seeds gives three different sample sequences,
  so the seed is used.

**World Magnetic Model (Req 6.10, 13.4).** The fixture `fixtures/wmm2025/` holds both official
files byte for byte, and `SOURCE.md` records their URLs, retrieval date and SHA-256. The test
parses them through `import.meta.glob` `?raw` (as Core's purity test reads sources):

- `wmmField` at each of the 112 published points, at its own height, equals the published
  declination within `0.01°`. Longitudes above `180°` (the published `240`) are passed as given,
  since the model is periodic in longitude.
- `declinationAt` at the six published points at height `0`, with `timeUtcMs` from the
  published decimal year by D12's inverse and the longitude wrapped to `(−180°, 180°]`, returns
  the published declination within `0.01°` and `sigmaRad = 0.5°`.
- `declinationAt` at a published point inside the blackout zone (89°N, 121°W, 2025.0,
  `H = 1504 nT`) returns `declination_unknown`.
- Validity edges: `Date.UTC(2025,0,1) − 1` and `Date.UTC(2030,0,1)` return `declination_unknown`;
  `Date.UTC(2025,0,1)` and `Date.UTC(2030,0,1) − 1` succeed.
- `decimalYearFromUtcMs`:
  - `Date.UTC(2025,0,1)` gives `2025.0` exactly;
  - `Date.UTC(2027,6,2,12)` gives `2027.5` within `1e-12`;
  - in the leap year 2028, `Date.UTC(2028,6,2)` gives `2028 + 183/366`.

**Example tests (testing.md: published values, fixtures, each failure reason):**

- **Gimbal lock, as the probe saw it.** With the phone exactly upright (`beta = 90°`), the
  rotations `(alpha 10°, gamma −10°)` and `(alpha 80°, gamma −80°)` give the same Camera azimuth,
  `0°` within `1e-12`, although `alpha` differs by `70°`. At `beta = 90°` the axis depends only on
  `alpha + gamma`.
- **Known axes.**
  - `(0°, 90°, 0°)` gives due north at altitude `0`.
  - `(90°, 90°, 0°)` gives due west, since `alpha` turns counterclockwise.
  - `(0°, 0°, 0°)`, flat and face up, gives the camera looking straight down, so the azimuth is
    `axis_vertical` and the altitude `−90°`.
- **Rays.** At `(0°, 90°, 0°)`:
  - the offset `(10°, 0)` gives azimuth `10°` and altitude `0`;
  - `(0, 10°)` gives azimuth `0` and altitude `10°`;
  - `(80°, 0)` succeeds;
  - `(80.0001°, 0)` and `(NaN, 0)` give `invalid_number` naming `rightRad`.
- **Sample normalisation.**
  - A `null` `alpha` gives `sensor_unavailable`.
  - A `NaN` `beta` gives `invalid_number` naming `beta`.
  - `deviceorientation` with `absolute: true` is Absolute; with `absolute: false` it is
    Relative; `deviceorientationabsolute` is Absolute.
  - A heading of `−1` is wrapped to `359°`, and a `NaN` heading is `null` without failing the
    sample.
  - An accuracy of `−1` is kept as negative.
  - The Screen angle `90` is recorded as `π/2`, and a missing one as `null`.
- **Compass.**
  - Two Yaw references from samples identical except for a Reported compass accuracy of `10` and
    of `50` have identical `sigmaRad` (Req 5.8).
  - One negative-accuracy sample among ten is excluded, and the reference is unchanged.
  - All negative gives `compass_unreliable`.
  - A sample at `30°` altitude is accepted; at `30.0001°` it gives `compass_unreliable`.
  - Screen angles `90°` and `null` give `compass_unreliable`.
- **Capture order and each failure (D8).** Each of these is built so that it triggers exactly one
  reason, and one combined case checks the order (a stale position together with too few samples
  gives `stale_position`):
  - `invalid_number` for each parameter of Req 10.3 (a window length of `0`, a count of `2.5`, a
    negative staleness, a sigma of `NaN`, a scale of `0`, a limit of `−1`);
  - `stale_position`;
  - `coarse_location` for the 2000 m reading of a coarse fix at the 100 m limit, carrying
    `reportedAccuracyM: 2000`;
  - `insufficient_samples` with 9 samples and the minimum 10;
  - `stale_samples` with the newest sample `501` ms before the end;
  - `frame_reset` from mixed frames, from a reset in the window, from a reset between the Yaw
    reference and the window, and from a reset between a window and a Yaw reference established
    after it;
  - `no_yaw_reference`;
  - `stale_yaw_reference` at `60 001` ms, and acceptance at `60 000` ms;
  - `axis_vertical` from one vertical sample among ten;
  - `declination_unknown` for an Absolute capture without Declination;
  - `too_unsteady` for two groups `180°` apart;
  - Core's `invalid_observation` with `field: 'positionAccuracyM'` for a fix with
    `sigmaM = 10 001`;
  - `invalid_altitude` for `89°` plus an offset of `2°`.
- **Absolute-frame sigma (Req 8.3, addition A).** Ten identical Absolute samples, the Heading
  1-sigma `2°` and a Declination 1-sigma of `0.5°` give `azimuthSigmaRad = sqrt(4.25)°`
  (`2.0616°`) within `1e-12` rad.
- **Spread counterexample (D5).** Fifty copies of `azimuthRad = 5.123` give a Spread below
  `1e-12`. The direct formula gives about `1e-8`. The example documents why D5 exists.
- **Altitude.** Ten identical samples with `UNCALIBRATED_ALTITUDE` give `sigmaRad = 3.5°`. A
  Simulator script with `altitudeBiasRad = −3.3°` captures `3.3°` low, within `1e-9`.
- **Core limits agree.** `validateBearing` accepts the capture's floor and limit (`0.01°`, `45°`)
  and rejects the next representable values outside them.
- **Defaults.** Each constant of Req 10.1 has its stated value.
- **Browser Adapter, against `FakeBrowserEnvironment`.** The fake records every call, which
  lets the tests check what was and was not called.
  - `insecure_context` with zero calls to any sensor API recorded.
  - `sensor_unavailable` when `DeviceOrientationEvent` is absent; when only events with `null`
    angles arrive within `3000` ms (desktop Chrome sends one such event); when geolocation is
    absent; and when an environment callback throws.
  - `requestOrientationPermission`:
    - with no `requestPermission`, gives `not_required` without a call;
    - `'granted'` gives `granted`;
    - `'denied'` and a rejection give `permission_denied`;
    - `startOrientation` never calls `requestPermission` (call count `0`).
  - `permission_required` after `3000` ms of silence when `requestPermission` exists and was not
    granted; `sensor_unavailable` in the same case without `requestPermission`.
  - Frames:
    - with `supportsAbsoluteOrientation`, only the `deviceorientationabsolute` listener is
      added, and a `deviceorientation` event dispatched to the fake changes nothing;
    - without it, `absolute: true` gives Absolute samples, and others give Relative.
  - Frame resets: `visibilitychange` to `"hidden"` emits `hidden`, and to `"visible"` emits
    nothing; `blur` and `pagehide` emit their causes; stop then start emits `restart`; a frame
    change emits `frame_change` before the sample.
  - Every sample's `timeUtcMs` is the injected Clock's value at dispatch, not the event's
    `timeStamp`.
  - Geolocation:
    - `watchPosition` is called with `enableHighAccuracy: true`, `maximumAge: 0` and
      `timeout: 30 000`;
    - error codes `1`, `2` and `3` map to `permission_denied`, `position_unavailable` and
      `position_timeout`;
    - a reading with accuracy `2000` is delivered as a fix with `reportedAccuracyM = 2000` and
      `sigmaM = 2000` (scale `1`).
  - `stop()` leaves the fake with zero listeners, zero watches and zero timers.
- **Simulator.**
  - A Relative-frame script with a reset at `t` delivers the `FrameResetEvent` before the sample
    at `t`.
  - A capture across it gives `frame_reset`.
  - `advanceTo` backwards gives `invalid_number`.
  - `orientationPermission: 'granted'` without a request gives `permission_required` after the
    simulated timeout; with a request, samples flow.
- **Exports map.** `purity.test.ts` asserts that `package.json` exposes only `"."`.

## 10. Purity and packaging

`@alidade/sensors` depends at runtime on `@alidade/core` (`workspace:*`) and `magvar` `2.2.0`
(exact), and nothing else (Req 1.1). Its public API is exported only from `src/index.ts`
(Req 1.6). It builds under TypeScript `strict` with no `any` (Req 1.8); ESLint's
`no-explicit-any` covers `skeleton/sensors/**`. The non-null assertion rule stays specific to
Core, as `tech.md` states. The package's `tsconfig.json` adds the `DOM` library, which only
`browser-environment.ts` needs; the purity test keeps the other files off it.

`purity.test.ts` reads the package's own sources as text through `import.meta.glob` `?raw`,
strips comments and string literals, and checks:

- **Math layer** (every file outside `src/browser/` and `src/test-support/`): no `window`,
  `document`, `navigator`, `screen`, `DeviceOrientationEvent`, `globalThis`, `Date.now`,
  `new Date`, `performance`, `Math.random`, `setTimeout`, `setInterval`, `console`, `fetch`,
  `process`, dynamic `import(` or `eval` (Req 1.2, 1.3). `Date.UTC` is allowed, in `wmm.ts` only
  (D12).
- **Imports:** relative paths, `@alidade/core` (never a deep path), and `magvar` only in
  `wmm.ts`, importing only `calculateMagneticField`.
- **Adapter:** inside `src/browser/`, only `browser-environment.ts` names browser globals or
  `Date.now`; `browser-sensor-source.ts` reaches the browser only through `BrowserEnvironment`.
- **Everywhere:** no `userAgent`, `platform` or `vendor` (Req 4.1). The property reads
  `.alphaRad` and `.gammaRad` appear only in `rotation.ts` and `simulator/simulator.ts` (which
  converts the generated rotation to degrees), so Req 2.3 can be checked by reading two files.
- **`package.json`:** runtime dependencies are exactly `@alidade/core` and `magvar`, at an exact
  version; the exports map is only `"."`.

Root scripts are unchanged; `pnpm test` runs the sensors tests at 200 cases. The package adds
`test:deep` for the checkpoint runs of Section 8. Like `test:perf`, it is not part of
`pnpm test`.
