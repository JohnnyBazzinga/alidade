# Implementation Plan: skeleton-ui

Package: `skeleton/ui` (`@alidade/ui`). Source of truth: `requirements.md` and `design.md` in this
folder. Section and decision references (`D7`, `§7.6`) point into `design.md`; `Sensors N.M` points
into the skeleton-sensors requirements.

## Working rules for every task

- Follow `.kiro/steering/math-conventions.md`: radians internally, a unit suffix on every numeric
  name (`Rad`, `M`, `Ms`, `UtcMs`, `Px`, `SourcePx`), azimuths named by their North reference,
  angle differences through `wrapPi`. Degrees only through `math/degrees.ts` (Req 1.10).
- Follow `tech.md`: TypeScript `strict`, ES modules, **pnpm only**, exact dependency versions (no
  `^` or `~`), no `any`, no watch mode, **no dev server**. Browser sensor APIs are Sensors'; the
  camera (`getUserMedia`) only in `src/adapters/camera/`; `maplibre-gl` only in
  `src/adapters/map/maplibre-loader.ts`, by dynamic import.
- Follow `testing.md`. Every property test: at least 200 cases in `pnpm test` (the capped ones of
  design §8 excepted, at their stated counts), a comment above it naming the property and the
  requirements it validates, generator domains documented, tolerances taken from
  `requirements.md`, angles compared with `wrapPi(a - b)`.
- **Repeat nothing that Sensors owns** (Req 16.4, Sensors 1.10): no rotation matrix, no window rule,
  no Spread, no invalidation rule, no list of Sensors' reasons. The purity test of task 24 scans
  for them. If a function you need is not exported, stop and ask; do not write a copy.
- **Dependencies (Req 20.6).** Install one package at a time with `pnpm add`/`pnpm add -D` at the
  exact version of design §3, **after I have approved that install by hand**, and record in the
  task's report the output of `npm view <pkg> time --json` for that version (its publication date
  must be at least 14 days before the install). Never `npm`, never `yarn`. A different version,
  a missing peer or an engine mismatch: stop and report.
- If a property test fails, decide whether the code, the property or the requirement is wrong and
  say which. Do not weaken a tolerance, narrow a generator or delete an assertion to get a pass.
  If the cause is the requirement or the design, stop and report. When a property finds a real
  bug, add the shrunk counterexample as an example test before fixing the code.
- A property excludes a degenerate case through its generator only if that case also has an
  example test of its own.
- Every function of the Math layer is total (Req 2.1, 2.6): for any type-correct input it returns
  a failure `UiResult` or finite numbers, and never throws.
- Core and Sensors are not changed. If a change seems needed, stop and report (the two Sensors
  amendments of this spec are done: task groups 19 and 20 of skeleton-sensors).
- `notes/` is private: never read it. Every fixture and scene is synthetic (Req 17.1).
- Tests sit next to the code: `foo.test.ts` for examples, `foo.property.test.ts` for properties,
  `Foo.test.tsx` for components.
- Every task ends with `pnpm --filter @alidade/ui test` and `pnpm typecheck` passing for the code it
  touched, and `pnpm lint` and `pnpm format:check` from the root.
- **Every checkpoint** first runs `pnpm --filter @alidade/ui test:deep` for the properties of its
  layer (design §8 counts), and reports, for each property, the cases run, the discards and the
  worst error against its tolerance, and, for the capped properties, the measured milliseconds per
  case. It then runs `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm format:check` from the
  root. The final checkpoint also runs `pnpm --filter @alidade/ui build:playground` once and reads
  its exit code (design D19). No other task runs Vite, and none runs `dev`.
- **Stops for review** at checkpoints 8, 15, 20 and 26, and at any failing property. The
  checkpoint 23 does not stop: its report is carried into checkpoint 26's.

## Tasks

- [x] 1. Scaffold the package and prove the dependencies (design F13)
  - [x] 1.1 Create `skeleton/ui` (`@alidade/ui`) without dependencies
    - `package.json`: `exports` only `"."` (`./src/index.ts`); `private`; scripts `test`
      (`vitest run`), `test:deep` (`vitest run --config vitest.deep.config.ts`), `typecheck`
      (`tsc --noEmit -p tsconfig.json`), `dev` (`vite --config playground/vite.config.ts`, never
      run by a task) and `build:playground` (`vite build --config playground/vite.config.ts`).
      Dependencies `@alidade/core` and `@alidade/sensors` as `workspace:*`; dev dependencies
      Vitest `5.1.0`, `fast-check` `4.10.2`, TypeScript `6.0.3`, `vite` `8.3.8` (the pins of
      Sensors, Req 20.4; their versions are already in the lockfile).
    - `tsconfig.json` extending the base: `lib` ES2023 and DOM, `jsx` `react-jsx`, include `src`,
      `playground` and the configs.
    - `vitest.config.ts` with the three projects of D1 (`math`, `adapters`: environment `node`;
      `components`: `jsdom`, include `src/components/**/*.test.tsx` and `playground/**/*.test.tsx`)
      and `provide: { propertyRuns: 200 }`; `vitest.deep.config.ts` for the `*.property.test.ts`
      files of `math` and `adapters`, `propertyRuns` `100 000`, no file parallelism, no timeout.
      `.env.example` with `VITE_TILE_URL_TEMPLATE=` and `VITE_TILE_ATTRIBUTION=` and no values.
    - An empty `src/index.ts`. `pnpm install` only for the workspace link (no new package yet).
    - _Requirements: 1.1, 1.7, 1.8, 15.2, 20.4, 20.5_
  - [x] 1.2 Install the runtime and type dependencies, one at a time, each approved by hand
    - `react` `19.3.1`, `react-dom` `19.3.1`, `maplibre-gl` `6.16.0`, `@types/react` `19.3.0`,
      `@types/react-dom` `19.3.0` (design §3). Record each publication date from `npm view`.
    - _Requirements: 20.1, 20.2, 20.6_
  - [x] 1.3 Install the test dependencies, one at a time, each approved by hand
    - `jsdom` `30.1.3`, `@testing-library/react` `16.3.3`, `@testing-library/dom` `10.4.2`.
      Record each publication date.
    - _Requirements: 20.1, 20.2, 20.6_
  - [x] 1.4 The root lint
    - Install `eslint-plugin-react-hooks` `7.1.1` at the repository root (approved by hand, date
      recorded). In `eslint.config.js`, for `skeleton/ui/**/*.{ts,tsx}`: register the plugin as
      `react-hooks`, enable `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` as
      errors, and `@typescript-eslint/no-explicit-any` as an error (D21). Confirm, with a throwaway
      component that calls a hook conditionally, that `pnpm lint` fails; delete it.
    - _Requirements: 1.8, 20.2_
  - [x] 1.5 The smoke tests of the unverified assumptions (design §3), each a throwaway file
    - (a) Vitest `projects` with `extends` inherits `provide`: a test in each project reads
      `inject('propertyRuns')`. If not, repeat the `provide` line per project (D1).
    - (b) The built-in JSX transform: render a trivial component in the `components` project with
      Testing Library under jsdom; run `vite build` once on a one-line page (`oxc.jsx.runtime:
      'automatic'`) and read the exit code. If either needs `@vitejs/plugin-react`, **stop and ask**.
    - (c) `@types/react` `19.3.0` type-checks with TypeScript `6.0.3` under `strict`.
    - (d) `maplibre-gl` `6.16.0`: read its `.d.ts` and its source to confirm the `Map` constructor
      options `container`, `style`, `attributionControl`, `interactive`; `getSource(id).setData`;
      `on('load' | 'error' | 'sourcedata')`; `fitBounds`; `remove`; and whether the constructor
      throws or emits an `error` when WebGL is missing. Do not import it under jsdom. Write what
      you find into `src/adapters/map/maplibre-types.ts`'s header and into the report.
    - (e) pnpm's minimum release age: check whether `minimumReleaseAge` exists in pnpm `11.24.0`
      (design §3); report, **do not apply** it.
    - Report every result, delete the throwaway files, and **stop on any mismatch**.
    - _Requirements: 20.1, 20.2_

- [x] 2. Results, reasons, units and parameters
  - [x] 2.1 `src/result.ts` and `src/reasons.ts`
    - `UiResult`, `UiFailure` (with `field`, `id`, `reportedAccuracyM`, `errorName`), internal `ok`
      and `err`. `UI_ONLY_REASONS` (`as const satisfies Record<UiOnlyReason, true>`), `UiReason`,
      `UI_REASONS = [...SENSOR_REASONS, ...Object.keys(UI_ONLY_REASONS)]` (D2).
    - Example tests: no duplicate; the sixteen of Req 2.2 are all present; the list starts with
      `SENSOR_REASONS`; a Sensors or Core failure passes through unchanged (Req 2.4).
    - _Requirements: 2.2, 2.3, 2.4_
  - [x] 2.2 `src/math/degrees.ts`
    - `fromDeg`, `toDeg`: Core's `degToRad` and `radToDeg`, `NaN` passed on for a non-finite
      argument. The only module with a conversion factor.
    - _Requirements: 1.10_
  - [x] 2.3 `src/defaults.ts` and `src/math/session/parameters.ts`
    - The named constants of Req 19.1 (written with `fromDeg`), `SessionParameters` (design §6),
      `defaultSessionParameters()` built from them and from Sensors' defaults, and
      `checkSessionParameters` (Req 19.4: `NaN`, infinite, not positive, vertex count not an
      integer of at least 16, interval under 1 ms, and `frameResetRetentionMs <
      yawReferenceMaxAgeMs + windowLengthMs`, each naming the parameter).
    - Example tests: the record has no calibration and no `tapSigmaPx` field (Req 19.3); each
      invalid parameter named; the retention rule; the documentation comments of Req 19.5 exist.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_
  - [x] 2.4 Property-run configuration and error tracking
    - `src/test-support/fast-check-setup.ts` (the pattern of Sensors': `inject`, `propertyRuns()`,
      `cappedRuns(limit)`, never below 200 in `pnpm test`), `property-report.ts` (the error tracker
      and the `[deep]` report lines, plus **milliseconds per case** for the checkpoint reports),
      `deep-same.ts` (`Object.is` on numbers). Example tests as in Sensors task 1.2.
    - The `hostileInput` generators for the UI's inputs (`NaN`, `±Infinity`, `-0`, subnormals,
      `±MAX_VALUE`, the doubles either side of each limit, negative sizes, `null` where nullable).
    - _Requirements: 21.1_

- [x] 3. Display formatting and contrast
  - [x] 3.1 `src/math/display-format.ts` (§7.1)
    - `formatAzimuthDeg`, `formatSignedDeg`, `parseDegrees`. Examples: `2π − 1e-9` at one decimal
      is `0.0`; `-0.04°` at one decimal has no minus sign; `parseDegrees` of `'12.5°'`, `' -3 '`,
      and the failures `'1e3'`, `'Infinity'`, `''`, `'1,5'`; a non-finite angle formats as the dash.
    - _Requirements: 3.8_
  - [x] 3.2 Properties P-3.9 and P-3.10
    - As in §8, 100 000 cases in `test:deep`.
    - _Requirements: 3.9, 3.10_
  - [x] 3.3 `src/math/contrast.ts` (§7.2) and property P-13.10
    - `relativeLuminance`, `contrastRatio`. Example: black on white is 21; the three values of
      design §7.18 for `ink` on `bg` (15.69), `inkDim` on `raised` (7.56) and `rule` on `raised`
      (3.42) to two decimals.
    - _Requirements: 13.2, 13.10_

- [x] 4. Messages
  - [x] 4.1 `src/math/messages.ts` (§7.17, D18)
    - `MESSAGES: Record<UiReason, MessageSource>`, `MUST_MENTION`, `messageFor`. Write the English
      for all reasons (Sensors' 31 and the UI's 16), each part one sentence of at most 160
      characters ending in a full stop, none containing the code, an underscore, `NaN`, `Infinity`,
      `undefined`, `null` or `[object`. `coarse_location` is a function: 10 m below 1000 m, 0.1 km
      from 1000 m, no number when missing, `NaN` or infinite.
    - Example tests: completeness against `UI_REASONS` (Req 3.2: no extra key, none missing, no empty
      part); every reason of Req 3.7 matches its `MUST_MENTION` words and is not just "try again";
      the three `coarse_location` cases; the same failure gives the same Message.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_
  - [x] 4.2 Property P-3.11
    - As in §8: arbitrary `field` and `id`, `reportedAccuracyM` any double, every reason.
    - _Requirements: 3.3, 3.11_

- [x] 5. Camera calibration, image layout and geometry
  - [x] 5.1 `src/math/camera-calibration.ts` (§7.3) and properties P-4.6, P-4.7
    - `checkCalibration` in the order of Req 4.1, `focalLengthSourcePx`. Examples: each invalid
      case names its field; `fovSigmaRad` of `0.01°` accepted, `0.0099°` refused; `fovRad ± sigma`
      reaching `0` or `π` refused; no default exists (a type-level test that the function takes a
      required argument and `null` gives `calibration_missing` in the functions that need one).
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7_
  - [x] 5.2 Generators `sourceSize`, `elementSize`, `calibration`, `layoutCase`, `pointInOffsetSpace`
    - As in §8: including the `F ≈ 0.07` corner in one draw in four, and a calibration whose image
      size differs from the source's with the same aspect ratio.
    - _Requirements: 5.7, 5.8_
  - [x] 5.3 `src/math/image-layout.ts` and `image-geometry.ts` (§7.4, D7)
    - `imageLayout`, `pointToRayOffset`, `rayOffsetToPoint`, the checks in the order of Req 5.4,
      `calibration_mismatch` at a relative `1 %`, `F` from the displayed image.
    - Examples: the `720 × 1280` source in a `390 × 844` element under both fits, by hand; each
      failure reason in order; the `80°` limit on both sides on each axis; the centre; a point on a
      `contain` bar is `outside_image`; a swapped stream is `calibration_mismatch` (Req 4.5);
      a calibration at twice the source's size with the same aspect gives the same offset.
    - _Requirements: 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.16_
  - [x] 5.4 Properties P-5.7 to P-5.15
    - As in §8, each at 100 000 cases in `test:deep`. P-5.14 and P-5.13 use Sensors' `offAxisRay`.
    - _Requirements: 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15_

- [x] 6. Uncertainty of a point of the image
  - [x] 6.1 `src/math/ray-uncertainty.ts` (§7.5)
    - `imageAngularSigmaRad`; `tapSigmaPx` required and checked.
    - Examples: Req 6.6 (`εTap = 1/500` at `F = 500`, `tapSigmaPx = 1`); `εFov = 0` at the centre;
      `tapSigmaPx` of `-1`, `NaN` refused naming it.
    - _Requirements: 6.1, 6.2, 6.3, 6.6_
  - [x] 6.2 Properties P-6.4 and P-6.5
    - P-6.5 at offsets within `±75°`, with Sensors' `offAxisRay` at the identity rotation.
    - _Requirements: 6.4, 6.5_

- [x] 7. Histories from the Simulator, and the cost probe
  - [x] 7.1 Generator `scriptHistory` and its helper `history-from-script.ts` (§8)
    - From a drawn script (the domains of Sensors' `simulatorScript`, in both frames, with and
      without headings), `createSimulator`, `aim` calls at drawn times, `advanceTo`, the listeners'
      samples, resets and fix, and Sensors' `createSampleHistory` and `add…`. The helper can build
      a set of azimuths within `30°` of a common direction by aiming at each member and advancing
      one event interval. It uses only Sensors' public API.
    - Example test: a built history equals the one built by adding the same events by hand.
    - _Requirements: 9.9, 9.11, 10.9, 11.7_
  - [x] 7.2 The cost probe
    - A throwaway test, not committed: 1 000 draws of one case of the shape the capped properties
      share (create a Simulator, aim, advance about 1.5 s, build the history, `selectWindow`,
      `captureBearing`, `captureAltitude`); print the milliseconds per case (mean, 95th
      percentile). Report it as the lower bound for P-9.9, P-10.9, P-11.7, P-12.x and the non-Session
      part of P-16.8.
    - _Requirements: 21.1_

- [ ] 8. Checkpoint: geometry and messages
  - `test:deep` for the properties of tasks 3 to 6 (P-3.9, P-3.10, P-3.11, P-4.6, P-4.7, P-5.7 to
    P-5.15, P-6.4, P-6.5, P-13.10 at their counts), then the root checks. Report cases, discards
    and worst errors, and the cost probe of task 7.2 with a proposal for the counts of the capped
    properties. **Stop for review.**

- [x] 9. The Session: types, parameters, transitions
  - [x] 9.1 `session.ts`, `session-events.ts`, `createSession` (§6, §7.6)
    - The types of §6; `createSession(kind, parameters)` validating the parameters.
    - _Requirements: 8.1, 8.2, 8.13_
  - [x] 9.2 `step` for the data events, the Notice and the transitions (D3, D5, D23)
    - Every branch validates the event time first. The table of Req 8.3; the two kinds of event;
      a data event that carries a failure and fits no transition records its own reason in a
      Session of either kind; an action event that fits none gets `action_not_available`;
      Frame resets and samples applied in every state; `restart` keeps the resets, drops the
      samples, keeps the Yaw reference and the Declination; the effects `startOrientation` and
      (bearing only) `startPositions`.
    - Table-driven example tests: **every** transition of Req 8.3 (Req 21.4), every action event in
      every state that does not offer it, every data failure in every state and in both kinds, a
      sample failure in `live` stays `live`, a camera failure in `captured` keeps the result, an
      event with a `NaN` time, the Notice replaced and cleared as D23 says, an altitude Session
      never asks for positions or a Declination and never records them.
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.13, 8.14, 21.4_
  - [x] 9.3 `yaw-status.ts` (§7.8) and properties P-11.8
    - `yawStatus` with Sensors' `resetBetween` and `invalidates`.
    - Examples: each status; `invalidated` over `stale`; a reset exactly at the established time
      and at `now`; a reference established inside the window (the other case of Req 11.7).
    - _Requirements: 11.3, 11.8_

- [x] 10. The Live readout
  - [x] 10.1 `readout.ts` (§7.7)
    - `liveReadout`, `steadiness`, publication in `step` for samples and `tick`, `stale`.
    - Examples: the North reference of every case (Relative with and without a valid Yaw reference,
      Absolute with and without, with and without a Declination, a stale Yaw reference, an
      invalidated one); an empty window is `null`; mixed frames and a reset in a Relative window
      are `frame_reset`; a vertical camera is `axis_vertical`; the readout decays to `null` on
      `tick`; a time stepping back.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 10.2 Properties P-9.9, P-9.10, P-9.11
    - P-9.9 compares with Sensors' `captureBearing` and `captureAltitude` (and the Spread through
      the capture's sigma); P-9.11 on azimuth sets built with `aim`.
    - _Requirements: 9.9, 9.10, 9.11_

- [x] 11. Freeze, mark, capture, establishing north
  - [x] 11.1 `freeze.ts`, `mark.ts` (§7.6, D6)
    - `freeze` through `selectWindow`, then the Screen angle; the Frozen sighting; `mark` through
      `pointToRayOffset` and `imageAngularSigmaRad`, the earlier Mark kept on failure.
    - Examples: each failure of Req 10.1 and 10.2 (and their order); a `null` Screen angle; the
      Mark failures of Req 10.5; the Mark kept as an offset; leaving `frozen` drops the history and
      the Mark.
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.7_
  - [x] 11.2 `capture.ts` (§7.9)
    - Bearing and altitude captures through Sensors; the sigma with a Mark; `position_unavailable`;
      `axis_vertical` beyond `80°`; `too_unsteady`; the result's details (Req 12.6).
    - Examples: no Mark equals Sensors' result deeply; with a Mark the sigma is the formula of
      Req 12.3 and 12.4 by hand; each failure passes through as a Notice and the Session stays
      `frozen`.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [x] 11.3 `establish-yaw.ts` (§7.8, D24)
    - The compass in `live`; a known azimuth in `live` and in `frozen` (with the Mark's offset and
      sigma; the Frozen sighting's Yaw reference replaced, nothing else).
    - Examples: each availability; a Sensors failure is a Notice and the held reference stays;
      with a Mark the sigma is `hypot(σ, ε / cos h)`; `compass_unreliable` at Screen angle `90°`
      and `null`.
    - _Requirements: 11.1, 11.2, 11.5, 11.6_
  - [x] 11.4 Properties P-10.1, P-10.9, P-10.10, P-11.7, P-12.8, P-12.10
    - P-11.7 with Yaw references established no later than the window's start.
    - _Requirements: 10.1, 10.9, 10.10, 11.7, 12.8, 12.10_

- [x] 12. The `sessionRun` generator and the Session properties
  - [x] 12.1 Generator `sessionRun` (§8)
    - Intents resolved against the live Session by a runner, so that sequences reach `frozen` and
      `captured`; hostile events one in ten; times that step back one in ten; both kinds.
    - Example test: a fixed seed reaches every state, and the runner reports the count of runs
      that reach `frozen`, `captured` and `failed` (the properties fail if fewer than 10 % reach
      each, so that they cannot pass on `permission` alone).
    - _Requirements: 8.9_
  - [x] 12.2 Properties P-8.9, P-8.10, P-8.11, P-8.12, P-10.8, P-11.9, P-12.9
    - The counts of §8 as revised at checkpoint 8. P-8.11 runs on deeply frozen states. P-11.9
      contains `establishYaw`, an invalidating `frameReset` in every state, and `restart`.
    - _Requirements: 8.9, 8.10, 8.11, 8.12, 10.8, 11.9, 12.9_

- [x] 13. The Session driver
  - [x] 13.1 `components/timer.ts`, `session-driver.ts` (§7.14, D4, D9)
    - `createSessionDriver`: `requestPermission` from the gesture, subscriptions, the readout
      `tick` through the Timer, effects, the Declination on every Position fix of a bearing
      Session, `stop`. `FakeTimer` in `test-support/`.
    - _Requirements: 9.7, 9.8_
  - [x] 13.2 Example tests against the real Simulator (Req 9.12)
    - Permission denied, permission required, sensor missing, insecure context, a start that
      settles, a restart (the Yaw reference is invalidated by the source's `restart` reset), a
      failing start result delivered in `live`, the unsubscription (no listener or timer left,
      checked on the Simulator and the `FakeTimer`), starting twice subscribes once, a throwing
      `onSession` does not stop the driver.
    - _Requirements: 9.7, 9.8, 9.12, 21.4_

- [x] 14. Hostile totality of the Session and the Math layer so far
  - [x] 14.1 Property P-2.6 for every public function of tasks 2 to 12
    - `hostileInput` to each; the Session through `step` with hostile events.
    - _Requirements: 2.1, 2.6_

- [x] 15. Checkpoint: the Session
  - `test:deep` for the properties of tasks 9 to 14 (P-8.9 to P-8.12, P-9.9 to P-9.11, P-10.1, P-10.8
    to P-10.10, P-11.7 to P-11.9, P-12.8 to P-12.10, P-2.6). Report cases, discards, worst errors,
    the measured milliseconds per case of the capped ones, and the revised counts. Then the root
    checks. **Stop for review.**

- [x] 16. Map geometry
  - [x] 16.1 `math/map/geojson.ts`, `observer-features.ts`, `bearing-features.ts` (§7.10)
    - The GeoJSON types, `[lonDeg, latDeg]` in one place, `observerFeatures`, `bearingFeatures`
      (the line, the Wedge built counter-clockwise).
    - Examples: Req 14.14 (a bearing due north from the equator); a Wedge of `45°` at the step
      limit; `lineLengthM` of `0`, `500 001`, `NaN`, `arcStepRad` of `0` named; a short length
      (under `100 m`, which the property excludes).
    - _Requirements: 14.1, 14.2, 14.3, 14.7_
  - [x] 16.2 `fix-features.ts`, `map-bounds.ts`
    - `fixFeatures` with `FixFeatureCollection`, `mapBounds`.
    - Examples: Req 14.14 (a circular Fix of 1-sigma `10 m`: a ring of radius `24.477 m` within
      `1e-4`); a Fix with a broken Ellipse returns no feature; `vertexCount` 15 refused; a set
      across `±180°` refused; an empty set.
    - _Requirements: 14.4, 14.5, 14.6_
  - [x] 16.3 Generators `fixCase`, `bearingCase` and properties P-14.7 to P-14.13
    - As in §8.
    - _Requirements: 14.7, 14.8, 14.9, 14.10, 14.11, 14.12, 14.13_
  - [x] 16.4 `map-style.ts` (§7.10, D12)
    - `buildMapStyle`; the tokens `MAP_DARK`, `MAP_LIGHT` from design §7.18 are defined in
      `math/` (no import from `components/`); examples: no `glyphs`, no `sprite`, no text layer;
      layer order; widths at least 2; with and without a Tile source; the contrast of each
      two-tone pair against black and white through `contrastRatio`.
    - _Requirements: 15.4, 15.7_

- [x] 17. The Map adapter
  - [x] 17.1 `adapters/map/maplibre-types.ts`, `maplibre-loader.ts`, `FakeMapLibre`
    - The minimal interfaces of what task 1.5(d) found; the loader (dynamic import, returns a
      `UiResult`); the fake that records its style, its `setData` calls, its listeners and removal.
    - _Requirements: 1.4, 15.1_
  - [x] 17.2 `map-adapter.ts` (§7.11)
    - Tile source checks, `map_unavailable`, held writes until `load`, `setFix` through
      `fixFeatures` in one `setData`, `fitToFeatures`, the throttled `tiles_unavailable`,
      `destroy`. `setData` returns a Promise in `maplibre-gl` 6.x: it is called in a `try` with a rejection handler, so that a rejection reaches `onError` as `tiles_unavailable` and is never an unhandled rejection (design D25.8); the options omit `attributionControl`.
    - Example tests: every criterion of Req 15.1 to 15.10 (and a rejected `setData` promise, with the test failing on an unhandled rejection) (design §9).
    - _Requirements: 15.1, 15.2, 15.3, 15.5, 15.6, 15.8, 15.9, 15.10, 15.13_
  - [x] 17.3 Properties P-15.11 and P-15.12 (the `adapters` project)
    - Calls in any order, valid and invalid; they are in `test:deep`.
    - _Requirements: 15.11, 15.12_

- [x] 18. The synthetic scene
  - [x] 18.1 `scene/scene.ts`, `target-direction.ts` (§7.13)
    - `checkScene`, `targetDirection`. Examples: Req 16.11 (`1000 m` east, `100 m` high); a Target
      under `1 m` is `coincident_positions`; each invalid field named.
    - _Requirements: 16.1, 16.2, 16.11_
  - [x] 18.2 `scene/project-scene.ts` (D14, §7.13)
    - `projectScene` with Sensors' `rayOffsetOfDirection`, `rayOffsetToPoint`, the Sun's radius,
      the horizon through two directions at `Ac ± 20°`, clipped by Liang–Barsky. No rotation
      matrix. Examples: a Target on the axis is at the centre; behind the camera is not visible; a
      steep camera has no horizon; a rolled camera has a tilted horizon.
    - _Requirements: 16.3, 16.4_
  - [x] 18.3 `scene/aim.ts` (§7.13) and properties P-17.12, P-16.7, P-16.9, P-16.10
    - `aimAfterDrag` with the `cos h` factor. P-16.7 reads `trueRotation()` and the next sample from
      a noise-free Simulator aimed at the pose.
    - _Requirements: 16.7, 16.9, 16.10, 17.10, 17.12_
  - [x] 18.4 `scene/catalogue.ts` (§7.16, D16)
    - `buildCatalogue`: the eleven scenes, from `{ 30° N, 40° W }` by Local-plane offsets,
      `declinationRad` from Sensors' `declinationAt` at each Station and the script's start.
    - Examples (Req 17.2, 17.3, one per scene): the script validates under `createSimulator`, starts
      on a Target and holds the pose for at least 10 s, has a calibration consistent with the scene
      and the scene's Message (reached by driving its script through the driver) differs from the
      others'; the origin is inside the WMM2025 window and outside the blackout zone; no Position is
      outside a `50 km` disc of the origin.
    - _Requirements: 17.1, 17.2, 17.3_

- [x] 19. The Simulator panel's state and the end-to-end property
  - [x] 19.1 `panel/panel-state.ts` (§7.15, D15) and property P-17.8
    - `panelStep` with the advances split at `MAX_SIMULATOR_ADVANCE_MS`; a seed that is not an
      integer in `[0, 2³²)` named. Examples: a step while paused; ticks while paused add nothing; a
      restart; a change of scene resets the time.
    - _Requirements: 17.4, 17.5, 17.8_
  - [x] 19.2 Property P-16.8 (capped)
    - The Session through `freeze`, `mark` and `capture` on noise-free scripts in both frames;
      records the milliseconds per case; the counts revised at checkpoint 15 and again here.
    - _Requirements: 16.8_
  - [x] 19.3 `diagnostics/event-rate.ts`
    - `eventRateHz`; examples (ten samples in a second; none; one; a time stepping back).
    - _Requirements: 18.6_

- [x] 20. Checkpoint: the map and the scene
  - `test:deep` for P-14.7 to P-14.13, P-15.11, P-15.12, P-16.7 to P-16.10, P-17.8, P-17.12 (and
    P-16.8 at its capped count). Report cases, discards, worst errors and, for P-16.8, the measured
    milliseconds per case with the revised count. Then the root checks. **Stop for review.**

- [x] 21. The Camera adapter
  - [x] 21.1 `adapters/camera/camera-surface.ts`, `camera-adapter.ts`, `browser-camera-surface.ts`
    - §7.12: the state machine, the constraints, the error mapping, `facing`, `onEnded` once, `stop`
      during a pending start, `attach(sink)` and `onSize`. `FakeCameraSurface` and `FakeVideoSink`.
    - Example tests: each criterion of Req 7.2, 7.4 (one per error name, an unknown name, a
      non-error rejection, a throwing surface), 7.5 (user, environment, none, `left`), 7.7, 7.8
      (stop while pending, a late stream stopped, a second stop), 7.9, 7.10 (no fake track running
      after any failure path).
    - _Requirements: 7.1 to 7.11_

- [x] 22. Components
  - [x] 22.1 `components/theme.ts` (§7.18) and `dom-size.ts`
    - The tokens, the type stack, the sizes, `PALETTE_PAIRS`; `observeElementSize` and
      `useElementSize`. Example test: every pair of `PALETTE_PAIRS` is at least 7 and the test
      fails when a pair below 7 is added (Req 13.11); `rule` at least 3 on each surface.
    - _Requirements: 13.2, 13.11_
  - [x] 22.2 `Reticle`, `MarkRing`, `Readout`, `YawStatusBar`, `FailureNotice`, `LimitsNote`
    - The checks of design §9 from the inline style values (Req 13.12); `FailureNotice` for every
      `UiReason`, its text equal to `messageFor`'s and free of the code and the field.
    - _Requirements: 3.6, 11.4, 13.1, 13.3, 13.4, 13.5, 13.9, 13.12_
  - [x] 22.3 `ImageSurface`, `CameraImage`, `SceneImage` (D11, D22)
    - Taps and drags as D22; arrow keys in `1°` steps; `attach` and `pause`; the Scene image draws
      the horizon, the visible Targets with labels, the Sun as a disc, and no direction text.
    - _Requirements: 10.4, 13.8, 16.5, 16.6, 17.10, 17.11_
  - [x] 22.4 `ControlBar`, `CaptureSummary`, `MapView`, `SimulatorPanel`, `SightingScreen`, `use-sighting-session.ts`
    - `ControlBar` sizes and the lower placement; `CaptureSummary` shows the sigma beside the
      bearing and what it is made of; no component accepts a bearing, an altitude or a Fix without
      its uncertainty (type-level tests); `SimulatorPanel` over the real Simulator and the
      `FakeTimer`: scene, Station, seed (validated), speed, play, pause, step, restart; a change
      recreates the source and the Session and stops the old ones; a failing `advanceTo` pauses
      and shows its Message; the truth shown as text; aiming not while `frozen`.
    - _Requirements: 13.6, 13.7, 15.5, 17.4, 17.5, 17.6, 17.7, 17.9, 17.11, 21.2_

- [x] 23. Checkpoint: components (does not stop)
  - `pnpm --filter @alidade/ui test` and `test:deep`, the root checks; the report is carried into
    checkpoint 26.

- [x] 24. The Playground
  - [x] 24.1 `playground/` pages (D19, §10)
    - `index.html`, `main.tsx`, `Playground.tsx`, `DeviceMode.tsx`, `SimulatorMode.tsx`,
      `CalibrationForm.tsx` (empty at the start; optional requested size; the calibration's image
      size taken from the running stream on Apply), `Diagnostics.tsx` (§10), `CaptureList.tsx`,
      `system-timer.ts` (the one module that calls `setInterval` and `Date.now`), `vite.config.ts`
      (`root`, `envDir`, `oxc.jsx.runtime`, `build.outDir`), `env.d.ts`, `playground.css`.
      Mode by feature test (`DeviceOrientationEvent`), never the user-agent. No storage, no
      network but the tiles, no analytics. Failures only through `messageFor`. The map shows the
      observers, the Wedges and, from two Bearings, Core's `solve` Fix with its ellipse.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_
  - [x] 24.2 The integration test (design §9)
    - Simulator mode with `FakeTimer`, `FakeCameraSurface`, `FakeMapLibre`: steady scene, Start,
      live, Freeze, Mark the first Target, Capture, change the Station, Capture; the fake map holds
      two observers, two Wedges, one Fix and its ellipse; the azimuths equal the Targets' true
      directions within `1e-8` rad; the scene's target lies inside the 95 % ellipse. The same with
      the permission-denied scene shows its Message. A calibration-less Mark shows the Message of
      `calibration_missing`.
    - _Requirements: 18.9_

- [x] 25. Public API, purity, packaging
  - [x] 25.1 `src/index.ts` and the package README
    - Re-export the API of §6 only; nothing from `playground` or `test-support`. The README states
      the CSS import for the map (`maplibre-gl/dist/maplibre-gl.css`) and the environment variables.
    - _Requirements: 1.6, 1.7_
  - [x] 25.2 `src/purity.test.ts` (§10)
    - Every rule of §10, each checked against a copy of a real source with its token added; the
      fixed list of non-test source files; `package.json`: exact versions, no `^` or `~`, the five
      runtime dependencies, `exports` only `"."`, `.env.example` without values; the index loads
      with `maplibre-gl` mocked to throw.
    - _Requirements: 1.1 to 1.10, 20.1, 20.5_

- [x] 26. Final checkpoint
  - `test:deep` for **every** property of design §8 at its stated count, with cases, discards, worst
    errors and the measured cost of the capped ones; checkpoint 23's report. `pnpm test`,
    `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. `pnpm --filter @alidade/ui build:playground`
    once, exit code read, bundle sizes reported (design D19). Confirm that every FOR ALL criterion of
    the requirements has a property in design §8 that has a test, that each names itself and its
    requirements in a comment, and that each runs at least 200 cases in `pnpm test` (the capped
    ones at their stated counts). Write `coverage.md` (a table of every criterion and the tests that
    cover it, as for Sensors). List the device checks of the requirements for the Playground and the
    publication date of every dependency. Report and stop.

- [x] 27. Application layers on the map, and scenes of an app's own (design D31)
  - Added after the skeleton was finished, for Vigia and Nonius. Tests before code in every step;
    each step ends with its tests, `pnpm typecheck`, `pnpm lint` and `pnpm format:check`. No new
    dependency. `timeout` in front of every test run, no `pkill`, no commit.
  - [x] 27.1 Freeze the catalogue, and its regression test (Req 17.14)
    - `fixtures/catalogue-before-task-27.json`: `buildCatalogue()` as it is, written once, before
      any change, read-only afterwards. `math/scene/catalogue-regression.test.ts`: the eleven
      scenes and their scripts equal it deeply after a JSON round trip, scene by scene, naming the
      one that differs. It passes on the unchanged code now, and again after 27.3.
    - _Requirements: 17.14_
  - [x] 27.2 Scene building: tests first (Req 17.13, 17.15)
    - `script-for-station.test.ts` (each refusal with its field, the clamp, each option, the
      defaults, a start time outside the model's years), the generator `stationScriptCase`
      (design §8) and P-17.15 with its report of clamped cases. All fail (no module yet).
    - _Requirements: 17.13, 17.15_
  - [x] 27.3 Scene building: code
    - Move `sceneFromOffsets`, `SceneSpec`, `StationSpec`, `TargetSpec` to
      `math/scene/scene-from-offsets.ts` (code unchanged; imports of tests and generators
      updated); new `math/scene/script-for-station.ts`; the catalogue built through both.
      27.1's regression and P-17.15 pass. `scriptForStation` and `sceneFromOffsets` join the
      hostile properties' list (P-2.6).
    - _Requirements: 17.13, 17.14, 17.15, 2.6_
  - [x] 27.4 Application layers: tests first (Req 15.14 to 15.17)
    - `FakeMap` gains `addSource`, `addLayer`, `removeLayer`, `removeSource`, the ordered
      `layerIds()`, the call logs, and the two failure modes (D31.6). `math/map/app-layer.test.ts`
      and P-15.15 (`app-layer.property.test.ts`), `map-style.test.ts` (the position of
      `APP_LAYERS_BEFORE_ID`), `adapters/map/map-adapter.layers.test.ts`, P-15.17 in
      `map-adapter.property.test.ts` with the generator `appLayerOp`, `MapView.test.tsx` (the
      `layers` prop). All fail.
    - _Requirements: 15.14, 15.15, 15.16, 15.17_
  - [x] 27.5 Application layers: code
    - `defaults.ts` (`MAX_APP_LAYERS`, `MAX_LAYER_FEATURES`), `math/map/app-layer.ts`,
      `map-style.ts` (`APP_LAYERS_BEFORE_ID`, the wider `MapLayer.paint`), `maplibre-types.ts`,
      the loader's adaptation, `map-adapter.ts` (`setLayer`, `clearLayer`, `fitToFeatures`' second
      argument, `sync`), `MapView` (`layers`). The tests of 27.4 pass.
    - _Requirements: 15.14, 15.15, 15.16, 15.17_
  - [x] 27.6 Exports, purity, README, coverage
    - `src/index.ts` (the types and constants of D31, `setLayer` through `MapAdapter`,
      `sceneFromOffsets`, `scriptForStation` and their types); the file list and the two new
      rules of `purity.test.ts`; `README.md` (a section on application layers and one on scenes of
      an app's own); `coverage.md` (rows 15.14 to 15.17 and 17.13 to 17.15, regenerated).
    - _Requirements: 1.6, 1.7_
  - [x] 27.7 Checkpoint: group 27 (stops for review)
    - `test:deep` for the files touched; the new properties' cases, discards and worst errors; the
      regression of the eleven scenes; the mutation checks (each run against the real tests, each
      expected to fail, the source restored after): `setLayer` accepts a feature of kind `fix`; an
      application layer drawn above the Fix; `clearLayer` that clears the Fix; `scriptForStation`
      aimed at the wrong Target. `pnpm test`, `pnpm typecheck`, `pnpm lint`,
      `pnpm format:check` from the root, and `pnpm --filter @alidade/ui build:playground` once.
      Report and stop.
  - [x] 27.8 The builder of features and the fit flag (design D31.12; closes H1 and H2)
    - Tests first: `math/map/app-feature.test.ts`, P-15.18 (`adapters/map/app-feature.property.test.ts`),
      the fit tests of `MapView.test.tsx`. Then `math/map/app-feature.ts`, `AppLayer.fit`, `MapView`,
      the exports, the purity list, the README, `coverage.md`. One mutation check each: the builder
      writing latitude first; `MapView` fitting to a layer that did not ask for it.
    - _Requirements: 15.14_

- [x] 28. `DeviceSighting`: the Playground's device mode as an exported component (amendment of 2026-11-18, Req 18.10, design D32; G6 of the Vigia design)
  - Added after the skeleton was finished, for Vigia and Nonius. Tests before code; no new
    dependency; `timeout` in front of every test run, no `pkill`, no commit. Every full test run keeps
    its whole output in a file.
  - [x] 28.1 Tests first: `src/components/DeviceSighting.test.tsx` with the Simulator as the Sensor
    source, `FakeTimer`, `FakeCameraSurface`: one tap starts the camera and asks for motion; a Mark
    without a calibration shows `calibration_missing`; the crosshair captures and the Session reaches
    the caller; unmounting stops the camera's tracks (also one still starting) and the source. All fail
    (no module yet).
    - _Requirements: 18.10_
  - [x] 28.2 Code: `git mv playground/DeviceMode.tsx src/components/DeviceSighting.tsx` (D32); the
    Playground uses it through `src/index.ts`; `index.ts` exports `DeviceSighting` and
    `DeviceSightingProps`; the file list of `purity.test.ts`; the README (a section); `coverage.md`
    (row 18.10); the README test of exported names names it. The Playground's integration tests pass
    unchanged.
    - _Requirements: 18.10, 1.6, 1.7_
  - [x] 28.3 Checkpoint: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` from the root
    and `pnpm --filter @alidade/ui build:playground` once. One mutation check: the camera adapter not
    stopped on unmount fails two tests. Report and stop.
