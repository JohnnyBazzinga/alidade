# Design Document — `skeleton-sensors`

## 1. Context and scope

`skeleton-sensors` is `skeleton/sensors` (package `@alidade/sensors`). It turns device data
into plain data for the rest of the skeleton: Orientation samples with the full Device
rotation, Off-axis rays, Position fixes, Frame reset events, the World Magnetic Model
declination with its 1-sigma, a Sample history, and, from a Sighting window, one Core `Bearing`
or one apparent altitude. It also ships a seeded Simulator source behind the same interface. This design implements the
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
10. The Sample history (Req 14).
11. The Sensor source interface, the browser Adapters and the Simulator source (Req 4, 7, 11, 12).

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
  for the camera axis. The WMM's horizontal intensity is in nanotesla and is named
  `horizontalIntensityNt`; math-conventions has no row for magnetic field, so `Nt` is a new
  suffix, used only in `wmm.ts` and `declination.ts`.
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

## 3. The World Magnetic Model dependency

Req 6.6 needs the WMM2025 declination from a pinned dependency. `tech.md` forbids hand-writing
something a pinned dependency does well; the WMM is a degree-12 spherical-harmonic model with
168 coefficients and their secular variation, well beyond 30 lines.

**Chosen: `magvar` 2.2.0** (npm, <https://github.com/dpyeates/magvar>). Approved after review;
the reviewer read its source and confirmed the 112 matches independently. It is listed in
`tech.md`.

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
- *Rounding.* The declination is rounded to `0.01°`, under 1/25 of the smallest WMM 1-sigma
  (`0.26°`, Req 6.6). `h` is rounded to `0.1 nT`. The 1-sigma `σ(H) = sqrt(0.26² + (5417/H)²)`
  has `|dσ/dH| = (5417/H)² / (H · σ)` degrees per nT, largest at the blackout limit
  (`1.35e-3 °/nT` at `H = 2000 nT`), so the rounding moves the 1-sigma by at most `7e-5°`.

**The WMM error model (Req 6.6).** The 1-sigma of a WMM declination is
`sqrt(0.26² + (5417 / H)²)` degrees, with `H` in nT. The constant term covers the model's
global error; the second grows where the horizontal field is weak and the declination is
poorly defined. Over the supported domain it runs from about `0.27°` (where `H` is near its
largest, about `40 000 nT`) to `2.72°` at the `2000 nT` blackout limit. It is computed from
the `H` that `magvar` returns for the same position and time.

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

- **D8 — Every capture and Yaw reference checks in a fixed order and returns the first
  failure.** The orders are given in Sections 7.6 and 7.9. A fixed order makes failures
  deterministic. It puts the checks the user can act on (position, too few samples) before the
  ones that depend on them. Frame checks come before the North reference, because a Yaw
  reference from the wrong frame is refused, never used and never ignored (Req 5.18).

- **D9 — When a Yaw reference is valid.** A Yaw reference records its `frame` (Req 5.16) and
  `establishedUtcMs`, the end of its own Sighting window (Req 5.4). A reset *invalidates* a
  reference when the reference is in the Relative frame (any cause), or when it is in the
  Absolute frame and the cause is `frame_change` (Req 5.17). `invalidates(reference.frame,
  reset.cause)` is one function in `frame-reset.ts`, used by both constructors and the capture.
  An operation that uses a reference fails with:
  - `frame_reset` if the frame of the samples in its window is not the reference's frame
    (Req 5.18);
  - `frame_reset` if an invalidating reset lies in the closed interval from the earlier of
    `establishedUtcMs` and the operation's window start to the later of `establishedUtcMs` and
    the operation's window end (Req 5.11). This covers a reference established before the window
    and, in the frozen-image flow, one established after it.
  - `stale_yaw_reference` if `|endUtcMs − establishedUtcMs|` exceeds the maximum age (Req 5.12).

- **D10 — Which samples each constructor uses.** The compass constructor counts and uses only
  the Relative-frame samples in the window; Absolute-frame samples there are skipped, and too few
  Relative-frame samples gives `insufficient_samples` (Req 5.1, 5.9). The compass is used only
  to fix the yaw of the Relative frame (math-conventions, probe findings); in the Absolute frame
  the frame's own north already is the compass. The known-azimuth constructor uses every sample
  in the window; they must share one frame, otherwise `frame_reset` (Req 5.2), and the reference
  records that frame. In the Absolute frame this is a Sun or landmark calibration that replaces
  the frame's magnetic north and the Heading 1-sigma (Req 8.2, 8.3). A Yaw reference passed to a
  capture is either used or refused with a failure; it is never skipped.

- **D11 — The Declination function is separate from the math that uses it.** `declinationAt`
  returns a `Declination` value, with the WMM error model's 1-sigma (§3), and the captures take
  that value as data (Req 6.2). An app
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
  `watchPosition` with `enableHighAccuracy: true` and `maximumAge: 0` (so a cached reading cannot
  arrive with a receipt time that hides its age), and no `timeout`: the Adapter measures the
  position timeout itself (D21, Req 7.6).

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

- **D21 — Starting twice joins the start in progress; every start has its own deadline
  (Req 7.6, 11.5, 11.10).** Each kind (orientation, position) has a state: stopped, or started.
  A start on a started kind adds no listener, no watch and no Frame reset. Its promise joins the
  list of waiting starts. Each waiting start records its own deadline, the time of its call plus
  the timeout of its kind (`listeningTimeoutMs` or `positionTimeoutMs`), measured by the
  Adapter itself.
  - *One timer per kind.* The kind keeps at most one timer, set for the earliest deadline among
    its waiting starts. When it fires, every start whose deadline has passed settles with the
    timeout's failure, and the timer is set again for the next deadline, if any. A new start
    with a later deadline does not move the timer; one with an earlier deadline cannot occur,
    since deadlines are call time plus a fixed duration. So a second start never adds a second
    timer, and it always settles, by a sample or fix or by its own deadline.
  - *Settling by data.* The next valid sample (orientation) or the next Position fix or
    geolocation error (position) settles every waiting start and clears the timer.
  - *Position timeout.* `position_timeout` comes from the Adapter's timer; the Adapter does not
    pass a `timeout` to `watchPosition` and does not rely on the browser to report or repeat one
    (Req 7.6). A code-`3` error that a browser sends anyway is still mapped to
    `position_timeout`. A timeout does not end the watch: a later fix still reaches the
    listeners.
  - *Final errors.* A `permission_denied` error (code `1`) is final: the browser calls the
    watch no more. The Adapter clears the watch and marks positions stopped, so that a later
    start is a first start and asks the browser again.
  - The `restart` reset is emitted only by an orientation start that follows `stop()`
    (Req 4.7).

- **D22 — Listeners are isolated, and their errors are reported (Req 11.11).** `listener-set.ts`
  holds the listeners of one kind. `deliver(value)` iterates over a copy of the set taken before
  the first call, so a listener that unsubscribes (itself or another) during delivery does not
  disturb the loop, and wraps each call in `try`/`catch`. A value thrown by a listener is passed
  to `SensorSourceOptions.onListenerError`, when the caller gave one; that call is itself wrapped,
  and a value it throws is dropped. Without a callback the value is dropped. In every case the
  other listeners still receive the value, and the source keeps running. The Math layer has no
  console (Section 10), so the callback is the only place the error can go. The Adapter and the
  Simulator share this module.

- **D23 — The Sample history is copy-on-write (Req 14).** A history is a frozen plain object
  holding frozen arrays. Each `add…` function validates the item's time, computes the new newest
  time, filters the old arrays against the two retentions, appends the item where it belongs,
  freezes the result and returns it; the old history is untouched (Req 14.1).
  - *Newest time.* It is the largest `timeUtcMs` of every item the history has received,
    Position fixes included, since all three are stamped by the same Clock. It never decreases.
    An item older than it is accepted (Req 14.4) and kept if it is within its retention.
  - *Position fix.* The history keeps the most recently added fix. With a Clock that does not
    go back this is also the fix with the latest time; when the Clock steps back, the most
    recent reading is the better one to keep.
  - *Cost.* Each add copies the kept arrays. At the defaults and a 60 Hz event rate that is
    about 300 samples per add, cheap next to the event itself.
  - *Order.* Items are kept in the order added, and the filter keeps that order, so a capture
    from a history sees the same samples in the same order as a capture from the full sequence
    (Req 14.7).

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
    frame-reset.ts        FrameResetCause, FrameResetEvent, invalidates (D9)
    sighting-window.ts    SightingWindow, selectWindow, resetBetween
    circular-summary.ts   summariseAzimuths (D5), summariseAltitudes (D19)
    yaw-reference.ts      YawReference, yawReferenceFromCompass, yawReferenceFromKnownAzimuth,
                          applyYawReference
    declination.ts        Declination, wmmDeclinationSigmaRad, trueAzimuthFromMagnetic,
                          declinationAt
    wmm.ts                decimalYearFromUtcMs, wmmField (the only import of magvar)
    magvar.d.ts           type declaration of the one magvar function used
    position-fix.ts       GeolocationReading, PositionFix, positionFixFromReading, checkPositionFix
    capture.ts            captureBearing, captureAltitude
    sample-history.ts     SampleHistory, createSampleHistory, addOrientationSample,
                          addFrameReset, addPositionFix (D23)
    sensor-source.ts      SensorSource, SensorSourceOptions, Unsubscribe
    listener-set.ts       ListenerSet: isolated delivery (D22); internal
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
      property-report.ts      checkProperty and ErrorTracker: case counts, discards, worst errors
      generators.ts           shared generators of Section 8
      rotation-labels.ts      splits the reports near gimbal lock from the rest
      result-helpers.ts       expectOk for example tests
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
    listener-set.ts, orientation-sample.ts, frame-reset.ts, position-fix.ts, parameters.ts,
    sensor-result.ts
simulator/simulator.ts -> simulator/*, sensor-source.ts, listener-set.ts, orientation-sample.ts,
    frame-reset.ts, position-fix.ts, parameters.ts, sensor-result.ts
sample-history.ts -> orientation-sample.ts, frame-reset.ts, position-fix.ts, parameters.ts,
    sensor-result.ts (types only, except parameters.ts)
capture.ts -> yaw-reference.ts, declination.ts, position-fix.ts, sighting-window.ts,
    circular-summary.ts, ray.ts, rotation.ts, parameters.ts, @alidade/core
yaw-reference.ts -> sighting-window.ts, frame-reset.ts, circular-summary.ts, ray.ts, rotation.ts,
    parameters.ts
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
  | 'no_yaw_reference'          // Req 5.13 (Relative frame only)
  | 'stale_yaw_reference'       // Req 5.12
  | 'frame_reset'               // Req 5.2, 5.10, 5.11, 5.18, 8.8
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
  readonly frame: OrientationFrame;      // frame of its samples (Req 5.16); compass: 'relative'
  readonly establishedUtcMs: number;     // end of its Sighting window (Req 5.4)
}
export type ReferencedAzimuth =          // labelled with its North reference (Req 4.6)
  | { readonly northReference: 'true'; readonly azimuthRad: number }
  | { readonly northReference: 'magnetic'; readonly magneticAzimuthRad: number };

// declination.ts — Req 6
export interface Declination {
  readonly declinationRad: number;       // positive east, |·| <= π/2
  readonly sigmaRad: number;             // >= 0; from declinationAt: the WMM error model (Req 6.6)
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
  readonly yawReference?: YawReference; // required for Relative samples, optional for Absolute
  readonly yawReferenceMaxAgeMs: number;
  readonly headingSigmaRad: number;      // used only for Absolute samples without a reference
  readonly declination?: Declination;
  readonly positionFix: PositionFix;
  readonly positionStalenessMs: number;
  readonly coarseLocationLimitM: number;
}
export interface AltitudeCalibration {  // declared in defaults.ts, next to UNCALIBRATED_ALTITUDE
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

// sample-history.ts — Req 14, D23
export interface SampleHistory {         // frozen; every add returns a new one
  readonly samples: readonly OrientationSample[];   // in the order added
  readonly frameResets: readonly FrameResetEvent[]; // in the order added
  readonly positionFix: PositionFix | null;         // the most recently added
  readonly newestUtcMs: number | null;              // null until the first item
  readonly sampleRetentionMs: number;
  readonly frameResetRetentionMs: number;
}
export function createSampleHistory(retention: { sampleRetentionMs: number;
  frameResetRetentionMs: number }): SensorResult<SampleHistory>;
export function addOrientationSample(h: SampleHistory, s: OrientationSample): SensorResult<SampleHistory>;
export function addFrameReset(h: SampleHistory, e: FrameResetEvent): SensorResult<SampleHistory>;
export function addPositionFix(h: SampleHistory, f: PositionFix): SensorResult<SampleHistory>;

// sensor-source.ts — Req 4, 7, 11, 12
export type Unsubscribe = () => void;
export interface SensorSourceOptions {
  readonly listeningTimeoutMs: number;
  readonly positionTimeoutMs: number;
  // Receives every value a listener throws (Req 11.11, D22); a value it throws is dropped.
  readonly onListenerError?: (error: unknown) => void;
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
| `SAMPLE_RETENTION_MS` | `5000` |
| `FRAME_RESET_RETENTION_MS` | `120 000` (documented: must be at least the Yaw reference maximum age plus the Sighting window length, here `61 000`, Req 14.3) |
| `UNCALIBRATED_ALTITUDE` | `{ offsetRad: 0, sigmaRad: 3.5 · π/180 }` |

The WMM error model lives in `declination.ts`, not in `defaults.ts`, because it is a property
of the model, not a tunable parameter: `wmmDeclinationSigmaRad(horizontalIntensityNt)` returns
`degToRad(hypot(0.26, 5417 / horizontalIntensityNt))`, with the two constants named
`WMM_DECLINATION_SIGMA_FLOOR_DEG = 0.26` and `WMM_DECLINATION_SIGMA_FIELD_DEG_NT = 5417`. It is
internal.

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
    | { readonly kind: 'absolute'; readonly northErrorRad: number;
        // page events; the Absolute frame's zero does not move (Req 5.17)
        readonly resets: readonly { readonly timeUtcMs: number;
                                    readonly cause: 'hidden' | 'blur' | 'pagehide' }[] }
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
  // The declination of the simulated world: it turns the scripted true azimuths into the
  // magnetic headings and Absolute-frame azimuths the phone reports. An app that corrects them
  // with declinationAt() recovers the scripted true azimuth only if this value came from
  // declinationAt() at the scripted position and time; otherwise the difference shows up as a
  // north error of exactly (declinationAt − declinationRad). The published WMM2025 rates of
  // change reach 1.38°/year outside the blackout zone (at 88°N), under 0.0002° an hour, so a
  // value taken at the script's start serves for a session.
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

`yawReferenceFromCompass({ samples, frameResets, window, headingSigmaRad })` (Req 5.1), in
order (D8):

1. Validate the parameters (Req 10.3).
2. Keep the Relative-frame samples (D10) and run `selectWindow` on them. This gives
   `insufficient_samples` or `stale_samples` (Req 5.9, 5.10).
3. If any reset lies in `[end − length, end]`, return `frame_reset`: every cause invalidates a
   Relative-frame reference (Req 5.10, 5.17).
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
   `northReference: 'magnetic'`, `frame: 'relative'` (Req 5.16) and `establishedUtcMs = end`.

The Reported compass accuracy enters only at step 4 (Req 5.8). It is never read for the sigma.

`yawReferenceFromKnownAzimuth({ samples, frameResets, window, knownAzimuthRad, knownSigmaRad,
northReference, rayOffset? })` (Req 5.2), in order:

1. Validate the parameters, the known azimuth (finite, wrapped with `wrapTwoPi`), the known
   sigma (Req 10.3) and the offset (Req 3.3).
2. `selectWindow` on every sample (Req 5.9, 5.10).
3. If the samples in the window are not all in one frame, return `frame_reset` (Req 5.2). Call
   that frame `F`.
4. If a reset that `invalidates(F, cause)` lies in `[end − length, end]`, return `frame_reset`
   (Req 5.10, 5.17). In the Absolute frame only a `frame_change` counts.
5. For each sample, take `rayDirection` and its azimuth in `F`; `axis_vertical` is returned if it
   occurs. `summariseAzimuths` of those azimuths gives `m` and its spread.
6. Return `offsetRad = wrapPi(knownAzimuthRad − m)`, `sigmaRad = rss(knownSigmaRad, spread)`
   (Req 5.2, 5.3), the stated North reference, `frame: F` and `establishedUtcMs = end`.

`applyYawReference(frameAzimuthRad, y)` returns a `ReferencedAzimuth` with the value
`wrapTwoPi(frameAzimuthRad + y.offsetRad)` and the North reference of `y` (Req 5.5). The caller
must pass an azimuth of `y.frame`; the capture guarantees it (§7.9 step 5).

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
   degrees from Core's `radToDeg`, and returns `{ declinationDeg, horizontalIntensityNt }` from
   its `declination` and `h`. It checks that both are finite; a non-finite value gives
   `declination_unknown` (it cannot happen inside the checked domain, but the function stays
   total).
4. `horizontalIntensityNt < 2000` gives `declination_unknown` (Req 6.8, D12). Above it the
   division in the error model is safe.
5. Return `{ declinationRad: degToRad(declinationDeg), sigmaRad:
   wmmDeclinationSigmaRad(horizontalIntensityNt) }` (Req 6.6, §3).

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
   (Req 8.8). Call that frame `F`.
5. **Yaw reference.**
   - *Given:* if `yawReference.frame ≠ F`, return `frame_reset` (Req 5.18); if a reset that
     `invalidates(yawReference.frame, cause)` lies in the window or in the span of D9, return
     `frame_reset` (Req 5.11, 5.17, 8.8); if the age exceeds `yawReferenceMaxAgeMs`, return
     `stale_yaw_reference` (Req 5.12).
   - *Not given, `F` Relative:* a reset of any cause in the window gives `frame_reset`
     (Req 8.8); otherwise return `no_yaw_reference` (Req 5.13).
   - *Not given, `F` Absolute:* nothing to check. Page events (`hidden`, `blur`, `pagehide`,
     `restart`) do not move the Absolute frame; a `frame_change` without mixed samples in the
     window means the window lies wholly after the change.
6. **North reference.** It is the Yaw reference's when one is given, and `magnetic` for an
   Absolute window without one (Req 8.2). If it is `magnetic` and no Declination is given,
   return `declination_unknown` (Req 6.4, 8.9). A `true` Yaw reference needs no Declination, in
   either frame.
7. **Per sample, in input order.** Take `rayDirection(rotation, rayOffset)` and its azimuth in
   `F`; `axis_vertical` is returned, never dropped (Req 8.9). Through the Yaw reference when one
   is given (`applyYawReference`), else as the magnetic azimuth; then through Declination when
   the North reference is magnetic (Req 8.2).
8. **Summary.** `summariseAzimuths` of the true azimuths; `undefined_mean` becomes
   `too_unsteady` (D5).
9. **Sigma.** The North-reference 1-sigma `σN` is the Yaw reference's `sigmaRad` when one is
   used, and `headingSigmaRad` for an Absolute window without one; it is combined with `rss`
   with the Declination's `sigmaRad` when Declination was applied (Req 8.3). An Absolute capture
   with a Yaw reference never reads `headingSigmaRad`.
   `σ = max(0.01°, rss(spread, σN))`. If `σ > 45°`, return `too_unsteady` (Req 8.10).
10. **Bearing.** Build `{ id, observer: positionFix.position, positionAccuracyM:
    positionFix.sigmaM, timeUtcMs, azimuthRad: mean, azimuthSigmaRad: σ }` and return
    `validateBearing` of it: the Bearing on success, Core's failure otherwise (Req 8.4).

The four cases of steps 5 to 9:

| Window frame | Yaw reference | Declination applied | `σN` |
|---|---|---|---|
| Relative | required, Relative | if the reference is magnetic | reference ⊕ declination |
| Absolute | none | always | Heading 1-sigma ⊕ declination |
| Absolute | Absolute, `true` | never | reference |
| Absolute | Absolute, `magnetic` | always | reference ⊕ declination |

(`⊕` is `rss`.) A reference of the other frame is `frame_reset` in every row.

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
`sensor_unavailable` (D20). Each of `onOrientation`, `onFrameReset` and `onPosition` adds to its
own `ListenerSet`, and every delivery goes through it (D22, Req 11.11).

`requestOrientationPermission()`:
- `env.isSecureContext` false gives `insecure_context`;
- `requestOrientationPermission === null` gives `ok('not_required')` (Req 11.3);
- otherwise call it once. `"granted"` gives `ok('granted')` and marks the source as granted.
  Any other value, or a rejection, gives `permission_denied` (Req 11.4).

`startOrientation()`:
1. `isSecureContext` false gives `insecure_context`, before any other `env` call (Req 11.7).
2. `hasDeviceOrientation` false gives `sensor_unavailable` (Req 11.6).
3. If orientation is already started, join the waiting starts with a deadline of
   `clock() + listeningTimeoutMs` (D21, Req 11.10), setting the timer if none is running, and
   return. Nothing else below runs.
4. If the source was started before and stopped, emit `{ cause: 'restart' }` at `clock()`
   (Req 4.7).
5. Add one listener: `deviceorientationabsolute` if `supportsAbsoluteOrientation`, else
   `deviceorientation` (D7, Req 4.2, 4.3). Add `blur` and `pagehide` window listeners and a
   visibility listener.
6. Record the deadline `clock() + listeningTimeoutMs` and set the timer for it. When the timer
   fires, settle every start whose deadline has passed with `permission_required` or
   `sensor_unavailable` (D14, Req 11.5), and set it again for the next deadline (D21). The
   listeners stay (a late permission grant then still delivers samples).
7. On each orientation event:
   - copy it into a `RawOrientationEvent` (non-numbers become `null`);
   - call `orientationSampleFromEvent(raw, clock(), env.screenAngleDeg())`;
   - if the frame changed since the last valid sample, emit `frame_change` first (Req 4.8);
   - deliver the Result to the listeners;
   - a valid sample clears the timer and settles every waiting start with its frame.
8. `visibilitychange` emits `{ cause: 'hidden' }` only when `visibilityState()` is `"hidden"`;
   `blur` emits `blur`; `pagehide` emits `pagehide`.

`startPosition()`:
- not secure gives `insecure_context`;
- `geolocation === null` gives `sensor_unavailable`;
- record the deadline `clock() + positionTimeoutMs` and set the position timer for the earliest
  deadline (D21); when it fires, the starts past their deadline settle with `position_timeout`
  (Req 7.6);
- already started: join the waiting starts and return;
- otherwise call `watchPosition(onReading, onError, { enableHighAccuracy: true, maximumAge: 0 })`
  (D13), with no `timeout`;
- each reading becomes `positionFixFromReading(copy, clock(), positionConfidenceScale)`;
- each error maps by its code: `1` gives `permission_denied`, `2` `position_unavailable`, `3`
  `position_timeout` (Req 7.6), and any other code `position_unavailable`;
- each Result settles every waiting start, clears the position timer, and goes to the listeners;
- a `permission_denied` error also clears the watch and marks positions stopped (D21).

`stop()` removes every listener added, clears the watch and both timers, and settles any pending
start with `sensor_unavailable` (Req 11.9). A later start is a restart.

Every `ListenerSet` of the source is built with `options.onListenerError` (D22).

### 7.12 Simulator (`simulator/`)

`createSimulator(script, seed, options)` validates the script, the seed (an integer in
`[0, 2³²)`) and the options. Any failure is `invalid_number` naming the field; a pose list that
is empty or not strictly increasing in time is `invalid_number` with `field: 'pose'`. It returns
`{ source, controls }`.

**Schedule.**
- Orientation events fall at `startUtcMs + k · eventIntervalMs` for `k = 0, 1, …`, from the
  `startOrientation()` call on.
- Resets fall at their scripted times, in either frame. An Absolute-frame script can state only
  page events (`hidden`, `blur`, `pagehide`); they do not change the frame's north.
- Position readings start at `start + firstFixDelayMs` and repeat every `fixIntervalMs`, from
  `startPosition()` on.
- `advanceTo(t)` fails with `invalid_number` if `t` is earlier than the current time. Otherwise
  it delivers every event in `(now, t]` in time order, with ties ordered as in D16, through the
  same `ListenerSet` as the Adapter (D22).
- Starting twice follows D21: a second `startOrientation()` or `startPosition()` schedules
  nothing new and emits no reset; it settles with the next sample, fix or timeout. `stop()` and
  a new start emit `restart` at the simulated time of the start.

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

### 7.13 Sample history (`sample-history.ts`)

`createSampleHistory({ sampleRetentionMs, frameResetRetentionMs })` validates both as durations
(`invalid_number` naming the field, Req 10.3) and returns an empty frozen history
(`newestUtcMs: null`).

`addOrientationSample(h, s)`, `addFrameReset(h, e)` and `addPositionFix(h, f)` (D23):

1. If the item's `timeUtcMs` is not finite, return `invalid_number` with `field: 'timeUtcMs'`;
   `h` is unchanged (Req 14.4).
2. `newest = max(h.newestUtcMs ?? t, t)`.
3. `samples` = the old samples, then the new one if it is a sample, keeping those with
   `newest − timeUtcMs ≤ sampleRetentionMs`. `frameResets` likewise with
   `frameResetRetentionMs`. `positionFix` = the new fix if it is a fix, else the old one
   (Req 14.2).
4. Freeze both arrays and the history, and return it.

The comparison `newest − timeUtcMs ≤ retention` keeps an item exactly at the retention limit,
matching "no more than" in Req 14.2. The captures take `h.samples` and `h.frameResets` as they
are (Req 14.5), so a frozen-image flow keeps the history of the moment of the tap and captures
from it later.

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

- at 100 000 cases: P-2.7, P-2.8, P-2.9, P-2.10, P-3.6, P-3.7, P-3.8, P-3.9, P-5.14, P-5.15
  (once per frame, so 100 000 Relative and 100 000 Absolute cases), P-6.11, P-7.9, P-7.10,
  P-8.11, P-8.12, P-8.14, P-8.15, P-9.7, P-9.8, P-9.9 and P-12.6;
- at 10 000 cases, because each case runs a whole simulation, calls every exported function or
  builds a history of up to 310 items: P-8.13, P-11.8, P-12.7, P-12.8, P-14.6 and P-14.7. These
  properties set `numRuns: Math.min(propertyRuns, 10_000)`.

The 100 000-case list covers the places where floating-point behaviour is the risk:
- the gimbal lock at `beta = ±90°`, including the log-scale draws near it (P-2.7 to P-2.10,
  P-3.6 to P-3.9, P-12.6);
- the `1e-12` identities of the Spread (P-8.14, P-9.7);
- the wrap at `0 / 2π` (P-8.15);
- the inverse rotations (P-3.8, P-12.6).

The checkpoint report gives the count and the worst error for each.

Shared generators (`test-support/generators.ts`, domains stated in each). "Uniform" draws use
53 unbiased random bits (`fc.noBias` on an integer), not `fc.double`: `fc.double` draws evenly
over the representable doubles, so most of its draws are tiny and the phone would lie flat far
more often than a uniform angle puts it there. Ends and special values are drawn explicitly.

- **`deviceRotation`**: `alpha ∈ [0, 2π)`, `beta ∈ [−π, π)`, `gamma ∈ [−π/2, π/2)`, as in
  Req 2.7. Half the draws are uniform. The other half go to the edge cases:
  - *near gimbal lock (the upright phone, as the probe found):* `beta = ±π/2 + s · 10^k`, with
    `s = ±1` and `k` uniform in `[−17, −2]`, and `beta = ±π/2` exactly; `gamma` in those draws is
    `0` exactly, `s · 10^k` on the same log scale, `−π/2` exactly, or `−π/2 + 10^k`, and
    otherwise uniform;
  - *other edges:* `beta = 0` (flat), `gamma = 0`, `gamma = −π/2`, `alpha = 0`.

  Offsets below about `1e-16` round to `±π/2` itself; those draws are kept on purpose, since
  they test the exact value as the browser can deliver it.
- **`horizontalRotation`**: `deviceRotation` filtered on a Camera axis horizontal part `≥ 1e-3`
  (Req 2.9), which removes the phone lying within about `0.06°` of flat (face up or face down).
  Measured discard rate: 1 draw in 100 000 (seed `20261117`). P-2.9 applies the condition with
  `fc.pre`, so its report counts the discards.
- **`smallRotationChange`**: `Δα, Δβ, Δγ ∈ [−1e-3, 1e-3]` each, ends included.
- **`rayOffset`**: `rightRad, upRad ∈ [−80°, 80°]`, ends and `0` included.
- **`compassScenario`**: a relative azimuth in `[0, 2π)`, an offset in `(−π, π]`, 1 to 50
  samples, each with altitude in `[−30°, 30°]` and roll in `[−π, π)`. Each sample's rotation comes
  from `rotationFromDirection` (verified by P-12.6). The scenario has Screen angle `0`, headings
  `wrapTwoPi(relative + offset)` exactly, and a window that contains every sample (Req 5.14).
- **`knownAzimuthScenario(frame)`**: one `horizontalRotation` repeated over 1 to 50 sample times,
  all in the given frame, a known azimuth in `[0, 2π)`, a known sigma in `[0, 45°]` and a North
  reference `true` or `magnetic` (Req 5.15). P-5.15 runs it once with `'relative'` and once with
  `'absolute'`.
- **`clusteredCapture`**: 2 to 200 Relative-frame samples whose relative azimuths lie within
  `30°` of a centre in `[0, 2π)`, at altitudes in `[−30°, 30°]`. It also draws a Yaw reference
  with any offset in `(−π, π]` and North reference `true`, a sigma in `[0, 10°]`, and a valid
  Position fix within the limits. Replacing the Yaw reference's offset by
  `wrapPi(offset + δ)`, which keeps it in `(−π, π]`, adds `δ` (modulo `2π`) to every true
  azimuth, which is how Req 8.11's rotation is applied end to end. A `straddling` variant puts the
  centre within `30°` of `0` (Req 8.15). An `identical` variant repeats one rotation (Req 8.14).
- **`altitudeSet`**: 2 to 200 altitudes in `[−80°, 80°]`, each realised as a rotation through
  `rotationFromDirection` with a random azimuth and roll, plus a shift `δ` drawn from the range
  that keeps every altitude in `[−80°, 80°]`. Calibration offsets lie in `[−10°, 10°]` and
  calibration sigmas in `[0, 10°]`.
- **`cameraPose`** (P-12.6): azimuth in `[0, 2π)`, altitude in `[−80°, 80°]`, roll in
  `[−π, π)`. Half the draws are uniform. The other half are near gimbal lock: the altitude is `0`
  exactly or `s · 10^k` with `s = ±1` and `k` uniform in `[−17, −2]`, and the roll is `0`,
  `±π/2` or `−π` exactly, or one of `0`, `±π/2` plus `s · 10^k`, or `π − 10^k`, `−π + 10^k`, on
  the same log scale. Upright with no roll is exactly the W3C gimbal lock (`beta = 90°`); a roll
  of `±π/2` puts the phone on its side and `π` upside down.
- **`geolocationReading`**: latitude in `[−89°, 89°]`, longitude in `(−180°, 180°]` and accuracy
  in `[0, 10 000]` m, ends included; confidence scale in `[0.1, 10]`.
- **`compassCaptureScript`** (P-12.7, Req 12.7): a `noiseFree` Relative-frame script with a
  heading (no bias, noise or jumps), Screen angle `0`, no altitude bias, a Declination in
  `[−π/2, π/2]`, and two windows built on the script's timeline:
  - *Timeline.* An event interval in `[5, 100]` ms. The Yaw reference window `[Ty0, Ty1]` and
    the capture window `[Tc0, Tc1]` each have a length from `10` to `100` event intervals (so at
    least `10` samples, the minimum count drawn in `[1, 10]`), with a gap `Tc0 − Ty1` in
    `[0, 5000]` ms. Window ends fall on event times, so the newest sample is never Stale.
  - *Resets.* 0 to 3 resets, each with a new zero in `[0, 2π)`, placed only before `Ty0` (in
    `[start, Ty0)`) or after `Tc1` (in `(Tc1, Tc1 + 5000]`). None lies in `[Ty0, Tc1]`, which
    covers the Yaw reference window, the span between it and the capture, and the capture
    window, as Req 12.7 requires. Resets before `Ty0` change the zero that the reference then
    measures; resets after `Tc1` are delivered but read by neither window.
  - *Pose.* 1 to 4 moving keyframes before `Tc0`, anywhere from the start, so the direction may
    move during the Yaw reference window. Then two keyframes with the same direction `D`, one at
    a time in `[Ty1, Tc0]` and one at `Tc1` or later, so the direction is constant over the
    capture window; optionally more moving keyframes after that. Altitudes in `[−30°, 30°]`,
    rolls in `[−π, π)`, so every interpolated altitude stays in `[−30°, 30°]`.
  - The capture's true azimuth is checked against `D`'s azimuth.
- **`simulatorScript`**: valid scripts drawn over every field of Section 6, with event
  intervals of `5` to `100` ms, 1 to 5 keyframes, both frames, 0 to 3 resets, and headings
  present or not. A `noiseFree` variant sets every noise, bias, jump and frame error to zero
  (P-12.8 uses both).
- **`historySequence`** (P-14.6, P-14.7): 0 to 300 Orientation samples and 0 to 10 Frame reset
  events, interleaved in any order, with times that do not decrease and span up to `200 000 ms`
  (ties drawn on purpose), a sample retention in `[100, 10 000]` ms and a Frame reset retention
  in `[1000, 150 000]` ms, ends included (Req 14.6). Half the draws are *dense*: time steps of
  `5` to `50` ms, so that a Sighting window holds enough samples for a capture to succeed.
  Samples are in one frame per sequence (Relative or Absolute), clustered within `30°` like
  `clusteredCapture`; resets have any cause.
- **`historyCapture`** (P-14.7): for a `historySequence` with newest time `T`, a bearing capture
  whose window start is drawn from `[T − min(sampleRetention, resetRetention), T]`, whose length
  is in `[1, 2000]` ms and whose minimum sample count is in `[1, 20]`; a Yaw reference of the
  sequence's frame, with `establishedUtcMs` drawn from `[T − resetRetention, T + 2000]` and a
  maximum age large enough to cover it; a valid Position fix; and a Declination. For dense
  sequences, half the captures instead end exactly at `T`, with a length drawn from
  `[1, min(sampleRetention, resetRetention, 2000)]` ms, so that their samples are fresh. Every
  draw meets the conditions of Req 14.7. The success fraction is measured when the generator is
  written and stated in its comment.
- **`hostileInput`**: for each exported function, inputs that are type-correct but hostile:
  - any double for a `number`: `NaN`, `±Infinity`, `±0`, subnormals, `±MAX_VALUE`, and the values
    just past every limit of the package (`80°`, `±30°`, `π/2`, `1e-6`, `2000 nT` boundary points,
    the WMM dates);
  - `null` for every nullable field;
  - empty arrays and arrays of up to 300 samples;
  - samples out of time order, duplicate times and resets at window edges;
  - Yaw references established after the window, and of the other frame;
  - histories with retentions of `0`, items with non-finite times, and Clocks that step back;
  - listeners that throw;
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
| P-5.15 | 5.15 | `knownAzimuthScenario('relative')` and `knownAzimuthScenario('absolute')`, as two tests | `frame` is the scenario's; applying the reference to the samples' Camera azimuth gives the known azimuth within `1e-9` (wrapped); `sigmaRad` equals the known sigma within `1e-12` |
| P-6.11 | 6.11 | magnetic azimuth `∈ [0, 2π)`; declination `∈ [−π/2, π/2]` | true and back with the negated declination returns the input within `1e-12` (wrapped) |
| P-7.9 | 7.9 | `geolocationReading` | `latRad`, `lonRad` within `1e-15` of `degToRad` of the input; reported accuracy identical |
| P-7.10 | 7.10 | `geolocationReading` and scale | `sigmaM = accuracy / scale` within relative `1e-15` |
| P-8.11 | 8.11 | `clusteredCapture`; `δ ∈ [0, 2π)`, the Yaw reference offset replaced by `wrapPi(offset + δ)` | captured azimuth moves by `δ` within `1e-9` (wrapped); `azimuthSigmaRad` unchanged within `1e-12` |
| P-8.12 | 8.12 | `clusteredCapture`; a random permutation | azimuth and sigma each change by at most `1e-12` |
| P-8.13 | 8.13 | `clusteredCapture`; 1 to 50 extra samples timed outside the window, inserted anywhere | capture deep-equal to the original |
| P-8.14 | 8.14 | `clusteredCapture` `identical` | Spread `0` within `1e-12`; sigma `= max(0.01°, σN)` within `1e-12` |
| P-8.15 | 8.15 | `clusteredCapture` `straddling` | `capture(set)` equals `capture(set rotated π) − π` within `1e-9` (wrapped) |
| P-9.7 | 9.7 | one altitude `∈ [−80°, 80°]` repeated 2 to 200 times; offset `∈ [−10°, 10°]`; calibration sigma | apparent altitude `= h + offset` within `1e-12`; sigma `=` calibration sigma within `1e-12` |
| P-9.8 | 9.8 | `altitudeSet` with shift `δ` | apparent altitude moves by `δ` within `1e-12`; sigma unchanged within `1e-12` |
| P-9.9 | 9.9 | `altitudeSet`; a random permutation | apparent altitude and sigma change by at most `1e-12` |
| P-11.8 | 11.8 | `hostileInput` to every exported function, the Simulator and the browser source with a hostile fake environment | no call throws; every Result is a failure or a success whose numbers are all finite |
| P-12.6 | 12.6 | `cameraPose`, including its log-scale draws near gimbal lock | the raw event's angles lie in the W3C ranges; through `cameraAxis` they give back azimuth and altitude within `1e-9` |
| P-12.7 | 12.7 | `compassCaptureScript`; a Declination 1-sigma drawn from `[0.26°, 2.72°]`, the range of the WMM error model above the blackout limit | run the Simulator past `Tc1 + 5000`; `yawReferenceFromCompass` over `[Ty0, Ty1]`, then `captureBearing` over `[Tc0, Tc1]` with `{ declinationRad: scripted, sigmaRad: drawn }`, give `D`'s true azimuth within `1e-9` (wrapped), and `azimuthSigmaRad = max(0.01°, rss(headingSigmaRad, drawn))` within `1e-12` |
| P-12.8 | 12.8 | `simulatorScript`; seed `∈ [0, 2³²)` | two runs of the same script and seed give deep-equal event sequences, with `Object.is` on every number |
| P-14.6 | 14.6 | `historySequence` | after the last add, `samples` and `frameResets` are exactly the items of the sequence with `T − timeUtcMs ≤ retention` (`T` its last time), in the order added, compared with `Object.is` on every item; and the same holds after every intermediate add, with `T` the time so far |
| P-14.7 | 14.7 | `historyCapture` | `captureBearing` on the history's samples and resets is deep-equal (`Object.is` on numbers) to `captureBearing` on the full sequence, failures included; the test counts the successes and fails if fewer than 10 % of cases succeed, so that it cannot pass on failures alone |

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
- **P-12.7 lets the direction move while the reference is taken.** Noise-free, every heading
  minus its relative azimuth is the same number, `zero − declination`, whatever the direction,
  so a moving camera still gives an exact reference. The capture window needs a constant
  direction, because the property compares one azimuth with one scripted value.
- **P-12.7's Declination 1-sigma.** The Simulator's Declination is a scripted value, not a WMM
  call, so the property draws its 1-sigma over the error model's range instead of computing it.
- **P-14.7 is exact.** The history keeps exactly the samples a capture reads, in the same order
  (D23), so the two captures run the same floating-point operations. Any difference is a bug.
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
- `declinationAt` at the seven published points at height `0` (six in `WMM2025_TEST_VALUES.txt`,
  one in `WMM2025_TestValues.txt`), with `timeUtcMs` from the published decimal year by D12's
  inverse and the longitude wrapped to `(−180°, 180°]`, returns the published declination within
  `0.01°`.
- **Declination 1-sigma at the published points (Req 6.6).** At the same seven points, the
  returned `sigmaRad` lies between `σ(H + 0.1 nT)` and `σ(H − 0.1 nT)`, where `H` is the
  published horizontal intensity and `σ(H) = degToRad(sqrt(0.26² + (5417/H)²))`. The interval
  covers the `0.1 nT` to which `magvar` rounds `h`; the test computes `σ` from the fixture, not
  from the source. The expected values, at the published `H`:

  | Year | Lat | Lon | Published `H` (nT) | Expected 1-sigma |
  |---|---|---|---|---|
  | 2025.0 | 80 | 0 | 6523.2 | `0.870172°` |
  | 2025.0 | 0 | 120 | 39677.9 | `0.293665°` |
  | 2025.0 | −80 | 240 | 16898.1 | `0.412752°` |
  | 2027.5 | 80 | 0 | 6507.5 | `0.872084°` |
  | 2027.5 | 0 | 120 | 39702.0 | `0.293626°` |
  | 2027.5 | −80 | 240 | 16908.3 | `0.412602°` |
  | 2027.5 | −13 | −59 | 22401.49301 | `0.355069°` |

  A synthetic check of the formula at its ends: `wmmDeclinationSigmaRad(2000)` is
  `degToRad(hypot(0.26, 2.7085))` (`2.7210°`), and the 1-sigma decreases as `H` grows.
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
  - `no_yaw_reference` for a Relative window without a Yaw reference;
  - `stale_yaw_reference` at `60 001` ms, and acceptance at `60 000` ms;
  - `axis_vertical` from one vertical sample among ten;
  - `declination_unknown` for an Absolute capture with neither a Yaw reference nor a Declination;
  - `too_unsteady` for two groups `180°` apart;
  - Core's `invalid_observation` with `field: 'positionAccuracyM'` for a fix with
    `sigmaM = 10 001`;
  - `invalid_altitude` for `89°` plus an offset of `2°`.
- **Absolute-frame sigma (Req 8.3).** Ten identical Absolute samples, no Yaw reference, the
  Heading 1-sigma `2°` and the Declination of the published point (2025.0, 0°, 120°), whose
  1-sigma from the published `H = 39677.9 nT` is `0.293665°`, give
  `azimuthSigmaRad = hypot(2°, 0.293665°) = 2.021445°`, within `1e-12` rad of `hypot` of the two
  radian values. The same capture with the Declination from `declinationAt` at that point lies
  within the interval of the 1-sigma example above, combined with `2°`.
- **Yaw references in both frames (Req 5.2, 5.16 to 5.18, 8.2, 8.3, 8.8).**
  - A known-azimuth reference from ten Absolute samples records `frame: 'absolute'`; from ten
    Relative samples, `frame: 'relative'`; from five of each, `frame_reset`.
  - The compass constructor on a window of Absolute samples only gives `insufficient_samples`,
    and its reference always records `frame: 'relative'`.
  - An Absolute capture with a `true` Absolute reference and no Declination succeeds, and its
    `azimuthSigmaRad` is `max(0.01°, rss(spread, reference sigma))`: no Heading 1-sigma (the
    capture gives the same sigma whether `headingSigmaRad` is `2°` or `40°`) and no Declination.
  - An Absolute capture with a `magnetic` Absolute reference and no Declination gives
    `declination_unknown`; with one, the sigma is `rss(spread, reference, declination)`.
  - A Relative reference passed to an Absolute capture, and an Absolute reference passed to a
    Relative capture, each give `frame_reset`.
  - A `hidden` reset (and likewise `blur`, `pagehide`, `restart`) between an Absolute reference
    and the window does not invalidate it: the capture succeeds. A `frame_change` there gives
    `frame_reset`. The same `hidden` reset with a Relative reference gives `frame_reset`.
  - An Absolute capture without a reference succeeds across a `hidden` reset in the window.
  - A Simulator script in the Absolute frame with a scripted `hidden` reset: a Sun-style
    reference from `yawReferenceFromKnownAzimuth` before it, then a capture after it, gives the
    scripted true azimuth within `1e-9` with no Declination.
- **Spread counterexample (D5).** Fifty copies of `azimuthRad = 5.123` give a Spread below
  `1e-12`. The direct formula gives about `1e-8`. The example documents why D5 exists.
- **Altitude.** Ten identical samples with `UNCALIBRATED_ALTITUDE` give `sigmaRad = 3.5°`. A
  Simulator script with `altitudeBiasRad = −3.3°` captures `3.3°` low, within `1e-9`.
- **Core limits agree.** `validateBearing` accepts the capture's floor and limit (`0.01°`, `45°`)
  and rejects the next representable values outside them.
- **Defaults.** Each constant of Req 10.1 has its stated value, and
  `FRAME_RESET_RETENTION_MS ≥ YAW_REFERENCE_MAX_AGE_MS + SIGHTING_WINDOW_LENGTH_MS` (Req 14.3).
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
    - `watchPosition` is called with `enableHighAccuracy: true` and `maximumAge: 0`, and with no
      `timeout` field;
    - with no browser callback at all, `startPosition()` settles with `position_timeout` at
      `30 000` ms on the fake's clock, from the Adapter's own timer (Req 7.6);
    - a second `startPosition()` made after the first timed out, again with no further browser
      callback, settles with `position_timeout` `30 000` ms after its own call; two starts
      `10 000` ms apart settle at `30 000` and `40 000` ms, and the fake shows at most one live
      timer throughout;
    - a fix arriving after a timeout still reaches the listeners;
    - error codes `1`, `2` and `3` map to `permission_denied`, `position_unavailable` and
      `position_timeout`;
    - a reading with accuracy `2000` is delivered as a fix with `reportedAccuracyM = 2000` and
      `sigmaM = 2000` (scale `1`).
  - `stop()` leaves the fake with zero listeners, zero watches and zero timers.
  - **Starting twice (Req 11.10, D21).** Two `startOrientation()` calls in a row: the fake records
    one orientation listener, one `blur`, one `pagehide`, one visibility listener and one timer;
    no Frame reset is emitted; both promises settle with the frame of the next sample. A second
    call after the first has timed out arms the timer once more (one timer in the fake) and
    settles with the next sample or the next timeout. Two `startPosition()` calls: one watch;
    both settle with the next fix. After a code-`1` error the watch is cleared, and a new
    `startPosition()` calls `watchPosition` again. `stop()` then `startOrientation()` emits one
    `restart`; a further `startOrientation()` emits none.
  - **Throwing listeners (Req 11.11, D22).** Three orientation listeners, the second throwing on
    every call: over five events the first and third receive all five samples, in order, and the
    source keeps delivering. The same for Frame reset and position listeners. A listener that
    unsubscribes itself during delivery still lets the others receive that event.
    - With `onListenerError`, it receives the thrown value itself (the same object, by
      identity), once per throw, five times in all.
    - Without `onListenerError`, the same run delivers the same samples and nothing escapes.
    - An `onListenerError` that itself throws: delivery to the other listeners and later events
      are unaffected.
- **Simulator.**
  - A Relative-frame script with a reset at `t` delivers the `FrameResetEvent` before the sample
    at `t`.
  - A capture across it gives `frame_reset`.
  - `advanceTo` backwards gives `invalid_number`.
  - `orientationPermission: 'granted'` without a request gives `permission_required` after the
    simulated timeout; with a request, samples flow.
  - Starting twice and throwing listeners behave as in the Adapter examples above (D21, D22).
- **Sample history (Req 14).**
  - An item with a `NaN` or infinite time gives `invalid_number`, and the history passed in is
    deep-equal to its state before the call.
  - A sample exactly `sampleRetentionMs` older than the newest is kept; one `1` ms older is
    dropped. The same for Frame resets at `frameResetRetentionMs`.
  - A sample older than the newest (the Clock stepped back by `200` ms) is accepted and kept;
    `newestUtcMs` does not decrease.
  - A Position fix advances `newestUtcMs` and so prunes old samples; the history keeps the most
    recently added fix.
  - A history handed out is frozen: after ten more adds it is deep-equal to a copy taken when it
    was handed out, and writing to it throws in strict mode.
  - **Frozen image.** Keep the history at a tap, add three seconds more of samples that point
    elsewhere and a `blur`, then capture from the kept history: the result is the capture of the
    moment of the tap, not of the later samples.
  - `createSampleHistory` gives `invalid_number` for a negative or `NaN` retention, naming it.
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
  (D12). This covers `listener-set.ts` and `sample-history.ts`, which the Adapter and the apps
  share.
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
