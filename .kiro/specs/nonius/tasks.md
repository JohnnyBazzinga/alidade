# Implementation Plan: nonius

Package: `apps/nonius` (`@alidade/nonius`). Source of truth: `requirements.md` and `design.md` in this folder. `D7`, `§7.3` point into `design.md`; `Req N.M` into `requirements.md`; `Core Req`, `Sensors Req`, `UI Req`, `Vigia Req` into those specifications. The skeleton is used only through its three `src/index.ts` files. **Skeleton-ui task group 32** (`DeviceSighting` takes `kind`) is built and checked before task group 9 starts. Task group 11 (the best time) is the last group and may be cut on the lead's word; task group 12 runs either way.

## Working rules for every task

Vigia's working rules (`.kiro/specs/vigia/tasks.md`, "Working rules for every task") hold here word for word, with `nonius` for `vigia`, `NoniusParameters` for `VigiaParameters`, and `/tmp/nonius-<task>-<n>.txt` for the output files. In short, and in addition:

- `math-conventions.md`, `tech.md` and `testing.md` are binding. **pnpm only**, exact versions, no `any`, no `!` in `math/`, no watch mode, **no dev server**, `timeout` in front of every test run, **no `pkill`**, **no commit**.
- **Tests first** in every task: the tests of a sub-task are written before its code and are seen to fail (the report names the failing run's file).
- **A failing property or example means stop**: decide whether the code, the property or the requirement is wrong, say which, with the evidence. Never weaken a tolerance, narrow a generator, delete an assertion or lengthen a time limit. Keep the seed and counterexample of every failure; a shrunk counterexample becomes an example test before the fix. The standing rule for limits (skeleton-ui D26) is the only allowed move of a generator's domain, and each use is reported.
- **Repeat nothing the skeleton owns**: Core's `OUTLIER_STUDENTISED_RESIDUAL`, `POOR_GEOMETRY_CROSSING_RAD`, `CONFIDENCE_95_SCALE`, `ellipse95`, `ellipseFromCovariance`; Sensors' `UNCALIBRATED_ALTITUDE`, `declinationAt`, `selectWindow`, `summariseAzimuths`, `applyYawReference`; UI's `fixFeatures`, `sceneFromOffsets`, `scriptForStation`, `CATALOGUE_ORIGIN`, `CATALOGUE_CALIBRATION`. If a needed function is not exported, stop and ask. Nothing of Nonius's goes into `skeleton/`.
- **The one new dependency** is `astronomy-engine` `2.1.19` (task 1.3), imported by `src/math/sun/sun-wrapper.ts` alone. Any other dependency, version, peer or engine warning: stop and ask.
- Every public function of the Math layer and the Adapter is total and goes into the hostile registry of P-2.6 in the task that adds it. Every non-test source file goes into the fixed file list of `purity.test.ts` in the task that adds it.
- Fixtures are read-only and, except the published values of Req 3.4 and 4.10, synthetic (positions from `CATALOGUE_ORIGIN`). **`notes/` is private: never read it.**
- Do not edit `requirements.md`, `design.md` or anything under `skeleton/`; if a change there seems needed, stop and report. Numbers the design asks a task to measure go into that task's report, and the lead records them.
- Each task ends with `pnpm --filter @alidade/nonius test` and `pnpm typecheck` passing for what it touched, and `pnpm lint` and `pnpm format:check` from the root.
- **Checkpoints** first run `pnpm --filter @alidade/nonius test:deep` for the properties they name and report, for each: cases run, discards, the worst error against its tolerance, milliseconds a case (against the design's estimate), every counter and share, every use of the standing rule for limits. Then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` from the root.
- **Stops for review: checkpoint 7 (the mathematics) and checkpoint 12 (the end)**, and at any failing property.

## Tasks

- [x] 1. Scaffold the package (design §2, §12; D1, D23)
  - [x] 1.1 Create `apps/nonius` as Vigia's task 1.1 did, without the new dependency: `package.json` (name `@alidade/nonius`, `private`, `type: module`, scripts `test`, `test:deep`, `typecheck`, `build`, `dev` never run by a task; the skeleton as `workspace:*`; `react`, `react-dom`, `maplibre-gl` and every dev dependency at the versions of `apps/vigia/package.json`); `tsconfig.json`; `vite.config.ts` (`base: './'`); `index.html` with `<meta name="referrer" content="strict-origin">`; `.env.example` with `VITE_TILE_URL_TEMPLATE=`, `VITE_TILE_ATTRIBUTION=`, `VITE_TILE_SOURCE_NAME=`, `VITE_TILE_TERMS_URL=` and no values, with Vigia's comments; `vitest.config.ts` with the projects `math`, `adapters` (`node`) and `components` (`jsdom`) and `provide: { propertyRuns: 200 }`; `vitest.deep.config.ts` for the `*.property.test.ts` files; a README with its title and the build commands.
    - _Requirements: 1.1, 1.11, 9.6_
  - [x] 1.2 Smoke tests of the assumptions, each a throwaway file: `inject('propertyRuns')` in each project; a component renders under jsdom; `import.meta.glob` with `?raw` in `math`; `@alidade/ui`'s `index.ts` loads in Node and `DeviceSighting`, `OUTLIER_STUDENTISED_RESIDUAL`, `UNCALIBRATED_ALTITUDE`, `fixFeatures`, `CONFIDENCE_95_SCALE` resolve. Report, delete the files, stop on a mismatch.
    - _Requirements: 1.1, 1.11_
  - [x] 1.3 Install `astronomy-engine`: from `apps/nonius`, `pnpm add -E astronomy-engine@2.1.19`. Record `pnpm view astronomy-engine time --json` for that version (2023-12-14), `pnpm view astronomy-engine@2.1.19 dependencies` (none), the diff of `package.json` and `pnpm-lock.yaml`, and that nothing else was added. One throwaway test in the `math` project: `new AstroTime(0)` and `SiderealTime` load and return finite numbers in Node; delete it.
    - _Requirements: 1.1, 3.1_
  - [x] 1.4 Test support, copied in pattern from Vigia's `src/test-support/` (design §13): `fast-check-setup.ts`, `property-report.ts`, `deep-same.ts`, `fake-timer.ts`, `seeded-normal.ts`, `hostile.ts`, `fake-maplibre.ts`, `render-screen.tsx`, `source-views.ts`, each with its own small test that fails when the helper is vacuous.
    - _Requirements: 1.11, 2.6_
  - [x] 1.5 The ESLint block for `apps/nonius/**` in the root `eslint.config.js`, as Vigia's task 1.5 (no `any`; the two `react-hooks` rules; no `!` in `src/**/math/**`), confirmed by throwaway files. The only edit outside `apps/nonius`.
    - _Requirements: 1.8_
  - [x] 1.6 `purity.test.ts` with an empty file list and the rules of design §12, each proved against a probe; `src/math/sphere/earth.ts` (`EARTH_RADIUS_M`) with its test against Core's `greatCircleDistanceM` over one radian of the equator, within `1e-6 m` (D23).
    - _Requirements: 1.1 to 1.5, 1.7, 3.1_

- [x] 2. Results, reasons, messages, parameters (D2, D21; design §8.1)
  - [x] 2.1 Tests first: `reasons.test.ts` (the 11 of Req 2.2, `NoniusReason` covers every `UI_REASONS` entry and nothing else); `messages.test.ts` (every reason has both parts, UI's message rules, the six Core reasons for Sights give Nonius's words, the rows of design §8.1); `parameters.test.ts` (every constant of Req 14.1 with its value, `checkParameters` for each rule of Req 14.3 at and either side of its limit, naming the field); `degrees.test.ts`; `civil-time.test.ts` (UTC clock and date text, ages, waits rounded up to the step); the hostile registry with its completeness test.
    - _Requirements: 2.1 to 2.6, 14.1 to 14.3, 1.7_
  - [x] 2.2 Code: `result.ts`, `reasons.ts`, `defaults.ts`, `math/parameters.ts`, `math/messages.ts`, `math/degrees.ts`, `math/civil-time.ts`.
    - _Requirements: 2.1 to 2.6, 14.1 to 14.3_

- [x] 3. The Sun wrapper and refraction (D3, D4; design §6.1, §6.2)
  - [x] 3.1 The published fixture `fixtures/sun-published.json`: Meeus Examples 25.a, 12.a and 12.b, at least 12 Nautical Almanac or USNO values of the Sun's GHA and declination (one a month, two years or more between 2000 and 2049), and the standard refraction at `5°`, `10°`, `20°`, `45°`, `80°`, each row with its source, page or address and retrieval date, and a checksum in the test. If a source cannot be read by the builder, **stop and ask the lead for the values**; never take a value from the library under test or from memory.
    - _Requirements: 3.4, 4.10_
  - [x] 3.2 Tests first: `sun-wrapper.test.ts` (every fixture row within `1.0′` of declination and `1.5′` of GHA or right ascension, sidereal time within `0.1 s` of the apparent value printed; the range limits of Req 3.2 at and either side; a library failure becomes `sight_time_unsupported`); P-3.6 and P-3.7; `refraction.test.ts` (the fixture within `0.1′`; `invalid_number` outside `[−1°, 90°]`); P-4.11; the purity rule that only this module imports the library.
    - _Requirements: 3.1 to 3.7, 4.7, 4.10, 4.11_
  - [x] 3.3 Code: `math/sun/sun-wrapper.ts`, `math/sun/refraction.ts`, `math/sun/sun-at.ts`. Report the worst error at each fixture row.
    - _Requirements: 3.1 to 3.7, 4.7_

- [x] 4. Sights, the Sun side and the Index error (D5, D6; design §6.3, §7.4)
  - [x] 4.1 Tests first: `sight.test.ts` (the time is the middle of the window; each refusal of Req 4.8 on the corrected altitude; ids unique with `-2`, `-3`); P-4.12; `sun-side.test.ts` with Frozen sightings made from the Simulator through UI's `step` (an Absolute frame gives `magnetic` and the scripted azimuth less the Declination; a Relative frame with a Yaw reference gives its reference; a Relative frame without one gives `null`; a Mark's Ray offset is used); `prepare.test.ts` (set aside out of the limits with its cause; σi and σc; the Subsolar point from the wrapper); P-15.8 and the refusals of Req 15.4 (`index_error_implausible` at and either side of `MAX_INDEX_ERROR_RAD`), and that the result holds no Position.
    - _Requirements: 4.4, 4.5, 4.6, 4.8, 4.12, 15.3, 15.4, 15.8_
  - [x] 4.2 Code: `math/sight/sight.ts`, `sun-side.ts`, `prepare.ts`, `index-error.ts`.
    - _Requirements: 4.4 to 4.8, 4.12, 15.3 to 15.5_

- [x] 5. The model, the Candidates, the re-centred solve and the shared error (D7 to D11; design §6.4, §7.1 to §7.3)
  - [x] 5.1 Tests first: `circle-crossings.test.ts` (two, one where they touch, none, the same centre; each crossing at its radius from both centres within `1e-9` rad); `candidates.test.ts` (the pair of largest Angle of cut, the tie by ids, `circles_do_not_meet`); `altitude-model.test.ts` (`validate` field by field, `geometryCheck` at `0.5°` and `20°` either side, `out_of_range` beyond `PLANE_LIMIT_M`, never `diverging_bearings` or `colocated_observers`); P-5.8, P-5.9; `recentred-solve.test.ts` (at least two calls, stops within the tolerance, `not_converged` after the rounds, a start whose solution lies beyond 1 000 km gives `out_of_range`); `test-support/linear-model.ts` and P-7.9; P-5.10; P-7.7.
    - _Requirements: 2.7, 5.1 to 5.11, 6.2, 7.1, 7.2, 7.7 to 7.9_
  - [x] 5.2 Code: `math/sphere/circle-crossings.ts`, `math/fix/candidates.ts`, `altitude-model.ts`, `recentred-solve.ts`, `shared-error.ts`, `solve-candidate.ts`.
    - _Requirements: 5, 6.2, 7.1, 7.2, 7.5, 7.8_
  - [x] 5.3 Mutation checks: the term `σc² g gᵀ` removed (P-7.9 fails); the plane limit removed from `evaluate` (the `out_of_range` example fails); partials with a sign error (P-5.8 and P-5.10 fail). Restore and show the empty `git diff`.

- [x] 6. The choice, the checks, the class, the advice, and the statistical tests (D10, D12, D13, D15, D22; design §7.5, §7.6)
  - [x] 6.1 Tests first: `assess.test.ts` (each `Assessment` kind; the ladder Sun side, fit, Two places; `single` when both converge together; `other_failed` with and without the compass's disagreement; the user's choice applied only for its used set and cleared by a change; the three cases of Req 6.11; the reasons why of design §7.5.2); P-6.9, P-6.10; `statements.test.ts` (each count; the three-Sight disagreement, with no Sight named); `geometry-class.test.ts`; `advice.test.ts` (a wait, `not_today`, the sentence with two and three Sights) and P-10.2; the rule of thumb's sentence and the counter P-10.7.
    - _Requirements: 6.1 to 6.11, 7.4 to 7.6, 8.1 to 8.4, 10.1, 10.2, 10.7_
  - [x] 6.2 Code: `math/fix/sun-side-check.ts`, `assess.ts`, `statements.ts`, `geometry-class.ts`, `advice.ts`.
    - _Requirements: 6, 8.1 to 8.4, 10.1, 10.2, 10.7_
  - [x] 6.3 The harness and the statistical tests, tests only: `test-support/run-harness.ts` (D22: one pass gives the coverage of Req 7.3 and the false alarms of Req 8.5, by band and count, every failure reason and the Two places counted); P-7.3, P-8.5, P-8.6 with the seed an argument, bounds applied in `test:deep` and reported in `pnpm test`. Run `test:deep` for them once and report every share; a share outside a bound stops the work here.
    - _Requirements: 7.3, 8.5, 8.6_
  - [x] 6.4 Mutation checks: the check solve with σi alone (P-8.5 fails in the `3.5°` band); the Sun side's test inverted (P-6.9 fails); the Index error as a difference of geometric altitudes (P-15.8 fails). Restore.

- [x] 7. Checkpoint: the mathematics (stops for review)
  - Run `test:deep` for P-3.6, P-3.7, P-4.11, P-4.12, P-5.8 to P-5.10, P-6.9, P-6.10, P-7.3, P-7.7, P-7.9, P-8.5, P-8.6, P-10.2, P-10.7, P-15.8, and the root checks. Report as the working rules say, with: the worst fixture error of task 3; the coverage and false-alarm shares by band, count and Geometry class; the share of runs ending in Two places and in each failure; the measured time of the deep harness against design D22's 40 s. **Stop for the lead's review.**

- [x] 8. The words, the map model, the Comparison and the state (D13, D14, D16, D18; design §5, §7.7, §7.8, §8)
  - [x] 8.1 Tests first: `format.test.ts` (rounding up at 10 km and 100 km, nautical miles, decimals by the semi-minor axis, `calibrationText` with and without an Index error and when old); `fix-words.test.ts` (the order of design §8.2; the uncalibrated words before the position; forbidden words; each `Choice` sentence; Two places' words with A and B; the one-Sight circle) and P-9.8; `circle-arc.test.ts` and P-9.9; `map-model.test.ts` (at most five layers; the Fix only as `fix`; Two places as renamed `fixFeatures` features with the same geometry and no `fix`; the GPS marker; the set-aside arcs apart); `comparison.test.ts` and P-11.6; `apply-action.test.ts`, `storage-format.test.ts` (corrupt, foreign, newer version, a bad Sight dropped, no Position anywhere) and P-12.7.
    - _Requirements: 6.7, 8.2, 9.1 to 9.5, 9.7 to 9.9, 11.3, 11.4, 11.6, 12.1 to 12.7, 15.5_
  - [x] 8.2 Code: `math/fix/format.ts`, `fix-words.ts`, `map-model.ts`, `comparison.ts`, `math/sphere/circle-arc.ts`, `math/state/`.
    - _Requirements: 9, 11.3, 11.4, 12_

- [x] 9. The Adapter and the screens (D17 to D19; design §9). Starts after skeleton-ui task group 32 is built and checked.
  - [x] 9.1 Tests first: `adapters/storage.test.ts` (Vigia's cases: unavailable, a throwing `setItem`, the backup written once, the two keys); `components/ask-location.test.ts` with a recording Sensor source (one `startPosition` per call, `stop()` after a fix and after a failure, `coarse_location` beyond `LOCATION_COARSE_LIMIT_M`); `store.test.tsx` (saves after each saving action, the memory-only parts never saved).
    - _Requirements: 1.3, 1.4, 11.2, 12.1, 12.6, 15.2_
  - [x] 9.2 Code: `adapters/storage.ts`, `components/ask-location.ts`, `components/environment.ts`, `components/store.ts`, `look.ts`, `PrimaryAction.tsx`, `TabBar.tsx`, copied in pattern from Vigia.
    - _Requirements: 1.10, 12_
  - [x] 9.3 Tests first, the screens in jsdom against fakes: `FixScreen.test.tsx` (each Assessment kind; I am near A, I am near B, Undo; Compare shown only with a Shown Fix, one `startPosition` per tap, the result's words, the marker; the Calibration line and the uncalibrated words before the position); `SightsScreen.test.tsx` (delete, start again keeps the Index error, remove the Index error, causes shown); `MapScreen.test.tsx` (the fake map gets the Fix only through `setFix`, Two places through layers, the tile source's terms); `SightScreen.test.tsx` (`DeviceSighting` with `kind: 'altitude'`; `startPosition` never called; the guidance; the Sun side recorded from the Frozen sighting; each refusal's Message); `IndexErrorScreen.test.tsx` (the location asked once only on the act, each `dₖ` shown, Save stores and drops the location, Cancel drops everything, no Position in the store's state after either); `HowItWorks.test.tsx`; each Nonius reason shown once through `messageFor`.
    - _Requirements: 4.1 to 4.3, 4.9, 6.7, 9.3 to 9.7, 10.1, 10.2, 10.7, 11.1 to 11.5, 12.3, 12.4, 15.1 to 15.6, 15.9_
  - [x] 9.4 Code: `components/FixScreen.tsx`, `SightsScreen.tsx`, `MapScreen.tsx`, `SightScreen.tsx`, `IndexErrorScreen.tsx`, `HowItWorks.tsx`, `App.tsx`, `main.tsx`, `system.ts`.
    - _Requirements: as 9.3_

- [x] 10. Simulation and the reviewer's path (D20; design §10)
  - [x] 10.1 Tests first: `sun-scenes.test.ts` (every scene and Sight time passes `checkScene` and the Simulator's script validation; the Sun's direction is `sunAt(truth, tₖ)` within `1e-12` rad; each script starts `500 ms` before its Sight time with the Declination of `declinationAt`; the scene's Index error is marked simulated); `SimulationShell.test.tsx` (the banner and the phone bar on every screen; Next sight time changes the scene and the Station; the note on the still Sun; the Comparison and the Index error use the truth and ask no source); `SimulationShell.integration.test.tsx`: each scene of design §10 to its expected end, and the noise-free copy of scene (a) of Req 13.6; a recording network check that no request is made with no Tile source.
    - _Requirements: 13.1 to 13.7, 11.5, 15.7_
  - [x] 10.2 Code: `math/scenes/sun-scenes.ts`, `components/simulation/`. Report each scene's numbers (95 % axes, Geometry class, Studentised residuals of (c), the added error of (c) and the times of (b) if the rule of design §10 moved them) for the lead to record in design §10.
    - _Requirements: 13.2, 13.3_
  - [x] 10.3 The README (Req 13.8) and its test of the sections; the "How it works" text checked against Req 4.7 and 12.2.
    - _Requirements: 13.8, 4.7, 12.2_

- [-] 11. The best time: **cut from this release by the lead's decision of 2026-11-21** (Req 10.3 to 10.6 and P-10.6 are not built; design §7.6's best-time paragraph is left for a later release)
  - [ ] 11.1 Tests first: `best-time.test.ts` (a named time; none in the horizon, with its reason; the hypothetical Sight never in the state, the map or the storage) and P-10.6 (50 cases in `pnpm test`, 200 in `test:deep`).
    - _Requirements: 10.3 to 10.6_
  - [ ] 11.2 Code: `math/fix/best-time.ts`, its sentence in `fix-words.ts` and on the Fix screen.
    - _Requirements: 10.3 to 10.6_

- [ ] 12. Final checkpoint (stops for review)
  - `test:deep` for every property of design §11, then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` from the root, and one `pnpm --filter @alidade/nonius build`: report the built size, and the share of `astronomy-engine` in it against design §2's 48.8 kB minified. One mutation check per screen file named in task 9.4 (a removed guard), each failing a test. Report as the working rules say, with every share of the statistical tests again and whether group 11 was built. **Stop for the lead's review.**

- [x] 13. Screens after the lead's review (2026-11-21; the lead walked the built page at 390 × 844 CSS px in a headless browser). Tests first where a test can hold it (arithmetic of heights, the fake map's fit, the order of elements). Task group 12 follows this group.
  - [x] 13.1 **A. The simulation block is compact.** `sim-block-height.test.tsx`: the banner in at most two lines at 320 px, the bar in one row that does not wrap (scene chooser, sight-time chooser, a short **Next** whose accessible name stays "Next sight time"), banner and bar together at most 140 px at 390 px (by the arithmetic: 117.8 px); the still-Sun note and the full Sight time ("Sight time 1 of 3: 11:40 UTC, 21 Dec 2026 (simulated)") move to the Sight screen's scrolling part (`SightTimeNote`, after the panel). `NoniusScene` gets `shortName` (at most 12 characters).
    - _Requirements: 13.1, 13.3, 1.10_
  - [x] 13.2 **B. The Sight screen's first screen.** `sight-first-screen.test.tsx` (Vigia's arithmetic, with the primary-action row counted): after Start, the title, image, readout and control bar end at 743 px of 844; in Simulation mode the pane comes first and the Calibration line and guidance after it (on a phone the safety words stay first). The app's bar is the one scene chooser: **skeleton-ui task group 33** adds `hideSceneChooser` to the Simulator panel.
    - _Requirements: 1.10, 4.1, 4.2, 13.4_
  - [x] 13.3 **C. The map fits what it draws.** Cause: UI's `MapView` fits only when it has observers or a layer that says `fit: true`, and Nonius has neither. `mapModel` sets `fit: true` on `circles-used`, `places-area` and `gps` when they hold something (an empty layer would make the fit fail on a map that draws nothing); the skeleton keeps the bottom margin for the attribution. Tests in `MapScreen.test.tsx`: the fitted bounds contain the ellipse, the arcs and the marker, the ellipse spans a third of the width or more, the bottom padding is larger than the top, no fit and no failure when nothing is drawn, and Two places too far apart for one map say so (Req 9.5). Scene (a)'s bounds: 28.34° to 31.85° N, 42.90° to 37.10° W.
    - _Requirements: 9.4, 9.5, 11.4_
  - [x] 13.4 **D. The mode control is at the end of the Fix screen**, after it (`App.test.tsx`).
    - _Requirements: 13.1_

