# Design Document — `skeleton-ui`

## 1. Context and scope

`skeleton/ui` (`@alidade/ui`) puts a sighting on screen for both apps: the camera image, the geometry from a tap to a direction, the sighting session from a Sensor source to one capture, plain-language messages, the reticle and readouts, the map, the Simulator panel with its synthetic scene, and a playground page. `requirements.md` in this folder is the source of truth; `Req N.M` points into it, `D<n>` into Section 4, `§` into this document, and `F<n>` into the flags of Section 11.

**Review of 2026-11-18.** Every flag of the first design (F1 to F12) was accepted and the requirements amended; Section 11 records what each became, and lists what I found since. Three of your decisions changed the design's shape: the UI holds **no rotation matrix** (it uses Sensors' inverse of the Off-axis ray and the true Device rotation of the Simulator, D14); it repeats **none of Sensors' rules** (the window, the summaries, the invalidation rule and the reasons list are Sensors' exports, D8, D2, §7.6, §7.8); and **every dependency is at least 14 days old** (§3, Req 20.6). Nothing in this design is provisional except the assumptions about the libraries that §3 lists as unverified, which task 1 checks.

**Changes outside the package** (all done and verified, except the root lint):
- *Sensors*, task groups 19 and 20 of skeleton-sensors: `truePose()`, `trueRotation()` and `aim()` on `SimulatorControls`; `TruePose` exported; `rayOffsetOfDirection`; `selectWindow`, `resetBetween`, `summariseAzimuths`, `summariseAltitudes`, `invalidates`, `SENSOR_REASONS` exported, the two summaries made total first.
- *Core*: none.
- *Repository root*: `eslint.config.js` gains the React hooks rules for `skeleton/ui/**` (D21); the root `package.json` gains `eslint-plugin-react-hooks` (§3); `.gitignore` already ignores `.env*` except `.env.example` and `dist/`.

**Not designed here** (Req out of scope): the solver (the Playground calls Core's `solve`), the Sun's position, glare detection, a field-of-view procedure, landscape, accounts.

## 2. Conventions adherence

- **Units.** Every numeric name carries its suffix (`Rad`, `M`, `Ms`, `UtcMs`, `Px`, `SourcePx`; the last two are in the table of `math-conventions.md`). Positions are `{ latRad, lonRad }`. Pixel points are `{ xPx, yPx }`, sizes `{ widthPx, heightPx }`.
- **Degrees.** One module, `math/degrees.ts`, holds the conversions. It exports `fromDeg(x): number` and `toDeg(x): number` (Core's `degToRad` and `radToDeg`, unwrapped from their Results for finite arguments, with `NaN` passed on for a non-finite one). The constants of Req 19 are written `fromDeg(0.5)`: a literal in degrees appears only as the argument of `fromDeg`, and no other module contains `Math.PI / 180` or `180 / Math.PI`. This is how I read Req 1.10 (F11). The GeoJSON module calls Core's `radToDeg` directly (Req 14.1).
- **Angles.** Differences by `wrapPi(a - b)`; means by Core's `circularMean`. No azimuth is subtracted directly. Azimuth `[0, 2π)`, altitude `[-π/2, π/2]`.
- **Failures are values.** Every public function returns a `UiResult<T>`; none throws or returns `NaN` or `Infinity` (Req 2.1). `ok` and `err` are internal, as in Sensors, so that `ok(NaN)` cannot be written by a caller.
- **Tolerances** come from the requirements, never from what makes a test pass; a failing property is classified (code, property or requirement) before anything changes.
- **Earth model.** Core's sphere. Nothing in this package computes geodesy except through Core.

## 3. Dependencies

Versions follow Req 20.6: **the newest version of each added package that was published at least 14 days before it is installed.** Today is 2026-11-18 (the machine's clock), so the cutoff is 2026-11-04 03:40 UTC. Publication dates are from `npm view <pkg> time --json`. Installs are by `pnpm`, one at a time, each approved by hand (task 1). Existing pins stay as they are. **Nothing has been installed**: everything marked *unverified* is checked by task 1 in a smoke test before any other code is written, and a mismatch is reported, not worked around.

| Package | Where | Version | Published | Newest on the registry | Why | Check |
|---|---|---|---|---|---|---|
| `@alidade/core`, `@alidade/sensors` | ui `dependencies` | `workspace:*` | | | the two packages the UI builds on | none |
| `react` | ui `dependencies` | `19.3.1` | 2026-10-14 | `19.3.1` (the `latest` tag) | UI library of `tech.md` | registry |
| `react-dom` | ui `dependencies` | `19.3.1` | 2026-10-14 | `19.3.1` | pairs with `react`; peers `react ^19.3.1` | registry |
| `maplibre-gl` | ui `dependencies` | `6.16.0` | 2026-10-25 | `6.19.0` (2026-11-17, too new) | map library of `tech.md`; Map adapter only, by dynamic import. Node `>=16.14` | registry; *unverified*: its `Map` constructor API (§7.11) and that it throws, not emits, when WebGL is missing |
| `@types/react` | ui `devDependencies` | `19.3.0` | 2026-09-09 | `19.3.0` | `strict` typing of the components | *unverified* with `typescript 6.0.3` |
| `@types/react-dom` | ui `devDependencies` | `19.3.0` | 2026-09-09 | `19.3.0` | idem | idem |
| `jsdom` | ui `devDependencies` | `30.1.3` | 2026-10-15 | `31.0.1` (2026-11-13, too new) | the simulated DOM (D20). Node `^22.22.2 \|\| ^24.15.0 \|\| >=26`: the machine has 24.21.0 | registry; vitest `5.1.0` lists `jsdom` as a peer `*` |
| `@testing-library/react` | ui `devDependencies` | `16.3.3` | 2026-08-27 | `16.3.3` | renders a component and finds what it shows by role and text | registry; peers `react`, `react-dom` `^18 \|\| ^19`, `@types/*`, `@testing-library/dom ^10` |
| `@testing-library/dom` | ui `devDependencies` | `10.4.2` | 2026-09-13 | `10.4.2` | the peer of the line above (Req 20.2 now lists it) | registry |
| `vite` | ui `devDependencies` | `8.3.8` | existing pin | | the Playground's build, as in Sensors (Req 20.4) | none |
| `eslint-plugin-react-hooks` | **root** `devDependencies` | `7.1.1` | 2026-04-17 | `7.1.1` | lint of hook rules; peer `eslint` includes `^10`, the root has `10.15.0` | registry; *unverified*: its flat-config export name, which is why D21 enables two rules by name |
| `vitest` `5.1.0`, `fast-check` `4.10.2`, `typescript` `6.0.3` | ui `devDependencies` | as in Sensors | existing pins | | Req 20.4 | none |

- **Two packages are one release behind the registry on purpose.** `jsdom` `30.1.3` (the newest is `31.0.1`, published five days ago) and `maplibre-gl` `6.16.0` (the newest is `6.19.0`, published yesterday). I have not looked at what the newer versions changed; the rule is the reason. Each can be raised once it is 14 days old.
- **Req 20.6 covers what the specification adds, not what those packages depend on.** `maplibre-gl` brings 18 dependencies of its own (`pbf`, `earcut`, `gl-matrix`, `zustand`, …) and `jsdom` and Testing Library bring more. pnpm resolves them to the newest versions their ranges allow, and some will be younger than 14 days. If you want the rule to cover them too, pnpm has a minimum release age setting for the whole install; I believe it is `minimumReleaseAge` in `pnpm-workspace.yaml` and I have not checked the name or that pnpm 11.24.0 has it. I would put it in task 1 if you want it, and I have not touched `pnpm-workspace.yaml`.
- **TypeScript.** The registry's latest `typescript` is `7.0.2`. The repository pins `6.0.3` and so does this package (Req 20.4). I did not check `@types/react@19.3.0` against 6.0.3.
- **No JSX plugin.** Vite 8 compiles JSX with its built-in Oxc transform (`oxc.jsx`, documented at vite.dev/config/shared-options). The config sets `oxc: { jsx: { runtime: 'automatic' } }` and `tsconfig` sets `"jsx": "react-jsx"`; task 1 renders one component under Vitest and builds one under Vite to confirm both. If either needs `@vitejs/plugin-react`, I stop and ask, as Req 20.2 requires.
- **Not added:** a state library, CSS framework, component or icon library, geometry or date library (Req 20.3); `@types/geojson` (the GeoJSON types are 25 lines of our own, D12); `happy-dom` (D20).
- **`maplibre-gl` CSS.** The Playground imports `maplibre-gl/dist/maplibre-gl.css` in `playground/main.tsx`. The package's public API does not import CSS; an app that uses the map imports it (documented in the package README of task 21).

## 4. Design decisions

- **D1 — Three layers by folder, three Vitest projects.** The folders are the layers, so a test configuration can enforce them.
  - `src/math/**`: the Math layer, in the Vitest project `math`, environment `node`. A file there that touches `document` fails at run time, which is how Req 1.2 gets its "Node environment with no DOM". `purity.test.ts` scans the imports as well.
  - `src/adapters/**`: the Adapters, project `adapters`, environment `node`: they take fakes, so no DOM is needed. The properties of the Map adapter (P-15.11, P-15.12) are in this project, not in `math`; `test:deep` includes the `*.property.test.ts` files of both projects.
  - `src/components/**` and `playground/**`: project `components`, environment `jsdom`.
  - *Rejected:* one project with a per-file `@vitest-environment` comment (a forgotten comment silently runs a Math test in a DOM); two packages (the layers are one package by the requirements); `happy-dom` (D20).
  - *Unverified:* `projects` with `extends: true` inheriting `provide` from the root. If it does not, each project repeats the one `provide` line. Task 1 settles it.
- **D2 — `UiResult`, `UiReason`, and the list of reasons.** `UiReason = SensorReason | <the 16 of Req 2.2>`. The UI's own sixteen are an object `UI_ONLY_REASONS = { … } as const satisfies Record<UiOnlyReason, true>`, and `UI_REASONS = [...SENSOR_REASONS, ...Object.keys(UI_ONLY_REASONS)]`, with `SENSOR_REASONS` the list Sensors exports (Sensors Req 1.10), itself checked against its type by `satisfies` there. The compiler therefore fails if either list drifts from its union, and the Message table, typed `Record<UiReason, …>`, fails if it lacks a reason (Req 3.2). The run-time test checks that `UI_REASONS` has no duplicate and the same keys as the table. *Rejected:* a hand-written list in the UI (the repetition Sensors 1.10 removes).
- **D3 — The Session is a reducer; effects are data; the driver runs them.** `step(session, event, parameters) → { session, effects }`. An effect is `startOrientation` or `startPositions`, the only two the Session asks for (Req 8.3, 8.13); permission is requested by the driver from the user's gesture (D4), and the Declination by the driver from each Position fix (§7.14). *Rejected:* a class with methods and private state (not frozen, not replayable, not a property-test subject); XState or a state library (Req 20.3, and 6 states do not need one).
- **D4 — The permission request is a driver method, not a Session event.** `driver.requestPermission()` calls `source.requestOrientationPermission()` synchronously, so that it runs inside the user's tap (iOS needs a gesture, Sensors Req 11.2), then dispatches the result as a Session event. The page shows one Start button in every mode; on Android the call returns `not_required` and the Session moves on at once. *Rejected:* requesting on mount (rejected by iOS outside a gesture, which would show `permission_denied` to a user who has not been asked).
- **D5 — Two kinds of Session event, and what happens to an event that fits no transition (Req 8.4, 8.12).**
  - *Action events* are what the user does: `freeze`, `unfreeze`, `mark`, `clearMark`, `capture`, `establishYaw`, `again`, `restart`.
  - *Data events* are what arrives: the permission result, the start result, a sample, a Frame reset, a Position fix, a Declination, the camera state, `tick`.
  - An action event in a state that does not offer it leaves the Session unchanged except for the Notice `action_not_available` (Req 8.4).
  - A data event is never `action_not_available`. A data event that carries a failure and fits no transition records its **own** reason as a Notice (so Req 2.5 holds). A data event that carries no failure and fits no transition (a start result in `live`) is dropped with no Notice: it carries nothing to lose. Samples, Frame resets, fixes and Declinations are applied in every state (Req 8.14 extended to samples, which are harmless in `permission`; `restart` drops the samples).
  - A failure is never dropped, whichever Session it reaches: a position or Declination failure given to an altitude Session is a Notice too. This is Req 8.4 as amended.
- **D6 — The Frozen sighting is a value, built from Sensors' copy-on-write history.** `frozen = { history, window, yawReference, declination, mark, frozenAtUtcMs }`. `history` is the very object the Session held (it is frozen by Sensors), so a Freeze costs no copy, and nothing delivered afterwards can reach it (Req 10.3, 10.8). `restart` and `unfreeze` drop it (Req 10.7).
- **D7 — Image geometry takes the focal length from the displayed image (Req 4.3, 5.2).** `F = (Dₛ / 2) / tan(fovRad / 2)`, with `Dₛ` the displayed width, height or diagonal in CSS pixels along `fovAxis`. The calibration's own image size is used only for the aspect check (Req 4.4). The calibration's own size serves only the aspect check; a size that differs with the same aspect ratio gives the same `F`, which is what Req 5.13 needs.
- **D8 — The Live readout is built from Sensors' primitives, not from `captureBearing`, and it repeats none of their rules.** A readout has no Position fix and shows a magnetic azimuth where `captureBearing` would fail with `declination_unknown`, so it cannot call it. It uses `selectWindow` (the samples of the window), `rayDirection`, `directionAzimuthRad`, `directionApparentAltitudeRad`, `applyYawReference`, `trueAzimuthFromMagnetic`, `resetBetween` and `invalidates` (the Frame reset rules), and `summariseAzimuths` and `summariseAltitudes` (the mean and the Spread, whose `log1p` form is why the UI must not write its own: the direct formula returns noise for a tight set). P-9.9 checks the readout against `captureBearing` and `captureAltitude`. *Rejected:* a dummy Position fix and a call to `captureBearing` (it hides the Spread and the North reference label, and its failures are not readout failures); the UI's own Spread (Sensors 1.10; the first draft's 12 lines would have failed P-9.11 on identical azimuths).
- **D9 — Time enters only as an argument or an injected function.** `Timer = { start(callback, intervalMs): TimerHandle; stop(handle): void }`, repeating. A one-shot is a `start` whose callback calls `stop`. The Map adapter's once-per-second error throttle uses a Timer too, so no component or adapter needs a clock. The only module that calls `setInterval`, `clearInterval` or `Date.now` is `playground/system-timer.ts` (Req 1.5); tests use `FakeTimer`, whose `advance(ms)` runs due callbacks in order.
- **D10 — The Camera adapter takes a surface, not the globals.** `CameraSurface = { isSecureContext, getUserMedia | null }` over structural `MediaStreamLike` and `TrackLike`. `browser-camera-surface.ts`, the one file that names `navigator.mediaDevices`, builds it. `attach(sink)` takes a structural `VideoSink` (`srcObject`, `play`, `pause`, `videoWidth`, `videoHeight`, `addEventListener`), which an `HTMLVideoElement` satisfies, so the adapter holds the only reference to the `MediaStream` (Req 1.4, 7.10) and the component never touches it.
- **D11 — Freezing the image is `pause()`; the canvas is a fallback decided by Device check 4.** `CameraImage` calls `sink.pause()` on `frozen` and `play()` on leaving it. For the Scene image, the parent keeps the pose read at the Freeze and passes that instead of the live one. *Rejected for now:* drawing the frame to a canvas on every Freeze (an extra buffer copy on a phone for a problem not yet seen).
- **D12 — The map is declared once; the adapter only sets data.** `buildMapStyle(tileSource)` returns the whole style, with four GeoJSON sources (`observers`, `wedges`, `bearings`, `fix`; D27.5), their layers in draw order, and an optional raster source. The adapter calls `getSource(id).setData(collection)`. Before the style has loaded the latest collections are held and written on `load`, so Req 15.12 (last arguments win) holds whatever the order. The `fix` and `fix-ellipse` layers are fed by **one** source, `fix`, filtered by `kind` in the layers (`['==', ['get', 'kind'], 'fix']`), so that a Point and its ellipse are one `setData` (Req 15.6). *Rejected:* adding and removing layers per call (flicker, and a window in which only one of the pair exists); text layers (they need a glyph server, Req 15.4); `@types/geojson` (25 lines of our own types).
- **D13 — A Fix cannot be drawn without its ellipse because of the types.** `fixFeatures(fix, vertexCount)` is the only producer of a `FixFeatureCollection`, an interface with a brand field the adapter's `setFix` is the only consumer of; `setFix(fix: Fix)` calls `fixFeatures` itself. There is no function that takes a `Position` and draws a fix. The brand is a compile-time device; the run-time guarantee is P-15.11.
- **D14 — The synthetic scene is projected with Sensors' inverse of the Off-axis ray; the UI has no rotation matrix.** `projectScene(scene, station, trueRotation, layout)` takes the true Device rotation from `controls.trueRotation()` (Sensors 12.12). For each Target it computes the East-North-Up direction with `targetDirection`, asks `rayOffsetOfDirection(trueRotation, direction)` (Sensors 3.10), and turns the Ray offset into a Pixel point with `rayOffsetToPoint` (Req 5.3); `null` from Sensors is "not visible". The horizon is the line through the Pixel points of two directions at altitude `0`, found the same way (§7.13). *Rejected:* a UI-side `Rᵀ · d` (Req 16.4 forbids a rotation matrix of its own, and a second copy could drift); a shadow Simulator per frame to read a sample; exporting `rotationMatrix`.
- **D15 — The Simulator panel's time is a count, not a clock.** `PanelState` holds `elapsedSimMs`. A tick adds `tickMs × speed`; `advanceTo(startUtcMs + elapsedSimMs)`, split into steps of at most `MAX_SIMULATOR_ADVANCE_MS`. Floating-point sums of `0.25 × 100` are exact, and the property bounds the rest (Req 17.8). The panel reads no clock because it has none to read.
- **D16 — The catalogue is generated, not typed.** Scenes are built by `buildCatalogue()` from one origin, `{ 30° N, 40° W }` (Open question 10), by offsets in metres through Core's `unprojectToLocalPlane`. For each Station the script's `declinationRad` is `declinationAt(station, startUtcMs)` (Sensors), so that an app using `declinationAt` recovers the scripted true azimuth (Sensors' note on `declinationRad`); the script starts at `1 790 000 000 000` ms (2026-09-21), inside the WMM2025 validity window, and the origin is not in the blackout zone. A test checks both.
- **D17 — Styles are inline objects built from constants, so that jsdom can read them; the look is an instrument's (§7.18).** jsdom does no layout, so Req 13.1, 13.3 and 13.7 are checked on the `style` attributes the components set (Req 13.12). Colours, sizes, spacing and the font stack come from `components/theme.ts`, which also defines the palette and its pairs (Req 13.2). The visual direction is near-black slate surfaces, one brass accent, off-white tabular numerals in the system monospace stack, and thin ruled lines; tokens and their contrast ratios are in §7.18. The Playground has one small stylesheet for the page chrome; the package has none. *Rejected:* a CSS framework (Req 20.3), CSS modules (a build step the Vitest projects would have to mimic, with no gain for 14 components), a web font (it would be a network request, and the system stack is what an instrument on a phone should use).
- **D18 — Messages are one table keyed by reason, with a function for the few that carry a number.** `MESSAGES: Record<UiReason, MessageSource>` where `MessageSource = Message | ((failure) => Message)`. Only `coarse_location` is a function (Req 3.4). A second table, `MUST_MENTION: Partial<Record<UiReason, readonly RegExp[]>>`, lists, for the reasons of Req 3.7, the words that must appear (for camera reasons `/camera/i`, for `insecure_context` `/https|secure|address/i`, …); the test fails if a reason of Req 3.7 has none.
- **D19 — The Playground builds with `vite build`, which exits; no task runs a dev server.** `package.json` scripts: `dev` (`vite --config playground/vite.config.ts`, for people), `build:playground` (`vite build --config playground/vite.config.ts`, which writes `playground/dist/`, ignored by the root `.gitignore`'s `dist/` rule). Checkpoints run `build:playground` once and read its exit code. `vite preview` is not used. No task runs `dev`, and no config sets `server.watch`.
- **D20 — jsdom, not happy-dom; Testing Library without `user-event`.** jsdom is the more complete DOM (events, `getComputedStyle`, `SVGElement`), and a wrong DOM would make the component tests lie; its cost is start-up time, which is paid once per project. Events are fired with `fireEvent` and `act` from `@testing-library/react`; `@testing-library/user-event` is not added (Req 20.3). `ResizeObserver` is absent from jsdom, so size observation is injected (D22). The fast-check setup (`test-support/fast-check-setup.ts`, 30 lines) is copied from Sensors, because test support is not exported across packages and a shared test package would be a fourth package that `structure.md` does not allow.
- **D21 — React hooks lint by two named rules.** The root config enables `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` as errors for `skeleton/ui/**/*.{ts,tsx}`, registering the plugin object under `react-hooks`. v7's `recommended` preset adds compiler rules whose names and noise I have not seen; two named rules cannot surprise. If the plugin's flat export does not register under that name, task 1 says so and I ask. `no-explicit-any` is an error for this package too (Req 1.8).
- **D22 — Pointers and sizes are injected into the one component that needs them.** `ImageSurface` renders a `div` that holds the image (camera or scene), listens to `pointerdown`, `pointermove`, `pointerup`, `pointercancel` and `keydown`, and reads its size from a `useElementSize(ref, observe)` hook whose `observe` defaults to a `ResizeObserver` wrapper in `components/dom-size.ts` and is a prop in tests. A tap's Pixel point is `clientX - rect.left`; tests stub `getBoundingClientRect` on the element. While the Session is not `frozen`, a drag aims (cumulative deltas through `aimAfterDrag`), and arrow keys aim in `1°` steps; while `frozen`, a `pointerup` is a Mark at its position, so a finger that lands and slides before lifting marks where it lifts (Req 17.11 forbids the drag from aiming, not from moving the Mark). Aiming exists only in simulator mode, where `ImageSurface` receives `onAim`; with the camera it receives none.
- **D23 — The Notice (Req 8.7).** `Notice = { reason, field?, id?, reportedAccuracyM?, errorName?, atUtcMs }`, held in `session.notice`, one at a time; `atUtcMs` is the Session's time (Req 8.16) and a non-finite `reportedAccuracyM` is left out (Req 8.8). A refused event replaces it. It is cleared by the next action event or state transition that succeeds. A sample, Frame reset, Position fix, Declination or `tick` that succeeds neither sets nor clears it, so that a Notice is not wiped by the samples that arrive many times a second.
- **D25 — Differences found while implementing tasks 1 to 7, all accepted at checkpoint 8's review.**
  1. `contrastRatio` and `relativeLuminance` return `UiResult<number>`, not a bare `number` (a hostile channel would otherwise give `NaN`, Req 2.1).
  2. `tsconfig.json` also includes `../sensors/src/magvar.d.ts`: UI's typecheck compiles Sensors' source, which imports `magvar`, whose declaration is a file of Sensors'. Neither Core nor Sensors changed.
  3. Two named constants beyond Req 19.1, `SCREEN_ANGLE_TOLERANCE_RAD` and `MAX_MARK_ALTITUDE_RAD`, because the Session parameters use them.
  4. `formatAzimuthDeg` and `formatSignedDeg` clamp `decimals` to 0 to 4 (a non-finite value is 1).
  5. `parseDegrees` fails with `invalid_number` for a number too long to be finite.
  6. The Message of `coarse_location` shows no number above 10 000 km, or for an accuracy that is not positive.
  7. `offsetOfPixel` (internal) is the unchecked geometry of Req 5.2; `pointToRayOffset` calls it after its checks and P-5.8 calls it for points outside the Element. `pointToRayOffset` returns `+0`, not `-0`, at the centre.
  8. The Map adapter omits `attributionControl` (task 1.5(d): `maplibre-gl` 6.16.0 types it `false | AttributionControlOptions`, not a boolean, and its default adds the control). `GeoJSONSource.setData` returns a `Promise<void>`: the adapter attaches a rejection handler to it, so that a rejected promise reaches the `onError` listeners as `tiles_unavailable` and is never an unhandled rejection (§7.11).
- **D27 — Differences found in tasks 16 to 19, accepted at checkpoint 20.**
  1. Visible means on the image too (Req 16.3 amended): see §7.13.
  2. `permission_denied` is one reason for motion and for location in Sensors (Req 7.6, 11.4), so its Message names both ("Access to motion or location was refused…"); the location-denied scene shows its own failure at capture, `position_unavailable`.
  3. A failed `setFix` clears the earlier Fix (Req 15.6 amended).
  4. `MapLibreLike` is a factory, `createMap(options)`, not a constructor; `maplibre-loader.ts` adapts the real `Map` class to it, and its casts stay in that one file.
  5. Four GeoJSON sources, not five: `observers`, `wedges`, `bearings`, `fix`; the Fix and its ellipse share `fix` (filtered by `kind`), and the adapter splits each Bearing's features into `bearings` and `wedges`.
  6. `createMapAdapter(lib, container, tiles, timer, errorReportIntervalMs = MAP_ERROR_REPORT_INTERVAL_MS)`.
  7. The adapter listens to `error` only, not `sourcedata`.
  8. A GeoJSON source missing after `load` is `map_unavailable` naming the source.
  9. The Tile source check also requires zooms in `[0, 24]` with `minZoom ≤ maxZoom`.
  10. `fixFeatures` itself refuses `semiMinorM > semiMajorM` (Core's `ellipse95` does not check it).
  11. `checkScene` limits the Sun's angular radius to under 45° and its altitude to ±80°.
  12. The compass-jumps scene fails with `too_unsteady` (north set across a 120° jump has a 1-sigma above 45°).
  13. The permission-required scene's failure is reached by starting orientation without asking, outside the driver (the driver always asks, D4).
  14. `panelStep` also returns `recreate`, for a new scene, Station, seed or a restart.
  15. The adapter imports the `Timer` type from `components/timer.ts`.
  16. The test that the map colours equal the theme's copies waits for `theme.ts` (task 22).
- **D26 — The standing rule for limits.** Where a property goes through a function that accepts or refuses at a limit, and a value drawn exactly at the limit can land on the other side by rounding of a few ulps, the property draws at least `1e-6` (in the unit of the limit) inside it for that check, keeps any unchecked form of the same property over the whole closed range, and an example test at the exact limit records what happens there. It is the rule of Req 5.15 and of Sensors 3.11 and 12.7. First use: P-5.8, whose checked inverse refuses `-80°` by one ulp (`2.2e-16` rad) after the round trip. Each use is listed with its measured overshoot in the checkpoint reports. Anything that is not this exact pattern is a failing property to classify, not a case of this rule.
- **D24 — Establishing north in `frozen` (Req 11.1, 10.3).** `establishYaw` from a known azimuth is available in `live` (no Ray offset) and in `frozen` (with the Mark's Ray offset, over the Frozen history and window), because the Sun calibration of Nonius is "freeze, mark the Sun's centre, enter its azimuth". The Mark's Image angular sigma enters the Yaw reference's 1-sigma as `hypot(knownSigma, ε / cos h)`, as in Req 12.3. `establishYaw` from the compass is available in `live` only. Req 11.1 says "the Session's history" and does not mention `frozen`.

## 5. Module layout

```
skeleton/ui/
  package.json                    exports only "."; scripts test, test:deep, typecheck, dev, build:playground
  tsconfig.json                   extends base; lib ES2023 + DOM; jsx react-jsx; include src, playground, configs
  vitest.config.ts                three projects (D1); provide propertyRuns 200
  vitest.deep.config.ts           the *.property.test.ts files of the math and adapters projects; provide propertyRuns
  .env.example                    VITE_TILE_URL_TEMPLATE, VITE_TILE_ATTRIBUTION
  src/
    index.ts                      the public API of §6 only
    result.ts                     UiResult, UiFailure, ok, err                      (internal)
    reasons.ts                    UiReason, UI_REASONS (from Sensors' SENSOR_REASONS and the UI's own sixteen)
    defaults.ts                   the named constants of Req 19, defaultSessionParameters(), checkSessionParameters
    purity.test.ts                the scans of §10
    math/                         ── Math layer (node environment)
      degrees.ts                  fromDeg, toDeg
      display-format.ts           formatAzimuthDeg, formatSignedDeg, parseDegrees
      messages.ts                 MESSAGES, MUST_MENTION, messageFor
      contrast.ts                 relativeLuminance, contrastRatio
      camera-calibration.ts       checkCalibration, focalLengthSourcePx
      image-layout.ts             imageLayout
      image-geometry.ts           pointToRayOffset, rayOffsetToPoint
      ray-uncertainty.ts          imageAngularSigmaRad
      session/
        session.ts                Session, SessionState, Notice, Mark, FrozenSighting, CapturedResult
        session-events.ts         SessionEvent (action and data), SessionEffect
        step.ts                   step, createSession
        readout.ts                liveReadout, steadiness
        yaw-status.ts             yawStatus
        freeze.ts                 canFreeze, freeze
        mark.ts                   makeMark
        capture.ts                captureFrozen
        establish-yaw.ts          establishYaw
        parameters.ts             SessionParameters, checkSessionParameters
      map/
        geojson.ts                GeoJSON types, point(), lineString(), polygon(), to [lonDeg, latDeg]
        observer-features.ts      observerFeatures
        bearing-features.ts       bearingFeatures
        fix-features.ts           fixFeatures, FixFeatureCollection
        map-bounds.ts             mapBounds
        map-style.ts              buildMapStyle, MapStyle
      scene/
        scene.ts                  SyntheticScene, Target, Station, checkScene
        target-direction.ts       targetDirection
        project-scene.ts          projectScene (uses Sensors' rayOffsetOfDirection; no rotation matrix)
        aim.ts                    aimAfterDrag
        catalogue.ts              buildCatalogue
      panel/
        panel-state.ts            PanelState, PanelAction, panelStep
      diagnostics/
        event-rate.ts             eventRateHz
    adapters/                     ── Adapters (node environment, fakes)
      camera/
        camera-adapter.ts         createCameraAdapter, CameraStream
        camera-surface.ts         CameraSurface, MediaStreamLike, TrackLike, VideoSink (types only)
        browser-camera-surface.ts browserCameraSurface()  — the one file naming navigator.mediaDevices
      map/
        map-adapter.ts            createMapAdapter, MapAdapter  (+ map-adapter.property.test.ts: P-15.11, P-15.12)
        maplibre-types.ts         MapLibreLike, MapLike, GeoJsonSourceLike (minimal, ours)
        maplibre-loader.ts        loadMapLibre() — the one file with import('maplibre-gl')
    components/                   ── Components layer (jsdom)
      theme.ts                    palette, type, sizes, spacing, PALETTE_PAIRS (§7.18)
      dom-size.ts                 observeElementSize (the one ResizeObserver user), useElementSize
      timer.ts                    Timer type (no implementation)
      session-driver.ts           createSessionDriver
      use-sighting-session.ts     the hook over the driver
      ImageSurface.tsx  CameraImage.tsx  SceneImage.tsx  Reticle.tsx  MarkRing.tsx
      Readout.tsx  YawStatusBar.tsx  FailureNotice.tsx  ControlBar.tsx  CaptureSummary.tsx
      LimitsNote.tsx  MapView.tsx  SimulatorPanel.tsx  SightingScreen.tsx
    test-support/                 fast-check-setup.ts, fakes (fake-timer, fake-camera-surface,
                                  fake-maplibre, fake-video-sink), generators, history-from-script,
                                  deep-same, property-report   (not exported)
  playground/
    index.html  main.tsx  Playground.tsx  DeviceMode.tsx  SimulatorMode.tsx
    CalibrationForm.tsx  Diagnostics.tsx  CaptureList.tsx  system-timer.ts
    vite.config.ts  env.d.ts  playground.css
    Playground.integration.test.tsx
```

Test files sit next to the code (`foo.test.ts`, `foo.property.test.ts`, `Foo.test.tsx`). The Playground's integration test sits in `playground/` and runs in the `components` project.

## 6. Data model and public API

Everything below is exported from `src/index.ts` unless marked internal. `UiResult<T> = { ok: true; value: T } | UiFailure`; `UiFailure = { ok: false; reason: UiReason; field?: string; id?: string; reportedAccuracyM?: number; errorName?: string }`.

```ts
// reasons, defaults
export type UiReason = SensorReason | 'camera_permission_denied' | 'camera_unavailable' | 'camera_busy'
  | 'camera_track_ended' | 'camera_stopped' | 'camera_failed' | 'wrong_camera' | 'calibration_missing'
  | 'calibration_mismatch' | 'outside_image' | 'outside_field_of_view' | 'portrait_required'
  | 'action_not_available' | 'tiles_unavailable' | 'map_unavailable' | 'crosses_antimeridian';
export const UI_REASONS: readonly UiReason[];
export const READOUT_INTERVAL_MS = 200; export const ELLIPSE_VERTEX_COUNT = 72; /* … Req 19.1 */
export function defaultSessionParameters(): SessionParameters;      // no calibration, no tapSigmaPx field
export function checkSessionParameters(p: SessionParameters): UiResult<SessionParameters>;

// display, messages, contrast
export function messageFor(failure: UiFailure | SensorFailure): Message;       // { whatHappened, whatToDo }
export function formatAzimuthDeg(azimuthRad: number, decimals: number): string;  // "0.0" … "359.9"
export function formatSignedDeg(angleRad: number, decimals: number): string;
export function parseDegrees(text: string): UiResult<number>;                   // radians
export function contrastRatio(a: Rgb, b: Rgb): number;                          // Rgb = {r,g,b} 0..255

// calibration, geometry
export interface CameraCalibration { fovRad; fovAxis: 'width'|'height'|'diagonal'; fovSigmaRad;
  imageWidthSourcePx; imageHeightSourcePx }
export function checkCalibration(c: CameraCalibration): UiResult<CameraCalibration>;
export type ImageFit = 'cover' | 'contain';
export interface ImageLayout { fit: ImageFit; sourceWidthSourcePx; sourceHeightSourcePx; elementWidthPx;
  elementHeightPx; scalePxPerSourcePx; displayedWidthPx; displayedHeightPx; leftPx; topPx }
export function imageLayout(source: SourceSize, element: PixelSize, fit: ImageFit): UiResult<ImageLayout>;
export function pointToRayOffset(layout, calibration: CameraCalibration | null, p: PixelPoint): UiResult<RayOffset>;
export function rayOffsetToPoint(layout, calibration, offset: RayOffset):
  UiResult<{ point: PixelPoint; insideElement: boolean; onImage: boolean }>;
export function imageAngularSigmaRad(layout, calibration, p: PixelPoint, tapSigmaPx: number): UiResult<number>;

// session
export type SessionKind = 'bearing' | 'altitude';
export type SessionStateKind = 'permission'|'starting'|'live'|'frozen'|'captured'|'failed';
export interface Mark { offset: RayOffset; imageSigmaRad: number; calibration: CameraCalibration }  // the calibration is reported with the capture (Req 12.6)
export interface Session {
  kind; state: SessionStateKind; history: SampleHistory; yawReference: YawReference | null;
  declination: Declination | null; readout: LiveReadout | null; lastReadoutUtcMs: number | null;
  nowUtcMs: number | null; frozen: FrozenSighting | null; captured: CapturedResult | null;
  failure: StampedFailure | null; notice: Notice | null }
export function createSession(kind: SessionKind, p: SessionParameters): UiResult<Session>;
export function step(s: Session, e: SessionEvent, p: SessionParameters): { session: Session; effects: SessionEffect[] };
export function yawStatus(y: YawReference | null, resets: readonly FrameResetEvent[], nowUtcMs: number,
  maxAgeMs: number): { status: 'none'|'valid'|'stale'|'invalidated'; ageMs: number };

// map geometry and adapter
export function observerFeatures(observers: readonly { id: string; position: Position }[]): UiResult<FeatureCollection>;
export function bearingFeatures(b: Bearing, lineLengthM: number, arcStepRad: number): UiResult<FeatureCollection>;
export function fixFeatures(fix: Fix, vertexCount: number): UiResult<FixFeatureCollection>;
export function mapBounds(cs: readonly FeatureCollection[]): UiResult<{ westDeg; southDeg; eastDeg; northDeg }>;
export function buildMapStyle(tiles: TileSource | null): MapStyle;
export function createMapAdapter(lib: MapLibreLike, container: unknown, tiles: TileSource | null,
  timer: Timer): UiResult<MapAdapter>;
export function loadMapLibre(): Promise<UiResult<MapLibreLike>>;

// camera
export function createCameraAdapter(surface: CameraSurface): CameraAdapter;
export function browserCameraSurface(): CameraSurface;

// scene, panel, driver, components
export function checkScene(s: SyntheticScene): UiResult<SyntheticScene>;
export function targetDirection(station: Station, target: Target): UiResult<{ azimuthRad; apparentAltitudeRad }>;
export function projectScene(scene, station, trueRotation: DeviceRotation, layout): UiResult<ProjectedScene>;
export function aimAfterDrag(pose: TruePose, dxPx: number, dyPx: number, focalPx: number): UiResult<TruePose>;
export function buildCatalogue(): UiResult<readonly CatalogueScene[]>;
export function panelStep(s: PanelState, a: PanelAction): UiResult<{ state: PanelState; advancesToUtcMs: number[] }>;
export function createSessionDriver(deps: DriverDeps): SessionDriver;
export const SightingScreen, SimulatorPanel, SceneImage, CameraImage, Reticle, MapView, FailureNotice, …;
```

**Session.** `SessionParameters` holds: `windowLengthMs`, `minSampleCount`, `sampleStalenessMs`, `positionStalenessMs`, `coarseLocationLimitM`, `yawReferenceMaxAgeMs`, `headingSigmaRad`, `sampleRetentionMs`, `frameResetRetentionMs`, `altitudeCalibration`, `readoutIntervalMs`, `steadyBelowRad`, `unsteadyAboveRad`, `screenAngleToleranceRad` (`1e-9`, Req 10.2), `maxMarkAltitudeRad` (`80°`, Req 12.3). `checkSessionParameters` also enforces `frameResetRetentionMs ≥ yawReferenceMaxAgeMs + windowLengthMs` (Req 19.4). *Why it is enough:* by Req 8.15 no item is later than its event and by Req 8.16 every window ends at the Session's time, so the history's newest time is never later than the end of a window being read; a Yaw reference usable in that window was set at most the maximum age before it; so an invalidating reset at or after the reference is at most the maximum age before the newest time, within the retention, and still held (the window length covers Sensors' own check of resets inside the window). No calibration and no `tapSigmaPx` is stored in it (Req 19.3): the `mark` event carries both.

```ts
type SessionEvent =
  // data
  | { kind: 'permissionResult'; timeUtcMs; result: SensorResult<'granted' | 'not_required'> }
  | { kind: 'orientationStarted'; timeUtcMs; result: SensorResult<OrientationFrame> }
  | { kind: 'sample'; timeUtcMs; result: SensorResult<OrientationSample> }
  | { kind: 'frameReset'; timeUtcMs; event: FrameResetEvent }
  | { kind: 'positionFix'; timeUtcMs; result: SensorResult<PositionFix> }
  | { kind: 'declination'; timeUtcMs; result: SensorResult<Declination> }
  | { kind: 'camera'; timeUtcMs; result: UiResult<null> }
  | { kind: 'tick'; timeUtcMs }
  // action
  | { kind: 'freeze'; timeUtcMs } | { kind: 'unfreeze'; timeUtcMs }
  | { kind: 'mark'; timeUtcMs; point: PixelPoint; layout: ImageLayout; calibration: CameraCalibration | null; tapSigmaPx: number }
  | { kind: 'clearMark'; timeUtcMs } | { kind: 'capture'; timeUtcMs }
  | { kind: 'establishYaw'; timeUtcMs; from: { kind: 'compass' } | { kind: 'knownAzimuth'; azimuthRad; sigmaRad; northReference: 'true' | 'magnetic' } }
  | { kind: 'again'; timeUtcMs } | { kind: 'restart'; timeUtcMs };
type SessionEffect = { kind: 'startOrientation' } | { kind: 'startPositions' };
```

`LiveReadout = { timeUtcMs; sampleCount; newestSampleUtcMs; azimuth: SensorResult<LiveAzimuth>; apparentAltitudeRad: SensorResult<number>; azimuthSpreadRad | null; altitudeStdDevRad | null; steadiness; stale: boolean }`, with `LiveAzimuth = { northReference: 'true'|'magnetic'|'relative'; azimuthRad }`. A failure inside the readout is a value (`axis_vertical`, `frame_reset`) that the screen shows through `messageFor`; the readout itself is `null` only when the window is empty (Req 9.6).

`CapturedResult = { kind: 'bearing'; bearing: Bearing } | { kind: 'altitude'; altitude: AltitudeCapture }`, with `{ mark: Mark | null; yawReference: YawReference | null; declination: Declination | null; calibration: CameraCalibration | null; sampleCount; window: SightingWindow }`.

**Driver.** `DriverDeps = { source: SensorSource; kind; parameters; timer: Timer; onSession(s: Session): void; computeDeclination?: typeof declinationAt }`. `createSessionDriver(deps): UiResult<SessionDriver>` (invalid parameters are `invalid_number`, never a throw). `SessionDriver = { requestPermission(): Promise<void>; dispatch(action: ActionRequest): void; camera(result: UiResult<null>): void; session(): Session; stop(): void }`, where an `ActionRequest` is an action event without `timeUtcMs` (the driver stamps it with `source.now()`), and `camera` delivers the state of the Camera adapter as a `camera` event.

**Map adapter.** `MapAdapter = { setObservers(o): UiResult<void>; setBearings(b, lineLengthM): UiResult<void>; setFix(fix: Fix): UiResult<void>; clearFix(): UiResult<void>; fitToFeatures(paddingPx): UiResult<void>; onError(l: (f: UiFailure) => void): Unsubscribe; destroy(): void }`. `MapLibreLike = { createMap(options: { container; style; interactive }): MapLike }` with `MapLike = { on('load' | 'error', l): Subscription; getSource(id): { setData(d): Promise<void> | void } | undefined; fitBounds(b, o); remove() }` (D27.4). A `setData` that throws or whose promise rejects is reported to `onError` as `tiles_unavailable` with the error's name, throttled; the setter itself returns `ok`.

**Camera adapter.** `CameraAdapter = { start(request?: { idealWidthSourcePx?: number; idealHeightSourcePx?: number }): Promise<UiResult<CameraStream>>; stop(): void }`; `CameraStream = { sizeSourcePx(): SourceSize; facing: 'rear'|'unknown'; attach(sink: VideoSink): () => void; onSize(l): Unsubscribe; onEnded(l: (f: UiFailure) => void): Unsubscribe }`.

## 7. Algorithms

### 7.1 Display and units (`degrees.ts`, `display-format.ts`)

`formatAzimuthDeg(x, d)`: `v = toDeg(wrapTwoPi(x))`; `r = round(v · 10^d) / 10^d`; if `r ≥ 360` then `r −= 360` (a value that rounds up to 360 prints as `0`); `toFixed(d)`. `formatSignedDeg(x, d)`: `v = toDeg(x)` clamped to `[-180, 180]`; `r = round(v · 10^d) / 10^d`; `r = r === 0 ? 0 : r` (turns `-0` into `0`, so the text has no minus sign when it rounds to zero); `toFixed(d)`. A non-finite argument returns `'—'` (an em dash is shown, never `NaN`); its test is an example, as the property domain is finite. `parseDegrees(text)`: trim; accept `^[+-]?(\d+(\.\d*)?|\.\d+)°?$` only (no exponent, no `Infinity`, no thousands separators); `Number(...)` and `degToRad`; anything else is `invalid_number` with `field: 'text'`.

### 7.2 Contrast (`contrast.ts`)

`lin(c) = c/255 ≤ 0.03928 ? c/255/12.92 : ((c/255 + 0.055)/1.055)^2.4`; `L = 0.2126 R + 0.7152 G + 0.0722 B`; `ratio = (Lmax + 0.05)/(Lmin + 0.05)`. WCAG 2.1 prints `0.03928` and later texts `0.04045`; no 8-bit value lies between them (`10/255 = 0.0392` and `11/255 = 0.0431`), so the results are identical and P-13.10 does not depend on the choice. Black on white is `1.05 / 0.05 = 21`.

### 7.3 Camera calibration (`camera-calibration.ts`)

`checkCalibration` checks in the order of the fields of Req 4.1: `fovRad` finite and in `(0, π)`; `fovAxis` one of three; `fovSigmaRad` finite and `≥ fromDeg(0.01)`; `fovRad − fovSigmaRad > 0` and `fovRad + fovSigmaRad < π`; the two sizes finite and positive. Each failure is `invalid_number` naming the field (`fovSigmaRad` for the last two of the fourth). `focalLengthSourcePx(c) = (D/2)/tan(fovRad/2)` with `D` from the calibration's own size (Req 4.3), used by P-4.7. The geometry does not use it (D7).

### 7.4 Image layout and geometry (`image-layout.ts`, `image-geometry.ts`)

`imageLayout(source (sw, sh), element (ew, eh), fit)`: all four finite and positive, else `invalid_number` naming `sourceWidthSourcePx` and so on; `s = fit === 'cover' ? max(ew/sw, eh/sh) : min(ew/sw, eh/sh)`; `dw = sw·s`, `dh = sh·s`; `left = (ew − dw)/2`, `top = (eh − dh)/2`.

`displayedFocalPx(layout, c)` (D7): `Dₛ = dw | dh | hypot(dw, dh)` by `fovAxis`; `F = (Dₛ/2)/tan(fovRad/2)`. A calibration is checked first; `null` is `calibration_missing`; the aspect check is `|sw/sh − cw/ch| / (cw/ch) > 0.01` → `calibration_mismatch` (Req 4.4).

`pointToRayOffset(layout, c, p)`, in the order of Req 5.4:
1. `p` finite, else `invalid_number` naming `xPx` or `yPx`.
2. `c === null` → `calibration_missing`; `checkCalibration`; aspect check → `calibration_mismatch`.
3. `outside_image`: `x < −1e-9 || x > ew + 1e-9 || y < −1e-9 || y > eh + 1e-9`, or, for `contain`, `x < left − 1e-9 || x > left + dw + 1e-9 || y < top − 1e-9 || y > top + dh + 1e-9`.
4. `right = atan((x − ew/2)/F)`, `up = atan(−(y − eh/2)/F)`. If `|right| > MAX_RAY_OFFSET_RAD` or `|up| > MAX_RAY_OFFSET_RAD` → `outside_field_of_view`.

`rayOffsetToPoint`: checks `rightRad`, `upRad` finite and within `MAX_RAY_OFFSET_RAD` (`invalid_number`, as Sensors' `checkRayOffset`); `x = ew/2 + F tan(right)`, `y = eh/2 − F tan(up)`; `insideElement = 0 ≤ x ≤ ew && 0 ≤ y ≤ eh`; `onImage = insideElement` for `cover`, and inside `[left, left+dw] × [top, top+dh]` for `contain`.

Conditioning. With `fovRad = 150°` and a 64-pixel source shown at scale `0.008`, `F = 0.07` CSS pixels. Then `x = ew/2 + F tan(right)` and `atan((x − ew/2)/F)` lose accuracy in `right` of about `ulp(4096)/F = 6.5e-12` rad, inside the `1e-9` of Req 5.8 to 5.11. That is the case the user's edit of those tolerances covers; the generator draws it on purpose (§8).

### 7.5 Ray uncertainty (`ray-uncertainty.ts`)

`imageAngularSigmaRad(layout, c, p, tapSigmaPx)`: `tapSigmaPx` finite and `≥ 0` else `invalid_number` naming it; the point checks of §7.4 (its failures pass through); `r = hypot(x − ew/2, y − eh/2)`; `F, F⁺, F⁻` from `displayedFocalPx` with `fovRad`, `fovRad + fovSigmaRad`, `fovRad − fovSigmaRad` (the calibration guarantees both are in `(0, π)`); `εTap = tapSigmaPx / hypot(r, F)`; `εFov = max(|atan(r/F⁺) − atan(r/F)|, |atan(r/F⁻) − atan(r/F)|)`; result `hypot(εTap, εFov)`. At `r = 0`, `εFov = 0` exactly and the result is `εTap = tapSigmaPx/F` (Req 6.4).

### 7.6 The Session (`session/`)

`createSession(kind, p)` validates `p` and returns state `permission` with an empty history (`createSampleHistory({sampleRetentionMs, frameResetRetentionMs})`), no Yaw reference, no Declination and no readout.

`step` is a switch on `event.kind`. Every branch starts with `validTime(event.timeUtcMs)`: a non-finite time returns the Session unchanged with the Notice `invalid_number` (`field: 'timeUtcMs'`) and no effects (Req 8.8). `nowUtcMs` is the largest event time seen, and **every event is handled at it** (Req 8.16): an event from a clock that stepped back is handled as if it carried `nowUtcMs`, which is the end of the window of `freeze`, `establishYaw` and the readout, the time of the staleness checks and of a capture, and the time recorded with a failure. The items an event carries keep their own times. **Req 8.15:** a `sample`, `frameReset` or `positionFix` whose item time is later than the time its own event carries is refused with the Notice `invalid_number` (`field: 'timeUtcMs'`), history unchanged; so the history's newest time is never later than `nowUtcMs`, and one item far in the future cannot make the history drop every real Frame reset.

**Data events.**
- `permissionResult`: in `permission`, `ok` → state `starting`, effects `[startOrientation]` plus `[startPositions]` for a bearing Session (Req 8.13); failure → state `failed`, `failure` set. In any other state: a failure is a Notice with its own reason; a success is dropped (D5).
- `orientationStarted`: in `starting`, `ok` → `live`; failure → `failed`. Otherwise as above.
- `sample`: a failure in `live`, `frozen` or `captured` is a Notice (Req 8.5); in `permission`, `starting`, `failed` also a Notice. A success is added with Sensors' `addOrientationSample` in every state; if Sensors refuses it (`invalid_number`), the Session is unchanged and the Notice is that failure (Req 8.8). Then the readout may be published (§7.7).
- `frameReset`: `addFrameReset` in every state (Req 8.14); a refusal is a Notice.
- `positionFix`: success → `addPositionFix` in a bearing Session, dropped in an altitude Session (it never asks for positions); failure → Notice with its reason in both (`coarse_location` keeps `reportedAccuracyM`; Req 8.4).
- `declination`: success → checked with Sensors' `trueAzimuthFromMagnetic` (its `checkDeclination`; a refusal is the Notice), then held in a bearing Session, dropped in an altitude Session; failure → Notice in both.
- `camera`: a failure → state `failed` with that failure, except in `captured` and `failed`, where it is a Notice (Req 8.3); `ok` clears nothing.
- `tick`: sets `nowUtcMs`, recomputes `readout.stale`, republishes the readout if `tickTime − lastReadoutUtcMs ≥ readoutIntervalMs` (§7.7). No Notice.

**Action events.** Availability: `freeze` in `live`; `unfreeze` and `clearMark` and `mark` in `frozen`; `capture` in `frozen`; `again` in `captured`; `restart` in `failed`; `establishYaw` compass in `live`, known azimuth in `live` and `frozen` (D24). Elsewhere: Notice `action_not_available`, the Session otherwise unchanged.
- `freeze`: the checks run in this order and the first failure is the Notice, the state staying `live`: (1) `selectWindow(history.samples, window)` with the Sighting window `{ endUtcMs: t, windowLengthMs, minSampleCount, sampleStalenessMs }` of the parameters: its failure (`insufficient_samples` or `stale_samples`, Sensors' rule, not a copy of it) is the Notice; (2) the newest selected sample's Screen angle is not `null` and `|wrapPi(angle)| ≤ screenAngleToleranceRad`, else `portrait_required`. On success: `frozen = { history: s.history, window, yawReference, declination, mark: null, frozenAtUtcMs: t }`, state `frozen`. P-10.1 checks that a `freeze` and Sensors' `captureAltitude` on the same window fail with the same reason, which holds the two to one rule.
- `unfreeze`: state `live`, `frozen = null`, `lastReadoutUtcMs = null` (a readout is published at the next sample or tick).
- `mark`: `pointToRayOffset` and `imageAngularSigmaRad` (the Freeze already required Screen angle `0`, Req 10.2, so `mark` repeats no check of it); a failure is a Notice and the earlier Mark stays (Req 10.5); success replaces the Mark with `{ offset, imageSigmaRad }`.
- `clearMark`: `mark = null`.
- `capture`: §7.9.
- `again`: state `live`, `captured = null`, `frozen = null`, `lastReadoutUtcMs = null`.
- `restart`: state `permission`, `failure = null`, `notice = null`, `readout = null`, history rebuilt as `createSampleHistory(...)` followed by `addFrameReset` of each Frame reset the old history held (so the samples go and the resets stay, Req 8.3, 8.14), Yaw reference and Declination kept.
- `establishYaw`: §7.8.

**Notice.** Clearing follows D23. **Frame resets and the Yaw reference.** The Session never clears or replaces the Yaw reference except by a successful `establishYaw`; so after any `frameReset` in any state, `yawStatus` is `invalidated` until then (P-11.9), and a capture with it fails in Sensors with `frame_reset`.

### 7.7 The Live readout (`readout.ts`)

`liveReadout(history, yawReference, declination, parameters, endUtcMs)`:
1. `selected = selectWindow(history.samples, { endUtcMs, windowLengthMs, minSampleCount: 1, sampleStalenessMs: windowLengthMs })`. The readout shows what it has, so the minimum is one sample, and the staleness limit is the window's own length, which no selected sample can exceed (the readout reports staleness itself, next line). A failure (`insufficient_samples`: no sample in the window) gives `null` (Req 9.6).
2. `stale = endUtcMs − newest.timeUtcMs > sampleStalenessMs`, with `sampleStalenessMs` of the parameters.
3. Altitudes: for each sample `rayDirection(rotation)` then `directionApparentAltitudeRad`; `summariseAltitudes` gives the mean `h̄` and the standard deviation; `apparentAltitudeRad = h̄ + altitudeCalibration.offsetRad`. A failure of either step makes the field a failure value.
4. Azimuth, in this order. The window has no single frame if its samples differ in `frame`: the azimuth is the failure `frame_reset` (the readout shows it; a capture would fail the same way, Sensors 8.8). For a Relative window, `resetBetween(history.frameResets, start, end)` true → `frame_reset`. The Yaw reference counts only if `yawStatus(...)` at `endUtcMs` is `valid` and its `frame` is the window's. Per sample `directionAzimuthRad` (a sample with `axis_vertical` makes the azimuth a failure with that reason; none is dropped, as in Sensors' capture). Then:
   - with a valid Yaw reference: `applyYawReference`, which gives `true`, or `magnetic` (then the Declination, below);
   - Absolute frame without one: `magnetic`;
   - Relative frame without one: `relative`.
   For `magnetic`: with a Declination held, `trueAzimuthFromMagnetic` per sample (`true`); without one, the azimuth stays `magnetic` (never `true` where Sensors would fail, Req 9.2).
5. `summariseAzimuths(azimuths)` gives the circular mean and the Spread; its failures pass through (`undefined_mean` → `too_unsteady`, as the capture maps it).
6. `steadiness`: `spreadRad ≤ steadyBelowRad` → `steady`; `> unsteadyAboveRad` → `unsteady`; else `settling`. With no azimuth (a failure), `unsteady`.

**Publication** (`step`, `sample` and `tick`): on a sample at `t`, publish if `lastReadoutUtcMs === null || t − lastReadoutUtcMs ≥ readoutIntervalMs`; the readout is built with `endUtcMs = t`; `lastReadoutUtcMs = t`. On `tick` at `t`: if due, republish at `t` (which yields `null` once the window is empty); otherwise only update `stale` on the held readout. The history is updated for every sample first (Req 9.5).

### 7.8 Yaw status, establishing north (`yaw-status.ts`, `establish-yaw.ts`)

`yawStatus(y, resets, nowUtcMs, maxAgeMs)`: `y === null` → `none`, age 0. `ageMs = max(0, nowUtcMs − y.establishedUtcMs)`. `invalidated` if `resetBetween(resets, y.establishedUtcMs, nowUtcMs, (cause) => invalidates(y.frame, cause))` (Sensors' two exports, Req 5.17; the UI writes no rule). Else `stale` if `ageMs > maxAgeMs`; else `valid`. Non-finite arguments return `none` with age `0`, never `NaN`.

`establishYaw` compass: `yawReferenceFromCompass({ samples, frameResets, window, headingSigmaRad })` over the live history; known azimuth in `live`: `yawReferenceFromKnownAzimuth({ …, knownAzimuthRad, knownSigmaRad, northReference })`; in `frozen`: the Frozen history and window, `rayOffset = mark.offset`, and `knownSigmaRad' = hypot(sigmaRad, mark.imageSigmaRad / cos h)` with `h` as in §7.9 (D24). A failure of Sensors is the Notice (Req 11.1) and the Yaw reference held stays. In `frozen`, a success replaces both `session.yawReference` and `frozen.yawReference`, so that the capture of this very sighting uses it. This is the one write into a Frozen sighting; it is an action of the user, not something that arrives, and it never touches the history; Req 10.3 now says so.

### 7.9 Capture (`capture.ts`)

`captureFrozen(session, parameters, nowUtcMs)` for state `frozen`:
- **bearing:** `positionFix = frozen.history.positionFix`; null → `position_unavailable`. `captureBearing({ id, timeUtcMs: frozen.frozenAtUtcMs, samples, frameResets, window, rayOffset: mark?.offset, yawReference, yawReferenceMaxAgeMs, headingSigmaRad, declination, positionFix, positionStalenessMs, coarseLocationLimitM })`. The `id` is `${kindPrefix}-${frozenAtUtcMs}`, the caller replaces it. A failure is the Notice; the state stays `frozen`. With no Mark: the result is Sensors' `Bearing` as it is (Req 12.5). With a Mark: `h` = apparent altitude of `rayDirection(newestSample.rotation, mark.offset)`; `|h| > maxMarkAltitudeRad` → `axis_vertical`; `σ' = hypot(σ, ε / cos h)`; the Bearing is `{ …bearing, azimuthSigmaRad: σ' }`; `σ' > 45°` → `too_unsteady`; `validateBearing` → its failure.
- **altitude:** `captureAltitude({ samples, window, calibration: parameters.altitudeCalibration, rayOffset })`; with a Mark `sigmaRad' = hypot(σ, ε)`.
- The result carries the details of §6 and moves the state to `captured`.

`id` and `timeUtcMs` of the Bearing are set by the Session as above; the app overrides the id when it stores the Bearing.

### 7.10 Map geometry (`math/map/`)

**Coordinates.** `lonLat(p: Position) = [toDeg(p.lonRad), toDeg(p.latRad)]`, the only place that order exists (Req 14.1).

**`observerFeatures`**: one Point per observer, `properties { kind: 'observer', id }`, feature `id` `observer:<id>`; an unsupported Position is `unsupported_position`.

**`bearingFeatures(b, L, step)`**: `L` finite in `(0, 500 000]` and `step` finite `> 0`, else `invalid_number`. `end = destinationPosition(b.observer, b.azimuthRad, L)`. LineString `[observer, end]`, `properties { kind: 'bearing-line', id }`. Wedge: `segments = max(1, ceil(2σ / step))`; for `i = 0…segments`, `θi = az − σ + i · 2σ/segments`, `vi = destinationPosition(observer, θi, L)`; ring `[observer, v0, …, v_segments, observer]`, `properties { kind: 'bearing-wedge', id }`. Spacing is `2σ/segments ≤ step` by construction. (Counter-clockwise or clockwise depends on the sign of the azimuth sweep, which is clockwise on the ground; RFC 7946 asks for counter-clockwise exterior rings, so the ring is built in the order `observer, v_segments, …, v0, observer`, which is counter-clockwise.)

**`fixFeatures(fix, N)`**: `N` an integer `≥ 16` else `invalid_number` naming `vertexCount`. `e95 = ellipse95(fix.ellipse)` (failure passes through). For `k = 0…N−1`, `θ = 2πk/N`, `u = a cos θ`, `v = b sin θ` (`a, b = e95.semiMajorM, e95.semiMinorM`), `az = e95.azimuthRad`: `east = u sin az − v cos az`, `north = u cos az + v sin az` (the minor axis is the major rotated `+90°`, so increasing `θ` runs counter-clockwise); `unprojectToLocalPlane(fix.position, {eastM, northM})`; any failure returns the failure and **no collection** (Req 14.5). Ring `[v0, …, v_{N−1}, v0]`, with `v0` repeated as the same array values. Point at `lonLat(fix.position)`. Output `FixFeatureCollection` with exactly two features, `kind: 'fix'` and `kind: 'fix-ellipse-95'`.

**`mapBounds`**: all coordinates; none → `invalid_number`; `west = min lon`, `east = max lon`; `east − west > 180` → `crosses_antimeridian`; else the box. (A set from −100° to +100° is refused too; the message says the area is too wide, which is true for either cause.)

**`buildMapStyle(tiles)`**: `{ version: 8, sources, layers }`, no `glyphs`, no `sprite`. Layers in order: `background` (solid, `#DADADA`), `tiles` (raster, only with a Tile source), `wedges-fill` (fill, opacity 0.18) and `wedges-outline` (line), `fix-ellipse-fill`, `fix-ellipse-casing` (line, dark, width 5), `fix-ellipse-core` (line, light, width 2.5), `bearings-casing` (line, dark, width 5), `bearings-core` (line, light, width 2.5), `observers-casing` (circle, dark, radius 9), `observers-core` (circle, light, radius 6), `fix-casing` (circle, dark, radius 11), `fix-core` (circle, light, radius 7.5). Widths are `≥ 2` (Req 15.7). The colours are `MAP_DARK` (`outline`), `MAP_LIGHT` (`mapInk`) and `MAP_FIX` (`brass`) of §7.18, written as constants in `map-style.ts` because the Math layer may not import `components/theme.ts`; a test in `theme.test.tsx` checks that the two copies are equal, and `map-style.test.ts` checks their contrast against black and against white (`≥ 7`, through `contrastRatio`). The raster source is `{ type: 'raster', tiles, tileSize, minzoom, maxzoom, attribution }`; MapLibre's default attribution control shows `attribution`.

### 7.11 The Map adapter (`adapters/map/map-adapter.ts`)

`createMapAdapter(lib, container, tiles, timer)`: `tiles` checked (Req 15.2: non-empty list, each template containing `{z}`, `{x}`, `{y}`; non-empty attribution; finite zooms and tile size). `new lib.Map({ container, style: buildMapStyle(tiles), interactive: true })` (no `attributionControl` option: its type is `false | AttributionControlOptions` and the default adds the attribution control, task 1.5(d)) in a `try`; an exception is `map_unavailable` (D12; Device check 10). The adapter holds `latest: Record<SourceId, FeatureCollection>` and `loaded: boolean`; `setX` validates and builds with the Math layer (a failure returns without touching `latest`, except `setFix`, which clears the fix first: Req 15.6), stores the collection, and writes `getSource(id).setData` if `loaded`; `setData` returns a `Promise` in `maplibre-gl` 6.x, so the adapter calls it inside a `try` and attaches a rejection handler to what it returns (a throw or a rejection becomes `tiles_unavailable` for the `onError` listeners, throttled as below, and is never an unhandled rejection); on `load` it writes all of `latest` once. `fitToFeatures(padding)` uses `mapBounds` over the held collections (including the ellipse ring, so the ellipse is always in view) and `map.fitBounds([[w, s], [e, n]], { padding, animate: false })`. `map.on('error', …)` and `'sourcedata'` errors become `tiles_unavailable` for the listeners, throttled: after one delivery `timer.start(release, mapErrorReportIntervalMs)`, `release` stops itself and re-arms. `destroy()` stops the timer, calls `map.remove()` once, drops listeners, and every later operation returns `action_not_available`. The adapter adds no control but the attribution.

### 7.12 The Camera adapter (`adapters/camera/camera-adapter.ts`)

State: `idle | pending | running | stopped`. `start(request)`:
- state `pending` or `running`: return the stored promise or result (Req 7.9). `stopped` is treated as `idle` (a new start after a stop is allowed).
- `!surface.isSecureContext` → `insecure_context`; `surface.getUserMedia === null` → `camera_unavailable`.
- constraints `{ audio: false, video: { facingMode: { ideal: 'environment' }, ...(width && { width: { ideal } }), ...(height && { height: { ideal } }) } }`.
- `getUserMedia(constraints)` in a `try`; rejection or exception mapped by `error.name` (Req 7.4) with `errorName` kept; a non-object rejection is `camera_failed`.
- On resolve: if state is `stopped` (stop was called while pending): stop every track and settle `camera_stopped`. Otherwise read the first video track: `facingMode === 'user'` → stop all, `wrong_camera`; no video track → stop all, `camera_failed`; `facing` = `'rear'` for `environment`, `'unknown'` for none, and any other string (`left`, `right`) is `'unknown'`. `track.addEventListener('ended', onEnded)`.
- `onEnded`: deliver `camera_track_ended` once to the listeners; stop the stream's other tracks; state `stopped`.
- `stop()`: state `pending` → `stopped` (the pending start settles when `getUserMedia` does); `running` → stop all tracks, remove listeners, detach the sink, state `stopped`; a second `stop()` does nothing.
- `attach(sink)`: `sink.srcObject = stream`, `sink.play()` in a `try` (a rejection is `camera_failed` to the `onEnded` listeners, which is where a screen already looks), listeners `loadedmetadata` and `resize` read `videoWidth × videoHeight` and call `onSize` listeners when it differs from the track's settings; returns a detach function.
`sizeSourcePx()` is the last size reported, from the track settings until the sink reports one.

### 7.13 The synthetic scene (`math/scene/`)

`checkScene`: an `id` and name non-empty, a valid calibration, `≥ 2` Stations with unique ids and Supported positions, Targets with unique ids; a landmark has a Supported position and finite `heightM`; the Sun has finite azimuth, altitude within `±80°` and a positive angular radius; failures name the field (`invalid_number`) or `unsupported_position`.

`targetDirection(station, target)`: landmark: `distanceM = greatCircleDistanceM(...)`; `< 1` → `coincident_positions`; `azimuth = initialAzimuthRad`; `apparentAltitudeRad = atan2(heightM, distanceM)`; Sun: as given (azimuth wrapped to `[0, 2π)`).

`projectScene(scene, station, trueRotation, layout)` (D14). `F` is the displayed focal length of `scene.calibration` under `layout` (D7). For each Target: `direction = targetDirection(station, target)` as an East-North-Up unit vector `(sin A cos h, cos A cos h, sin h)`; `offset = rayOffsetOfDirection(trueRotation, direction)`; a failure passes through; `null` is not visible; otherwise `rayOffsetToPoint(layout, calibration, offset)` gives the Pixel point and `visible = insideElement && onImage`. For the Sun, `radiusPx = F · tan(angularRadius)`.

**Horizon** (Req 16.3, amended at checkpoint 20). With `Ac` and `h` the camera's own azimuth and altitude (`cameraAxis(trueRotation)`), the horizon point at `Ac` is the **foot**: the point of the horizon line nearest the image centre, at an angle `|h| ≤ 80°` from the Camera axis at any roll, so Sensors' inverse can always place it (each offset is at most that angle). For `|h| ≥ 45°` the horizon is the line through the foot perpendicular to the segment from the centre to it (`horizonByFoot`); the segment is then at least `F` long, so its direction is good to `ulp/F`. Near level (`|h| < 45°`), where the segment is too short, the line goes through the two horizon points at `Ac ± 20°` (`horizonByPair`), which are within 80° of offset on both axes for `|h| ≤ 75°`. An example test shows that both give the same line at 45°. The line is clipped by Liang–Barsky to the part of the Element the image covers (the whole Element under `cover`); `null` when it misses it, or at exactly ±80° when Sensors' rounding puts the foot beyond the limit. *Why the first design was wrong:* it built the horizon from `Ac ± 20°` at every altitude and argued that no horizon is in view above 75°; but the visible region reaches 80° of offset (a wide field of view on one axis, a tiny `F`), and with a roll the `±20°` points leave it first, so a visible horizon came back `null` (P-16.9's shrunk counterexample, now an example test).

`aimAfterDrag(pose, dx, dy, F)`: all finite and `F > 0`; `az' = wrapTwoPi(az − atan(dx/F) / cos(alt))`; `alt' = clamp(alt + atan(dy/F), ±80°)`; roll unchanged (Req 17.10). `cos(alt) ≥ cos 80° = 0.17`, so the division is bounded. A horizontal drag and its opposite return the azimuth exactly up to rounding (the altitude is unchanged between them); any drag and its opposite return the altitude when neither step reached the limit (Req 17.12).

### 7.14 The driver (`components/session-driver.ts`)

`createSessionDriver(deps)` holds the `Session`, `dispatch(event)` (stamp, `step`, store, `onSession`, run the effects) and the subscriptions. `start`-like work happens in the first call of `requestPermission()` (D4): it subscribes once (`onOrientation`, `onFrameReset`, `onPosition`, each → an event with `timeUtcMs = source.now()`), starts the readout Timer (`timer.start(() => dispatch({kind: 'tick'}), readoutIntervalMs)`), calls `source.requestOrientationPermission()` and dispatches `permissionResult`. Effects: `startOrientation` → `source.startOrientation().then(r => dispatch orientationStarted)`; `startPositions` → `source.startPosition().then(r => { if (!r.ok) dispatch positionFix(r) })` (the success also arrives through `onPosition`, so it is not dispatched twice). Each `positionFix` success, for a bearing Session, also dispatches `declination` with `deps.computeDeclination(fix.position, fix.timeUtcMs)` (default Sensors' `declinationAt`), on every fix, as Req 9.7 says. `stop()` unsubscribes everything, stops the Timer, ignores later promise settlements (a `stopped` flag), and is idempotent. Starting again while running subscribes nothing a second time (Req 9.8). `restart` (an action) re-runs `requestPermission` from the user's tap. `restart` (the action) steps the Session to `permission`, then bumps a generation counter, calls `source.stop()` and runs `requestPermission()` again within the same tap; settlements of promises from an earlier generation are ignored. Stopping the source and starting it again is what makes a source emit its `restart` Frame reset (Sensors Req 4.7), which invalidates a Relative-frame Yaw reference. `camera(result)` dispatches a `camera` event stamped with `source.now()`.

### 7.15 The Simulator panel (`math/panel/panel-state.ts`)

`PanelState = { sceneId, stationId, seed, speed: 0.25|1|4, playing, elapsedSimMs, tickMs, startUtcMs }`. `PanelAction = select scene | select station | set seed | set speed | play | pause | step | restart | tick`. `panelStep` returns the new state and the absolute times to pass to `advanceTo`, in order. `tick` while `playing`: `Δ = tickMs · speed`; `elapsedSimMs += Δ`; advances are `start + elapsed` split into chunks of at most `MAX_SIMULATOR_ADVANCE_MS` from the previous target. `step` while paused is one `Δ`. `tick` while paused adds nothing. A scene, station or seed change or `restart` resets `elapsedSimMs` to 0 and tells the component to recreate the source and Session. A seed that is not an integer in `[0, 2³²)` is `invalid_number` naming `seed` and the state is unchanged. The component (`SimulatorPanel.tsx`) owns the Timer handle: it is running only while `playing` and is stopped on pause, on any failure of `advanceTo` (Req 17.6) and on unmount.

### 7.16 The catalogue (`scene/catalogue.ts`)

Eleven scenes, each `{ scene: SyntheticScene, scripts: Record<StationId, SimulatorScript>, orientationPermissionKind, … }`: (1) steady Absolute-frame phone; (2) Relative-frame with compass, altitude bias `−3.3°`; (3) compass that jumps; (4) a Frame reset between the Yaw reference and the capture; (5) coarse location; (6) location denied; (7) orientation permission required; (8) orientation permission denied; (9) orientation sensor missing; (10) insecure page; (11) the Sun scene for Nonius (a Sun target at a scripted azimuth and altitude, camera held on it). Every script starts with the pose on one Target and holds it (Req 17.3), has `eventIntervalMs = 50` and a calibration of `70°` along the diagonal at `720 × 1280` source pixels (an invented value, stated as synthetic in the file). Scene 1's script has noise `0.05°`, so that the capture's sigma is not only the floors; the property scripts of §8 use their own noise-free scripts. Each scene's Message (Req 17.2) is tested by driving its script to the failure and comparing the `messageFor` text with the other scenes' (all different).

### 7.17 Messages (`messages.ts`)

Each entry is two sentences of at most 160 characters. Examples (final wording in the task, under the rules of Req 3.3):

| Reason | whatHappened | whatToDo |
|---|---|---|
| `camera_permission_denied` | "This page is not allowed to use the camera." | "Allow camera access for this site in the browser settings, then start again." |
| `camera_busy` | "The camera is being used by another app." | "Close the other app that uses the camera, then start again." |
| `insecure_context` | "This page was opened over an insecure address, so the browser blocks the camera and motion sensors." | "Open the page from its https address." |
| `portrait_required` | "The phone is not held upright in portrait." | "Turn the phone to portrait and hold it upright, then try again." |
| `frame_reset` | "The phone may have lost its sense of north, for example after the screen locked or the page was hidden." | "Set north again from the compass, the Sun or a landmark before taking the sighting." |
| `stale_yaw_reference` | "The sighting of north is too old to trust." | "Set north again, then take the sighting." |
| `coarse_location` (with 840 m) | "The phone only knows its position to about 840 m." | "Move into the open, wait for a better position, or enter the position by hand." |
| `unsupported_format` (no UI path) | "This data was written by a different version of the app." | "Update the app, then open it again." |

`messageFor` returns the same object for the same failure. The keyword table `MUST_MENTION` (D18) is checked by the table test; P-3.11 draws arbitrary `field`, `id` and `errorName` text and checks that the Message of the failure equals the Message of the same failure without them (Req 3.3 as amended: a substring test of arbitrary text always collides with English words, as the shrunk counterexample `field: "arg"` inside "target" showed), and that the fixed forbidden words and the reason's code are absent.

### 7.18 Theme (`components/theme.ts`)

The look is an instrument's, not a dashboard's: near-black slate surfaces, one brass accent for the reticle and the primary control, off-white numerals in the system monospace stack with tabular digits, and thin ruled lines like an engraved scale. No web font, no image, no network. Contrast ratios are computed by the formula of §7.2 on the hex values below (I ran them; the test of Req 13.11 repeats them).

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0C0F12` | the page, behind the image |
| `panel` | `#141A1F` | readout and status panels |
| `raised` | `#1D252C` | controls, the map's container edge |
| `ink` | `#ECE8DC` | numerals, labels that matter (warm off-white) |
| `inkDim` | `#AEB6BD` | secondary labels, units, the limits line |
| `brass` | `#E3AE45` | the reticle's core, the Mark ring, the primary control, the Fix on the map, focus rings |
| `brassInk` | `#14100A` | the label on a brass control |
| `alert` | `#FF9B7A` | a failure's mark and its heading (salmon, not red: it must hold 7:1 on slate) |
| `outline` | `#0A0C0E` | the dark half of every two-tone line (reticle, Mark, map lines) |
| `mapInk` | `#F2EEE3` | the light core of the bearing lines and the observers on the map |
| `rule` | `#6A7884` | hairlines and dividers |

**Type.** `font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`; `font-variant-numeric: tabular-nums`; numerals 32 CSS px, labels and units 20 CSS px (Req 13.4 asks for at least 20), letter-spacing `0.02em`, no italics.

**Shapes.** Square corners (radius `0`), 1 px `rule` borders, 8 px spacing steps (`SPACING_PX = 8`, Req 19.1). A divider is a 1 px `rule` line with a tick strip beneath it (`repeating-linear-gradient`, a 1 px tick every 8 px, 4 px tall), as the edge of a scale; the Reticle has tick marks at its four arms. The primary control (Freeze, Capture) is a `brass` field with a `brassInk` label, 64 CSS px tall; the other controls are `raised` with an `ink` label and a `rule` border, 48 CSS px tall. A failure is a `panel` block with a 3 px `alert` left rule, an `alert` heading and the Message in `ink`.

**Contrast, the pairs of Req 13.2 and 15.7** (`PALETTE_PAIRS`; every one is at least 7):

| Pair (foreground on background) | Ratio |
|---|---|
| `ink` on `bg` / `panel` / `raised` | 15.69 / 14.32 / 12.67 |
| `inkDim` on `bg` / `panel` / `raised` | 9.36 / 8.54 / 7.56 |
| `brass` on `bg` / `panel` / `raised` | 9.52 / 8.69 / 7.69 |
| `brassInk` on `brass` | 9.39 |
| `alert` on `bg` / `panel` / `raised` | 9.35 / 8.54 / 7.55 |
| `brass` on black, the Reticle's core on the darkest image | 10.41 |
| `outline` on white, the Reticle's outline on the lightest image | 19.59 |
| `outline` on `brass` | 9.71 |
| `mapInk` on black, the map's light core on a dark map | 18.11 |
| `brass` on black, the Fix's core on a dark map | 10.41 |
| `outline` on white, every map casing on a light map | 19.59 |

The hairline `rule` is not in that list: a divider carries no information, so Req 13.2 (text and lines that carry a value) does not reach it. The test holds it to 3 : 1 against every surface (WCAG 1.4.11 for non-text), where it measures `4.24` on `bg`, `3.87` on `panel` and `3.42` on `raised`. If you want the dividers at 7 : 1 as well, `rule` becomes about `#97A4B0` and the instrument looks less engraved; say so and I change the token.

## 8. Correctness properties

Every property is a `fast-check` property in a `*.property.test.ts` file, in the `math` project, or in the `adapters` project for P-15.11 and P-15.12, with a comment above it naming the property and the requirements it validates. A failing property is classified code, property or requirement before anything changes (`testing.md`, rule 1). The case counts are `pnpm test` / `test:deep`; `test:deep` is `vitest run --config vitest.deep.config.ts`, which runs the property files of both projects (so P-15.11 and P-15.12 are in it) with a `provide` per-property cap read as in Sensors (`cappedRuns(limit)`), never below 200.

**Capped counts, and why.** `testing.md` rule 7 asks for 200 cases. P-16.8 runs a whole Session on a Simulator for each case, and I estimate 20 to 50 ms per case (no code exists to measure): it runs **50 / 1 000**. *Measured at checkpoint 20:* 1.5 ms a case; it runs **200 / 10 000**. The Session-sequence properties (P-8.9 to P-8.12, P-10.8, P-11.9) run up to 200 events through Sensors' history and capture functions, an estimated 5 to 20 ms a case: **200 / 2 000**. The properties that build a history of up to 300 samples and call Sensors' capture (P-9.9, P-9.10, P-10.9, P-11.7, P-12.x): **200 / 5 000**. A measured cost under a tenth of these estimates raises the count. **The first checkpoint (task 8) reports measured milliseconds per case.** The capped properties that need the Session and the scene do not exist yet at that point, so task 7 measures what can be measured then: one case of the shape they share (create a Simulator, aim, advance about 1.5 s, build the history, `selectWindow`, `captureBearing` and `captureAltitude`) on 1 000 draws, which is a lower bound for P-9.9, P-10.9, P-11.7 and P-12.x and for the part of P-16.8 that is not the Session. Checkpoint 15 reports the Session runs (P-8.9 to P-8.12, P-10.8, P-11.9) and checkpoint 20 reports P-16.8 itself. At each, the counts of this table are changed to what the measurement allows, not kept as guesses. **Measured.** Checkpoint 8: the shared history case costs 1.5 ms mean; the history-based properties run **200 / 20 000**. Checkpoint 15: the Session sequences cost 3.7 to 14 ms a case (P-8.11, which replays every run on deep-frozen state, 36 ms): they run **200 / 5 000**, P-8.11 **200 / 2 000**.

### Generators (domains stated; `test-support/generators.ts`)

"Uniform" draws use 53 unbiased random bits, as in Sensors (`fc.noBias`), not `fc.double`.

- **`sourceSize`**: `widthSourcePx, heightSourcePx ∈ [64, 8192]` integers, ends and `64` included.
- **`elementSize`**: `widthPx, heightPx ∈ [64, 4096]`, real numbers.
- **`calibration`**: `fovRad ∈ [20°, 150°]`, `fovSigmaRad ∈ [0.01°, 5°]` (ends drawn), `fovAxis` each of three, and an image size either equal to the source or a positive multiple `k ∈ [0.25, 4]` of it (so the aspect ratio matches and the size differs, Req 5.7; this is the draw that exposes F1).
- **`layoutCase`**: a `sourceSize`, an `elementSize`, `fit` each of two, a `calibration` of the above, and the layout from `imageLayout`. One draw in four forces the ill-conditioned corner: a source 8192 × 64 under `contain` in an Element 64 × 4096 (or the transposed pair), `fovRad = 150°` along the short side of the source, so that the displayed short side is 0.5 CSS pixels and `F ≈ 0.067`. (The first design said "the element at its largest", which gives a displayed side of 32 pixels; the corner needs the Element's width at its smallest and its height at its largest, which is also what the `6.5e-12` of §7.4 assumes.)
- **`pointInOffsetSpace`**: a `rightRad, upRad` uniform in `[-79°, 79°]` (ends drawn), mapped to a Pixel point through the layout; kept if it is inside the Element (and on the image under `contain`). Drawing in offset space, not pixel space, is what makes the `F ≈ 0.07` case produce points at all (all of them lie within `5 F` of the centre). Each offset is drawn from the range that keeps the point inside the Element and on the image (so nothing is discarded) and within the limit, which is 79° (75° for P-6.5).
- **`rayOffset`**: `[-80°, 80°]` each, ends and `0` included.
- **`scriptHistory`** (P-9.x to P-12.x): a Simulator run, never a hand-built sample: a noise-free or noisy script (`simulatorScript` of the UI's `test-support`, a copy of the domains of Sensors' generator: intervals `5` to `100` ms, 1 to 5 keyframes, both frames, 0 to 3 resets, headings present or not), advanced to a drawn time, with `aim` calls at drawn times (so a direction set within `30°` of a common one is built by aiming at each member and advancing one event interval), reading the samples, the Frame resets and the fix from the source's listeners and building the history with Sensors' `createSampleHistory` and `add…`. Using the Simulator keeps the UI's tests on Sensors' public API only.
- **`sessionRun`** (P-8.x, P-10.8, P-11.9, P-12.x): a list of 0 to 200 **intents**, resolved against the live Session by a small runner, because purely random events almost never reach `frozen`. An intent is one of: `grant` / `denyPermission`, `startOk` / `startFail(reason)`, `samples(n, frame, altitudeInDegrees, screenAngle)` (a dense run, built from the Simulator), `frameReset(cause)`, `fix(accuracy)`, `declination`, `cameraFail(reason)`, `tick(dt)`, and each action event (`freeze`, `mark` at a point inside or outside the field, `capture`, `establishYaw` of both kinds, `unfreeze`, `again`, `restart`, `clearMark`), plus `hostile(event)`: an event with a `NaN` or `Infinity` time or payload. The runner turns an intent into a concrete event with the Session's `nowUtcMs` plus a drawn step (which may be negative, once in ten, for the clock stepping back). The runner records the Session after every event.
- **`fixCase`** (P-14.x): `Fix` records built directly: a Position (latitude `[-84°, 84°]`, longitude `(-π, π]`), `semiMajorM ∈ [1, 100 000]`, `semiMinorM ∈ [1, semiMajorM]` (ends drawn; circular ellipses one draw in six), `azimuthRad ∈ [0, π)` (ends drawn), `vertexCount ∈ [16, 360]`; the covariance is computed consistently but only the Ellipse is read.
- **`bearingCase`** (P-14.8): observer latitude `[-84°, 84°]`, longitude `(-π, π]`, azimuth `[0, 2π)`, sigma `[0.01°, 45°]`, length `[100, 500 000]` m (log-uniform on half the draws), arc step `[0.1°, 5°]`.
- **`sceneCase`** (P-16.x): the scene built by the catalogue's own builder with random offsets (Stations and Targets at least `1` m apart, within `20 km`), a pose `azimuth [0, 2π)`, `altitude [-80°, 80°]`, `roll [-π, π)` (gimbal-lock draws as Sensors' `cameraPose`), a `layoutCase`.
- **`dragCase`** (P-17.12): the pose of `sceneCase`, `dx, dy ∈ [-4096, 4096]`, `F ∈ [50, 20 000]`.

### Properties

| ID | Req | Generator | Check | Runs (test / deep) |
|---|---|---|---|---|
| P-2.6 | 2.6 | `hostileInput` to every public Math-layer function (the generator of Sensors' P-11.8 style: `NaN`, `±Infinity`, `-0`, subnormals, `±MAX_VALUE`, the doubles just either side of every limit, negative sizes; `null` where nullable) | no call throws; every number in a result is finite | 200 / 10 000 |
| P-3.9 | 3.9 | azimuth `[0, 2π)` (ends, `2π − 1e-12` and values that round up at each `decimals` drawn), `decimals ∈ [0, 4]` | the text parses to a number in `[0, 360)` and its wrapped difference from `toDeg(azimuth)` is at most `0.5·10^-d + 1e-9` | 200 / 100 000 |
| P-3.10 | 3.10 | angle `[-π, π]`, `decimals ∈ [0, 4]`, plus draws within `10^-(d+1)` of zero | `parseDegrees` of the text (without the `°`) differs from the angle by at most `0.5·10^-d + 1e-9` degrees; the text has no minus sign when `Number(text) === 0` | 200 / 100 000 |
| P-3.11 | 3.3, 3.11 | every `UiReason`; `field`, `id` and `errorName` each absent or a string of 0 to 40 characters from the full BMP, or the reason's own code, `NaN` or `undefined` as text; `reportedAccuracyM` any double | the Message equals that of the same failure without `field`, `id` and `errorName`; every part is one sentence ≤ 160 characters ending in a full stop, containing none of the reason's code, `_`, `NaN`, `Infinity`, `undefined`, `null`, `[object` | 200 / 20 000 |
| P-4.6 | 4.6 | `calibration` valid; and one invalid draw per case of 4.1 | valid accepted unchanged; each invalid one fails with `invalid_number` naming the field of Req 4.1 in its order | 200 / 100 000 |
| P-4.7 | 4.7 | `sourceSize`, a diagonal `calibration` from the full domain of Req 4.6 (`fovSigmaRad` in `[0.01°, 5°]`); the width and height equivalents `2·atan((w/diag)·tan(fov/2))`, each with its own valid `fovSigmaRad` in `[0.01°, min(5°, 0.9·fov')]` (the sigma plays no part in the focal length) | `focalLengthSourcePx` equal within relative `1e-12` for the three | 200 / 100 000 |
| P-5.7 | 5.7 | `layoutCase`, `pointInOffsetSpace` | `rayOffsetToPoint(pointToRayOffset(p))` returns `p` within `1e-9` CSS px | 200 / 100 000 |
| P-5.8 | 5.8 | `layoutCase`, `rayOffset` | over the whole closed range, `offsetOfPixel` (the unchecked geometry of Req 5.2, internal) of `rayOffsetToPoint(o)` returns `o` within `1e-9` rad, the point not being required to lie in the Element (Req 5.8); where the point is inside the Element and on the image **and the offset is at least `1e-6` rad inside ±80°** (the standing rule for limits, D26), `pointToRayOffset` returns it too. The exact ±80° has an example test | 200 / 100 000 |
| P-5.9 | 5.9 | `layoutCase` | the Element centre gives `(0, 0)` within `1e-12` rad | 200 / 100 000 |
| P-5.10 | 5.10 | `layoutCase`, `pointInOffsetSpace` | right of centre ⇒ `rightRad > 0`, below ⇒ `upRad < 0`; the mirrored point (`ew − x`, `eh − y`) gives the negated offset within `1e-9` rad | 200 / 100 000 |
| P-5.11 | 5.11 | `layoutCase`, point, `k ∈ [0.25, 4]` | the layout and point scaled by `k` (source unchanged, the element scaled, same fit) give the same offset within `1e-9` rad | 200 / 100 000 |
| P-5.12 | 5.12 | `sourceSize`, `elementSize`, fit | `cover` covers the Element within `1e-9`, `contain` lies inside it; aspect within relative `1e-12`; centred within `1e-9` | 200 / 100 000 |
| P-5.13 | 5.13 | `layoutCase` (`contain`), calibration of any size with the source's aspect, axis each | edge, edge and corner points give `fovRad/2` within `1e-9` rad (with the corner's angle measured through Sensors' `offAxisRay` at the identity rotation). The calibration's image size differs from the source's (same aspect), which is what D7 is for | 200 / 100 000 |
| P-5.14 | 5.14 | `layoutCase`, `pointInOffsetSpace`, a `DeviceRotation` of Sensors' domain (`α [0, 2π)`, `β [−π, π)`, `γ [−π/2, π/2)`) | the angle between `offAxisRay(R, offset)` and `cameraAxis(R)` equals `atan(r/F)` within `1e-9` rad | 200 / 100 000 |
| P-5.15 | 5.15 | `layoutCase` (three draws in four) or `fieldOfViewStressCase` (one in four: a 64-wide tall source in a narrow tall Element, field of view along the width, so that the ordinary draws' 0.6 % of field-of-view refusals become common), points in pixel space inside the Element at least `1e-6` rad from the limit and `1e-6` px from an image edge | accepted iff both components are within `MAX_RAY_OFFSET_RAD` and (under `contain`) on the image | 200 / 100 000 |
| P-6.4 | 6.4 | `layoutCase`, `pointInOffsetSpace`, `tapSigmaPx ∈ [0, 50]` | finite; `≥ εTap` up to one ulp of rounding in `hypot`; at the Element centre equals `εTap` within `1e-12` | 200 / 100 000 |
| P-6.5 | 6.5 | as P-6.4 with offsets within **±75°** (Req 6.5) | the angle between Sensors' `offAxisRay(identity, ·)` of the pixel under `fovRad` and under `fovRad ± fovSigmaRad` is at most the sigma plus `1e-9` rad. At ±75° the same pixel under `fovRad + fovSigmaRad` stays inside the `80°` Sensors accepts (`78°` at the worst draw) | 200 / 100 000 |
| P-8.9 | 8.9 | `sessionRun` | `step` never throws; every number in the Session after every event is finite (deep scan, including the history, readout, Frozen sighting and captured result) | 200 / 5 000 |
| P-8.10 | 8.10 | `sessionRun` | every consecutive pair of states is in the table of Req 8.3 or equal | 200 / 5 000 |
| P-8.11 | 8.11 | `sessionRun`, run twice, states deep-frozen before each `step` | the two runs are deep-equal (`Object.is` on numbers) and no `step` modified its arguments (a frozen object throws on write in strict mode, caught and failed) | 200 / 2 000 |
| P-8.12 | 8.12 | `sessionRun` | each failure a **data** event carries is, with its reason, in the `failure` or `notice` of the Session that same `step` returned, recorded at `max(previous Session time, event time)` (Req 8.16), in a Session of either kind and in every state (Req 8.12, D5); an action event that fits no transition gets `action_not_available` | 200 / 5 000 |
| P-9.9 | 9.9 | `scriptHistory` in one frame, with a Yaw reference of the matching frame (compass or known azimuth), a Declination, no Frame reset in the window, a valid Position fix; window ending at the newest sample | readout azimuth equals `captureBearing`'s azimuth within `1e-9` rad (wrapped); the readout's North reference matches the case table of Sensors' §7.9; apparent altitude equals `captureAltitude`'s within `1e-12`; the Spread, where `captureBearing`'s sigma exceeds its floor, equals `sqrt(sigma² − northSigma²)` within `1e-9`, which checks that the readout feeds Sensors' Spread the azimuths the capture does | 200 / 20 000 |
| P-9.10 | 9.10 | a list of 0 to 500 samples with increasing times (from the Simulator, `eventIntervalMs ∈ [5, 100]`), interval `∈ [50, 2000]` | publications `≤ floor(span/interval) + 1`; consecutive publication times differ by `≥ interval`; the history equals the one built by adding every sample | 200 / 20 000 |
| P-9.11 | 9.11 | azimuth sets within `30°` of a common direction, `δ ∈ [0, 2π)` | adding `δ` adds `δ` to the readout azimuth within `1e-9` (wrapped); Spread and steadiness unchanged within `1e-12` | 200 / 20 000 |
| P-10.1 | 10.1 | `scriptHistory` with a drawn window, minimum count, staleness | `freeze` fails with `insufficient_samples` or `stale_samples` exactly when, and with the reason with which, `captureAltitude` on the same window fails (the window ends at max(Session time, freeze time), Req 8.16; the property counts the freezes stamped earlier than the Session's time; a design property: both go through Sensors' `selectWindow`, and this holds them to the same parameters) | 200 / 20 000 |
| P-10.8 | 10.8 | `sessionRun` that reaches `frozen`, then any extra events before `capture` | the Frozen sighting and the capture equal those of the run without the extra events | 200 / 5 000 |
| P-10.9 | 10.9 | `scriptHistory` allowing a freeze (≥ min fresh samples, Screen angle `0`) | `frozen.history` is the Session's history at the event: same samples, same resets, same fix | 200 / 20 000 |
| P-10.10 | 10.10 | `layoutCase`, points, calibration; and failing points | the Mark's offset equals `pointToRayOffset`'s within `1e-12`; after a failing `mark` the Mark equals the previous Mark | 200 / 20 000 |
| P-11.7 | 11.7 | `scriptHistory` with Yaw references of either frame established **no later than the window's start** (Req 11.7), ages and maximum ages `[1000, 150 000]` ms, Frame resets of all causes | `yawStatus` and Sensors' `captureBearing` agree as Req 11.7 states: `valid` iff no `frame_reset`/`stale_yaw_reference`; `invalidated` iff `frame_reset`; `stale` only with `stale_yaw_reference`. A reference established inside the window is an example test. | 200 / 20 000 |
| P-11.8 | 11.8 | `yawStatus` over references and times, `nowUtcMs` before and after `establishedUtcMs` | age equals `max(0, now − established)`; never negative; never `NaN` | 200 / 100 000 |
| P-11.9 | 11.9 | `sessionRun` (times that do not increase, hostile events) | for every Frame reset the Session accepts (its history changed, no Notice; counted whether or not retention keeps it) that invalidates the reference held then (its cause invalidates the frame, its time not earlier than the reference's): from the delivering event on, while the Session holds that reference or another of the same frame established no later than the reset's time, (a) `yawStatus` is never `valid` and (b) no bearing capture succeeds with such a reference for a sighting frozen after that event. Reports the resets by state, the other references followed, and the captures attempted under (b) with their outcomes | 200 / 5 000 |
| P-12.8 | 12.8 | frozen history, `rayOffset` from `pointInOffsetSpace` | the capture's azimuth (altitude) equals Sensors' called with the offset within `1e-12` (wrapped); sigma equals `hypot(σ, ε/cos h)` (`hypot(σ, ε)`) within `1e-12`; with no Mark the result is deep-equal to Sensors' | 200 / 20 000 |
| P-12.9 | 12.9 | `sessionRun` frozen, then any events before `capture` | the result is unchanged (as P-10.8, on the captured result) | 200 / 5 000 |
| P-12.10 | 12.10 | as P-12.8 | the sigma with a Mark is at least Sensors' sigma for the same capture with the Mark's Ray offset (not the Camera-axis capture, whose Spread differs) | 200 / 20 000 |
| P-13.10 | 13.10 | two colours from 8-bit sRGB (ends, equal pairs, black and white drawn) | symmetric; in `[1, 21]`; `1` for equal within `1e-12`; `21` for black/white within `1e-9` | 200 / 100 000 |
| P-14.7 | 14.7 | any collection produced by the map functions | `JSON.parse(JSON.stringify(c))` deep-equals `c`; every feature has `kind` and `id` | 200 / 10 000 |
| P-14.8 | 14.8 | `bearingCase` | end of the line at `L` within `1e-4` m and at the azimuth within `1e-9` rad (Core `greatCircleDistanceM`, `initialAzimuthRad`); every arc vertex at `L` within `1e-4` m, azimuth within `[az − σ, az + σ]` ± `1e-9`; ends at the edges within `1e-9`; spacing `≤ step + 2e-9` (Req 14.8: a difference of two azimuths, each known within `1e-9`) | 200 / 10 000 |
| P-14.9 | 14.9 | `fixCase` | every vertex, projected with `projectToLocalPlane` and expressed in the axes, satisfies `(u/a)² + (v/b)² = 1` within `1e-9 + 2e-4/b` | 200 / 10 000 |
| P-14.10 | 14.10 | `fixCase` | ring closed (`Object.is`), counter-clockwise (signed area `> 0` in the Local plane), mean of the distinct vertices within `1e-4 + 1e-9·a` m of the Fix, vertex 0 at distance `a` within `1e-4 + 1e-9·a`, `a/semiMajor = 2.4477` within `1e-9` (the literal) | 200 / 10 000 |
| P-14.11 | 14.11 | `fixCase` | each edge midpoint satisfies `(u/a)² + (v/b)² = cos²(π/N)` within `1e-9 + 2e-4/b` | 200 / 10 000 |
| P-14.12 | 14.12 | `fixCase` with a broken Ellipse (a semi-axis `0`, negative, `NaN`, `Infinity`, or `semiMinorM > semiMajorM`) | `fixFeatures` fails and returns no feature | 200 / 10 000 |
| P-14.13 | 14.13 | sets of `bearingFeatures` and `fixFeatures` within 500 km, longitudes within `(−170°, 170°)`; and sets straddling `±180°` | every coordinate inside `mapBounds`; straddling sets give `crosses_antimeridian` | 200 / 10 000 |
| P-15.11 | 15.11 | (**adapters** project) up to 100 calls to a `MapAdapter` over `FakeMapLibre`, valid and invalid arguments | the Fix source holds a Point iff it holds exactly one ellipse Polygon; at most one Point; empty after `clearFix` or a failed `setFix`; after a successful `setFix(f)` deep-equal to `fixFeatures(f)` | 200 / 2 000 |
| P-15.12 | 15.12 | (**adapters** project) as P-15.11 | the data of every source equals the data built from the last arguments given to its operation | 200 / 2 000 |
| P-16.7 | 16.7 | `sceneCase` with the true rotation of the pose from `controls.trueRotation()` (a Simulator on a noise-free Absolute-frame script, Declination `0`, aimed at the pose) | for every visible Target, the Pixel point through `pointToRayOffset` and Sensors' `offAxisRay` at the next Orientation sample's rotation gives the Target's true direction within `1e-9` rad of angle. The only code between the Target and the Pixel point is `projectScene`, Sensors' inverse and `rayOffsetToPoint`; the check goes the other way through different code (Req 5.2 and Sensors' forward ray) | 200 / 10 000 |
| P-16.8 | 16.8 | `sceneCase` with a noise-free script, both frames (Relative with a compass Yaw reference), a constant pose, ≥ min samples, a visible Target (inside the Element and on the image) | the Session through `freeze`, `mark` at the Target's pixel and `capture` gives a Bearing azimuth equal to the Target's true azimuth within `1e-8` rad (wrapped) and, for an altitude Session, the Target's altitude within `1e-8`. **Capped**: each case runs a Simulator and a Session | **200 / 10 000** |
| P-16.9 | 16.9 | `sceneCase` with landmarks at height `0` (altitude `0`), drawn azimuths | every landmark `projectScene` reports visible lies within `1e-6` CSS px of the horizon line it returns (the line is built from the foot above 45° of altitude and from `Ac ± 20°` below; the pose's altitude is drawn at least 1e-6 rad inside ±80°, D26); a Target behind the camera is not visible; the line is `null` only when a landmark could not be visible either | 200 / 10 000 |
| P-16.10 | 16.10 | `sceneCase` | `targetDirection` is finite, azimuth in `[0, 2π)`, altitude in `[-π/2, π/2]` | 200 / 10 000 |
| P-17.8 | 17.8 | up to 200 `PanelAction`s, speeds each of three, `tickMs ∈ [10, 1000]` | simulated time never decreases except at restart; equals `start` plus the sum of `tickMs × speed` of ticks while playing and steps within relative `1e-12`; no advance while paused; no `advancesToUtcMs` step exceeds `MAX_SIMULATOR_ADVANCE_MS` | 200 / 5 000 |
| P-17.12 | 17.12 | `dragCase`, and the opposite drag | finite pose, azimuth in `[0, 2π)`, altitude in `[−80°, 80°]`, roll unchanged; zero drag returns the pose within `1e-12`; a horizontal drag (`dy = 0`) then the opposite one returns the azimuth within `1e-9` (wrapped); any drag then the opposite one returns the altitude within `1e-9` when neither step hit the limit | 200 / 100 000 |

P-14.7 is not a FOR ALL criterion; it is a design property (Req 14.7 states a fact about every collection, and a property is the cheapest way to hold it).

**No property is expected to fail.** The three that the first design expected to fail against the requirements as written (P-5.13, P-6.5 at ±79°, P-14.8's spacing) were requirement bugs, and the requirements are amended. A failing property is still classified before anything changes.

## 9. Example and component tests

**Math layer examples** (beside each file): `εTap = 1/500` at `F = 500`, `tapSigmaPx = 1` (Req 6.6); each failure reason of `pointToRayOffset` in the order of Req 5.4, and the `80°` limit on both sides; a layout of a `720 × 1280` source in a `390 × 844` element under both fits, by hand; `formatAzimuthDeg(2π − 1e-9, 1) === '0.0'`; `parseDegrees` of `'12.5°'`, `' -3 '`, `'1e3'` (fails), `'Infinity'` (fails), `''` (fails); one example per Session transition (Req 8.3) and per Notice; `yawStatus` of a reference established inside the window (the case Req 11.7 leaves to an example); Req 14.14 (bearing due north from the equator; a circular Fix of 1-sigma `10 m` gives a ring of radius `24.477 m` within `1e-4` m); Req 16.11 (a landmark `1000 m` east and `100 m` high: azimuth `π/2` within `1e-9`, altitude `atan(0.1)` within `1e-12`); the catalogue (Req 17.2, 17.3: each scene's script validates under `createSimulator`, starts on a Target, holds its pose; each scene's Message differs; the origin is in the WMM window and outside the blackout zone, D16); `MESSAGES` completeness (Req 3.2) and `MUST_MENTION` (Req 3.7).

**Adapter examples** (Req 7.11, 15.13), against `FakeCameraSurface` and `FakeMapLibre`: every camera reason of Req 7.2, 7.4 (one test per name of the mapping, and an unknown name, a non-error rejection and a throwing surface), 7.5 (user, environment, none, `left`), 7.7, 7.8 (stop while pending, a late stream stopped, a second stop), 7.9, 7.10 (no fake track left running after every failure path, checked on the fake). Map: `map_unavailable` from a throwing constructor, each tile-source rule, no tile source (no raster source in the style, no network call recorded), the style has no `glyphs`/`sprite`/text layer, layer order and widths, `tiles_unavailable` throttled to one per interval with the `FakeTimer`, writes held until `load`, `destroy` removes the map once and later calls return `action_not_available`, no control other than attribution is added.

**Component tests** (`components` project, jsdom, Testing Library): `Reticle` (core line ≥ 2 px, outline ≥ 1 px, gap ≥ 8 px from its style values); `MarkRing` (≥ 24 px, repositioned from the offset when the element size changes: resize with the injected observer); `Readout` (font ≥ 20, the word for each North reference, `relative` never alone); `ControlBar` (every control ≥ 48 × 48, gaps ≥ 8, Freeze and Capture ≥ 64 tall, in the lower part); `FailureNotice` for **every** `UiReason`, asserting the rendered text equals `messageFor`'s and contains neither the code nor the field; `YawStatusBar` for each status with the age text and the prompt for `stale` and `invalidated`; `CaptureSummary` (sigma beside the bearing, the composition of the uncertainty, the limits line); `ImageSurface` (a tap while `frozen` calls `onMark` with the pointer's point; a drag while `live` calls `onAim` with the deltas and a drag while `frozen` does not; arrow keys in `1°` steps; no second finger, no long press); `CameraImage` (`attach` on mount and detach on unmount, `pause` on freeze); `SceneImage` (draws the horizon, visible Targets with labels, the Sun disc, and no text with a direction); `MapView` over `FakeMapLibre`; `SimulatorPanel` over the real Simulator and a `FakeTimer` (Req 17.4 to 17.7, 17.10, 17.11); the **session driver** over the real Simulator (Req 9.12): permission denied, permission required, sensor missing, insecure context, a start that settles, a restart, the unsubscription; a table-driven test of every transition of Req 8.3 through the driver (Req 21.4).

**The Playground integration test** (Req 18.9, `playground/Playground.integration.test.tsx`): simulator mode with `FakeTimer`, `FakeCameraSurface` and `FakeMapLibre`; choose the steady scene, press Start, advance until `live`, Freeze, mark the first Target, Capture, change the Station, again to Capture; on the fake map: two observers, two wedges, one Fix and its ellipse, the Bearings' azimuths equal the Targets' true directions within `1e-8` rad, and the scene's target Position lies inside the Fix's 95 % ellipse. The same with the permission-denied scene shows its Message. The declination of the scripts is `declinationAt` of D16, so the test recovers the true azimuth with no north error.

## 10. Purity, packaging and the Playground

**`purity.test.ts`** (a `math`-project test, reading source files with comments and strings stripped; each rule is checked against a copy of a real source with its token added, so the test is not vacuous):
- `src/math/**` imports nothing from `react`, `react-dom`, `maplibre-gl`, `components`, `adapters`, `playground`; only `@alidade/core`, `@alidade/sensors` and relative paths.
- No `document`, `window`, `navigator`, `screen`, `localStorage`, `fetch`, `Date.now`, `new Date`, `performance`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `Math.random`, `crypto`, `import(` or `import.meta` in `src/math/**`, `src/adapters/**` (except `browser-camera-surface.ts` for `navigator`) or `src/components/**` (except `dom-size.ts` for `ResizeObserver`, and the components' use of the DOM through React).
- `DeviceOrientationEvent`, `geolocation`, `permissions`, `screen.orientation`, `visibilitychange`, `userAgent` nowhere (Req 1.3).
- `mediaDevices`, `MediaStream`, `MediaStreamTrack` only in `src/adapters/camera/`; `from 'maplibre-gl'` and `import('maplibre-gl')` only in `maplibre-loader.ts`, and only as a dynamic import (Req 1.4); and a test that imports `src/index.ts` with `maplibre-gl` mocked to throw on load shows the package index loads.
- `setInterval`, `clearInterval` and `Date.now` only in `playground/system-timer.ts` (Req 1.5).
- The only literal degree conversion is in `degrees.ts` (`Math.PI / 180`, `180 / Math.PI`, `Math.PI/180`; Req 1.10).
- **Nothing that Sensors owns is repeated** (Req 16.4, Sensors 1.10): `alphaRad`, `betaRad`, `gammaRad` are read nowhere in `src/` or `playground/` (a rotation matrix needs them); `Math.log`, `Math.log1p` and `Math.atan2(` are absent from `src/math/session/` (no Spread, no inverse ray); the string `frame_change` is absent from non-test sources (the invalidation rule is `invalidates`); `UI_REASONS` is built from `SENSOR_REASONS` (the test imports both and checks the first starts with the second).
- `package.json`: `dependencies` are exactly the five of Req 1.1 with `react`, `react-dom`, `maplibre-gl` at exact versions and the two `workspace:*`; no `^` or `~` anywhere in `dependencies` or `devDependencies`; `exports` is only `"."`; no `.env` file is tracked (`git ls-files` is not available in the test; the test reads `.gitignore` and checks `.env.example` exists and holds no value after `=` except placeholders).
- The list of non-test source files is fixed in the test; adding one without updating it fails.
- `src/index.ts` exports nothing from `playground` or `test-support`.

**Scripts.** `test`: `vitest run`. `test:deep`: `vitest run --config vitest.deep.config.ts`. `typecheck`: `tsc --noEmit -p tsconfig.json` (covers `src`, `playground`, the configs). `dev`: `vite --config playground/vite.config.ts` (never run by a task). `build:playground`: `vite build --config playground/vite.config.ts` (D19).

**Playground wiring.** `main.tsx` reads `import.meta.env.VITE_TILE_URL_TEMPLATE` (whitespace-separated templates) and `VITE_TILE_ATTRIBUTION` and passes a `TileSource` or `null` (Req 18.5); `vite.config.ts` sets `root: 'playground'`, `envDir: '..'`, `oxc.jsx.runtime: 'automatic'`, `build.outDir: 'dist'`. Device mode: `createBrowserSensorSource(browserEnvironment(), systemClock, options)`, `createCameraAdapter(browserCameraSurface())`, `createMapAdapter(await loadMapLibre(), …)`. Simulator mode: the catalogue, `createSimulator`, `SceneImage`. **Calibration form** (Req 18.3): FOV in degrees, axis, FOV 1-sigma in degrees, tap 1-sigma in CSS pixels, and an optional requested width and height for the camera (Req 18.3); the calibration's image size is taken from the running stream's size at the moment "Apply" is pressed, so a later change of aspect ratio is a `calibration_mismatch` and not silent. **Diagnostics** (Req 18.6): `eventRateHz(timestamps, endUtcMs, windowMs)` over the samples of the last second, the frame, Screen angle, heading and reported accuracy of the newest sample, the Frame resets list, and the Yaw-from-known-azimuth form with the difference to a second azimuth (`wrapPi(second − applied)`); numbers on screen only, no storage, no network but the tiles (Req 18.7), no `localStorage`.

## 11. Flags

### What became of the first flags

| Flag | Resolution |
|---|---|
| F1 focal length | accepted; Req 4.3, 5.2 amended; D7; P-5.13 passes with the displayed focal length |
| F2 `±79°` | accepted; Req 6.5 is `±75°` |
| F3 spacing tolerance | accepted; Req 14.8 is `+2e-9` |
| F4 Yaw status domain | accepted; Req 11.7 states the domain |
| F5 swallowed failures | accepted as D5; Req 8.4, 8.12 rewritten; a failure is never dropped in a Session of either kind |
| F6 true rotation | **not option (a)**: Sensors gets `trueRotation()` and the inverse of the Off-axis ray; the UI has no rotation matrix (D14, §7.13) |
| F7 summaries | Sensors exports `selectWindow`, `resetBetween`, the two summaries (made total, with the `log1p` Spread), `invalidates`, `SENSOR_REASONS` (D2, D8, §7.6 to §7.8) |
| F8 `@testing-library/dom` | accepted; Req 20.2 lists it |
| F9 requested size | accepted; Req 18.3, 7.3 |
| F10 `establishYaw` in `frozen` | accepted; Req 11.1, 10.3; D24 |
| F11 degree literals | accepted; Req 1.10 |
| F12 `aimAfterDrag` | accepted with the `cos h` factor; Req 17.10, 17.12; §7.13 |
| F13 unverified assumptions | still open, and task 1 checks them (§3) |
| F14 capped counts | still stands; the first checkpoint measures them (§8) |

### Found since

**G1. A leftover in Req 16.3.** The signature read `projectScene(scene, station, truePose, layout)` while the text says it takes the true Device rotation. I changed the parameter to `trueRotation` (see the list of edits below).

**G2. One export beyond Sensors Req 1.10.** The Live readout asks whether a Frame reset lies in its window (Sensors' rule of Req 8.8), and writing `frameResets.some(...)` is the repetition you asked me to avoid. Sensors now also exports `resetBetween` (D25 of skeleton-sensors). It is not in the list of Sensors 1.10, which names the window selection, the summaries, the invalidation rule and the reasons. If you want the list to stay exact, the alternative is four lines in the UI.

**G3. Req 20.6 covers the packages the specification adds, not what they bring.** §3 states it and offers a pnpm minimum-release-age setting for the whole install. I did not apply it.

**G4. Two versions are behind the registry on purpose** (`jsdom` `30.1.3`, `maplibre-gl` `6.16.0`; §3). The newer ones are 5 and 1 days old.

**G5. The `rule` hairline is below 7 : 1** by design (§7.18). You said every pair; I read "pair" as text and information-bearing lines and left separators to 3 : 1. One word from you and it moves.

**G6. A reading I took in the readout.** The Live readout shows what it has (a minimum of one sample), so it calls `selectWindow` with `minSampleCount: 1` and a staleness limit equal to the window's length, which no selected sample can exceed, and reports staleness itself (§7.7). It is a use of Sensors' function, not a copy of its rule, but it is a way of calling it that Sensors' tests do not cover; P-9.9 and P-10.1 do.

### Edits I made to your text

- **Req 16.3**: the parameter `truePose` is now `trueRotation` (the sentence already said Device rotation).
- Earlier, and unchanged: Req 7.3, the introduction's dependency paragraph and the glossary entries True pose and Aim.

I changed nothing else and I did not revert any of yours.
