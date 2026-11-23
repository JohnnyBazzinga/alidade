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

- [x] 8. Checkpoint: geometry and messages
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

- [x] 29. Four faults of the first trial on a phone (amendments of 2026-11-19: Req 13.13, 13.14, 15.18, 18.11; design D33)
  - Added after the skeleton was finished. Tests before code; no new dependency; `timeout` in front
    of every test run, no `pkill`, no commit; every full run keeps its output under `/tmp/g29/`.
  - [x] 29.1 Tests first. `components/SightingScreen.layout.test.tsx` (Req 13.13: nothing out of the
    flow but the Reticle and the Mark inside the image, in every state and kind; no height on the
    screen; the image's own height; the order around the control bar; no box of fixed height in the
    Simulator panel. Req 13.14: a refused Freeze, and a Capture refused with `frame_reset` after a
    lost north, shown directly above the bar; the compass control primary on the Relative frame
    without a valid north). `ControlBar.test.tsx` (the bar is not sticky: the earlier assertion
    that it was is replaced, by the amendment). `maplibre-loader-adapt.test.ts` and
    `maplibre-loader-worker.test.ts`, `map-adapter.test.ts`, `MapView.test.tsx`, `messages.test.ts`
    (Req 15.18). `playground/build-output.test.ts` in a new Vitest project `build` (Req 15.18).
    `Playground.integration.test.tsx` (Req 18.11). All failed for the reason they name.
    - _Requirements: 13.13, 13.14, 15.18, 18.11_
  - [x] 29.2 Code: `ControlBar` (in the flow), `SightingScreen` (`IMAGE_HEIGHT`, the order, the
    primary control), `SimulatorPanel` (no `height: 520`), `maplibre-types.ts` (`unavailable`),
    `maplibre-loader.ts` (`setWorkerUrl` with the `?url` address; worker failures to
    `unavailable`), `maplibre-worker-url.d.ts` (listed in `purity.test.ts` and in Vigia's
    `tsconfig.json`), `map-adapter.ts`, `MapView.tsx`, the Message of `map_unavailable`, and the
    Playground's device-mode order with a closed `details`. `coverage.md` rows.
    - _Requirements: 13.13, 13.14, 15.18, 18.11_
  - [x] 29.3 Checkpoint: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` from the root
    and `pnpm --filter @alidade/ui build:playground` once. Mutation checks: the loader without
    `setWorkerUrl` fails one test; the compass control never primary fails two. Report and stop;
    the lead checks Req 13.13 in a real browser.


- [x] 30. What a reviewer of an app sees first (2026-11-20; Req 13.13, 15.5, 15.7, 17.4, 17.7;
  design D34; with Vigia's task group 21). Replaces the note of 2026-11-20.
  - Tests before code; no new dependency; `timeout` in front of every test run, no `pkill`, no
    commit; every run keeps its output under `/tmp/vigia/`.
  - [x] 30.1 `MapView` shows the result of its fit. Tests first: `MapView.test.tsx`, two observers
    either side of 180° show the Message of `crosses_antimeridian`, gone when the map fits again.
    Code: `MapView` adds the fit's result to the results it shows. Vigia's own check of the extent
    is removed in Vigia's task 21.6.
  - [x] 30.2 The 95 % ellipse is seen. Tests first: `map-style.test.ts` (the ellipse's outline over
    the lines and the Wedges, its fill under the lines, still under the Fix's point; the Fix dot at
    most 10 px across with a 2 px ring), `map-adapter.test.ts` (with a Fix the fit holds the
    observers and the ellipse, not the ends of a 50 km line; without one, everything held),
    `MapView.test.tsx` (the `height` prop, 240 px by default). Code: `map-style.ts`,
    `map-adapter.ts`, `MapView.tsx`.
  - [x] 30.3 The compact presentation of `SimulatorPanel`. Tests first:
    `SimulatorPanel.compact.test.tsx` (the order scene, Station, Start, then the closed
    "Simulator controls" with Seed, Speed, Play, Pause, Step, Restart; Start plays; the full
    presentation unchanged; `selectedStationId` followed, kept across a change of scene, an unknown
    id ignored; no Station chooser of the panel's own then). Code: `SimulatorPanel.tsx`. The
    Playground keeps the full presentation (D34.1).
  - [x] 30.4 The control within reach (2026-11-20, from the lead's look in a browser at 390 × 844:
    after Start, Freeze was below the first screen). Tests first: `SightingScreen.layout.test.tsx`
    (live: the bar directly after the readout, and the instruction, the Yaw status when it asks
    nothing, the limits line and the known-azimuth form after it; frozen: the bar directly after
    the image; Start still first; the image `clamp(200px, 28svh, 480px)`; the readout's and the Yaw
    status's line height set), seen to fail on the committed screen; Vigia's
    `sight-first-screen.test.tsx` (the heights the components set, summed, against 844 at 390 wide
    and 667 at 375 wide). Code: `SightingScreen.tsx` (the order, `IMAGE_HEIGHT`), `Readout.tsx`,
    `YawStatusBar.tsx` and the panel's labels (line height 1.25); Vigia's phone bar at 16 px. The
    refusal stays directly above the bar, and the Yaw status with it while north must be set (Req
    13.14). 667 px cannot hold it: the smallest height that does, at 375 wide, is 810 px.
  - [x] 30.5 Checkpoint: `pnpm test` from the root, `pnpm typecheck`, `pnpm lint`,
    `pnpm format:check`, and `pnpm --filter @alidade/ui build:playground` once with the test of its
    output (the worker file). Mutation checks: the fit that holds the lines with a Fix, `MapView`
    dropping the fit's result, Start that does not play, the panel ignoring the given Station;
    each fails a named test.

- [x] 31. The attribution in full (2026-11-20; Req 15.2 as amended; Vigia task 22, its Open question O7)
  - [x] 31.1 Tests first, seen to fail: `map-adapter.test.ts` (the map is created with
    `attributionControl: { compact: false }`, with and without a Tile source),
    `Playground.integration.test.tsx` (the Playground's map the same). `maplibre-loader-adapt.test.ts`
    (the option reaches the library's constructor unchanged) passed before the change: the loader
    passes every option through, and the test guards that.
  - [x] 31.2 Code: `maplibre-types.ts` (`MapOptionsLike.attributionControl`, required, and what was
    read in maplibre-gl 6.16's `AttributionControl`: with `compact: false` the control is never
    compact and stays open, also after a drag), `map-adapter.ts`. The Playground uses `MapView`, so it
    has the same control.
  - [x] 31.3 Only a picture can confirm that the text is shown in full on a phone 360 to 390 px wide,
    that it does not wrap over the map's content in a way that hides the Fix, and that it stays open
    after the map is moved: jsdom has no layout and the fake map library creates no control. Then
    the root checks.
  - [x] 31.4 Continued (2026-11-20, from the lead's look at 390 px: pale text on the library's
    half-transparent white strip, and the strip over an observer's dot). Tests first, seen to fail:
    `math/map/attribution-style.test.ts` (dark ink on light ink, opaque, at least 7:1; links the same
    colour and underlined; 12 px on 20 px lines; the strip of two lines and its padding, 44 px),
    `theme.test.tsx` (the pair `outline on mapInk (map attribution)` among the palette's pairs),
    `MapView.test.tsx` (the style, scoped to the map container's class), `map-adapter.test.ts` (the
    fit's bottom padding is the padding plus 44 px). Code: `math/map/attribution-style.ts`,
    `theme.ts` (the pair), `MapView.tsx` (the `<style>` and the class), `map-adapter.ts` and
    `maplibre-types.ts` (padding by side), the purity list. Only a picture can confirm that the
    rules win over the library's stylesheet in a real browser, that the strip is one line at 390 px
    with the trial's attribution, and that the observers now sit above it.

- [x] 32. `DeviceSighting` takes the kind of capture (2026-11-20; the lead's decision 6 of the Nonius review, G1 of the Nonius requirements; amendment of Req 18.10 proposed to the lead, design D32 extended)
  - Added for Nonius, which sights an altitude through the same component. The change: one
    optional property, `kind: SessionKind` (`'bearing'` or `'altitude'`), default `'bearing'`,
    passed to `useSightingSession` in place of the literal `'bearing'`; like `parameters`, it must
    be stable between renders (a new kind restarts the Session, which `useSightingSession` already
    does when its `kind` changes). Nothing else changes: no Math-layer change, no new export besides
    the property on `DeviceSightingProps`, no new dependency. Vigia passes nothing and is unchanged.
    Tests before code; `timeout` in front of every test run, no `pkill`, no commit; every full test
    run keeps its whole output in a file.
  - [x] 32.1 Tests first, seen to fail: `src/components/DeviceSighting.test.tsx`, with the Simulator
    as the Sensor source (a script of UI's catalogue scene `sun`), `FakeTimer`, `FakeCameraSurface`
    and a recording wrapper around the source: with `kind: 'altitude'`, one tap starts the camera
    and asks for motion, the Session given to `onSession` has `kind: 'altitude'`, the crosshair's
    capture is a `CapturedResult` of kind `altitude` whose apparent altitude equals Sensors'
    `captureAltitude` on the same Frozen history, and `startPosition` is never called; with no
    `kind`, the Session is a `bearing` Session and `startPosition` is called, as today. The existing
    tests of the file pass unchanged.
    - _Requirements: 18.10 (as amended)_
  - [x] 32.2 Code: `DeviceSighting.tsx` (the property and its documentation comment); the README's
    section on `DeviceSighting` (one sentence on `kind`); `coverage.md` (row 18.10 names the new
    tests); design D32 (one sentence: the kind of capture is a property, default `bearing`). The
    Playground's integration tests and every Vigia test pass unchanged.
    - _Requirements: 18.10 (as amended), 1.6, 1.7_
  - [x] 32.3 Checkpoint: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` from the root,
    and `pnpm --filter @alidade/ui build:playground` once. One mutation check: the literal `'bearing'`
    put back in place of `kind` fails the new altitude tests. Report and stop.

- [x] 33. The Simulator panel can leave the scene to the application (2026-11-21; from the lead's walk of Nonius at 390 px, where the panel's own "Scene" chooser repeated the app's)
  - One optional property, `hideSceneChooser?: boolean` (default `false`), on `SimulatorPanelProps`: when `true` the panel shows no scene chooser, in either presentation, and no empty row where the choosers were. Every other control and the Station rules are unchanged; Vigia, the Playground and every earlier test pass unchanged. No Math-layer change, no new export, no new dependency.
  - [x] 33.1 Tests first, seen to fail (`SimulatorPanel.compact.test.tsx`): no scene chooser in either presentation with the property, and no select outside the closed disclosure in the compact one; the chooser as before when the property is absent or `false`; the panel stays on the scene it is given.
  - [x] 33.2 Code: `SimulatorPanel.tsx`. Proposed amendment of UI Requirement 17.4 for the lead: "THE panel MAY be told that the application chooses the scene, and then SHALL show no scene chooser of its own."


- [x] 34. The sighting screen docked on a phone, and two font stacks (2026-11-21, after the lead's walk on his iPhone; Req 13.4, 13.13 to 13.19, 19.6 as amended; design D35, D36; Vigia's task group 23 follows this one)
  - The working rules of this file apply: tests first and **seen to fail** on the committed code, `timeout` in front of every test run, no `pkill`, no dev server, no watch mode, no commit, one run at a time, every run's whole output in a file under `/tmp/vigia/` and the file named in the report. **No new dependency.** `requirements.md` is not edited by this group; if a criterion cannot be met as written, stop and report (the budget of Req 13.15 is the likely one: see 34.7). Nothing under `skeleton/core` or `skeleton/sensors` changes, and no Math-layer module of `skeleton/ui/src/math/` changes except `display-format.ts`'s callers, if any: the Session, the driver and the readout's numbers are untouched.
  - The default layout stays `flow`: the Playground, the Simulator panel and Nonius do not ask for `docked`, so their screens and tests are unchanged except where this list says so. The files this group changes are listed in its report.
  - [x] 34.1 Characterise, before changing anything. (a) Run `pnpm --filter @alidade/ui test`, `pnpm --filter @alidade/nonius test` and `pnpm --filter @alidade/vigia test` once and keep the three outputs: they are the baseline that 34.9 compares with. (b) Add `src/math/session/notice-lifetime.test.ts`, which **passes on today's code** and records what Req 8.4, 8.5 and 8.7 do together (UI Open question 14): a bearing Session in `live`, a failed Orientation sample (`sensor_unavailable`), then 20 good samples and ticks: the Notice is still there; a `freeze` that succeeds clears it. The test describes the behaviour and does not call it right or wrong; it is **not** a change to Req 8.7, which the lead has not asked for.
    - _Requirements: 8.4, 8.5, 8.7_
  - [x] 34.2 The two font stacks. Tests first, seen to fail: `theme.test.tsx` (`BODY_FONT_STACK` is exactly `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; `NUMERIC_FONT_STACK` is exactly the old monospace stack; `NUMERAL_STYLE` has the numeric one and tabular digits; `controlStyle`, `FailureNotice`, `LimitsNote`, the hints and the labels of the Readout have the body one, and the Readout's numerals and `CaptureSummary`'s headline the numeric one; `FONT_STACK` is no longer exported by `index.ts`, checked by reading the source of `index.ts`; **`SIZES` and `PALETTE_PAIRS` equal, deeply, a copy of today's values typed into the test**, so that no size or contrast is lowered by this change; every pair is still at least 7 : 1). `site-page.test.ts` **follows the rename**: it checks the numeric stack, because the site page is the instrument's look and stays in it; this is the test following a renamed export and not a narrowed assertion, and the report says so. Code: `theme.ts` and every use of `FONT_STACK` in `skeleton/ui` (design D36), `index.ts`, then the apps' imports so that the repository stays green: **Vigia** (`look.ts`: text, buttons and titles take the body stack, `readout` the numeric one; `TabBar`, `FailureNotice`, `App`, `PhoneInHandBar`: body) and **Nonius** (`look.ts`, `TabBar`, `FailureNotice`, `App`, `SightTimeBar`: body, and the numeric one where a reading is set), as changes of an import and a style value only, with no change of layout. The comments of the two `TabBar.test.tsx` files and of Nonius's `wrapped-lines.ts` say that `0.63 em` is now an upper bound for the body stack (Open question 16); their arithmetic is unchanged and must still pass. `README.md` of the package (the theme paragraph).
    - _Requirements: 13.4, 13.2, 13.11_
  - [x] 34.3 The docked layout. Tests first, seen to fail, `SightingScreen.docked.test.tsx` (structure, Req 13.19), in every Session state and with the Simulator as the Sensor source: the root has `data-layout="docked"`, `height: 100dvh`, no scroll of its own; its children are the `top` slot (when given), the middle part (`data-part="middle"`, `overflow-y: auto`, the **only** element of the column with it) and the bar, **the last child, with nothing after it**; the bar has `env(safe-area-inset-bottom)` in its bottom padding; nothing in the column is `position: fixed`, and the bar is not `sticky`; the bar's text part holds, in this order, the north prompt (when north is needed), the portrait warning, the Message of the Notice (once when it equals the prompt's), the `failure` in `failed`, has `max-height` of `DOCKED_BAR_TEXT_MAX_SHARE` of `dvh` and scrolls; the bar's controls are the current action only, for `permission`, `starting`, `live` (north needed and not needed, on the Relative and the Absolute frame, for a bearing and for an altitude Session), `frozen` (with and without a Mark), `captured` and `failed`, with the sizes of Req 13.7; the image box is `flex: 1 1 auto` with `min-height` `DOCKED_IMAGE_MIN_HEIGHT_PX`; `aim`, `top` and `extra` are where D35.1 puts them. A second file, `SightingScreen.flow-unchanged.test.tsx` or the existing `SightingScreen.layout.test.tsx` and `SightingScreen.test.tsx` **unchanged**, shows that with no `layout` the screen is the flow layout of task 30.4: `IMAGE_HEIGHT`, the bar directly after the readout, the order of the parts. Code: `SightingScreen.tsx`, `ControlBar.tsx` (a docked variant: `DockedBar`), `DeviceSighting.tsx` (`layout`, `top`, `aim`, `extra` passed through), `defaults.ts` (`DOCKED_IMAGE_MIN_HEIGHT_PX = 160`, `DOCKED_BAR_TEXT_MAX_SHARE = 0.2`, each with its unit and its reason; `defaults.test.ts` checks finite, positive, the share below 1).
    - _Requirements: 13.13, 13.14, 13.15, 13.7, 19.6_
  - [x] 34.4 The compact readout, "Details", the compact summary. Tests first, seen to fail: `Readout.test.tsx` (with `compact`: for a bearing Session the azimuth with its North word and one line "Steady hand: shake ±…°", a bare `±` beside the azimuth never; for an altitude Session the altitude; the stale line and a failed readout stay in the compact readout; the other angle, its shake, the number of readings and the limits note are inside a closed `details` "Details"; without `compact` the readout is exactly as before), `YawStatusBar.test.tsx` (`lineOnly`: the line without its prompt, for "Details"), `CaptureSummary.test.tsx` (with `compact`: the headline with its sigma visible; the "Made of" list and the limits note inside a closed `details` "Why this accuracy?"; without it, as before; no result is shown without its sigma, Req 13.6). Code: `Readout.tsx`, `YawStatusBar.tsx`, `CaptureSummary.tsx`, `SightingScreen.tsx` (the docked layout uses the compact forms). Sizes of Req 13.4 unchanged: the compact readout's numeral is 32, its lines 20.
    - _Requirements: 13.4, 13.5, 13.6, 13.16_
  - [x] 34.5 "Other ways to set north". Tests first, seen to fail: in the docked layout the known-azimuth form is not in the middle part; the control "Other ways to set north" is its last row; opening it replaces the middle part and the bar by a view with the form, a compass control and a control back, **no bar in the DOM**; going back restores the screen with the Session unchanged; a submitted form reaches `onAction` as before; in the flow layout the form is where it was (`KnownAzimuthForm.test.tsx` and `SightingScreen.test.tsx` unchanged). Code: `SightingScreen.tsx`, `KnownAzimuthForm.tsx` only if its container style needs to change.
    - _Requirements: 13.18, 11.1_
  - [x] 34.6 No instruction to tap where a tap cannot work. Tests first, seen to fail: with `calibration: null` the frozen hint in **both** layouts does not contain "Tap the image" and says that Capture takes the crosshair's direction, and the "Mark set" and "No mark" lines are not shown; with a calibration the hint is the existing one. `SightingScreen.test.tsx`'s assertion at the hint (line 111, `frozenHint` and `notMarked`) is for a screen with a calibration and stays so; if it was written for a screen with none, it is **a requirement change** (13.17) and is changed with the report saying so, not narrowed. `ImageSurface` passes no tap on when there is no calibration (no `mark` event, no Notice); the Session's own refusal of a `mark` event stays (Req 18.10 as amended, Open question 15 decided). Test: a tap on the frozen image with `calibration: null` leaves `onAction` uncalled and the Session without a Notice; with a calibration it marks as before. The Playground's and `DeviceSighting`'s existing tests that expected the `calibration_missing` Message after a tap are requirement changes (18.10) and are changed with the report saying so. Code: `SightingScreen.tsx` (`SCREEN_TEXT`, `onMark` only with a calibration).
    - _Requirements: 13.17, 18.10_
  - [x] 34.7 The budget. Test first, `SightingScreen.docked-budget.test.tsx`, which sums, **from the styles the components set**, the heights of the rows that do not flex, the way Vigia's `sight-first-screen.test.tsx` does (greedy wrap at `0.63 em`, the line heights set by the components, paddings and gaps, the inset of `34` CSS pixels for the home indicator) and checks Req 13.15: at 390 × 664 and at 375 × 667, for `permission`, `starting`, `live` with north needed and not needed, and `frozen` with a refusal at its cap, that the top row (48 and a gap), the aiming row (one row of 48 and a gap), the compact readout, the bar and the image's floor fit the viewport, and that "Details" and "Other ways to set north" are the only rows allowed below it. The arithmetic of design D35.4 closes at zero margin at 390 × 664 by construction: **if the test does not close, stop and report** (the choice between a smaller floor, a smaller cap, a shorter row or a different budget is the lead's, Req 19.6), and do not move a constant to get a pass. The test fails if a row is added to the bar or the middle part without being counted.
    - _Requirements: 13.15, 19.6_
  - [x] 34.8 Public API and documents. `index.ts`: `BODY_FONT_STACK`, `NUMERIC_FONT_STACK`, `DOCKED_IMAGE_MIN_HEIGHT_PX`, `DOCKED_BAR_TEXT_MAX_SHARE`, the `SightingLayout` type, and the props of `DeviceSighting`, `SightingScreen`, `CaptureSummary` that this group adds; the new files in the purity list; `README.md` (the docked layout, its parent's part, the slots, the stacks); design §6 (the new props and exports) and §5 (the new files); `coverage.md` (rows 13.4, 13.13 to 13.19, 19.6 and the new tests; the rows of 13.13 and 13.14 name the first-form tests that still hold for the flow layout).
    - _Requirements: 1.7, 13.13 to 13.19, 19.6_
  - [x] 34.9 Checkpoint (stops for review). From the root: `pnpm --filter @alidade/ui test:deep`, then `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm format:check`, and `pnpm --filter @alidade/ui build:playground` once. **Nonius's checks, run by name and reported against the baseline of 34.1:** `pnpm --filter @alidade/nonius test` passes with the same tests and no assertion changed, in particular `SightScreen.test.tsx`, `sight-first-screen.test.tsx`, `TabBar.test.tsx`, `App.test.tsx`, `screens-look.test.tsx`, `IndexErrorScreen.test.tsx` and `purity.test.ts`; Nonius still shows the flow layout (a test: its Sight screen has no `data-layout="docked"`). **Vigia's** suite passes with the same tests as the baseline, except the files this group's rename touches. Mutation checks, each expected to fail a named test, the source restored after and `git diff` of the file shown empty: the bar made `position: sticky`; the middle part without `overflow-y`; the default layout switched to `docked`; the bar not the last child; the cap removed from the text part; `FONT_STACK` put back as an alias of the numeric stack; the compact readout showing a bare `±`. Report: the changed files, the baseline and final counts, the three outputs' file names, the arithmetic of 34.7 with its numbers, and every place where a requirement had to be read, with the reading. **Stop for review.** Then, the reviewer walks the Playground in a browser in device mode at 390 × 664 only if the lead asks; the positions of the docked screen are measured with Vigia's screens at the checkpoint of its task group 23 (Vigia Device check V12).

- [ ] 35. Themes as data, the mechanism, icons and the camera's frame (2026-11-22, the lead's new look; Req 13.2, 13.4, 13.11, 13.13, 20.3, 20.7, 22; design D37; Vigia task groups 24 and 25 follow this one)
  - The working rules of this file apply: tests first and **seen to fail** on the committed code, `timeout` in front of every test run, no `pkill`, no dev server, no watch mode, **no commit**, one run at a time, every run's whole output in a file under `/tmp/kt/` and the file named in the report. **The one dependency, `lucide-react` `1.70.0`, is installed by the lead** (task 35.4 stops there); no other. `notes/` is not read, and the lead's six reference images (in `design-ref/`, outside the repository) are not copied into a test, a doc or a report. Nothing under `skeleton/core` or `skeleton/sensors` changes, and no Math-layer module of the Session. If a criterion cannot be met as written, stop and report.
  - **The rule that organises this group:** a component writes a role, never a colour; Instrument is today's look with nothing changed on screen; Field and Field night are data the application chooses.
  - [x] 35.1 Baseline and the spike. (a) Run `pnpm --filter @alidade/ui test`, `@alidade/nonius test` and `@alidade/vigia test` once and keep the three outputs. (b) A test, `components/theme/var-in-jsdom.test.tsx`, that **sets `var(--alidade-ink)`** in an inline style of `color`, `background`, `border` (shorthand and `borderLeft`), `borderTopColor`, `boxShadow` and `fill`/`stroke` of an SVG element in the simulated DOM and reads each back from `element.style`, and `style.setProperty('--alidade-ink', '#0E1E33')` on the root read back with `getPropertyValue`; it documents which properties keep the `var()` and which drop it. **If any property that the components need drops it, stop and report before 35.2**: the design switches to a React context (D37.3, Open question 17) and the group is re-estimated.
    - _Requirements: 22.4_
  - [x] 35.2 Themes as data. Tests first, seen to fail: `components/theme/themes.test.ts` (every theme has every role, a hex value, no role missing or extra; the three themes' `id`; Field's and Field night's values equal the table of Vigia design D25.1, typed into the test; Instrument's values equal **today's** (typed into the test, including `okInk #9ED9A8`) and its shapes are `0` with no shadow; the six constant roles are equal in the three themes; the flags), `components/theme/palette.test.ts` (**every pair of every theme at its threshold**: the text pairs `7`, the icon and outline pairs `3`, the gradient ends, as Req 22.3 lists them; the pairs are data; a role added without a pair fails; a pair added below its threshold fails, as the existing test does; the measured numbers of D25.1 are asserted to two decimals for the roles the lead did not give), and the existing `theme.test.tsx` kept, with its comparison of `COLOURS` with hex values changed to the aliases of D37.1. Code: `components/theme/roles.ts`, `themes.ts`, `palette.ts`; `theme.ts` as the facade (the aliases, `SIZES`, the stacks, `paletteFor`).
    - _Requirements: 22.1, 22.2, 22.3, 22.7, 13.2, 13.11_
  - [ ] 35.3 The mechanism. Tests first, seen to fail: `apply-theme.test.ts` (`applyTheme(root, theme)` writes every role and every shape as `--alidade-…`; a second call replaces; `activeTheme()` is Instrument until one is applied and the last applied after; no `<style>` element is created, checked on `document`), `theme-change.test.tsx` (`onThemeChange` notifies its subscribers on every `applyTheme`; a part that reads `activeTheme()`, such as the scene image's canvas, is drawn again with the new values when another theme is applied while it is shown; the map's paints use only constant roles and the map's own constants), `colour-scheme.test.ts` (`watchColourScheme` with a fake `MediaQueryList`: calls `onChange` with the current value at once, on every `change`, stops on the returned function and leaves no listener; takes `matchMedia` as an argument and reads no global), `no-colour-literals.test.ts` (the scan of Req 22.6 over the package, and the list of its allowed files; a literal planted in a copy of a component fails it). Code: `apply-theme.ts`, `colour-scheme.ts`; `COLOURS` become `var(--alidade-<role>)`; every SVG paint that was a presentation attribute (the Reticle, the Mark, the scene image, the QR's `fill`) moves to `style`; `QrImage`'s `#000000` and `#FFFFFF` are `qrDark` and `qrLight` (the QR's own tests unchanged); the map's style and the scene image's canvas read `activeTheme()`; the Playground's and the Simulator panel's literals move into roles. The Playground applies Instrument at start.
    - _Requirements: 22.4, 22.5, 22.6_
  - [ ] 35.4 Icons. `lucide-react` `1.70.0` is **already installed** in `skeleton/ui` by the reviewer (2026-11-22; design §3 has the registry's date and the peer range); install nothing. Check that `skeleton/ui/package.json` lists it at exactly `1.70.0` and that no other package does. Tests first, seen to fail: `Icon.test.tsx` (every name of `ICON_NAMES` renders an `svg` with `aria-hidden="true"`, `24` wide and high, stroke `2`, `currentColor`; a name outside the list is refused at type level and by a test; the list equals D37.6's, typed into the test; **every name exists in the installed package**, so that a missing one is reported), `icon-use.test.tsx` (a scan: a `button` or a link whose only child is an `Icon` fails; an `Icon` outside the component files and the shared ones fails the review list). Code: `Icon.tsx`, `index.ts` exports (`Icon`, `ICON_NAMES`, `IconName`). `README.md`: one paragraph.
    - _Requirements: 22.8, 20.7_
  - [ ] 35.5 Status cards and disclosures. Tests first, seen to fail: `StatusCard.test.tsx` (the tone's tint, the `4` px bar, the icon in its icon role, the headline in the tone's ink, bold, at `20`, the children at `16`; in Instrument the card is today's block: `card` background and a `3` px left rule in `alert`; the headline is a readout and the rest body text), `Disclosure.test.tsx` (a chevron-down while closed and a chevron-up while open, read after a `toggle` event; the summary at least `48` high and never without a marker; no chevron-right; the label and the contents), a test that every `details` in the package uses `Disclosure`. Code: `StatusCard.tsx`, `Disclosure.tsx` (moved from Vigia, which re-exports it until task 24.1), `FailureNotice` and `YawStatusBar` through `StatusCard`; `Readout` and `CaptureSummary` through `Disclosure`. `FailureNotice.test.tsx`'s wording and `role="alert"` unchanged. `YawStatusBar`'s wording tests unchanged.
    - _Requirements: 22.9, 22.13, 13.4_
  - [ ] 35.6 The camera's frame, the readout cards, the summary's rule, "Other ways" as cards. Tests first, seen to fail: `ImageSurface.test.tsx` (four brackets in the corners, each of two arms of `24`, `pointer-events: none`, `aria-hidden`, inside the surface, at least `32` from the centre at `351 × 160`; the radius from the theme; the Reticle and the Mark unchanged), `SightingScreen.layout.test.tsx` and `SightingScreen.docked.test.tsx` (the exceptions of Req 13.13: the brackets are the only other thing out of the flow, and only inside the image), `Readout.test.tsx` (compact: two cards side by side, two cards of equal width, the numeral at `32` with no icon beside it, each icon at the start of a line of words, the steadiness as today's sentence at `20` and not a numeral of its own, the text of each card as the existing wording tests say, the stale line and a failed readout outside the cards, the flow readout unchanged), `CaptureSummary.test.tsx` (`sigmaText` used for the headline, the default unchanged), `SightingScreen.docked-parts.test.tsx` ("Other ways to set north" as a view of cards with its fields, the bar hidden, as today). `SightingScreen.idle-image.test.tsx` (the `idleImage` of Req 22.15 is drawn before Start only, in the frame with the brackets, `aria-hidden`, in the middle part; nothing when absent, so Nonius's screen is unchanged). Code: `ImageSurface.tsx`, `Readout.tsx`, `CaptureSummary.tsx`, `SightingScreen.tsx`, `KnownAzimuthForm.tsx`.
    - _Requirements: 22.10, 22.11, 22.12, 22.15, 13.13, 13.16, 13.18_
  - [ ] 35.7 The budget, rewritten. Test first, seen to fail on the readout cards: `SightingScreen.docked-budget.test.tsx` gets the heights of D37.10 and D37.11 (the readout cards, the status card in the bar with its `8` of vertical padding and the north message of `126`), and asserts **live with north needed fits `648` of `664` and `375 × 667`**, **frozen worst `649`**, permission and starting as before; the test fails if a row is added without being counted. **If it does not close, stop and report**: the choices are the image's floor, the cap, or the readout's layout (Open question 19), and they are the lead's.
    - _Requirements: 13.15, 22.11_
  - [ ] 35.8 Nonius and the Playground stay in Instrument. Nonius's `main.tsx` and the Playground's `main.tsx` apply Instrument. Run `pnpm --filter @alidade/nonius test` and the Playground's integration tests: the **only** changes allowed in an existing test are the ones that compare a style with a colour (they compare with the role's value, `var(--alidade-<role>)`), and each is listed in the report. A test that Nonius's Sight screen has no `data-layout="docked"` stays.
    - _Requirements: 22.14_
  - [ ] 35.9 Public API, documents, lists. `index.ts`: `ROLES`, `Role`, `Theme`, `instrument`, `field`, `fieldNight`, `applyTheme`, `activeTheme`, `watchColourScheme`, `paletteFor`, `Icon`, `ICON_NAMES`, `IconName`, `StatusCard`, `Disclosure`; the new files in the purity list; `README.md` (themes, the mechanism, icons, the Instrument and Field looks, in two paragraphs); design §3, §5 and §6; `coverage.md` rows for 13.2, 13.4, 13.11, 13.13, 20.3, 20.7 and 22.1 to 22.14.
    - _Requirements: 1.7, 22_
  - [ ] 35.10 Checkpoint (stops for review). From the root: `pnpm --filter @alidade/ui test:deep`, then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm --filter @alidade/ui build:playground` once. **Nonius's checks, by name, against the baseline of 35.1:** `pnpm --filter @alidade/nonius test` passes with the same tests; `SightScreen.test.tsx`, `sight-first-screen.test.tsx`, `TabBar.test.tsx`, `App.test.tsx`, `screens-look.test.tsx`, `IndexErrorScreen.test.tsx` and `purity.test.ts` named. Vigia's suite passes except the files that task group 24 will change (listed). Mutation checks, each expected to fail a named test, the source restored after and `git diff` of the file shown empty: a role removed from a theme; a pair of Field below `7`; a status icon of Field night below `3`; a colour literal planted in a component; an `Icon` without `aria-hidden`; a disclosure that shows a chevron-right; the brackets with `pointer-events: auto`; `applyTheme` writing a `<style>`; Instrument's `okInk` changed; the readout card's numeral at `28`; an icon placed beside the numeral. Report: the changed files, the baseline and final counts, the output files, the result of the spike of 35.1, the install record of 35.4, the arithmetic of 35.7, every existing assertion that was changed and why. **Stop for review.** Device checks 12 and 13 are run on Vigia at the end of its task groups.
