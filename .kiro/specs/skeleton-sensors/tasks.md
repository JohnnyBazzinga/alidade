# Implementation Plan: skeleton-sensors

Package: `skeleton/sensors` (`@alidade/sensors`). Source of truth: `requirements.md` and
`design.md` in this folder. Section and decision references (`D5`, `§7.9`) point into
`design.md`.

## Working rules for every task

- Follow `.kiro/steering/math-conventions.md`: radians internally, unit suffix on every
  numeric name (`Ms` for durations, `UtcMs` for instants, `Nt` for the WMM's field intensity,
  §2), azimuths named by their North reference, angle differences through `wrapPi`, the camera
  direction from the full rotation, never from `alpha` or `gamma` alone.
- Follow `tech.md`: TypeScript `strict`, ES modules, pnpm only, exact dependency versions
  (no `^` or `~`), no `any`, no watch mode, no dev server. Browser APIs only under
  `src/browser/`, and there only in `browser-environment.ts` (D1).
- Follow `testing.md`. Every property test: at least 200 cases in `pnpm test`, a comment above
  it naming the property and the requirements it validates, generator domains documented,
  tolerances taken from `requirements.md`, angles compared with `wrapPi(a - b)`.
- If a property test fails, decide whether the code, the property or the requirement is
  wrong and say which. Do not weaken a tolerance, narrow a generator or delete an
  assertion to get a pass. If the cause is the requirement or the design, stop and report.
  When a property finds a real bug, add the shrunk counterexample as an example test
  before fixing the code.
- A property excludes a degenerate case through its generator only if that case also has
  an example test of its own.
- Every exported function is total (D20, Req 11.8): for any type-correct input it returns
  a failure `SensorResult` or finite numbers, and never throws.
- Core is not changed (Req 11.1). Sensors imports only from `@alidade/core`'s index.
- `notes/` is private: never read it. Every fixture is synthetic, except the official WMM2025
  test values, which are copied byte for byte.
- Tests sit next to the code: `foo.test.ts` for examples, `foo.property.test.ts` for
  properties.
- Every task ends with `pnpm --filter @alidade/sensors test` and `pnpm typecheck` passing for
  the code it touched.
- **Every checkpoint** first runs `pnpm --filter @alidade/sensors test:deep` for the
  properties of that layer (§8: 100 000 cases, or 10 000 for the properties listed there), and
  reports, for each property, the number of cases run, the number of discards and the worst
  error measured against its tolerance. It then runs `pnpm test`, `pnpm typecheck` and
  `pnpm lint` and `pnpm format:check` from the root.
- **Stops for review** at checkpoints 6, 10, 13 and 18, and at any failing property. The
  checkpoints 4 and 16 do not stop: their `test:deep` reports are carried into the reports of
  checkpoints 6 and 18.

## Tasks

- [x] 1. Scaffold the sensors package
  - [x] 1.1 Create `skeleton/sensors` (`@alidade/sensors`)
    - `package.json`: `exports` only `"."` (`./src/index.ts`); dependencies `@alidade/core`
      (`workspace:*`) and `magvar` `2.2.0` exactly; dev dependencies Vitest, `fast-check` and
      TypeScript at the versions Core pins. Scripts `test` (`vitest run`), `test:deep`
      (`vitest run --config vitest.deep.config.ts`) and `typecheck`.
    - `tsconfig.json` extending the base, with the `DOM` library (needed only by
      `browser-environment.ts`, §10). An empty `src/index.ts`.
    - Extend the root ESLint config so that `no-explicit-any` applies to `skeleton/sensors/**`.
    - _Requirements: 1.1, 1.6, 1.8_
  - [x] 1.2 Property-run configuration and error tracking
    - `vitest.config.ts` provides `propertyRuns = 200`; `vitest.deep.config.ts` provides
      `propertyRuns = 100 000`, includes only `*.property.test.ts`, and runs without file
      parallelism. `src/test-support/fast-check-setup.ts` reads the value with `inject` and
      calls `fc.configureGlobal`; it also exports the cap used by the 10 000-case properties.
    - `src/test-support/error-tracker.ts`: a property records each measured error against its
      tolerance; under `test:deep` the worst error and the case count are printed per property,
      for the checkpoint reports.
    - Example test: the default run gives 200 runs; the cap gives `min(runs, 10 000)`.
    - _Requirements: 13.1_
  - [x] 1.3 WMM2025 fixture
    - Copy `WMM2025_TEST_VALUES.txt` and `WMM2025COF/WMM2025_TestValues.txt` from NOAA NCEI
      into `fixtures/wmm2025/` byte for byte, with `SOURCE.md` giving their URLs, the retrieval
      date and the SHA-256 values of §3.
    - `src/test-support/fixtures.ts`: parse both files through `import.meta.glob` `?raw` into
      plain rows (year, height, latitude, longitude, declination, `H`).
    - Example test: both files hash to the recorded SHA-256 values; the parsers return 12 and
      100 rows; the first row of each matches the published text.
    - _Requirements: 6.10, 13.4_
  - [x] 1.4 Seeded random source
    - `src/simulator/seeded-random.ts`: `sfc32` from a 32-bit seed, uniform doubles in `[0, 1)`,
      and normal draws by Box–Muller (D17). Source code, not test code: the Simulator uses it.
    - Example test: the same seed gives the same sequence bit for bit; different seeds differ;
      over 100 000 fixed-seed draws the normal mean and standard deviation are within
      `0.01` of `0` and `1`.
    - _Requirements: 12.4_

- [x] 2. Results, defaults and parameters
  - [x] 2.1 Implement `src/sensor-result.ts`
    - `SensorReason` (every Core `Reason` plus the 19 of Req 11.1), `SensorFailure` with
      optional `field`, `id` and `reportedAccuracyM`, `SensorResult<T>`; internal `ok` and
      `err` (D2). Export the types, with the closed set documented.
    - Example test: a Core `Failure` is assignable to `SensorFailure` (type-level test) and
      passes through a function returning `SensorResult` unchanged.
    - _Requirements: 11.1_
  - [x] 2.2 Implement `src/defaults.ts`
    - The twelve constants of Req 10.1 and `UNCALIBRATED_ALTITUDE` (§6 table), each
      documented with its source; `MIN_SAMPLE_COUNT` states the `10 Hz` assumption;
      `FRAME_RESET_RETENTION_MS` states the rule of Req 14.3.
    - Example test: each constant has its stated value, and
      `FRAME_RESET_RETENTION_MS ≥ YAW_REFERENCE_MAX_AGE_MS + SIGHTING_WINDOW_LENGTH_MS`.
    - _Requirements: 9.2, 10.1, 10.4, 14.3_
  - [x] 2.3 Implement `src/parameters.ts`
    - Validators for durations, the Sighting window length (positive), sample counts,
      1-sigmas, confidence scales and limits in metres, each returning `invalid_number` naming
      the parameter (Req 10.3).
    - Example tests: `0`, `NaN`, `±Infinity`, negative values and `2.5` where an integer is
      needed, each rejected with the right `field`; the boundary values accepted.
    - _Requirements: 10.2, 10.3_

- [x] 3. Rotation, Camera axis and Off-axis rays
  - [x] 3.1 Implement `src/rotation.ts`
    - `DeviceRotation`, `EnuDirection`, `cameraAxis` (closed formula of Req 2.1),
      `rotationMatrix` (product of the elementary matrices, internal),
      `directionAzimuthRad` (`axis_vertical` below `1e-6`) and `directionApparentAltitudeRad`
      (clamp only within `1e-12`), with the validation of D4 and `invalid_number` naming the
      angle (§7.1).
    - Example test: the Camera axis of a rotation does not change with the sample's Screen
      angle (the axis functions take no Screen angle; Req 4.10).
    - _Requirements: 1.9, 2.1, 2.2, 2.3, 2.4, 2.6, 4.10_
  - [x] 3.2 Implement `src/ray.ts`
    - `RayOffset`, `offAxisRay` (`R · normalise(tan r, tan u, −1)`, offsets validated to
      `±80°`), `rayDirection` (§7.2).
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 3.3 Example tests in `src/rotation.test.ts` and `src/ray.test.ts`
    - The gimbal-lock example of §9 (`beta = 90°`, `alpha` differing by `70°`, same azimuth);
      the known axes (north, west, face-up `axis_vertical` with altitude `−90°`); the ray
      examples at `(0°, 90°, 0°)`, including `80°` accepted and `80.0001°` and `NaN` rejected
      naming `rightRad`; a horizontal part at `1e-6` and just above it; altitudes `89°` and
      `90°`; `invalid_number` for each non-finite angle; a unit vector whose `up` exceeds `1`
      by more than `1e-12` rejected.
    - _Requirements: 2.2, 2.4, 2.6, 3.2, 3.3_
  - [x] 3.4 Test support: independent rotation and generators
    - `src/test-support/reference-rotation.ts`: the elementary-matrix product written
      separately from `rotation.ts` (D3). `src/test-support/angle-compare.ts`: wrapped-difference
      assertions that feed the error tracker.
    - In `generators.ts`: `deviceRotation` (with the log-scale draws near gimbal lock of §8:
      `beta = ±π/2 + s·10^k`, `k ∈ [−17, −2]`, and the listed `gamma` and other edges),
      `horizontalRotation`, `smallRotationChange`, `rayOffset`, each documenting its domain.
      Measure and state the discard rate of `horizontalRotation`.
    - Example test: the generators reach their stated edge values (sampled with a fixed seed).
    - _Requirements: 2.7, 2.9, 2.10, 3.6_
  - [x] 3.5 Properties P-2.7 to P-2.10
    - P-2.7 unit length within `1e-12`; P-2.8 agreement with `reference-rotation.ts` within
      `1e-12` per component; P-2.9 `alpha + δ` turns the azimuth by `−δ` within `1e-9`, altitude
      unchanged within `1e-12`; P-2.10 continuity bound `|Δα| + |Δβ| + |Δγ| + 1e-12`.
    - _Requirements: 2.7, 2.8, 2.9, 2.10_
  - [x] 3.6 Properties P-3.6 to P-3.9
    - P-3.6 unit length; P-3.7 zero offset equals the closed-formula axis; P-3.8 the transpose
      gives back the offsets within `1e-9`; P-3.9 the angle to the axis is
      `atan(hypot(tan r, tan u))` within `1e-9`.
    - _Requirements: 3.6, 3.7, 3.8, 3.9_

- [x] 4. Checkpoint: geometry
  - `test:deep` for P-2.7, P-2.8, P-2.9, P-2.10, P-3.6, P-3.7, P-3.8 and P-3.9 at 100 000
    cases. Record counts, discards and worst errors; give the worst error near gimbal lock
    (the log-scale draws) separately. Then the root checks. Do not stop: the report goes into
    checkpoint 6's.

- [x] 5. Samples, frames, windows and statistics
  - [x] 5.1 Implement `src/orientation-sample.ts`
    - `RawOrientationEvent`, `OrientationSample`, `orientationSampleFromEvent` (§7.3):
      `sensor_unavailable` for a `null` angle, `invalid_number` for a non-finite one, frame from
      the event alone, heading wrapped, accuracy kept with its sign, Screen angle wrapped or
      `null`, full rotation kept (Req 3.4).
    - Example tests: the sample-normalisation examples of §9.
    - _Requirements: 1.4, 1.7, 2.5, 2.6, 3.4, 4.3, 4.5, 4.9_
  - [x] 5.2 Implement `src/frame-reset.ts`
    - `FrameResetCause`, `FrameResetEvent`, `invalidates(frame, cause)` (D9).
    - Example test: every cause invalidates a Relative frame; only `frame_change` invalidates an
      Absolute frame.
    - _Requirements: 4.7, 4.8, 5.17_
  - [x] 5.3 Implement `src/sighting-window.ts`
    - `SightingWindow`, `selectWindow` (closed window, input order, `insufficient_samples`,
      `stale_samples`), `resetBetween` over a closed interval in either order (§7.4).
    - Example tests: samples at both window edges are included; one `1` ms outside each edge is
      not; 9 of a minimum of 10 gives `insufficient_samples`; the newest `501` ms before the end
      with a `500` ms limit gives `stale_samples`, and `500` ms does not; `resetBetween` with
      `from > to`.
    - _Requirements: 8.1, 8.6, 8.7, 8.13_
  - [x] 5.4 Implement `src/circular-summary.ts`
    - `summariseAzimuths` about the mean with `log1p` (D5), `undefined_mean` when
      `q ≥ 1 − 1e-9`; `summariseAltitudes` (arithmetic mean, standard deviation over `n`,
      D19); internal `rss`.
    - Example tests: the D5 counterexample first (fifty copies of `5.123`: Spread below `1e-12`,
      and a comment recording that the direct formula gives about `1e-8`); `350°` and `10°`
      give a mean of `0°`; opposite azimuths give `undefined_mean`; known altitude standard
      deviations.
    - Statistical test: the wrapped-normal Spread of Req 8.16 at a fixed seed, within `5 %`
      of `1°`.
    - _Requirements: 8.1, 8.3, 8.14, 8.16, 9.1, 9.3_
  - [x] 5.5 Implement `src/simulator/direction-to-rotation.ts`
    - `rotationFromDirection(A, h, ρ)` with the extraction, gimbal-lock branch, `γ = π/2`
      identity and range rules of §7.12, and a helper that converts to degrees and re-ranges
      into the W3C ranges after rounding. Needed now: later generators build rotations with it.
    - Example tests: exactly upright gives `β = 90°`, `γ = 0`; an `α` just below `2π` converts to
      `0°`, not `360°`; a `γ` that would round to `90°` is mapped into the range.
    - Add the `cameraPose` generator of §8 (log-scale altitude and roll near gimbal lock).
    - _Requirements: 12.6_
  - [x] 5.6 Property P-12.6
    - For `cameraPose`, the degree angles lie in the W3C ranges and give back the azimuth and
      altitude within `1e-9` through `cameraAxis` (not through `rotationMatrix`).
    - _Requirements: 12.6_

- [x] 6. Checkpoint: samples and statistics
  - `test:deep` for P-12.6 at 100 000 cases, with the worst errors of the log-scale draws
    reported separately from the uniform ones, and include checkpoint 4's report. Then the root
    checks. Stop for review.

- [x] 7. Yaw references
  - [x] 7.1 Implement `src/yaw-reference.ts`
    - `YawReference` with `frame`, `ReferencedAzimuth`, `yawReferenceFromCompass` (Relative
      samples only, the seven steps of §7.6), `yawReferenceFromKnownAzimuth` (one frame,
      `frame_reset` for mixed frames, resets judged by `invalidates`, §7.6), and
      `applyYawReference`.
    - Every azimuth leaves these functions labelled with its North reference (`ReferencedAzimuth`).
    - _Requirements: 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.16, 5.17_
  - [x] 7.2 Example tests in `src/yaw-reference.test.ts`
    - The compass examples of §9 (accuracy does not change the sigma, a negative accuracy
      excluded, all negative gives `compass_unreliable`, samples `1e-12 rad` inside `±30°` accepted and `30.0001°` refused, the exact-limit rotation (computed altitude `=== 30°`) accepted and the one that rounds one ulp over refused,
      Screen angles `90°` and `null` refused).
    - From the "Yaw references in both frames" examples: the recorded frames, the mixed window
      giving `frame_reset`, the compass constructor on Absolute samples only giving
      `insufficient_samples`; a `hidden` reset in the window of an Absolute known-azimuth
      reference accepted and a `frame_change` refused; any reset in a Relative window refused.
    - _Requirements: 5.2, 5.6, 5.7, 5.8, 5.9, 5.10, 5.16, 5.17_
  - [x] 7.3 Generators `compassScenario` and `knownAzimuthScenario(frame)`
    - As in §8, built with `rotationFromDirection`.
    - _Requirements: 5.14, 5.15_
  - [x] 7.4 Property P-5.14
    - With `fc.pre` on every sample's computed Camera altitude in `[−30°, 30°]` (discards
      reported): the compass reference equals the scripted offset within `1e-9` and reproduces
      every heading within `1e-9`.
    - _Requirements: 5.14_
  - [x] 7.5 Property P-5.15, in both frames
    - Two tests, `knownAzimuthScenario('relative')` and `knownAzimuthScenario('absolute')`:
      the reference records the frame, maps the samples' azimuth to the known azimuth within
      `1e-9`, and has the known sigma within `1e-12`.
    - _Requirements: 5.15, 5.16_

- [x] 8. Declination and the World Magnetic Model
  - [x] 8.1 Implement `src/wmm.ts` and `src/magvar.d.ts`
    - `decimalYearFromUtcMs` by `Date.UTC` over the years 2025 to 2029 (D12);
      `wmmField(decimalYear, latDeg, lonDeg, heightKm)` returning
      `{ declinationDeg, horizontalIntensityNt }` from magvar's `calculateMagneticField`, the
      only import of `magvar`; a declaration for that one function.
    - Example tests: the decimal-year values of §9 (`2025.0` exactly, `2027.5`, the leap year);
      the 112 published declinations within `0.01°` at their own heights.
    - _Requirements: 6.6, 6.10, 13.4_
  - [x] 8.2 Implement `src/declination.ts`
    - `Declination`, `trueAzimuthFromMagnetic` (`declination_unknown` without one,
      `invalid_number` for bad values), internal `wmmDeclinationSigmaRad` (the error model of
      §3 with its two named constants) and `declinationAt` (§7.7: time and position checks,
      validity dates, blackout below `2000 nT`, the error-model 1-sigma).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [x] 8.3 Example tests in `src/declination.test.ts`
    - `declinationAt` at the seven published points at height `0`: the declination within
      `0.01°`, and the 1-sigma within `[σ(H + 0.1 nT), σ(H − 0.1 nT)]` computed from the
      fixture's `H` (the table of §9).
    - The blackout point (89°N, 121°W, 2025.0) gives `declination_unknown`; the validity edges
      one millisecond either side of `2025-01-01` and `2030-01-01`; `unsupported_position`
      beyond `89°`; `invalid_number` for a `NaN` time.
    - `wmmDeclinationSigmaRad(2000)` is `2.7210°` and the 1-sigma decreases as `H` grows.
    - `trueAzimuthFromMagnetic` without a Declination gives `declination_unknown`; a
      declination of `π + 1e-12`, a `NaN` and a negative sigma give `invalid_number`; `±π`
      is accepted.
    - The McMurdo point (77.85°S 166.67°E, 2026.88): about `140.09°`, accepted by the conversion.
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.12_
  - [x] 8.4 Property P-6.11
    - Magnetic to true and back with the negated declination within `1e-12`, declinations in
      `[−π, π]`.
    - _Requirements: 6.11_
  - [x] 8.5 Generator `wmmPositionAndTime` and property P-6.12
    - Every Declination `declinationAt` returns is accepted by the conversion, with a 1-sigma in
      `[0.26°, 2.73°]`; failures only `declination_unknown`; successes counted and at least
      half. 100 000 cases at the checkpoints.
    - _Requirements: 6.12_

- [x] 9. Position fixes
  - [x] 9.1 Implement `src/position-fix.ts`
    - `GeolocationReading`, `PositionFix`, `positionFixFromReading` (D13), `checkPositionFix`
      (`stale_position`, then `coarse_location` with `reportedAccuracyM`, §7.8).
    - Example tests: the 2000 m coarse reading at the 100 m limit carries
      `reportedAccuracyM: 2000`; `invalid_position` for `NaN` coordinates, a negative accuracy
      and a latitude of `89.5°`; staleness at `30 000` ms accepted and `30 001` ms refused, on
      both sides of the time of use (a fix from the future too, Req 7.7); a scale of `2` halves
      `sigmaM` and leaves `reportedAccuracyM` unchanged; a longitude of `−180°` taken as `180°`;
      an accuracy of `1e308` over a scale of `1e-300` refused as `invalid_position`.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.7, 7.8_
  - [x] 9.2 Generator `geolocationReading` and properties P-7.9, P-7.10
    - P-7.9 radians within `1e-15` of `degToRad` (with `−180°` taken as `180°`), accuracy
      identical; P-7.10 `sigmaM` equals accuracy over scale within relative `1e-15`.
    - _Requirements: 7.9, 7.10_

- [x] 10. Checkpoint: references, declination and position
  - `test:deep` for P-5.14, P-5.15 (Relative and Absolute, 100 000 cases each), P-6.11, P-7.9
    and P-7.10. Report counts, discards and worst errors, and the result of the 112-point WMM
    fixture test. Then the root checks. Stop for review.

- [x] 11. Captures
  - [x] 11.1 Implement `captureBearing` in `src/capture.ts`
    - The ten steps of §7.9 in order, with the four cases of its table: Relative windows
      require a Relative reference; Absolute windows use an Absolute reference when given (no
      Heading 1-sigma, Declination only if magnetic) and the magnetic azimuth with the Heading
      1-sigma otherwise; a reference of the other frame is `frame_reset`.
    - _Requirements: 5.11, 5.12, 5.13, 5.18, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_
  - [x] 11.2 Implement `captureAltitude` in `src/capture.ts`
    - §7.10: arithmetic mean plus the required calibration offset, the 1-sigma as the `rss`
      of the samples' standard deviation and the calibration sigma, `invalid_altitude` outside
      `[−π/2, π/2]`.
    - _Requirements: 3.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 11.3 Example tests in `src/capture.test.ts`
    - Each failure of the "Capture order and each failure" list of §9, each triggering exactly
      one reason, and the combined order case (`stale_position` before
      `insufficient_samples`).
    - The Absolute-frame sigma example with the published point's Declination 1-sigma
      (`2.021445°`), and the same through `declinationAt`.
    - The capture examples of "Yaw references in both frames": a `true` Absolute reference needs
      no Declination and ignores `headingSigmaRad` (`2°` and `40°` give the same sigma); a
      magnetic Absolute reference needs one; a reference of the other frame fails in both
      directions; a `hidden` reset between an Absolute reference and the window is accepted and
      a `frame_change` refused, while a `hidden` reset with a Relative reference is refused; an
      Absolute capture without a reference succeeds across a `hidden` reset.
    - A Ray offset applied to every sample (Req 3.5); Core's limits agree (`0.01°`, `45°`
      accepted, the next values outside rejected by `validateBearing`); the altitude examples
      (`UNCALIBRATED_ALTITUDE` gives `3.5°`; `89°` plus `2°` gives `invalid_altitude`;
      calibration `NaN` and negative sigma give `invalid_number`).
    - _Requirements: 3.5, 5.11, 5.12, 5.13, 5.18, 8.2, 8.3, 8.4, 8.5, 8.8, 8.9, 8.10, 9.2, 9.3, 9.5, 9.6_
  - [x] 11.4 Generators `clusteredCapture` (with its `straddling` and `identical` variants) and `altitudeSet`
    - As in §8. `clusteredCapture` applies `δ` by replacing the offset with
      `wrapPi(offset + δ)`.
    - _Requirements: 8.11, 8.15, 8.14, 9.8_
  - [x] 11.5 Properties P-8.11 to P-8.15
    - P-8.11 rotation through the wrapped Yaw reference offset; P-8.12 reordering; P-8.13 samples
      outside the window change nothing (deep equality); P-8.14 identical samples give a Spread
      of `0` and `σ = max(0.01°, σN)`; P-8.15 the `0 / 2π` boundary.
    - _Requirements: 8.11, 8.12, 8.13, 8.14, 8.15_
  - [x] 11.6 Properties P-9.7 to P-9.9
    - P-9.7 constant altitude plus offset, exactly (Req 9.10) and within `1e-12`, sigma equal to
      the calibration sigma; P-9.8 a shift; P-9.9 reordering; all within `1e-12`; in P-9.8 and
      P-9.9 the mean lies within the altitudes' range (Req 9.10).
    - The shrunk P-9.7 counterexample (199 copies of `−80° + 1 ulp`, offset `−10°`) is an example
      test; the mean is taken about the first sample and clamped (D19).
    - _Requirements: 9.7, 9.8, 9.9, 9.10_

- [x] 12. Sample history
  - [x] 12.1 Implement `src/sample-history.ts`
    - `SampleHistory`, `createSampleHistory`, `addOrientationSample`, `addFrameReset`,
      `addPositionFix` (§7.13, D23): copy-on-write, frozen, newest time over every item,
      inclusive retention limits, clock steps back accepted, the most recently added fix kept.
    - Each add validates the whole item first and refuses an invalid one with the history
      unchanged (Req 14.4): `checkSampleValid` for a sample, `checkFixValid` for a fix, the same
      checks `checkPositionFix` and the captures apply (D20). The history does not judge Stale or
      Coarse location. Added after P-11.8 found a fix with a `NaN` accuracy kept and returned; the
      shrunk counterexample, a refused sample and a refused fix are example tests.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 11.8_
  - [x] 12.2 Example tests in `src/sample-history.test.ts`
    - The Sample history examples of §9: non-finite times leave the history unchanged; the
      retention boundaries for samples and resets; a step back of `200` ms; a fix prunes old
      samples; a handed-out history is frozen and unchanged after ten more adds; the frozen-image
      capture; invalid retentions.
    - _Requirements: 14.1, 14.2, 14.4, 14.5_
  - [x] 12.3 Generators `historySequence` and `historyCapture`
    - As in §8, with the dense half. Measure and state in the comment the fraction of
      `historyCapture` draws whose capture succeeds.
    - _Requirements: 14.6, 14.7_
  - [x] 12.4 Property P-14.6
    - After every add, the history holds exactly the items the retention rule states, in the
      order added (`Object.is` on items).
    - _Requirements: 14.6_
  - [x] 12.5 Property P-14.7
    - The capture from the history is deep-equal to the capture from the full sequence,
      failures included; the test fails if fewer than 10 % of its cases succeed.
    - _Requirements: 14.7_

- [x] 13. Checkpoint: captures and history
  - `test:deep` for P-6.12 (added at checkpoint 13 for the amended Req 6.12), P-6.11 with its
    widened domain, P-7.9 with `−180°`, P-8.11, P-8.12, P-8.14, P-8.15, P-9.7, P-9.8 and P-9.9 at
    100 000 cases, and
    P-8.13, P-14.6 and P-14.7 at 10 000. Report counts, discards, worst errors, and the success
    fraction of P-14.7. Then the root checks. Stop for review.

- [x] 14. Sensor source and browser Adapter
  - [x] 14.1 Implement `src/sensor-source.ts` and `src/listener-set.ts`
    - The `SensorSource`, `SensorSourceOptions` (with the optional `onListenerError`) and
      `Unsubscribe` types (§6); `ListenerSet` delivering over a snapshot with each call isolated
      by `try`/`catch`, passing thrown values to the error callback and dropping what the
      callback throws (D22).
    - Example tests: a throwing listener among three; the error callback receives the thrown
      value by identity; a throwing error callback is dropped and delivery continues; no
      callback; a listener that unsubscribes during delivery; delivery order is registration
      order.
    - _Requirements: 11.11_
  - [x] 14.2 Implement `src/browser/browser-environment.ts`
    - `BrowserEnvironment` and `browserEnvironment()`, the only file that reads browser
      globals, feature detection only (`'ondeviceorientationabsolute' in window`,
      `DeviceOrientationEvent.requestPermission`), and `systemClock`. No user-agent reads.
    - _Requirements: 1.2, 4.1, 4.2_
  - [x] 14.3 Test support: `FakeBrowserEnvironment`
    - `src/test-support/fake-browser.ts`: an in-memory environment that records every call,
      lets a test dispatch orientation, visibility, `blur`, `pagehide` and geolocation events,
      advance its timers, and count live listeners, watches and timers. Synthetic only.
    - _Requirements: 13.2, 13.5_
  - [x] 14.4 Implement `src/browser/browser-sensor-source.ts`
    - `createBrowserSensorSource` per §7.11: the event copy sets `absolute` to
      `event.absolute === true`; permission only from
      `requestOrientationPermission()` (D14); frame choice by feature (D7); `frame_change`
      before a sample in a new frame; resets for `hidden`, `blur`, `pagehide` and `restart`;
      the listening and position timeouts measured by the Adapter, one deadline per start and one
      timer per kind (D21), with `permission_required`, `sensor_unavailable` or
      `position_timeout`; geolocation with `enableHighAccuracy` and `maximumAge: 0` and no
      browser `timeout`; starting twice per D21;
      listeners through `ListenerSet`; `stop()` removes everything; every `env` call guarded.
    - _Requirements: 1.4, 1.5, 4.1, 4.2, 4.3, 4.5, 4.7, 4.8, 4.9, 7.1, 7.2, 7.6, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.9, 11.10, 11.11_
  - [x] 14.5 Example tests in `src/browser/browser-sensor-source.test.ts`
    - Every Adapter example of §9 against the fake, including each Adapter failure reason
      (an event whose `absolute` is a truthy non-boolean giving Relative samples,
      `insecure_context` with no sensor call recorded, `sensor_unavailable` in each case,
      `permission_denied`, `permission_required`, `position_unavailable`, `position_timeout`),
      the frame choice, each reset cause, Clock time stamps, the geolocation options, `stop()`
      leaving zero listeners, watches and timers, starting twice (one of each listener and
      timer, no reset, both promises settled; the watch cleared after a code-`1` error), the
      position timeout with no browser callback, including a second `startPosition()` after a
      timeout settling with `position_timeout` from its own deadline, and throwing listeners
      for all three kinds, with and without `onListenerError` and with one that throws.
    - _Requirements: 4.2, 4.3, 4.7, 4.8, 7.6, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.9, 11.10, 11.11, 13.2, 13.3_

- [x] 15. Simulator source
  - [x] 15.1 Implement `src/simulator/simulator-script.ts`
    - `SimulatorScript` and `PoseKeyframe` (§6) with validation (`invalid_number` naming the
      field; `field: 'pose'` for an empty or unordered pose list). Document on `declinationRad`
      that an app using `declinationAt` recovers the scripted true azimuth only if this value
      came from `declinationAt` at the scripted position and time (design note c).
    - _Requirements: 12.3, 12.5_
  - [x] 15.2 Implement `src/simulator/simulator.ts`
    - `createSimulator` and `SimulatorControls` per §7.12 and D16: the schedule, ties ordered
      resets first, pose interpolation along the wrapped difference, noise drawn in a fixed
      order, Absolute and Relative frames with their resets, headings with bias, noise, jumps and
      reported accuracy, the altitude bias, positions and their failures, permission and secure
      context behaviour, starting twice per D21, delivery through `ListenerSet`, raw events
      turned into samples by `orientationSampleFromEvent`.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 11.10, 11.11_
  - [x] 15.3 Example tests in `src/simulator/simulator.test.ts`
    - The Simulator examples of §9: a reset delivered before the sample at the same time and a
      capture across it failing; `advanceTo` backwards; `permission_required` without a request
      and samples with one; the altitude bias of `−3.3°` captured low within `1e-9`; the
      Absolute-frame Sun-style reference across a scripted `hidden` reset recovering the true
      azimuth with no Declination; starting twice and throwing listeners. The seed check: three
      fixed seeds give three different sequences.
    - _Requirements: 4.7, 11.10, 11.11, 12.2, 12.3, 12.4_
  - [x] 15.4 Generators `simulatorScript` (with its `noiseFree` variant) and `compassCaptureScript`
    - As in §8. `compassCaptureScript` places resets only before the Yaw reference window or
      after the capture window, and holds the direction constant over the capture window.
    - _Requirements: 12.7, 12.8_
  - [x] 15.5 Property P-12.7
    - On `compassCaptureScript`, with `fc.pre` on the computed Camera altitude of every sample
      the two windows read (discards reported): compass reference over `[Ty0, Ty1]` (the direction may move),
      then capture over `[Tc0, Tc1]` (constant direction, no reset in `[Ty0, Tc1]`) with the
      scripted Declination and a 1-sigma drawn from `[0.26°, 2.72°]`: the scripted true azimuth
      within `1e-9`, and
      `azimuthSigmaRad = max(0.01°, rss(headingSigmaRad, drawn))` within `1e-12`.
    - _Requirements: 12.7_
  - [x] 15.6 Property P-12.8
    - Two runs of the same script and seed give deep-equal outputs, `Object.is` on every
      number.
    - _Requirements: 12.4, 12.8_

- [x] 16. Checkpoint: sources
  - `test:deep` for P-12.7 and P-12.8 at 10 000 cases. Record counts, discards and worst
    errors. Then the root checks. Do not stop: the report goes into checkpoint 18's.

- [x] 17. Totality, purity and packaging
  - [x] 17.1 Generator `hostileInput` and property P-11.8
    - Every exported function, the Simulator with hostile scripts and the browser source with a
      hostile fake environment (callbacks that throw, events with `null`, `NaN` and
      out-of-range fields), the history functions with non-finite times and retentions of `0`,
      and throwing listeners: no call throws, and every result is a failure or finite (§8).
    - _Requirements: 11.8_
  - [x] 17.2 Implement `src/index.ts`
    - Re-export the public API of §6 only; nothing from `test-support`, and not the internal
      helpers (`ok`, `err`, `rotationMatrix`, `wmmField`, `wmmDeclinationSigmaRad`,
      `ListenerSet`, `summariseAzimuths`, `summariseAltitudes`, `rss`). The three summaries are
      not total on their own (design §7.5); export them only after making them total.
    - _Requirements: 1.6, 11.1_
  - [x] 17.3 Purity and exports tests in `src/purity.test.ts`
    - The checks of §10: no browser globals, clock, timers, randomness or I/O in the Math layer;
      browser globals only in `browser-environment.ts`; `Date.UTC` only in `wmm.ts`; `magvar`
      only in `wmm.ts`; imports only relative or from `@alidade/core`'s index; no `userAgent`,
      `platform` or `vendor`; `.alphaRad` and `.gammaRad` read only in `rotation.ts` and
      `simulator/direction-to-rotation.ts`; `webkitCompassHeading` read only in the Adapter; `package.json` dependencies exactly `@alidade/core` and
      `magvar` at an exact version, and exports only `"."`.
    - Check that the test fails when a forbidden token is added to a copy of a source string
      (so it is not vacuous).
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 2.3, 4.1, 4.4_

- [x] 18. Final checkpoint
  - Run `test:deep` for every property of §8 at its stated case count, and report counts,
    discards and worst errors for each, together with checkpoint 16's report. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` from
    the repo root. Confirm that every property P-2.7 through P-14.7 in `design.md` §8 has a
    test, that each names the property and its requirements in a comment, and that each runs at
    least 200 cases in `pnpm test`. Give a table of every requirement criterion and the tests
    that cover it. Report the result and stop for review.

- [x] 19. Amendment: the Simulator's true pose and aim (Requirements 12.9 to 12.11)
  - Added after the review of `skeleton-ui`, which needs the true pose of the simulated camera
    to draw a synthetic scene and to let a reviewer aim it. No other module changes.
  - [x] 19.1 Implement `truePose` and `aim` in `src/simulator/`
    - `TruePose` and `checkTruePose` in `simulator-script.ts` (`ALTITUDE_LIMIT_RAD` becomes the
      exported `MAX_POSE_ALTITUDE_RAD`, not re-exported from the index); `truePose` and `aim` on
      `SimulatorControls`, `aimedPose` as in §7.12 and D24; `TruePose` exported from `index.ts`.
    - _Requirements: 12.9, 12.10_
  - [x] 19.2 Example tests in `src/simulator/simulator.test.ts`
    - The examples of §9 (Controls): the pose follows the script, is before noise and bias, is a
      copy; aim replaces the pose from the current time on and keeps delivered samples; a second
      aim replaces the first; `80°` accepted, `80.0001°` refused; each invalid pose names its
      field, changes nothing and leaves later samples equal to a run without the call; aiming at
      the script's own pose leaves the samples unchanged. The exact keys of the controls are
      `advanceTo`, `truePose`, `aim` (the old test that listed `advanceTo` alone is updated: the
      requirement changed).
    - _Requirements: 12.9, 12.10_
  - [x] 19.3 Properties P-12.11, P-12.10 and the extended P-12.8
    - Generator `controlOps` (§8). P-12.8 now drives a sequence of control calls and compares the
      results of the calls as well as the events; P-12.10 inserts invalid aims; P-12.11 aims a
      `cameraPose` on a noise-free Absolute-frame script.
    - _Requirements: 12.4, 12.8, 12.10, 12.11_
  - [x] 19.4 Extend P-11.8's Simulator group
    - Hostile poses to `aim`, `truePose` finite after each call, and an advance that generates
      events from an accepted hostile pose.
    - _Requirements: 11.8_
  - [x] 19.5 Checkpoint
    - `test:deep` for the Simulator properties (P-12.7, P-12.8, P-12.10, P-12.11) and P-11.8 at
      10 000 cases; then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Update
      `coverage.md`. Report counts, discards and worst errors, and stop on any failing property.

- [x] 20. Amendment: rules shared with the user interface (Requirements 1.10, 3.10, 3.11, 12.12, 12.13)
  - Added after the review of `skeleton-ui`, which would otherwise repeat these rules. See D25.
  - [x] 20.1 Export the shared rules (Req 1.10)
    - `selectWindow`, `resetBetween` (not in the list of 1.10; see D25), `summariseAzimuths`,
      `summariseAltitudes` and their result types, `invalidates`, `SENSOR_REASONS` (with
      `satisfies Record<SensorReason, true>`), from `index.ts`; internal helpers stay internal.
    - Make the two summaries total first (§7.5): angles reduced with `wrapTwoPi` before the mean and
      the differences; `invalid_number` for an overflowing altitude summary. The example test of
      `1e300` rad must fail on the old code (checked) and pass on the new.
    - _Requirements: 1.10, 11.8_
  - [x] 20.2 `rayOffsetOfDirection` (Req 3.10, 3.11, §7.2)
    - In `ray.ts`; `checkDirection` exported from `rotation.ts` for it, not from the index.
    - Examples: 10° right, the zero offset, exactly `80°` and `80.001°` on each axis, behind the
      camera, exactly `90°` from the axis, each invalid field named.
    - Generators `innerRayOffset` and `unitDirection`; properties P-3.11a and P-3.11b.
    - _Requirements: 3.10, 3.11_
  - [x] 20.3 `trueRotation()` on the Simulator's controls (Req 12.12, 12.13, §7.12)
    - By the path of an event, through degrees; examples (points where aimed, equals a noise-free
      sample's rotation exactly, unaffected by noise, bias, zero and Declination, follows `aim`
      and the script); property P-12.13; the exact keys of the controls updated.
    - _Requirements: 12.12, 12.13_
  - [x] 20.4 P-11.8 for every newly exported function
    - A group "exports of Req 1.10" and the inverse in the geometry group; `trueRotation` after
      each hostile aim. A first run failed on `selectWindow`, which returns the caller's items
      with their `NaN` fields: the property was wrong, not the function (it computes no number),
      so the check became "fails, or returns a subset of the input in order".
    - _Requirements: 1.10, 11.8_
  - [x] 20.5 Checkpoint
    - `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`; `test:deep` for the files
      of every property that reads the summaries or the rays: ray (P-3.6 to P-3.11 at 100 000),
      capture (P-8.x, P-9.x at 100 000 and 10 000), yaw-reference, sample-history, simulator
      (P-12.x at 10 000) and hostile (P-11.8 at 10 000). All passed; worst errors: P-3.11a
      `1.4e-15`, P-12.13 `9.8e-13` (camera axis; the ray angle was `0`), P-8.11 `2.9e-15`.
      `coverage.md` updated.

