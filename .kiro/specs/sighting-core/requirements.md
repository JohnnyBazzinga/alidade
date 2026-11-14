# Requirements Document

## Introduction

`sighting-core` is the pure-math heart of the Alidade skeleton (`skeleton/core`, package `@alidade/core`). It turns a set of sightings into a position fix with an honest uncertainty estimate.

This first spec covers the foundations and the first measurement model:

- angle and spherical-Earth primitives,
- the observation data model and its wire format,
- a fix solver that is generic over measurement models,
- the **bearing** measurement model (many observers at known positions sight one unknown target), which is what the Vigia app needs,
- the uncertainty ellipse and outlier handling.

The **altitude** measurement model for celestial fixes (the Nonius app) is a later spec. The solver must be designed so that model can be added without changing the solver.

All conventions in `.kiro/steering/math-conventions.md` are binding for this spec: radians internally, azimuth clockwise from true north, unit suffixes on every numeric name, spherical Earth of radius 6 371 008.8 m.

## Glossary

- **Core**: the `@alidade/core` package specified here.
- **Position**: a point on the Earth, `{ latRad, lonRad }`.
- **Supported position**: a Position with finite coordinates, latitude within 89° of the equator and longitude in `(-π, π]`.
- **Azimuth**: direction clockwise from true north, in `[0, 2π)`.
- **Bearing observation**: one sighting of a target: who (id), from where (observer Position and its 1-sigma accuracy in metres), when (UTC), in which direction (Azimuth) and how precisely (1-sigma in radians).
- **Local plane**: an East-North plane in metres, tangent to the sphere at a stated origin, using the azimuthal equidistant projection.
- **Measurement model**: the rule that, for one kind of observation, predicts what each observation should read for a candidate state and how that prediction changes as the state moves. It also supplies the Local plane origin, the starting estimate and the geometry checks for its kind of observation.
- **Fix**: the solver's estimate of the unknown Position, always accompanied by its covariance and error ellipse.
- **Crossing angle**: the acute angle between two bearing lines, computed from their two measured Azimuths as `min(|Δ|, π - |Δ|)`, where `Δ` is their wrapped difference. It lies in `[0, π/2]`.
- **Effective sigma**: the 1-sigma used to weight an observation, after the Measurement model has combined all its error sources.
- **Normalised residual**: the wrapped difference between a measured and a predicted value, divided by that observation's Effective sigma.
- **Cost**: the sum of squared Normalised residuals.
- **Error ellipse**: semi-major axis, semi-minor axis (metres) and the Azimuth of the major axis, derived from the Fix covariance.
- **Noise-free observation set**: observations generated from one true target with exact Azimuths.
- **Result**: a value that is either a success carrying data or a failure carrying a machine-readable reason. Expected failures are never thrown.

## Requirements

### Requirement 1: Angle primitives

**User Story:** As a developer building on the skeleton, I want one trustworthy set of angle functions, so that wrap-around and unit mistakes cannot creep into every feature.

#### Acceptance Criteria

1. THE Core SHALL provide `wrapTwoPi`, returning a value in `[0, 2π)`, and `wrapPi`, returning a value in `(-π, π]`, for every finite input.
2. FOR ALL angles `x` with `|x| ≤ 1e6` and integers `k` with `|k| ≤ 1000`, `wrapTwoPi(x + 2πk)` SHALL equal `wrapTwoPi(x)` within `1e-9` rad, compared as a wrapped difference.
3. THE Core SHALL provide an angular difference function that returns `wrapPi(a - b)`.
4. FOR ALL angles `a` and `b` with magnitude at most `1e6`, the angular difference of `a` and `b` SHALL equal the negative of the angular difference of `b` and `a` within `1e-9` rad, except when the difference is within `1e-9` rad of `π`.
5. THE Core SHALL provide degree-to-radian and radian-to-degree conversions, and FOR ALL `x` with `|x| ≤ 1e6`, converting to radians and back SHALL return `x` within a relative error of `1e-12`.
6. THE Core SHALL provide a circular mean of a non-empty list of angles, computed as `atan2(Σ sin, Σ cos)` and wrapped to `[0, 2π)`.
7. FOR ALL lists of angles that lie within `π/4` of a common direction, rotating every angle by the same amount SHALL rotate the circular mean by that amount within `1e-9` rad.
8. IF the circular mean is requested for angles whose mean resultant length is below `1e-9`, THEN THE Core SHALL return a failure with reason `undefined_mean`.
9. IF any angle function receives `NaN` or an infinite value, THEN THE Core SHALL return a failure with reason `invalid_number` and SHALL NOT return `NaN`.

### Requirement 2: Spherical Earth primitives

**User Story:** As a developer, I want distance, bearing and destination functions on one agreed Earth model, so that every part of the system computes geometry the same way.

#### Acceptance Criteria

1. THE Core SHALL compute the great-circle distance in metres between two Supported positions on a sphere of radius `6 371 008.8 m`.
2. THE Core SHALL compute the initial Azimuth from one Supported position to another.
3. THE Core SHALL compute the destination Position reached from a Supported position along a given initial Azimuth for a given distance.
4. FOR ALL Supported positions `A`, Azimuths `θ` and distances `d` in `[10 m, 10 000 km]` whose destination `B` is a Supported position, the distance from `A` to `B` SHALL equal `d` within `1e-4 m`.
5. FOR ALL Supported positions `A`, Azimuths `θ` and distances `d` in `[100 m, 10 000 km]` whose destination `B` is a Supported position, the initial Azimuth from `A` to `B` SHALL equal `θ` within `1e-9` rad, compared as a wrapped difference.
6. FOR ALL Supported positions `A` and `B`, the distance from `A` to `B` SHALL equal the distance from `B` to `A` within `1e-6 m`, and SHALL be zero when `A` equals `B`.
7. FOR ALL Supported positions `A`, `B` and `C`, the distance from `A` to `C` SHALL NOT exceed the distance from `A` to `B` plus the distance from `B` to `C` by more than `1e-3 m`.
8. WHEN a destination crosses the ±180° meridian, THE Core SHALL return a longitude in `(-π, π]`.
9. IF the initial Azimuth is requested between two positions less than `1e-3 m` apart, THEN THE Core SHALL return a failure with reason `coincident_positions`.
10. IF any input Position is not a Supported position, THEN THE Core SHALL return a failure with reason `unsupported_position`.

### Requirement 3: Local plane projection

**User Story:** As a developer, I want to work in metres on a local plane, so that a fix and its uncertainty can be expressed in units people understand.

#### Acceptance Criteria

1. THE Core SHALL project a Supported position to East-North metres on the Local plane of a stated origin, using the azimuthal equidistant projection (east = `d · sin θ`, north = `d · cos θ`, where `d` and `θ` are the great-circle distance and initial Azimuth from the origin).
2. THE Core SHALL convert East-North metres on a Local plane back to a Position.
3. FOR ALL Supported origins and Supported positions within `1000 km` of the origin, projecting to the Local plane and back SHALL return a Position within `1e-4 m` of the original.
4. THE Core SHALL project the origin, and any position less than `1e-3 m` from it, to `(0, 0)`.
5. FOR ALL Supported origins and positions within `1000 km`, the Euclidean length of the projected vector SHALL equal the great-circle distance from the origin within `1e-6 m`.

### Requirement 4: Bearing observation model and wire format

**User Story:** As an app developer, I want one validated, versioned record for a sighting, so that sightings can be stored, shared between phones and replayed in the simulator.

#### Acceptance Criteria

1. THE Core SHALL define a Bearing observation with: a non-empty string id, an observer Supported position, an observer position accuracy in metres (1-sigma, `≥ 0`), a UTC time in milliseconds, an Azimuth in `[0, 2π)` and an Azimuth 1-sigma in radians.
2. WHEN a Bearing observation is validated, THE Core SHALL accept it only if every number is finite, the observer is a Supported position, the Azimuth 1-sigma is in `[0.01°, 45°]` and the position accuracy is in `[0 m, 10 000 m]`.
3. IF validation fails, THEN THE Core SHALL return a failure with reason `invalid_observation` that names the offending field.
4. THE Core SHALL serialise a Bearing observation to a JSON wire format that carries a format version `v: 1`, a `kind` of `"bearing"`, angles in degrees with `Deg` suffixes and time as `timeUtcMs`.
5. THE Core SHALL parse the wire format back into a Bearing observation, applying the same validation.
6. FOR ALL valid Bearing observations, serialising then parsing SHALL produce an observation whose angles equal the original within `1e-12` rad and whose other fields are identical (round-trip property).
7. IF the wire format has an unknown `v` or `kind`, THEN THE Core SHALL return a failure with reason `unsupported_format`.
8. IF the wire format is missing a required field or is not an object, THEN THE Core SHALL return a failure with reason `invalid_observation` and SHALL NOT throw.

### Requirement 5: Generic measurement model

**User Story:** As the skeleton's maintainer, I want the solver to know nothing about bearings, so that a celestial altitude model can be added later for Nonius without touching the solver.

#### Acceptance Criteria

1. THE Core SHALL define a Measurement model interface that, given the full set of observations, supplies the Local plane origin, a starting estimate and a pre-solve geometry check.
2. THE Measurement model interface SHALL, for a candidate state on the Local plane and one observation, return the predicted measurement, the wrapped residual, the Effective sigma and the partial derivatives of the prediction with respect to East and North.
3. THE Measurement model interface SHALL supply a post-solve plausibility check that can reject a Fix with a failure reason or attach warnings to it.
4. THE fix solver SHALL depend only on the Measurement model interface and SHALL contain no logic specific to bearings.
5. THE Core SHALL provide the bearing Measurement model as the first implementation of that interface.
6. WHERE a second Measurement model is added, THE solver SHALL accept it without modification to the solver's source file.

### Requirement 6: Bearing measurement model

**User Story:** As a Vigia user, I want each person's sighting to be weighted by how trustworthy it is, so that a careful sighting counts for more than a shaky one.

#### Acceptance Criteria

1. THE bearing model SHALL predict the measurement as the initial Azimuth on the sphere from the observer to the candidate target Position.
2. THE bearing model SHALL compute the residual as `wrapPi(measured Azimuth - predicted Azimuth)`.
3. THE bearing model SHALL compute the Effective sigma as the square root of `sigmaRad² + (positionSigmaM / rangeM)²`, where `rangeM` is the current distance from observer to candidate target, floored at `1 m`.
4. THE bearing model SHALL supply the centroid of the observer positions as the Local plane origin, and the intersection of the pair of bearings with the largest Crossing angle as the starting estimate.
5. FOR ALL observers and candidate targets between `50 m` and `200 km` apart, the model's partial derivatives SHALL agree with central finite differences (step `0.1 m`) within a relative error of `1e-2` or an absolute error of `1e-10` rad/m.
6. FOR ALL observers and targets between `50 m` and `200 km` apart, a Bearing observation generated from the true target with no noise SHALL have a residual at the true target of magnitude below `1e-9` rad.
7. WHEN the measured Azimuth is `0.01` rad and the predicted Azimuth is `2π - 0.01` rad, THE bearing model SHALL return a residual of `0.02` rad within `1e-12`, not a residual near `-2π`.

### Requirement 7: Fix solver

**User Story:** As a Vigia user, I want the system to work out where the smoke is from everyone's sightings, so that I can give responders a location instead of "over there".

#### Acceptance Criteria

1. WHEN given two or more valid observations and a Measurement model, THE solver SHALL estimate the unknown Position by iterative weighted least squares, re-evaluating each observation's Effective sigma at every iteration.
2. THE solver SHALL stop when an iteration moves the estimate by less than `1e-4 m`, and SHALL return a failure with reason `not_converged` if this has not happened within 50 iterations.
3. IF the normal matrix `Jᵀ W J` cannot be inverted reliably (condition number above `1e12`), THEN THE solver SHALL return a failure with reason `singular_geometry`.
4. FOR ALL targets and sets of 2 to 12 observers, each between `500 m` and `100 km` from the target, with at least one pair of bearings whose Crossing angle is `≥ 10°`, WHEN given the Noise-free observation set, THE solver SHALL return a Fix within `0.01 m` of the true target.
5. FOR ALL solvable observation sets, reordering the observations SHALL change the Fix by less than `1e-3 m` (order independence).
6. FOR ALL solvable observation sets, with every observation's Effective sigma held at its value at the Fix, the Cost at the returned Fix SHALL NOT exceed the Cost at any point `1 m` away in the East, West, North or South direction (local optimality).
7. FOR ALL solvable observation sets, duplicating every observation SHALL leave the Fix unchanged within `1e-3 m`.
8. THE solver SHALL be deterministic: identical inputs SHALL produce identical outputs.
9. THE solver SHALL return, with every successful Fix, each observation's residual and Normalised residual, the number of iterations and the list of warnings.
10. THE solver SHALL complete within `50 ms` for 200 observations on a current laptop.

### Requirement 8: Uncertainty

**User Story:** As someone acting on a fix, I want to see how far off it could be, so that I do not mistake a rough estimate for a precise one.

#### Acceptance Criteria

1. THE solver SHALL return, with every successful Fix, the 2×2 covariance in East-North square metres, computed as the inverse of `Jᵀ W J` at the solution.
2. THE Core SHALL derive from the covariance an Error ellipse: 1-sigma semi-major and semi-minor axes in metres (semi-major `≥` semi-minor `> 0`) and the Azimuth of the major axis in `[0, π)`.
3. THE Core SHALL provide the 95% ellipse by multiplying the 1-sigma axes by `2.4477`.
4. FOR ALL solvable observation sets and factors `k` in `[0.5, 4]`, multiplying every observation's Azimuth 1-sigma and position accuracy by `k` SHALL leave the Fix unchanged within `1e-3 m` and SHALL multiply both ellipse axes by `k` within a relative error of `1e-5`.
5. FOR ALL solvable observation sets, duplicating every observation SHALL divide both ellipse axes by `√2` within a relative error of `1e-5`.
6. FOR ALL Noise-free observation sets that satisfy the conditions of criterion 7.4, adding one further noise-free observation of the same target SHALL NOT increase the determinant of the covariance by more than a relative `1e-9`.
7. THE covariance matrix SHALL be symmetric and positive definite for every successful Fix.
8. WHEN 1000 trials are run with a fixed seed, each with 3 observers between `1 km` and `20 km` from the target, pairwise Crossing angles `≥ 30°`, exact observer positions and Gaussian Azimuth noise of 1-sigma `2°`, THE 95% ellipse SHALL contain the true target in at least 90% and at most 99% of trials, counting any failed trial as not contained (calibration).

### Requirement 9: Degenerate and hostile input

**User Story:** As a Vigia user, I want the system to tell me when it cannot give a meaningful answer, so that I am never shown a location that the sightings do not support.

#### Acceptance Criteria

1. IF fewer than two valid observations are supplied, THEN THE solver SHALL return a failure with reason `insufficient_observations`.
2. IF every pair of observers is less than `1 m` apart, THEN THE bearing model's pre-solve check SHALL return a failure with reason `colocated_observers`.
3. IF the largest Crossing angle among all pairs of bearings is below `0.5°`, THEN THE bearing model's pre-solve check SHALL return a failure with reason `singular_geometry`.
4. IF the largest Crossing angle is at least `0.5°` and below `20°`, THEN THE Core SHALL return the Fix with the warning `poor_geometry`.
5. IF the best-fit Position lies behind any observer that was not excluded as an outlier, meaning that observation's residual exceeds `90°` in magnitude, THEN THE bearing model's post-solve check SHALL return a failure with reason `diverging_bearings`.
6. IF the Fix lies more than `500 km` from the Local plane origin, THEN THE Core SHALL return a failure with reason `out_of_range`.
7. WHEN observers lie on both sides of the ±180° meridian, THE Core SHALL return the same Fix, within `0.01 m`, as for the same configuration shifted `90°` in longitude and shifted back.
8. THE Core SHALL NOT throw, and SHALL NOT return `NaN` or infinite values, for any input that passes type checking.

### Requirement 10: Outlier handling

**User Story:** As a Vigia user, I want one person pointing at the wrong smoke not to drag the answer away, so that the crowd's fix stays trustworthy.

#### Acceptance Criteria

1. WHEN four or more observations are supplied and outlier rejection is enabled, THE solver SHALL, after solving, exclude the observation with the largest Normalised residual if its magnitude exceeds `3.5`, and solve again.
2. THE solver SHALL repeat the exclusion until no Normalised residual exceeds `3.5` or only three observations remain.
3. THE solver SHALL run the post-solve plausibility check only after exclusion has finished, and only on the observations that remain.
4. THE solver SHALL return the ids of all excluded observations and SHALL add the warning `outliers_excluded` when any were excluded.
5. FOR ALL targets with 8 to 12 observers placed between `5 km` and `7 km` from the target, in directions from the target that span at least `120°`, each with exact position and Azimuth 1-sigma `2°`, WHEN the Noise-free observation set is extended by one observation from the same range band whose Azimuth is wrong by between `30°` and `80°`, THE solver SHALL return a Fix within `1 m` of the true target and SHALL list exactly that observation as excluded.
6. WHERE outlier rejection is disabled, THE solver SHALL use every valid observation and SHALL exclude none.

### Requirement 11: Purity and packaging

**User Story:** As a developer, I want the core to run identically in a browser, in Node and in tests, so that results are reproducible everywhere.

#### Acceptance Criteria

1. THE Core SHALL have no runtime dependencies.
2. THE Core SHALL NOT read the clock, generate random numbers, perform I/O or reference browser or Node globals; time and seeds SHALL be passed in as arguments.
3. THE Core SHALL export its public API only from `src/index.ts`.
4. THE Core SHALL represent every expected failure as a Result with a machine-readable reason drawn from a closed set documented in the public API.
5. THE Core SHALL build and pass its tests under TypeScript `strict` mode with no use of `any`.
