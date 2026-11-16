# Design Document — `sighting-core`

## 1. Context and scope

`sighting-core` is `skeleton/core` (package `@alidade/core`): the pure-math heart of the
Alidade skeleton. It turns sightings into a position fix with an honest uncertainty
estimate. This design implements the approved `requirements.md` as written; it does not
restate or alter the requirements.

The package covers, in this order of dependency:

1. Angle primitives and unit conversion.
2. Spherical-Earth geodesy on a sphere of radius `6 371 008.8 m`.
3. The azimuthal equidistant Local plane (metres).
4. The Bearing observation type, its validation and its versioned JSON wire format.
5. A generic Measurement-model interface.
6. The bearing Measurement model (Vigia's need).
7. A fix solver that is generic over the model interface.
8. Uncertainty: covariance and error ellipse.
9. Degenerate/hostile-input handling and outlier rejection.
10. Purity and packaging.

The celestial **altitude** model (Nonius) is a later spec. The Measurement-model interface
(Section 6) and the solver (Section 7) are designed so that model plugs in without
touching the solver source (Req 5.4, 5.6).

This design writes no code and creates no tasks.

## 2. Conventions adherence

All of `.kiro/steering/math-conventions.md` is binding and is reflected throughout:

- Internal math is radians. Degrees exist only in the wire format (Section 4) and at the
  UI boundary, never inside `core`. `degToRad`/`radToDeg` are the single conversion points.
- Every numeric name carries its unit suffix: `latRad`, `lonRad`, `azimuthRad`,
  `rangeM`, `timeUtcMs`, `sigmaRad`, `positionAccuracyM`, `eastM`, `northM`,
  `varEastM2`, `varNorthM2`, `covEastNorthM2`, `semiMajorM`, `semiMinorM`. Variance of a
  length is square metres (`M2`).
- Azimuth is clockwise from true north in `[0, 2π)`. The difference of two angles is always
  `wrapPi(a - b)`, never a raw subtraction. The mean of angles is the circular mean.
- Positions are objects `{ latRad, lonRad }`, never arrays. Latitude `[-π/2, π/2]`,
  longitude `(-π, π]`. A **Supported position** (requirements glossary) has finite
  coordinates, `|latRad| ≤ 89°` (i.e. `|latRad| ≤ 89π/180`) and `lonRad ∈ (-π, π]`.
  Positions within 1° of a pole are unsupported and rejected.
- Earth is a sphere of radius `6 371 008.8 m`. No ellipsoidal formulas.
- Local frame is East-North-Up, metres, tangent at a stated origin. For azimuth `θ` and
  distance `d`: `eastM = d · sin θ`, `northM = d · cos θ`.
- `asin`/`acos` arguments are clamped to `[-1, 1]` only when the excess is rounding error
  (`< 1e-12`); a larger excess is a bug and surfaces as a failure.
- No `NaN` or `Infinity` leaves a public function. Floating-point values are never compared
  with `===`; angles are compared with `wrapPi(a - b)` and the spec's tolerances.

## 3. Design decisions

The requirements, read with the steering files, force or strongly favour the choices
below. Each is recorded here for review; none contradicts a requirement.

- **D1 — Angle functions return `Result` on invalid input.** `wrapTwoPi`, `wrapPi`,
  `angularDifference`, `circularMean`, `degToRad`, `radToDeg` are public (Req 1.1, 1.3,
  1.5, 1.6). Per Req 1.9 and the math-conventions rule "No `NaN` or `Infinity` may leave a
  public function. Invalid input produces an error result", each returns
  `Result<number, Reason>` and yields `invalid_number` for `NaN`/`±Infinity` instead of
  propagating `NaN`. Composition inside the package uses private unchecked helpers
  (`_wrapTwoPi`, `_wrapPi`) that assume finite input; the public functions validate then
  delegate. This keeps callers honest without making internal trig chain `Result`s.

- **D2 — Observer centroid is the 3D spherical centroid.** Req 6.4 says "centroid of the
  observer positions" without a formula. Req 9.7 requires that a configuration straddling
  the ±180° meridian gives the same fix as the same configuration shifted 90° in longitude.
  An arithmetic mean of longitude is not shift-invariant across the meridian
  (`(+179° + -179°)/2 = 0°`, not `180°`). The 3D centroid — mean of the unit vectors
  `(cos·cos, cos·sin, sin)`, renormalised, converted back to `{latRad, lonRad}` — is
  invariant under any rotation about the polar axis, so it shifts by exactly 90° when every
  observer shifts by 90°. It is the only choice that satisfies 9.7, so it is used.

- **D3 — The solver canonicalises observations by `id`.** As its first step the solver
  collects each observation's `id` via the model (D13), rejects duplicate `id`s (Req 9.10),
  then sorts the array by `id` (lexicographic, stable). This single rule makes the solver
  exactly deterministic (Req 7.8) and exactly order-independent (Req 7.5) — reordering the
  input yields the same canonical array, hence the same floating-point computation, not
  merely a close one. It also makes outlier tie-breaking stable. Duplicate `id`s are a hard
  failure, not a precondition: a report submitted twice must not be counted twice, so the
  solver returns `invalid_observation` naming the field `id` (the duplicated value). For
  determinism the duplicate reported is the lexicographically smallest duplicated `id`. The
  property-test generators use unique `id`s, and where a property copies observations it
  gives each copy a fresh unique `id` (P-7.7, P-8.5).

- **D4 — Outlier selection and all multi-observation reductions are order-independent.**
  The excluded observation is the one with the largest `|normalised residual|`; ties are
  broken by `id` (not by input index), so reordering cannot change which observation is
  excluded. The centroid (D2) is a commutative sum; the crossing-angle pair selection ties
  break on the `id`-pair; the pre- and post-solve checks iterate over a canonical
  `id`-sorted set. Combined with D3 this makes 7.5 hold for every solvable set, not just
  generic ones.

- **D5 — Geometry check order and re-run.** The model's `geometryCheck` is run twice
  (Req 9.2, 9.3, 9.11). Before solving it is run on the full set and only its **failures**
  are acted on: `colocated_observers` (all observers within 1 m, Req 9.2) is checked before
  `singular_geometry` (largest crossing angle below 0.5°, Req 9.3) — when every observer is
  colocated the bearings carry no position information, so `colocated_observers` is the
  more specific failure and is reported first. The `poor_geometry` **warning** is not taken
  from this pre-solve run. After outlier exclusion the check is run again on the observations
  that remain (Req 9.11); its result then determines the warning (and re-confirms the
  remaining set is not singular). When no observation is excluded, the remaining set is the
  full set, so the warning comes from the same geometry.

- **D6 — The solver rejects invalid observations, never drops them.** Req 9.9 settles
  the open question: the solver validates every observation (via the model, D13) and, on the
  first invalid one, returns `invalid_observation` naming both the observation `id` and the
  offending `field`. It does not silently drop data, so an emergency tool never hides a bad
  sighting. The solver never throws and never returns `NaN` for type-correct input
  (Req 9.8); an invalid observation is a `Result` failure, never a throw.

- **D7 — Post-solve checks live in the model, not the solver, and take the origin.**
  `diverging_bearings` (Req 9.5, "behind any observer") is bearing-specific, and
  `out_of_range` (Req 9.6, fix more than 500 km from the **solve origin**) depends on the
  model's notion of range. Both are returned by the bearing model's `postSolveCheck`
  (Req 5.3), which the solver calls with the Local-plane origin it already computed via
  `model.origin` — it does not recompute the origin. The origin used for `out_of_range` is
  therefore exactly the origin the fix was solved in. Both checks live in the model so the
  solver contains no bearing-specific logic (Req 5.4); a future altitude model supplies its
  own `postSolveCheck`.

- **D8 — Bearing partial derivatives are analytic.** The model returns analytic partials
  of the predicted azimuth with respect to `eastM`/`northM`, derived by the chain rule
  through the unproject (destination) and the spherical initial-azimuth formula (Section 7).
  Property P-6.5 verifies them against central finite differences (step `0.1 m`) of the
  predicted value, so the test is independent of the implementation — it would catch a
  wrong derivative, not confirm a copied one.

- **D9 — Effective-sigma range floor and iteration.** `rangeM` is the great-circle
  distance from observer to the current candidate, floored at `1 m` (Req 6.3). Effective
  sigma is re-evaluated every iteration (Req 7.1) because `rangeM` moves with the candidate.

- **D10 — `iterations` reports the final solve; `maxIterations` is optional and bounded.**
  With outlier rejection the solver runs several solves; `iterations` is the iteration
  count of the final converged solve that produced the returned fix (step-control halvings
  count as part of the iteration they occur in). `SolverOptions.maxIterations` is optional
  (default `50`); if supplied it must be an integer in `[1, 50]`, since Req 7.2 caps a
  solve at 50 iterations, so the option can only lower the limit. Any other value
  (`NaN`, `±Infinity`, `0`, negative, fractional, or above `50`) makes `solve` return
  `invalid_number` with `field: "maxIterations"` (Req 1.9 applied to options). Lowering it
  is how `not_converged` is reproduced deterministically in tests.

- **D11 — Closed sets are unions.** `Reason` (failures) and `Warning` are string-literal
  unions documented in the public API (Req 11.4). `Reason` has exactly the twelve members
  listed in Section 5; `Warning` has exactly `poor_geometry` and `outliers_excluded`.

- **D12 — Ellipse is 1-sigma; 95% is a helper; circular ellipses point north.** The fix
  carries the 1-sigma ellipse (`semiMajorM ≥ semiMinorM > 0`, `azimuthRad ∈ [0, π)`).
  `ellipse95` multiplies both axes by `2.4477` (`sqrt(5.991)`, chi-square 2 d.o.f.) per
  Req 8.3 and the uncertainty convention. Eigenvalues use the numerically stable
  `h = hypot((a − c)/2, b)`, `λ1 = (a + c)/2 + h`, `λ2 = det/λ1` helper (Section 7.6),
  shared with the solver's `JᵀWJ` check. The ellipse is **circular within rounding** when
  `h ≤ 1e-12 · λ1`; the major-axis eigenvector is then undefined, so the azimuth is `0`
  rather than an arbitrary `atan2` result.

- **D13 — The model validates and identifies observations; the solver never imports
  `Bearing`.** `MeasurementModel` exposes `validate(observation): Result<void>` and
  `idOf(observation): string` (Req 5.7). The solver canonicalises by `model.idOf`, rejects
  duplicates and invalid observations through `model.validate`, and otherwise treats
  observations as opaque `O`. It does not call `validateBearing` or reference the `Bearing`
  type (Req 5.4, 5.7); `BearingModel.validate` delegates to `validateBearing` and
  `BearingModel.idOf` returns `b.id`. A `Result` failure from `validate` carries the
  observation `id` and the offending `field` (Req 9.9).

- **D14 — The solve loop backtracks and treats a non-PD normal matrix as singular.**
  Each iteration computes the effective sigmas at the current candidate and the cost `C0`
  with those sigmas. The Gauss-Newton step `Δ` is accepted only if the cost at
  `candidate + Δ` (evaluated with the **same** current-iteration sigmas) does not exceed
  `C0`; otherwise the step is halved, up to 8 times, and the first non-increasing step is
  taken (if none decreases the cost, the smallest is taken). This guards overshoot in the
  nonlinear regime and is deterministic. The normal matrix `JᵀWJ` is PSD by construction
  (a sum of `wᵢ Jᵢᵀ Jᵢ`); if its smallest eigenvalue is non-positive the matrix is not
  positive definite and the solver returns `singular_geometry`, alongside the
  condition-number gate `λmax/λmin > 1e12` (Req 7.3).

## 4. Module layout

One concept per file, kebab-case, tests next to code (`foo.ts` / `foo.test.ts` /
`foo.property.test.ts`), per `structure.md` and `testing.md`. `skeleton/core` imports
nothing outside itself (Req 11.1) and exports only from `src/index.ts` (Req 11.3).

```
skeleton/core/src/
  index.ts              public API surface only (re-exports)
  result.ts             Result<T>, Reason (closed union), Warning (closed union), ok/err helpers
  reason.ts             (optional) the closed Reason set, documented, if split from result.ts
  angle.ts              wrapTwoPi, wrapPi, angularDifference, degToRad, radToDeg, circularMean
  position.ts           Position, isSupportedPosition, greatCircleDistanceM, initialAzimuthRad,
                        destinationPosition
  local-plane.ts        projectToLocalPlane, unprojectToLocalPlane
  observation.ts        Bearing, validateBearing, serialiseBearing, parseBearing
  measurement-model.ts  MeasurementModel interface, Fix, Ellipse, Covariance types
  bearing-model.ts      BearingModel (predict, residual, effective sigma, partials, origin,
                        start estimate, pre-solve, post-solve)
  solver.ts             solve (iterative WLS, outlier rejection, condition number, warnings)
  ellipse.ts            covariance -> Ellipse, ellipse95
```

Tests: `angle.test.ts`, `angle.property.test.ts`, `position.test.ts`,
`position.property.test.ts`, `local-plane.property.test.ts`, `observation.test.ts`,
`observation.property.test.ts`, `bearing-model.property.test.ts`, `solver.property.test.ts`,
`uncertainty.property.test.ts`, plus `calibration.test.ts` (statistical) and
`performance.test.ts`. Reference data, if any, lives in `skeleton/core/fixtures/` and is
read-only.

Dependency direction inside `core` (nothing imports upward, `core` imports nothing
external):

```
index.ts -> * (re-export only)
solver.ts -> measurement-model.ts, ellipse.ts, result.ts
bearing-model.ts -> measurement-model.ts, position.ts, local-plane.ts, angle.ts, observation.ts, result.ts
local-plane.ts -> position.ts, angle.ts
observation.ts -> position.ts, result.ts
position.ts -> angle.ts, result.ts
angle.ts -> result.ts
```

## 5. Data model

All types are exported from `src/index.ts`. Field names follow the unit suffixes of
Section 2.

```ts
// result.ts
export type Reason =
  | 'invalid_number'          // Req 1.9
  | 'undefined_mean'          // Req 1.8
  | 'coincident_positions'   // Req 2.9
  | 'unsupported_position'   // Req 2.10
  | 'invalid_observation'    // Req 4.3, 4.8, 9.9, 9.10
  | 'unsupported_format'     // Req 4.7
  | 'not_converged'          // Req 7.2
  | 'singular_geometry'      // Req 7.3, 9.3
  | 'insufficient_observations' // Req 9.1
  | 'colocated_observers'    // Req 9.2
  | 'diverging_bearings'     // Req 9.5
  | 'out_of_range';          // Req 9.6

export type Warning = 'poor_geometry' | 'outliers_excluded'; // Req 9.4, 10.4

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; reason: Reason; field?: string; id?: string };

// position.ts
export interface Position { latRad: number; lonRad: number; }

// observation.ts — Req 4.1
export interface Bearing {
  id: string;                       // non-empty
  observer: Position;               // Supported
  positionAccuracyM: number;        // 1-sigma, >= 0 (validated to [0, 10000])
  timeUtcMs: number;                // UTC ms since epoch
  azimuthRad: number;               // [0, 2π)
  azimuthSigmaRad: number;          // validated to [0.01°, 45°]
}

// measurement-model.ts
export interface CovarianceEnM2 {   // symmetric 2x2 in East-North square metres
  varEastM2: number;
  varNorthM2: number;
  covEastNorthM2: number;
}

export interface Ellipse {          // 1-sigma
  semiMajorM: number;               // >= semiMinorM > 0
  semiMinorM: number;
  azimuthRad: number;               // [0, π)
}

export interface ObservationResidual {
  id: string;
  residualRad: number;              // wrapPi(measured - predicted)
  normalisedResidual: number;       // residualRad / effectiveSigmaRad
}

export interface Fix {
  position: Position;
  covariance: CovarianceEnM2;
  ellipse: Ellipse;
  residuals: ObservationResidual[];  // one per non-excluded observation, Req 7.9
  iterations: number;               // Req 7.9, 10
  warnings: Warning[];              // Req 7.9
  excludedIds: string[];            // Req 10.4
}

export interface SolverOptions {
  outlierRejection?: boolean;     // Req 10.1, 10.6; default false
  maxIterations?: number;          // Req 7.2; default 50; must be an integer in [1, 50]
}

// The generic interface the solver depends on. O is the observation type.
export interface MeasurementModel<O> {
  // Req 5.7 — the solver validates and identifies observations without knowing their
  // type. validate returns invalid_observation with the observation id and offending
  // field on failure (Req 9.9); idOf returns the id used for canonicalisation and
  // duplicate detection (Req 9.10).
  validate(observation: O): Result<void>;
  idOf(observation: O): string;

  // Req 5.1 — from the full (canonical) observation set:
  origin(observations: readonly O[]): Result<Position>;
  startEstimate(observations: readonly O[], origin: Position):
    Result<{ eastM: number; northM: number }>;
  // Req 5.1, 9.2, 9.3, 9.11 — run before solving (failures only) and again after outlier
  // exclusion on the remaining set (the poor_geometry warning is taken from this run):
  geometryCheck(observations: readonly O[]):
    Result<{ warnings: Warning[] }>;   // failure: colocated_observers / singular_geometry

  // Req 5.2 — per candidate (local plane) and observation:
  evaluate(observation: O, candidate: { eastM: number; northM: number },
           origin: Position): {
    predicted: number;             // predicted measurement (azimuth for bearings)
    residualRad: number;           // wrapPi(measured - predicted)
    effectiveSigmaRad: number;     // 1-sigma combining error sources
    partialEastRadPerM: number;    // ∂predicted/∂eastM
    partialNorthRadPerM: number;   // ∂predicted/∂northM
  };

  // Req 5.3 — after exclusion, on the remaining observations. The solver passes the
  // Local-plane origin it computed via origin(); out_of_range is measured from it (Req 9.6):
  postSolveCheck(fix: Fix, origin: Position, observations: readonly O[]):
    Result<{ warnings: Warning[] }>;
}
```

The solver signature:

```ts
export function solve<O>(model: MeasurementModel<O>,
                          observations: readonly O[],
                          options?: SolverOptions): Result<Fix>;
```

The solver is parameterised by `O` and the model; it has no import of `Bearing` or
`bearing-model.ts`. `BearingModel` is constructed by the caller and passed in (Req 5.5).

## 6. Algorithms — primitives

**`wrapTwoPi(x)` / `wrapPi(x)`** — matching the math conventions: `wrapTwoPi` returns
`[0, 2π)`; `wrapPi` first reduces to `[0, 2π)` with `((x % 2π) + 2π) % 2π` then folds the
upper half down to return `(-π, π]`. Public versions return `Result` on `NaN`/`±Infinity`
(D1); private `_wrapTwoPi`/`_wrapPi` assume finite.

**`angularDifference(a, b)`** — `wrapPi(a - b)` (Req 1.3). Returns `Result` (D1).

**`degToRad` / `radToDeg`** — multiplication by `π/180` and `180/π` respectively; the
constants are derived once. Round-trip is exact to rounding (Req 1.5).

**`circularMean(angles)`** — `atan2(Σ sin, Σ cos)` wrapped to `[0, 2π)` (Req 1.6). If the
mean resultant length `√((Σ sin)² + (Σ cos)²)/n` is below `1e-9`, return `undefined_mean`
(Req 1.8). If any input is `NaN`/`±Infinity`, return `invalid_number` (Req 1.9) before
summing, so no `NaN` is produced.

## 7. Algorithms — geodesy, projection, model, solver

### 7.1 Spherical Earth (`position.ts`)

`greatCircleDistanceM(a, b)` — haversine, stable near zero and for all central angles up
to the antipode:

```
Δlat = b.latRad - a.latRad
Δlon = b.lonRad - a.lonRad
h = sin²(Δlat/2) + cos(a.latRad) cos(b.latRad) sin²(Δlon/2)
c = 2 asin(clamp(√h))            // clamp only if √h exceeds 1 by < 1e-12
d = R · c,  R = 6 371 008.8
```

`initialAzimuthRad(a, b)` — clockwise from true north:

```
y = sin(Δlon) cos(b.latRad)
x = cos(a.latRad) sin(b.latRad) - sin(a.latRad) cos(b.latRad) cos(Δlon)
θ = wrapTwoPi(atan2(y, x))
```

If `greatCircleDistanceM(a, b) < 1e-3 m` return `coincident_positions` (Req 2.9).

`destinationPosition(a, θ, d)`:

```
δ = d / R
lat2 = asin(clamp(sin(a.latRad) cos δ + cos(a.latRad) sin δ cos θ))
lon2 = a.lonRad + atan2(sin θ sin δ cos(a.latRad), cos δ - sin(a.latRad) sin(lat2))
return { latRad: lat2, lonRad: wrapToLonRange(lon2) }   // lon in (-π, π], Req 2.8
```

`wrapToLonRange` reduces longitude to `(-π, π]`: wrap to `[0, 2π)`, then map `[π, 2π)` to
`(-π, 0]` (with `π` kept as `π`). This is the single point where longitude is normalised
across the ±180° meridian (Req 2.8).

All three reject non-Supported input with `unsupported_position` (Req 2.10) and never emit
`NaN`/`Infinity`. Because distance and azimuth are invariant under any rotation of the
sphere about the polar axis, and `destinationPosition` followed by `wrapToLonRange` is
consistent with that invariance, the meridian-shift property (Req 9.7) holds end to end.

### 7.2 Local plane (`local-plane.ts`)

`projectToLocalPlane(origin, p)` — azimuthal equidistant (Req 3.1):

```
d = greatCircleDistanceM(origin, p)
θ = initialAzimuthRad(origin, p)       // coincident -> (0,0) handled
eastM = d sin θ
northM = d cos θ
```

If `d < 1e-3 m`, return `{ eastM: 0, northM: 0 }` (Req 3.4). By construction the projected
length equals `d`, so Req 3.5 holds to rounding.

`unprojectToLocalPlane(origin, { eastM, northM })`:

```
d = √(eastM² + northM²)
if d < 1e-3 m: return origin                  // Req 3.4
θ = atan2(eastM, northM)
return destinationPosition(origin, θ, d)
```

Because the projection is defined as `(d, θ)` and the inverse is `destinationPosition` at
that `(d, θ)`, the round-trip (Req 3.3) is exact to rounding for any distance up to the
antipode; the 1000 km bound in 3.3 is a generous tolerance, not a limit of correctness.

### 7.3 Observation and wire format (`observation.ts`)

`validateBearing(b)` — Req 4.2. Checks, in order, returning `invalid_observation` with
the observation `id` set and the offending `field` named on the first failure (Req 9.9):
`id` is a non-empty string; every number (`positionAccuracyM`, `timeUtcMs`, `azimuthRad`, `azimuthSigmaRad`, and the observer's
`latRad`/`lonRad`) is finite; `observer` is a Supported position; `azimuthRad ∈ [0, 2π)`;
`azimuthSigmaRad ∈ [0.01°, 45°] = [0.01π/180, 45π/180]`; `positionAccuracyM ∈ [0, 10000]`.

`serialiseBearing(b)` — Req 4.4. Produces:

```json
{
  "v": 1,
  "kind": "bearing",
  "id": "<id>",
  "observer": { "latDeg": <latRad·180/π>, "lonDeg": <lonRad·180/π> },
  "positionAccuracyM": <positionAccuracyM>,
  "timeUtcMs": <timeUtcMs>,
  "azimuthDeg": <azimuthRad·180/π>,
  "azimuthSigmaDeg": <azimuthSigmaRad·180/π>
}
```

All angles carry `Deg` suffixes; time is `timeUtcMs`; accuracy is in metres with `M`.
`serialiseBearing` serialises a bearing the caller has already validated (via
`validateBearing`, or one obtained from `parseBearing`, which validates). It does not
re-validate and does not throw.

`parseBearing(json)` — Req 4.5, 4.7, 4.8. If the input is not an object, return
`invalid_observation`. If `v` is missing or not `1`, or `kind` is missing or not
`"bearing"`, return `unsupported_format`. If a required field is missing, return
`invalid_observation` naming the field. Then read the fields, convert angles from degrees
to radians, and run the same `validateBearing`. No path throws (Req 4.8, 9.8).

The round-trip (Req 4.6) holds because the degree fields are stored and read as JSON
doubles and `degToRad(radToDeg(x))` round-trips to rounding (Req 1.5), far inside the
`1e-12 rad` tolerance.

### 7.4 Measurement-model interface — bearing model (`bearing-model.ts`)

`BearingModel` implements `MeasurementModel<Bearing>`.

- `validate(b)` — delegates to `validateBearing`, returning its `invalid_observation`
  failure (which carries `b.id` and the offending `field`, Req 9.9).
- `idOf(b)` — returns `b.id` (Req 5.7).

- `origin(observations)` — the 3D spherical centroid of the observer positions (D2). For
  each observer form the unit vector `(cos lat cos lon, cos lat sin lon, sin lat)`, average,
  renormalise; if the norm is below `1e-9` (all observers antipodally cancelling, a
  degenerate input) return `unsupported_position`. Convert back to `{latRad, lonRad}`.

- `startEstimate(observations, origin)` — Req 6.4. Project each observer to the local
  plane. For each pair compute the crossing angle
  `min(|Δ|, π - |Δ|)` where `Δ = wrapPi(az_i - az_j)`. Select the pair with the largest
  crossing angle (ties broken by the `id`-pair, D4). Compute the intersection of the two
  bearing lines in the plane: each line is `(E_i + t·sin az_i, N_i + t·cos az_i)`; solve the
  2×2 system for the intersection. Return it as `{ eastM, northM }`.

- `geometryCheck(observations)` — Req 9.2, 9.3, 9.4, 9.11. If the maximum pairwise observer
  distance is `< 1 m`, return `colocated_observers` (D5). Otherwise compute the largest
  crossing angle `γ`. If `γ < 0.5°` (`0.5π/180`), return `singular_geometry`. If
  `0.5° ≤ γ < 20°`, succeed with the `poor_geometry` warning. Otherwise succeed with no
  warning. The solver runs this before solving (failures only) and again after outlier
  exclusion on the remaining set, taking the warning from that final run (D5, Req 9.11).

- `evaluate(observation, candidate, origin)` — Req 6.1–6.3, 6.7:
  - Unproject the candidate to `{latC, lonC}` (Section 7.2).
  - `predicted = initialAzimuthRad(observer, {latC, lonC})`.
  - `residualRad = wrapPi(measuredAzimuthRad - predicted)`. (Req 6.2, 6.7: the wrap means a
    measured `0.01` and predicted `2π - 0.01` yield `+0.02`, not `-2π + 0.02`.)
  - `rangeM = max(greatCircleDistanceM(observer, {latC, lonC}), 1)` (Req 6.3).
  - `effectiveSigmaRad = sqrt(azimuthSigmaRad² + (positionAccuracyM / rangeM)²)`.
  - Analytic partials (D8): `predicted` is `initialAzimuthRad(observer, candidate)` and the
    candidate is `unprojectToLocalPlane(origin, {eastM, northM}) = destinationPosition(origin, θ, d)`
    with `d = √(e² + n²)`, `θ = atan2(e, n)`. The chain rule gives
    `∂predicted/∂(e,n) = (∂predicted/∂(latC, lonC)) · (∂(latC, lonC)/∂(d, θ)) · (∂(d, θ)/∂(e, n))`,
    where the first factor is the quotient-rule derivative of `atan2(y, x)` for the azimuth
    formula, the second is the destination-formula derivative, and the third is
    `∂d/∂e = e/d`, `∂d/∂n = n/d`, `∂θ/∂e = n/d²`, `∂θ/∂n = -e/d²`. The `1 m` floor on
    `rangeM` bounds the partials; when the candidate sits on an observer the partials grow,
    which manifests as a large condition number and `singular_geometry`, not as `NaN`.

- `postSolveCheck(fix, origin, observations)` — Req 9.5, 9.6 (D7). The `origin` is the
  Local-plane origin the solver computed; `out_of_range` is measured from it. For each
  remaining observation, if `|residualRad| > π/2` return `diverging_bearings`. If
  `greatCircleDistanceM(origin, fix.position) > 500 000 m`, return `out_of_range`.
  Otherwise succeed with no extra warnings (`poor_geometry` is added from the post-exclusion
  `geometryCheck` run, not here).

### 7.5 Solver (`solver.ts`)

`solve(model, observations, options)` proceeds:

0. **Options** (D10): resolve `outlierRejection` (default `false`) and `maxIterations`
   (default `50`). If `maxIterations` is supplied and is not an integer in `[1, 50]`, return
   `invalid_number` with `field: "maxIterations"`.
1. **Canonicalise** (D3): for each observation collect `id = model.idOf(obs)`. If any `id`
   appears more than once, return `invalid_observation` with `field: "id"` (the duplicated
   value, lexicographically smallest for determinism) — Req 9.10. Then sort the array by
   `id` (lexicographic, stable). This canonical array is used everywhere below.
2. **Validate** (D6, Req 9.9): run `model.validate(obs)` on each observation. On the first
   invalid, return its `invalid_observation` failure (which carries the observation `id`
   and the offending `field`).
3. **Count**: if fewer than two observations remain, return `insufficient_observations`
   (Req 9.1).
4. **Origin and start**: `origin = model.origin(observations)`; `start =
   model.startEstimate(observations, origin)`. Propagate failures. This `origin` is the
   solve origin reused in steps 8 and 9.
5. **Pre-solve** (D5): `pre = model.geometryCheck(observations)`. On failure
   (`colocated_observers` / `singular_geometry`), return the reason. Do not commit any
   `poor_geometry` warning from this run — it is re-evaluated on the remaining set after
   exclusion (step 8, Req 9.11).
6. **Solve loop** (Req 7.1, 7.2, 7.3; D14) from the start estimate, bounded by
   `maxIterations` (default `50`):
   - For each observation, `eval = model.evaluate(obs, candidate, origin)`. Build the
     Jacobian rows `J_i = [partialEastRadPerM, partialNorthRadPerM]`, weights
     `w_i = 1/effectiveSigmaRad²`, residuals `r_i = eval.residualRad`.
     `JᵀWJ` (2×2) and `JᵀW r` (2-vector) are accumulated by summation. The effective
     sigmas `σ_i` are this iteration's (computed at the current candidate); the cost
     `C0 = Σ (r_i / σ_i)²` uses them.
   - Eigenvalue/condition check: compute the eigenvalues of `JᵀWJ` with the shared helper
     of Section 7.6 (take `a`, `b`, `c` from the symmetric `JᵀWJ`). If `λ2 ≤ 0` (the matrix
     is not positive definite) return `singular_geometry`. If `λ1 / λ2 > 1e12` return
     `singular_geometry` (Req 7.3).
   - `Δ = (JᵀWJ)⁻¹ JᵀW r` for the 2×2 system (closed form).
   - Step control: try `candidate + Δ`, evaluating the cost there with the **same**
     current-iteration `σ_i`. If that cost does not exceed `C0`, accept the step; otherwise
     halve `Δ` and retry, up to 8 halvings, taking the first non-increasing step (or the
     smallest if none decrease the cost). Update `candidate` by the accepted step.
   - Convergence: if the accepted step's length `√(ΔE² + ΔN²) < 1e-4 m`, stop (converged).
     If `maxIterations` is reached without that, return `not_converged` (Req 7.2).
   - Effective sigmas are recomputed each iteration because `rangeM` moves with the
     candidate (Req 7.1, D9).
7. **Outlier rejection** (Req 10.1–10.4), only if `outlierRejection` is enabled **and**
   the current observation count is `≥ 4`:
   - At the current solution, compute `normalisedResidual_i = r_i / σ_i`. Find the
     observation with the largest `|normalisedResidual_i|` (ties by `id`, D4). If that
     magnitude exceeds `3.5`, remove that observation and re-solve from the current fix
     (warm start, bounded by `maxIterations`). Repeat until no magnitude exceeds `3.5` or
     three observations remain (Req 10.2).
   - Record every removed `id`; if any were removed, add the `outliers_excluded` warning
     (Req 10.4). When disabled (Req 10.6) or the count is `< 4`, skip this step entirely.
8. **Post-exclusion geometry** (D5, Req 9.11): `gpost = model.geometryCheck(remaining)`.
   On failure (singular/colocated among the remaining) return the reason. Otherwise take
   `gpost`'s `poor_geometry` warning (if any) as the fix's geometry warning. When nothing
   was excluded, `remaining` is the full set, so this is the same geometry as step 5.
9. **Uncertainty and Fix assembly** (Section 7.6): build the covariance and ellipse from
   `JᵀWJ` at the solution with the converged weights, and assemble the `Fix` with
   `position` (unprojected from the local plane), `covariance`, `ellipse`, `residuals`
   (one per remaining observation, Req 7.9), `iterations` of the final solve (D10), and
   `excludedIds`. Its `warnings` so far are the `poor_geometry` warning from step 8 and the
   `outliers_excluded` warning from step 7.
10. **Post-solve** (Req 10.3): `post = model.postSolveCheck(fix, origin, remaining)`,
    passing the assembled `Fix`. On failure, return the reason. Otherwise append
    `post.warnings` to the fix's warnings (the bearing model returns none, but the interface
    allows it).
11. **Return** the `Fix`.

Because every reduction is a commutative sum or an `id`-keyed selection over the canonical
sorted array, and the step control is a deterministic backtracking search, the output is
deterministic (Req 7.8) and invariant under input reordering (Req 7.5) to the last bit.

### 7.6 Uncertainty (`ellipse.ts`)

`covariance = (JᵀWJ)⁻¹` at the solution, with the converged weights (Req 8.1). For the 2×2
system the inverse is closed-form; `JᵀWJ` is symmetric positive definite for a successful
fix (the eigenvalue/condition-number gate at step 6 rejects the rest), so the covariance is
symmetric positive definite (Req 8.7).

`ellipse.ts` exports one shared helper used by both the solver's `JᵀWJ` check (step 6) and
`ellipseFromCovariance`. For a symmetric 2×2 `[[a, b], [b, c]]` it computes, without forming
`tr² − 4·det` (which can go negative by rounding):

```
h  = hypot((a − c)/2, b)          // >= 0
λ1 = (a + c)/2 + h                 // the larger eigenvalue
λ2 = det / λ1                      // det = a·c − b²; equals (a + c)/2 − h
```

`ellipseFromCovariance(cov)` — Req 8.2: take `a = varEastM2`, `b = covEastNorthM2`,
`c = varNorthM2`; `semiMajorM = √λ1`, `semiMinorM = √λ2`. The ellipse is **circular within
rounding** when `h ≤ 1e-12 · λ1` (D12); in that case the major-axis azimuth is `0`.
Otherwise it is the `λ1` eigenvector's azimuth `atan2(v_E, v_N)`, reduced to `[0, π)` (a
negative result is folded by `+ π`, which only flips the axis direction).
`ellipse95(ellipse)` returns a copy with both axes multiplied by `2.4477` (Req 8.3).

The same helper feeds the solver's gate: `λ2 = det / λ1` is the smallest eigenvalue, so
`λ2 ≤ 0` is the non-positive case and `λ1 / λ2 > 1e12` is the condition-number case
(Req 7.3); either returns `singular_geometry`.

Scaling behaviour follows algebraically: scaling every `azimuthSigmaRad` and
`positionAccuracyM` by `k` scales every `effectiveSigmaRad` by `k` (range is unchanged),
so weights scale by `1/k²`; `(JᵀWJ)⁻¹` scales by `k²` and the axes by `k`, while the
solution `Δ = (JᵀWJ)⁻¹ JᵀW r` is unchanged (both factors scale by `1/k²`) — so the fix is
unchanged and the axes scale by `k` (Req 8.4). Adding a copy of every observation under a
new id doubles `JᵀWJ` and `JᵀW r`, leaving the fix unchanged (Req 7.7) and halving the
covariance, so the axes divide by `√2` (Req 8.5). Adding an observation adds a
positive-semidefinite `w·JᵀJ` term to `JᵀWJ`, so `(JᵀWJ)⁻¹` shrinks in Loewner order and
its determinant does not increase (Req 8.6).

## 8. Correctness Properties

Every property below is implemented with `fast-check`, runs at least 200 cases, names the
property and the requirement it validates in a comment above the test, and compares angles
with `wrapPi(a − b)` and tolerances taken from the requirements (not loosened to pass).
Generators state their domains and exclusions (testing.md rule 4). A failing property is
investigated as a possible bug in code, property, or requirement, never silently weakened
(rule 1); shrunk counterexamples that reveal real bugs are kept as example tests (rule 5).

Shared generators (domains documented here, reused across properties):

- **`finiteAngle`** — `x ∈ [-1e6, 1e6]` rad. Used by 1.2, 1.4, 1.5.
- **`clusteredAngles`** — a non-empty list within `π/4` of a common direction: pick a
  centre `c ∈ [0, 2π)`, offsets in `[-π/4, π/4]`. (Resultant length well above `1e-9`, so
  the mean is defined.) Used by 1.7.
- **`supportedPosition`** — `latRad ∈ [-89°, 89°]`, `lonRad ∈ (-180°, 180°]`. Excludes
  within 1° of a pole. Used by 2.x, 3.x.
- **`azimuth`** — `azimuthRad ∈ [0, 2π)`.
- **`validBearing`** — a `Bearing` with non-empty `id`, Supported observer,
  `positionAccuracyM ∈ [0, 10000]`, finite `timeUtcMs`, `azimuthRad ∈ [0, 2π)`,
  `azimuthSigmaRad ∈ [0.01°, 45°]`. Used by 4.6.
- **`solvableSet`** — a target (Supported position), `n ∈ [2, 12]` observers at
  `500 m–100 km` from the target, at least one pair with crossing angle `≥ 10°`, noise-free
  bearings (exact azimuths to the target), unique `id`s. The generator filters to sets the
  solver actually solves (returns a fix). Used by 7.4, 7.5, 7.6, 7.7, 8.4, 8.5, 8.6, 8.7,
  10.5; variants add small Gaussian noise where the property allows it.
- **`meridianSet`** — like `solvableSet` but with observers placed on both sides of the
  ±180° meridian (longitudes straddling `±π`). Used by 9.7.
- **`hostileInput`** — arbitrary type-correct inputs to the public API: malformed
  observations, `NaN`/`±Infinity` fields, out-of-range sigmas, non-object wire payloads,
  empty `id`s, duplicate `id`s, and hostile `SolverOptions` (`maxIterations` as
  `NaN`/`±Infinity`/`0`/negative/fractional/`> 50`), etc. Used by 9.8.

| ID | Validates (Req) | Generator domain | Property assertion |
|----|---|----|----|
| P-1.2 | 1.2 | `finiteAngle` `x`; integer `k ∈ [-1000, 1000]` | `wrapPi(wrapTwoPi(x + 2πk) − wrapTwoPi(x)) < 1e-9` |
| P-1.4 | 1.4 | `finiteAngle` `a`, `b` | `wrapPi(angularDifference(a,b) + angularDifference(b,a)) < 1e-9`, unless `|angularDifference(a,b)|` is within `1e-9` of `π` |
| P-1.5 | 1.5 (round-trip) | `finiteAngle` `x` (radians) | `|degToRad(radToDeg(x)) − x|` within relative `1e-12` (absolute `1e-15` near zero); also `radToDeg(degToRad(y)) ≈ y` for `y` in degrees |
| P-1.7 | 1.7 | `clusteredAngles`; rotation `r ∈ [0, 2π)` | `wrapPi(circularMean(rotated) − (circularMean(original) + r)) < 1e-9` |
| P-2.4 | 2.4 (round-trip) | `supportedPosition` `A`; `azimuth` `θ`; `d ∈ [10 m, 10 000 km]`; keep only if `destinationPosition(A, θ, d)` is Supported | `|greatCircleDistanceM(A, B) − d| < 1e-4 m` |
| P-2.5 | 2.5 (round-trip) | `supportedPosition` `A`; `azimuth` `θ`; `d ∈ [100 m, 10 000 km]`; keep only if `B` is Supported | `wrapPi(initialAzimuthRad(A, B) − θ) < 1e-9` |
| P-2.6 | 2.6 | `supportedPosition` `A`, `B`; also `A` alone | `|greatCircleDistanceM(A,B) − greatCircleDistanceM(B,A)| < 1e-6 m`, and `greatCircleDistanceM(A,A) ≈ 0` within `1e-6 m` |
| P-2.7 | 2.7 | `supportedPosition` `A`, `B`, `C` | `greatCircleDistanceM(A,C) ≤ greatCircleDistanceM(A,B) + greatCircleDistanceM(B,C) + 1e-3 m` |
| P-3.3 | 3.3 (round-trip) | `supportedPosition` origin; position within `1000 km` of it (Supported) | `greatCircleDistanceM(unprojectToLocalPlane(origin, projectToLocalPlane(origin, P)), P) < 1e-4 m` |
| P-3.5 | 3.5 | `supportedPosition` origin; position within `1000 km` | `|√(eastM² + northM²) − greatCircleDistanceM(origin, P)| < 1e-6 m` |
| P-4.6 | 4.6 (round-trip) | `validBearing` `b` | `parseBearing(serialiseBearing(b))` succeeds; angles equal `b` within `1e-12 rad`; other fields identical |
| P-6.5 | 6.5 | observer and candidate `50 m–200 km` apart | model partials match central finite differences of `predicted` (step `0.1 m`) within relative `1e-2` or absolute `1e-10 rad/m` |
| P-6.6 | 6.6 | observer and target `50 m–200 km` apart | a noise-free bearing has `|residualRad| < 1e-9 rad` at the true target |
| P-7.4 | 7.4 | `solvableSet` (2–12 observers, `500 m–100 km`, a pair with crossing angle `≥ 10°`) | `greatCircleDistanceM(fix.position, target) < 0.01 m` |
| P-7.5 | 7.5 | `solvableSet` (and a noisy variant), two random input orderings | `greatCircleDistanceM(fix1.position, fix2.position) < 1e-3 m` |
| P-7.6 | 7.6 | `solvableSet` | with effective sigmas frozen at the fix, `Cost(fix) ≤ Cost(fix ± 1 m E/W/N/S)` |
| P-7.7 | 7.7 | `solvableSet`; add a copy of every observation under a fresh unique `id` | `greatCircleDistanceM(fixCopied.position, fix.position) < 1e-3 m` |
| P-7.8 | 7.8 | `solvableSet` | two calls on identical input produce identical `Fix` (deep equality, including `iterations`, `warnings`, `excludedIds`) |
| P-8.4 | 8.4 | `solvableSet`; `k ∈ [0.5, 4]` | scaling all sigmas/accuracies by `k`: fix unchanged within `1e-3 m`; both ellipse axes scaled by `k` within relative `1e-5` |
| P-8.5 | 8.5 | `solvableSet`; add a copy of every observation under a fresh unique `id` | both ellipse axes divided by `√2` within relative `1e-5` |
| P-8.6 | 8.6 | `solvableSet` (satisfying 7.4) plus one more noise-free bearing of the same target | `det(covariance') ≤ det(covariance) · (1 + 1e-9)` (determinant does not increase by more than relative `1e-9`) |
| P-8.7 | 8.7 | `solvableSet` | `covariance` symmetric within `1e-12` and positive definite (both eigenvalues `> 0`) |
| P-9.7 | 9.7 | `meridianSet`; the same configuration shifted `90°` in longitude | the fix from the shifted config, shifted back `90°`, equals the original fix within `0.01 m` |
| P-9.8 | 9.8 | `hostileInput` to every public entry point | no call throws; any returned `Result` is either a failure or a success whose values contain no `NaN`/`±Infinity` |
| P-10.5 | 10.5 | 8–12 observers `5–7 km` from a target, directions spanning `≥ 120°`, exact positions, `azimuthSigmaRad = 2°`; one extra bearing wrong by `30°–80°` | `greatCircleDistanceM(fix.position, target) < 1 m` and `excludedIds` is exactly the bad observation's `id` |

Notes on the properties:

- **P-1.4** excludes the antipodal case where the difference is within `1e-9` of `π`, since
  the antisymmetry target `−π ≡ π` is ambiguous at the wrap boundary (the requirement
  excludes it explicitly).
- **P-2.4 / P-2.5** filter to destinations that are Supported positions, per the "whose
  destination `B` is a Supported position" clause. The filter is documented in the
  generator; degenerate destinations excluded here (a destination within 1° of a pole) are
  covered by example tests of `unsupported_position`.
- **P-7.6** freezes the effective sigmas at the fix before computing the cost at the
  perturbed points, exactly as the requirement states. The fix is a stationary point of
  that frozen-sigma cost (the solver drives `JᵀW r → 0`, which is the frozen-sigma gradient),
  and the positive-definite Hessian makes it a local minimum, so the property holds for
  every solvable set.
- **P-9.8** is the umbrella property for Req 9.8. It exercises every public function with
  arbitrary type-correct (including hostile) inputs and asserts no throw and no
  `NaN`/`Infinity` escapes. This is also what makes the per-function `invalid_number`,
  `invalid_observation`, and `unsupported_format` failures trustworthy.

## 9. Statistical, performance and example tests

These are not `fast-check` properties; they live alongside the properties and are
deterministic.

**Statistical (fixed seed passed in — testing.md):**

- **Calibration (Req 8.8).** A seeded RNG drives 1000 trials: each with 3 observers at
  `1–20 km` from the target, pairwise crossing angles `≥ 30°`, exact observer positions,
  and Gaussian azimuth noise of 1-sigma `2°`. Count a trial as "not contained" if the solve
  fails or the target lies outside the 95% ellipse. Assert the contained fraction is in
  `[0.90, 0.99]`. The covariance is the linearised `(JᵀWJ)⁻¹` with weights matching the
  noise, so coverage sits near 95%; the window tolerates nonlinear bias and sampling.
- **Outlier rejection (Req 10.5) as a statistical check** can also be run over many seeds,
  but P-10.5 already covers the FOR-ALL form; the seeded variant confirms stability.

**Performance (Req 7.10):**

- A test builds 200 valid bearings on a well-conditioned target and asserts `solve`
  completes within `50 ms` on the runner. It does not assert correctness (the property tests
  do that); it asserts wall-clock only. Runs once, no watch mode.

**Example tests (testing.md: published values, fixtures, each failure reason):**

- **Req 6.7:** measured `azimuthRad = 0.01`, predicted `2π − 0.01`; assert residual `0.02`
  within `1e-12`.
- **Each failure reason** is exercised by a constructed input that triggers exactly it:
  `invalid_number` (NaN/Infinity to an angle function — Req 1.9), `undefined_mean`
  (opposite angles — Req 1.8), `coincident_positions` (azimuth between coincident points
  — Req 2.9), `unsupported_position` (a position within 1° of a pole — Req 2.10),
  `invalid_observation` (each field violated — Req 4.3; the failure names the observation
  `id` and the offending `field`, Req 9.9), `unsupported_format` (wrong `v`/`kind` —
  Req 4.7), `invalid_observation` from a non-object or missing-field payload (Req 4.8),
  `invalid_observation` with `field: "id"` for two observations sharing an `id` (Req 9.10),
  `invalid_number` with `field: "maxIterations"` for a `maxIterations` outside the integer
  range `[1, 50]` (`NaN`, `±Infinity`, `0`, negative, fractional, or `> 50`), `not_converged`
  (a deliberately low `maxIterations` on a case that needs more — deterministic, Req 7.2),
  `singular_geometry` (parallel bearings — Req 9.3; also the non-positive-smallest-eigenvalue
  case of the normal matrix, where `λ2 = det/λ1 ≤ 0`), `insufficient_observations` (one
  observation — Req 9.1), `colocated_observers` (all observers within 1 m — Req 9.2),
  `diverging_bearings` (best fit behind an observer — Req 9.5), `out_of_range` (fix beyond
  500 km from the solve origin — Req 9.6).
- **Warnings:** `poor_geometry` (crossing angle in `[0.5°, 20°)` — Req 9.4), including the
  Req 9.11 case where the warning is re-evaluated on the observations remaining after an
  outlier is excluded (a set that is `poor_geometry` before exclusion but good after it,
  and the converse), and `outliers_excluded` (Req 10.4) each get an example test.
- **Req 2.8:** a destination computed to cross the ±180° meridian returns a longitude in
  `(-π, π]`.
- **Req 3.4:** the origin and a position `< 1e-3 m` away both project to `(0, 0)`.
- **Wire format versioning:** an example `serialiseBearing`→`parseBearing` pair and an
  example of each parse-failure path.
- **Circular ellipse (D12):** a covariance with `h ≤ 1e-12 · λ1` (axes equal to within
  rounding) yields `ellipse.azimuthRad = 0`.

## 10. Purity and packaging

`@alidade/core` has zero runtime dependencies (Req 11.1). It reads no clock, generates no
random numbers, performs no I/O, and references no browser or Node globals; time
(`timeUtcMs`) and any seeds are arguments (Req 11.2). Every expected failure is a `Result`
with a `Reason` from the closed union of Section 5 (Req 11.4). The public API is exported
only from `src/index.ts` (Req 11.3). The package builds and tests under TypeScript `strict`
with no `any` and no non-null assertions in `core` (Req 11.5; `tech.md`).

## 11. How the altitude model plugs in (forward note, not designed here)

A later spec will add `AltitudeModel` implementing `MeasurementModel<AltitudeObservation>`:
its `validate`/`idOf` let the solver validate and identify its observations (Req 5.7), its
`evaluate` predicts a body's altitude from a candidate observer position, its
`origin`/`startEstimate`/`geometryCheck`/`postSolveCheck` supply the celestial geometry, and
the existing `solve` in `solver.ts` consumes it unchanged (Req 5.6). Nothing in this design
references `Bearing` from `solver.ts`, so that addition requires no solver edit.
