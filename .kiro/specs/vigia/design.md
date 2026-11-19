# Design Document: vigia

Application: `apps/vigia` (`@alidade/vigia`). Source of truth: `requirements.md` in this folder, as updated after the lead's design review (its "Decisions of the design review" and the "Decided" notes under its open questions). Section and decision references (`D7`, `§7.6`) point into this file; `Req N.M` points into the requirements; `UI Req` and `Sensors Req` point into the skeleton's. The skeleton as built (83de509), with the two additions of G5 and G6 that are built before Vigia's tasks, is the only code this design relies on, and it relies on it through the three `src/index.ts` files alone.

This is a design, not a task list and not code. The order of the work is the requirements' own: the core flow first (sighting, Incident, Fix and words, geometry and advice, the code, link, QR and text, the Emergency text, privacy, the reviewer's path), then the wind Overlay, separable (D15, Req 1.10). **The hotspot Overlay is the second release:** its design sections stay, each marked "second release: built only on the lead's word after the wind checkpoint"; it is in no count of the first release and in no task group of it, and the Overlays' registry has the wind Overlay alone until then.

## 1. Context and scope

Vigia is the "many observers at known positions, one unknown target" application. It adds to the skeleton what only it needs: the Incident and its storage, the sighting code, the Transport, the words, the Overlays and the reviewer's path. Everything general it needs is in the skeleton or approved to be built there first (G1 to G3 are built and exported; G5 and G6 follow): `setLayer` through `MapView`'s `layers` prop, `appFeature`, `sceneFromOffsets` and `scriptForStation`. This design adds nothing to `skeleton/`. The skeleton gains two things before Vigia's tasks, built in a later session: Core exports its two thresholds (`OUTLIER_STUDENTISED_RESIDUAL`, the normalised-residual limit of the outlier rule, and `POOR_GEOMETRY_CROSSING_RAD`, the crossing angle of `poor_geometry`; G5) and `@alidade/ui` exports a `DeviceSighting` component moved out of the Playground (G6). This design is written against those names and Vigia keeps no copy of either.

**Three consequences of the requirements shape the design** (they are the introduction's three, restated as design rules).

1. *No position without its uncertainty.* Every text function takes a Core `Fix` (which always has its Ellipse) or a `Bearing` (which always has its sigma). No function takes a bare `Position` to be printed. The words are built from one formatter module so that a position and its metres are produced by the same call (D9, §7.8).
2. *Two Bearings cannot check each other, and Core checks from four.* The partition (§7.6) sets aside by Core's own rule only; the statements by count (§7.7) say what can and cannot be checked; and the claim of Req 5.5 that three Bearings cannot tell which one is off is measured by a statistical test against Core's residuals (P-5.13).
3. *An observer's position is personal data.* The sighting code is the only thing that leaves the phone, and only through a Share action; the privacy table is data in the code and in `docs/`, kept in step by a test (D20).

**What this design leaves to later:** the tasks (a separate file), the two skeleton additions (G5, G6), the hotspot Overlay (second release), the relay (owner's question O1), and everything under "Out of scope" of the requirements.

## 2. Conventions adherence

- **Units and names** (`math-conventions.md`): every number carries its suffix. Degrees (`Deg`) exist only where the requirements put an I/O boundary: the sighting code's fields (§8), an Overlay response, the Emergency text and the words, and the wind request point of §7.15 (`windGridDeg`; the hotspot Overlay of the second release adds `hotspotGridDeg` and an area in square degrees, flag F18). Inside the Math layer every angle is radians, every time `UtcMs`, every duration `Ms`, every length `M`. Conversion between degrees and radians is in one module, `math/degrees.ts`, which calls Core's `degToRad` and `radToDeg`; a purity rule forbids the literal factors elsewhere (UI's rule, Req 1.7 here).
- **Sphere only.** Positions are `{ latRad, lonRad }`; distances and azimuths come from Core (`greatCircleDistanceM`, `initialAzimuthRad`, `destinationPosition`); the Local plane from Core (`projectToLocalPlane`, `unprojectToLocalPlane`). No ellipsoid and no second copy of the Earth's radius: the one place that needs metres per degree computes it once with `greatCircleDistanceM` of one degree of latitude (§7.8).
- **Time.** The Math layer never reads a clock: every function that needs "now" takes `nowUtcMs`. The Clock is the type `() => number` that Sensors' `systemClock` has; the one module that reads the real one is `src/system.ts`. UTC clock text and calendar arithmetic are done by integer arithmetic (§7.1), not with `Date`.
- **Angles.** Differences by `wrapPi`; the circular mean is not needed anywhere in Vigia. Azimuths are always labelled true (the Bearing's azimuth is true by Core's definition).
- **Numbers.** No `NaN` or infinity leaves a public function (Req 2.1); the closed set of reasons is `VigiaReason` (D2). Floating-point values are never compared with `===` except where a value was copied, never computed.
- **Tests.** `testing.md` as in the skeleton: properties with `fast-check`, at least 200 cases, a comment above each naming the property and the requirements; fixtures read-only; shrunk counterexamples kept; no real network, camera, clock or randomness.
- **Standing rules.** `notes/` is not read. Every scene, Station, code and fixture is synthetic, built from the origin `30° N, 40° W` (Req 17.8). No dependency is added except `uqr@0.1.3`, approved by the lead (§3.2). `pnpm test` runs once and exits; no task starts a dev server, a watch mode or `vite` except the one `build` of the final checkpoint.

## 3. Dependencies

### 3.1 What is pinned

`apps/vigia/package.json` uses the same exact versions as `skeleton/ui` (Req 20.1); nothing is read from a registry for them, they are already in `pnpm-lock.yaml`.

| Package | Version | Kind | Why |
|---|---|---|---|
| `@alidade/core`, `@alidade/sensors`, `@alidade/ui` | `workspace:*` | dependency | the skeleton |
| `react`, `react-dom` | `19.3.1` | dependency | `tech.md`; the screens |
| `maplibre-gl` | `6.16.0` | dependency | its **stylesheet only**, imported once at the entry (Req 18.2); the library itself is loaded by UI's loader |
| `vite` | `8.3.8` | devDependency | the build; JSX by its built-in transform (`oxc.jsx.runtime: 'automatic'`), no plugin, as UI |
| `typescript` | `6.0.3`, `vitest` `5.1.0`, `fast-check` `4.10.2` | devDependency | as UI |
| `jsdom` | `30.1.3`, `@testing-library/react` `16.3.3`, `@testing-library/dom` `10.4.2` | devDependency | the component tests, as UI |
| `@types/react` `19.3.0`, `@types/react-dom` `19.3.0` | | devDependency | `strict` type checking of the components |
| `uqr` | `0.1.3` | dependency | the Sighting QR's encoder, the one new dependency (Req 10.5, 20.4); approved by the lead; installed in the scaffold task with `pnpm add -E` from `apps/vigia` (§3.2) |

The repository root needs no new dependency. Its `eslint.config.js` gains one block for `apps/vigia/**` (§13). `pnpm-workspace.yaml` already lists `apps/*`, and its `minimumReleaseAge: 20160` (14 days) makes `pnpm add` refuse a version that is too new, which enforces Req 20.2 by the tool as well as by the check below. The list `minimumReleaseAgeExclude` must not grow.

### 3.2 The QR encoder: `uqr@0.1.3`, approved (the candidates stay as the record)

**What is needed.** A function from text (the Sighting link, at most `MAX_LINK_LENGTH_CHARS` = 160 characters, about 77 for a link on a typical host with a 50-character code) to a square matrix of dark and light modules, so that Vigia draws it as an inline SVG itself (no `<img>`, no canvas: Req 11.1 forbids a remote `src`, and an SVG built from the matrix needs no DOM beyond React). Error correction level `M` (15 %), byte mode (the host is lower case). Nothing else: no decoder (Req 10.5), no PNG, no terminal output.

**Version needed.** Byte-mode capacity at level M is 84 characters in version 5 (37 × 37 modules), 106 in version 6, 122 in version 7, 152 in version 8 and 180 in version 9 (53 × 53). A link of 77 characters is version 5; the largest allowed link, 160, is version 9. With four modules of quiet zone, version 9 is 61 modules across: on a 360 CSS-pixel screen, 5.9 px a module. (Capacities are from the QR standard as I know it, not read from a source in this session; the encoder reports the version it chose and the adapter's test checks `size = 4 · version + 17`.)

**Candidates**, read from the registry on 2026-11-18 with `npm view <name> time`, `version`, `license`, `dist.unpackedSize`, `dependencies` and `types` (nothing was installed). The 14-day cut-off is 2026-11-04.

| Package | Version | Licence | Unpacked size | Published | Age (days) | 14-day rule | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|
| `uqr` | `0.1.3` | MIT | 79 278 B | 2026-04-03 | 229 | passes | none | ES module with types; `encode(text, { ecc, border })` returns `{ data: boolean[][], version, size }` (its README); zero dependency; pre-1.0 (9 releases since 2023-08) |
| `lean-qr` | `2.7.4` | MIT | 68 780 B | 2026-09-07 | 72 | passes | none | ISO 18004, under 4 kB compressed (its README); 29 releases since 2021; its output helpers are canvas, PNG, SVG and text; the matrix accessor is not in the README I read; its README warns that jsdom has no `TextEncoder` (our component tests run in jsdom) |
| `qr` (paulmillr) | `0.7.2` | MIT or Apache-2.0 | 539 239 B | 2026-09-28 | 51 | passes | none | encoder and decoder in one package; rejected for Req 10.5 and 20.4 (no decoder), though it is tree-shakable |
| `qrcode-generator` | `2.0.4` | MIT | 555 539 B | 2025-08-07 | 468 | passes | none | long-lived (24 releases since 2014); large unpacked (many builds); older API |
| `@nuintun/qrcode` | `5.1.0` | MIT | 511 675 B | 2026-11-05 | 13 | **fails** | `tslib ^2.9.1` | encoder and decoder; too new |
| `qrcode` | `1.5.4` | MIT | 135 364 B | 2024-08-05 | 835 | passes | `pngjs`, `yargs`, `dijkstrajs` | Node-oriented dependencies; rejected |
| `qrcode-svg` `1.1.0`, `nayuki-qr-code-generator` `1.8.0` | | MIT | 249 kB, 51 kB | 2022 | | passes | | not maintained since 2022; not considered further |

**Decided by the lead: `uqr` at the exact version `0.1.3`.** It is the smallest surface that does the one thing: zero dependencies, an ES module with types, and an output that is already the plain matrix Vigia wants, so rendering, the quiet zone and the colours stay in Vigia's own component and the adapter can be tested in jsdom with no polyfill. It passes the 14-day rule with a 229-day margin. Its risks are that it is pre-1.0 (its API may change, which an exact pin and an adapter test contain) and that I have read its README and registry entry but not its source. **Runner-up, not chosen: `lean-qr` at `2.7.4`**, if the lead had preferred a library that claims ISO compliance and tiny size; its matrix accessor would have to be confirmed, and the jsdom `TextEncoder` note applies. Neither choice changes anything else in the design: the adapter `adapters/qr-encoder.ts` is the only module that names the package (D13).

**Procedure** (the scaffold task; not done in this step): `pnpm add -E uqr@0.1.3` from `apps/vigia`, with the output of `npm view uqr time --json` recorded in the task's report (publication date `2026-04-03`, at least 14 days before the install), the exit code read, the lock file diff reported, and the bundle cost measured by `build` (the size claim is unverified: Flag F19).

## 4. Design decisions

- **D1 — Three layers by folder, three Vitest projects, and the Overlays inside them (Req 1.1 to 1.3, 1.10, 21.1 to 21.3).** The folders are the layers, as in UI (UI D1): the layer of a file is the nearest folder named `math`, `adapters` or `components` on its path under `src/`, so the Overlays (`src/overlays/`) have their own `math/` and `components/` folders and the same rules apply to them.
  - `**/math/**`: the Math layer, project `math`, environment `node`. Imports: `@alidade/core`, `@alidade/sensors`, relative paths, and from `@alidade/ui` only **pure** names (functions, constants and types; never a React component or a hook: the purity test denies a value import from `@alidade/ui` whose name starts with a capital letter or `use`; types are `import type`). UI's `index.ts` also loads React, which is harmless in Node and is not what Req 1.2 forbids (Req 1.2 also allows the language's `URL` and `BigInt`).
  - `**/adapters/**`: the Adapters, project `adapters`, environment `node`, each taking the browser object it wraps as an argument (Req 1.3). They may import Math functions and types.
  - `**/components/**` and `src/main.tsx`: the Components layer, project `components`, environment `jsdom`. Components import Adapters **as types only**: the Adapters are built in `main.tsx` and handed down in one `VigiaEnvironment` object (D3), so a component test passes fakes.
  - The entry (`main.tsx`, `system.ts`) is the composition root: the only files that import everything.
  - *Rejected:* a per-file `@vitest-environment` comment (a forgotten comment would run a Math test in a DOM); a second package for the Overlays (the requirement asks for a separable module, not a package, and a package would need its own dependency edges).
- **D2 — `VigiaResult`, `VigiaReason`, and the Message table (Req 2).** Vigia has its own Result because UI's `ok` and `err` are not exported (by design: `ok(NaN)` must not be writable). `VigiaResult<T> = Success<T> | VigiaFailure` (Core's `Success` type is exported). `VigiaFailure` has the fields of `UiFailure` and `reason: VigiaReason`. `VigiaReason = UiReason | VigiaOnlyReason`, with `VigiaOnlyReason` a union of the 22 below (69 reasons in all; the hotspot Overlay of the second release adds three, named at the end of the list) and `VIGIA_ONLY_REASONS = { … } as const satisfies Record<VigiaOnlyReason, true>`, `VIGIA_REASONS = [...UI_REASONS, ...Object.keys(VIGIA_ONLY_REASONS)]`, as UI's D2. The list is **closed** and is the requirement's own 22 (Req 2.2); everything shown "through `messageFor`" has a row:
  - code and link: `code_damaged`, `code_too_long`, `code_version_unsupported`, `code_not_a_sighting`, `link_too_long` (the page address leaves no room for a link of at most 160 characters);
  - Incident and merge: `incident_unknown`, `incident_full`, `sighting_conflict`, `simulation_not_shareable`;
  - set-aside causes, which Req 5.2 shows through `messageFor` and which therefore must be reasons: `sighting_too_old`, `sighting_time_implausible`, `outlier`, `hidden_by_user` (the fifth cause, Core's `invalid_observation`, is a Core reason already);
  - storage: `storage_unavailable`, `storage_corrupt`, `storage_version_unsupported`; clipboard: `clipboard_unavailable`;
  - network and Overlays: `host_not_allowed`, `overlay_unavailable`, `overlay_stale`;
  - Transport: `transport_unavailable`; identifiers: `random_unavailable` (the browser has no secure random source);
  - **second release, added with the hotspot Overlay** (Req 2.2): `overlay_needs_key`, `overlay_area_too_large`, `hotspot_footprint_unknown`. Their rows are in the table below and are not in the first release's type or tests.
  `messageFor(failure: VigiaFailure): Message` returns UI's `Message` type. Its table is `MESSAGES: Record<VigiaReason, MessageSource> = { ...uiRows(), ...ONLY_ROWS }`: `ONLY_ROWS: Record<VigiaOnlyReason, MessageSource>` is written out (a new reason without a row fails type checking, Req 2.3), and `uiRows()` builds the 47 UI rows (31 of Sensors, which include Core's 12, and UI's own 16) by calling UI's `messageFor` with the reason, from `UI_REASONS` (one function, one cast inside, and a runtime test that its keys equal `UI_REASONS`). The Messages of the 22, and of the three of the second release (each part one sentence, at most 160 characters, ending in a full stop, none of the forbidden strings, and naming what the user can act on, Req 2.4):

| Reason | What happened | What to do |
|---|---|---|
| `code_damaged` | The code is damaged or cut off, so it was not used. | Ask the sender to send it again, and copy the whole link or the whole code. |
| `code_too_long` | That text is too long to be a sighting code. | Paste only the link or the code, not the whole message. |
| `code_version_unsupported` | This code was made by a different version of the app. | Ask the sender to open the newest version of the app and send it again. |
| `code_not_a_sighting` | That text does not look like a sighting code. | Paste the link or the code that the other person sent you. |
| `link_too_long` | The address of this page is too long to make a link or a QR code. | Share the code as text instead, or open the app from a shorter address. |
| `incident_unknown` | That smoke is not on this phone. | Open or start the smoke first, then add the sighting. |
| `incident_full` | This smoke already holds as many sightings as it can. | Delete a sighting you do not need, or start another smoke. |
| `sighting_conflict` | Two different sightings carry the same identifier, so the first one was kept. | Compare the two, and ask the sender which one is right. |
| `simulation_not_shareable` | This is a simulated smoke, so it cannot be sent out of this page. | Use a real sighting if you want to share it with another phone. |
| `sighting_too_old` | This sighting is much older than the newest one, so it is not used. | Take a new sighting if the smoke is still there. |
| `sighting_time_implausible` | The time on this sighting does not fit this smoke, so it is not used. | Check that both phones show the right time and date, then send it again. |
| `outlier` | This sighting does not agree with the others, so it was set aside. | Check where it was taken from, and take it again if you can. |
| `hidden_by_user` | You hid this sighting, so it is not used. | Show it again if you want it to count. |
| `storage_unavailable` | This phone will not keep sightings after you close the page. | Keep the page open, and write the position down before you leave. |
| `storage_corrupt` | Some saved sightings could not be read and were left out. | Check the list, and take or ask for the missing sightings again. |
| `storage_version_unsupported` | The saved sightings were written by a newer version of the app, so they were left alone. | Open the newest version of the app to see them. |
| `clipboard_unavailable` | The text could not be copied. | Select the text by hand and copy it, or read it out. |
| `host_not_allowed` | The app refused to contact a server that is not on its list. | Nothing was sent, so tell the people who run the app about it. |
| `overlay_unavailable` | The extra map information could not be loaded. | Check the connection and try again, or carry on without it. |
| `overlay_stale` | The wind reading is not for this moment. | Treat it as a forecast or an old reading, not as the wind now. |
| `overlay_needs_key` (second release) | This layer needs a key that this copy of the app does not have. | Carry on without it, or ask the people who run the app to add a key. |
| `overlay_area_too_large` (second release) | The sightings are too far apart to ask for satellite detections. | Look at a smaller area, or carry on without the layer. |
| `hotspot_footprint_unknown` (second release) | Some satellite detections have no known size, so they are not drawn. | They are counted in the list but not placed on the map. |
| `transport_unavailable` | Sending is not available right now. | Use the text code, or try again when the connection is back. |
| `random_unavailable` | This browser cannot make the random identifiers the app needs, so it cannot take sightings. | Open the app in a current version of Safari or Chrome. |

  Messages of a reason that carries a number (none of the 22 does) would follow UI's rounding rule. A test (§12) holds every row to the rules of UI's `message-rules`.
- **D3 — The state is a pure reducer; effects are data; the store is the one place that runs them (Req 3.8, 4, 5, 9.4).** `applyAction(state, action, context): VigiaResult<{ state: VigiaState; notices: readonly Notice[] }>` is a pure function in the Math layer (§7.4). Every input an action needs is **in the action**: the time, the random bytes, the decoded Sighting. The store (`components/store.ts`) holds `{ state, inbox, notices }`, exposes `dispatch`, `getState` and `subscribe` (for `useSyncExternalStore`), and runs three effects after a change, all injected: `storage.write` (§7.5), the expiry timer (one `Timer` tick every `expiryCheckIntervalMs`, which dispatches `expire`), and `clipboard`/`transport` calls that the Share sheet asks for directly. The environment object is `VigiaEnvironment = { clock, timer, random, storage, clipboard, page, gate, transport, qr, maplibre, tiles, mode, … }` of Adapter *types*. *Rejected:* a state-management library (Req 20.3); React state alone (the reducer must be testable without React, P-4.7 runs 200 actions on it).
- **D4 — Storage: one key, the codes themselves, a version, and what a bad value does (Req 4.4, 4.5, 15.4).** The format is §7.5. Four decisions:
  1. A Sighting is stored as its **sighting code** (50 characters) plus its flags. The code is already the canonical form (D6), so a reload decodes to the identical Bearing, bit for bit, which a stored degrees-and-radians copy would not guarantee (`radToDeg` then `degToRad` is not the identity); the code's check value gives corruption detection for free; and the format cannot drift from the wire format because it is the wire format.
  2. A **corrupt** value (not JSON, wrong shape, wrong `format`) or a **foreign** one (valid JSON that is not ours) is never overwritten before it is saved: the raw text is copied once to the key `vigia.state.backup` (if that key is free), the app starts with an empty state, and the user gets `storage_corrupt`. A value that is ours but partly bad (an entry whose code fails, a duplicate, an Incident over the limit) is **salvaged**: the good entries are kept, the others dropped and counted, and the same notice says how many.
  3. A value with a **higher `version`** than the app knows is left alone: the app runs in memory only, writes nothing to that key, and says `storage_version_unsupported`, so that an old tab never destroys what a newer one wrote.
  4. **Several tabs.** A link opened from a message or a QR is a new tab of the same page. With two tabs open the last to write wins and the other's changes are seen on the next load (Req 4.4); there is no `storage` event handler. Writes are whole-state, so a tab that was not reloaded can overwrite what another wrote; the window is the time between two taps, and the requirement accepts it.
  Retention (Req 4.5) is applied on load, on `expire` and after every action: an Incident whose newest entry, or its creation time if it has none, is older than `incidentRetentionMs` is deleted. Simulation Incidents are stored in a memory object, never in `localStorage` (D16).
- **D5 — The sighting code (Req 8).** Base 31 over the alphabet the requirement describes, a mixed-radix payload, a four-symbol check over GF(31). The reasoning, the fields, the lengths and three worked examples are §8. The choices that matter: the alphabet is read **literally** (no `0`, `O`, `1`, `I`, `L`), which gives 31 symbols, not 32; therefore a binary CRC cannot be proved against single-symbol, adjacent and swap errors, and a CRC **over GF(31)** can (§8.4); the version and the kind are the first two symbols and the check is the last four, and the decoder verifies the check **before** it reads the version, so that every single-character change of a valid code is `code_damaged` (Req 8.10) and `code_version_unsupported` is only for a code whose check is valid (§8.5).
- **D6 — The canonical Sighting, and the order of the two replacements (Req 3.4, 3.9, 8.4).** After a capture, in this order: (1) replace the Bearing's `id` by a new Sighting id (`withSightingId`, P-3.9: nothing else changes); (2) `canonicalise`: `decodeSighting(encodeSighting(s))`, which is what every phone computes from the code, so the sender's own Sighting set holds exactly what the receivers hold and all phones get the same Fix (P-9.6). A capture whose encoding fails (time outside the 20 years, a position or sigma outside the code's ranges) is refused with Core's `invalid_observation` naming the field, and nothing is added.
- **D7 — An Inbox between decoding and merging (Req 4.2, 9.4, 10.3, 15.8).** Every code that reaches the phone, from any channel, is decoded and held in the store's `inbox` (memory only, never stored), shown as a card with the azimuth and its sigma, the position accuracy, the age and whether the Incident is known, **without the observer's position**; "Add" runs the merge (§7.4), "Ignore" drops it. P-9.6 is stated at the merge function and at the inbox-with-auto-accept used by the tests, so it holds for what the user adds (Req 9.6).
- **D8 — The assessment: one pure function from the open Incident to the used set, the set-aside causes and Core's Fix (Req 5, 6.1, 6.6).** §7.6. A Sighting has exactly one cause, chosen by a fixed order (`hidden_by_user`, `sighting_time_implausible`, `sighting_too_old`, then Core's: `outlier`, `invalid_observation`); the used ones are given to `solve(new BearingModel(), …, { outlierRejection: true })`; the result is a function of the **set** (P-5.11), because Core canonicalises by id and the display order is a total order on `(timeUtcMs, sightingId)`. The two thresholds the words quote, `OUTLIER_STUDENTISED_RESIDUAL` (3.5; `OUTLIER_NORMALISED_RESIDUAL` before 2026-11-19) and `POOR_GEOMETRY_CROSSING_RAD` (20°), are exported by Core (G5: approved, built in the skeleton first); Vigia imports them and holds no copy.
- **D9 — The words are built from one formatter module; the position's decimals follow the semi-minor axis (Req 6.2, 6.3, 14.1, 16.4).** §7.8. All lengths are rounded **up** by one function (`lengthText95`), all positions printed by one function (`positionText`) that is given the Fix, so that no number reaches a sentence without the formatting and the uncertainty next to it. Req 6.2 states the rule: the decimals follow the semi-minor axis, and the radius of "within about" adds the printing bound.
- **D10 — The Geometry class and the Next-sighting advice (Req 7).** §7.9 and §7.10. The class is a pure function of Core's warning and the Ellipse. The advice builds one hypothetical Bearing from each of the two advised directions and calls Core's `solve` with the used Bearings and no outlier rejection; the figures it reports (the areas before and after) are Core's. The advice never shows the hypothetical Bearing anywhere (Req 7.6): it exists only inside the function.
- **D11 — The Emergency text is a template over the same words (Req 14).** §7.12. The text is a function of the assessment and a small options record (`includeOwnPosition`, `simulation`, `nowUtcMs`). The one-Sighting variant follows Req 14.2 with the observer's position **off** by default (Req 14.2, 14.3).
- **D12 — The Transport interface, an in-memory network with a delivery plan, and the manual channels (Req 9, 10.1, 10.7).** §7.19. `Transport` is `{ send, onReceive, onStatus, stop }` over plain text. The in-memory network takes a **delivery plan** (a pure function from a send to a list of `{ copies, delayMs }`), so loss, duplication, delay and reordering are all deterministic and the same plans run through a second, differently built Transport (Req 9.9). The manual channels (link, QR, text) are one Transport whose `send` hands the code to the Share sheet and whose receive side is the paste box and the page's fragment.
- **D13 — The link, the QR and the text are one code in three presentations (Req 10).** §7.13. The link is built by string operations on the page's own address (no `URL` object, so no normalisation can move the code into the path), the code goes after `#` and nowhere else, and the address is replaced after reading (`history.replaceState`). The QR is drawn by an inline SVG from the matrix of `adapters/qr-encoder.ts` (§3.2). The text code is shown in ten groups of five characters, hyphen-separated; the decoder accepts the hyphens and any whitespace.
- **D14 — The Network gate decides on a canonical URL, against data (Req 11).** §7.14. The Host list is data (`math/network/host-list.ts`); the decision is a pure function of a URL string and that data, using the platform's `URL` parser and then **requiring the input to equal the parsed `href`**, so that case, default ports, userinfo, dot forms and percent-encoding variants are all refused rather than normalised into a listed request (Req 11.9). The adapter wraps `fetch` with `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'`, no headers, a timeout, and a byte limit read from the stream.
- **D15 — The Overlays are one registered module (Req 1.10, 12, 13, 18.4).** §7.16 to §7.18 and §5. `src/overlays/index.ts` exports `OVERLAYS: readonly OverlayDefinition[]`, **which holds the wind Overlay alone in the first release**; nothing else in `src/` imports from `src/overlays/`. An `OverlayDefinition` creates a controller (a small observable of plain state: enabled, status, failure, layers, legend, words). The map screen reads the list generically. A build alias replaces `src/overlays/index.ts` by `src/overlays-empty.ts` (an empty list), and a test project runs every non-Overlay test against it. The wind Overlay is `src/overlays/wind/`: delete the folder and its line to cut it. The hotspot Overlay (second release: built only on the lead's word after the wind checkpoint) is `src/overlays/hotspots/` and one more line of the registry; nothing in the first release depends on it.
- **D16 — Simulation mode: one phone for each Station, one clock, memory storage, a reserved Incident id symbol (Req 17).** §10. UI's `SimulatorPanel` is the camera; each **Station of the chosen scene is one phone** with its own state store, memory storage and in-memory Transport endpoint; the Station the panel is on is the phone in hand, and its other Stations are the phones on the table. The mode of an Incident is **derived from its id**: the first symbol of an Incident id is `Z` in Simulation mode and never otherwise (`incidentMode`, §7.2). This is how a phone that receives a simulated code can say so (Req 17.4) although the code has no separate mark.
- **D17 — The screens (Req 3, 4, 6, 7, 10, 14, 16, 18).** §9: four tabs (Smoke, Sightings, Map, Emergency), a Sight screen, a Share sheet, an Inbox sheet, and the first-screen controls of Req 4.5 and 14.5.
- **D18 — Parameters are one record, checked by one function (Req 19).** `VigiaParameters` (§6) is built once by `defaultParameters()` from the named constants of `defaults.ts`, each with a comment giving its unit, its reason and whether it is measured, a skeleton threshold or judgement (Req 19.4). `checkParameters` returns `invalid_number` naming the first invalid field (Req 19.3). Req 19.1 lists all of them, including `ADVICE_MIN_DISTANCE_M` (300), `EXPIRY_CHECK_INTERVAL_MS` (60 000) and, for the second release, `HOTSPOT_MARGIN_CELLS` (1) and `HOTSPOT_DAY_RANGE` (2); the hotspot constants are built with the hotspot Overlay.
- **D19 — Build and packaging (Req 1.8, 11.5, 11.6, 18.2, 20).** §13. A static single-page build by Vite, relative asset paths, two build-time variables for the tile source (the hotspot key of the second release adds a third, documented as public), two paragraphs of the package's README for the owner's headers (O2; no `docs/hosting.md` and no Content-Security-Policy generator), no dev server in any task.
- **D20 — The privacy table is data, rendered in the app and held equal to `docs/privacy.md` by a test (Req 15.3).** `math/privacy-table.ts` holds the nine rows of the requirement. The Share sheet and a "What leaves this phone" page render it; `docs/privacy.md` contains the same table in Markdown; a test parses the Markdown table and compares it to the data, row by row, so the document and the code cannot drift.
- **D21 — The cut test (Req 1.10).** The Vitest config has a fourth project, `no-overlays`, which runs the `math`, `adapters` and `components` tests (excluding `src/overlays/**`) with `src/overlays/index.ts` aliased to `src/overlays-empty.ts`, and a purity rule that nothing but `src/App.tsx` and `src/overlays-empty.ts` mentions `overlays/`. The project is part of `pnpm test`.
- **D22 — Time and calendar arithmetic without `Date` (Req 1.2, 12.5, 14.1).** `math/civil-time.ts` turns a `UtcMs` into the hours and minutes of the UTC day and an age into words, by integer arithmetic, because the Math layer reads no clock and the purity rule forbids `new Date`. The inverse, `utcMsFromCivil` (the days-from-civil algorithm), is needed only by the hotspot parser and **comes with the hotspot Overlay** (second release), in the same file (§7.1).

## 5. Module layout

```
apps/vigia/
  package.json                    name @alidade/vigia; private; scripts test, test:deep, typecheck, build, dev (dev is never run by a task)
  tsconfig.json                   extends ../../tsconfig.base.json; lib ES2023 + DOM; jsx react-jsx; include src, fixtures, configs
  vite.config.ts                  root '.', base './', envDir '.', oxc.jsx.runtime 'automatic', build.outDir 'dist'; alias for the cut build
  vitest.config.ts                four projects (math, adapters, components, no-overlays); provide propertyRuns 200
  vitest.deep.config.ts           the *.property.test.ts files of math and adapters; provide propertyRuns
  index.html                      <meta name="referrer" content="no-referrer">; the root element; the entry script
  .env.example                    VITE_TILE_URL_TEMPLATE, VITE_TILE_ATTRIBUTION (both empty; the second release adds VITE_FIRMS_MAP_KEY)
  README.md                       what it is, how to build, the two variables, and two paragraphs on hosting (which hosts the page contacts; the headers the host should send, `Referrer-Policy: no-referrer` first; O2)
  fixtures/                       read-only, synthetic: sighting-codes.json, emergency-texts.json,
                                  open-meteo-sample.json, privacy-table.json (§12); second release: firms-sample.csv
  src/
    main.tsx                      composition root: real adapters, tile source from the environment, createRoot
    system.ts                     the one module with setInterval (the default Timer); the Clock is Sensors' systemClock
    App.tsx                       tabs, sheets, mode switch; the only importer of ./overlays
    overlays-empty.ts             OVERLAYS = [] (the cut build, D21)
    result.ts                     VigiaResult, VigiaFailure, ok, err                         (internal)
    reasons.ts                    VigiaOnlyReason, VIGIA_ONLY_REASONS, VigiaReason, VIGIA_REASONS
    defaults.ts                   the named constants of Req 19.1 and the four of D18
    purity.test.ts                the scans of §13
    math/                         ── Math layer (node environment)
      degrees.ts                  toDeg, fromDeg (the one conversion module, over Core's degToRad/radToDeg)
      civil-time.ts               clockTextUtc, ageText (§7.1; utcMsFromCivil comes with the hotspot Overlay)
      messages.ts                 MESSAGES, messageFor
      parameters.ts               VigiaParameters, defaultParameters, checkParameters
      privacy-table.ts            PRIVACY_TABLE (D20)
      texts.ts                    the fixed sentences: limits, guidance, the checks by count, the not-calling statement
      code/
        alphabet.ts               ALPHABET, symbol/index maps, groupCode, stripCode
        gf31-check.ts             checkSymbols (the CRC over GF(31))
        sighting-code.ts          encodeSighting, decodeSighting, CODE_LENGTH (§8)
        code-link.ts              buildSightingLink, extractSightingCode
      incident/
        ids.ts                    idFromBytes, incidentIdFromBytes, incidentMode
        sighting.ts               Sighting, SightingEntry, withSightingId, canonicalise, captureToSighting
        incident-state.ts         Incident, VigiaState, Inbox types, emptyState
        apply-action.ts           applyAction (the reducer), VigiaAction
        merge.ts                  mergeSighting
        storage-format.ts         serialiseState, parseStoredState (§7.5)
      assessment/
        assess.ts                 assess (partition + solve), orderEntries
        statements.ts             checkLevel, disagreement, the statement by count
      fix/
        format.ts                 lengthText95, lengthTextNearest, positionDecimals, positionText, compassWord8, axisWords
        fix-words.ts              fixWords, FixWords
        from-you.ts               fromYouWords (Req 6.4), halfInterval
        geometry-class.ts         geometryClass, elongation
        advice.ts                 nextSightingAdvice, adviceWords
        emergency-text.ts         emergencyText
        map-model.ts              mapModel: observers, bearings, line length, set-aside layers
      network/
        host-list.ts              HOST_LIST data (tiles, wind; the hotspot entry is second release), buildHostList(tiles)
        gate-decision.ts          decideRequest
        request-boxes.ts\1windPoint (the hotspot box is in overlays/hotspots/math/hotspot-box.ts, second release)
      transport/
        transport.ts              Transport, TransportStatus (types only)
      scenes/
        smoke-scenes.ts           smokeScenes(): the four scenes, built with sceneFromOffsets and scriptForStation
    adapters/                     ── Adapters (node environment, fakes)
      network-gate.ts             createNetworkGate
      storage.ts                  createStorage (localStorage or memory)
      clipboard.ts                createClipboard: copyText, shareLink
      random.ts                   createRandom: bytes(n)
      page-address.ts             createPage: address(), fragment(), replaceAddress(), onFragmentChange
      qr-encoder.ts               createQrEncoder: qrMatrix(link)         (the only module naming the QR package)
      transport/
        memory-network.ts         createMemoryNetwork(plan, timer)
        manual-transport.ts       createManualTransport
    components/                   ── Components layer (jsdom)
      environment.ts              VigiaEnvironment type, the React context
      store.ts                    createVigiaStore, useVigia (useSyncExternalStore)
      FailureNotice.tsx           Vigia's notice (UI's takes only UI reasons)
      SmokeScreen.tsx  SightScreen.tsx  SightingsScreen.tsx  MapScreen.tsx  EmergencyScreen.tsx
      ShareSheet.tsx  InboxSheet.tsx  ConfirmSmokeDialog.tsx  DeleteAllDialog.tsx  PrivacyPage.tsx
      FixWordsView.tsx  AdviceView.tsx  SightingRow.tsx  QrImage.tsx  TabBar.tsx  SimulationBanner.tsx
      LimitsBlock.tsx  GuidanceBlock.tsx
      simulation/
        SimulationShell.tsx       the phones, the clock, the panel, the in-memory network
        simulated-phone.ts        one phone's store, memory storage and transport endpoint
    overlays/                     ── the separable part (D15, D21); the layer of a file is its nearest math/ or components/ folder
      index.ts                    OVERLAYS (the wind Overlay alone; the hotspot line is second release), the one registration point
      shared/
        math/overlay-types.ts     OverlayDefinition, OverlayController, OverlayState, LegendEntry, OverlayDeps
        components/               OverlayPanel.tsx  Legend.tsx  SourcesList.tsx
      wind/                       (delete this folder and its line in index.ts to cut the wind Overlay)
        math/                     wind-parse.ts  wind-words.ts  wind-features.ts
        components/               wind-controller.ts  wind-definition.ts
      hotspots/                   (second release: built only on the lead's word after the wind checkpoint: one folder and one line of index.ts)
        math/                     hotspot-parse.ts  hotspot-box.ts  hotspot-features.ts  hotspot-words.ts
        components/               hotspot-controller.ts  hotspot-definition.ts
    test-support/                 fast-check-setup, fakes (fake-storage, fake-clipboard, fake-fetch, fake-random,
                                  fake-page, recording-gate, fake-qr), hostile, generators, capture-from-script,
                                  seeded-normal, property-report, deep-same   (not exported; copied from UI's, UI D20)
docs/                             (repository root, judge-facing) privacy.md
```

**Size, first release.** 78 source files: 7 at the top of `src/` (`main.tsx`, `system.ts`, `App.tsx`, `overlays-empty.ts`, `result.ts`, `reasons.ts`, `defaults.ts`), 30 in the Math layer (`degrees` to `smoke-scenes`, as listed), 8 Adapters, 23 in the Components layer (UI's `DeviceSighting` is imported, not written here), and 10 under `overlays/` (the registry, the shared types, the shared components, and the wind Overlay's five). The hotspot Overlay of the second release adds 6 more (four in `hotspots/math/`, two in `hotspots/components/`) and one fixture; they are in no count above. Test files sit next to the code; the property files are listed in §11.

**Import rules, and the tests that enforce them** (`purity.test.ts`, read as UI's: source files by `import.meta.glob(..., { query: '?raw' })`, comments and strings stripped, each rule run against a copy of a real source with its token added so that the test is not vacuous, and a fixed list of the non-test source files: adding a file without adding it to the list fails):

| Rule | Where it applies | Req |
|---|---|---|
| imports `@alidade/*` only through the package name, never a deep path; imports no package but `@alidade/core`, `@alidade/sensors`, `@alidade/ui`, `react`, `react-dom`, `maplibre-gl` (the stylesheet, `main.tsx` only) and `uqr` (`adapters/qr-encoder.ts` only); imports nothing from `apps/nonius` | everywhere | 1.1 |
| a Math file imports no `react`, `react-dom`, `maplibre-gl`, no file under `adapters/` or `components/`, and no value from `@alidade/ui` whose name starts with a capital letter or `use` | `**/math/**` | 1.2 |
| no `document`, `window`, `navigator`, `location`, `history`, `localStorage`, `fetch`, `Date.now`, `new Date`, `performance`, `setTimeout`, `setInterval`, `Math.random`, `crypto`, `import(`, `import.meta` | `**/math/**`; the same list, minus what the file wraps, in the other layers | 1.2, 1.3, 1.5 |
| `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` only in `adapters/network-gate.ts`; `localStorage`, `sessionStorage`, `indexedDB` only in `adapters/storage.ts`; `navigator.clipboard`, `navigator.share` only in `adapters/clipboard.ts`; `crypto` only in `adapters/random.ts`; `location`, `history` only in `adapters/page-address.ts` | all non-test files | 1.3, 11.1 |
| `DeviceOrientationEvent`, `geolocation`, `permissions`, `screen.orientation`, `visibilitychange`, `getUserMedia`, `BarcodeDetector`, `userAgent` nowhere | all non-test files | 1.4, 10.5 |
| `setInterval`, `clearInterval`, `Date.now` only in `src/system.ts` | all non-test files | 1.5 |
| the only degree conversion factor is in `math/degrees.ts`; the string `Deg` in a name only in files on the list of I/O boundaries (`sighting-code.ts`, `request-boxes.ts`, `wind-parse.ts`, `fix-words.ts`, `emergency-text.ts`, `format.ts`, `degrees.ts`, `host-list.ts`, `defaults.ts`, `parameters.ts`; the hotspot files join the list in the second release) | all non-test files | 1.7 |
| nothing the skeleton owns is repeated: `alphaRad`, `betaRad`, `gammaRad` nowhere; no `Math.atan2(` or ellipse formula in `fix/` (the words call Core and UI); the strings `frame_change`, `2.4477` and `ELLIPSE_VERTEX` nowhere (the 95 % scale is Core's `ellipse95`); no copy of Core's two thresholds: the numbers `3.5` in `assessment/` and `20` in `fix/`, and the name `CORE_OUTLIER_STUDENTISED_RESIDUAL`, nowhere (the thresholds are Core's exports) | all non-test files | 1.6 |
| no `any`, no `!` non-null assertion in `**/math/**` (the ESLint rule, run by `pnpm lint`; the purity test checks that the lint block exists) | `**/math/**` | 1.8 |
| a host name or an absolute `http(s)://` URL literal only in `math/network/host-list.ts`, in `fixtures/`, in `docs/`, and in `*.test.*`; no JSX or code that sets `src` or `href` to a value that is not a fragment or a `data:` URL | all non-test files | 11.1, 11.5 |
| nothing imports from `src/overlays/` but `src/App.tsx`; `src/overlays/**` imports nothing from `src/` outside `src/overlays/`, `src/math/`, `src/adapters/` types, `src/components/` types and `src/result.ts` | all non-test files | 1.10 |
| `package.json`: exact versions (no `^`, `~`), `@alidade/*` as `workspace:*`, React, maplibre-gl, Vite, TypeScript, Vitest, fast-check at the versions of `skeleton/ui/package.json` (the test reads that file), `uqr` at `0.1.3` as the only dependency beyond them, `.env.example` with no value after `=`, no `.env*` file but the example | the package | 20.1 to 20.5, 11.6 |
| `src/index`-style exports: Vigia exports no public API but its entry (there is no `index.ts`; `main.tsx` is the entry) | package | 1.8 |

## 6. Data model and public interfaces

All in TypeScript, `strict`. Names carry units. `Position`, `Bearing`, `Fix`, `Ellipse` are Core's; `Message`, `AppLayer`, `CatalogueScene`, `MapObserver`, `Timer` are UI's. Core's `OUTLIER_STUDENTISED_RESIDUAL` and `POOR_GEOMETRY_CROSSING_RAD` and UI's `DeviceSighting` are the skeleton's additions G5 and G6 (built before Vigia's tasks); Vigia imports them and defines none of them.

```ts
// ── result.ts, reasons.ts ──────────────────────────────────────────────────────────────
import type { Success } from '@alidade/core';
import type { UiReason } from '@alidade/ui';
export interface VigiaFailure {
  readonly ok: false; readonly reason: VigiaReason;
  readonly field?: string; readonly id?: string;
  readonly reportedAccuracyM?: number; readonly errorName?: string;
}
export type VigiaResult<T> = Success<T> | VigiaFailure;
export type VigiaOnlyReason = 'code_damaged' | 'code_too_long' | 'code_version_unsupported' | 'code_not_a_sighting'
  | 'link_too_long' | 'incident_unknown' | 'incident_full' | 'sighting_conflict' | 'simulation_not_shareable'
  | 'sighting_too_old' | 'sighting_time_implausible' | 'outlier' | 'hidden_by_user'
  | 'storage_unavailable' | 'storage_corrupt' | 'storage_version_unsupported' | 'clipboard_unavailable'
  | 'host_not_allowed' | 'overlay_unavailable' | 'overlay_stale'
  | 'transport_unavailable' | 'random_unavailable';
// second release, added to VigiaOnlyReason with the hotspot Overlay (Req 2.2):
//   'overlay_needs_key' | 'overlay_area_too_large' | 'hotspot_footprint_unknown'
export type VigiaReason = UiReason | VigiaOnlyReason;

// ── parameters.ts (Req 19; the values are in defaults.ts) ─────────────────────────────────
export interface VigiaParameters {
  readonly maxIncidentAgeMs: number;          // 30 min
  readonly incidentRetentionMs: number;       // 24 h
  readonly clockSkewToleranceMs: number;      // 2 min
  readonly maxSightingsPerIncident: number;   // 32
  readonly plausibleRangeM: number;           // 50 000
  readonly longEllipseRatio: number;          // 3
  readonly fairEllipseRatio: number;          // 1.5
  readonly maxCodeLengthChars: number;        // 2 048
  readonly maxLinkLengthChars: number;        // 160
  readonly maxEmergencyTextChars: number;     // 800
  // second release, with the hotspot Overlay: hotspotGridDeg 0.5, hotspotMarginCells 1, hotspotDayRange 2 (FIRMS allows 1 to 5),
  //   maxHotspotAgeMs 24 h, maxHotspotCount 500, maxHotspotBoxDeg2 16 (square degrees)
  readonly windGridDeg: number;               // 0.1
  readonly maxWindAgeMs: number;              // 3 h
  readonly maxResponseBytes: number;          // 1 000 000
  readonly requestTimeoutMs: number;          // 10 000
  readonly simulationTapSigmaPx: number;      // 3
  readonly adviceMinDistanceM: number;        // 300    (D18)
  readonly expiryCheckIntervalMs: number;     // 60 000 (D18)
}
export function defaultParameters(): VigiaParameters;
export function checkParameters(p: VigiaParameters): VigiaResult<VigiaParameters>;

// ── incident/sighting.ts, incident-state.ts ─────────────────────────────────────────────
export type Clock = () => number;               // milliseconds since the epoch, UTC (Sensors' systemClock)
export interface Sighting {                     // the glossary's Sighting
  readonly sightingId: string;                  // 9 symbols; equals bearing.id
  readonly incidentId: string;                  // 10 symbols; first symbol Z in Simulation mode
  readonly bearing: Bearing;                    // canonical (decoded from its code)
  readonly origin: 'local' | 'received';
  readonly receivedUtcMs: number | null;        // null for a local one
}
export type ShareChannel = 'link' | 'qr' | 'text' | 'system_share' | 'memory';
export interface ShareRecord { readonly channel: ShareChannel; readonly atUtcMs: number }
export interface SightingEntry {
  readonly sighting: Sighting;
  readonly code: string;                        // encodeSighting(sighting): the identity of its content
  readonly hidden: boolean;
  readonly shared: readonly ShareRecord[];
}
export interface Conflict { readonly sightingId: string; readonly heldCode: string; readonly otherCode: string }
export interface Incident {
  readonly incidentId: string;
  readonly createdUtcMs: number;
  readonly creation: 'created' | 'joined';
  readonly entries: readonly SightingEntry[];   // at most maxSightingsPerIncident; unique sightingIds
  readonly conflicts: readonly Conflict[];
}
export interface InboxItem {                    // decoded, not yet added (D7); memory only
  readonly code: string;
  readonly sighting: Sighting;                  // origin 'received'
  readonly arrivedUtcMs: number;
}
export interface VigiaState {
  readonly incidents: readonly Incident[];
  readonly openIncidentId: string | null;
}
export function emptyState(): VigiaState;
export function incidentMode(incidentId: string): 'device' | 'simulation';

export type VigiaAction =
  | { kind: 'createIncident'; incidentId: string; nowUtcMs: number }
  | { kind: 'openIncident'; incidentId: string }
  | { kind: 'addLocal'; sighting: Sighting; code: string; nowUtcMs: number }            // after the user's answer (Req 4.3)
  | { kind: 'addReceived'; item: InboxItem; nowUtcMs: number; joinIfUnknown: boolean }  // "Add" in the Inbox
  | { kind: 'hide'; sightingId: string } | { kind: 'show'; sightingId: string }
  | { kind: 'deleteSighting'; sightingId: string }
  | { kind: 'deleteIncident'; incidentId: string } | { kind: 'deleteAll' }
  | { kind: 'markShared'; sightingId: string; record: ShareRecord }
  | { kind: 'expire'; nowUtcMs: number }
  | { kind: 'replace'; state: VigiaState };                                             // a reload or another tab's write
export interface Notice { readonly reason: VigiaReason; readonly field?: string; readonly id?: string; readonly count?: number }
export function applyAction(
  state: VigiaState, action: VigiaAction, parameters: VigiaParameters,
): VigiaResult<{ readonly state: VigiaState; readonly notices: readonly Notice[] }>;

// ── assessment ────────────────────────────────────────────────────────────────────────────
export type SetAsideCause = 'hidden_by_user' | 'sighting_time_implausible' | 'sighting_too_old' | 'outlier' | 'invalid_observation';
export interface SetAsideEntry { readonly entry: SightingEntry; readonly cause: SetAsideCause }
export type CheckLevel = 'none' | 'one' | 'two' | 'three' | 'four_or_more';
export type Disagreement = 'none' | 'three_disagree' | 'diverging';
export interface Assessment {
  readonly used: readonly SightingEntry[];       // ordered by (timeUtcMs, sightingId)
  readonly setAside: readonly SetAsideEntry[];   // same order
  readonly fix: VigiaResult<Fix> | null;         // null with fewer than two used
  readonly checkLevel: CheckLevel;
  readonly disagreement: Disagreement;
}
export function assess(incident: Incident, nowUtcMs: number, parameters: VigiaParameters): Assessment;

// ── words ─────────────────────────────────────────────────────────────────────────────────
export type GeometryClass = 'none' | 'poor' | 'fair' | 'good';
export interface FixWords {
  readonly headline: string;      // "Probably here: …" with the position and its uncertainty in the same sentence
  readonly area: string;          // the 95 % semi-axes, the direction of the long axis
  readonly basis: string;         // N sightings, M set aside, ages
  readonly geometry: string;      // the Geometry class sentence
  readonly warnings: readonly string[];
  readonly limits: string;        // what the ellipse does and does not say (Req 6.3)
}
export function fixWords(fix: Fix, assessment: Assessment, nowUtcMs: number, parameters: VigiaParameters): VigiaResult<FixWords>;
export function fromYouWords(fix: Fix, you: Position, parameters: VigiaParameters): VigiaResult<string>;
export function halfIntervalM(ellipse95: Ellipse, directionToFixRad: number): number;   // Req 6.4, 6.9
export function geometryClass(fix: Fix | null, parameters: VigiaParameters): GeometryClass;
export type Advice =
  | { readonly kind: 'none' }
  | { readonly kind: 'one_sighting' }
  | { readonly kind: 'fix'; readonly directionsRad: readonly [number, number]; readonly distanceM: number;
      readonly areaBeforeM2: number; readonly areaAfterM2: number | null; readonly geometry: GeometryClass; readonly usedCount: number };
export function nextSightingAdvice(assessment: Assessment, parameters: VigiaParameters): VigiaResult<Advice>;
export interface EmergencyInput {
  readonly assessment: Assessment; readonly nowUtcMs: number; readonly mode: 'device' | 'simulation';
  readonly ownPosition: { readonly position: Position; readonly accuracyM: number } | null;   // used only when includeOwnPosition
  readonly includeOwnPosition: boolean;
}
export function emergencyText(input: EmergencyInput, parameters: VigiaParameters): VigiaResult<string>;

// ── sighting code (§8) ───────────────────────────────────────────────────────────────────
export const CODE_LENGTH = 50;
export function encodeSighting(sighting: Sighting): VigiaResult<string>;
export function decodeSighting(text: string, parameters: VigiaParameters): VigiaResult<Sighting>;   // origin 'received', receivedUtcMs null: the caller stamps it
export function buildSightingLink(pageAddress: string, code: string, parameters: VigiaParameters): VigiaResult<string>;
export function extractSightingCode(pasted: string): VigiaResult<string>;
export function groupCode(code: string): string;

// ── network (Req 11) ──────────────────────────────────────────────────────────────────────
export type ValueKind =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'oneOf'; readonly values: readonly string[] }
  | { readonly kind: 'number'; readonly maxDecimals: number }          // optional leading '-'
  | { readonly kind: 'key' }                                           // 8 to 64 letters and digits
  | { readonly kind: 'area' };                                         // "west,south,east,north", each a number
export interface HostEntry {
  readonly id: 'tiles' | 'wind' /* | 'hotspots' in the second release */;
  readonly sourceName: string; readonly purpose: string;
  readonly host: string;
  readonly path: readonly ValueKind[];                                 // one per segment after the first '/'
  readonly query: readonly { readonly name: string; readonly value: ValueKind }[];
  readonly carries: string;                                            // in words (Req 11.2)
  readonly termsUrl: string; readonly attribution: string;
  readonly needsKey: boolean; readonly keyIsPublic: boolean;
}
export type HostList = readonly HostEntry[];
export function decideRequest(url: string, hostList: HostList): VigiaResult<HostEntry>;

// ── transport (Req 9) ─────────────────────────────────────────────────────────────────────
export type TransportStatus =
  | { readonly kind: 'available' } | { readonly kind: 'in_use' }
  | { readonly kind: 'unavailable'; readonly reason: VigiaReason };
export type Unsubscribe = () => void;
export interface Transport {
  send(code: string): Promise<VigiaResult<void>>;
  onReceive(listener: (text: string) => void): Unsubscribe;
  onStatus(listener: (status: TransportStatus) => void): Unsubscribe;
  stop(): void;
}
export interface DeliveryStep { readonly copies: number; readonly delayMs: number }
export type DeliveryPlan = (from: string, to: string, code: string, sequence: number) => readonly DeliveryStep[];

// ── Overlays (§7.16 to §7.18) ─────────────────────────────────────────────────────────────
export interface WindReading {
  readonly point: Position;                       // the rounded request point
  readonly directionFromRad: number;              // true azimuth the wind blows FROM, [0, 2π)
  readonly speedMs: number;                       // ≥ 0
  readonly validUtcMs: number;
}
// second release: Hotspot and HotspotParse are built with the hotspot Overlay
export interface Hotspot {
  readonly position: Position; readonly timeUtcMs: number;
  readonly footprintM: number | null;             // side of the pixel; null when unknown
  readonly instrument: 'VIIRS' | 'MODIS' | 'other';
}
export interface HotspotParse {
  readonly hotspots: readonly Hotspot[];          // valid, at most maxHotspotCount, newest first
  readonly invalidRows: number; readonly truncated: boolean;
}
export interface LegendEntry { readonly label: string; readonly sourceName: string; readonly timeUtcMs: number | null }
export interface OverlayState {
  readonly id: 'wind' /* | 'hotspots' in the second release */;
  readonly enabled: boolean;
  readonly status: 'off' | 'loading' | 'ready' | 'failed';
  readonly failure: VigiaFailure | null;
  readonly layers: readonly AppLayer[];
  readonly legend: readonly LegendEntry[];
  readonly words: readonly string[];
  readonly fetchedUtcMs: number | null;
}
export interface OverlayController {
  getState(): OverlayState;
  subscribe(listener: () => void): Unsubscribe;
  setEnabled(enabled: boolean): void;             // the user's act
  refresh(): void;                                // the user's act; never a timer (Req 13.7)
  update(context: OverlayContext): void;          // new observers or Fix: recompute layers; no request
}
export interface OverlayContext {
  readonly observers: readonly Position[]; readonly fix: Position | null; readonly lineLengthM: number;
}
export interface OverlayDefinition {
  readonly id: 'wind' /* | 'hotspots' in the second release */;
  readonly title: string;
  create(deps: OverlayDeps): OverlayController;
}
export interface OverlayDeps {
  readonly gate: NetworkGate; readonly clock: Clock; readonly parameters: VigiaParameters;
  readonly mode: 'device' | 'simulation'; // second release: readonly hotspotKey: string | null;
}

// ── adapters (types the components receive) ──────────────────────────────────────────────
export interface NetworkGate { get(url: string): Promise<VigiaResult<string>> }
export interface VigiaStorage {
  read(): VigiaResult<string | null>; write(text: string): VigiaResult<void>; remove(): VigiaResult<void>;
  readBackup(): VigiaResult<string | null>; writeBackup(text: string): VigiaResult<void>;
  readonly persistent: boolean;                   // false for the memory storage
}
export interface VigiaClipboard {
  copyText(text: string): Promise<VigiaResult<void>>;
  shareLink(link: string): Promise<VigiaResult<void>>;      // navigator.share; clipboard_unavailable when absent
  readonly canShare: boolean;
}
export interface VigiaRandom { bytes(count: number): Uint8Array }     // createRandom returns VigiaResult<VigiaRandom> (random_unavailable)
export interface VigiaPage {
  address(): string;                              // the page's address, with query and fragment
  fragment(): string;                             // text after '#', '' if none
  replaceAddress(addressWithoutFragment: string): void;
  onFragmentChange(listener: () => void): Unsubscribe;
}
export interface QrMatrix { readonly size: number; readonly version: number; readonly modules: readonly (readonly boolean[])[] }
export interface VigiaQr { qrMatrix(link: string): VigiaResult<QrMatrix> }
```

## 7. Algorithms

Each section names the requirement it serves and states the function precisely enough to test against. "Fails with X" means a `VigiaFailure` with reason X and, where it applies, `field` naming the input. Every function is total (Req 2.1, 2.6): it takes type-correct input of any value, including `NaN`, infinities and `-0`, and returns a failure or finite numbers.

### 7.1 Time and calendar (`math/civil-time.ts`, D22)

- `utcMsFromCivil(year, month, day, hour, minute): VigiaResult<number>` is **second release: built with the hotspot Overlay** (its parser is the only caller), in this file, with its examples: it fails with `invalid_number` naming the first of `year` (1970 to 2100), `month`, `day` (the month's length, Gregorian leap years), `hour`, `minute`; the value is `((days · 24 + hour) · 60 + minute) · 60 000`, with `days` from the days-from-civil algorithm (shift the year to start in March; `era = floor(y / 400)`; `doy = floor((153 · m' + 2) / 5) + day − 1`; `doe = yoe · 365 + floor(yoe / 4) − floor(yoe / 100) + doy`; `days = era · 146 097 + doe − 719 468`). Exact integer arithmetic.
- `clockTextUtc(timeUtcMs): string`: `HH:MM UTC` of the UTC day, by `floor(timeUtcMs / 60 000)` modulo 1440 (a non-finite input gives `--:-- UTC`, which no sentence relies on: callers pass finite times).
- `ageText(ageMs): string`: below 0 or under 60 000 ms, `less than a minute ago`; under 3 600 000 ms, `N min ago` with `N = floor(ageMs / 60 000)`; under 172 800 000 ms (48 h), `H h ago` or `H h M min ago` (the minutes omitted when 0); otherwise `D days ago` with `D = floor(ageMs / 86 400 000)`.

### 7.2 Identifiers (`math/incident/ids.ts`, Req 3.4, 4.1)

- `ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'` (31 symbols: the digits 2 to 9 and the letters except `I`, `L`, `O`; the order is the symbol's value, `2` = 0, `Z` = 30).
- `idFromBytes(bytes, length, firstSymbolModulus = 31): VigiaResult<string>`: needs `2 · length` bytes (else `invalid_number`, `field: 'bytes'`); symbol `i` is `ALPHABET[(bytes[2i] · 256 + bytes[2i + 1]) mod m_i]` with `m_0 = firstSymbolModulus` and `m_i = 31` otherwise. Two bytes a symbol make the bias at most `65 536 mod 31 = 2` in 65 536, about `3 · 10⁻⁵` relative, and make the function total for any byte string, constant ones included (a rejection-sampling loop would not be, Req 3.9's generator draws constant byte strings).
- `sightingIdFromBytes(bytes)`: 9 symbols (`31⁹ ≈ 2.6 · 10¹³`, 44.6 bits, at least the 40 of Req 3.4). `incidentIdFromBytes(bytes, mode)`: 10 symbols; in `device` mode the first symbol uses modulus 30 (so never `Z`), in `simulation` mode it is `Z`; the other nine are free (44.6 bits, at least Req 4.1's 40). `incidentMode(id)` is `'simulation'` if the first symbol is `Z` and `'device'` otherwise; `isIncidentId` and `isSightingId` check length and alphabet.

### 7.3 The canonical Sighting (`math/incident/sighting.ts`, Req 3.4, 3.9, 8.4, D6)

- `withSightingId(bearing, sightingId): VigiaResult<Bearing>` is `{ ...bearing, id: sightingId }` and nothing else (P-3.9), validated with Core's `validateBearing` first: a Bearing Core does not accept comes back as Core's failure, unchanged, so that no `NaN` leaves a public function (Req 2.1, 2.6).
- `canonicalise(sighting): VigiaResult<{ sighting: Sighting; code: string }>`: `code = encodeSighting(sighting)`; `decoded = decodeSighting(code)`; the result is `decoded` with the `origin` and `receivedUtcMs` of the input, and `code`. It is a fixed point (P-8.9): canonicalising a canonical Sighting returns an equal one with the same code.
- `captureToSighting(captured: Bearing, bytes: Uint8Array, incidentId: string, parameters): VigiaResult<{ sighting: Sighting; code: string }>`: the id from `bytes` (18 are needed), `withSightingId`, a local Sighting of the open `incidentId`, `canonicalise`. The failure of `encodeSighting` (time outside the 20 years of §8, which is a Bearing time the capture cannot have in practice but the function must refuse) is returned as it is.

### 7.4 The reducer (`math/incident/apply-action.ts`, `merge.ts`, Req 4, 5.6, 9.4 to 9.7)

`applyAction` is pure. Its **invariants**, held by every result and checked by P-4.7: I1 incident ids are unique; I2 within an Incident the `sightingId`s are unique and the entries are ordered by `sightingId` (code-unit order), so a state does not remember the order of arrival; I3 at most `maxSightingsPerIncident` entries; I4 `entry.sighting.incidentId` equals its Incident's id; I5 `entry.code` equals `encodeSighting(entry.sighting)`; I6 `openIncidentId` is `null` or an Incident's id; I7 each `Conflict` names a held `sightingId` and a code different from the held one. A failure returns no state: the caller keeps the old one.

| Action | Effect, and its failures |
|---|---|
| `createIncident` | needs `isIncidentId(incidentId)` and an unused id (else `invalid_number`, `field: 'incidentId'`); adds an empty Incident with `creation: 'created'` and opens it |
| `openIncident` | `incident_unknown` if not held; else sets `openIncidentId` |
| `addLocal` | needs the open Incident to be `sighting.incidentId` (else `incident_unknown`); `mergeSighting` with origin `local` |
| `addReceived` | the Incident known: `mergeSighting` with origin `received`, `receivedUtcMs = nowUtcMs`; unknown and `joinIfUnknown`: creates it with `creation: 'joined'`, `createdUtcMs = nowUtcMs`, opens it, merges; unknown and not `joinIfUnknown`: `incident_unknown` (the Inbox shows it and asks, Req 4.2) |
| `hide`, `show`, `deleteSighting`, `markShared` | find the entry by `sightingId` in any Incident; unknown: `invalid_number`, `field: 'sightingId'`; `markShared` keeps the last 20 records of an entry |
| `deleteIncident`, `deleteAll` | remove; the open Incident becomes `null` if it was removed |
| `expire` | removes every Incident whose newest entry's Bearing time (or `createdUtcMs` when it has none) is more than `incidentRetentionMs` before `nowUtcMs` (Req 4.5) |
| `replace` | takes a state that `parseStoredState` or another tab produced, and re-applies I1 to I7 (dropping what violates them) |

`mergeSighting(incident, sighting, code, receivedUtcMs, parameters)` returns the Incident and one outcome: `duplicate` (an entry with this `sightingId` and the same `code`: the Incident is returned **unchanged, the same object**, so `receivedUtcMs`, `hidden` and `shared` are not touched, Req 9.5); `conflict` (an entry with this `sightingId` and a different code: the held entry stays, a `Conflict` is added if not yet there, notice `sighting_conflict` carrying both codes); `full` (a new id and `maxSightingsPerIncident` entries: failure `incident_full`); `added`. The merge is a set union by `sightingId` and is commutative, associative and idempotent over sets of Sightings with distinct ids and at most the maximum; with a conflict or over the maximum the held ones win and the result depends on the order (Req 9.6 states the domain).

### 7.5 The stored format and its parser (`math/incident/storage-format.ts`, D4)

The key is `vigia.state` (the backup key `vigia.state.backup`). The text is JSON, written with the keys in this order:

```json
{ "format": "vigia-state", "version": 1, "savedUtcMs": 1790000300000, "openIncidentId": "K7PQ3MWXA2",
  "incidents": [ { "incidentId": "K7PQ3MWXA2", "createdUtcMs": 1790000000000, "creation": "created",
      "entries": [ { "code": "327VGW67HFXYW4EP3NHT3AFXPGBQKU927W36FR8FF326RWB8GH", "origin": "local",
          "receivedUtcMs": null, "hidden": false, "shared": [ { "channel": "link", "atUtcMs": 1790000200000 } ] } ],
      "conflicts": [] } ] }
```

- `serialiseState(state, savedUtcMs): string` writes only Incidents whose `incidentMode` is `device` (a simulated Incident that a real phone added is not kept across a reload, D4) and the entries' `code`, `origin`, `receivedUtcMs`, `hidden`, `shared`.
- `parseStoredState(text | null, nowUtcMs, parameters)` returns one of `{ kind: 'empty' }` (`null`), `{ kind: 'loaded', state, dropped }`, `{ kind: 'corrupt', raw }` or `{ kind: 'newer', version }`. Steps: (1) a text longer than 1 000 000 characters is `corrupt`; (2) `JSON.parse` in a `try`, not an object, or `format` not `"vigia-state"`: `corrupt` (this covers a **foreign** value); (3) `version` an integer above 1: `newer`; not an integer, or below 1: `corrupt`; (4) for each incident: `incidentId` must satisfy `isIncidentId` and not be `simulation` mode, `createdUtcMs` finite, `creation` one of two, else the incident and its entries are dropped (counted); for each entry: `decodeSighting(code)` must succeed, its `incidentId` must be the incident's, `origin` one of two, `receivedUtcMs` finite or `null` (null exactly for `local`), `hidden` boolean, `shared` an array of at most 20 records with a known channel and finite time; an entry that fails is dropped (counted); a duplicate `sightingId` keeps the first (counted); over `maxSightingsPerIncident` keeps the first by `sightingId` order (the rest counted); a conflict whose Sighting is not held (it was dropped, or never was) goes with it and is not counted again, while a conflict that is malformed, repeated, or whose held code is not the entry's is dropped and counted; (5) `openIncidentId` not an Incident's id becomes `null`; (6) retention is applied; (7) `dropped` is the number of things dropped, and the result is `loaded`. The store acts on the result: `corrupt` backs up `raw` (if the backup key is free), starts empty and shows `storage_corrupt`; `loaded` with `dropped > 0` shows `storage_corrupt` with the count; `newer` shows `storage_version_unsupported` and never writes the key.

### 7.6 The assessment (`math/assessment/assess.ts`, Req 5, 6.1, 6.6, D8)

`assess(incident, nowUtcMs, parameters)`:

1. **Order** the entries by `(bearing.timeUtcMs, sightingId)`. This order is for display; `solve` canonicalises by id itself.
2. **Hidden**: an entry with `hidden: true` is set aside with `hidden_by_user`.
3. **Implausible time**: of the rest, an entry with `timeUtcMs > nowUtcMs + clockSkewToleranceMs`, or `timeUtcMs < incident.createdUtcMs − maxIncidentAgeMs`, is set aside with `sighting_time_implausible`.
4. **Too old**: of the remaining candidates, let `reference` be the newest candidate's time when there are two or more, and `nowUtcMs` when there is one. A candidate with `timeUtcMs < reference − maxIncidentAgeMs` is set aside with `sighting_too_old`. (With two or more candidates the newest is never too old, Req 5.2.)
5. **Solve**: with two or more candidates left, `solve(new BearingModel(), candidates.map(bearing), { outlierRejection: true })`. On success every id in `fix.excludedIds` is set aside with `outlier`; the others are used; `fix` is the result. On the failure `invalid_observation` naming an `id` of a candidate, that candidate is set aside with `invalid_observation` and step 5 repeats (at most as many times as there are candidates). On any other failure the candidates stay **used** ("every Sighting as it was", Req 5.7) and `fix` is that failure. With fewer than two candidates `fix` is `null` and the candidates are used.
6. `checkLevel` is `none` for 0 used, `one`, `two`, `three`, `four_or_more`.
7. `disagreement` is `three_disagree` when exactly three are used, `fix` succeeded and the largest `|studentisedResidual|` in `fix.residuals` exceeds Core's exported `OUTLIER_STUDENTISED_RESIDUAL` (3.5) (amended 2026-11-19, Req 5.5: with three, Core gives all three the same magnitude, `√Cost`, Core Req 10.9, so "the largest" is any of them and names none; the Normalised residual understated a disagreement, and in the lead's case, three posts at (-800, 0), (800, 0) and (4000, 3500) m, the target at (0, 3000) m, sigmas 2° and the second Bearing 15° off, the largest Normalised residual was 3.31 and the app said nothing with the Fix 545 m from the target, where the Studentised residuals are 4.59); `diverging` when `fix` failed with `diverging_bearings` and three or more are used; otherwise `none`. Core returns `diverging_bearings` only from the bearing model's post-solve check, after the solve has converged: a remaining Bearing whose residual at the Fix is beyond 90° (the Fix lies behind its observer). With outlier rejection on, that needs a Bearing whose Studentised residual stays under the outlier limit, so one with a loose sigma: for example two Bearings crossing at 90° on the smoke and a third from beyond it with a 45° sigma that points 150° off (Core's own example); the assessment's examples are built from that condition.

A Sighting thus has exactly one cause, by the fixed order of 2 to 5 (P-5.10). The function names no Sighting as the cause of a disagreement and computes no second Fix (Req 5.5).

### 7.7 Statements by count (`math/assessment/statements.ts`, Req 5.4, 5.5)

`checkStatement(level)` returns one fixed sentence: `none`: "No sighting yet: point the phone at the base of the smoke and sight it."; `one`: "One sighting gives a direction, not a place."; `two`: "Two sightings always cross somewhere, so they cannot check each other: a wrong one gives a wrong place and nothing on the screen can tell."; `three`: "Three sightings can show that they disagree, but not which one is off; a fourth sighting can."; `four_or_more` (amended 2026-11-19, Req 5.4): "With four or more sightings the app sets aside one that does not agree with the others, by a statistical rule that can keep a wrong sighting and can set aside a good one; with only four or five sightings this happens more often." (Core's rule is the Studentised residual above 3.5. Core's statistical test of its Req 10.10, 2 000 sets a band with one azimuth 10° to 90° wrong, sets a good one aside in place of the wrong one in 3.5 % to 14.9 % of the sets of four, 0.4 % to 1.0 % of the sets of five, and at most 2.2 % at any count from six.) `disagreementStatement(d, level)`: `three_disagree`: "The sightings do not agree: at least one is off, and three sightings cannot tell which one; a fourth sighting can."; `diverging` with three: the same sentence; `diverging` with four or more: "The lines do not meet in front of the observers, so at least one sighting is off; hide a sighting to see whether the others agree."; `none`: no sentence. `incidentStatement()` is one more fixed sentence, shown in the words of the Incident beside the statement by count (Req 5.4): "Two phones can set different sightings aside when they joined this smoke at different times, so compare them if the places differ."

### 7.8 The words: formatting rules (`math/fix/format.ts`, `fix-words.ts`, Req 6.2, 6.3, 6.8, 14.1, 16.4, D9)

- **`lengthText95(x)`** (a length that is an uncertainty is rounded **up**): fails with `invalid_number` unless `x` is finite and greater than 0; for `x > 1 000 000` m the text is `over 1000 km` (a bound on the text's length, §7.12). For `x < 1000`: `v = ceil(x / 10) · 10`; for `x ≥ 1000`: `v = ceil(x / 100) · 100`. If `v < 1000` the text is `` `${v} m` ``, else `` `${(v / 1000).toFixed(1)} km` `` (so `995` gives `1.0 km`, and `2 041` gives `2.1 km`). Hence the rounded value is at least `x` and exceeds it by less than the step (10 m below 1 000 m, 100 m above; at most 10 m more where `v` crosses 1 000).
- **`lengthTextNearest(x)`**: nearest 10 m below 1 000 m, nearest 0.1 km from 1 000 m (a distance, not an uncertainty, Req 6.4).
- **`metresPerDegree`**: the value of `greatCircleDistanceM({ latRad: 0, lonRad: 0 }, { latRad: π/180, lonRad: 0 })` (Core returns a Result; for these two Supported positions it cannot fail, and the module unwraps it once at load, so a failure would be a programmer error), never from a radius of Vigia's own.
- **`positionDecimals(semiMinor95M)`**: the smallest `d` in `0 … 4` with `metresPerDegree · 10⁻ᵈ ≤ semiMinor95M`; `4` if there is none. So the printed step is never coarser than the semi-minor axis (rounding error at most half of it), and never finer than 4 decimals (about 11 m). This is Req 6.2's rule: the printed point is rounded by at most half a step that is not coarser than the uncertainty, and the radius of "within about" adds the printing bound.
- **`positionText(position, semiMinor95M)`**: `` `${lat}° N|S, ${lon}° E|W` `` with `lat = formatSignedDeg(|latRad|, d)` of UI (which writes no `-0`), the hemisphere letter from the sign (zero is `N` and `E`), `d` from `positionDecimals`. It returns the text and `printBoundM = hypot(0.5 · step, 0.5 · step · cos(latRad))`, the farthest the printed point can be from the Position.
- **`withinRadiusM(a95, printBoundM)`** `= a95 + printBoundM`, written with `lengthText95`: the sentence "within about R of this point" quotes this, so it stays true of the printed point. The semi-axes sentence quotes the pure `lengthText95(a95)` and `lengthText95(b95)` (Req 6.8, 14.8).
- **`compassWord8(azimuthRad)`**: `north`, `north-east`, `east`, `south-east`, `south`, `south-west`, `west`, `north-west`; sector `k = floor(((az in degrees + 22.5) mod 360) / 45)`. **`axisWords(azimuthRad)`** for a line (`[0, π)`): `` `${w(az)} to ${w(az + π)} (${round(az in degrees)}°)` ``.
- **`fixWords(fix, assessment, nowUtcMs, parameters)`**: `e95 = ellipse95(fix.ellipse)` (Core); then
  - `headline`: `Probably here: ${position}, within about ${R} (95 %).` (position, then the metres, in one sentence);
  - `area`: `The 95 % area is an ellipse with semi-axes ${A} and ${B}, long axis ${axis}.`;
  - `basis`: `Based on ${n} sighting(s) (${m} set aside); newest ${age}, oldest ${age}.`, the set-aside part only when `m > 0`, ages from `ageText` of the **used** Sightings' times;
  - `geometry`: by class (D10): `poor`: "Geometry: poor. Both of you look along nearly the same line; the smoke could be much nearer or farther than it shows."; `fair`: "Geometry: fair. The lines cross at a moderate angle."; `good`: "Geometry: good. The lines cross at a good angle.";
  - `warnings`: `poor_geometry`: "The sightings cross at a narrow angle (under ${round(toDeg(POOR_GEOMETRY_CROSSING_RAD))} degrees)."; `outliers_excluded`: `${k} sighting(s) did not agree with the others and were set aside.`;
  - `limits`: "This is a 95 % region if every sighting was aimed at the same point and its errors are independent and as stated. Phone compasses are off by several degrees; setting north on the Sun or a landmark reduces that."
  The words never contain `exact`, `located at`, `confirmed` or `precisely` (a test over the text, Req 6.3), and a failure of `ellipse95` is the function's failure. The parameters used are `longEllipseRatio` and `fairEllipseRatio` through `geometryClass`.
- **The sentence-group rule** (Req 16.4): a decimal degree or a length in the text of `fixWords` or `emergencyText` is always in a sentence that also holds a length or an angle that is its uncertainty. P-16.4 tests it by splitting the text at `. ` and requiring each sentence that holds a position (`° N`, `° S`) or a distance to hold `m (` / ` km (` / a `give or take` / a `±`-style phrase from a closed list.

### 7.9 The Geometry class (`math/fix/geometry-class.ts`, Req 7.1, 7.8)

`geometryClass(fix, parameters)`: `none` for `null`; with `elongation = fix.ellipse.semiMajorM / fix.ellipse.semiMinorM` (at least 1; the Ellipse has `semiMinorM > 0`): `poor` if `fix.warnings` includes `poor_geometry` or `elongation ≥ longEllipseRatio`; else `fair` if `elongation ≥ fairEllipseRatio`; else `good`. `checkParameters` guarantees `1 < fairEllipseRatio < longEllipseRatio` (Req 19.3). A pure function of the warnings and the Ellipse (P-7.8).

### 7.10 The Next-sighting advice (`math/fix/advice.ts`, Req 7.2 to 7.7, D10)

`nextSightingAdvice(assessment, parameters)`:

1. `used.length === 0`: `{ kind: 'none' }`. No Fix and one used: `{ kind: 'one_sighting' }`. No Fix and two or more used (a failed `solve`): `{ kind: 'one_sighting' }` too (Req 7.5: the advice of criterion 4, with the failure's Message shown beside it by the screen).
2. With a Fix: `μ = fix.ellipse.azimuthRad` (the major axis, in `[0, π)`); the two advised directions, as seen **from the Fix**, are `wrapTwoPi(μ + π/2)` and `wrapTwoPi(μ − π/2)`: at right angles to the major axis (derivation: a bearing constrains the position across its line of sight; the 2×2 information after adding one bearing of weight `w` along unit `n` perpendicular to the sight line is `I + w n nᵀ`, and `det` is largest, so the area smallest, when `n` is along the covariance's major axis, that is when the sight line is perpendicular to it).
3. `distanceM = clamp(nearest, adviceMinDistanceM, plausibleRangeM)`, with `nearest` the smallest great-circle distance from a used observer to the Fix.
4. For each direction: `P = destinationPosition(fix.position, direction, distanceM)`; the **hypothetical Bearing** `{ id: 'hypothetical', observer: P, positionAccuracyM: the largest of the used, timeUtcMs: the newest used time, azimuthRad: initialAzimuthRad(P, fix.position), azimuthSigmaRad: the largest of the used }`. `solve(new BearingModel(), [...usedBearings, hypothetical])` with **no** outlier rejection (so that the hypothetical one can never be excluded and the comparison is of geometry alone). `areaAfterM2 = π · a95 · b95` of `ellipse95` of that Fix; the better (smaller) of the two directions is reported; `null` if both solves fail. `areaBeforeM2` likewise from the Fix.
5. The hypothetical Bearing exists only inside this function (Req 7.6): it is not returned, drawn, stored or shared.

`adviceWords(advice, geometry, usedCount)`: `one_sighting`: "Move sideways, at right angles to the direction of the smoke, by at least a third of the distance you think the smoke is at; farther is better." (a Crossing angle of 20° needs a baseline of about 0.35 of the range: `2 · atan(0.35 / 2) = 19.8°`); `fix` with class `good`: "The geometry is good; a further sighting from anywhere still helps, because with fewer than four sightings nothing can be checked." when the count is two or three, else "The geometry is good."; `fix` with `poor` or `fair`: `To shrink the area most, take a further sighting from the ${w1} or the ${w2} of the smoke, about ${distance} from it. Move to the side, so that you and the others are not all on one line to the smoke. The app does not know the terrain, roads or access, so choose the place yourself.` (`w1`, `w2` from `compassWord8`; `distance` from `lengthTextNearest`; no place is named). The advice distance is a standing distance, not an estimate of where the smoke is, so it is outside Req 16.4's scan.

### 7.11 Direction and distance from this phone (`math/fix/from-you.ts`, Req 6.4, 6.9)

`halfIntervalM(e95, directionToFixRad) = sqrt(a² · cos²θ + b² · sin²θ)` with `θ = directionToFixRad − e95.azimuthRad` and `a`, `b` the 95 % semi-axes: the half-width of the polygon's shadow on that direction, hence a conservative (at least 95 %) interval for the distance. `fromYouWords(fix, you, parameters)` (every Core call below returns a Result and its failure is the function's failure, except where said): `d = greatCircleDistanceM(you, fix.position)`, `az = initialAzimuthRad(you, fix.position)` (a failure `coincident_positions` becomes the sentence "You are at the estimated position, so the distance cannot be given."), `h = halfIntervalM(e95, az)`; the text is `About ${lengthTextNearest(d)} ${compassWord8(az)} of you, give or take ${lengthText95(h)} (at least 95 %).` The distance is never produced without the interval (one function builds both).

### 7.12 The Emergency text (`math/fix/emergency-text.ts`, Req 14, D11)

Lines joined by a line feed; a line is present only as stated. With `mode === 'simulation'` the first line is exactly `SIMULATION: synthetic scene, not a real place.`

*With a Fix* (`assessment.fix` succeeded):
1. `Smoke seen by phone compass sightings; not confirmed.`
2. `Position: ${position}, probably within about ${R} (95 %).`
3. the `area` line of §7.8
4. the `basis` line
5. the `geometry` line (the same words as the Fix, Req 14.6; the `warnings` of §7.8 are not repeated: the geometry line and the set-aside count in line 4 say the same)
6. if `includeOwnPosition` and `ownPosition`: `My own position: ${positionText(own, accuracyM)}, known to about ${lengthText95(accuracyM)}.` (the decimals from the accuracy)
7. `These positions come from phone compass sightings, which are off by several degrees.`
8. `Written at ${clockTextUtc(nowUtcMs)}. The app that wrote this does not call or notify anyone.`

*With one used Sighting and no Fix* (Req 14.2): line 1; `Direction only, not a place: the smoke was seen toward ${round(az)} degrees (${compassWord8(az)}), give or take ${round(σ)} degrees (1-sigma), from where I stand.`; if `includeOwnPosition`: `I stand at ${positionText}, known to about ${accuracy}.`; line 7 with "directions" for "positions"; line 8. The observer's position is **never** in the text unless `includeOwnPosition` is on and `ownPosition` is given (Req 14.2, 14.3); other observers' positions, ids and codes never are. With no used Sighting: `insufficient_observations`. **Length**: the longest text the template can make (a simulation line, an own position, 32 sightings with 30 set aside, a `poor` geometry sentence, lengths written as `over 1000 km`, ages of 10 000 days) is **730 characters**, computed from the longest string of each line, so the function cannot exceed `maxEmergencyTextChars` (800); `checkParameters` requires `maxEmergencyTextChars ≥ 740` and P-14.8 checks the bound on generated Fixes. The result is also what the Copy control copies; it is produced again whenever the assessment changes (Req 14.6).

### 7.13 Link, extraction and display of the code (`math/code/code-link.ts`, Req 10.2 to 10.4, 10.9, 10.10)

- `buildSightingLink(pageAddress, code, parameters)`: the code must be 50 symbols of the alphabet (else `invalid_number`, `field: 'code'`); the address must begin `https://` or `http://localhost` or `http://127.0.0.1` (else `invalid_number`, `field: 'pageAddress'`); `base` is the address cut at the first `?` or `#`; the link is `base + '#' + code`. If its length exceeds `maxLinkLengthChars`: `link_too_long`. Strings only: no `URL` object, so no normalisation can move the code.
- `extractSightingCode(pasted)`: (1) find the first match of `/https?:\/\/[^\s#]*#/i`. If there is one, read the text after it character by character: skip whitespace and `-`; accept an alphabet symbol; stop at any other character, or after `CODE_LENGTH` symbols when the first symbol is the version symbol (so that trailing words in capitals are not read into the code), or after `maxCodeLengthChars` symbols; the result is the symbols read. (2) With no link: strip whitespace and `-`; if what is left is empty or has a character outside the alphabet, fail with `code_not_a_sighting`; else return it. A link whose text after `#` holds no symbol fails with `code_not_a_sighting`. (A message with two links reads the first, Req 10.9.)
- `groupCode(code)`: ten groups of five symbols joined by `-`. The decoder removes whitespace and hyphens first, so a group-formatted code, a code broken across lines and a link all decode to the same Sighting.

### 7.14 The Network gate (`math/network/gate-decision.ts`, `adapters/network-gate.ts`, Req 11, D14)

`decideRequest(url, hostList)`, in this order, each step a refusal with `host_not_allowed` and `field` naming the step:
1. `new URL(url)` in a `try`; a failure to parse is `field: 'url'`.
2. `parsed.href === url`: the input must already be in canonical form (so an upper-case host, an explicit default port, a dot-less percent-encoding variant or a missing path slash is refused, not normalised into a listed request) (`field: 'canonical'`).
3. `protocol === 'https:'` (`field: 'scheme'`); `username === '' && password === ''` (`'userinfo'`); `port === ''` (`'port'`); `hash === ''` (`'fragment'`).
4. the entry with `entry.host === parsed.hostname` (exact string equality, so `example.com.evil.test`, `example.com.`, `example.com@evil.test` (its hostname is the part after `@`) and IDN look-alikes (their `hostname` is the `xn--` form) are all different) (`field: 'host'`).
5. the path: `pathname` split on `/` after the first, with exactly `entry.path.length` segments, each matching its `ValueKind` (`literal` equal; `oneOf` a member; `number` `^-?\d+(\.\d{1,maxDecimals})?$`; `key` `^[A-Za-z0-9]{8,64}$`; `area` four numbers joined by commas) (`field: 'path'`).
6. the query: `searchParams` holds exactly the names of `entry.query`, each once, each value matching its kind (`field: 'query'`).
It returns the `HostEntry` (so the gate knows the response limits and the entry's id). The URL builders of the Overlays produce canonical strings and are held by a property to be accepted (P-11.9 domain, second part).

`createNetworkGate(fetchLike, hostList, parameters, timer)`: `get(url)`: `decideRequest` first (a refusal returns before any call to `fetchLike`); then `fetchLike(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', headers: {}, signal })` with an `AbortController` aborted by a one-shot of `timer` after `requestTimeoutMs`; any rejection or abort is `overlay_unavailable` with `errorName` (`timeout`, `offline`, or the error's name); a non-OK status is `overlay_unavailable` with `errorName: 'status-<code>'`; the body is read from the stream counting bytes and aborted past `maxResponseBytes` (`overlay_unavailable`, `errorName: 'too-large'`); when there is no stream, `text()` is read and its length checked. The gate has no other method and sends no body, no cookie, no header (Req 11.7). Its only clients are the Overlays, which is why its transport failures are `overlay_unavailable` (Req 11.7).

### 7.15 The request boxes (`math/network/request-boxes.ts`, Req 12.3, 12.11, 13.2)

- **Second release, in `overlays/hotspots/math/hotspot-box.ts`:** `hotspotBox(positions, parameters)`: fails with `invalid_number` (`positions`) if empty or any is not Supported; `degrees` of each; `minLon`, `maxLon`, `minLat`, `maxLat`; `maxLon − minLon > 180` fails with `crosses_antimeridian`. With `g = hotspotGridDeg` and `m = hotspotMarginCells`: `west = floor(minLon / g) · g − m · g`, `east = ceil(maxLon / g) · g + m · g`, `south`, `north` likewise, then clamped to `[-180, 180]` and `[-90, 90]`. If `(east − west) · (north − south) > maxHotspotBoxDeg2`: `overlay_area_too_large`. Because `g` is a multiple of `0.5` the corners are exact in binary floating point; for any other grid the corners are within `1e-9` of a multiple (P-12.11). The URL text prints each corner with `toFixed(decimals of g)`.
- `windPoint(position, parameters)`: `lat = round(latDeg / g) · g`, `lon` likewise (`g = windGridDeg`), written with `toFixed(1)`; a position that is not Supported fails with `unsupported_position`. The point is within `g / 2` of the position on each axis.
- The request for hotspots (second release) takes the used observers and the Fix, never the set-aside Sightings' observers; the request for wind takes the Fix or, with none, the midpoint (the mean of the observers' unit vectors on the sphere, by Core's functions; for observers within 180° of each other the mean of latitude and longitude is the same to the grid). Neither request carries an id, a time, an azimuth or an accuracy (Req 12.3): the URL builders take only the box or the point.

### 7.16 The wind Overlay (`overlays/wind/`, Req 13)

- **Request**: `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timeformat=unixtime`. The Host list entry states exactly these five parameters.
- **`parseWindResponse(text, point, parameters)`** (Req 13.6): `JSON.parse` in a `try` (else `overlay_unavailable`, `field: 'json'`); the value must be an object with an object `current`; `current.time` a finite integer (Unix seconds, `timeformat=unixtime`), `current.wind_speed_10m` finite and `≥ 0`, `current.wind_direction_10m` finite and in `[0, 360)`; `current_units.wind_speed_10m` the text `m/s`; any other case is `overlay_unavailable` naming the field (a missing needed field is refused, never defaulted). The reading is `{ point, directionFromRad: fromDeg(direction), speedMs, validUtcMs: time · 1000 }`. The details this relies on (the time format and the unit text) are the official page's as I read it plus Open-Meteo's `timeformat` parameter; **they are to be confirmed against a real response (Device check V9)**.
- **`windWords(reading, nowUtcMs, parameters)`**: `Wind from the ${compassWord8(from)} (${round(from)}°) at ${speed to 0.1} m/s, valid ${clock} (${age}).`; if `validUtcMs < nowUtcMs − maxWindAgeMs`: "This is an old reading, not the wind now." with the reason `overlay_stale`; if `validUtcMs > nowUtcMs + maxWindAgeMs`: "This is a forecast for ${clock}, not the wind now."; always: "It is a model value at one point and one time; smoke may lean or rise differently, and this app does not predict the spread of a fire." and the Source's attribution (CC BY 4.0) from the Host list entry.
- **`windFeatures(reading, lineLengthM)`**: from the request point `P`, the direction the wind blows **to** is `from + π`; `L = max(300, 0.15 · lineLengthM)`; `Q = destinationPosition(P, to, L)`; a shaft `appFeature('wind-shaft', 'w', line [P, Q])` and a head `appFeature('wind-head', 'w', line [A, Q, B])` with `A`, `B` at `Q + 0.3 L` back along `to ± 150°`. Two layers: `wind` (line, `#0B4F8A`, 4 px) for the shaft and `wind-head` (line, same) for the head.
- **Controller** (`wind-controller.ts`): off at start; `setEnabled(true)` and `refresh()` request once each (never a timer, Req 13.7); `update(context)` recomputes the point and the layers without a request; a failure shows its Message beside the switch and changes nothing else (Req 12.2).

### 7.17 The hotspot Overlay (`overlays/hotspots/`, Req 12)

**Second release: built only on the lead's word after the wind checkpoint.** Nothing in the first release depends on this section; it is in no count and in no task group of the first release (Req 1.10).

- **Request**: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${west},${south},${east},${north}/${hotspotDayRange}`: the shape of the official Area page (the key, the source, the area as `west,south,east,north`, the day range 1 to 5). The Host list entry states the five path segments and no query. **Without a key** (`VITE_FIRMS_MAP_KEY` empty) the switch is disabled with `overlay_needs_key` and no request is made; **in Simulation mode** the controller reads `fixtures/firms-sample.csv` through a fixture `fetchLike` behind the same gate and needs no key (Req 12.9).
- **`parseHotspotCsv(text, nowUtcMs, parameters)`**: it reads the **first line as the header**, splits every line on `,`, and finds columns **by name**: needed `latitude`, `longitude`, `acq_date`, `acq_time`; optional `scan`, `track`, `instrument`. A header without a needed column is refused: `overlay_unavailable` with `field` naming the missing column (the response is not read further). A row is **valid** if it has as many fields as the header and contains no `"`; `latitude` and `longitude` parse to finite numbers that are a Supported position; `acq_date` matches `YYYY-MM-DD` and names a real day; `acq_time` is an integer 0 to 2359 whose last two digits are under 60 (read as `HHMM`, so `931` is 09:31); the time (`utcMsFromCivil`) is not later than `nowUtcMs + clockSkewToleranceMs`. An invalid row is counted and dropped. The footprint is `max(scan, track) · 1000` m when both are finite and in `(0, 20]` km; else, from `instrument` (`VIIRS` gives 375 m, `MODIS` 1 000 m); else `null` (counted as `hotspot_footprint_unknown`). The valid rows are ordered newest first, ties by latitude then longitude, and cut to `maxHotspotCount` (`truncated: true` if any were cut). The text is read only up to `maxResponseBytes` (the gate has cut it already); no text of the response is ever rendered, only numbers and the counts. **The column names and their value formats are my reading of the official Area page and of what FIRMS is known to return; they are to be confirmed against a real response (Device check V9).**
- **`selectRecent(hotspots, nowUtcMs, parameters)`**: those with `nowUtcMs − timeUtcMs ≤ maxHotspotAgeMs`, with the count of older ones hidden (said, Req 12.7).
- **`hotspotFeatures(hotspots)`**: for each with a footprint `h`, a square of side `h` centred on the position: its four corners by `unprojectToLocalPlane(center, { eastM: ±h/2, northM: ±h/2 })` (Core), `appFeature('hotspot', id, polygon)` (the ring closed by the builder). Two layers: `hotspots` (fill, `#D2691E`, opacity `0.35`) and `hotspot-edges` (line, `#8B3A0F`, 2 px, `fit: true`, Req 18.5). A detection without a footprint is **not** drawn.
- **`hotspotWords`**: the Source's name, attribution and terms (from the Host list), "newest detection ${clock} (${age}), fetched ${clock} (${age})", the counts shown, hidden as older and without a known size (with the Message of `hotspot_footprint_unknown`), "Satellites pass at intervals, so no detection does not mean no fire; a detection is heat seen from space, not a confirmed fire.", and with none recent "No recent detection in this area (fetched ${clock})." With a Fix and at least one drawn, the one fact of Req 12.8: `The nearest detection (pixel about ${size}) is ${lengthTextNearest(d)} from the centre of the 95 % ellipse, whose semi-axes are ${A} and ${B}; seen ${age}.` (Req 12.8's example reads "whose semi-axes are 300 m and 120 m"), with `d` the great-circle distance from the Fix to the nearest detection's centre. The words never contain `confirm`, `match` or `support` about the Fix (a test).

### 7.18 The map model (`math/fix/map-model.ts`, Req 18)

`mapModel(assessment, parameters)` returns what the map screen gives `MapView`: `observers` (the used Sightings' observers with the Sighting id), `bearings` (the used Bearings), `lineLengthM`, and the **set-aside layers**. `lineLengthM` is 5 000 m with no Fix, else `clamp(1.3 · the farthest used observer's distance to the Fix, 2 000, 500 000)`. The set-aside layers are `set-aside` (a dashed line, `#6B6B6B`, 3 px, dash `[4, 3]`: for each set-aside Sighting a line from its observer along its azimuth for `lineLengthM`, by `destinationPosition`, built with `appFeature('set-aside', sightingId, …)`) and `set-aside-observers` (circle, `#6B6B6B`, 5 px), so that a user sees which line was left out (Req 18.3). The wind Overlay adds two layers (`wind`, `wind-head`), so the first release uses **four of the eight** `MAX_APP_LAYERS` allow, held by a test that sums the ids; the hotspot Overlay of the second release adds two more (`hotspots`, `hotspot-edges`), six in all. The observer markers are UI's; no accuracy circle is drawn (Req 18.7); the accuracy is in the list.

### 7.19 The Transports (`adapters/transport/`, Req 9, 10.1, 10.7)

- **Memory network** (`createMemoryNetwork(plan, timer)`): `join(phoneId): Transport`. `send(code)` returns `ok` at once and, for every other phone, takes `steps = plan(from, to, code, sequence)` and, for each step, schedules `copies` deliveries after `delayMs` with a one-shot of `timer`. A delivery calls the receiver's `onReceive` listeners with the text. The plan is any pure function, so loss is `[]`, duplication `copies: 2`, reordering different delays; the same plan runs against `createRelayLikeTransport` of the test support (a second Transport built differently: it routes through a shared list with a different scheduler), which is how Req 9.9 is exercised. A `Transport` never parses its text.
- **Manual transport** (`createManualTransport({ present })`): `send(code)` calls `present(code)` (the Share sheet opens with the link, the QR and the text) and returns `ok`; `receive(text)`, called by the paste box and by the page's fragment handler, delivers to `onReceive` listeners. Its status is `available`.
- Both are used through the one interface; the store does not know which delivered a text.

### 7.20 Parameters (`math/parameters.ts`, Req 19)

`checkParameters` returns `invalid_number` naming the first field that is not finite, not positive (for the counts, an integer of at least 1), or inconsistent: `incidentRetentionMs ≤ maxIncidentAgeMs`; `fairEllipseRatio ≤ 1`; `longEllipseRatio ≤ fairEllipseRatio`; `windGridDeg ≤ 0` (the second release adds `hotspotGridDeg ≤ 0` and `maxHotspotBoxDeg2 < hotspotGridDeg²`); `maxLinkLengthChars` below the length of a code plus a minimal address (`CODE_LENGTH + 'https://a.b/#'.length`); `maxEmergencyTextChars` below 740 (the worst case of §7.12). Each function of the Math layer takes `parameters` as an argument; none reads `defaultParameters()` (a purity rule: `defaultParameters` is called only in `main.tsx`, `simulation/` and tests).

## 8. The sighting code in full (`math/code/`, Req 8, D5)

**Shape.** A code is **50 symbols** of the 31-symbol alphabet of §7.2: `V K P₁ … P₄₄ C₁ … C₄`. `V` is the version (`3` for version 1: the symbol of value 1), `K` the kind (`2` for `sighting`: value 0), `P` the 44 payload digits, `C` the four check symbols. Every version-1 code of a Sighting therefore begins `32`. The payload is one integer in mixed radix, written in base 31, most significant digit first. The design was prototyped outside the repository (an executable sketch of exactly this section: encode, decode, the check, and a brute-force search for undetected damage) to obtain the numbers below; the examples in §8.7 are its output.

### 8.1 The fields

| # | Field | Unit | Range | Quantisation (what is stored, what is lost) | Radix | Bits |
|---|---|---|---|---|---|---|
| 1 | Incident id | 10 symbols | any 10 symbols; first `Z` is Simulation mode | exact | `31¹⁰` | 49.54 |
| 2 | Sighting id | 9 symbols | any 9 symbols | exact | `31⁹` | 44.59 |
| 3 | observer latitude | degrees | `[-89, 89]` (the Supported range) | cell `i = floor((lat + 89) / 1e-5°)`, clamped to `0 … 17 799 999`; **decoded at the cell's centre** `-89 + (i + ½) · 1e-5°`; error at most `0.5e-5°` = 0.556 m | `17 800 000` | 24.09 |
| 4 | observer longitude | degrees | `(-180, 180]` | cell `j = floor((lon + 180) / 1e-5°)`, clamped to `0 … 35 999 999`; decoded at the centre; error at most `0.5e-5°` of longitude (at most 0.556 m, less away from the equator) | `36 000 000` | 25.10 |
| 5 | time of the sighting | UTC ms | `[2026-01-01T00:00:00Z, 2046-01-01T00:00:00Z)`, 20 years | second `t = floor((time − epoch) / 1000)`; decoded at `epoch + t · 1000 + 500 ms`; error at most 0.5 s | `631 152 000` | 29.23 |
| 6 | azimuth (true) | degrees | `[0, 360)` | cell `a = floor(az / 0.001°)`, clamped to `0 … 359 999`; decoded at the centre; error at most `0.0005°` (the wrap at 360° never happens: there is no cell 360) | `360 000` | 18.46 |
| 7 | azimuth 1-sigma | degrees | `[0.01°, 45°]` | **rounded up**: `k` the smallest integer in `1 … 4500` with `degToRad(k / 100) ≥ σ`; decoded `degToRad(k / 100)`; never less than the original, and less than `0.01°` more | `4 500` (stores `k − 1`) | 12.14 |
| 8 | position accuracy | metres | `[0, 10 000]` | **rounded up** to a whole metre: `⌈accuracy⌉`; never less, less than 1 m more | `10 001` | 13.29 |

The payload is `N = ((((((F₁ · R₂ + F₂) · R₃ + F₃) · R₄ + F₄) · R₅ + F₅) · R₆ + F₆) · R₇ + F₇) · R₈ + F₈` with `Fᵢ` the field's integer and `Rᵢ` its radix, a `BigInt`. The product of the radices is `2^216.43`; `31⁴⁴` is `2^217.98`, so **44 digits** hold it, with 1.55 bits to spare (a decoded `N` not below the product is not a code: `code_damaged`). The fixed epoch is `1 767 225 600 000` ms.

**Why this rounding never lowers an uncertainty (Req 8.4).** The two **uncertainties** (the sigma and the position accuracy) are rounded **up**, in the exact comparison of the decoder's own function for the sigma (`degToRad` of Core, the one `parseBearing` will call), so the decoded value is at least the original in floating point and not only approximately; and re-encoding a decoded sigma gives the same `k`, so the code is a fixed point (P-8.9). The three **measurements** (position, time, azimuth) are rounded to a cell centre, with errors of at most 0.79 m (the two latitude and longitude errors together: `√2 · 0.556 m`), 0.5 s and 0.0005°. These are one to three orders of magnitude below the uncertainties that travel with them (a Position fix's accuracy is metres to tens of metres, Sensors' heading 1-sigma is 2°), and **every phone uses the decoded values, the sender included** (D6), so the error is common to all and never makes two phones disagree. It is still a difference between what the sensor read and what is used; it is stated here and in the code's comment, not hidden (Req 8.4).

### 8.2 Encoding

`encodeSighting(sighting)`: (1) `validateBearing(sighting.bearing)` (Core; its failure is returned); (2) `sighting.sightingId` must equal `bearing.id` and satisfy `isSightingId`, and `incidentId` `isIncidentId` (else `invalid_number`, naming `sightingId` or `incidentId`); (3) the time must lie in the 20 years (else `invalid_observation`, `field: 'timeUtcMs'`); (4) the fields of §8.1 from `radToDeg` of Core, by the rules above; (5) `N`; (6) its 44 base-31 digits; (7) `V K digits`, then the four check symbols. A Bearing that Core's `serialiseBearing` accepts is accepted here unless its time is outside the 20 years.

### 8.3 The check value

The check is a **CRC over the field GF(31)**, with the generator polynomial `g(x) = x⁴ + x + 1` (found by search: the first monic quartic with a non-zero constant term that has no root and no quadratic factor in GF(31)[x], so it is irreducible; only the non-zero constant term is needed for the guarantees). The message is the 46 symbols `V K P₁ … P₄₄` as the coefficients of `m(x)`, the first symbol the highest power. The check symbols are the four coefficients, highest first, of `r(x) = m(x) · x⁴ mod g(x)`, all arithmetic modulo 31. The decoder recomputes `r` from the first 46 symbols and compares it with the last four.

### 8.4 What the check is proved to detect (Req 8.6)

Let the sent word and the received word differ in positions that all lie within a window of at most four consecutive symbols. The difference, as a polynomial, is `e(x) = xᵏ · b(x)` with `b ≠ 0` of degree below 4 (the symbols of the message and of the check are consecutive powers of `x`, so a window crossing from the payload into the check is still a window). The received word passes iff `g` divides `e`. But `g(0) = 1 ≠ 0`, so `g` and `xᵏ` have no common factor, and `g` would have to divide `b`, which has a smaller degree and is not zero. So it does not divide: **the check detects every change confined to four consecutive symbols**: a single symbol, two adjacent symbols (both changed, either way), the swap of two adjacent symbols (which differ), and a change of three or four adjacent symbols. A **cut** (or an extension) at any length changes the length, and the decoder requires length 50 once the version is known (§8.5, step 7); whatever the check says, a code of another length is `code_damaged`. For damage of any other shape, a uniformly random damaged string passes the check with probability `31⁻⁴ = 2^-19.85`, under `2^-16`. **It is not a signature**: anyone can compute the check; it says that the text is intact, not who made it (Req 15.7).

Held by the prototype: for the three examples of §8.7, every single-symbol substitution (30 per position, 50 positions), every swap of two unequal neighbours, every cut at lengths 1 to 49, and every change of two adjacent symbols (900 per position) was refused with `code_damaged`: 137 091 damaged variants, none accepted; and of 2 000 000 random 50-symbol strings, 2 passed the check (the expected number is 2.2).

### 8.5 Decoding

`decodeSighting(text, parameters)`, in this order:
1. `text.length > maxCodeLengthChars` (2 048): `code_too_long` (before any other work).
2. Remove every whitespace character and every hyphen. If nothing is left: `code_not_a_sighting`.
3. A character not in the alphabet (a lower-case letter, `0`, `1`, `I`, `L`, `O`, a symbol of any kind): `code_damaged`. There is no case folding and no look-alike mapping (a mapping would let a damaged code through and break Req 8.10, Req 8.2).
4. Fewer than 6 symbols: `code_damaged`.
5. The check over all but the last four symbols must equal the last four: else `code_damaged`. **This comes before the version** so that no single-symbol change of a valid code can be anything but `code_damaged`.
6. `V` not `3` or `K` not `2`: `code_version_unsupported` (the check of a code of another version or kind is valid only because its maker computed it; Req 8.5, 8.7).
7. A length other than 50: `code_damaged`.
8. `N` not below the product of the radices: `code_damaged`.
9. The fields to a `BearingWire` (degrees, `v: 1`, `kind: 'bearing'`, `id` the Sighting id) and **`parseBearing(wire)`** of Core: its failure is returned unchanged (it validates exactly as Core would). The result is `{ sightingId, incidentId, bearing, origin: 'received', receivedUtcMs: null }`; the caller stamps `receivedUtcMs`.

### 8.6 Lengths

- The code is **50 symbols**. Displayed in the text form as ten groups of five joined by `-`: 59 characters.
- The **link** is the page address (without its query and fragment), `#`, and the 50 symbols. For the address `https://vigia.example.org/` (26 characters) the link is **77 characters**; the longest address that keeps the link within `MAX_LINK_LENGTH_CHARS` (160) is **109 characters**. Beyond that: `link_too_long`, and the text code is still offered.
- The **QR** of a 77-character link in byte mode at level M is version 5 (37 × 37 modules); of a 160-character link, version 9 (53 × 53).

### 8.7 Three worked examples (synthetic; `fixtures/sighting-codes.json`)

Every position is near the synthetic origin `30° N, 40° W` or an extreme of the ranges. Times are UTC. The azimuth is true. The three codes were produced by the prototype and decode back to the values shown.

| | A: a real Incident, the "west" post of a scene | B: a Simulation Incident, minimum sigma, accuracy 0 | C: the extremes |
|---|---|---|---|
| Incident id | `K7PQ3MWXA2` | `ZB4N8RTY5C` (first symbol `Z`: simulation) | `C222222222` |
| Sighting id | `H4TN9RV6C` | `2222222XY` | `ZZZZZZZZZ` |
| Observer | `30.1234° N, 40.0567° W` | `30.0° N, 40.0° W` | `89° N, 180° E` |
| Time | `2026-09-21T14:13:20.000Z` | `2026-09-21T14:15:23.456Z` | `2045-12-31T23:59:59.999Z` |
| Azimuth | `45.5°` | `359.9996°` | `0°` |
| Sigma | `2.0°` | `0.01°` | `45°` |
| Position accuracy | `8 m` | `0 m` | `10 000 m` |
| `V K` | `32` | `32` | `32` |
| payload (44) | `7VGW67HFXYW4EP3NHT3AFXPGBQKU927W36FR8FF326RW` | `CBYCHGRHRYG4PX7AH8SYYD5C7GZCVXJ4BQEE3U3TVT8P` | `5EN636NMPH56SW8ZWJ3XDMCSARJWYA5AH9TE25T7JDE9` |
| check (4) | `B8GH` | `FSJE` | `8FQS` |
| **Code** (grouped) | `327VG-W67HF-XYW4E-P3NHT-3AFXP-GBQKU-927W3-6FR8F-F326R-WB8GH` | `32CBY-CHGRH-RYG4P-X7AH8-SYYD5-C7GZC-VXJ4B-QEE3U-3TVT8-PFSJE` | `325EN-636NM-PH56S-W8ZWJ-3XDMC-SARJW-YA5AH-9TE25-T7JDE-98FQS` |
| Decoded latitude, longitude | `30.123405° N`, `40.056705° W` | `29.999995° N`, `40.000005° W` | `88.999995° N`, `179.999995° E` |
| Decoded time | `…14:13:20.500Z` (+0.5 s) | `…14:15:23.500Z` (+0.044 s) | `2045-12-31T23:59:59.500Z` (−0.499 s) |
| Decoded azimuth | `45.5005°` | `359.9995°` | `0.0005°` |
| Decoded sigma, accuracy | `2.00°`, `8 m` | `0.01°`, `0 m` | `45°`, `10 000 m` |
| Link on `https://vigia.example.org/` | 77 characters | 77 | 77 |
| Fixed point | `encode(decode(code)) = code` | yes | yes |

Damage on example A (each refused with `code_damaged`, run on the prototype): the 8th symbol `7` replaced by `G`; the 20th and 21st symbols (`T` and `3`) swapped; the code cut to 49 symbols; the 5th symbol `G` written `g` (outside the alphabet). The grouped form `327VG-W67HF-…` and the same code broken across lines decode to the same Sighting. A version-2 frame: replacing the first symbol of A by `4` and recomputing the four check symbols gives a text with a valid check that decodes to `code_version_unsupported`. An empty text is `code_not_a_sighting` (run on the prototype); a 2 049-character text is `code_too_long` by step 1 (the prototype has no length limit; this one is the design's).

## 9. The screens on a phone (D17; Req 3, 4, 6, 7, 10, 14, 15, 16, 18)

Portrait only, one column, designed for 360 CSS pixels of width. The controls that act are in the lower part of the screen, where the holding hand's thumb reaches: a bar of four tabs at the very bottom and, above it, the screen's primary action (at least 64 px tall; every other control at least 48 × 48 with 8 px between). Text is at least 20 px for readouts and 16 px for the rest; colours, sizes and fonts come from UI's exported `COLOURS`, `SIZES` and `FONT_STACK`, so the contrast of 7:1 holds by the skeleton's own test of its palette. Every failure on every screen is a `FailureNotice` that shows `messageFor` of Vigia and no code. In Simulation mode a banner stays at the top of every screen: "SIMULATION: invented scene, invented sensors; nothing here is a real place."

| Screen | Reached from | What it shows, in words | What the thumb can do |
|---|---|---|---|
| **Smoke** (tab 1, the first screen) | start; the tab | At the top: "This app does not call or notify anyone. If there is fire, call the emergency number first." (Req 14.5). With no smoke open: "No smoke yet" and how to start. With one open: when it was started (UTC, and how long ago), "N sightings, M used"; then, with a Fix, the words of `fixWords` (the position and its metres in one sentence, the 95 % area, the basis, the geometry), "About D km NE of you, give or take H (at least 95 %)" when the phone knows where it is, UI's limits note, and the **advice** (the sentence by count and, with a Fix, where to stand); without a Fix, the statement by count (one sighting is a direction, not a place; how to get a position). With a disagreement, the sentence of §7.7; and the Incident's note that two phones can set different sightings aside when they joined at different times (Req 5.4). | **Sight the smoke** (primary, 64 px); **Add a sighting someone sent me** (opens the Inbox sheet; a badge shows how many wait); **Delete everything on this phone** (asks once, Req 4.5); a link to **What leaves this phone** (the privacy page) |
| **Sight** (full screen, from Smoke) | the primary button | Before the first capture of a session and after it, on a card that stays one tap away: how to aim: at the base of the smoke where it meets the ground or the ridge, not the top which the wind has moved; stand where the smoke is clearly in view; hold still until the readout says steady; and, with a wind reading shown, that smoke leans downwind (Req 16.2). Then UI's `SightingScreen` (device mode, through UI's exported `DeviceSighting`: the camera and the phone's sensors, **crosshair only**, no calibration; Simulation mode: the Scene image, the scene's calibration and `simulationTapSigmaPx`, so a tap on the frozen image is a Mark; the screen says these two are simulation values). After the capture, UI's summary with the sigma and what it is made of, then the **question** (Req 4.3): "Is this the same smoke as before?", preselected when the open smoke's newest sighting is within `maxIncidentAgeMs`, with "A different smoke" and a sentence that a second column seen from here needs its own smoke. | UI's controls (Start, Freeze, Capture, north from the compass or a known azimuth); the answer buttons; **Back** |
| **Sightings** (tab 2) | the tab bar | The statement by count; for each sighting a row: "Sighting 2, this phone" or "received at 14:07 UTC"; "toward 45.5° ± 2.0°"; "observer position known to 8 m"; "taken 14:13 UTC, 12 min ago"; **used**, or **set aside: <the Message of its cause>**; which channels it has been shared by (Req 15.5). Below the list, any **conflict** with both versions side by side (Req 9.5). | per row: **Hide** or **Show**, **Share**, **Delete** (asks once); at the bottom: **Add a sighting someone sent me** |
| **Map** (tab 3) | the tab bar | UI's `MapView`: observers, bearing lines and wedges of the used sightings, the Fix and its 95 % ellipse, the set-aside lines in grey dashes; then the **legend** (what each drawing is, its Source and time) and the **Overlays panel** (it exists only if the Overlays module is present): a switch for **Wind** (the hotspot switch is second release) with, before the first use, the sentence of what will be sent, to whom and what it carries (Req 13.1, 12.1); once on: the Source's name, attribution and terms, the time of the data and its age, and the words of §7.16. The tile attribution is MapLibre's own. | the wind switch; **Refresh** (the wind asks for new data only on this tap, Req 13.7) |
| **Emergency** (tab 4) | the tab bar, the Smoke screen | "This app does not call or notify anyone. Call the emergency number; this text only helps you say where the smoke is." (Req 14.5); then the **text** of §7.12, selectable, at readout size, with the time it was made; in Simulation mode it begins `SIMULATION: …`. With no Fix and one sighting: the direction-only text; with none, how to start. | **Copy** (primary, 64 px; on failure the text stays selected and `clipboard_unavailable` shows); a switch **Include my own position** (off by default, Req 14.3) |
| **Share sheet** (a modal over Sightings or Smoke) | **Share** on a sighting | Before the first Share of a session and in the details of each: what the code holds (the position to about 1 m, its accuracy, the time, the direction and its uncertainty, the smoke), that whoever holds it sees where the observer stood and when, that it cannot be taken back (Req 15.2); a **hidden** sighting is marked "you hid this one" (Req 15.6). Then three presentations of one code: the **link** (what it is for: someone far away with a connection), the **QR** (someone beside you whose phone has a connection to load the page; "works only when the phones are together", and "needs a connection on the other phone", Req 10.7, 10.8) and the **text** in ten groups of five (for a phone that has the app open and no connection). With a page address too long, "link too long" and only the text. In Simulation mode: the text and one button per other phone ("Send to the phone at the east post"); no link, no QR, no system share (Req 17.4). | **Copy link**, **Share…** (when `navigator.share` exists), **Copy text**, **Show QR**; each of these is an explicit act and records the channel (`markShared`); **Close** |
| **Inbox sheet** ("Add a sighting someone sent me") | Smoke, Sightings, a link opened with a code, a Transport delivery | A paste field ("paste the link or the code"); and one card for each waiting sighting: "toward 45.5° ± 2.0°; observer position known to 8 m; taken 12 min ago; for the smoke you have open / for a smoke this phone does not have (N sightings)". **The observer's position is not shown on the card**, only after it is added (Req 15.8). The sentence that a code has no proof of who made it (Req 15.7). | **Add**; for an unknown smoke **Open it as a new smoke on this phone** (asks once, Req 4.2); **Ignore** |
| **What leaves this phone** | a link on Smoke and on the Share sheet | The table of Req 15.3, from `PRIVACY_TABLE`. | **Back** |

**Navigation.** The four tabs are always there except on the Sight screen (full screen) and in a modal. A link that opens the page with a code goes to the Inbox sheet over the Smoke screen and then replaces the address (Req 10.3). The mode control ("This phone" / "Simulator") is at the top of the Smoke screen, shown when the browser has `DeviceOrientationEvent`; without it the app is in Simulation mode with no control (Req 17.1).

## 10. The reviewer's path (D16; Req 17)

**Mode.** `main.tsx` asks Sensors' `browserEnvironment().hasDeviceOrientation`; false starts Simulation mode. The Simulation shell replaces the Sight screen's source and the stores' environment; every other screen is the same code.

**The four scenes** (`math/scenes/smoke-scenes.ts`), each built by `sceneFromOffsets` from `CATALOGUE_ORIGIN` (`30° N, 40° W`, in the open Atlantic) and `CATALOGUE_CALIBRATION` (UI's), each with the Target `{ id: 'smoke', label: 'Smoke column', east 0 m, north 3 000 m, height 100 m }`, and each Station's script from `scriptForStation(scene, stationId, 'smoke', options)` with `orientationNoiseSigmaRad = 0.05°` (the catalogue's) unless stated. Offsets are east, north in metres from the origin. The "Fix" column is computed from exact Bearings with a 2.1° sigma by Core (the design's probe, deleted afterwards); the shown Fix of a run has the noise and Sensors' own sigma, so its numbers differ a little.

| Scene (id) | Stations (id: east, north) | What the reviewer sees | The probe: 95 % semi-axes, elongation, warning |
|---|---|---|---|
| **Two posts** (`two-posts`) | `west: −800, 0`; `east: 800, 0` | a Fix with a long ellipse (north-south); Geometry `poor` (by elongation); the advice "from the east or west of the smoke, about 3.1 km" | 765 m × 204 m, 3.75, none |
| **Three posts** (`three-posts`) | the two above, `side: 3100, 3000` | after two captures the advice points at the `side` post's place; after the third the ellipse is round; Geometry `good` | 262 m × 204 m, 1.28, none |
| **Four posts with one wrong** (`four-posts-one-wrong`) | `west`, `east`, `side`, and `southwest: −2500, −500` with `frame: { kind: 'absolute', northErrorRad: 12°, resets: [] }` | with the fourth capture the app sets `southwest` aside with the cause `outlier` and shows the Fix of the other three; the screen says what the rule can and cannot do | with `southwest` 12° off and Core's rejection: excluded, Fix 262 m × 204 m on the target. (A 10° error is excluded and an 8° error is **not**. The same 12° on `side` is **not** excluded: its residuals stay under 1.7 and the Fix lies 546 m from the smoke. That is the limit Req 5.4's words state, and why the wrong post is `southwest`.) |
| **Two posts almost in line** (`almost-in-line`) | `front: 0, 0`; `back: 420, −3000` | Crossing angle about 4°, `poor_geometry`, a Fix 8.6 km long by 241 m wide: the geometry sentence, the warning and the advice | 8 635 m × 241 m, 35.8, `poor_geometry` |

Each scene passes UI's `checkScene` and the Simulator's script validation (a test creates a Simulator for every Station of every scene, Req 17.2). Each is a `CatalogueScene { scene, scripts, aimTargetId: 'smoke', kind: 'bearing', failure: null, description }`, the shape UI's `SimulatorPanel` takes. The integration test uses copies of the scenes with `orientationNoiseSigmaRad` 0 (Req 17.7).

**Phones.** One **phone** per Station of the chosen scene (D16). The shell keeps, for each Station id: a `VigiaStore` over a memory `VigiaStorage` (`persistent: false`), a `Transport` joined to one `createMemoryNetwork(plan, timer)` (the default plan delivers every send to every other phone, once, at once), a `ManualTransport` for the paste box, and its own `inbox`. UI's `SimulatorPanel` is **the phone in hand**: the Station the panel is on is the active phone; changing the Station in the panel changes which phone's screens the app shows, and the others stay as they were (their stores keep their sightings). A capture on the panel (the Session's `captured` changes) goes to the active phone's store through `captureToSighting` and the question of Req 4.3. Sending from the active phone's Share sheet delivers the code, text only, to the inboxes of the other phones; the reviewer switches Station and adds it. The app's **Clock** in Simulation mode is the largest `nowUtcMs` any phone's Session has reported (never decreasing), so ages and expiry are in simulated time; the Incident ids are made with `incidentIdFromBytes(bytes, 'simulation')`, so their first symbol is `Z` and a real phone that receives one says so (Req 17.4).

**The flow of Req 17.3 on a laptop**, step by step: choose a scene (the panel's list is `smokeScenes()`); the panel's Start (the permission is not required in the scripts); Freeze; Capture (crosshair, or tap the smoke on the frozen image for a Mark); the question (same smoke); the Smoke screen shows one sighting; change the Station in the panel, repeat; the Fix, its words and the advice appear; the Emergency tab shows the text with the `SIMULATION:` line; Share on a sighting, "Send to the phone at …", change the Station, the Inbox shows the card, Add; the merged Fix. No sensor, no camera, no network: the Network gate is the **refusing** gate of the test, and the wind Overlay (if switched on) reads `fixtures/open-meteo-sample.json` through a fixture `fetchLike` behind the same gate.

**The statistical harness** (P-17.9; `test-support/capture-from-script.ts`): for a scene, a run `r` and a seed, for each Station: `northErrorRad = HEADING_SIGMA_RAD · z` with `z` from a seeded standard normal (a 32-bit integer generator, Box–Muller; the seed is `seed + 1000 · run + stationIndex`, passed as an argument); the script is `scriptForStation(scene, stationId, 'smoke', { orientationNoiseSigmaRad: 0.05°, frame: { kind: 'absolute', northErrorRad, resets: [] } })`; `createSimulator(script, runSeed, options)`; its samples, its Position fix and Frame resets are given to Sensors' `createSampleHistory` and `add…`; the Bearing is Sensors' `captureBearing` over the window of the last `SIGHTING_WINDOW_LENGTH_MS` ending at the newest sample, with the Declination of `declinationAt` (the Absolute frame needs it), the `HEADING_SIGMA_RAD` of Sensors' defaults and no Yaw reference; its `id` becomes the Station id (unique within a run). In `four-posts-one-wrong` the script's deliberate 12° error is replaced by the drawn one, so that all four Stations are consistent (Req 17.9). The Fix is Core's `solve` of the run's Bearings with `outlierRejection: true`, as the app calls it (no effect with three or fewer; with four it may set a consistent Bearing aside, and the number of such runs is reported). The target is inside the 95 % ellipse when, with `(u, v)` its offset from the Fix on the Local plane rotated to the ellipse's axes, `(u / a95)² + (v / b95)² ≤ 1`, with `a95`, `b95` from `ellipse95` of Core. Four scenes (`two-posts`, `three-posts`, `almost-in-line`, `four-posts-one-wrong`), 400 runs each. The runs in which `solve` succeeded are split by the Geometry class of the Fix (`geometryClass`, §7.9). For the runs that are **not** `poor`, the share with the target inside the ellipse lies in `[0.90, 0.99]` for every scene that has at least 100 such runs (Req 17.9); a scene with fewer has its share reported and not bounded. For the `poor` runs the share is reported and **not bounded** (Req 17.9). For each of the two groups the report gives the runs, the failed solves, the group size and the share. A scene whose runs are nearly all `poor` (the probe's elongations are 3.75 for `two-posts` and 35.8 for `almost-in-line`) may have fewer than 100 runs in the bounded group, and then the bound does not apply to it, because a small group's share is noisy (with 20 runs a true 95 % falls under 90 % about once in twelve). The report prints the group size and says for each scene whether the bound was applied. A test of the harness's rule shows the bound applied at 100 runs and not at 99. The harness does not use UI's Session: the Session's capture is covered by UI's own end-to-end property (UI P-16.8), and using `captureBearing` directly is what the Session itself calls.

## 11. Correctness properties

Every property is a `fast-check` property in a `*.property.test.ts` file, with a comment above it naming the property and the requirements it validates. The ones that need only the Math layer are in the `math` project; those that need an Adapter are in the `adapters` project (P-10.10, P-11.9's second half); those that need the store are in the `components` project (P-15.9). A failing property is classified code, property or requirement before anything changes (`testing.md`, rule 1). `test:deep` runs the property files of `math` and `adapters` at the second count. **The costs are estimates**: no code exists to measure them (as UI's first design said); the first checkpoint of the tasks reports the measured milliseconds a case and raises or lowers the counts, never below 200.

There are **27 properties** in the first release, with **29 property tests** in about 22 files: one property for each of the 25 FOR ALL criteria of the requirements that the first release builds, and two design properties (P-6.2, the rounding rule of the words; P-16.4, the scan of Req 16.4, which says "a test SHALL scan"). Two of them have two tests (P-8.10, P-11.9). Requirement 12's two properties (P-12.10, P-12.11) belong to the hotspot Overlay: they stay in the table, marked, and are in no count.

### Generators (domains stated; `test-support/generators.ts`)

"Uniform" draws use 53 unbiased random bits, as UI's `uniform` (`fc.noBias`), not `fc.double`; "closed" draws include both ends of the interval on purpose (one draw in ten), as UI's `closed`.

- **`byteSource`**: a `Uint8Array` of 0 to 64 bytes in four shapes (uniform random, all `0x00`, all `0xFF`, a repeated two-byte pattern), at least 18 bytes in four draws of five (shorter ones are the example for `invalid_number`).
- **`symbols(n)`**: `n` symbols uniform over the alphabet (ends `2` and `Z` drawn).
- **`codeBearing`**: a Core-valid Bearing inside the code's ranges: observer latitude `[-89°, 89°]` and longitude `(-180°, 180°]` (closed; `±89°` and `180°` drawn), time `[epoch, epoch + 20 years)` ms (the first and the last millisecond drawn), azimuth `[0, 2π)` (`0` and `2π − 1e-12` drawn), sigma `[0.01°, 45°]` (Core's two limit constants drawn), position accuracy `[0, 10 000]` (both ends drawn), `id` a Sighting id.
- **`sightingArb`**: `codeBearing`, an Incident id (the first symbol `Z` one draw in four), `origin` each of two, `receivedUtcMs` finite or `null` accordingly.
- **`consistentBearings(n)`** (Req 5.12, 7.7): a target within 20 km of the synthetic origin; `n` observers each 500 m to 15 km from it at a uniform azimuth; every Bearing points exactly at the target with a stated sigma in `[0.5°, 3°]` and a position accuracy in `[1, 20]` m; **for P-5.12 and P-7.7 the sets whose largest Crossing angle is under 30° are discarded** (an example covers a 2° set); P-5.13 has no condition on the crossing angles (Req 5.13).
- **`sightingSet`** (Req 5.10, 5.11): 2 to 12 Bearings from observers within 20 km of the origin, with times drawn from `now − 4 h … now + 10 min` (so some are older than `maxIncidentAgeMs` and some later than `now + clockSkewToleranceMs`), `hidden` one draw in six, and an Incident creation time drawn from `now − 4 h … now`; an observer within 1 m of the target is excluded (it cannot sight it, and Core's `initialAzimuthRad` refuses it), and has an example test of its own.
- **`fixCase`**: a Fix built directly (as UI's `fixAround`): a Position as UI's `mapPosition` (latitude `[-84°, 84°]`), `semiMajorM ∈ [1, 100 000]` (log-uniform, ends drawn), `semiMinorM ∈ [1, semiMajorM]` (circular one draw in six), `azimuthRad ∈ [0, π)`; only the Ellipse and the Position are read by the functions it feeds (P-6.9, P-6.10).
- **`storageActions`** (Req 4.7): 0 to 200 actions among `create`, `join` (from a code of a generated `sightingArb` of another Incident), `capture`, `receive` (the same code again one draw in four), `hide`, `show`, `delete`, `deleteIncident`, `deleteAll`, `expire` and `reload` (serialise, parse, `replace`), against a fake Storage.
- **`deliveryPlan`** (Req 9.6): a set of 2 to 12 Sightings with distinct ids and at most the maximum, and for each a list of deliveries (zero to three copies, delays `0 … 50 ms`) to each of 2 to 4 phones, so that loss, duplication and reordering all occur.
- **`pageAddress`** (Req 10.9): `https`, 1 to 5 host labels of `[a-z0-9-]`, 0 to 4 path segments, an optional query of 0 to 3 pairs; and the same with `http://localhost`.
- **`hostileRequest`** (Req 11.9): a request built from **parts**, so that the verdict is known by construction: a scheme (`https`, `http`, `ftp`), optional userinfo, a host string (a listed host, a listed host with a prefix or suffix label, with an `@` before it, in upper case, with a trailing dot, an IDN look-alike), an optional port, a path, a query; the oracle compares the parts with the Host list entry directly (never through `URL`).
- **`windResponse`** (Req 13.6; the second release adds `firmsCsv`, Req 12.10): responses in the documented shape, with a share of invalid entries (below).
- **`observerSet`** (second release, Req 12.11): 1 to 8 Supported Positions, each within `±84°` latitude, spread over `0 … 20°`, plus a Fix position among them.
- **`hostile*`**: `hostileNumber`, `hostileString` and the other hostile generators are copies of UI's (`NaN`, `±Infinity`, `-0`, subnormals, `±MAX_VALUE`, the doubles either side of every limit of Vigia's parameters, strings of 0 to 10 000 characters of the full BMP); test support is not exported across packages, so it is copied (UI D20).

### Properties

| ID | Req | Generator | Check | Runs (test / deep) |
|---|---|---|---|---|
| P-2.6 | 2.6, 19.3 | `hostile*` for every public Math-layer function (the words, the code, the reducer with hostile actions, the assessment, the box and gate functions, the parsers, `checkParameters` with one hostile field) | no call throws; every number in a result is finite; a parameter that is `NaN`, infinite, not positive or inconsistent is `invalid_number` naming it | 200 / 10 000 |
| P-3.9 | 3.4, 3.9 | `codeBearing` re-labelled `bearing-<time>` as Sensors' capture does, `byteSource` of at least 18 bytes | `withSightingId` passes `validateBearing` and differs from the input in `id` only; `sightingIdFromBytes` gives 9 symbols of the alphabet and `incidentIdFromBytes` 10, with first symbol `Z` iff the mode is `simulation` | 200 / 10 000 |
| P-4.7 | 4.7 | `storageActions` | after every action I1 to I7 hold; no Incident holds two Sightings with the same id or more than the maximum; the Sightings held are exactly those a reference model of the actions says (added, not deleted, not expired); `parseStoredState(serialiseState(s))` gives `loaded` with a state equal to `s` (device Incidents) and `dropped = 0` | 200 / 2 000 |
| P-5.10 | 5.1, 5.2, 5.3, 5.10 | `sightingSet` | `used` and `setAside` partition the entries; each set-aside has exactly one cause and it is the one a simple reference implementation of the order of §7.6 gives; the Bearings given to `solve` (observed through `fix.residuals` ids and `excludedIds`) are exactly `used` plus the `outlier`s | 200 / 5 000 |
| P-5.11 | 5.11 | `sightingSet`, a drawn permutation of the entries | `assess` of the permuted Incident gives the same `used` ids, the same causes and a deeply equal Fix (position, covariance, `excludedIds`) | 200 / 5 000 |
| P-5.12 | 5.12 | `consistentBearings(4 … 12)` plus one Bearing whose azimuth is wrong by `δ ∈ [10σ, 90°]` (an observer 500 m to 15 km from the target) | the app's `outlier` set equals `solve(…, { outlierRejection: true }).excludedIds` on the same Bearings; the shown Fix is **exactly** the Fix `solve` returned for the call (deep equality; the app adds nothing and changes nothing); a cold-started `solve` of the remaining Bearings is a **counter with no bound** (its distance from the shown Fix in millimetres: median, 99th percentile, worst), because the two are runs of Core's solver from different starting points and differ by about its convergence step (measured 2026-11-19: median 0.0000 mm, 99th percentile 0.10 mm, worst 4.4 mm over 3 339 cases); when `solve` fails, the app shows Core's failure as the Fix, keeps every Sighting used and sets none aside as `outlier`; counters (reported, not failing): the wrong one excluded, a good one excluded, none excluded, and `solve` failed, by reason. (Core's rule fails with `not_converged` in a share of these sets that grows with the error, measured by the lead on 2026-11-19; Core's outlier rule is changed in a skeleton task group after checkpoint 9, and Vigia works around none of it) | 200 / 2 000 |
| P-5.13 | 5.5, 5.13 | `consistentBearings(3)` with sigmas in `[0.5°, 1°]` (observers 500 m to 15 km from the target, no condition on the crossing angles), plus a gross error on one of the three, the carrier drawn uniformly among them, the band of the error drawn uniformly among `3°–6°`, `6°–12°`, `12°–30°` and `30°–90°` and the error uniform within its band, either sign; a seed passed as an argument | in every case: `assess` names no Sighting and returns no second Fix (`setAside` empty, `used` has three, `fix` is Core's one); in the cases where `solve` succeeds: the Bearing with the largest `|normalisedResidual|` is the carrier in at most `50 %` of them (a statistical bound, not per case), the share reported for each band and the cases where `solve` failed counted by reason; a share above `50 %` stops the work (Req 5.13). This replaces the first form, a comparison of the unit vectors of residuals within `0.1` with a sign rule: the linear argument fails for gross errors, which move the Fix enough to change the geometry, and the sign rule was unstable when two components are about equal | at least 2 000 / 10 000 |
| P-6.2 | 6.2 | `b ∈ [0.1, 1e7]` m (log-uniform, the decimal-step values `11.1, 111, 1 112` … and their neighbours drawn), `x ∈ (0, 2e6]` | `positionDecimals(b)` is in `0 … 4`, is the smallest `d` whose step `metresPerDegree · 10⁻ᵈ` is at most `b` (or 4 if none); `lengthText95(x)` is at least `x` (read back from its text) and exceeds it by less than its step (10 m below 1 000 m, 100 m above, plus the at most 10 m at the 1 000 m seam); `over 1000 km` only for `x > 1e6` | 200 / 100 000 |
| P-6.8 | 6.2, 6.3, 6.8 | Fixes of `consistentBearings(2 … 12)` through `assess` | the text of `fixWords` contains `lengthText95` of both 95 % semi-axes (the oracle is an independent formatter in the test), the count of used Sightings, the position printed with the decimals of P-6.2 (not more), `probably` or `Probably` and `within about`, none of `exact`, `located at`, `confirmed`, `precisely`, and none of `NaN`, `Infinity`, `undefined`, `null` | 200 / 5 000 |
| P-6.9 | 6.4, 6.9 | `fixCase`, a direction in `[0, 2π)` (the ellipse's axis and its normal drawn) | `b95 ≤ h ≤ a95`; `h` equals the largest extent of the polygon of UI's `fixFeatures` projected on the direction within `1e-3 · a95`; `h = a95` at `θ = 0` and `b95` at `θ = π/2` within `1e-9 · a95` | 200 / 5 000 |
| P-6.10 | 6.10 | Fixes of `consistentBearings` | `semiMajor(ellipse95(e)) / semiMajor(e)` and the minor ratio equal `2.4477` within `1e-9` (the literal of `math-conventions.md`); the `fixWords` axes are `ellipse95` of the Fix's own Ellipse (a mutation that scales by another constant fails) | 200 / 5 000 |
| P-7.7 | 7.7 | `consistentBearings(2 … 3)` with Elongation of at least `1.5` (a draw that is rounder is discarded and counted) | the area after the hypothetical Bearing from either advised direction is at most the area after the same one from the same distance along the major axis (built by the test, with Core's `destinationPosition` and `initialAzimuthRad`) within relative `1e-6`, and at most the area before; counter: the cases in which the advised direction gave the smallest area among 36 directions at 10° steps within 1 % | 200 / 2 000 |
| P-7.8 | 7.1, 7.8 | `fixCase` with warnings `[]` or `['poor_geometry']`; ratios from `parameters` | class `poor` iff `poor_geometry` or Elongation `≥ longEllipseRatio`; `fair` iff not poor and `≥ fairEllipseRatio`; else `good`; the same Fix gives the same class; no input but the warnings and the Ellipse matters (a copy with every other field changed gives the same class) | 200 / 10 000 |
| P-8.8 | 8.8 | `sightingArb` | `decodeSighting(encodeSighting(s))` succeeds; its Bearing passes `validateBearing`; the position is within 1 m (Core's `greatCircleDistanceM`), the time within 1 s, the azimuth within `0.001°` (wrapped), `σ' ≥ σ` and `σ' − σ < 0.01°`, `a' ≥ a` and `a' − a < 1`; `sightingId` and `incidentId` are equal | 200 / 100 000 |
| P-8.9 | 8.9 | `sightingArb`, and `canonicalise` of its result | `encode(decode(encode(s))) = encode(s)`; the code has 50 symbols and the link on a page address of 109 characters is at most 160; `canonicalise` is idempotent | 200 / 100 000 |
| P-8.10 | 8.10, 8.6 | (a) `sightingArb` with, for its code, **every** single-symbol substitution by any of the 30 other symbols or by an outside character, every swap of two unequal neighbours, 40 changes of two adjacent symbols drawn at random positions with random symbols, every cut to 1 … 49 symbols and extensions by 1 … 3 symbols (about 1 700 decodes a case); (b) strings of 0 to 10 000 characters (`hostileString`, symbol strings of length 40 to 60, and codes with 1 to 6 random symbols replaced) | (a) every one is `code_damaged`; (b) `decodeSighting` never throws; the share of successes is reported (counter) and is exactly the strings that are a valid code | (a) 200 / 2 000 cases, (b) 200 / 10 000 |
| P-9.6 | 9.5, 9.6, 9.9 | `deliveryPlan` over `createMemoryNetwork` (a `FakeTimer` advanced past the largest delay) and over the second Transport `createRelayLikeTransport` of the test support; the Inbox's "add all" action | after delivery each phone's Sighting set equals the union of the codes that reached it at least once; two phones that received the same set (any order, any duplication) have deeply equal Sighting sets (same creation time) and deeply equal `assess` (used, causes, Fix); the property is run through both Transports | 200 / 2 000 |
| P-9.7 | 9.7 | as P-9.6 with codes of other Incident ids mixed in | an Incident's set holds only Sightings of its own `incidentId`; the other Incidents' codes wait in the Inbox or join their own Incident | 200 / 2 000 |
| P-10.9 | 10.2, 10.9 | `pageAddress`, `sightingArb`; the code written in groups, with spaces and one line feed inserted at random places **after the `#`**, the link surrounded by 0 to 200 characters of arbitrary text on each side (the text before contains no `://`, and a character after the code's 50th symbol is not a symbol: the generator's domain, with an example for a message that has two links) | the link equals the address without query and fragment plus `#` plus the code; **no character of the code occurs before `#`**; `extractSightingCode` then `decodeSighting` gives the same Sighting; a link that would exceed 160 characters is `link_too_long` | 200 / 10 000 |
| P-10.10 | 10.3, 10.10 | `pageAddress` and `sightingArb`; the fake `VigiaPage` opened at the link; the store's fragment handler with a recording Network gate | after the handler runs, the page's address (as the fake `replaceAddress` was last called) is the address without the fragment; the gate was never called; no argument of any adapter call contains a symbol-run of the code, except the Inbox card of the decoded Sighting in the store | 200 / 2 000 |
| P-11.9 | 11.3, 11.9 | `hostileRequest` (verdict by construction); and URLs from the wind builder for random points (the hotspot builder's boxes join them in the second release) | `decideRequest` accepts iff scheme `https`, no userinfo, no port, no fragment, the host equals an entry's exactly, the path and the query are the entry's (and the input is canonical); the gate calls the injected fetch iff it accepts, and then with `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'` and no header; the builders' URLs are always accepted | 200 / 100 000 (decision), 200 / 2 000 (gate) |
| P-12.10 (second release) | 12.6, 12.10 | (a) `firmsCsv`: 0 to 500 rows with valid fields and a share of invalid ones (`NaN`, a string for a number, a missing field, a position out of range, a negative size, a time later than now plus the skew, a quote in a row), in header orders drawn at random, with and without the optional columns; (b) arbitrary text of 0 to 10 000 characters | (a) the parsed hotspots are **exactly** the valid rows (compared with an independent row validator written in the test), all numbers finite, at most `maxHotspotCount`, newest first; a header without a needed column is refused naming it; (b) never throws | 200 / 10 000 each |
| P-12.11 (second release) | 12.3, 12.11 | `observerSet`, `hotspotGridDeg ∈ {0.1, 0.25, 0.5, 1}`, `hotspotMarginCells ∈ {0, 1, 2}` | the box contains every position; its corners are multiples of the grid (within `1e-9`); for every position, in at least one direction the box edge is at least `margin · grid` away (so the request does not place the observer more finely than the grid, Req 12.11); its area is at most `maxHotspotBoxDeg2` or the call is `overlay_area_too_large`; an antimeridian set is `crosses_antimeridian`; the URL contains no id, time, azimuth or accuracy (the builder's arguments are the box and the key only) | 200 / 100 000 |
| P-13.6 | 13.6, 13.3 | `windResponse`: valid shapes with random fields, and invalid ones (`NaN`, negative speed, a direction of 360 or `-1`, a missing time, a number as a string, a wrong unit, a non-object `current`); directions `[0, 360)` | the parsed reading is valid or a failure, all numbers finite, direction in `[0, 2π)`, speed `≥ 0`; `compassWord8` is the word of the 45° sector centred on the direction, boundaries by example (`22.5°` is north-east, `337.5°` north); `windWords` says forecast or old exactly when the absolute difference between `valid` and `now` exceeds `maxWindAgeMs` | 200 / 10 000 |
| P-14.8 | 14.1, 14.3, 14.6, 14.8 | assessments of `consistentBearings(1 … 12)`, `mode` each, `includeOwnPosition` each | the text is at most `maxEmergencyTextChars` (and never over 730); contains no `NaN`, `Infinity`, `undefined`, `null`; with a Fix: both 95 % semi-axes, the count, the geometry sentence of the Fix; every sentence that holds a position holds metres of uncertainty; **contains no observer position, Sighting id, Incident id or code unless `includeOwnPosition`, and then only the own position** (the test searches the text for every observer's formatted position and every id) | 200 / 5 000 |
| P-14.9 | 14.9 | Fixes as P-14.8 | the position in the text, read back by parsing, is within `0.5 · 10⁻ᵈ° + 1e-9` of the Fix's, with `d` the decimals the text used, by Core's great-circle distance (Req 14.9's `5e-5°` is the case `d = 4`) | 200 / 5 000 |
| P-15.9 | 15.9 | `storageActions` extended to the actions of Requirements 3 to 14 (capture, share by each channel, copy, switch an Overlay on, paste, open a link) with a recording Network gate, a recording Transport, a recording Clipboard, a fake Storage, a fake page and a spy on `console` and on the history | no Sighting code, no observer position and no azimuth appears in any argument to the gate, in a URL path or query, in a `console` call or in a title; a code appears in the Transport's and the Clipboard's records only after a Share action or a Copy that the sequence holds, and only the code of the Sighting shared | 200 / 1 000 |
| P-16.4 | 16.4, 6.4, 14.8 | assessments as P-14.8; the words functions of §7.8, §7.11 and §7.12 | each sentence that holds a decimal degree (`° N`, `° S`, `° E`, `° W`) or a distance has, in the same sentence, `within about`, `give or take`, `semi-axes`, `known to about` or `give or take … degrees`; checked by splitting at `. ` | 200 / 5 000 |
| P-17.9 | 17.9 | the scenes `two-posts`, `three-posts`, `almost-in-line` and `four-posts-one-wrong` (its deliberate error replaced by a drawn one); the statistical harness of §10 | among the runs in which `solve` succeeded and the Fix is **not** `poor`, the target is inside the 95 % ellipse in at least 90 % and at most 99 %, **for a scene only when at least 100 of its runs are in that group** (with fewer the share is reported and not bounded); for the `poor` runs the share is reported and not bounded; for each group the runs, the failed solves, the group size and the share are reported; a result outside the bounds stops the work and is classified | 400 runs per scene in both runs (the deep run adds a second pass of 4 000 for the report) |

**Properties that need a mutation check** (the tasks run each once, as UI's group 27 did): the sigma rounded down; the check computed over the payload only; the version read before the check; a code symbol logged; a host list entry that accepts a prefix; the position decimals read the other way; an observer's position in the text; the third Bearing marked as the culprit; a hotspot drawn without a footprint (second release).

## 12. Example and component tests

**Math examples** (beside each file; each failure reason has one):
- *Messages* (`messages.test.ts`): `MESSAGES` has exactly the keys of `VIGIA_REASONS`; the 47 UI rows equal UI's `messageFor`; each of the 22 Vigia rows (and, in the second release, the three of the hotspot Overlay) obeys UI's rules (one sentence of at most 160 characters ending in a full stop, none of the forbidden strings, no code, no `_`); a type-level test that a new reason without a row does not compile (a `// @ts-expect-error` on a copy of the union).
- *Time* (`civil-time.test.ts`): (`utcMsFromCivil`'s examples, second release: `utcMsFromCivil(2026, 9, 21, 14, 13)` is `1 790 000 000 000 − 20 000`; the first day of 2026 is `1 767 225 600 000`; 29 February of 2028 is valid and of 2027 is not; month and day limits); `clockTextUtc(1 790 000 000 000)` is `14:13 UTC`; `ageText` at 59 999, 60 000, 3 599 999, 3 600 000, 172 799 999 and 172 800 000 ms.
- *Identifiers*: constant bytes (all `0x00`, all `0xFF`) give valid ids; 17 bytes fail with `invalid_number`, `field: 'bytes'`; `incidentIdFromBytes` never starts with `Z` in `device` mode over 10 000 byte strings of the extremes and always does in `simulation` mode.
- *The code* (`sighting-code.test.ts`, against `fixtures/sighting-codes.json`): the three examples of §8.7 encode to exactly their codes and decode to exactly their values (the fixture holds the Sightings, the expected codes and the expected decoded values; read-only); the damage examples of §8.7; a code of version 2 with a valid check; empty text; 2 049 characters; groups, line breaks and a link; a lower-case code; `0`, `1`, `I`, `L`, `O` each; a code whose payload is `N ≥` the product (built by raising the top digits and recomputing the check); an encode with a time one millisecond before the epoch and at the 20-year end (`invalid_observation`, `field: 'timeUtcMs'`); a sighting id different from `bearing.id`; the exact integer arithmetic for field boundaries (latitude `±89°`, longitude `180°`, a longitude just above `-180°`).
- *Links* (`code-link.test.ts`): the address of 109 characters gives a 160-character link and 110 gives `link_too_long`; a query and a fragment on the page address are dropped; `http://localhost:5173/` is accepted and `http://example.org/` is not; a message with two links reads the first; trailing capitals after the link are not read into the code; a message with no link and prose is `code_not_a_sighting`.
- *Storage format* (`storage-format.test.ts`): the JSON of §7.5 is produced exactly for a fixed state (key order, no extra fields); `null` is `empty`; not JSON, an array, `{}`, a different `format`, `version: 0` and `version: 1.5` are `corrupt`; `version: 2` is `newer`; an entry whose code has a flipped symbol is dropped and counted; a duplicate, an entry of another Incident and 33 entries are salvaged and counted; a simulated Incident is not written; the text over 1 000 000 characters is `corrupt`; retention removes an old Incident on load.
- *The reducer* (`apply-action.test.ts`): each action's effect and failure of §7.4; the duplicate keeps `receivedUtcMs`, `hidden` and `shared` and returns the same object; a conflict keeps the held entry and records both codes; the 33rd entry is `incident_full`; `addReceived` into an unknown Incident without `joinIfUnknown` is `incident_unknown` and with it creates a `joined` Incident and opens it; deleting the open Incident makes `openIncidentId` `null`; `expire` at the boundary (exactly the retention is kept, one millisecond more is removed).
- *The assessment* (`assess.test.ts`): one example per cause and per order case (a hidden Sighting that is also too old is `hidden_by_user`); the "only one Sighting" rule against `nowUtcMs`; two old Sightings both used; the `invalid_observation` loop with a stub model is not possible (the model is Core's), so this cause has an example that calls the internal loop with a fake `solve` result; three Sightings with a residual above 3.5 give `three_disagree` (a fixed set of Bearings found by a search in the test: an error large enough that the Studentised residuals pass 3.5), the lead's case of 2026-11-19 (§7.6 step 7: no Normalised residual over 3.5, the Fix 545 m away, the Studentised residuals 4.59) gives `three_disagree`, and a 12° error on the `side` post of `three-posts` does not (the probe: residuals about 1.2); `diverging` with a fixed pair of Bearings that point away from each other; the two thresholds are Core's exports, pinned to the solver by Core's own test (G5), and the purity scan forbids a copy here.
- *Words* (`fix-words.test.ts`, `emergency-text.test.ts`, against `fixtures/emergency-texts.json`): three synthetic Fixes (a round 40 m ellipse near `30° N, 40° W`, the scene `two-posts` Fix of 765 m by 204 m, a 12 km one) with the exact expected text of `fixWords` and of `emergencyText` in each mode (the fixture holds Fix, options and text; read-only); `lengthText95` at 9.99, 10, 10.01, 994.9, 995, 999.99, 1 000, 1 000.01, 2 041, 1e6 and 1e6 + 1; `positionDecimals` at the four step values and their neighbours; `compassWord8` at 22.4°, 22.5°, 337.4°, 337.5°; the one-Sighting text with and without the own position; the simulation line; the text of a failed `ellipse95`.
- *Advice* (`advice.test.ts`): the example of Req 7.9 (two observers 800 m east and west of a target 3 000 m north: the advised directions are within 5° of 90° and 270° and the distance within 20 % of 3 000 m, from the scene `two-posts`); `2 · atan(0.35 / 2)` within `0.2°` of 20° and the sentence contains "a third"; the advice for a round Fix; for none and for one Sighting; the hypothetical Bearing is not in the returned value.
- *From you* (`from-you.test.ts`): the half-interval at `θ = 0`, `π/2` and `π/4` against the ellipse; a phone at the Fix's position gives the `coincident_positions` sentence.
- *Network* (`gate-decision.test.ts`): each look-alike of Req 11.9 refused with its field (`example.com.evil.test`, `@`, upper case, trailing dot, an IDN host, a port, userinfo, `http`, a fragment, a missing, repeated or extra query parameter, a path of the wrong shape, a non-canonical form); the accepted URLs (wind, and a tile entry built from a template; the hotspot URL joins them in the second release).
- *Boxes* (`request-boxes.test.ts` for `windPoint`; the hotspot box examples, second release, go in `hotspot-box.test.ts`): the observers and Fix at `(30.12° N, 40.08° W)` and `(30.31° N, 39.94° W)` give the box `(-41.0, 29.5, -39.0, 31.0)`: west of `40.08` is `40.5` snapped out, plus one cell, and so on (the exact numbers are in the test); an antimeridian pair; a box of 17 square degrees; `windPoint(30.123, -40.168)` is `(30.1, -40.2)`.
- *Parsers* (`wind-parse.test.ts` against `fixtures/open-meteo-sample.json`; second release: `hotspot-parse.test.ts` against `fixtures/firms-sample.csv`, both synthetic and built by hand from the documented field names): each needed field missing in turn (wind: the five fields; hotspots, second release: the four columns); the header in another order (hotspots); `acq_time` `931`; a quoted field; a footprint from `scan` and `track`, from `instrument` and unknown; 501 rows truncate.
- *Scenes* (`smoke-scenes.test.ts`): each of the four passes `checkScene`; a Simulator is created for every Station; **`four-posts-one-wrong` through `assess` sets `southwest` aside as `outlier`**, and the same 12° on `side` is not set aside; the classes of the other three scenes are the probe's (`poor`, `good`, `poor` with `poor_geometry`) with the semi-axes within 10 % of the probe's (the probe used 2.1° exactly; the scenes' Bearings carry Sensors' own sigma).
- *The map model* (`map-model.test.ts`): the set-aside lines and markers; `lineLengthM` at its two clamps; the layers of the model plus the Overlays' four are six, and at most `MAX_APP_LAYERS`.
- *The privacy table* (`privacy-table.test.ts`): `PRIVACY_TABLE` has the nine rows; `docs/privacy.md`'s Markdown table parses to the same rows, cell by cell.

**Adapter examples** (against fakes of the browser objects):
- *Network gate*: a refused URL never calls the fake fetch; every call has `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'`, `method: 'GET'`, no headers; a rejected fetch, an abort by the `FakeTimer`, a status 503 and a body over the limit (streamed, aborted at the limit; and read as text) are `overlay_unavailable` with `errorName` `offline`, `timeout`, `status-503`, `too-large`; no unhandled rejection.
- *Storage*: reads and writes the one key and the backup key; a throwing `setItem` (quota) is `storage_unavailable`; the memory storage has `persistent: false` and never touches `localStorage`.
- *Clipboard*: `copyText` with and without `navigator.clipboard` and with a rejecting one (`clipboard_unavailable`, nothing thrown); `shareLink` without `navigator.share` is `clipboard_unavailable` and `canShare` is `false`.
- *Random*: `bytes(n)` has `n` bytes from the fake `crypto`; without `crypto` the factory fails with `random_unavailable`.
- *Page*: `address()`, `fragment()`, `replaceAddress` (the fake history receives the address without fragment, `state` `null`), `onFragmentChange` on `hashchange`.
- *QR encoder* (against the real package once it is installed, and against a fake before): the matrix is square with `size = 4 · version + 17`; a 77-character link gives version 5; a 161-character link is refused with `link_too_long`; the same link gives the same matrix.
- *Memory network and manual transport*: one send to three phones with the default plan; each plan of §11; `stop()` leaves the network; the text is never parsed (a send of arbitrary text is delivered as it is).

**Component tests** (`components` project, jsdom, Testing Library): `FailureNotice` for **every** `VigiaReason` (the rendered text equals `messageFor`'s and contains neither the code nor the field); `SmokeScreen` (the Incident's note of Req 5.4 in every state) in each state (no smoke, one sighting, two, three with and without disagreement, four, a failed solve with the advice, a Fix with a position known and unknown); `SightScreen` (the question appears after a capture, is preselected only within the age, and nothing is added until it is answered; the guidance is there before the first capture and after); `SightingsScreen` (the rows of §9; **Hide**, **Show**, **Delete** ask once; the shared channels; a conflict with both versions); `MapScreen` (the legend; the wind switch; with `OVERLAYS` empty there is no panel); `EmergencyScreen` (the not-calling statement; the Copy success and failure; the switch off by default; the simulation line); `ShareSheet` (the statement of Req 15.2 before the first Share; each presentation records its channel only on its own button; a hidden sighting is marked; with a page address of 110 characters, "link too long" and the text; the simulation variant has no link, no QR, no system share); `InboxSheet` (the card has **no observer position**, the unknown Incident asks, **Add** and **Ignore**, a damaged paste shows its Message, the sentence that a code has no proof of authorship); `SimulationBanner` on every screen in Simulation mode; `PrivacyPage` from the data.

**The reviewer's path** (`components/simulation/SimulationShell.integration.test.tsx`, Req 17.3, 17.6, 17.7): with `FakeTimer`, `FakeMapLibre`, the memory storage, the memory network, the **refusing** Network gate (every call recorded and refused), for each of the four scenes copied with noise 0: choose the scene, Start, Freeze, Capture (once by the crosshair and once by a Mark on the smoke's pixel), answer "same smoke", change the Station, repeat; the Smoke screen and the Emergency tab show the words and the text of §7.8 and §7.12 with the `SIMULATION:` line; the fake map holds the observers, the Wedges, the Fix and its ellipse and the set-aside layers; **each captured Bearing's azimuth equals the Target's true azimuth within `1e-8` rad** (Core's `initialAzimuthRad` from the Station); the advice of `two-posts` points east and west; `four-posts-one-wrong` shows `southwest` set aside with the Message of `outlier`; `almost-in-line` shows the warning; Share to another phone, switch Station, Add in the Inbox, the merged Fix; and **the gate was never called**. A second test runs `three-posts` with the noise as the catalogue has it and checks that the smoke lies inside the drawn 95 % ellipse, as UI's Playground test does. A third runs the flow while `navigator.onLine` is `false`. A fourth, in the `no-overlays` project, runs the same flow with the Overlays module empty.

**Overlay tests** (`overlays/**`): the controllers with a fixture `fetchLike` behind the real gate and the real Host list: off at start and no request; `setEnabled(true)` makes one request and `refresh()` one more, and nothing else does (a `FakeTimer` advanced for an hour makes none); a failure shows its Message and leaves the layers empty; `update(context)` recomputes layers with no request; the wind words against the fixture; the wind layers do not have `fit: true`. Second release, with the hotspot Overlay: without a key its switch is disabled with `overlay_needs_key` and no call is made; in Simulation mode its fixture is read and no key is needed; its words against the fixture; `hotspots` and `hotspot-edges` have `fit: true`.

## 13. Purity, packaging and build

**`purity.test.ts`**: the rules of §5, each against a copy of a real source with its token added; the fixed file list; `package.json` and `.env.example`; the ESLint block exists.

**Vitest.** `vitest.config.ts` has four projects: `math` (node; `src/**/math/**`, `src/*.test.ts`, `src/test-support/**`), `adapters` (node; `src/adapters/**`), `components` (jsdom; `src/components/**`, `src/overlays/**/components/**`, `src/main` integration tests), and `no-overlays` (jsdom; the `components` and `math` tests except `src/overlays/**`, with `resolve.alias` sending `src/overlays/index.ts` to `src/overlays-empty.ts`). The projects share `provide: { propertyRuns: 200 }` and the fast-check setup (copied from UI). `test:deep` is `vitest run --config vitest.deep.config.ts`, the property files of `math` and `adapters` at the second count of §11. Whether `projects` with `extends: true` inherit `provide` from the root is the same unverified assumption as UI's D1, settled by task 1.

**Scripts.** `test`: `vitest run`; `test:deep`; `typecheck`: `tsc --noEmit -p tsconfig.json`; `build`: `vite build --config vite.config.ts`; `dev`: `vite --config vite.config.ts` (never run by a task). From the repository root `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm format:check` cover Vigia through `pnpm -r`.

**The ESLint block** added to the root `eslint.config.js` (the one root file this design touches): for `apps/vigia/**/*.{ts,tsx}`, `no-explicit-any` and the two react-hooks rules as errors (as `skeleton/ui`); for `apps/vigia/src/**/math/**/*.ts` and `apps/vigia/src/overlays/**/math/**/*.ts`, also `no-non-null-assertion` as an error (Req 1.8).

**Vite.** `vite.config.ts`: `root` the package, `base: './'` (every asset path relative, so the folder can be served from any path, as UI's Playground), `envDir` the package, `oxc.jsx.runtime: 'automatic'`, `build.outDir: 'dist'`, `build.emptyOutDir: true`. The entry imports `maplibre-gl/dist/maplibre-gl.css` once (Req 18.2). The two variables: `VITE_TILE_URL_TEMPLATE` (whitespace-separated templates) and `VITE_TILE_ATTRIBUTION`, read as UI's Playground reads them and **checked against the Host list at start** (Req 11.4: a template whose host is not in the list, or a bad one, gives no Tile source and the Message `host_not_allowed` on the Map screen). The hotspot Overlay of the second release adds `VITE_FIRMS_MAP_KEY`, read into `OverlayDeps.hotspotKey` (`null` when empty), and the README and the hotspot panel will then say that a key in a browser bundle is **public** (Req 11.6). `.env.example` has the two variables, empty. The built `dist/` is static and has no server code.

**Docs and hosting** (repository root `docs/`, judge-facing): `privacy.md` (the table of D20 and a paragraph per row). There is no `docs/hosting.md` and no Content-Security-Policy generator (the lead's design review, O2): two paragraphs of `apps/vigia/README.md` say which hosts the page contacts (the Host list's, with the Tile source's) and which headers the host should send: `Referrer-Policy: no-referrer` first, a short cache lifetime for `index.html`, and no logging of the full request address beyond what the host needs. The `<meta name="referrer" content="no-referrer">` in `index.html` covers the page's own requests.

**Build in tasks.** `pnpm --filter @alidade/vigia build` runs once, at the final checkpoint, with its exit code read and the bundle sizes reported; no other task runs Vite and none runs `dev`.

## 14. Where each requirement has its place

| Req | Place in the design | Tests |
|---|---|---|
| 1 Boundaries | D1, §5 (layout, import rules), §13 | `purity.test.ts`; the `no-overlays` project (1.10); lint block (1.8) |
| 2 Failures | D2 (the 22 reasons, the Message table), §6 `result.ts`, `reasons.ts`, §7 intro | `messages.test.ts`; FailureNotice test for every reason; P-2.6 |
| 3 Sighting | D6, §7.2, §7.3, §9 (Sight), UI's `DeviceSighting`, `SimulationShell` | P-3.9; example of the question; the reviewer's path |
| 4 Incident | D3, D4, §7.4, §7.5, §9 (Smoke, Inbox) | P-4.7; storage-format and reducer examples; component tests |
| 5 Partition | D8, §7.6, §7.7 | P-5.10 to P-5.13; assess examples; scene `four-posts-one-wrong` |
| 6 Fix | §7.8, §7.11, §7.18, §9 (Smoke, Map), UI's `MapView` | P-6.2, P-6.8, P-6.9, P-6.10; words fixtures |
| 7 Geometry and advice | D10, §7.9, §7.10 | P-7.7, P-7.8; advice examples (Req 7.9) |
| 8 The code | D5, §8 | P-8.8, P-8.9, P-8.10; `sighting-codes.json`; prototype figures |
| 9 Transport, merge | D7, D12, §7.4 (merge), §7.19 | P-9.6, P-9.7; second Transport; network and manual transport examples |
| 10 Link, QR, text | D13, §7.13, §3.2, §9 (Share sheet) | P-10.9, P-10.10; QR adapter example; ShareSheet tests |
| 11 Network, hosts, keys | D14, §7.14, §13 (the tile variables), §5 (the scans) | P-11.9; gate and decision examples; purity host scan; the recording gate in the reviewer's path |
| 12 Hotspots (second release) | D15, §7.15, §7.17 | P-12.10, P-12.11; parser fixture; overlay controller tests; none of it in the first release |
| 13 Wind | D15, §7.15, §7.16 | P-13.6; parser fixture; controller tests (no timer) |
| 14 Emergency text | D11, §7.12 | P-14.8, P-14.9, P-16.4; `emergency-texts.json`; EmergencyScreen tests |
| 15 Privacy | D20, §9 (Share sheet, Inbox, privacy page), §7.5 | P-15.9; `privacy-table.test.ts`; ShareSheet and InboxSheet tests |
| 16 Limits | §7.7, §7.8 (`limits`), `texts.ts`, §9 (Sight guidance, UI's limits note) | P-16.4; component tests of the guidance and the note |
| 17 Reviewer's path | D16, §10 | P-17.9; the integration tests of §12; scene tests |
| 18 The map | §7.18, §9 (Map), UI's `MapView` and `layers` | map-model tests; MapScreen tests; the four-of-eight layer test (six with the hotspot Overlay) |
| 19 Parameters | D18, §6, §7.20 | `parameters.test.ts`; P-2.6 (hostile field) |
| 20 Dependencies | §3, §13 | `purity.test.ts` (package.json rules); the recorded publication date |
| 21 Testing split | §11, §12, §13 | the structure of the three projects and the fourth |

## 15. Flags

State after the lead's design review and the update of `requirements.md`. A flag is **closed** when the requirement now says what the design took, **approved** when the lead accepted a skeleton addition, **open** when it waits for a device check, and **second release** when it belongs to the hotspot Overlay only.

### A. Closed: the requirement now says this

- **F1** closed: the requirement now says this (Req 6.2: the decimals follow the semi-minor axis; the radius of "within about" adds the printing bound; Req 14.1).
- **F2** closed: the requirement now says this (Req 8.2: 31 symbols, so the check is a CRC over GF(31), D5).
- **F3** closed: the requirement now says this (Req 8.2, 8.5: no case folding; `code_not_a_sighting` for empty text and for a message with no link).
- **F4** closed: the requirement now says this (Req 17.4: the first symbol `Z` of an Incident id marks Simulation mode).
- **F5** closed: the requirement now says this (Req 4.2, 9.4, 10.3, 15.8: the Inbox).
- **F6** closed: the requirement now says this (Req 9.6: the domain excludes conflicts and more than the maximum).
- **F7** closed: the requirement now says this (Req 14.2, 14.3: the observer's own position only when switched on).
- **F8** closed: the requirement now says this (Req 14.9: `0.5 · 10⁻ᵈ°` for `d` decimals).
- **F9** closed: the requirement now says this (Req 10.9: spaces after the `#`; a message with two links reads the first).
- **F11** closed: the requirement now says this (Req 1.2: `URL` and `BigInt` are allowed in the Math layer).
- **F12** closed: the requirement now says this (Req 4.4: with two tabs the last writer wins and the other is seen on the next load; no `storage` event).
- **F13** closed: the requirement now says this (Req 5.2, 5.4); the words of an Incident gain one sentence, that two phones can set different Sightings aside when they joined at different times (`incidentStatement`, §7.7).
- **F14** closed: the requirement now says this (Req 8.4: position, time and azimuth are rounded to a cell centre; the uncertainties are rounded up).
- **F15** closed: the requirement now says this (Req 16.4: the advice's standing distance is outside the scan).
- **F16** closed: the requirement now says this (Req 11.7: a failed request is `overlay_unavailable` with `errorName`).
- **F17** closed: the requirement now says this (Req 12.8, 14.1: the numbers are semi-axes, written as such).
- **F20** closed: the requirement now says this (Req 11.9: the gate refuses a URL that is not in canonical form).
- **F22** closed by an amendment: Req 17.9 bounds the coverage of the 95 % ellipse (90 % to 99 %) for the runs whose Fix is not `poor`, and only for a scene with at least 100 such runs; for the `poor` runs, and for a smaller group, the share is reported and not bounded (§10, P-17.9).
- **F23** closed: no accuracy circle is drawn (Req 18.7).
- **F24** closed: the requirement now says this (Req 12.11: the box edge is at least the margin from each observer in some direction); second release.
- **F25** closed: the requirement now says this (Req 17.5: one phone for each Station).
- **Additions to Req 2.2 and 19.1** are now in the requirement: the 22 reasons, and `ADVICE_MIN_DISTANCE_M`, `EXPIRY_CHECK_INTERVAL_MS`, `HOTSPOT_MARGIN_CELLS`, `HOTSPOT_DAY_RANGE`.
- **Testable only by example:** Req 3.7 and 16.2 (the guidance is "stated"): a component example checks the text is present before the first capture and afterwards. Req 15.1's "no remote font or script": the purity scan plus the recording gate. Req 11.1's "no element whose `src` or `href` is remote": the scan of JSX attributes and `createElement` calls, with the QR drawn as inline SVG so that there is no `<img>`.

### B. Approved: built in the skeleton first

- **F10 / G5** approved, built in the skeleton first: Core exports `OUTLIER_STUDENTISED_RESIDUAL` (3.5) and `POOR_GEOMETRY_CROSSING_RAD` (20°), with a test that each equals the value the solver uses. This design imports them (§7.6, §7.8) and has no copy, no drift test and no constant of its own.
- **G6** approved, built in the skeleton first: `@alidade/ui` exports `DeviceSighting`, moved out of the Playground, which then uses it. `components/` has no `DeviceSighting.tsx`.
- G1 to G3 are built and exported already (`setLayer`, `appFeature`, `sceneFromOffsets`, `scriptForStation`); the design uses four of the eight layers in the first release.

### C. Open, under Device check V9

- **F19. The QR figures** (§3.2): the capacities per version are from the QR standard as I know it and are checked by the adapter's test; `uqr`'s API and size are from its README and the registry (publication date 2026-04-03, 14-day rule met); the bundle size is to be measured at install.
- **F21. FIRMS** (second release). The official Area page gave the path (`/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]`), the area as `west,south,east,north`, the day range 1 to 5 and the source names (`VIIRS_SNPP_NRT` among them). It did not give the CSV columns. The parser needs `latitude`, `longitude`, `acq_date` and `acq_time` and reads `scan`, `track` and `instrument` if they exist; their exact names, the value format of `acq_time` and the footprint units (kilometres) are to be confirmed against a real response. Also unknown: whether the API answers a cross-origin request (Req 12.9) and what it returns for a bad key.
- **Open-Meteo** (first release, also V9). The page I read gave the variable names and the `current` block. It did not give the `timeformat` option, the `wind_speed_unit` option's spelling, the response's `current_units` text, or whether `current.time` is Unix seconds under `timeformat=unixtime`. The request uses `wind_speed_unit=ms` and `timeformat=unixtime`; the parser refuses a response whose `current_units.wind_speed_10m` is not `m/s` or whose `current.time` is not a finite integer.
- **The terms links** in the Host list (`termsUrl`) are the owner's to fill (O4, O6).

### D. Second release (the hotspot Overlay)

- **F18. `Deg2`** (square degrees) is not in `math-conventions.md`'s table of units. It appears in one name (`maxHotspotBoxDeg2`) and goes with the hotspot Overlay: add the suffix to the table or rename the parameter when that Overlay is built.
- F21 and F24 above, and §7.15 (`hotspotBox`), §7.17, P-12.10 and P-12.11, are marked "second release: built only on the lead's word after the wind checkpoint".

### E. What I would cut first if time ran short, in order

The lead kept the items from 2 to 4 in the design; the order is only for a shortage.

1. The wind Overlay (delete `overlays/wind/` and its line; it is the checkpoint of the order of work).
2. The Sighting QR and its dependency (the link and the text stay; `adapters/qr-encoder.ts` and `QrImage.tsx` go; Req 10.1's QR clause is then pending).
3. The in-memory network and the multi-phone shell, reduced to one phone and the paste box (the reviewer's path still shows the Fix, the words and the text, but not the exchange).
4. The second fake Transport of Req 9.9.
5. The statistical test's deep run (the 400-run test stays).

### F. Size of the work, first release, as I see it

**78 source files** (§5): 7 at the top of `src/`, 30 in the Math layer, 8 Adapters, 23 in the Components layer, 10 under `overlays/`. **27 properties**, with 29 property tests in about 22 property files. About 40 example-test files beside the modules and about 24 component-test files (estimates, as the costs of §11 are). Four fixtures (`sighting-codes.json`, `emergency-texts.json`, `open-meteo-sample.json`, `privacy-table.json`) and one document (`docs/privacy.md`), with two paragraphs in the package's README. One dependency, `uqr@0.1.3`, approved. The only edit outside `apps/vigia` and `docs/` is one ESLint block in the root `eslint.config.js`; the two skeleton additions (G5, G6) are built before Vigia's tasks and are not counted here. As task groups I see **fourteen**: scaffold and configuration (with the `uqr` install); results, reasons, messages, parameters; time, ids and the sighting code; the Incident reducer and storage; the assessment; the words, the geometry class and the advice; the Emergency text; the Network gate and Host list; the Transports and the QR; the screens; the Simulation shell and the four scenes; the privacy page, the README paragraphs and the document; the wind Overlay; and the final checkpoint. The hotspot Overlay (about 6 files, P-12.10, P-12.11, one fixture, one group) is the second release and is in none of these counts.
