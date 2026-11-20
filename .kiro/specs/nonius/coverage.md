# Requirement coverage — nonius

Generated at the final checkpoint (task 12) by the rule of Vigia's file: a criterion is listed against
every test file that cites it (`Req N.M`, lists, ranges and a whole requirement `Req N`) or names a
property of design §11 whose row lists it (`P-N.M`). File names are relative to `apps/nonius/src`,
without `.test`. The criteria that no test cites by number are listed with what covers them, read by
hand; one is marked **partial**. Requirement 10.3 to 10.6 (the best time, task group 11) is cut from
this release by the lead's decision of 2026-11-21: those criteria and P-10.6 are not built.

Every FOR ALL criterion of this release has its property in design §11 and a test: P-2.6, P-3.6,
P-3.7, P-4.11, P-4.12, P-5.8, P-5.9, P-5.10, P-6.9, P-6.10, P-7.3, P-7.7, P-7.9, P-8.5, P-8.6, P-9.8,
P-9.9, P-10.2, P-10.7, P-11.6, P-12.7, P-15.8 (22 properties). Each names itself and its requirements
in a comment above it and runs at least 200 cases in `pnpm test` (P-7.3, P-8.5 and P-8.6 run 200 runs
a band there and 2 000 in `test:deep`, where their bounds are applied).

| Criterion | Covered by |
|---|---|
| 1.1 | purity |
| 1.2 | purity |
| 1.3 | adapters/storage, purity |
| 1.4 | components/ask-location, purity |
| 1.5 | defaults, purity |
| 1.6 | purity |
| 1.7 | purity |
| 1.8 | purity |
| 1.9 | purity |
| 1.10 | purity |
| 1.11 | *not cited:* hostile-totality.property (the registry and its completeness test), every `*.property.test`, `vitest.config.ts` (the three projects: Math and Adapters in Node, Components in a simulated DOM), `pnpm test` runs once and exits |
| 2.1 | hostile-totality.property, math/sun/sun-wrapper-library-failure |
| 2.2 | reasons |
| 2.3 | math/messages |
| 2.4 | math/messages |
| 2.5 | *not cited:* components/FixScreen, components/SightsScreen, components/SightScreen, components/MapScreen and components/store (each failure is shown through `FailureNotice`, or is the cause of a set-aside Sight, or the value an Adapter returns) |
| 2.6 | hostile-totality.property, math/fix/altitude-model, math/fix/map-model, math/sight/prepare, test-support/fast-check-setup |
| 2.7 | *not cited:* math/fix/altitude-model (the source and its results are searched for `diverging_bearings` and `colocated_observers`) |
| 3.1 | math/sun/sun-wrapper, purity |
| 3.2 | math/sun/sun-wrapper, math/sun/sun-wrapper-library-failure |
| 3.3 | *not cited:* purity (no clock, no network, no `Date` in the Math layer) |
| 3.4 | math/sun/sun-fixture |
| 3.5 | math/sun/sun-at, math/sun/sun-wrapper |
| 3.6 | math/sun/sun-wrapper.property |
| 3.7 | math/sun/sun-wrapper.property |
| 3.8 | *measured at the final checkpoint, not tested:* the library adds 47.6 kB minified and 21.3 kB with gzip to the built page (design §2: 48.8 kB and 21.5 kB) |
| 4.1 | components/SightScreen |
| 4.2 | components/SightScreen |
| 4.3 | components/SightScreen |
| 4.4 | components/SightScreen, math/sight/prepare |
| 4.5 | components/SightScreen, math/sight/prepare, math/sight/sight |
| 4.6 | components/SightScreen, math/sight/sun-side |
| 4.7 | components/HowItWorks, components/SightScreen, math/sun/refraction, readme |
| 4.8 | components/SightScreen, math/sight/index-error.property, math/sight/prepare, math/sight/sight |
| 4.9 | components/SightScreen, components/SightsScreen |
| 4.10 | math/sun/refraction, math/sun/sun-fixture |
| 4.11 | math/sun/refraction.property |
| 4.12 | math/sight/sight.property |
| 5.1 | **partial:** no test; `git diff` of `skeleton/core` against the commit before the first Nonius commit is empty (checked by hand at the final checkpoint), and math/fix/altitude-model implements Core's `MeasurementModel` interface (a type check) |
| 5.2 | math/fix/altitude-model, math/fix/altitude-model.property |
| 5.3 | math/fix/altitude-model |
| 5.4 | *not cited:* math/fix/altitude-model, math/fix/solve-candidate (the check solve weighs by the full sigma, the Fix solve by the Independent one), P-8.5 in math/fix/coverage.property |
| 5.5 | math/fix/altitude-model |
| 5.6 | math/fix/altitude-model |
| 5.7 | math/fix/altitude-model |
| 5.8 | math/fix/altitude-model.property |
| 5.9 | math/fix/altitude-model.property |
| 5.10 | math/fix/assess.property, math/fix/recentred-solve.property, math/sight/index-error.property |
| 5.11 | math/fix/altitude-model |
| 6.1 | math/fix/assess |
| 6.2 | math/fix/assess, math/fix/candidates, math/sphere/circle-crossings |
| 6.3 | math/fix/assess |
| 6.4 | math/fix/assess |
| 6.5 | components/SightScreen, math/fix/assess, math/fix/fix-words, math/fix/sun-side-check, math/sight/sun-side |
| 6.6 | math/fix/assess, math/fix/fix-words |
| 6.7 | components/FixScreen, math/fix/assess, math/fix/fix-words |
| 6.8 | math/fix/assess, math/fix/fix-words |
| 6.9 | math/fix/assess, math/fix/assess.property, math/fix/candidates, math/sphere/circle-crossings |
| 6.10 | math/fix/assess, math/fix/assess.property |
| 6.11 | math/fix/assess |
| 7.1 | math/fix/solve-candidate |
| 7.2 | math/fix/shared-error, math/fix/solve-candidate |
| 7.3 | math/fix/advice.property, math/fix/coverage.property, math/fix/fix-words.property, math/fix/solve-candidate.property |
| 7.4 | components/store |
| 7.5 | *not cited:* math/fix/solve-candidate, math/fix/assess, math/messages (`fix_too_uncertain` above `MAX_FIX_SEMI_MAJOR_95_M`, its Message) |
| 7.6 | *not cited:* math/fix/assess, math/messages, components/FixScreen (each solve failure, in words about sights) |
| 7.7 | math/fix/solve-candidate.property |
| 7.8 | math/fix/recentred-solve, math/fix/shared-error.property |
| 7.9 | math/fix/shared-error.property |
| 8.1 | components/FixScreen, math/fix/assess, math/fix/fix-words, math/fix/statements |
| 8.2 | components/FixScreen, components/simulation/SimulationShell.integration, math/fix/assess, math/fix/fix-words, math/fix/statements |
| 8.3 | components/FixScreen, math/fix/assess, math/fix/fix-words, math/fix/statements |
| 8.4 | components/FixScreen, components/SightsScreen, math/fix/assess, math/fix/fix-words |
| 8.5 | components/FixScreen, math/fix/assess, math/fix/coverage.property, math/fix/fix-words |
| 8.6 | components/FixScreen, math/fix/assess, math/fix/coverage.property, math/fix/fix-words |
| 9.1 | components/FixScreen, math/fix/fix-words, math/fix/format |
| 9.2 | components/FixScreen, components/HowItWorks, math/fix/fix-words, readme |
| 9.3 | components/FixScreen, components/simulation/SimulationShell.integration, math/fix/fix-words, math/fix/format |
| 9.4 | components/MapScreen, math/fix/map-model, math/sphere/circle-arc |
| 9.5 | components/MapScreen, math/fix/map-model |
| 9.6 | components/MapScreen, math/tile-setup, purity |
| 9.7 | components/FixScreen, math/fix/fix-words |
| 9.8 | math/fix/fix-words.property |
| 9.9 | math/sphere/circle-arc, math/sphere/circle-arc.property |
| 10.1 | components/FixScreen, math/fix/geometry-class |
| 10.2 | build-output, components/FixScreen, math/fix/advice, math/fix/advice.property |
| 10.3 | *cut from this release (the lead's decision of 2026-11-21): not built, no test*; P-10.6 is not written |
| 10.4 | *cut from this release (the lead's decision of 2026-11-21): not built, no test*; P-10.6 is not written |
| 10.5 | *cut from this release (the lead's decision of 2026-11-21): not built, no test*; P-10.6 is not written |
| 10.6 | *cut from this release (the lead's decision of 2026-11-21): not built, no test*; P-10.6 is not written |
| 10.7 | components/FixScreen, math/fix/advice, math/fix/advice.property |
| 11.1 | components/FixScreen |
| 11.2 | components/FixScreen, components/ask-location, purity |
| 11.3 | components/FixScreen, math/fix/comparison, math/fix/comparison-words, math/fix/format |
| 11.4 | build-output, components/FixScreen, components/MapScreen, components/store, math/fix/map-model |
| 11.5 | components/simulation/SimulationShell, components/simulation/SimulationShell.integration |
| 11.6 | math/fix/comparison, math/fix/comparison.property |
| 12.1 | adapters/storage, components/store, math/state/apply-action, math/state/storage-format, purity |
| 12.2 | components/HowItWorks, components/store, math/state/apply-action, math/state/storage-format |
| 12.3 | components/SightsScreen, components/store, math/state/apply-action |
| 12.4 | components/SightsScreen, components/store, math/state/apply-action |
| 12.5 | components/store, math/state/apply-action |
| 12.6 | adapters/storage, components/store, math/state/storage-format |
| 12.7 | components/store, math/state/state.property |
| 13.1 | components/Root, components/simulation/SimulationShell, purity |
| 13.2 | math/scenes/sun-scenes |
| 13.3 | components/simulation/SimulationShell, components/simulation/SimulationShell.integration, math/scenes/sun-scenes |
| 13.4 | components/simulation/SimulationShell.integration |
| 13.5 | components/simulation/SimulationShell.integration |
| 13.6 | components/simulation/SimulationShell.integration |
| 13.7 | math/scenes/sun-scenes |
| 13.8 | readme |
| 14.1 | defaults, math/parameters |
| 14.2 | purity |
| 14.3 | hostile-totality.property, math/parameters |
| 15.1 | components/IndexErrorScreen, readme |
| 15.2 | components/IndexErrorScreen, components/ask-location, purity, readme |
| 15.3 | components/IndexErrorScreen, math/sight/calibration-difference, math/sight/index-error, math/sight/index-error.property, readme |
| 15.4 | components/IndexErrorScreen, math/sight/index-error, math/sight/index-error.property, readme |
| 15.5 | components/IndexErrorScreen, components/SightsScreen, components/store, math/state/apply-action, readme |
| 15.6 | components/SightsScreen, math/fix/format, readme |
| 15.7 | components/simulation/SimulationShell, components/simulation/SimulationShell.integration, readme |
| 15.8 | math/sight/index-error.property, readme |
| 15.9 | components/IndexErrorScreen, readme |
