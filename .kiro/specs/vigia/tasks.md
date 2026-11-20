# Implementation Plan: vigia

Package: `apps/vigia` (`@alidade/vigia`). Source of truth: `requirements.md` and `design.md` in this
folder. Section and decision references (`D7`, `§7.6`, `§8.4`) point into `design.md`; `Req N.M`
points into `requirements.md`; `UI Req` and `Sensors Req` point into the skeleton's. The skeleton
(including its two additions G5 and G6, built before this plan) is the only code this package
relies on, and only through the three `src/index.ts` files. **The hotspot Overlay is the second
release and is in no task of this plan** (design §7.15 `hotspotBox`, §7.17, P-12.10, P-12.11 and the
three hotspot reasons wait for the lead's word after the wind checkpoint).

## Working rules for every task

- Follow `.kiro/steering/math-conventions.md`: radians internally, a unit suffix on every numeric
  name (`Rad`, `Deg` only at an I/O boundary, `M`, `M2`, `Ms`, `UtcMs`, `Px`), azimuths true,
  differences through `wrapPi`, one degree-conversion module (`math/degrees.ts`), positions as
  `{ latRad, lonRad }` objects, the sphere only, no `NaN` or infinity out of a public function.
- Follow `tech.md`: TypeScript `strict`, ES modules, **pnpm only** (never `npm` or `yarn`), exact
  dependency versions (no `^` or `~`), no `any`, no `!` in the Math layer, no watch mode, **no dev
  server**. Browser APIs only in the Adapters (design D1, §5); sensors only through Sensors, the camera
  only through UI.
- Follow `testing.md`. Every property test: at least 200 cases in `pnpm test`, a comment above it
  naming the property and the requirements it validates, generator domains documented, tolerances taken
  from `requirements.md`, angles compared with `wrapPi(a - b)`, a seed passed as an argument in
  statistical tests. Tests are written **before** the code they test and are seen to fail first.
- **A failing property or example means stop.** Decide whether the code, the property or the
  requirement is wrong and say which, with the evidence. Never weaken a tolerance, narrow a generator,
  delete an assertion or lengthen a time limit to get a pass. If the cause is the requirement or the
  design, stop and report. When a property finds a real bug, add the shrunk counterexample as an example
  test before fixing the code. **A property that fails and then passes on a re-run is not a flake:** keep
  the seed and the counterexample from the failing output and report them before doing anything else.
- **Limits.** A limit the skeleton owns is imported and never copied: Core's
  `OUTLIER_STUDENTISED_RESIDUAL` and `POOR_GEOMETRY_CROSSING_RAD`, Sensors' `HEADING_SIGMA_RAD`, the 95 %
  scale (Core's `ellipse95`), UI's `MAX_APP_LAYERS`. A limit of Vigia's is a named field of
  `VigiaParameters` with its unit and its reason (Req 19), never a literal in a function. A bound a
  requirement states (the 90 % to 99 % of Req 17.9 with its 100-run rule, the 3 000 ms and the like) is
  tested at and either side of the bound, and a result outside it stops the work (above).
- **The standing rule for limits** (skeleton-ui design D26). Where a property goes through a function that
  accepts or refuses at a limit, and a value drawn exactly at the limit can cross it by rounding, the
  property draws at least `1e-6` inside the limit for that check, keeps any unchecked form over the whole
  closed range, and has an example test at the exact limit. Each use of the rule is listed in the report
  of the checkpoint that follows. This is the only case in which a generator's domain may be moved, and it
  is never a reason to loosen a tolerance. Anything else that fails is: stop and classify.
- **Repeat nothing that the skeleton owns** (Req 1.6): no rotation matrix, no Sighting window, no
  Spread, no ellipse polygon, no 95 % scale, no wire format of a Bearing, no list of Sensors' or UI's
  reasons. The purity test scans for them. If a function you need is not exported, stop and ask; do not
  write a copy. Nothing of Vigia's goes into `skeleton/`.
- **Dependencies (Req 20).** The only dependency added to the skeleton's list is `uqr` `0.1.3`
  (approved by the lead), installed once in task 1.3 with `pnpm add -E uqr@0.1.3` run **from
  `apps/vigia`**, with the output of `npm view uqr time --json` recorded in the report (its publication
  date, 2026-04-03, at least 14 days before the install). Any other dependency, a different version, a
  missing peer or an engine mismatch: **stop and ask**. `minimumReleaseAge` stays as it is.
- Every function of the Math layer is total (Req 2.1, 2.6): for any type-correct input it returns a
  failure `VigiaResult` or finite numbers, and never throws. Each task that adds a public Math or
  Adapter function adds it to the hostile list of P-2.6 in the same task.
- Tests sit next to the code: `foo.test.ts` for examples, `foo.property.test.ts` for properties,
  `Foo.test.tsx` for components. Reference data lives in `fixtures/` and is **read-only**: a test is
  fixed to match a fixture, never the reverse. Every fixture, scene, Station, code and Position is
  **synthetic**, derived from the origin `30° N, 40° W` by offsets in metres (Req 17.8).
- **`notes/` is private: never read it.** Nothing in it is copied into a test, a fixture or a document.
- **`timeout` in front of every test run** (for example `timeout 900 pnpm --filter @alidade/vigia
  test`). **No `pkill`.** No `vite`, no `dev`, no dev server and no watch mode in any task; the one
  `build` is in the final checkpoint (design §13).
- **Every full test run keeps its whole output in a file** (`… > /tmp/vigia-<task>-<n>.txt 2>&1; echo
  "exit $?" >> …`), and the report names the file, so that a failure, with its seed and counterexample,
  is never lost. A command that fails is read from its file, not rerun to look again.
- **Every scripted replace asserts its pattern:** a script that edits a file checks that the pattern was
  found the expected number of times and fails otherwise. A rename or a mutation check restores the
  source afterwards and shows that `git diff` of that file is empty.
- **Mutation checks** (the ones a task names) are run against the real tests, each expected to fail,
  the source restored after, and each reported as: what was changed, which tests failed.
- **No commit.** The lead commits. Do not edit `requirements.md`, `design.md` or anything under
  `skeleton/` (including the root `eslint.config.js` beyond the one block of task 1.5); if a change
  there seems needed, stop and report.
- Each task that adds a non-test source file adds it to the fixed file list of `purity.test.ts` in the
  same task. Each task ends with `pnpm --filter @alidade/vigia test` and `pnpm typecheck` passing for the
  code it touched, and `pnpm lint` and `pnpm format:check` from the root.
- **Every checkpoint** first runs `pnpm --filter @alidade/vigia test:deep` for the properties it names,
  and reports, for each property, the cases run, the discards and the worst error against its tolerance,
  the measured milliseconds a case (against the design's estimate, with a proposal for the counts if it
  differs by a factor of three), each counter the property reports, and **each use of the standing rule for limits** (the property, the
  limit, the margin, the example at the exact limit). It then runs `pnpm test`,
  `pnpm typecheck`, `pnpm lint` and `pnpm format:check` from the repository root.
- **Stops for review** at checkpoints 4, 9, 15 and 18, and at any failing property. Checkpoint 12 does
  not stop: its report is carried into checkpoint 15's.

## Tasks

- [ ] 1. Scaffold the package (design §3, §5, §13; D1, D19, D21)
  - [ ] 1.1 Create `apps/vigia` without the QR dependency
    - `package.json`: name `@alidade/vigia`, `private`, `type: module`, no `exports` and no `index.ts`
      (the entry is `src/main.tsx`, Req 1.8); scripts `test` (`vitest run`), `test:deep`
      (`vitest run --config vitest.deep.config.ts`), `typecheck` (`tsc --noEmit -p tsconfig.json`),
      `build` (`vite build --config vite.config.ts`) and `dev` (`vite --config vite.config.ts`, never run by
      a task). Dependencies: `@alidade/core`, `@alidade/sensors`, `@alidade/ui` as `workspace:*`; `react`
      and `react-dom` `19.3.1`; `maplibre-gl` `6.16.0`. Dev dependencies at the exact versions of
      `skeleton/ui/package.json` (read that file; design §3.1): `vite`, `typescript`, `vitest`,
      `fast-check`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@types/react`,
      `@types/react-dom`. Every version is already in `pnpm-lock.yaml`: `pnpm install` only links.
    - `tsconfig.json` extending `../../tsconfig.base.json` (`lib` ES2023 and DOM, `jsx` `react-jsx`,
      include `src`, `fixtures` and the configs); `vite.config.ts` (D19: `root`, `base: './'`, `envDir`,
      `oxc.jsx.runtime: 'automatic'`, `build.outDir: 'dist'`, `build.emptyOutDir`; the alias of D21 is
      added in task 13.9); `index.html` with `<meta name="referrer" content="no-referrer">`, the root
      element and the entry script; `.env.example` with `VITE_TILE_URL_TEMPLATE=` and
      `VITE_TILE_ATTRIBUTION=` and **no values**; a README with its title and the build commands only
      (the rest in task 16).
    - `vitest.config.ts` with the projects `math`, `adapters` (environment `node`) and `components`
      (`jsdom`) of D1 and `provide: { propertyRuns: 200 }`; the fourth project `no-overlays` is added in
      task 13.9. `vitest.deep.config.ts` for the `*.property.test.ts` files of `math` and `adapters`, the
      second count, no file parallelism, no time limit.
    - _Requirements: 1.1, 1.8, 20.1, 20.5, 21.7_
  - [ ] 1.2 Smoke tests of the unverified assumptions, each a throwaway file (design §13, D1)
    - (a) `projects` with `extends: true` inherits `provide`: a test in each project reads
      `inject('propertyRuns')`; if not, repeat the `provide` line per project. (b) A trivial component
      renders under jsdom with Testing Library, and `tsc` accepts `jsx: react-jsx`. (c) `import.meta.glob`
      with `?raw` works in the `math` project (the purity test needs it), with the type declaration copied
      from UI's `import-meta-glob.d.ts`. (d) `@alidade/ui`'s `index.ts` loads in Node with no DOM (the Math
      layer imports pure names from it, D1), and `import { DeviceSighting, OUTLIER_STUDENTISED_RESIDUAL, … }`
      resolves from the three packages. Report each result, delete the throwaway files, **stop on any
      mismatch**.
    - _Requirements: 1.1, 1.2, 21.7_
  - [ ] 1.3 Install `uqr` (the one new dependency, approved by the lead)
    - From `apps/vigia`: `pnpm add -E uqr@0.1.3`. Record `npm view uqr time --json` for that version, the
      exit code, the diff of `package.json` and `pnpm-lock.yaml`, and that nothing else was added. Do not
      import it yet (task 11.6).
    - _Requirements: 20.2, 20.4_
  - [ ] 1.4 Test support, copied from UI's (not exported; design §5, UI D20)
    - `src/test-support/`: `fast-check-setup.ts` (the one place that sets `numRuns`, `cappedRuns`,
      `isDeepRun`), `property-report.ts` (`checkProperty`, `ErrorTracker`), `deep-same.ts`, `fake-timer.ts`,
      `seeded-normal.ts` (a 32-bit integer generator with Box–Muller, the seed an argument), and
      `hostile.ts` (`hostileNumber`, `hostileString` of 0 to 10 000 characters of the full BMP, the doubles
      either side of every limit of `VigiaParameters`). Each with its own small test, so that no helper
      is vacuous (a deliberately failing property is reported as failing).
    - _Requirements: 21.1, 21.5_
  - [ ] 1.5 The ESLint block, once, in the root `eslint.config.js` (design §13)
    - For `apps/vigia/**/*.{ts,tsx}`: `@typescript-eslint/no-explicit-any` and the two `react-hooks` rules
      as errors; for `apps/vigia/src/**/math/**/*.ts` and `apps/vigia/src/overlays/**/math/**/*.ts` also
      `@typescript-eslint/no-non-null-assertion` as an error. Confirm with a throwaway file in each place
      (an `any`, a `!` in a `math/` folder, a conditional hook) that `pnpm lint` fails; delete them. This
      is the only edit outside `apps/vigia` and `docs/`.
    - _Requirements: 1.8_
  - [ ] 1.6 The skeleton of `purity.test.ts` (design §5, the table of rules)
    - Read every `src` file with `import.meta.glob(..., { query: '?raw' })`, with comments and strings
      removed as UI's does (`code` and `bare`), the fixed file list (empty but for itself), and **every rule
      of the §5 table** written as data: the pattern, where it applies, and a probe (a copy of a real source
      with the rule's token added, so that no rule can pass by matching nothing). The rules that need files
      that do not exist yet are written now and their probes use a throwaway string; they begin to bite as
      the files appear. Also: `package.json` exact versions, `@alidade/*` as `workspace:*`, the versions
      equal to `skeleton/ui/package.json`'s, `uqr` `0.1.3` the only dependency beyond them; `.env.example`
      without values and no `.env*` file but the example; the ESLint block exists.
    - _Requirements: 1.1 to 1.9, 11.1, 11.6, 20.1 to 20.5_
  - [ ] 1.7 `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass on the empty package, from the root, output kept in files.

- [ ] 2. Results, reasons, messages, parameters (D2, D18, D20; §6, §7.20)
  - [ ] 2.1 Tests first: `result.test.ts`, `reasons.test.ts`, `math/messages.test.ts`
    - The closed set: `VIGIA_REASONS` is `UI_REASONS` plus exactly the **22** of Req 2.2 (69 in all; the
      three hotspot reasons are not in it); `MESSAGES` has exactly the keys of `VIGIA_REASONS`; the 47 UI
      rows equal UI's `messageFor`; each of the 22 rows obeys UI's rules (one sentence of at most 160
      characters ending in a full stop, no code, no `_`, none of `NaN`, `Infinity`, `undefined`, `null`,
      `[object`, naming what the user can act on, Req 2.4); a type-level test that a new reason without a
      row does not compile (`// @ts-expect-error` on a copy of the union). All fail.
    - _Requirements: 2.2, 2.3, 2.4, 21.4_
  - [ ] 2.2 Code: `result.ts`, `reasons.ts`, `math/messages.ts`
    - `VigiaResult`, `VigiaFailure`, `VigiaOnlyReason` (22), `VIGIA_ONLY_REASONS`, `VIGIA_REASONS`,
      `MESSAGES`, `messageFor` (the table of D2, every row as written there, `uiRows()` built once with one
      cast inside and a run-time test of its keys).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ] 2.3 Tests first: `math/degrees.test.ts`, `defaults.test.ts`, `math/parameters.test.ts`, `math/privacy-table.test.ts`
    - `toDeg`/`fromDeg` over Core's `degToRad`/`radToDeg`; every constant of Req 19.1 that the first
      release builds (`MAX_INCIDENT_AGE_MS` 30 min, `INCIDENT_RETENTION_MS` 24 h, `CLOCK_SKEW_TOLERANCE_MS`
      2 min, `MAX_SIGHTINGS_PER_INCIDENT` 32, `PLAUSIBLE_RANGE_M` 50 000, `LONG_ELLIPSE_RATIO` 3,
      `FAIR_ELLIPSE_RATIO` 1.5, `MAX_CODE_LENGTH_CHARS` 2 048, `MAX_LINK_LENGTH_CHARS` 160,
      `MAX_EMERGENCY_TEXT_CHARS` 800, `ADVICE_MIN_DISTANCE_M` 300, `EXPIRY_CHECK_INTERVAL_MS` 60 000,
      `WIND_GRID_DEG` 0.1, `MAX_WIND_AGE_MS` 3 h, `MAX_RESPONSE_BYTES` 1 000 000, `REQUEST_TIMEOUT_MS` 10 s,
      `SIMULATION_TAP_SIGMA_PX` 3), each value, each with a comment naming unit, reason and whether it is
      measured, a skeleton threshold or judgement (Req 19.4: the test reads the source for the comment);
      `checkParameters` returns `invalid_number` naming the first of: a field not finite, not positive (a
      count not an integer of at least 1), `incidentRetentionMs ≤ maxIncidentAgeMs`, `fairEllipseRatio ≤ 1`,
      `longEllipseRatio ≤ fairEllipseRatio`, `windGridDeg ≤ 0`, `maxLinkLengthChars` below
      `CODE_LENGTH + 'https://a.b/#'.length`, `maxEmergencyTextChars` below 740, each at and either side
      of its limit; `PRIVACY_TABLE` has the nine rows of Req 15.3, in order (the Hotspots row marked
      "second release"). All fail.
    - _Requirements: 1.7, 15.3, 19.1 to 19.4_
  - [ ] 2.4 Code: `math/degrees.ts`, `defaults.ts`, `math/parameters.ts`, `math/privacy-table.ts`
    - The hotspot parameters are **not** built (they come with the hotspot Overlay). `defaultParameters()`
      is called only in `main.tsx`, `simulation/` and tests (a purity rule).
    - _Requirements: 19.1 to 19.4, 15.3_
  - [ ] 2.5 P-2.6: the hostile totality, as a registry
    - Tests first: `src/hostile-totality.property.test.ts` runs every function named in a list
      `HOSTILE_LIST` (a record of name, function and argument generator) over `hostile*` inputs: no throw,
      every number finite, and a parameter that is `NaN`, infinite, not positive or inconsistent is
      `invalid_number` naming it (`checkParameters` and every function that takes `parameters`). It starts
      with `messageFor`, `toDeg`, `fromDeg`, `checkParameters`; **every later task that adds a public
      Math or Adapter function adds it to the list in that task** (the final checkpoint confirms that the
      list holds all of them). A test that the list is complete against a scan of the exported names of
      the Math files.
    - Property **P-2.6** (Req 2.1, 2.6, 19.3): 200 in `pnpm test`, 10 000 in `test:deep`.
    - _Requirements: 2.1, 2.6, 19.3_

- [ ] 3. Time, identifiers, the sighting code and the link (D5, D6, D13, D22; §7.1 to §7.3, §7.13, §8)
  - [ ] 3.1 Tests first: `math/civil-time.test.ts`
    - `clockTextUtc(1 790 000 000 000)` is `14:13 UTC`; `ageText` at 59 999, 60 000, 3 599 999,
      3 600 000, 172 799 999 and 172 800 000 ms. (`utcMsFromCivil` and its examples come with the hotspot
      Overlay, second release: not here.) All fail.
    - _Requirements: 3.6, 14.1_
  - [ ] 3.2 Code: `math/civil-time.ts` (`clockTextUtc`, `ageText`; integer arithmetic, no `Date`)
    - `utcMsFromCivil` is not built: it comes with the hotspot Overlay (design D22, §7.1).
    - _Requirements: 1.2_
  - [ ] 3.3 Tests first: `math/incident/ids.test.ts`, `math/incident/sighting.test.ts`, P-3.9
    - Examples: constant bytes (all `0x00`, all `0xFF`) give valid ids; 17 bytes fail with
      `invalid_number`, `field: 'bytes'`; `incidentIdFromBytes` never starts with `Z` in `device` mode over
      10 000 byte strings of the extremes and always does in `simulation` mode; `isIncidentId`,
      `isSightingId`, `incidentMode`; `withSightingId` changes `id` only.
    - Property **P-3.9** (Req 3.4, 3.9): generator `codeBearing` re-labelled `bearing-<time>` and
      `byteSource` of at least 18 bytes; `withSightingId` passes Core's `validateBearing` and differs from
      the input in `id` only; ids have 9 and 10 symbols of the alphabet. 200 / 10 000. All fail.
    - Generators (`test-support/generators.ts`, each stating its domain): `byteSource`, `symbols(n)`,
      `codeBearing`, `sightingArb` (design §11).
    - _Requirements: 3.4, 3.9, 4.1_
  - [ ] 3.4 Code: `math/incident/ids.ts`, `math/incident/sighting.ts` (`Sighting`, `withSightingId`; `canonicalise` and `captureToSighting` are added in 3.9)
    - _Requirements: 3.4, 3.9, 4.1_
  - [ ] 3.5 Tests first: the alphabet and the check, `math/code/alphabet.test.ts`, `math/code/gf31-check.test.ts`
    - The 31 symbols (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`, none of `0 1 I L O`), `groupCode` (ten groups of
      five, hyphen-joined), `stripCode` (whitespace and hyphens); the check over GF(31) with
      `g(x) = x⁴ + x + 1`: its four symbols for the three worked examples' payloads equal `B8GH`, `FSJE`,
      `8FQS` (§8.7); the proof's cases by exhaustion on the examples: every single-symbol substitution, every
      swap of two unequal neighbours, every change of two adjacent symbols, of three and of four, never passes
      (the proof of §8.4 as a test). All fail.
    - _Requirements: 8.2, 8.6_
  - [ ] 3.6 Code: `math/code/alphabet.ts`, `math/code/gf31-check.ts`
    - _Requirements: 8.2, 8.6_
  - [ ] 3.7 Tests first: `math/code/sighting-code.test.ts` against `fixtures/sighting-codes.json`, P-8.8, P-8.9, P-8.10
    - `fixtures/sighting-codes.json` (read-only, synthetic): the three Sightings A, B, C of §8.7 with their
      expected codes and their expected decoded values. Examples: each encodes to exactly its code and
      decodes to exactly its values; the damage examples of §8.7 (the 8th symbol replaced, the 20th and
      21st swapped, 49 symbols, a lower-case symbol); a version-2 frame with a valid check is
      `code_version_unsupported`; empty text `code_not_a_sighting`; 2 049 characters `code_too_long`; groups,
      line breaks and a link all decode alike; `0`, `1`, `I`, `L`, `O` each `code_damaged`; a payload
      `N ≥` the product of the radices (top digits raised, check recomputed) `code_damaged`; the field
      boundaries by exact arithmetic (latitude `±89°`, longitude `180°`, just above `-180°`); a time one
      millisecond before the epoch and at the 20-year end `invalid_observation`, `field: 'timeUtcMs'`; a
      `sightingId` different from `bearing.id`; the order of the decoder's steps (the check before the
      version, the length after it).
    - Properties: **P-8.8** (Req 8.8: round trip within 1 m, 1 s, `0.001°`, the two uncertainties never
      lower and within `0.01°` and 1 m), 200 / 100 000; **P-8.9** (Req 8.9: the canonical form is a fixed
      point; 50 symbols; the link on a 109-character address is at most 160), 200 / 100 000; **P-8.10**
      (Req 8.10, 8.6: (a) every single-symbol substitution, adjacent swap, 40 random two-symbol changes,
      every cut and every extension of a valid code is `code_damaged`, about 1 700 decodes a case, 200 /
      2 000; (b) strings of 0 to 10 000 characters never throw and the success rate is reported, 200 /
      10 000). All fail.
    - _Requirements: 8.1 to 8.11_
  - [ ] 3.8 Code: `math/code/sighting-code.ts` (`encodeSighting`, `decodeSighting`, `CODE_LENGTH`; §8.1 to §8.5)
    - Mixed-radix payload as a `BigInt`, 44 digits, the quantisations of §8.1, the decoder's order of §8.5
      (length limit, strip, alphabet, ≥ 6 symbols, check, version and kind, length 50, `N` below the
      product, `parseBearing`).
    - _Requirements: 8.1 to 8.7_
  - [ ] 3.9 Canonical Sighting and link: tests first, then code
    - Tests: `canonicalise` is idempotent and a fixed point (P-8.9 uses it); `captureToSighting` with 18
      bytes, the id replaced, the Sighting local and in the open Incident; a capture whose encoding fails is
      returned as the failure; `math/code/code-link.test.ts` (the 109-character address gives a 160-
      character link and 110 gives `link_too_long`; a query and a fragment on the page address are dropped;
      `http://localhost:5173/` accepted and `http://example.org/` refused; two links read the first; trailing
      capitals after the link are not read into the code; prose with no link is `code_not_a_sighting`) and
      **P-10.9** (Req 10.2, 10.9: generator `pageAddress`, `sightingArb`, the code in groups with spaces and
      one line feed after the `#`, the link surrounded by 0 to 200 characters of arbitrary text; no
      character of the code before `#`; extraction then decoding gives the same Sighting), 200 / 10 000.
      Then code: `canonicalise`, `captureToSighting` in `sighting.ts`; `math/code/code-link.ts`
      (`buildSightingLink`, `extractSightingCode`).
    - _Requirements: 3.4, 8.4, 8.9, 10.2, 10.4, 10.9_
  - [ ] 3.10 The Math files of this group join the hostile list (P-2.6) and the purity file list.

- [ ] 4. Checkpoint: the sighting code (stops for review)
  - `test:deep` for P-2.6, P-3.9, P-8.8, P-8.9, P-8.10 (a) and (b), P-10.9 at their counts, then the
    root checks. The report contains: for each property the cases, discards and worst errors, the measured
    milliseconds a case (P-8.10 (a) decodes about 1 700 codes a case: say what 2 000 cases cost) and the
    success counter of P-8.10 (b); that the three examples of §8.7 encode and decode to the fixture
    byte for byte and the four damage examples are refused; the lengths (50 symbols, 59 grouped, a
    77-character link on `https://vigia.example.org/`); **the three mutation checks**: the sigma rounded
    down (P-8.8 fails), the check computed over the payload only (P-8.10 and the examples fail), the
    version read before the check (P-8.10 fails); the `uqr` install record of 1.3; the state of every flag
    of the design that this group touches (C, F19). **Stop for review.**

- [ ] 5. The Incident reducer, the merge and the stored format (D3, D4, D7; §7.4, §7.5)
  - [ ] 5.1 Tests first: `math/incident/incident-state.test.ts`, `merge.test.ts`, `apply-action.test.ts`, `storage-format.test.ts`
    - Examples of design §12: each action's effect and failure (§7.4 table); the duplicate keeps
      `receivedUtcMs`, `hidden` and `shared` and returns the same object; a conflict keeps the held entry and
      records both codes; the 33rd entry is `incident_full`; `addReceived` into an unknown Incident without
      `joinIfUnknown` is `incident_unknown` and with it creates a `joined` Incident and opens it; deleting
      the open Incident makes `openIncidentId` `null`; `expire` at the boundary (exactly the retention is
      kept, one millisecond more is removed); the invariants I1 to I7 checked by a function `invariants(state)`
      used by the property; the JSON of §7.5 produced exactly for a fixed state (key order, no extra fields);
      `null` is `empty`; not JSON, an array, `{}`, a different `format`, `version: 0` and `version: 1.5` are
      `corrupt`; `version: 2` is `newer`; an entry whose code has a flipped symbol is dropped and counted; a
      duplicate, an entry of another Incident and 33 entries are salvaged and counted; a simulated Incident
      is not written; text over 1 000 000 characters is `corrupt`; retention removes an old Incident on load.
    - Property **P-4.7** (Req 4.7): generator `storageActions` (0 to 200 actions among create, join, capture,
      receive, hide, show, delete, deleteIncident, deleteAll, expire, reload) against a reference model of the
      actions: I1 to I7 after every action; the Sightings held are exactly those the model says;
      `parseStoredState(serialiseState(s))` gives `loaded` with an equal state and `dropped = 0`. 200 / 2 000.
      All fail.
    - _Requirements: 4.1 to 4.7, 5.6, 9.4, 9.5_
  - [ ] 5.2 Code: `math/incident/incident-state.ts`, `merge.ts`, `apply-action.ts`, `storage-format.ts`
    - Types and reducer of §6; `mergeSighting` with the outcomes `duplicate`, `conflict`, `full`, `added`;
      `serialiseState`, `parseStoredState` with the steps of §7.5; entries ordered by `sightingId`.
    - _Requirements: 4.1 to 4.7, 9.5, 9.6_
  - [ ] 5.3 The files of this group join the hostile list and the purity file list.

- [ ] 6. The assessment (D8; §7.6, §7.7)
  - [ ] 6.1 Tests first: `math/assessment/assess.test.ts`, `statements.test.ts`, P-5.10 to P-5.13
    - Examples: one per set-aside cause and per case of the fixed order (a hidden Sighting that is also too
      old is `hidden_by_user`); the "only one candidate" reference to `nowUtcMs`; two old Sightings both
      used; the `invalid_observation` loop through an internal function with a fake solve result (the model
      is Core's); three Bearings with a residual above `OUTLIER_STUDENTISED_RESIDUAL` give `three_disagree`
      (a fixed set found by a search in the test) and a 12° error on the `side` post of the scene
      `three-posts` does not; `diverging` with a fixed pair pointing away from each other; the statements by
      count and `incidentStatement` of §7.7; **the thresholds are Core's exports** (the purity rule of 1.6
      bites: no `3.5` in `assessment/`, no `CORE_OUTLIER_STUDENTISED_RESIDUAL`).
    - Properties: **P-5.10** (Req 5.10: generator `sightingSet`; partition, one cause each, equal to a simple
      reference of the order of §7.6; the Bearings given to `solve` are the used plus the `outlier`s), 200 /
      5 000; **P-5.11** (Req 5.11: any permutation gives the same used ids, causes and a deeply equal Fix),
      200 / 5 000; **P-5.12** (Req 5.12: `consistentBearings(4 … 12)` plus one wrong by `[10σ, 90°]`; the
      app's `outlier` set equals Core's `excludedIds`; the shown Fix equals Core's of the remaining ones;
      counters reported and not failing: wrong one excluded, kept, a consistent one excluded), 200 / 2 000;
      **P-5.13** (Req 5.5, 5.13: `consistentBearings(3)`, sigmas `[0.5°, 1°]`, crossings of at least 30°, a
      gross error `[3°, 10°]` on each of the three in turn: the unit vector of normalised residuals is the
      same within `0.1` per component; `assess` names no Sighting and returns no second Fix), 200 / 10 000.
      Generators `consistentBearings`, `sightingSet`. **If P-5.13 fails it is information about the argument
      or the tolerance: stop and classify it (Req 5.13).** All fail.
    - _Requirements: 5.1 to 5.13_
  - [ ] 6.2 Code: `math/assessment/assess.ts`, `statements.ts`
    - `assess` (order, hidden, implausible, too old, solve with `outlierRejection: true`, causes,
      `checkLevel`, `disagreement` with Core's exported `OUTLIER_STUDENTISED_RESIDUAL`), `orderEntries`, the
      statements of §7.7.
    - _Requirements: 5.1 to 5.9_
  - [ ] 6.3 The files of this group join the hostile list and the purity file list. Mutation check: the third Bearing marked as the culprit of a disagreement (P-5.13 and the examples fail).

- [ ] 7. The words, the Geometry class, the advice, the map model (D9, D10; §7.8 to §7.11, §7.18)
  - [ ] 7.1 Tests first: `math/fix/format.test.ts`, P-6.2
    - Examples: `lengthText95` at 9.99, 10, 10.01, 994.9, 995, 999.99, 1 000, 1 000.01, 2 041, 1e6, 1e6 + 1
      (rounded up, never down); `positionDecimals` at the four step values and their neighbours; `positionText`
      with the printing bound; `compassWord8` at 22.4°, 22.5°, 337.4°, 337.5°; `axisWords`. Property **P-6.2**
      (Req 6.2: `b ∈ [0.1, 1e7]` m log-uniform with the step values drawn; `positionDecimals(b)` is the smallest
      `d` whose step is at most `b`, or 4; `lengthText95(x)` is at least `x` and exceeds it by less than its
      step), 200 / 100 000. All fail.
    - _Requirements: 6.2, 6.3_
  - [ ] 7.2 Code: `math/fix/format.ts`, `math/texts.ts` (the fixed sentences: limits, guidance, the not-calling statement; the statements by count are in `statements.ts`)
    - `metresPerDegree` from Core's `greatCircleDistanceM` of one degree; no Earth radius of Vigia's own.
    - _Requirements: 6.2, 14.5, 16.1, 16.2_
  - [ ] 7.3 Tests first: `math/fix/geometry-class.test.ts`, `from-you.test.ts`, P-7.8, P-6.9
    - Examples: the class at the ratios and at the warning; `halfIntervalM` at `θ = 0`, `π/2`, `π/4`; a phone
      at the Fix's position gives the `coincident_positions` sentence; the distance is never produced without
      its interval. Properties: **P-7.8** (Req 7.1, 7.8: `fixCase`; `poor` iff `poor_geometry` or elongation
      `≥ longEllipseRatio`, `fair`, `good`; a pure function of warnings and Ellipse), 200 / 10 000; **P-6.9**
      (Req 6.4, 6.9: `b95 ≤ h ≤ a95`, equal to the largest extent of UI's `fixFeatures` polygon within
      `1e-3 · a95`, `a95` at `θ = 0` and `b95` at `θ = π/2` within `1e-9 · a95`), 200 / 5 000. All fail.
    - _Requirements: 6.4, 6.9, 7.1, 7.8_
  - [ ] 7.4 Code: `math/fix/geometry-class.ts`, `from-you.ts`
    - _Requirements: 6.4, 7.1_
  - [ ] 7.5 Tests first: `math/fix/fix-words.test.ts` against `fixtures/emergency-texts.json` (the Fix part), P-6.8, P-6.10
    - Fixtures (read-only, synthetic): three Fixes (a round 40 m ellipse near `30° N, 40° W`, the `two-posts`
      Fix of 765 m by 204 m, a 12 km one) with the exact expected `fixWords`. Properties: **P-6.8** (Req 6.2,
      6.3, 6.8: Fixes of `consistentBearings(2 … 12)` through `assess`; the text holds `lengthText95` of both
      semi-axes (an independent formatter in the test), the count, the position with the decimals of P-6.2, the
      words "probably" and "within about", none of "exact", "located at", "confirmed", "precisely", none of
      `NaN`, `Infinity`, `undefined`, `null`), 200 / 5 000; **P-6.10** (Req 6.10: the ratio `2.4477` between
      `ellipse95` and the Ellipse within `1e-9`; the words' axes are `ellipse95` of the Fix's own Ellipse; a
      mutated scale fails), 200 / 5 000. All fail.
    - _Requirements: 6.1 to 6.3, 6.7, 6.8, 6.10_
  - [ ] 7.6 Code: `math/fix/fix-words.ts` (`fixWords`; the warning sentence uses `POOR_GEOMETRY_CROSSING_RAD` through `toDeg`)
    - _Requirements: 6.2, 6.3, 6.7, 16.1, 16.4_
  - [ ] 7.7 Tests first: `math/fix/advice.test.ts`, P-7.7
    - Examples: the example of Req 7.9 (two observers 800 m east and west of a target 3 000 m north: the
      advised directions within 5° of 90° and 270°, the distance within 20 % of 3 000 m); `2 · atan(0.35 / 2)`
      within `0.2°` of 20° and the sentence contains "a third"; the advice for a round Fix, for none and for one
      Sighting; the hypothetical Bearing is not in the returned value. Property **P-7.7** (Req 7.7:
      `consistentBearings(2 … 3)` with elongation of at least 1.5, the area after the hypothetical Bearing
      from either advised direction is at most the area from the same distance along the major axis, relative
      `1e-6`, and at most the area before; counter: cases in which the advised direction gave the smallest area
      among 36 directions within 1 %), 200 / 2 000. All fail.
    - _Requirements: 7.2 to 7.7, 7.9_
  - [ ] 7.8 Code: `math/fix/advice.ts` (`nextSightingAdvice`, `adviceWords`), `math/fix/map-model.ts` (`mapModel`) with `map-model.test.ts` first
    - Map model tests: the set-aside lines and markers; `lineLengthM` at its two clamps; the layers of the
      model plus the wind Overlay's two are four, at most `MAX_APP_LAYERS` (the wind's two are asserted in 17).
    - _Requirements: 5.5, 7.2 to 7.6, 18.3, 18.4_
  - [ ] 7.9 The files of this group join the hostile list and the purity file list. Mutation check: the position decimals read the other way (P-6.2 and P-6.8 fail).

- [ ] 8. The Emergency text (D11; §7.12)
  - [ ] 8.1 Tests first: `math/fix/emergency-text.test.ts` against `fixtures/emergency-texts.json` (the text part), P-14.8, P-14.9, P-16.4
    - Fixtures (read-only): the three Fixes with the exact `emergencyText` in each mode (device, simulation,
      with and without the own position), the one-Sighting text, the `SIMULATION:` line, the text of a failed
      `ellipse95`; no observer position, Sighting id, Incident id or code in any. Properties: **P-14.8** (Req
      14.1, 14.3, 14.6, 14.8: at most `maxEmergencyTextChars` and never over 730; no `NaN`, `Infinity`,
      `undefined`, `null`; with a Fix both semi-axes, the count, the geometry sentence; every sentence that
      holds a position holds metres of uncertainty; no observer position, id or code unless
      `includeOwnPosition`, and then only the own), 200 / 5 000; **P-14.9** (Req 14.9: read back by parsing,
      within `0.5 · 10⁻ᵈ° + 1e-9` of the Fix by Core's great-circle distance), 200 / 5 000; **P-16.4** (Req
      16.4, 6.4: every sentence of `fixWords`, `fromYouWords` and `emergencyText` that holds a decimal degree
      or a distance holds its uncertainty in the same sentence; checked by splitting at `. `), 200 / 5 000.
      All fail.
    - _Requirements: 14.1 to 14.10, 16.4_
  - [ ] 8.2 Code: `math/fix/emergency-text.ts`
    - The worst case of 730 characters computed from the longest string of each line (a test builds it).
    - _Requirements: 14.1 to 14.9_
  - [ ] 8.3 The file joins the hostile list and the purity file list. Mutation check: an observer's position in the text without the switch (P-14.8 and the fixture fail).

- [ ] 9. Checkpoint: the Math of the core flow (stops for review)
  - `test:deep` for P-4.7, P-5.10, P-5.11, P-5.12, P-5.13, P-6.2, P-6.8, P-6.9, P-6.10, P-7.7, P-7.8, P-14.8,
    P-14.9, P-16.4 and P-2.6 (with the hostile list so far) at their counts, then the root checks. The report
    contains: for each property the cases, discards and worst errors, the measured cost and a proposal for
    the counts if it differs by a factor of three from the design's estimate; **the counters**: P-5.12 (the
    wrong Bearing excluded, kept, a consistent one excluded, with the shares) and P-7.7 (the advised direction
    best among 36); **P-5.13's result and, if it failed, its classification (Req 5.13)**; the generators'
    discards; the three fixtures matched; the mutation checks of tasks 6.3, 7.9 and 8.3; that no copy of a
    skeleton threshold exists (the purity rule); the hostile list's size against the exported names. **Stop
    for review.**

- [ ] 10. The Network gate and the Host list (D14; §7.14, §7.15 `windPoint`)
  - [ ] 10.1 Tests first: `math/network/host-list.test.ts`, `gate-decision.test.ts`, `request-boxes.test.ts`, P-11.9 (decision)
    - Examples (design §12): each look-alike of Req 11.9 refused with its field (`example.com.evil.test`,
      `example.com@evil.test`, upper case, trailing dot, an IDN look-alike, a port, userinfo, `http`, a
      fragment, a missing, repeated or extra query parameter, a path of the wrong shape, a non-canonical form);
      the accepted URLs (the wind URL, a tile entry built from a template); `buildHostList(tiles)` refuses a
      template whose host is not listed (Req 11.4); `windPoint(30.123, -40.168)` is `(30.1, -40.2)` and is
      within `g / 2` on each axis, an unsupported position is `unsupported_position`. Property **P-11.9**
      (Req 11.3, 11.9, decision half): generator `hostileRequest` built from parts so that the verdict is known
      by construction (the oracle compares parts with the entry directly, never through `URL`); `decideRequest`
      accepts if and only if scheme `https`, no userinfo, port or fragment, host equal to an entry's, path and
      query the entry's and the input canonical; the wind builder's URLs are always accepted, 200 / 100 000.
      All fail.
    - _Requirements: 11.1 to 11.4, 11.9, 13.2_
  - [ ] 10.2 Code: `math/network/host-list.ts` (the entries `tiles` and `wind`, with purpose, Source's name, what the request carries in words and as the exact path and query, terms link left as a parameter for the owner, key flags; `buildHostList`), `gate-decision.ts` (`decideRequest`, §7.14 steps 1 to 6), `request-boxes.ts` (`windPoint` only)
    - The only module that names a host (a purity rule). The hotspot entry is not written.
    - _Requirements: 11.2, 11.3, 11.9, 13.2_
  - [ ] 10.3 Tests first: `adapters/network-gate.test.ts`, P-11.9 (gate), with a `FakeFetch` and the `FakeTimer`
    - A refused URL never calls the fake fetch; every call has `credentials: 'omit'`, `referrerPolicy:
      'no-referrer'`, `redirect: 'error'`, `method: 'GET'`, `cache: 'no-store'` and no header; a rejected
      fetch, an abort by the `FakeTimer`, a status 503, a body over the limit (streamed and aborted at the
      limit; and read as text) are `overlay_unavailable` with `errorName` `offline`, `timeout`, `status-503`,
      `too-large`; no unhandled rejection. Property **P-11.9** (gate half): the injected fetch is called if and
      only if the decision accepts, and then with exactly those options, 200 / 2 000. All fail.
    - _Requirements: 11.1, 11.3, 11.7, 11.9_
  - [ ] 10.4 Code: `adapters/network-gate.ts` (`createNetworkGate(fetchLike, hostList, parameters, timer)`, the only module that names `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`)
    - _Requirements: 1.3, 11.1, 11.7_
  - [ ] 10.5 Join the hostile list and the purity file list. Mutation check: a host list entry that accepts a prefix (P-11.9 fails).

- [ ] 11. The Adapters, the Transports and the QR (D12, D13, D4; §7.19; §3.2)
  - [ ] 11.1 Tests first: `adapters/storage.test.ts`, `clipboard.test.ts`, `random.test.ts`, `page-address.test.ts` against fakes of the browser objects
    - Storage: reads and writes the one key and the backup key; a throwing `setItem` (quota) is
      `storage_unavailable`; the memory storage has `persistent: false` and never touches `localStorage`;
      **no `storage` event handler** (there is no `onExternalChange`, Req 4.4). Clipboard: `copyText` with and
      without `navigator.clipboard` and with a rejecting one (`clipboard_unavailable`, nothing thrown);
      `shareLink` without `navigator.share` is `clipboard_unavailable` and `canShare` is `false`. Random:
      `bytes(n)` has `n` bytes from the fake `crypto`; without `crypto` the factory fails with
      `random_unavailable`. Page: `address()`, `fragment()`, `replaceAddress` (the fake history receives the
      address without fragment, `state` `null`), `onFragmentChange` on `hashchange`. All fail.
    - _Requirements: 1.3, 4.4, 10.3, 14.4_
  - [ ] 11.2 Code: `adapters/storage.ts`, `clipboard.ts`, `random.ts`, `page-address.ts`; test-support fakes `fake-storage`, `fake-clipboard`, `fake-random`, `fake-page`, `recording-gate`
    - Each takes the browser object it wraps as an argument and reads no global.
    - _Requirements: 1.3, 4.4_
  - [ ] 11.3 Tests first: `adapters/transport/memory-network.test.ts`, `manual-transport.test.ts`, P-9.6, P-9.7
    - Examples: one send to three phones with the default plan; each plan (loss `[]`, duplication
      `copies: 2`, reordering by delays); `stop()` leaves the network; the text is never parsed (arbitrary
      text is delivered as it is). Properties (files in `adapters/transport/`, project `adapters`):
      **P-9.6** (Req 9.5, 9.6, 9.9: generator `deliveryPlan`; with a `FakeTimer` advanced past the largest
      delay, each phone's Sighting set equals the union of the codes that reached it at least once; two phones
      that received the same set have deeply equal sets and a deeply equal `assess`; **run through the
      memory network and through the second fake Transport `createRelayLikeTransport`** of the test support,
      built differently), 200 / 2 000; **P-9.7** (Req 9.7: codes of other Incident ids mixed in; an
      Incident's set holds only its own), 200 / 2 000. All fail.
    - _Requirements: 9.1, 9.2, 9.5 to 9.7, 9.9_
  - [ ] 11.4 Code: `math/transport/transport.ts` (types only), `adapters/transport/memory-network.ts`, `manual-transport.ts`, test-support `relay-like-transport.ts`
    - _Requirements: 9.1, 9.2, 9.9_
  - [ ] 11.5 Tests first: `adapters/qr-encoder.test.ts` (against a fake `uqr` first)
    - The matrix is square with `size = 4 · version + 17`; a 77-character link gives version 5; a
      161-character link is refused with `link_too_long`; the same link gives the same matrix; a throwing
      encoder is a failure value. Fails.
    - _Requirements: 10.5, 10.6, 20.4_
  - [ ] 11.6 Code: `adapters/qr-encoder.ts` (the only module that imports `uqr`; error correction level M, byte mode, an `encode` result turned into a `QrMatrix`)
    - Rerun the test against the real package; report the version it chose for the two links and that
      `size = 4 · version + 17` holds (this checks the capacities of §3.2; F19).
    - _Requirements: 10.5, 10.6_
  - [ ] 11.7 Join the hostile list and the purity file list (including the rule that `uqr` is imported only in `adapters/qr-encoder.ts`).

- [ ] 12. Checkpoint: the Adapters (does not stop)
  - `test:deep` for P-9.6, P-9.7 and P-11.9 (both halves) at their counts, then the root checks. Report
    cases, discards and the measured cost; the QR versions of 11.6; the hostile list's size.

- [x] 13. The screens (D3, D7, D15, D17, D20, D21; §9)
  - [x] 13.1 Tests first, then code: the store, the environment and the common parts
    - `components/store.test.tsx`: `createVigiaStore` with the fakes (storage, clock, timer, random,
      transport): `dispatch` runs `applyAction`, `storage.write` after a change, the expiry tick every
      `expiryCheckIntervalMs` by the `FakeTimer`, the Inbox in memory only, a corrupt value backed up once
      and `storage_corrupt` shown, a newer value left alone (`storage_version_unsupported`), the page's
      fragment handled (decoded, held in the Inbox, the address replaced). `FailureNotice.test.tsx` for
      **every** `VigiaReason` (the text equals `messageFor`'s and holds neither the code nor the field);
      `LimitsBlock`, `GuidanceBlock`, `SimulationBanner`, `TabBar`. Code: `environment.ts`, `store.ts`,
      `FailureNotice.tsx`, `LimitsBlock.tsx`, `GuidanceBlock.tsx`, `SimulationBanner.tsx`, `TabBar.tsx`.
    - _Requirements: 2.3, 2.5, 4.4, 4.5, 10.3, 16.1, 16.2, 21.4_
  - [x] 13.2 The Smoke and Sight screens
    - Tests first: `SmokeScreen.test.tsx` in each state (no smoke, one sighting, two, three with and without
      disagreement, four, a failed solve with the advice, a Fix with the phone's position known and unknown),
      with the Incident's note of Req 5.4 in every state, the not-calling statement, the delete-all control
      with one confirmation; `SightScreen.test.tsx` (UI's `SightingScreen`, crosshair only on a phone, through
      UI's `DeviceSighting`; the guidance before and after the first capture; **the question appears after a
      capture, is preselected only within `maxIncidentAgeMs`, and nothing is added until it is answered**;
      `ConfirmSmokeDialog`, `DeleteAllDialog`). Code: `SmokeScreen.tsx`, `SightScreen.tsx`,
      `FixWordsView.tsx`, `AdviceView.tsx`, `ConfirmSmokeDialog.tsx`, `DeleteAllDialog.tsx`.
    - _Requirements: 3.1 to 3.8, 4.2, 4.3, 4.5, 5.4, 6.1 to 6.6, 7.2 to 7.5, 14.5, 16.2_
  - [x] 13.3 The Sightings screen and the Share sheet
    - Tests first: `SightingsScreen.test.tsx` (the rows of §9; Hide, Show, Delete ask once; the shared
      channels; a conflict with both versions), `ShareSheet.test.tsx` (the statement of Req 15.2 before the
      first Share; **each presentation records its channel only on its own button**; a hidden sighting is
      marked; a page address of 110 characters gives "link too long" and the text; the simulation variant has
      no link, no QR, no system share and one button for each other phone), `QrImage` (inline SVG from the
      matrix, quiet zone, no `<img>`, the link as text beside it). Code: `SightingsScreen.tsx`,
      `SightingRow.tsx`, `ShareSheet.tsx`, `QrImage.tsx`.
    - _Requirements: 5.1, 5.2, 5.6, 9.3, 9.5, 10.1, 10.5 to 10.8, 15.2, 15.5, 15.6, 17.4_
  - [x] 13.4 The Inbox sheet
    - Tests first: `InboxSheet.test.tsx` (the card has **no observer position**; an unknown Incident asks to
      open it as a new smoke; Add and Ignore; a damaged paste shows its Message; a code of a simulated
      Incident is said to come from a simulation; the sentence that a code has no proof of authorship).
      Code: `InboxSheet.tsx`.
    - _Requirements: 4.2, 9.4, 10.3, 10.4, 15.7, 15.8, 17.4_
  - [x] 13.5 The Map screen, the Overlay registry and the shared Overlay parts
    - Tests first: `MapScreen.test.tsx` with `FakeMapLibre` (UI's): observers, Wedges, the Fix and its
      ellipse through `MapView`, the set-aside lines, the legend, the attribution, the plain background with
      no Tile source, `crosses_antimeridian` through `messageFor`; the Overlays panel with a **test-only**
      `OverlayDefinition` (its switch, its sentence of what will be sent, its legend, its failure beside the
      switch and nothing else changed; with `OVERLAYS` empty there is no panel). Code: `MapScreen.tsx`,
      `overlays/index.ts` (`OVERLAYS = []`), `overlays/shared/math/overlay-types.ts`,
      `overlays/shared/components/OverlayPanel.tsx`, `Legend.tsx`, `SourcesList.tsx`.
    - _Requirements: 1.10, 12.2 as applied to the wind, 13.1, 18.1 to 18.6_
  - [x] 13.6 The Emergency screen and the privacy page
    - Tests first: `EmergencyScreen.test.tsx` (the not-calling statement; Copy success and failure keeps the
      text selected and shows `clipboard_unavailable`; **the own-position switch is off by default**; the
      `SIMULATION:` line; produced again when the Fix changes, with the time it was made, and not left from an
      earlier Fix); `PrivacyPage.test.tsx` (rendered from `PRIVACY_TABLE`, nine rows). Code:
      `EmergencyScreen.tsx`, `PrivacyPage.tsx`.
    - _Requirements: 14.3 to 14.7, 15.3_
  - [x] 13.7 `App.tsx`, `system.ts`, `overlays-empty.ts`
    - Tests first: `App.test.tsx` (the four tabs always there but on the Sight screen and in a modal; a
      link with a code opens the Inbox sheet; the mode control is shown only with `DeviceOrientationEvent`).
      Code: `App.tsx` (the only importer of `./overlays`), `system.ts` (the one module with `setInterval` and
      `Date.now`), `overlays-empty.ts`.
    - _Requirements: 1.5, 1.10, 10.3, 17.1_
  - [x] 13.8 Properties of the store: P-10.10 and P-15.9 (project `components`)
    - Tests first. **P-10.10** (Req 10.3, 10.10: generator `pageAddress`, `sightingArb`; the fake `VigiaPage`
      opened at the link and the store's fragment handler with a recording gate: afterwards the address is the
      one without the fragment, the gate was never called, and no argument of any adapter call holds a run of
      the code except the Inbox card), 200 / 2 000. **P-15.9** (Req 15.9: `storageActions` extended to the
      actions of Requirements 3 to 14 with a recording gate, a recording Transport, a recording Clipboard, a
      fake Storage, a fake page and spies on `console` and on the history: no Sighting code, observer position
      or azimuth in any argument to the gate, in a URL path or query, in a `console` call or in a title; a code
      appears in the Transport's and the Clipboard's records only after a Share action or a Copy that the
      sequence holds, and only the code of the Sighting shared), 200 / 1 000. Mutation check: a code symbol
      logged to `console` (P-15.9 fails). The wind Overlay's switch joins P-15.9's actions in 17.5.
    - _Requirements: 10.3, 10.10, 15.1, 15.4, 15.9_
  - [x] 13.9 The cut test (D21, Req 1.10)
    - Add the fourth project `no-overlays` to `vitest.config.ts` (the `math` and `components` tests but
      `src/overlays/**`, with `src/overlays/index.ts` aliased to `src/overlays-empty.ts`), part of `pnpm test`,
      and the purity rule that nothing but `src/App.tsx` and `src/overlays-empty.ts` mentions `overlays/`.
      The project passes now with the registry empty.
    - _Requirements: 1.10_
  - [x] 13.10 The files of this group join the purity file list; the screens are checked at 360 CSS pixels in a component test for the touch-target sizes and the colours of UI's `COLOURS` and `SIZES`.

- [ ] 14. The Simulation shell, the four scenes and the reviewer's path (D16; §10)
  - [ ] 14.1 Tests first: `math/scenes/smoke-scenes.test.ts`
    - Each of the four scenes (`two-posts`, `three-posts`, `four-posts-one-wrong`, `almost-in-line`) passes
      UI's `checkScene`; a Simulator is created for every Station (the script validates); **through `assess`,
      `four-posts-one-wrong` sets `southwest` aside as `outlier`, and the same 12° on `side` is not set
      aside**; the classes of the other three are the probe's (`poor`, `good`, `poor` with `poor_geometry`)
      with the semi-axes within 10 % of the probe's (765 m by 204 m; 262 m by 204 m; 8 635 m by 241 m).
      Fails.
    - _Requirements: 17.2, 17.8_
  - [ ] 14.2 Code: `math/scenes/smoke-scenes.ts` (`smokeScenes()` through UI's `sceneFromOffsets` and `scriptForStation`, offsets of §10, the Target "Smoke column")
    - _Requirements: 17.2_
  - [ ] 14.3 Tests first: `components/simulation/SimulationShell.test.tsx`, `simulated-phone.test.ts`
    - One phone for each Station with its own store, memory storage and transport endpoint; the Station the
      panel is on is the phone in hand and changing it changes the screens while the others keep their
      sightings; the Clock is the largest `nowUtcMs` any Session has reported, never decreasing; the Incident
      ids are made in `simulation` mode (first symbol `Z`); sending from the active phone delivers the code,
      as text only, to the others' Inboxes; no link, no QR, no system share; the banner on every screen.
      Fails.
    - _Requirements: 17.1, 17.4, 17.5_
  - [ ] 14.4 Code: `components/simulation/SimulationShell.tsx`, `simulated-phone.ts`, and `main.tsx` (the composition root: the real Adapters, the tile source from the environment checked against the Host list, `createRoot`, the maplibre stylesheet imported once, the Simulation mode chosen by `hasDeviceOrientation`)
    - _Requirements: 11.4, 17.1, 17.5, 18.2_
  - [ ] 14.5 The reviewer's integration test: `components/simulation/SimulationShell.integration.test.tsx`
    - With `FakeTimer`, `FakeMapLibre`, memory storage, the memory network and the **refusing** Network gate
      (every call recorded and refused), for each of the four scenes copied with noise 0: choose the scene,
      Start, Freeze, Capture (once by the crosshair and once by a Mark on the smoke's pixel), answer "same
      smoke", change the Station, repeat; the Smoke screen and the Emergency tab show the words of §7.8 and the
      text of §7.12 with the `SIMULATION:` line; the fake map holds the observers, Wedges, the Fix, its ellipse
      and the set-aside layers; **each captured Bearing's azimuth equals the Target's true azimuth within
      `1e-8` rad**; the advice of `two-posts` points east and west; `four-posts-one-wrong` shows `southwest`
      set aside with the Message of `outlier`; `almost-in-line` shows the warning; Share to another phone,
      change Station, Add in the Inbox, the merged Fix; **the gate was never called**. A second test runs
      `three-posts` with the noise as the catalogue has it and checks that the smoke lies inside the drawn 95 %
      ellipse; a third runs the flow while `navigator.onLine` is `false` (the QR is shown and said not to work
      offline); a fourth, in the `no-overlays` project, runs the same flow with the Overlays module empty.
    - _Requirements: 3.3, 17.3, 17.6, 17.7, 21.2_
  - [ ] 14.6 The statistical test: `test-support/capture-from-script.ts` and P-17.9
    - Tests first for the harness (the seed is an argument; the same seed gives the same runs; the harness's
      rule: the bound is **applied to a scene only when at least 100 of its non-`poor` runs exist, and not at
      99**). **P-17.9** (Req 17.9): the four scenes, each Station's `northErrorRad` drawn per run from a normal
      with mean `0` and sigma `HEADING_SIGMA_RAD`, the catalogue's orientation noise kept, in `four-posts-one-
      wrong` the deliberate 12° replaced by the drawn error, 400 runs per scene and the Fix as the app computes
      it (`outlierRejection: true`); the target inside the 95 % ellipse in at least 90 % and at most 99 % of the
      runs in which `solve` succeeded and the Fix is not `poor`, for a scene with at least 100 of them; for the
      `poor` runs and for a smaller group the share is reported and not bounded. The report for each scene and
      each of the two groups: the runs, the failed solves, the group size, the share, whether the bound was
      applied, and in the four-Station scene the runs in which a consistent Bearing was set aside. **A result
      outside the bounds stops the work and is classified** (code, property or requirement, and which; Open
      question U2). 400 runs per scene in `pnpm test` and in `test:deep` (the deep run adds a second pass of
      4 000 for the report).
    - _Requirements: 17.9_
  - [ ] 14.7 The files of this group join the purity file list. Every scene, Station, code and Position is synthetic (the purity test scans `smoke-scenes.ts` for coordinates away from the origin's offsets).

- [ ] 15. Checkpoint: the reviewer's path (stops for review)
  - The reviewer's path works end to end on a laptop with no sensor and no network, before the wind Overlay.
    `test:deep` for P-9.6, P-9.7, P-10.10, P-15.9 and P-17.9, then the root checks. The report contains: the
    four scenes through the integration test (the Fix's words, the advice, the set-aside cause for each);
    the azimuth errors against the Targets (`1e-8` rad); **P-17.9 for each scene and each group** as in 14.6,
    with the probe's numbers beside the measured ones, and its classification if any bound was missed; the
    counts of P-10.10 and P-15.9 and the mutation check of 13.8; checkpoint 12's report; that the gate was
    never called; the `no-overlays` project passing; **one test for every `VigiaReason`** (the list of the
    reasons and the component test that shows each); the size of the hostile list against the exported names;
    the files built against the design's 78 (73 before the wind Overlay's five, with the registry and the
    shared Overlay parts counted). **Stop for review.**

- [ ] 16. The privacy document and the README (D20; Req 11.6, O2)
  - [ ] 16.1 Tests first: `math/privacy-table.test.ts` (the Markdown part)
    - `docs/privacy.md`'s Markdown table parses to the same nine rows as `PRIVACY_TABLE`, cell by cell; a
      changed cell in either fails. Fails (no document yet).
    - _Requirements: 15.3_
  - [ ] 16.2 Write `docs/privacy.md` (repository root, judge-facing) and the README of the package
    - `docs/privacy.md`: the table of Req 15.3 and a paragraph for each row. `apps/vigia/README.md`: what it
      is, how to build, the two variables of `.env.example`, **two paragraphs on hosting** (which hosts the
      page contacts, the Host list's with the Tile source's; which headers the host should send:
      `Referrer-Policy: no-referrer` first, a short cache lifetime for `index.html`, no logging of the full
      request address beyond what is needed), that the page must be opened once with a connection (Open
      question U9), and that the QR and the link need the receiving phone to load the page. No
      `docs/hosting.md` and no Content-Security-Policy generator. Every claim of the privacy document is
      checked against the code by the test of 16.1 and the scans of task 1.6.
    - _Requirements: 10.7, 11.6, 15.3, 15.4_

- [ ] 17. The wind Overlay (D15; §7.16; Req 13; the checkpoint after which the Overlays may be cut)
  - [ ] 17.1 Tests first: `overlays/wind/math/wind-parse.test.ts`, `wind-words.test.ts`, `wind-features.test.ts`, P-13.6
    - Fixture `fixtures/open-meteo-sample.json` (synthetic, read-only, built by hand from the documented field
      names). Examples: each of the five needed fields missing in turn is refused naming it; a unit other than
      `m/s` refused; `compassWord8` boundaries; the words say forecast or old exactly when `valid` and `now`
      differ by more than `maxWindAgeMs`; the attribution (CC BY 4.0) and the model-value sentence; the wind
      shaft and head built with `appFeature`. Property **P-13.6** (Req 13.3, 13.6: generator `windResponse`
      with invalid shapes (`NaN`, a negative speed, a direction of 360 or `-1`, a missing time, a number as a
      string, a wrong unit, a non-object `current`); the reading is valid or a failure, all numbers finite,
      direction in `[0, 2π)`, speed `≥ 0`; the compass word is that of the 45° sector), 200 / 10 000. All
      fail.
    - _Requirements: 13.1 to 13.6_
  - [ ] 17.2 Code: `overlays/wind/math/wind-parse.ts`, `wind-words.ts`, `wind-features.ts`
    - The two layers `wind` and `wind-head`; `fit` not set.
    - _Requirements: 13.2 to 13.6, 18.4_
  - [ ] 17.3 Tests first: `overlays/wind/components/wind-controller.test.ts`, with a fixture `fetchLike` behind the real gate and the real Host list
    - Off at start and no request; `setEnabled(true)` makes one request and `refresh()` one more and nothing
      else does (a `FakeTimer` advanced for an hour makes none); a failure shows its Message and leaves the
      layers empty; `update(context)` recomputes the layers with no request; in Simulation mode the fixture is
      read and no key is needed. Fails.
    - _Requirements: 13.1, 13.7, 17.4_
  - [ ] 17.4 Code: `overlays/wind/components/wind-controller.ts`, `wind-definition.ts`; the registry line in `overlays/index.ts`
    - The layers of the model plus the wind's are four of the eight `MAX_APP_LAYERS` allow (the test of 7.8
      now sums the real ids).
    - _Requirements: 1.10, 13.1, 13.7, 18.4_
  - [ ] 17.5 Wiring and the cut
    - The Map screen shows the wind panel; the wind switch joins P-15.9's actions (no position in a request
      other than the one rounded point, no code anywhere); the integration test of 14.5 runs once more with
      the wind switched on (the fixture, no network). **The cut test:** the `no-overlays` project passes
      with the wind Overlay present and the registry replaced by the empty one.
    - _Requirements: 1.10, 13.1, 15.9, 17.4_

- [ ] 18. Final checkpoint (stops for review)
  - `test:deep` for **every** property of design §11 that the first release has, at its stated count (the
    **27 properties** with their **29 tests**: P-2.6, P-3.9, P-4.7, P-5.10, P-5.11, P-5.12, P-5.13, P-6.2,
    P-6.8, P-6.9, P-6.10, P-7.7, P-7.8, P-8.8, P-8.9, P-8.10 (two tests), P-9.6, P-9.7, P-10.9, P-10.10,
    P-11.9 (two tests), P-13.6, P-14.8, P-14.9, P-15.9, P-16.4, P-17.9; P-12.10 and P-12.11 are the second
    release and are not run), with cases, discards, worst errors and the measured cost of each; the earlier
    reports. Then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` from the root, and
    **`pnpm --filter @alidade/vigia build` once**, exit code read, bundle sizes reported and **the size that
    `uqr` adds measured** (F19); no other task runs Vite and none runs `dev`.
  - Confirm that every FOR ALL criterion of the requirements that the first release builds has a property in
    design §11 that has a test, that each names itself and its requirements in a comment, and that each runs
    at least 200 cases in `pnpm test`. Write `coverage.md` for this spec (a table of every criterion and the
    tests that cover it, as for the skeleton's, and the second-release criteria marked as such). Confirm the
    counts against the design: 78 source files, the hostile list complete, no file of the hotspot Overlay, no
    `docs/hosting.md`. List the device checks V1 to V10 that are still open (V9 with F19 and F21's Open-Meteo
    details), the open questions that wait for the owner (O1 to O8), the publication date of every dependency
    (`uqr` 2026-04-03), and every flag of design §15 with its status. Report and stop.

- [x] 19. The words carry the disagreement (2026-11-19; Req 6.11, 14.11, 19.1; design §7.8, §7.12, §7.18)
  - [x] 19.1 Tests first: the fixture recomputed by an independent script (the count line of two and
    three, `disagreement` in the words, a fifth case of three that disagree; the script first
    reproduces the four cases of the old template); the lead's incident as an example that holds the
    whole Emergency text; the words of three that disagree; the Fix's legend in the map model; the
    worst case rebuilt (896); `MAX_EMERGENCY_TEXT_CHARS` 900 and the least `maxEmergencyTextChars` 896
    in the tests of the defaults, the parameters and the hostile list.
  - [x] 19.2 Code: `fix-words.ts` (`disagreement`, the best-fit headline), `emergency-text.ts` (the
    position line of sightings that disagree, the count line, `WORST_EMERGENCY_TEXT_CHARS` 896),
    `map-model.ts` (`fixLegend`), `parameters.ts` (896), `defaults.ts` (900).
  - [x] 19.3 P-14.8, P-14.9, P-16.4 at 5 000 cases; mutation checks: the position line, the count line,
    the legend and the headline each ignoring the disagreement fail a test.
  - _Requirements: 6.11, 14.11, 19.1_

- [x] 20. Joining two smokes (2026-11-21; Req 4.7 to 4.10; design §7.4a, §7.5, §9 Inbox, §11 P-4.10)
  - The working rules of this file apply (tests first and seen to fail, a failing property stops and is classified, `timeout` on
    every run, outputs under /tmp/vigia/, one run at a time, no commit, nothing under `skeleton/`, `requirements.md` untouched).
  - [x] 20.1 Design: §7.4a of `design.md` (the state and its former ids, the action `joinIncident` and its refusals, the
    matching of a code by an id or a former id, the stored format, the code after a join, the Inbox's answers), the rows of P-4.7
    and P-4.10 in §11. Shown in the report, not a stop.
  - [x] 20.2 Tests first, then code, in the Math layer: `math/incident/join.test.ts` and `apply-action.test.ts` (the join with
    each refusal; a code of a former id added with no question and relabelled; a duplicate under two ids is one entry; the
    smaller id; the creation time; the former ids kept and bounded; conflicts relabelled), `storage-format.test.ts` (the key
    written, a value saved before this change loads with nothing dropped, damaged former ids counted), `incident-state.test.ts` (I8
    in `sanitiseState`), the new parameter `maxFormerIncidentIds` (`MAX_FORMER_INCIDENT_IDS`, 16) in `defaults.ts`,
    `parameters.ts` and their tests, the new reason `incident_not_joinable` with its Message (its test, the hostile lists). Code:
    `math/incident/join.ts`, `incident-state.ts`, `apply-action.ts`, `storage-format.ts`.
  - [x] 20.3 **P-4.7** gains `joinSame` among its steps and the former ids in its reference model and in the reload.
    **P-4.10** (new, `math/incident/join.property.test.ts`): the generator `joinGroups` of §11, its domain stated in the file,
    **delivering the own Sightings of every phone to every other** (the premise of the convergence). 200 cases in `pnpm test`,
    5 000 in `test:deep`. Mutation checks: the larger id taken instead of the smaller; former ids not kept; each to be failed
    by a named test.
  - [x] 20.4 Tests first, then code, in the components: `store.joinFromInbox`; the Inbox sheet (two answers of equal weight,
    none preselected, and Ignore; the sentences of Req 4.8; the confirmation; the refusal through `messageFor`; with none open,
    as before; a card of a former id says "for the smoke you have open" and adds with no question).
  - [x] 20.5 The reviewer's integration test: for `two-posts` and `three-posts` the natural order (each post takes its
    sighting first; one code is sent; the receiving phone answers "the same smoke" and has the Fix; then the other direction;
    both phones show the same Fix and the same Incident id); `four-posts-one-wrong` and `almost-in-line` keep the old order.
  - [x] 20.6 The hostile list (`joinIncident`, `incidentHolding` and the generators), the purity list, P-15.9 (the join is an
    action of its sequences), the privacy table if it lists what a code holds. Then the root checks.

- [x] 21. What a judge meets in the first minute (2026-11-20; design §9 note of 2026-11-20; skeleton-ui task group 30, its D34)
  - The working rules of this file apply (tests first, `timeout` on every run, outputs under /tmp/vigia/, one run at a time, no
    commit, `requirements.md` untouched). The edits under `skeleton/` are skeleton-ui task group 30, asked for by the lead.
  - [x] 21.1 Tabs. `TabBar.test.tsx`: the width of every label at 320 px computed from the styles (0.63 em a character), with no
    badge and with badges of 1 to 3 digits; no label wraps; none suggests a call. Code: `TabBar.tsx` (tabs as wide as their
    labels, the badge under the label), `index.html` (no `body` margin).
  - [x] 21.2 Emergency. `EmergencyScreen.test.tsx`: the text whole in the flow (no height, no scroll inside, `pre-wrap`,
    selectable), the selection after a failed Copy, the switch's state with room of its own. Code: `EmergencyScreen.tsx`.
  - [x] 21.3 The primary action above the tabs. `App.test.tsx`: on Smoke and on Emergency the primary action is in the row
    after the scrolling part and before the tab bar, in the column; empty on Sightings and Map; the secondary controls in the
    scrolling part. Code: `PrimaryAction.tsx`, `App.tsx`, `SmokeScreen.tsx`, `EmergencyScreen.tsx`.
  - [x] 21.4 The reviewer's Sight screen. `SimulationShell.test.tsx`: the post, the scene and Start before the closed
    "Simulator controls"; Start plays; the guidance after Start. Code: `SimulationShell.tsx` (the compact panel,
    `selectedStationId`), `SightScreen.tsx` (the order in Simulation mode), the test driver.
  - [x] 21.5 The phone in hand and the reviewer's path. `App.test.tsx` and `SimulationShell.test.tsx`: the bar under the
    banner on every screen and sheet; changing the post from any screen moves the panel, and the next capture is from there;
    the three numbered lines while the phone in hand holds no smoke, and not on a phone. Code: `PhoneInHandBar.tsx`,
    `ReviewerPath.tsx`, `math/texts.ts` (`reviewerPathLines`, in the hostile list of P-2.6), `App.tsx`, `SmokeScreen.tsx`.
  - [x] 21.6 Map. `MapScreen.test.tsx`: the map's height; `crosses_antimeridian` said once, by `MapView`. Code:
    `MapScreen.tsx` (the height; its own check of the extent removed).
  - [x] 21.7 The counts: `reasons.test.ts` (the 23 of Req 2.2 typed out), `messages.test.ts` and `reasons.ts` comments, design D2
    (23 reasons, 70 in all, the row of `incident_not_joinable`).
  - [x] 21.8 The new files join the purity list; mutation checks M1 to M9 (each fails a named test); then the root checks.

- [x] 22. The tile provider's policy: the page's referrer (2026-11-20; Req 10.2, Open questions O2 and O7 as amended; skeleton-ui task 31)
  - The working rules of this file apply (tests first and seen to fail, `timeout` on every run, outputs under /tmp/vigia/,
    one run at a time, no commit, `requirements.md` untouched).
  - [x] 22.1 Tests first, seen to fail on the old value: `build-output.test.ts` (the built page has one referrer `meta`,
    `strict-origin`, and no `no-referrer`), `readme.test.ts` (the hosting paragraph names `Referrer-Policy: strict-origin`
    first, the origin and nothing else, never the fragment, and the wind request with no referrer),
    `math/privacy-table.test.ts` (the Tiles row names the site's origin as the referrer; the Tiles paragraph of
    `docs/privacy.md` says `strict-origin` and never the fragment).
  - [x] 22.2 Code and documents: `index.html` (`strict-origin`), `math/privacy-table.ts` (the Tiles row), `README.md`
    (hosting), `docs/privacy.md` (the Tiles row and paragraph), design D14, §5 and §13. The Network gate keeps
    `no-referrer`, unchanged, with its tests. Req 15.3's own table still has the old Tiles row: the lead's to amend.
  - [x] 22.3 The root checks.
