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

- [x] 1. Scaffold the package (design §3, §5, §13; D1, D19, D21)
  - [x] 1.1 Create `apps/vigia` without the QR dependency
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
  - [x] 1.2 Smoke tests of the unverified assumptions, each a throwaway file (design §13, D1)
    - (a) `projects` with `extends: true` inherits `provide`: a test in each project reads
      `inject('propertyRuns')`; if not, repeat the `provide` line per project. (b) A trivial component
      renders under jsdom with Testing Library, and `tsc` accepts `jsx: react-jsx`. (c) `import.meta.glob`
      with `?raw` works in the `math` project (the purity test needs it), with the type declaration copied
      from UI's `import-meta-glob.d.ts`. (d) `@alidade/ui`'s `index.ts` loads in Node with no DOM (the Math
      layer imports pure names from it, D1), and `import { DeviceSighting, OUTLIER_STUDENTISED_RESIDUAL, … }`
      resolves from the three packages. Report each result, delete the throwaway files, **stop on any
      mismatch**.
    - _Requirements: 1.1, 1.2, 21.7_
  - [x] 1.3 Install `uqr` (the one new dependency, approved by the lead)
    - From `apps/vigia`: `pnpm add -E uqr@0.1.3`. Record `npm view uqr time --json` for that version, the
      exit code, the diff of `package.json` and `pnpm-lock.yaml`, and that nothing else was added. Do not
      import it yet (task 11.6).
    - _Requirements: 20.2, 20.4_
  - [x] 1.4 Test support, copied from UI's (not exported; design §5, UI D20)
    - `src/test-support/`: `fast-check-setup.ts` (the one place that sets `numRuns`, `cappedRuns`,
      `isDeepRun`), `property-report.ts` (`checkProperty`, `ErrorTracker`), `deep-same.ts`, `fake-timer.ts`,
      `seeded-normal.ts` (a 32-bit integer generator with Box–Muller, the seed an argument), and
      `hostile.ts` (`hostileNumber`, `hostileString` of 0 to 10 000 characters of the full BMP, the doubles
      either side of every limit of `VigiaParameters`). Each with its own small test, so that no helper
      is vacuous (a deliberately failing property is reported as failing).
    - _Requirements: 21.1, 21.5_
  - [x] 1.5 The ESLint block, once, in the root `eslint.config.js` (design §13)
    - For `apps/vigia/**/*.{ts,tsx}`: `@typescript-eslint/no-explicit-any` and the two `react-hooks` rules
      as errors; for `apps/vigia/src/**/math/**/*.ts` and `apps/vigia/src/overlays/**/math/**/*.ts` also
      `@typescript-eslint/no-non-null-assertion` as an error. Confirm with a throwaway file in each place
      (an `any`, a `!` in a `math/` folder, a conditional hook) that `pnpm lint` fails; delete them. This
      is the only edit outside `apps/vigia` and `docs/`.
    - _Requirements: 1.8_
  - [x] 1.6 The skeleton of `purity.test.ts` (design §5, the table of rules)
    - Read every `src` file with `import.meta.glob(..., { query: '?raw' })`, with comments and strings
      removed as UI's does (`code` and `bare`), the fixed file list (empty but for itself), and **every rule
      of the §5 table** written as data: the pattern, where it applies, and a probe (a copy of a real source
      with the rule's token added, so that no rule can pass by matching nothing). The rules that need files
      that do not exist yet are written now and their probes use a throwaway string; they begin to bite as
      the files appear. Also: `package.json` exact versions, `@alidade/*` as `workspace:*`, the versions
      equal to `skeleton/ui/package.json`'s, `uqr` `0.1.3` the only dependency beyond them; `.env.example`
      without values and no `.env*` file but the example; the ESLint block exists.
    - _Requirements: 1.1 to 1.9, 11.1, 11.6, 20.1 to 20.5_
  - [x] 1.7 `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass on the empty package, from the root, output kept in files.

- [x] 2. Results, reasons, messages, parameters (D2, D18, D20; §6, §7.20)
  - [x] 2.1 Tests first: `result.test.ts`, `reasons.test.ts`, `math/messages.test.ts`
    - The closed set: `VIGIA_REASONS` is `UI_REASONS` plus exactly the **22** of Req 2.2 (69 in all; the
      three hotspot reasons are not in it); `MESSAGES` has exactly the keys of `VIGIA_REASONS`; the 47 UI
      rows equal UI's `messageFor`; each of the 22 rows obeys UI's rules (one sentence of at most 160
      characters ending in a full stop, no code, no `_`, none of `NaN`, `Infinity`, `undefined`, `null`,
      `[object`, naming what the user can act on, Req 2.4); a type-level test that a new reason without a
      row does not compile (`// @ts-expect-error` on a copy of the union). All fail.
    - _Requirements: 2.2, 2.3, 2.4, 21.4_
  - [x] 2.2 Code: `result.ts`, `reasons.ts`, `math/messages.ts`
    - `VigiaResult`, `VigiaFailure`, `VigiaOnlyReason` (22), `VIGIA_ONLY_REASONS`, `VIGIA_REASONS`,
      `MESSAGES`, `messageFor` (the table of D2, every row as written there, `uiRows()` built once with one
      cast inside and a run-time test of its keys).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 2.3 Tests first: `math/degrees.test.ts`, `defaults.test.ts`, `math/parameters.test.ts`, `math/privacy-table.test.ts`
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
  - [x] 2.4 Code: `math/degrees.ts`, `defaults.ts`, `math/parameters.ts`, `math/privacy-table.ts`
    - The hotspot parameters are **not** built (they come with the hotspot Overlay). `defaultParameters()`
      is called only in `main.tsx`, `simulation/` and tests (a purity rule).
    - _Requirements: 19.1 to 19.4, 15.3_
  - [x] 2.5 P-2.6: the hostile totality, as a registry
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

- [x] 3. Time, identifiers, the sighting code and the link (D5, D6, D13, D22; §7.1 to §7.3, §7.13, §8)
  - [x] 3.1 Tests first: `math/civil-time.test.ts`
    - `clockTextUtc(1 790 000 000 000)` is `14:13 UTC`; `ageText` at 59 999, 60 000, 3 599 999,
      3 600 000, 172 799 999 and 172 800 000 ms. (`utcMsFromCivil` and its examples come with the hotspot
      Overlay, second release: not here.) All fail.
    - _Requirements: 3.6, 14.1_
  - [x] 3.2 Code: `math/civil-time.ts` (`clockTextUtc`, `ageText`; integer arithmetic, no `Date`)
    - `utcMsFromCivil` is not built: it comes with the hotspot Overlay (design D22, §7.1).
    - _Requirements: 1.2_
  - [x] 3.3 Tests first: `math/incident/ids.test.ts`, `math/incident/sighting.test.ts`, P-3.9
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
  - [x] 3.4 Code: `math/incident/ids.ts`, `math/incident/sighting.ts` (`Sighting`, `withSightingId`; `canonicalise` and `captureToSighting` are added in 3.9)
    - _Requirements: 3.4, 3.9, 4.1_
  - [x] 3.5 Tests first: the alphabet and the check, `math/code/alphabet.test.ts`, `math/code/gf31-check.test.ts`
    - The 31 symbols (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`, none of `0 1 I L O`), `groupCode` (ten groups of
      five, hyphen-joined), `stripCode` (whitespace and hyphens); the check over GF(31) with
      `g(x) = x⁴ + x + 1`: its four symbols for the three worked examples' payloads equal `B8GH`, `FSJE`,
      `8FQS` (§8.7); the proof's cases by exhaustion on the examples: every single-symbol substitution, every
      swap of two unequal neighbours, every change of two adjacent symbols, of three and of four, never passes
      (the proof of §8.4 as a test). All fail.
    - _Requirements: 8.2, 8.6_
  - [x] 3.6 Code: `math/code/alphabet.ts`, `math/code/gf31-check.ts`
    - _Requirements: 8.2, 8.6_
  - [x] 3.7 Tests first: `math/code/sighting-code.test.ts` against `fixtures/sighting-codes.json`, P-8.8, P-8.9, P-8.10
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
  - [x] 3.8 Code: `math/code/sighting-code.ts` (`encodeSighting`, `decodeSighting`, `CODE_LENGTH`; §8.1 to §8.5)
    - Mixed-radix payload as a `BigInt`, 44 digits, the quantisations of §8.1, the decoder's order of §8.5
      (length limit, strip, alphabet, ≥ 6 symbols, check, version and kind, length 50, `N` below the
      product, `parseBearing`).
    - _Requirements: 8.1 to 8.7_
  - [x] 3.9 Canonical Sighting and link: tests first, then code
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
  - [x] 3.10 The Math files of this group join the hostile list (P-2.6) and the purity file list.

- [x] 4. Checkpoint: the sighting code (stops for review)
  - `test:deep` for P-2.6, P-3.9, P-8.8, P-8.9, P-8.10 (a) and (b), P-10.9 at their counts, then the
    root checks. The report contains: for each property the cases, discards and worst errors, the measured
    milliseconds a case (P-8.10 (a) decodes about 1 700 codes a case: say what 2 000 cases cost) and the
    success counter of P-8.10 (b); that the three examples of §8.7 encode and decode to the fixture
    byte for byte and the four damage examples are refused; the lengths (50 symbols, 59 grouped, a
    77-character link on `https://vigia.example.org/`); **the three mutation checks**: the sigma rounded
    down (P-8.8 fails), the check computed over the payload only (P-8.10 and the examples fail), the
    version read before the check (P-8.10 fails); the `uqr` install record of 1.3; the state of every flag
    of the design that this group touches (C, F19). **Stop for review.**

- [x] 5. The Incident reducer, the merge and the stored format (D3, D4, D7; §7.4, §7.5)
  - [x] 5.1 Tests first: `math/incident/incident-state.test.ts`, `merge.test.ts`, `apply-action.test.ts`, `storage-format.test.ts`
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
  - [x] 5.2 Code: `math/incident/incident-state.ts`, `merge.ts`, `apply-action.ts`, `storage-format.ts`
    - Types and reducer of §6; `mergeSighting` with the outcomes `duplicate`, `conflict`, `full`, `added`;
      `serialiseState`, `parseStoredState` with the steps of §7.5; entries ordered by `sightingId`.
    - _Requirements: 4.1 to 4.7, 9.5, 9.6_
  - [x] 5.3 The files of this group join the hostile list and the purity file list.

- [x] 6. The assessment (D8; §7.6, §7.7)
  - [x] 6.1 Tests first: `math/assessment/assess.test.ts`, `statements.test.ts`, P-5.10 to P-5.13
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
  - [x] 6.2 Code: `math/assessment/assess.ts`, `statements.ts`
    - `assess` (order, hidden, implausible, too old, solve with `outlierRejection: true`, causes,
      `checkLevel`, `disagreement` with Core's exported `OUTLIER_STUDENTISED_RESIDUAL`), `orderEntries`, the
      statements of §7.7.
    - _Requirements: 5.1 to 5.9_
  - [x] 6.3 The files of this group join the hostile list and the purity file list. Mutation check: the third Bearing marked as the culprit of a disagreement (P-5.13 and the examples fail).

- [x] 7. The words, the Geometry class, the advice, the map model (D9, D10; §7.8 to §7.11, §7.18)
  - [x] 7.1 Tests first: `math/fix/format.test.ts`, P-6.2
    - Examples: `lengthText95` at 9.99, 10, 10.01, 994.9, 995, 999.99, 1 000, 1 000.01, 2 041, 1e6, 1e6 + 1
      (rounded up, never down); `positionDecimals` at the four step values and their neighbours; `positionText`
      with the printing bound; `compassWord8` at 22.4°, 22.5°, 337.4°, 337.5°; `axisWords`. Property **P-6.2**
      (Req 6.2: `b ∈ [0.1, 1e7]` m log-uniform with the step values drawn; `positionDecimals(b)` is the smallest
      `d` whose step is at most `b`, or 4; `lengthText95(x)` is at least `x` and exceeds it by less than its
      step), 200 / 100 000. All fail.
    - _Requirements: 6.2, 6.3_
  - [x] 7.2 Code: `math/fix/format.ts`, `math/texts.ts` (the fixed sentences: limits, guidance, the not-calling statement; the statements by count are in `statements.ts`)
    - `metresPerDegree` from Core's `greatCircleDistanceM` of one degree; no Earth radius of Vigia's own.
    - _Requirements: 6.2, 14.5, 16.1, 16.2_
  - [x] 7.3 Tests first: `math/fix/geometry-class.test.ts`, `from-you.test.ts`, P-7.8, P-6.9
    - Examples: the class at the ratios and at the warning; `halfIntervalM` at `θ = 0`, `π/2`, `π/4`; a phone
      at the Fix's position gives the `coincident_positions` sentence; the distance is never produced without
      its interval. Properties: **P-7.8** (Req 7.1, 7.8: `fixCase`; `poor` iff `poor_geometry` or elongation
      `≥ longEllipseRatio`, `fair`, `good`; a pure function of warnings and Ellipse), 200 / 10 000; **P-6.9**
      (Req 6.4, 6.9: `b95 ≤ h ≤ a95`, equal to the largest extent of UI's `fixFeatures` polygon within
      `1e-3 · a95`, `a95` at `θ = 0` and `b95` at `θ = π/2` within `1e-9 · a95`), 200 / 5 000. All fail.
    - _Requirements: 6.4, 6.9, 7.1, 7.8_
  - [x] 7.4 Code: `math/fix/geometry-class.ts`, `from-you.ts`
    - _Requirements: 6.4, 7.1_
  - [x] 7.5 Tests first: `math/fix/fix-words.test.ts` against `fixtures/emergency-texts.json` (the Fix part), P-6.8, P-6.10
    - Fixtures (read-only, synthetic): three Fixes (a round 40 m ellipse near `30° N, 40° W`, the `two-posts`
      Fix of 765 m by 204 m, a 12 km one) with the exact expected `fixWords`. Properties: **P-6.8** (Req 6.2,
      6.3, 6.8: Fixes of `consistentBearings(2 … 12)` through `assess`; the text holds `lengthText95` of both
      semi-axes (an independent formatter in the test), the count, the position with the decimals of P-6.2, the
      words "probably" and "within about", none of "exact", "located at", "confirmed", "precisely", none of
      `NaN`, `Infinity`, `undefined`, `null`), 200 / 5 000; **P-6.10** (Req 6.10: the ratio `2.4477` between
      `ellipse95` and the Ellipse within `1e-9`; the words' axes are `ellipse95` of the Fix's own Ellipse; a
      mutated scale fails), 200 / 5 000. All fail.
    - _Requirements: 6.1 to 6.3, 6.7, 6.8, 6.10_
  - [x] 7.6 Code: `math/fix/fix-words.ts` (`fixWords`; the warning sentence uses `POOR_GEOMETRY_CROSSING_RAD` through `toDeg`)
    - _Requirements: 6.2, 6.3, 6.7, 16.1, 16.4_
  - [x] 7.7 Tests first: `math/fix/advice.test.ts`, P-7.7
    - Examples: the example of Req 7.9 (two observers 800 m east and west of a target 3 000 m north: the
      advised directions within 5° of 90° and 270°, the distance within 20 % of 3 000 m); `2 · atan(0.35 / 2)`
      within `0.2°` of 20° and the sentence contains "a third"; the advice for a round Fix, for none and for one
      Sighting; the hypothetical Bearing is not in the returned value. Property **P-7.7** (Req 7.7:
      `consistentBearings(2 … 3)` with elongation of at least 1.5, the area after the hypothetical Bearing
      from either advised direction is at most the area from the same distance along the major axis, relative
      `1e-6`, and at most the area before; counter: cases in which the advised direction gave the smallest area
      among 36 directions within 1 %), 200 / 2 000. All fail.
    - _Requirements: 7.2 to 7.7, 7.9_
  - [x] 7.8 Code: `math/fix/advice.ts` (`nextSightingAdvice`, `adviceWords`), `math/fix/map-model.ts` (`mapModel`) with `map-model.test.ts` first
    - Map model tests: the set-aside lines and markers; `lineLengthM` at its two clamps; the layers of the
      model plus the wind Overlay's two are four, at most `MAX_APP_LAYERS` (the wind's two are asserted in 17).
    - _Requirements: 5.5, 7.2 to 7.6, 18.3, 18.4_
  - [x] 7.9 The files of this group join the hostile list and the purity file list. Mutation check: the position decimals read the other way (P-6.2 and P-6.8 fail).

- [x] 8. The Emergency text (D11; §7.12)
  - [x] 8.1 Tests first: `math/fix/emergency-text.test.ts` against `fixtures/emergency-texts.json` (the text part), P-14.8, P-14.9, P-16.4
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
  - [x] 8.2 Code: `math/fix/emergency-text.ts`
    - The worst case of 730 characters computed from the longest string of each line (a test builds it).
    - _Requirements: 14.1 to 14.9_
  - [x] 8.3 The file joins the hostile list and the purity file list. Mutation check: an observer's position in the text without the switch (P-14.8 and the fixture fail).

- [x] 9. Checkpoint: the Math of the core flow (stops for review)
  - `test:deep` for P-4.7, P-5.10, P-5.11, P-5.12, P-5.13, P-6.2, P-6.8, P-6.9, P-6.10, P-7.7, P-7.8, P-14.8,
    P-14.9, P-16.4 and P-2.6 (with the hostile list so far) at their counts, then the root checks. The report
    contains: for each property the cases, discards and worst errors, the measured cost and a proposal for
    the counts if it differs by a factor of three from the design's estimate; **the counters**: P-5.12 (the
    wrong Bearing excluded, kept, a consistent one excluded, with the shares) and P-7.7 (the advised direction
    best among 36); **P-5.13's result and, if it failed, its classification (Req 5.13)**; the generators'
    discards; the three fixtures matched; the mutation checks of tasks 6.3, 7.9 and 8.3; that no copy of a
    skeleton threshold exists (the purity rule); the hostile list's size against the exported names. **Stop
    for review.**

- [x] 10. The Network gate and the Host list (D14; §7.14, §7.15 `windPoint`)
  - [x] 10.1 Tests first: `math/network/host-list.test.ts`, `gate-decision.test.ts`, `request-boxes.test.ts`, P-11.9 (decision)
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
  - [x] 10.2 Code: `math/network/host-list.ts` (the entries `tiles` and `wind`, with purpose, Source's name, what the request carries in words and as the exact path and query, terms link left as a parameter for the owner, key flags; `buildHostList`), `gate-decision.ts` (`decideRequest`, §7.14 steps 1 to 6), `request-boxes.ts` (`windPoint` only)
    - The only module that names a host (a purity rule). The hotspot entry is not written.
    - _Requirements: 11.2, 11.3, 11.9, 13.2_
  - [x] 10.3 Tests first: `adapters/network-gate.test.ts`, P-11.9 (gate), with a `FakeFetch` and the `FakeTimer`
    - A refused URL never calls the fake fetch; every call has `credentials: 'omit'`, `referrerPolicy:
      'no-referrer'`, `redirect: 'error'`, `method: 'GET'`, `cache: 'no-store'` and no header; a rejected
      fetch, an abort by the `FakeTimer`, a status 503, a body over the limit (streamed and aborted at the
      limit; and read as text) are `overlay_unavailable` with `errorName` `offline`, `timeout`, `status-503`,
      `too-large`; no unhandled rejection. Property **P-11.9** (gate half): the injected fetch is called if and
      only if the decision accepts, and then with exactly those options, 200 / 2 000. All fail.
    - _Requirements: 11.1, 11.3, 11.7, 11.9_
  - [x] 10.4 Code: `adapters/network-gate.ts` (`createNetworkGate(fetchLike, hostList, parameters, timer)`, the only module that names `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`)
    - _Requirements: 1.3, 11.1, 11.7_
  - [x] 10.5 Join the hostile list and the purity file list. Mutation check: a host list entry that accepts a prefix (P-11.9 fails).

- [x] 11. The Adapters, the Transports and the QR (D12, D13, D4; §7.19; §3.2)
  - [x] 11.1 Tests first: `adapters/storage.test.ts`, `clipboard.test.ts`, `random.test.ts`, `page-address.test.ts` against fakes of the browser objects
    - Storage: reads and writes the one key and the backup key; a throwing `setItem` (quota) is
      `storage_unavailable`; the memory storage has `persistent: false` and never touches `localStorage`;
      **no `storage` event handler** (there is no `onExternalChange`, Req 4.4). Clipboard: `copyText` with and
      without `navigator.clipboard` and with a rejecting one (`clipboard_unavailable`, nothing thrown);
      `shareLink` without `navigator.share` is `clipboard_unavailable` and `canShare` is `false`. Random:
      `bytes(n)` has `n` bytes from the fake `crypto`; without `crypto` the factory fails with
      `random_unavailable`. Page: `address()`, `fragment()`, `replaceAddress` (the fake history receives the
      address without fragment, `state` `null`), `onFragmentChange` on `hashchange`. All fail.
    - _Requirements: 1.3, 4.4, 10.3, 14.4_
  - [x] 11.2 Code: `adapters/storage.ts`, `clipboard.ts`, `random.ts`, `page-address.ts`; test-support fakes `fake-storage`, `fake-clipboard`, `fake-random`, `fake-page`, `recording-gate`
    - Each takes the browser object it wraps as an argument and reads no global.
    - _Requirements: 1.3, 4.4_
  - [x] 11.3 Tests first: `adapters/transport/memory-network.test.ts`, `manual-transport.test.ts`, P-9.6, P-9.7
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
  - [x] 11.4 Code: `math/transport/transport.ts` (types only), `adapters/transport/memory-network.ts`, `manual-transport.ts`, test-support `relay-like-transport.ts`
    - _Requirements: 9.1, 9.2, 9.9_
  - [x] 11.5 Tests first: `adapters/qr-encoder.test.ts` (against a fake `uqr` first)
    - The matrix is square with `size = 4 · version + 17`; a 77-character link gives version 5; a
      161-character link is refused with `link_too_long`; the same link gives the same matrix; a throwing
      encoder is a failure value. Fails.
    - _Requirements: 10.5, 10.6, 20.4_
  - [x] 11.6 Code: `adapters/qr-encoder.ts` (the only module that imports `uqr`; error correction level M, byte mode, an `encode` result turned into a `QrMatrix`)
    - Rerun the test against the real package; report the version it chose for the two links and that
      `size = 4 · version + 17` holds (this checks the capacities of §3.2; F19).
    - _Requirements: 10.5, 10.6_
  - [x] 11.7 Join the hostile list and the purity file list (including the rule that `uqr` is imported only in `adapters/qr-encoder.ts`).

- [x] 12. Checkpoint: the Adapters (does not stop)
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

- [x] 14. The Simulation shell, the four scenes and the reviewer's path (D16; §10)
  - [x] 14.1 Tests first: `math/scenes/smoke-scenes.test.ts`
    - Each of the four scenes (`two-posts`, `three-posts`, `four-posts-one-wrong`, `almost-in-line`) passes
      UI's `checkScene`; a Simulator is created for every Station (the script validates); **through `assess`,
      `four-posts-one-wrong` sets `southwest` aside as `outlier`, and the same 12° on `side` is not set
      aside**; the classes of the other three are the probe's (`poor`, `good`, `poor` with `poor_geometry`)
      with the semi-axes within 10 % of the probe's (765 m by 204 m; 262 m by 204 m; 8 635 m by 241 m).
      Fails.
    - _Requirements: 17.2, 17.8_
  - [x] 14.2 Code: `math/scenes/smoke-scenes.ts` (`smokeScenes()` through UI's `sceneFromOffsets` and `scriptForStation`, offsets of §10, the Target "Smoke column")
    - _Requirements: 17.2_
  - [x] 14.3 Tests first: `components/simulation/SimulationShell.test.tsx`, `simulated-phone.test.ts`
    - One phone for each Station with its own store, memory storage and transport endpoint; the Station the
      panel is on is the phone in hand and changing it changes the screens while the others keep their
      sightings; the Clock is the largest `nowUtcMs` any Session has reported, never decreasing; the Incident
      ids are made in `simulation` mode (first symbol `Z`); sending from the active phone delivers the code,
      as text only, to the others' Inboxes; no link, no QR, no system share; the banner on every screen.
      Fails.
    - _Requirements: 17.1, 17.4, 17.5_
  - [x] 14.4 Code: `components/simulation/SimulationShell.tsx`, `simulated-phone.ts`, and `main.tsx` (the composition root: the real Adapters, the tile source from the environment checked against the Host list, `createRoot`, the maplibre stylesheet imported once, the Simulation mode chosen by `hasDeviceOrientation`)
    - _Requirements: 11.4, 17.1, 17.5, 18.2_
  - [x] 14.5 The reviewer's integration test: `components/simulation/SimulationShell.integration.test.tsx`
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
  - [x] 14.6 The statistical test: `test-support/capture-from-script.ts` and P-17.9
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
  - [x] 14.7 The files of this group join the purity file list. Every scene, Station, code and Position is synthetic (the purity test scans `smoke-scenes.ts` for coordinates away from the origin's offsets).

- [x] 15. Checkpoint: the reviewer's path (stops for review)
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

- [x] 16. The privacy document and the README (D20; Req 11.6, O2)
  - [x] 16.1 Tests first: `math/privacy-table.test.ts` (the Markdown part)
    - `docs/privacy.md`'s Markdown table parses to the same nine rows as `PRIVACY_TABLE`, cell by cell; a
      changed cell in either fails. Fails (no document yet).
    - _Requirements: 15.3_
  - [x] 16.2 Write `docs/privacy.md` (repository root, judge-facing) and the README of the package
    - `docs/privacy.md`: the table of Req 15.3 and a paragraph for each row. `apps/vigia/README.md`: what it
      is, how to build, the two variables of `.env.example`, **two paragraphs on hosting** (which hosts the
      page contacts, the Host list's with the Tile source's; which headers the host should send:
      `Referrer-Policy: no-referrer` first, a short cache lifetime for `index.html`, no logging of the full
      request address beyond what is needed), that the page must be opened once with a connection (Open
      question U9), and that the QR and the link need the receiving phone to load the page. No
      `docs/hosting.md` and no Content-Security-Policy generator. Every claim of the privacy document is
      checked against the code by the test of 16.1 and the scans of task 1.6.
    - _Requirements: 10.7, 11.6, 15.3, 15.4_

- [x] 17. The wind Overlay (D15; §7.16; Req 13; the checkpoint after which the Overlays may be cut)
  - [x] 17.1 Tests first: `overlays/wind/math/wind-parse.test.ts`, `wind-words.test.ts`, `wind-features.test.ts`, P-13.6
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
  - [x] 17.2 Code: `overlays/wind/math/wind-parse.ts`, `wind-words.ts`, `wind-features.ts`
    - The two layers `wind` and `wind-head`; `fit` not set.
    - _Requirements: 13.2 to 13.6, 18.4_
  - [x] 17.3 Tests first: `overlays/wind/components/wind-controller.test.ts`, with a fixture `fetchLike` behind the real gate and the real Host list
    - Off at start and no request; `setEnabled(true)` makes one request and `refresh()` one more and nothing
      else does (a `FakeTimer` advanced for an hour makes none); a failure shows its Message and leaves the
      layers empty; `update(context)` recomputes the layers with no request; in Simulation mode the fixture is
      read and no key is needed. Fails.
    - _Requirements: 13.1, 13.7, 17.4_
  - [x] 17.4 Code: `overlays/wind/components/wind-controller.ts`, `wind-definition.ts`; the registry line in `overlays/index.ts`
    - The layers of the model plus the wind's are four of the eight `MAX_APP_LAYERS` allow (the test of 7.8
      now sums the real ids).
    - _Requirements: 1.10, 13.1, 13.7, 18.4_
  - [x] 17.5 Wiring and the cut
    - The Map screen shows the wind panel; the wind switch joins P-15.9's actions (no position in a request
      other than the one rounded point, no code anywhere); the integration test of 14.5 runs once more with
      the wind switched on (the fixture, no network). **The cut test:** the `no-overlays` project passes
      with the wind Overlay present and the registry replaced by the empty one.
    - _Requirements: 1.10, 13.1, 15.9, 17.4_

- [x] 18. Final checkpoint (stops for review)
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

- [x] 23. The first use on a phone (2026-11-21, after the lead's walk on his iPhone; Req 3.1, 3.3, 3.7, 3.10, 4.2, 4.3, 4.5, 4.8, 4.11, 4.12, 5.4, 6.2 to 6.4, 6.12, 7.2, 9.3, 9.4, 10.1, 10.6 to 10.8, 10.11, 10.12, 15.2, 15.7, 16.1, 16.2, 17.1, 21.8; design D23, D24, §9 note of 2026-11-21; skeleton-ui task group 34 and its D35, D36)
  - **Starts only after skeleton-ui group 34 has been reviewed.** The working rules of this file apply: tests first and **seen to fail** on the committed code, `timeout` in front of every test run, no `pkill`, no dev server, no watch mode, one run at a time, every full run's output in a file under `/tmp/vigia/` and named in the report, no commit, `notes/` not read, `requirements.md`, `design.md` and everything under `skeleton/` not edited by this group (if a criterion cannot be met as written, stop and report). **No new dependency.** Nothing in `math/incident`, `math/code`, `math/fix` or `math/assessment` changes except the constants of `math/texts.ts`; the words functions, the Emergency text, the store and the sighting code are untouched, and their tests pass unchanged.
  - The rule that organises this group (design D23): a step ends on the screen where the next step is the primary action, opened at its top. 23.9 tests that rule across the whole flow.
  - [x] 23.1 Baseline. Run `pnpm --filter @alidade/vigia test` once and keep the output; it is compared with at 23.11. List the tests that this group changes and, for each, whether it is a **requirement change** (its assertion is replaced because the criterion it checked is replaced, and the report says so) or a **layout move** (the same assertion, a different place). Expected requirement changes: `sight-first-screen.test.tsx` (23.2), the tests of the question after a capture (`ConfirmSmokeDialog`, `SightScreen.test.tsx`, `SimulationShell.integration.test.tsx` where it answers a question for a first capture: with no smoke open there is none, Req 4.2), `ShareSheet.test.tsx` (the first-Share/later-Shares difference, the three blocks), `InboxSheet.test.tsx` (the confirmation inside the card), `SmokeScreen.test.tsx` (the 287-word first screen).
  - [x] 23.2 `sight-first-screen.test.tsx`, **rewritten against Req 3.10, 21.8 and skeleton-ui 13.15, as a requirement change and not a narrowed test; the report says so.** The file targeted 844 CSS px, asserted that 375 × 667 does **not** fit and fixed `SMALLEST_HEIGHT_AT_375_PX = 810`: the first form's arithmetic for a flow layout. The new file (a) mounts the **device-mode** Sight screen (the fake camera surface and the Simulator as the Sensor source, as `SightScreen.test.tsx` does) and, from the styles the components set, sums the rows that do not flex (Back and its gap, the aiming row, the compact readout, the bar with its text part at the cap and its controls, the inset of `34`) plus the image's floor, in `permission`, `starting`, `live` with north needed and not needed, and `frozen`, and asserts that the sum fits **390 × 664 and 375 × 667**; (b) asserts the order of the children of the column (Back, the middle part, the bar last) and that the App's Sight route has no padding and no scroll; (c) keeps, for the reviewer's **Simulation-mode** Sight screen, which the amendment leaves in the flow layout, the two assertions that still describe it unchanged (the bar directly after the readout and the readout directly after the image; Freeze inside 844 at 390 wide), and **drops** the "does not fit 667" assertion and the 810 constant, with the reason in a comment: the requirement they measured is replaced. The fits test is expected to **fail first** (no docked screen yet) and to close at the end; if it does not close, stop and report (skeleton-ui 34.7).
    - _Requirements: 3.10, 21.8_
  - [x] 23.3 The two stacks in Vigia. Tests first, seen to fail on a rename that is not yet done in `look.ts` (the imports were changed by skeleton-ui 34.2 so that the repository stays green; here the **decisions** are tested): `screens-look.test.tsx` (text, buttons, titles in the body stack; `LOOK.readout`, the grouped text code, the position and the direction in the numeric stack; no size and no colour differs from the values typed into the test), `TabBar.test.tsx` (the arithmetic at `0.63 em` still fits 320). Code: `look.ts` and the components that set a font themselves. Design D24.
    - _Requirements: skeleton-ui 13.4_
  - [x] 23.4 The Sight route and the aiming line. Tests first, seen to fail: `SightScreen.test.tsx` (device mode: one child, `DeviceSighting` in the docked layout; its `top` is Back; its `aim` is the line "Aim at the base of the smoke" and a closed `details` "How to aim" that holds the four sentences of `sightingGuidance` (the wind sentence only when `windShown`) and is the same before and after a capture; no text "Tap the image" in device mode, and it stays in Simulation mode; "Try the simulator instead" appears in `extra` when no event arrived and the offer exists; Back leaves without saving), `App.test.tsx` (the Sight route's `main` has `padding: 0` and `overflow: hidden`, other routes as before; in Simulation mode the route is as before), `GuidanceBlock.test.tsx` or `common-parts.test.tsx` (the line and the disclosure; one row closed). Code: `SightScreen.tsx`, `GuidanceBlock.tsx`, `App.tsx`, `math/texts.ts` (`AIM_LINE_TEXT`; `sightingGuidance` unchanged).
    - _Requirements: 3.1, 3.3, 3.7, 3.10, 16.2, 17.1_
  - [x] 23.5 What a capture does. Tests first, seen to fail: with **no smoke open**, a capture adds the sighting to a new smoke with no question and the App shows the Smoke screen at its top (`scrollTop` 0) with "Sighting saved: 47.3° ± 1.8° (true)" directly after the not-calling statement and "Send this sighting" as the primary action (`data-primary="true"`, in the primary row, with "Sight the smoke" a secondary control in the scrolling part); the line and the action go when the route changes; "Send this sighting" opens the Share sheet for that sighting and sends nothing (a fake Transport and a fake Clipboard record nothing); with **a smoke open** the question is a view that has replaced the camera and the readout (no `DeviceSighting`, no "Take another" anywhere in the DOM), its two answers at least 48 px tall and the preselected one primary, the sentence about a second column, and the breakdown inside a closed `details` "Why this accuracy?" below the answers; the view opens at the top; a capture the store refuses (`incident_full`) shows its Message in the view with a control back to the Sight screen and adds nothing; in Simulation mode a first capture starts the smoke with no question (`SimulationShell.integration.test.tsx` and the reviewer's path test, whose steps change: a requirement change, said in the report). Code: `SightScreen.tsx`, `ConfirmSmokeDialog.tsx` (the first-capture branch is removed: with no smoke open it is never rendered; the "Start a new smoke with this sighting" text is deleted), `SmokeScreen.tsx` (`saved`), `PrimaryAction` use, `App.tsx` (the route's `saved` and `joined`), `math/texts.ts` (`savedLineText`, finite-checked).
    - _Requirements: 4.2, 4.3, 4.11, 10.12, 3.8, 9.3_
  - [x] 23.6 The Smoke screen's first view. Tests first, seen to fail: `SmokeScreen.test.tsx` and `FixWordsView` tests: with a Fix the first view holds, in order, the disagreement (when found), the headline with its 95 % radius, "Based on N sightings", the warnings that apply (the sentence of 5.4 for two and for three used; the warning and the sentence of 7.1 for `poor`; outliers set aside; the range warning of 5.8), one sentence on compasses, and "Show on map"; **everything else** is inside one closed `details` "Details and limits" (the semi-axes and the long axis; the number set aside and the ages; "from you" with its interval; the geometry sentence when not `poor`; the assumption and the limits note; the statement for four or more and the Incident's note; the advice); a test reads the DOM of the first view outside the disclosure and counts its words against **150** in the worst case (a disagreement, poor geometry and an outlier at once) and the same for a plain Fix; **a position never appears outside a sentence that holds its radius** (scan of the whole screen for a printed position, over the generated Fixes of P-6.8's generator, 200 cases); a disagreement and `poor` are never only inside the disclosure; with one used sighting and no Fix, the first view is as Req 6.12 says; "This phone's data and mode" is a closed `details` whose summary names the mode and that holds "Delete everything on this phone" (asking once, with its backup sentence), "What leaves this phone" and the mode control; "Show on map" opens the Map tab (`App.test.tsx`). Code: `SmokeScreen.tsx`, `FixWordsView.tsx`, `LimitsBlock.tsx`, `AdviceView.tsx`, `App.tsx` (`onShowMap`), `math/texts.ts` (the compass sentence, with the rest of `FIX_LIMITS_TEXT` unchanged).
    - _Requirements: 4.5, 5.4, 6.2, 6.3, 6.4, 6.12, 7.2, 16.1, 17.1_
  - [x] 23.7 The Share sheet. Tests first, seen to fail, `ShareSheet.test.tsx`: the order of Req 10.11 (title, the bearing line, the hidden mark when it applies, the statement, the two choices, "Other ways (no connection)", "What leaves this phone", Close); the statement is **always** visible, in every Share of a session, and names the position to about 1 m with how well the phone knew it, when, the direction with its uncertainty, which smoke, that whoever receives it sees this, and that it cannot be taken back; "What the code holds" is a closed `details` with the long text; the two choices are at least 64 px tall; **the link's address is in the DOM nowhere before the QR view or "Other ways"** (scan the text of the sheet), and the text code is only inside "Other ways"; "Send link" calls `shareLink` where `canShare` and `copyText` otherwise, says which it did, records `system_share` or `link` only on success, and treats the user closing the share sheet as no failure; "Show QR code" opens the QR view (the QR drawn, one line that it needs the other phone's connection to open the page, the link as text, Back to the sheet) and records `qr` once it is drawn; "Copy text" records `text`; a failure is beside its control; with `link_too_long` or a simulated smoke outside Simulation mode the two choices are replaced by the Message and "Other ways" is open; in Simulation mode the choices are "Send to <phone>" and there is no link, no QR and no system share; each view opens at the top; the privacy property P-15.9 (a code reaches the Clipboard and the Transport only after a Share or a Copy the sequence contains) and the privacy table's test pass unchanged. Code: `ShareSheet.tsx`, `QrImage.tsx` (the size from the rows' styles; the SVG already scales), `math/texts.ts` (the short labels and the compact statement, in P-2.6's hostile list; `LINK_PURPOSE_TEXT`, `QR_PURPOSE_TEXT` and `TEXT_PURPOSE_TEXT` become one short line each).
    - _Requirements: 9.3, 10.1, 10.6, 10.7, 10.8, 10.11, 10.12, 15.2, 15.5, 15.6, 17.4_
  - [x] 23.8 The Inbox. Tests first, seen to fail, `InboxSheet.test.tsx`: a compact card (the direction with its sigma in one line, then the age, the accuracy and which smoke, and **no observer's position**); one visible line "Anyone can make a code; a wrong one moves the position" and a closed `details` "Why check this?" that holds the whole text of Req 15.7 and the sentence on hiding or deleting one by one; the two answers of equal size and weight, neither preselected, beside Ignore; choosing "the same smoke" replaces the card by a confirmation view with at most two short sentences saying the three things of Req 4.8, and Join and Not now, each at least 48 px tall, nothing else; the same layout for opening as a new smoke; a successful Join, "Add" and "Open as new smoke" all call the App's `onJoined`-style callback (`onTaken(text)`): the Inbox closes and the Smoke screen opens at its top with a one-line confirmation, "Joined: N sightings", "Added: 1 sighting" or "New smoke opened: N sightings" (the lead's decision on U16; N the entries of the smoke); a refused join shows its Message in the confirmation view, with Not now, and changes nothing; with a card waiting the paste form is inside a closed "Paste a code", with none it is the first thing on the sheet; after a paste is read the new card is at the top. P-4.7 and P-4.10 and the store's tests pass unchanged. Code: `InboxSheet.tsx`, `App.tsx`, `math/texts.ts` (`joinedLineText`).
    - _Requirements: 4.8, 4.12, 9.4, 10.12, 15.7_
  - [x] 23.9 The next step is always on the screen (design D23, the lead's complaint "do I have to go back and tap the map?"). Test first, `flow-next-step.test.tsx`, in the simulated DOM, in device mode with fakes and in Simulation mode with two phones: walk the flow Smoke (nothing) → Sight → Start → north → Freeze → Capture → Smoke ("Sighting saved", primary "Send this sighting") → Share → "Show QR code" → Back → Close → Smoke; the other phone: Inbox → card → "the same smoke" → confirmation → Join → Smoke ("Joined: 2 sightings", "Show on map") → Map; and at **every step assert** that the screen has exactly one `data-primary="true"` control (or, in a view whose choices are of equal weight, none and two equal ones) and that it is the one that names the next step. The test fails when a screen after a Capture holds "Take another", when a sheet leaves a user on a form after a success, and when a step ends scrolled.
    - _Requirements: 4.11, 4.12, 10.12, 21.8_
  - [x] 23.10 Documents and lists. The new constants in `math/texts.ts` in the hostile list of P-2.6 and in `texts.test.ts` (no reason's code, `NaN`, `undefined`, `null` in any of them; none names an emergency number, Req 14.5; the not-calling statement unchanged, word for word); the new files in `purity.test.ts`; `coverage.md` (rows for each amended criterion and for 3.10, 4.11, 4.12, 6.12, 10.11, 10.12, 21.8); the README (the screens on a phone, in two paragraphs); design §5 (the changed files), §9 table rows pointing at the note of 2026-11-21.
  - [x] 23.11 Checkpoint (stops for review). `pnpm --filter @alidade/vigia test:deep` for its properties, then from the root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm --filter @alidade/vigia build` **once** (so that the reviewer can walk the built app; no dev server is started by this task). `pnpm --filter @alidade/nonius test` and `pnpm --filter @alidade/ui test` pass with the baseline's counts. Mutation checks, each expected to fail a named test, the source restored after and `git diff` of the file shown empty: the first capture asking its question again; "Take another" left on the question view; the confirmation inside the card again; the raw link printed in the sheet; the statement hidden after the first Share; a position printed in the first view without its radius; the disagreement moved under "Details and limits"; "Send this sighting" sending instead of opening the sheet; the route's padding put back. Report: the changed files; the baseline and final counts; every requirement change among the tests (23.1's list, confirmed); the arithmetic of 23.2 with its numbers; the output files; the readings of the requirements. **Stop for review.** Then the reviewer walks the built app at **390 × 664** and **375 × 667** with two phones (Device check V12) and the lead walks it on his iPhone (V11).

- [ ] 24. The Field look: the shell, Smoke, Sight and the question (2026-11-22, the lead's new look; Req 3.6, 3.7, 4.3, 7.4, 20.6, 22.1 to 22.9, 22.11 to 22.15; design D25; skeleton-ui task group 35 and its D37)
  - **Starts only after skeleton-ui group 35 has been reviewed.** The working rules of this file apply: tests first and seen to fail, `timeout` on every run, no `pkill`, no dev server, no watch mode, one run at a time, every full run's output under `/tmp/kt/` and named in the report, **no commit**, `notes/` not read, the lead's reference images (`design-ref/`) not copied anywhere, `requirements.md`, `design.md` and everything under `skeleton/` not edited by this group. **No dependency**: Vigia does not list `lucide-react` (Req 20.6). If a criterion cannot be met as written, stop and report.
  - What each screen shows and in what order does not change (design D23); this group changes how it is drawn. Every existing wording test stays green; the tests that this group changes are listed at 24.1 and each is a **layout move** (the same words, a different place) or a **requirement change** (Req 4.3's preselection, Req 3.6's rounding), said in the report.
  - [x] 24.1 Baseline and the theme in the app. (a) Run `pnpm --filter @alidade/vigia test` once. (b) Tests first, seen to fail: `theme-choice.test.tsx` (the app applies Field at start when the fake `matchMedia` says light and Field night when it says dark; a change of the fake's value switches the roles on the root while the app is open and with no reload; Simulation mode the same; no control to choose a theme; `watchColourScheme`'s stop is called when the page unmounts), `no-colour-literals.test.ts` (the scan of skeleton-ui Req 22.6 over `apps/vigia/src`, with the files of the art and the theme data as the only allowed ones), `look.test.ts` (`LOOK` and its new entries are roles: no literal; the stacks and sizes as today, typed in the test). Code: `main.tsx` (`applyTheme`, `watchColourScheme`), `look.ts` rewritten from roles (the old entries keep their names and gain `card`, `row`, `statusCard`, `badge`, `optionButton`, `iconTile`), `Disclosure` re-exported from the UI. Nonius's `main.tsx` is not this group's.
    - _Requirements: 22.3, 22.4, 20.6_
  - [x] 24.2 The art and the header. Tests first, seen to fail: `Header.test.tsx` (the full header: the mark, "Vigia", the tagline, at most `112` high by its styles; the compact header: the mark, a title, at most `64`; the illustration and the mark `aria-hidden`; the header's text on solid `header` or on the gradient whose ends are pairs of the test; the last ridge's fill is `bg`; the header is a row of the page: no `position` other than static, the page's first child; the Simulation banner and the phone-in-hand bar are under it), `Schematic.test.tsx` (two pins, the baseline marked `At least 1/3 of the distance`, the line of sight to the smoke, `role="img"` with the label of Req 22.12, the visible line under it, no number in it, every label the string of Req 22.15), `art-use.test.tsx` (every paint is a role in `style`). Code: `components/art/AppMark.tsx`, `Landscape.tsx`, `Header.tsx`, `Schematic.tsx`.
    - _Requirements: 22.2, 22.12, 22.15_
  - [x] 24.3 The tab bar and the shell. Tests first, seen to fail: `TabBar.test.tsx` rewritten (a cloud, a list, a map, a siren above the labels, each `aria-hidden`; the active tab in `tabActive` with a `4` px indicator at its top and `aria-selected`; the labels at `20` from a bar width of `360` and at `16` below it, by the width the observer gives; the arithmetic of the old test at `320` and `375` for both sizes; the Inbox badge under the Smoke label; the safe-area inset in the bottom padding), `App.test.tsx` (a header by route: full on Smoke, compact on Sightings, Map, Emergency, Share, the QR view, the Inbox, the confirmations and the privacy page, **none** on the docked Sight screen, whose first child is still its top row; the route's padding as in task 23). Code: `TabBar.tsx`, `App.tsx`, `SimulationBanner.tsx`, `PhoneInHandBar.tsx`.
    - _Requirements: 22.2, 22.5, 22.14_
  - [x] 24.4 The Smoke tab. Tests first, seen to fail: `SmokeScreen.first-view.test.tsx` and `SmokeScreen.test.tsx` keep every wording and order assertion (first view, words ≤ `150`, the position never without its radius, the disagreement and poor geometry in the first view) and gain: the danger card with a shield around the not-calling statement; the Fix card (position with radius, "Based on N sightings", "Show on map" with a map icon); the warning card (headline in `warnInk` bold `20`, the next step in `ink` `16`) for a failure's Message, a disagreement and the sentence for two or three; icon rows for the supporting facts; the "Where to sight from next" card with the schematic **wherever the sentence of Req 7.4 is shown**; the rows: "Add a sighting someone sent me" ends in a chevron-right, "Details and limits" and "This phone's data and mode" in a chevron-down that becomes a chevron-up when open; the primary action with its icon (`crosshair` for "Sight the smoke", `send` for "Send this sighting"); the count of words of the first view is re-run on the new elements. Code: `SmokeScreen.tsx`, `FixWordsView.tsx`, `AdviceView.tsx`, `LimitsBlock.tsx`, `PrimaryAction.tsx`, the new `components/cards/` (`IconRow`, `NavRow`, `FixCard`).
    - _Requirements: 22.6, 22.11, 22.12, 6.12, 7.4_
  - [x] 24.5 The Sight screen. Tests first, seen to fail: `SightScreen.test.tsx` (the aim row: the crosshair icon, the line, "How to aim" as a pill of `accent` on `infoTint` with its chevron; before Start only, the how-to card with the three steps, the tip card with the limits line and the camera-shaped placeholder with the landscape art (`idleImage`, skeleton-ui Req 22.15), in the middle part; once live, neither is in view and both are behind "How to aim" and "Details"; the camera's frame; the docked bar's north prompt as a warning card with its icon and "Set north from the compass" with a compass icon; "Capture" with a camera icon, "Back to live" with a video icon; "Other ways to set north" ends in a chevron-right; no text outside the words of today and Req 22.15), `sight-first-screen.test.tsx` (the budget at `390 × 664` and `375 × 667` with the cards, `648` and `649`; the Simulation-mode assertions as in task 23). Code: `SightScreen.tsx`, `GuidanceBlock.tsx`, `math/texts.ts` (the steps, the titles).
    - _Requirements: 22.8, 22.13, 3.7_
  - [x] 24.6 The question view and the one rule for sigma. Tests first, seen to fail (**requirement changes, said in the report**): `SightScreen.test.tsx` and `flow-next-step.test.tsx` (no `data-preselected`; the two answers of one style, each at least `64`, one tap each, with icons; the age of the open smoke no longer changes the view; the compact header with `New sighting`; the Bearing card with `Bearing` and `Uncertainty (1-sigma)`, each labelled, the sigma by `directionText`'s rounding; "Why this accuracy?" with a chevron; Back), `question-sigma.test.tsx` (the same capture gives the same sigma in the saved line and in the question's card, over generated sigmas: `±2.1°` for `2.04°`, never the nearest tenth). Code: `ConfirmSmokeDialog.tsx`, `SightScreen.tsx`, the summary's `sigmaText`, `math/fix/format.ts` if the rule needs one function.
    - _Requirements: 22.9, 4.3, 3.6_
  - [x] 24.7 Strings, lists, documents. The new strings of Req 22.15 in `math/texts.ts`, `texts.test.ts` (word for word) and the hostile list of P-2.6; the new files in `purity.test.ts`; `coverage.md` (3.6, 3.7, 4.3, 7.4, 20.6, 22.1 to 22.15); the README (two sentences); design §5.
  - [ ] 24.8 Checkpoint (stops for review). The deep run is **not** run unless a property changed (the new hostile entries are properties: run `pnpm --filter @alidade/vigia test:deep` once if 24.7 added one). From the root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm --filter @alidade/vigia build` once, so that the lead can walk the built app. `pnpm --filter @alidade/nonius test` and `@alidade/ui test` pass with the baseline's counts. Mutation checks, each failing a named test: a status card whose headline is the bright bar colour; a header taller than `112`; a header on the docked Sight screen; a chevron-right on a disclosure; a preselected answer; the nearest-tenth sigma in the question's card; a colour literal planted in `look.ts`; the theme not switching on the fake `matchMedia`; the tab labels at `20` below `360`. Report: the changed files, the counts, every requirement change among the tests, the arithmetic of the budget, the output files. **Stop for review.** Then Device checks 12 and 13 (the pixels in light and dark, and Codex's comparison) on the built app at `390 × 664` and `375 × 667`, and the lead's iPhone (V14).

- [ ] 25. The Field look: the other screens (2026-11-22; Req 22.10, 22.11, 22.14; design D25; after task group 24)
  - **Starts only after task group 24 has been reviewed.** The rules of task group 24 apply.
  - [x] 25.1 The Sightings tab. Tests first, seen to fail: `SightingsScreen.test.tsx` and `SightingRow` tests keep every wording assertion and gain: one card for each Sighting with a tinted head row, its icon and its title (`Sighting 1, this phone`); the bearing at `32` in the numeric stack with its ± (`331.9° ± 2.3°`) and **no icon beside it**, then its North word `true` after the `navigation` icon on the line under it; the bearing on one line at `375` by the `0.63 em` bound (`262` of `311`); icon rows for the accuracy and for the time and age; the badge `Used` (success tone, its icon and its word) or the set-aside cause (warning tone); the share state in `inkDim`; the action row `Hide` or `Show`, `Share`, `Delete` in the danger fill, each at least `48`; the confirmation of Delete as a danger card; the statement by count as a warning card above; "Add a sighting someone sent me" ends in a chevron-right; the conflict view as two cards.
    - _Requirements: 22.7, 22.11_
  - [x] 25.2 Share and the QR view. Tests first, seen to fail: `ShareSheet.test.tsx` keeps its structure and wording assertions and gains: the compact header with the title; the statement as an **info card** with an icon, visible before the choices (Req 15.2, 9.3); the two choices as large option cards (`64`) with `qr` and `link` icons, of one style; "Other ways (no connection)" in place with its chevron; the hidden mark as a warning card; the QR view on a white `qrLight` card with the `qrDark` modules, its one line, the link under it, and the compact header titled `QR code`; the simulation variant's choices as option cards.
    - _Requirements: 22.10, 22.11, 10.11, 15.2_
  - [x] 25.3 The Inbox, the confirmations, "Other ways". Tests first, seen to fail: `InboxSheet.test.tsx` keeps its assertions (the compact card, the one warning line and "Why check this?", equal answers, the confirmation as a view of its own, the line after a join) and gains: cards with icons; the two answers as option buttons of one style with their icons; the confirmation as a warning card with Join and Not now; "Paste a code" in place with a chevron; the info card of the disclosure before a code leaves the phone wherever it is shown; the compact header; the line after a join, an add or a new smoke as an info card on the Smoke tab.
    - _Requirements: 22.10, 22.11, 4.8, 15.7_
  - [x] 25.4 Map overlay, Emergency, Privacy, the reviewer's path and the dialogs. Tests first, seen to fail: `MapScreen.test.tsx` (the map at full width, its attribution intact and readable on the map's own pair, the legend and the Overlay panel as cards, the compact header), `EmergencyScreen.test.tsx` (the danger card of Req 14.5 first; the text to read aloud in a large card at the size of Req 14.4, selectable, whole, with its time; Copy as the docked primary with its icon; the switch as a row), `PrivacyPage.test.tsx` (a card for each channel and the info card), `ReviewerPath` and `DeleteAllDialog` tests (cards; the danger confirmation), `SimulationBanner` and the phone-in-hand bar in Field and Field night. Every `FailureNotice` of the app is a status card.
    - _Requirements: 22.10, 22.11, 14.4, 14.5, 15.3, 17.4_
  - [x] 25.5 Strings, lists, documents. Any string that a screen of this group needed and Req 22.15 does not list is **not added**: stop and ask. The new files in the purity list; `coverage.md`; the README; design §5.
  - [ ] 25.6 Checkpoint (stops for review). From the root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm --filter @alidade/vigia build` once; Nonius and UI counts as in group 24. The scans of Req 22.6 and of the icons pass over the whole of Vigia. Mutation checks: a badge that carries its tone by colour alone (no icon, no word); an icon-only button; a danger text in the bright bar's colour; the QR card in the theme's `card` colour; Emergency's text not selectable; the map's attribution hidden by a card; each fails a named test. Report as for group 24, and list every screen against Device checks 12 to 14 (the lead's walk, Codex's comparison). **Stop for review.**

---

_Note of the lead, 2026-11-21._ The ticks of 1.2, 1.7, the mutation checks of 6.3, 7.9, 8.3 and 10.5, and the checkpoints 4, 9, 12, 15 and 18 were set by the lead from the reports of the build sessions, which ran them and which leave no trace in the repository: throwaway smoke tests deleted after they ran, mutations reverted after they failed their tests, deep runs kept outside the repository. Each checkpoint ends in a commit whose message names its task groups. Task 5.1's examples of the Incident state live in `apply-action.test.ts` and `incident-state.property.test.ts`; no separate `incident-state.test.ts` was written.

- [x] 26. The lead's iPhone, first look at the preview (2026-11-23; Req 22.1, 22.2, 22.3, 22.8, 22.14 as amended; design D25.11; skeleton-ui task 36). Written by Claude Code while Kiro's account could not be paid.
  - [x] 26.1 Field always. Tests first, seen to fail: `theme-choice.test.tsx` rewritten (Field's roles on the root; the entry applies it before the first render; no source of the app reads `prefers-color-scheme`, calls `watchColourScheme` or names `fieldNight`; no control to choose a theme). Code: `theme-choice.ts`, `main.tsx`, the comments of `look.ts`.
  - [x] 26.2 Back beside Start. Tests: `sight-first-screen.test.tsx` (the column is the middle part and the bar, whose row is Back then Start; the budget counted with Back in the bar), `App.test.tsx` (no header on the Sight route; Back its first control). Code: `SightScreen.tsx` (`back` in place of the top row).

- [x] 27. Mira, the lead's design, on every screen (2026-11-27; Req 14.5, 16.2, 22.16; design D26; skeleton-ui task group 37). Written by Claude Code from the lead's design.
  - [x] 27.1 The shell, the Smoke tab and the Sight screen. Tests: `theme-choice.test.tsx` (Mira, its fonts and shapes on the root), `art/Header.test.tsx` (the mark, "Vigia" and the pill, which opens the Emergency tab and names no number), `TabBar.test.tsx` (the floating pill; the labels at `11` fit a quarter of the bar at `320`), `App.test.tsx` (the header by route), `SmokeScreen*.test.tsx` (the home's title, dial and state; the saved bearing's dial; the panels kept in the page; the not-calling statement at the foot), `SightScreen*.test.tsx` and `sight-first-screen.test.tsx` (before Start the title and the steps; the dial; the fit at `390 × 664`, `375 × 667` and `390 × 844` in every state), `art/Schematic.test.tsx`, `art/art-use.test.tsx`, `look.test.ts`.
    - _Requirements: 22.16 (a) to (d), 16.2, 14.5_
  - [x] 27.2 The other screens. Tests: `mira-screens.look.test.tsx` (Sightings, Share, the QR view, Emergency, the delete dialog, the privacy page), `ShareSheet.test.tsx` (Mira's order), `PrivacyPage.test.tsx`, `SightingsScreen.test.tsx`, `screens-look.test.tsx` (Mira's least sizes; layers only over a picture), `flow-next-step.test.tsx`, `purity.test.ts` (the two font packages, the new files), `hostile-totality.property.test.ts` (`smokeStateCaption`). Tests: Vigia 2986, 3 skipped.
    - _Requirements: 22.16 (e) to (h), 1.1, 1.7, 11.1_
  - [x] 27.3 A laptop and the Simulator (2026-11-28; Req 22.17; design D26.9). Tests: `simulation/sight-mira.test.tsx` (the App's column of `480`; the Simulator's Sight screen as the dial, its landscape with the smoke's plume, the numeral, the bezel's north). Code: `App.tsx`, `index.html`.
    - _Requirements: 22.17_
  - [x] 27.4 The next step after one sighting (2026-11-28; Req 22.18, 4.11 as amended, 4.12; design D26.10). Tests: `SmokeScreen.first-view.test.tsx` (the two cards before the advice, the yellow one primary, no fixed row, no outline "Sight the smoke"; the same on a later visit with "Sighting 1 · " and its age; the line after a Send under the cards; unchanged with a position), `flow-next-step.test.tsx` (the flow with the two steps, the line after Close, the steps kept after a tab). Code: `SmokeScreen.tsx`, `App.tsx`, `cards/parts.tsx`, `ShareSheet.tsx`, `math/texts.ts`, the Simulator driver.
    - _Requirements: 22.18, 4.11, 4.12_
  - [x] 27.5 The UX review's small fixes and the step line (2026-11-28; Req 22.19, 4.3, 22.18; design D26.11). Written by Claude Code. Tests: `ux-1128.test.tsx` (the four steps and Done; the waiting card first and yellow, opening the Inbox; the siren, no pill on Emergency, Sight the smoke there; "Sent it?" only after a share; "Not saved yet" and Discard; the judge's path from post to post by the cards, Send as the yellow card when every phone has sighted, Go to the phone, the add, Show on map); `SimulationShell.test.tsx` (no question for a capture already given, with ticks); `App.test.tsx` and `SmokeScreen.first-view.test.tsx` (Show on map the primary action with a position, Sight the smoke secondary); `SightScreen.test.tsx` (Discard); the hostile registry's `reviewerStep`; the shell driver opens the Sight screen by the Simulator's card.
    - _Requirements: 22.19, 4.3, 22.18_
