# Implementation Plan: sighting-core

Package: `skeleton/core` (`@alidade/core`). Source of truth: `requirements.md` and
`design.md` in this folder. Section and decision references (`D5`, `§7.5`) point into
`design.md`.

## Working rules for every task

- Follow `.kiro/steering/math-conventions.md`: radians internally, unit suffix on every
  numeric name, azimuth `[0, 2π)`, angle differences through `wrapPi`, spherical Earth of
  radius `6 371 008.8 m`.
- Follow `tech.md`: TypeScript `strict`, ES modules, pnpm only, exact dependency versions
  (no `^` or `~`), no `any`, no `!` in `skeleton/core`, no watch mode, no dev server.
- Follow `testing.md`. Every property test: at least 200 cases, a comment above it naming
  the property and the requirements it validates, generator domains documented, tolerances
  taken from `requirements.md`, angles compared with `wrapPi(a - b)`.
- If a property test fails, decide whether the code, the property or the requirement is
  wrong and say which. Do not weaken a tolerance, narrow a generator or delete an
  assertion to get a pass. If the cause is the requirement or the design, stop and report.
  When a property finds a real bug, add the shrunk counterexample as an example test
  before fixing the code.
- A property excludes a degenerate case through its generator only if that case also has
  an example test of its own.
- In every noise-free solver property (P-7.4 through P-7.8, P-8.4 through P-8.7, P-9.7) a
  `solve` that returns a failure is a test failure. Those properties never discard sets.
  Only the noisy variant of P-7.5 may discard unsolved sets, and it documents and counts
  them.
- Every exported function is total (D17, Req 9.8): for any type-correct input it returns
  a failure `Result` or finite numbers, and never throws.
- Tests sit next to the code: `foo.test.ts` for examples, `foo.property.test.ts` for
  properties.
- Every task ends with `pnpm --filter @alidade/core test` and `pnpm typecheck` passing for
  the code it touched.

## Tasks

- [x] 1. Scaffold the workspace and the core package
  - [x] 1.1 Create the root workspace
    - Add `pnpm-workspace.yaml` (`skeleton/*`, `apps/*`), a root `package.json` with the
      scripts `test`, `typecheck` and `lint` from `tech.md`, a base strict `tsconfig`,
      ESLint (`no-explicit-any` and `no-non-null-assertion` as errors, applied to source and test
      files under `skeleton/core`, so `pnpm lint` is what enforces both rules)
      and Prettier. Leave the existing `probe/` project outside the workspace.
    - Pin every dependency to an exact version.
    - _Requirements: 11.5_
  - [x] 1.2 Create `skeleton/core` (`@alidade/core`)
    - `package.json` with an empty `dependencies` object (dev dependencies: Vitest,
      `fast-check`, TypeScript), a package `tsconfig`, a Vitest config that runs once and
      excludes `src/test-support` from coverage of public API, and an empty `src/index.ts`.
    - Set the `fast-check` default to at least 200 runs per property in one shared place.
    - _Requirements: 11.1, 11.3, 11.5_
  - [x] 1.3 Add test support: seeded random source
    - `src/test-support/seeded-random.ts`: a small seeded PRNG that takes a seed argument
      and offers uniform and Gaussian draws. It is test code; `core` sources never import
      it.
    - Example test: the same seed gives the same sequence; different seeds differ; the
      Gaussian draws over a large fixed-seed sample have mean and standard deviation near
      0 and 1.
    - _Requirements: 8.8, 11.2_

- [x] 2. Result type and closed reason set
  - [x] 2.1 Implement `src/result.ts`
    - `Result<T>` with `ok`, `reason`, optional `field` and `id`; the `Reason` union with
      exactly the twelve members of §5; the `Warning` union (`poor_geometry`,
      `outliers_excluded`); small helpers to build success and failure values.
    - Export the types from `src/index.ts`, with the closed sets documented in a comment.
    - _Requirements: 11.4, 9.9_

- [x] 3. Angle primitives
  - [x] 3.1 Implement `src/angle.ts`
    - `wrapTwoPi`, `wrapPi`, `angularDifference`, `degToRad`, `radToDeg`, `circularMean`,
      each returning a `Result` and failing with `invalid_number` on `NaN` or `±Infinity`
      (D1). Private unchecked helpers for internal use. `circularMean` fails with
      `undefined_mean` when the mean resultant length is below `1e-9`.
    - _Requirements: 1.1, 1.3, 1.5, 1.6, 1.8, 1.9_
  - [x] 3.2 Example tests in `src/angle.test.ts`
    - Wrap boundaries (`0`, `2π`, `-π`, `π`, large multiples); `invalid_number` for each
      public function with `NaN`, `+Infinity` and `-Infinity`; `undefined_mean` for
      opposite angles and for an empty-resultant set; the mean of a set that straddles
      `0` and `2π` (for example `350°` and `10°` gives `0°`, not `180°`).
    - _Requirements: 1.1, 1.6, 1.8, 1.9_
  - [x] 3.3 Generators for angles
    - In `src/test-support/generators.ts`: `finiteAngle` (`[-1e6, 1e6]` rad),
      `clusteredAngles` (non-empty, within `π/4` of a centre drawn from `[0, 2π)`), and
      `azimuth` (`[0, 2π)`), each with its domain and exclusions documented.
    - _Requirements: 1.2, 1.4, 1.5, 1.7_
  - [x] 3.4 Property P-1.2: wrapping is periodic
    - `wrapTwoPi(x + 2πk)` equals `wrapTwoPi(x)` within `1e-9` rad as a wrapped
      difference, for `|x| ≤ 1e6` and integers `|k| ≤ 1000`.
    - _Requirements: 1.2_
  - [x] 3.5 Property P-1.4: angular difference is antisymmetric
    - `angularDifference(a, b)` is the negative of `angularDifference(b, a)` within
      `1e-9` rad, except within `1e-9` rad of `π`. Add an example test for the excluded
      neighbourhood of `π`.
    - _Requirements: 1.4_
  - [x] 3.6 Property P-1.5: degree/radian round trip
    - Converting to the other unit and back returns `x` within relative `1e-12` (with a
      stated absolute floor near zero), for `|x| ≤ 1e6`, in both directions.
    - _Requirements: 1.5_
  - [x] 3.7 Property P-1.7: circular mean is rotation-equivariant
    - For lists within `π/4` of a common direction, rotating every angle by `r` rotates
      the circular mean by `r` within `1e-9` rad.
    - _Requirements: 1.7_

- [x] 4. Checkpoint: angle primitives
  - Run `pnpm --filter @alidade/core test`, `pnpm typecheck` and `pnpm lint`. Report any
    failing property with the code / property / requirement classification before going on.

- [x] 5. Spherical Earth primitives
  - [x] 5.1 Implement `src/position.ts`
    - `Position`, `isSupportedPosition` (finite, `|latRad| ≤ 89°`, `lonRad ∈ (-π, π]`),
      `wrapToLonRange`, `greatCircleDistanceM` (haversine), `initialAzimuthRad`,
      `destinationPosition`. `unsupported_position` for any unsupported input;
      `coincident_positions` when two positions are under `1e-3 m` apart. The destination
      latitude is computed with `atan2`, which needs no clamping (design §7.1); the distance
      uses `atan2(|cross|, dot)`.
    - _Requirements: 2.1, 2.2, 2.3, 2.8, 2.9, 2.10_
  - [x] 5.2 Generator for positions
    - Add `supportedPosition` (`latRad` within `±89°`, `lonRad ∈ (-π, π]`; excludes
      positions within 1° of a pole) to `generators.ts`.
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 3.3, 3.5_
  - [x] 5.3 Example tests in `src/position.test.ts`
    - Published or hand-derivable values: one degree of latitude along a meridian is
      `R·π/180`; a quarter of the equator is `R·π/2`; known azimuths (due east along the
      equator is `π/2`). Destination crossing `±180°` returns a longitude in `(-π, π]`
      (Req 2.8). `coincident_positions` for positions `< 1e-3 m` apart (Req 2.9).
      `unsupported_position` for a pole-adjacent position (just beyond `89°`), a `NaN`
      coordinate and a longitude outside `(-π, π]` (Req 2.10). Distance from a position to
      itself is zero. Cover the pole-adjacent and antimeridian destinations that
      P-2.4 and P-2.5 exclude through their generators.
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.8, 2.9, 2.10_
  - [x] 5.4 Property P-2.4: destination distance round trip
    - For Supported `A`, azimuth `θ`, `d ∈ [10 m, 10 000 km]` whose destination `B` is
      Supported: the distance from `A` to `B` equals `d` within `1e-4 m`.
    - _Requirements: 2.4_
  - [x] 5.5 Property P-2.5: destination azimuth round trip
    - For `d ∈ [100 m, 10 000 km]` with Supported `B`: the initial azimuth from `A` to `B`
      equals `θ` within `1e-9` rad as a wrapped difference.
    - _Requirements: 2.5_
  - [x] 5.6 Property P-2.6: distance is symmetric and zero on identity
    - Symmetric within `1e-6 m`; zero when both arguments are equal.
    - _Requirements: 2.6_
  - [x] 5.7 Property P-2.7: triangle inequality
    - `d(A, C) ≤ d(A, B) + d(B, C) + 1e-3 m` for Supported `A`, `B`, `C`.
    - _Requirements: 2.7_

- [x] 6. Local plane projection
  - [x] 6.1 Implement `src/local-plane.ts`
    - `projectToLocalPlane` (azimuthal equidistant: `east = d·sin θ`, `north = d·cos θ`;
      `(0, 0)` for positions within `1e-9 m` of the origin, constant `LOCAL_PLANE_COLLAPSE_M`,
      separate from `COINCIDENT_DISTANCE_M`; between `1e-9 m` and `1e-3 m` it uses the
      internal unchecked azimuth and does not fail with `coincident_positions`) and
      `unprojectToLocalPlane` (returns the origin for vectors shorter than `1e-9 m`; otherwise
      `destinationPosition`). Unsupported input gives `unsupported_position`; the unproject
      result is checked to be Supported (D15). The `1e-3 m` threshold of D15 is unchanged;
      D16 now reuses `LOCAL_PLANE_COLLAPSE_M`.
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 6.2 Example tests in `src/local-plane.test.ts`
    - Origin and a position `1e-10 m` away both project to `(0, 0)` (Req 3.4); positions
      `1e-6 m` and `5e-4 m` away do not fail, round-trip within `1e-4 m` and have a vector
      length within `1e-6 m` of the distance; the P-3.5 counterexample is kept as an example;
      a vector shorter than `1e-9 m` unprojects to the origin and one of `2e-9 m` does not; a
      point `1 km` due east of an equatorial origin projects to `(1000, ~0)`; due north to
      `(~0, 1000)`; unprojecting a vector whose result is beyond `89°` gives
      `unsupported_position`.
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 6.3 Property P-3.3: projection round trip
    - For Supported origin and position within `1000 km`, with the distance from the origin
      drawn log-uniformly from `1e-10 m` to `1000 km`: project then unproject returns a
      position within `1e-4 m` of the original.
    - _Requirements: 3.3_
  - [x] 6.4 Property P-3.5: projection preserves distance from the origin
    - The Euclidean length of the projected vector equals the great-circle distance within
      `1e-6 m`, for positions within `1000 km`, with the same log-uniform distance draw.
    - _Requirements: 3.5_

- [x] 7. Bearing observation and wire format
  - [x] 7.1 Implement `src/observation.ts`
    - `Bearing` type; `validateBearing` (checks in the order of §7.3; the failure carries
      the observation `id` and the offending `field`); `serialiseBearing` (`v: 1`,
      `kind: "bearing"`, `Deg` suffixes, `timeUtcMs`; returns a `Result` and validates first,
      D17); `parseBearing` (not an object or a
      missing field gives `invalid_observation` naming the field; unknown `v` or `kind`
      gives `unsupported_format`; then the same validation). No path throws.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 9.9_
  - [x] 7.2 Example tests in `src/observation.test.ts`
    - Each validation rule violated one at a time (empty id, non-finite number, observer
      beyond `89°`, azimuth outside `[0, 2π)`, sigma below `0.01°` and above `45°`,
      accuracy negative and above `10 000 m`), asserting reason, field and id. Exact wire
      shape of a known bearing. `unsupported_format` for unknown `v` and unknown `kind`;
      `invalid_observation` for a non-object (`null`, a string, an array) and for each
      missing field, with no throw. `serialiseBearing` returns `invalid_observation` naming
      the field for a bearing with a `NaN` azimuth (D17).
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 9.9_
  - [x] 7.3 Generator and property P-4.6: wire round trip
    - Add `validBearing` to `generators.ts` (non-empty id, Supported observer, accuracy in
      `[0, 10 000]`, finite `timeUtcMs`, azimuth in `[0, 2π)`, sigma in `[0.01°, 45°]`).
      Serialise then parse succeeds; angles equal within `1e-12` rad; every other field is
      identical.
    - _Requirements: 4.6_

- [x] 8. Checkpoint: foundations
  - Run `pnpm --filter @alidade/core test`, `pnpm typecheck` and `pnpm lint`. Report any
    failing property with the code / property / requirement classification.

- [x] 9. Measurement-model interface and uncertainty
  - [x] 9.1 Define the types in `src/measurement-model.ts`
    - `MeasurementModel<O>` (`validate`, `idOf`, `origin`, `startEstimate`,
      `geometryCheck`, `evaluate` returning a `Result`, `postSolveCheck(fix, origin,
      observations)`), `Fix`, `Ellipse`, `CovarianceEnM2`, `ObservationResidual`, and
      `SolverOptions` with both fields optional. The file imports nothing bearing-specific.
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 7.2, 7.9, 8.1, 8.2, 10.4_
  - [x] 9.2 Implement `src/ellipse.ts`
    - The shared symmetric 2×2 eigenvalue helper (`h = hypot((a − c)/2, b)`,
      `λ1 = (a + c)/2 + h`, `λ2 = det/λ1`), `ellipseFromCovariance` (circular within
      rounding when `h ≤ 1e-12·λ1`, azimuth `0`; otherwise major-axis azimuth in
      `[0, π)`), and `ellipse95` (axes times `2.4477`). Both return a `Result`:
      `invalid_number` for non-finite input, for a covariance that is not positive definite
      (not both `λ1 > 0` and `λ2 > 0`) and for an axis that is not positive (D17).
    - _Requirements: 8.2, 8.3_
  - [x] 9.3 Example tests in `src/ellipse.test.ts`
    - Diagonal covariance (major axis due north and due east cases); a covariance rotated
      by a known angle; a circular covariance gives azimuth `0`; a covariance whose
      discriminant would go negative by rounding still gives real axes; the azimuth is
      always in `[0, π)`; `ellipse95` multiplies both axes by `2.4477` and leaves the
      azimuth unchanged; the helper's `λ2 > 0` and `λ1 > 0` for positive-definite input
      and its result for a singular matrix. Totality (D17): `ellipseFromCovariance` returns
      `invalid_number` for a `NaN` or infinite entry, an indefinite matrix, a zero matrix
      and a negative diagonal; `ellipse95` returns `invalid_number` for a `NaN` axis and for
      a zero or negative axis.
    - _Requirements: 8.2, 8.3_

- [x] 10. Bearing measurement model
  - [x] 10.1 Implement `validate`, `idOf`, `origin`, `startEstimate`, `geometryCheck`
        and `postSolveCheck` in `src/bearing-model.ts`
    - `origin` is the 3D spherical centroid (D2). `startEstimate` intersects the pair with
      the largest crossing angle, ties broken by id pair (D4). `geometryCheck` returns
      `colocated_observers` before `singular_geometry` (D5), the `poor_geometry` warning
      in `[0.5°, 20°)`, and nothing otherwise. `postSolveCheck` returns
      `diverging_bearings` for `|residualRad| > π/2` and `out_of_range` for a fix more
      than `500 km` from the origin passed in (D7). Totality (D17): `origin`,
      `startEstimate`, `geometryCheck` and `postSolveCheck` return
      `insufficient_observations` for fewer than two observations, checked first;
      `startEstimate` returns `singular_geometry` when the largest crossing angle is below
      `0.5°` (no intersection is attempted); `origin` returns `unsupported_position` when
      the centroid is not a Supported position.
    - _Requirements: 5.5, 5.7, 6.4, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8_
  - [x] 10.2 Implement `evaluate` in `src/bearing-model.ts`
    - Returns a `Result` (D15): `unsupported_position` when the candidate does not
      unproject to a Supported position, `coincident_positions` when it is within `1e-3 m`
      of the observer. Predicted azimuth, residual `wrapPi(measured − predicted)`, effective
      sigma `sqrt(σ² + (σM/rangeM)²)` with `rangeM` floored at `1 m`, and the analytic
      partials by the chain rule of §7.4, with the tangent-plane limit only when the
      candidate is within `LOCAL_PLANE_COLLAPSE_M` (`1e-9 m`) of the origin (D16).
    - _Requirements: 6.1, 6.2, 6.3, 6.7_
  - [x] 10.3 Example tests in `src/bearing-model.test.ts`
    - Residual wrap: measured `0.01`, predicted `2π − 0.01`, residual `0.02` within
      `1e-12` (Req 6.7). Effective sigma on a worked example, including the `1 m` range
      floor. Centroid of observers that straddle `±180°` is on the meridian side, not
      `0°`. `startEstimate` on a known triangle. `geometryCheck` at the boundaries
      (`0.49°`, `0.5°`, `19.9°`, `20°`) and `colocated_observers` taking precedence over
      `singular_geometry`. `postSolveCheck` for `diverging_bearings` and `out_of_range`,
      measured from the origin argument. `evaluate` failures: `unsupported_position` and
      `coincident_positions` propagate unchanged. Partials at the origin: target at the
      centroid of three observers `5 km` away and `120°` apart match central differences
      (D16). Near the 89° limit: a candidate that unprojects plainly beyond it gives
      `unsupported_position` from `evaluate`, never a NaN, and a `1 m` finite-difference
      step that crosses it fails the same way. Regressions: the `0.86 mm` D16 case and the
      stress case of a target `57 m` inside the limit with the observer `50.6 m` due east
      (fails with an `asin` latitude).
      Totality (D17), calling the methods directly: each of `origin`,
      `startEstimate`, `geometryCheck` and `postSolveCheck` returns
      `insufficient_observations` for an empty array and for a one-element array;
      `startEstimate` returns `singular_geometry` for parallel bearings and for a
      `0.4°` crossing, and succeeds at `0.5°`; `origin` returns `unsupported_position` for
      observers whose centroid is within 1° of a pole.
    - _Requirements: 6.2, 6.3, 6.4, 6.7, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8_
  - [x] 10.4 Generators for observer/target geometry
    - In `generators.ts`: `bearingGeometry`, an observer and a target `50 m–200 km` apart, the
      target at least `10 m` inside the 89° limit (with a weighted draw just inside that
      margin), and an origin at the target, within `1e-9`–`1e-3 m` of it, or farther.
      Documents its exclusions.
    - _Requirements: 6.5, 6.6_
  - [x] 10.5 Property P-6.5: partials match finite differences
    - Analytic partials agree with central finite differences of the predicted azimuth
      (step `1 m`) within relative `1e-2` or absolute `1e-10` rad/m, for observer and
      candidate `50 m–200 km` apart, the candidate at least `10 m` inside the 89° limit,
      including candidates at the origin.
    - _Requirements: 6.5_
  - [x] 10.6 Property P-6.6: noise-free residual is zero at the truth
    - A bearing generated from the true target with no noise has `|residualRad| < 1e-9`
      at the target, for observer and target `50 m–200 km` apart, the target at least `10 m`
      inside the 89° limit.
    - _Requirements: 6.6_

- [x] 11. Checkpoint: bearing model
  - Run `pnpm --filter @alidade/core test`, `pnpm typecheck` and `pnpm lint`. Report any
    failing property with the code / property / requirement classification.

- [x] 12. Fix solver
  - [x] 12.1 Add the stub model for generic-behaviour tests
    - `src/test-support/stub-model.ts`: a configurable `MeasurementModel` whose
      `evaluate`, `geometryCheck` and `startEstimate` can be scripted (fail beyond a
      distance, fail everywhere, return a `NaN` normal matrix, count calls). It is used to
      prove the solver depends only on the interface.
    - _Requirements: 5.4, 5.6_
  - [x] 12.2 Implement the pre-solve steps of `src/solver.ts` (§7.5 steps 0–5)
    - Options (defaults; `maxIterations` must be an integer in `[1, 50]`, otherwise
      `invalid_number` with field `maxIterations`); canonicalise by `model.idOf` and reject
      duplicate ids; `model.validate` on every observation; fewer than two gives
      `insufficient_observations`; `geometryCheck` before `origin` and `startEstimate`.
      The file imports nothing bearing-specific.
    - _Requirements: 5.4, 5.7, 7.2, 9.1, 9.9, 9.10_
  - [x] 12.3 Implement the solve loop (§7.5 step 6)
    - Weighted Gauss-Newton on the Local plane with sigmas re-evaluated each iteration; the
      eigenvalue gate written as "unless `λ1 > 0` and `λ2 > 0`, `singular_geometry`", then
      `λ1/λ2 > 1e12`; step control with up to 8 halvings against the cost at this
      iteration's sigmas; evaluation failure handling of D15 (current candidate: return;
      trial point: count as a cost increase; smallest step still failing: return);
      convergence below `1e-4 m`; `not_converged` at `maxIterations`. A successful `evaluate`
      result with a non-finite number or an effective sigma not greater than zero gives
      `invalid_number` (D17).
    - _Requirements: 7.1, 7.2, 7.3, 7.8_
  - [x] 12.4 Implement fix assembly and the post-solve check (§7.5 steps 8–11)
    - Post-exclusion `geometryCheck` taking the `poor_geometry` warning (D5);
      covariance as the inverse of `JᵀWJ` evaluated on the Fix's own Local plane at its
      centre, so in East and North at the Fix (D19, Req 8.1), the same eigenvalue gate as
      step 6, the ellipse, per-observation residuals and
      normalised residuals, `iterations`, `warnings` and `excludedIds`; then
      `postSolveCheck(fix, origin, remaining)` with the assembled `Fix`. `ellipseFromCovariance`
      returns a `Result`; return its failure if it fails. Check that every number in the
      assembled `Fix` is finite, otherwise return `invalid_number` (D17).
    - _Requirements: 7.9, 8.1, 8.2, 9.4, 9.5, 9.6, 9.11, 10.3_
  - [x] 12.5 Implement outlier rejection (§7.5 step 7)
    - Enabled only by option and with four or more observations; exclude the largest
      `|normalised residual|` above `3.5` (ties by id), re-solve with a warm start, stop
      when none exceeds `3.5` or three remain; add `outliers_excluded`; evaluate the final
      candidate before computing residuals and return an evaluation failure if there is one.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_
  - [x] 12.6 Add solver generators
    - In `generators.ts`, built by construction where possible: `solvableSet` with only the
      conditions of Req 7.4 (target latitude within `75°`; 2–12 observers `500 m–100 km` from
      the target; one pair crossing at `≥ 10°`, the only filter, 2.1 % discarded; cross-track
      1-sigmas within a factor `1e3`, by construction; noise-free; unique ids). It never calls
      `solve` and does not filter on solver success. Also `noisySolvableSet` (the only
      generator whose properties may discard unsolved sets), `meridianSet` (observers on both
      sides of `±180°`, 73.4 % discarded by that filter), `solvableSetWithExtra` (Req 8.6),
      `solvableSetWithScale` (Req 8.4), and `outlierSet` (Req 10.5: latitude within `88°`,
      8–12 observers `5–7 km` away with no gap over `60°`, by construction, sigma `2°`, one
      bad observation off by `15°–45°`). Document each domain and exclusion.
    - _Requirements: 7.4, 7.5, 7.6, 7.7, 8.4, 8.5, 8.6, 8.7, 9.7, 10.5_
  - [x] 12.7 Example tests for each solver failure and warning in `src/solver.test.ts`
    - `insufficient_observations`; `invalid_observation` naming id and field;
      `invalid_observation` with field `id` for duplicates (Req 9.10); `invalid_number`
      with field `maxIterations` for `NaN`, `±Infinity`, `0`, a negative, a fraction and
      `51`; `not_converged` using a low `maxIterations`; `singular_geometry` from parallel
      bearings, with the counting stub proving `startEstimate` is not called (step 4);
      `colocated_observers`; `diverging_bearings`; `out_of_range`; `poor_geometry`
      including the exclusion cases of Req 9.11 (poor before, good after, and the
      converse; with BearingModel only "good before, poor after" can occur, because removing
      observations cannot raise the largest crossing angle, so "poor before, good after" is
      shown with the stub model); `outliers_excluded`; outlier rejection disabled excludes
      nothing; the
      D15 cases (two observers `A` and `B` on the same meridian, `B` sighting `A` at azimuth `0`
      and `A` sighting `45°`: the origin lies on that meridian, so the plane intersection
      lands on `A` within `1e-3 m` and `solve` gives `coincident_positions`; observers near
      `88.5°` give `unsupported_position`; a trial point that fails is halved and the solve
      succeeds; a model that fails at every trial point returns its failure); the D14 gate
      (a stub with finite, parallel partials gives `singular_geometry`; so does a stub whose
      finite partials of `1e200` overflow `JᵀWJ` to `NaN` eigenvalues); the D17 guard (a
      stub returning a `NaN` residual, an infinite partial or an effective sigma of `0`
      gives `invalid_number`); the three-observer
      centroid case (target at the origin) returns a Fix within `0.01 m`.
    - _Requirements: 7.2, 7.3, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 9.9, 9.10, 9.11, 10.4, 10.6_
  - [x] 12.8 Property P-7.4: noise-free recovery
    - For `solvableSet`, `solve` succeeds and the Fix is within `0.01 m` of the true
      target. A solve failure is a test failure. If this property finds a set that meets
      the Req 7.4 conditions and the solver cannot solve, stop and report the shrunk set;
      do not narrow the generator and do not add a filter.
    - _Requirements: 7.4_
  - [x] 12.9 Property P-7.5: order independence
    - Two random orderings of the same set give Fixes less than `1e-3 m` apart. On the
      noise-free `solvableSet` a solve failure is a test failure. On `noisySolvableSet` the
      property may discard sets the solver does not solve; its comment says so, and the
      test counts the discards and also asserts that both orderings give the same outcome.
    - _Requirements: 7.5_
  - [x] 12.10 Property P-7.6: local optimality
    - With each effective sigma held at its value at the Fix, the cost at the Fix does not
      exceed the cost at any point `1 m` away to the east, west, north or south.
    - _Requirements: 7.6_
  - [x] 12.11 Property P-7.7: copies under new ids leave the Fix unchanged
    - Adding a copy of every observation under a fresh unique id moves the Fix by less than
      `1e-3 m`.
    - _Requirements: 7.7_
  - [x] 12.12 Property P-7.8: determinism
    - Two calls with identical input return deeply equal results, including `iterations`,
      `warnings` and `excludedIds`.
    - _Requirements: 7.8_
  - [x] 12.13 Property P-8.4: uncertainty scales with the input sigmas
    - Multiplying every azimuth sigma and position accuracy by `k ∈ [0.5, 4]`, restricted to
      the factors for which every scaled observation is still valid (`solvableSetWithScale`),
      leaves the Fix unchanged within `1e-3 m` and multiplies both ellipse axes by `k` within
      relative `1e-5`.
    - _Requirements: 8.4_
  - [x] 12.14 Property P-8.5: copies under new ids shrink the ellipse by √2
    - Adding a copy of every observation under a fresh unique id divides both ellipse axes
      by `√2` within relative `1e-5`.
    - _Requirements: 8.5_
  - [x] 12.15 Property P-8.6: an extra noise-free observation does not grow the covariance
    - For sets satisfying Req 7.4, adding one more noise-free observation of the same
      target that keeps those conditions (`solvableSetWithExtra`) does not raise the
      covariance determinant by more than a relative `1e-9`.
    - Resolved by design D19 (covariance in East and North at the Fix, Req 8.1 as amended):
      the determinant no longer depends on where the centroid falls.
    - _Requirements: 8.6_
  - [x] 12.16 Property P-8.7: covariance is symmetric positive definite
    - Symmetric within `1e-12`; both eigenvalues greater than zero, for every successful
      Fix.
    - _Requirements: 8.7_
  - [x] 12.17 Property P-9.7: the ±180° meridian does not matter
    - For `meridianSet`, the Fix equals the Fix of the same configuration shifted `90°` in
      longitude and shifted back, within `0.01 m`.
    - _Requirements: 9.7_
  - [x] 12.18 Property P-10.5: one wrong observation is excluded
    - For `outlierSet` (Req 10.5 as amended: latitude within `88°`, no gap over `60°`, error
      `15°–45°`), with outlier rejection enabled, the Fix is within `1 m` of the target and
      `excludedIds` is exactly the wrong observation's id.
    - _Requirements: 10.5_

- [ ] 13. Statistical and performance tests
  - [x] 13.1 Calibration test in `src/calibration.test.ts`
    - 1000 trials from a fixed seed passed as an argument: 3 observers `1–20 km` from the
      target, pairwise crossing angles `≥ 30°`, exact observer positions, Gaussian azimuth
      noise `2°` (1-sigma). A failed solve counts as not contained. The 95% ellipse
      contains the target in at least 90% and at most 99% of trials. Run the same test
      twice to show it is deterministic.
    - _Requirements: 8.8, 8.3_
  - [ ] 13.2 Performance test in `src/performance.test.ts`
    - Solve 200 valid bearings on a well-conditioned target and assert a wall-clock time
      under `50 ms` (the clock is read by the test only, never by `core`). Warm up once
      before timing.
    - DECISION NEEDED: implemented exactly as written, and the solver meets the bound in steady
      state (median about 11 ms here, about 3 ms on the reference laptop), but on this shared
      machine (load average about 4.6 on 8 cores) the single timed solve sometimes stalls to
      70 to 143 ms, so the test fails in about 1 run in 5. The first solve in a fresh process
      takes 54 to 69 ms. See the task 16 report.
    - _Requirements: 7.10_

- [x] 14. Hostile input
  - [x] 14.1 Add the `hostileInput` generator
    - In `generators.ts`: malformed and non-finite observations, out-of-range sigmas,
      non-object wire payloads, empty and duplicate ids, hostile `SolverOptions`
      (`maxIterations` as `NaN`, `±Infinity`, `0`, negative, fractional, above `50`),
      observation arrays of length `0` and `1`, sets whose bearings are all parallel,
      covariances that are non-finite or not positive definite, ellipses with non-finite or
      non-positive axes, and observation sets on which `evaluate` fails (observers near the
      latitude limit with bearings crossing beyond `89°`; two observers on the same
      meridian where one sights the other).
    - _Requirements: 9.8_
  - [x] 14.2 Property P-9.8: no throw, no NaN, no infinity
    - Feed `hostileInput` to every exported function and to each `BearingModel` method
      called directly (`origin`, `startEstimate`, `geometryCheck`, `postSolveCheck`,
      `evaluate`, `validate`, `idOf`), plus `ellipseFromCovariance` and `ellipse95`: none
      throws, and every call returns a failure or a success whose numbers are all finite.
    - _Requirements: 9.8, 1.9_

- [x] 15. Packaging and purity
  - [x] 15.1 Finalise `src/index.ts`
    - Export the public API only: the angle, position and local-plane functions, `Bearing`
      with `validateBearing`, `serialiseBearing`, `parseBearing`, `BearingModel`, `solve`,
      `ellipseFromCovariance`, `ellipse95`, and the types (`Result`, `Reason`, `Warning`,
      `Fix`, `Ellipse`, `SolverOptions`, `MeasurementModel`, ...). Nothing from
      `test-support`.
    - _Requirements: 11.3, 11.4_
  - [x] 15.2 Purity test in `src/purity.test.ts`
    - Scan every non-test source file under `src/` (excluding `test-support`): no clock
      (`Date`, `performance`), no randomness (`Math.random`, `crypto`), no I/O or
      environment (`fs`, `process`, `fetch`, `window`, `document`, `globalThis` access to
      them), and no import from outside `skeleton/core`. Also assert `package.json` has no
      runtime dependencies. Include a negative check that the scanner flags a deliberately
      bad sample string, so the test cannot pass by matching nothing.
    - `any` and `!` are not scanned here; the ESLint rules from task 1.1 enforce them. Run
      `pnpm lint` in this task and confirm it passes on `skeleton/core`.
    - _Requirements: 11.1, 11.2, 11.5_
  - [x] 15.3 Dependency-direction check
    - Verify that `solver.ts` and `measurement-model.ts` import nothing from
      `bearing-model.ts` or `observation.ts`, as part of the purity test.
    - _Requirements: 5.4, 5.6, 5.7_

- [x] 16. Final checkpoint
  - Run `pnpm test`, `pnpm typecheck` and `pnpm lint` from the repo root. Confirm that
    every property P-1.2 through P-10.5 and P-9.8 in `design.md` §8 has a test, that each
    names the property and its requirements in a comment, and that each runs at least 200
    cases. Report the result and stop for review.
