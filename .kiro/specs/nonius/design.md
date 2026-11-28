# Design Document: nonius

## 1. Context and scope

`apps/nonius` (`@alidade/nonius`): a position from two or more Sun sights by one observer who does not move. Source of truth: `requirements.md` in this folder, as amended by the lead's decisions of 2026-11-20. `Req N.M` points there; `Core Req`, `Sensors Req`, `UI Req` and `Vigia Req` point into those specifications. The skeleton is used through its three `src/index.ts` files, with one change made before task group 9: skeleton-ui task group 32 (`DeviceSighting` takes `kind`). Everything here that is a screen, a store or a test helper follows Vigia's built code in pattern (§9); everything that is mathematics is new (§6, §7).

The first release is Requirements 1 to 9, 11 to 15 and Requirement 10.1, 10.2 and 10.7. The best time (Req 10.3 to 10.6) is task group 11 and may be cut.

## 2. Dependencies

| Package                                                                                                                                     | Version                         | Where           | Why                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------- | ------------------------------------------ |
| `@alidade/core`, `@alidade/sensors`, `@alidade/ui`                                                                                          | `workspace:*`                   | dependencies    | the skeleton                               |
| `react`, `react-dom`                                                                                                                        | `19.3.1`                        | dependencies    | Vigia's                                    |
| `maplibre-gl`                                                                                                                               | `6.16.0`                        | dependencies    | its stylesheet only (UI loads the library) |
| `astronomy-engine`                                                                                                                          | `2.1.19`                        | dependencies    | the Sun's position (`tech.md`; Req 1.1, 3) |
| `vite`, `typescript`, `vitest`, `fast-check`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@types/react`, `@types/react-dom` | as in `apps/vigia/package.json` | devDependencies | Vigia's                                    |

**`astronomy-engine` 2.1.19.** MIT, by Donald Cross; no dependencies; published 2023-12-14T18:20Z (the registry's `time`), so the 14-day rule holds. Its `package.json` has `"sideEffects": false` and an ESM entry (`esm/astronomy.js`), so the bundler keeps only what the wrapper imports. Installed in task 1.3 with `pnpm add -E astronomy-engine@2.1.19` from `apps/nonius`.

**What it adds to the bundle (Req 3.8).** Measured on 2026-11-20 in a scratch folder outside the repository: an entry importing exactly the wrapper's names (`AstroTime`, `Body`, `GeoVector`, `Rotation_EQJ_EQD`, `RotateVector`, `EquatorFromVector`, `SiderealTime`), bundled by the repository's `rolldown` 1.2.19 with tree-shaking and minification: **48.8 kB minified, 21.5 kB with gzip -9.** The same probe gave, for 1992-10-13T00:00Z, a declination of `−7.7843°` and a right ascension of `13.22525 h`; task 3 compares such values with the printed fixture. Task 12 measures the library's share again in the real build.

## 3. Design decisions

- **D1 — Layers by folder, three Vitest projects (Req 1.2, 1.3, 1.11).** As Vigia D1: the layer of a file is the nearest folder named `math`, `adapters` or `components` under `src/`. `math` and `adapters` run in `node`, `components` in `jsdom`. The Math layer imports `@alidade/core`, `@alidade/sensors`, pure names of `@alidade/ui` (no component, no hook) and, in `math/sun/sun-wrapper.ts` only, `astronomy-engine`. `main.tsx` and `system.ts` are the composition root.
- **D2 — `NoniusResult`, `NoniusReason`, `messageFor` (Req 2).** As Vigia D2. `NoniusResult<T> = Success<T> | NoniusFailure`; `NoniusFailure` has the fields of `UiFailure` and `reason: NoniusReason`; `NoniusReason = UiReason | NoniusOnlyReason` (the 11 of Req 2.2, in `NONIUS_ONLY_REASONS`). `MESSAGES: Record<NoniusReason, MessageSource> = { ...uiRows(), ...SIGHT_ROWS, ...ONLY_ROWS }`, `SIGHT_ROWS` overriding UI's words for the six Core reasons `solve` returns (§8.1).
- **D3 — The Sun wrapper (Req 3).** One module, three functions, §6.1. Time goes to the library as UT days since J2000 (`(timeUtcMs − 946 728 000 000) / 86 400 000`), never as a `Date`. Position of date: `EquatorFromVector(RotateVector(Rotation_EQJ_EQD(t), GeoVector(Body.Sun, t, true)))`, which is geocentric, with aberration, on the true equator and equinox of date. `GHA = wrapTwoPi(15° · (SiderealTime(t) − ra))`, `SiderealTime` being apparent sidereal time, so both are of the true equinox. Every call is in `try`; a throw or a non-finite number is `sight_time_unsupported` naming the field.
- **D4 — Refraction and its inverse (Req 4.7, 4.11).** `refractionRad(apparentRad)` is Bennett's formula. `apparentFromGeometricRad(geometricRad)` solves `a − R(a) = g` by 64 bisections on `[g, g + 1°]`: `a − R(a)` is increasing (R is decreasing) and `R` is under `1°` for `a ≥ −1°`, so the root is in the bracket, and 64 halvings of `1°` reach below `1e-19` rad. It is deterministic and total. The Simulation (§10), the Index error (§7.4) and the tests use it.
- **D5 — Sights are raw; the calibration applies at the Fix (Req 4.4, 4.5, 4.12).** Every capture is taken with UI's `altitudeCalibration: { offsetRad: 0, sigmaRad: 0 }`, so Sensors returns the raw mean and its sample standard deviation. A `Sight` stores those. `prepareSights(sights, calibration, params)` makes, each time a Fix is computed, the corrected altitudes, the refraction, both sigmas and the Subsolar point, and sets aside a Sight whose corrected altitude is out of the limits (`sun_too_low`, `sun_too_high`). Measuring or removing the Index error therefore changes every Fix at once, and no Sight carries a stale calibration.
- **D6 — The Index error is a mean in the apparent domain (Req 15.3, 15.8).** `dₖ = rawₖ − apparentFromGeometricRad(geometric altitude at the location)`. Taking the difference of apparent altitudes makes the correction `raw − IE` give back the true apparent altitude exactly, so the noise-free property holds to `1e-9` rad; a difference of geometric altitudes would leave `R(a) − R(a + b)`, up to `3′` at 5° for `b = 3°`.
- **D7 — The altitude model (Req 5).** `createAltitudeModel(start, params)`, §6.4. Prediction by the formula of Req 5.2 from the observation's Subsolar point, which `prepareSights` computed once. Partial derivatives by central differences of step `1 m` on the plane of the call's origin (four extra unprojections), because they are then the exact derivatives of the function Core minimises on that plane, at any distance from the origin; at the Fix, where Core takes the covariance, the plane is the Fix's own and the differences equal the analytic `(sin A, cos A) / R` (P-5.8). `evaluate` refuses a candidate farther than `PLANE_LIMIT_M` from its origin with `out_of_range` (Req 5.11).
- **D8 — Candidates in closed form (Req 6.2).** §7.1: two small circles on the unit sphere, as vectors. The pair is the one with the largest Angle of cut, which both crossings share.
- **D9 — The re-centred solve (Req 7.8).** §7.2. Every solve of the app is `recentredSolve`; it is the only caller of Core's `solve`.
- **D10 — Two solves per Candidate: the check solve judges, the Fix solve places (Req 7.1, 8.5; the lead's decision 4).** The check solve weighs each Sight by `hypot(σi, σc)` and runs Core's outlier rejection; its Studentised residuals are the test of disagreement and its `excludedIds` the outliers. The Fix solve weighs by `σi` alone on the Sights kept, and its covariance is Core's for the independent part. **Why the check solve has the full sigma:** with `σi` alone, a shared error appears as disagreement. Three Sights whose Sun azimuths are `−60°`, `0°`, `60°` leave one residual direction, `v = (1, −1, 1) / √3`; a shared shift `b` leaves residuals `b · (v·1) · v`, that is `b / 3` on each, while each Sight's residual sigma is `σi · √(1 − h) = σi / √3`. With `b = 3.5°` and `σi = 0.5°` the Studentised residual is about `4` in every set, so Req 8.5's 2 % would fail in the uncalibrated band. With the full sigma, the residual variance the test assumes is `σi² + σc²` per Sight in the residual space, against a true `σi² + σc² (v·1)²`, and `(v·1)² = 1/3` here: the test is conservative. It can be liberal only when `(v·1)² > 1`, which needs Sun azimuths spread over more than about `180°` (the polar summer); Req 8.5's measurement is the proof, by band.
- **D11 — The shared error by sensitivity (Req 7.2, 7.9; the lead's decision 4).** §7.3, with its proof on the linear case.
- **D12 — The choice (Req 6).** §7.5: a fixed ladder, Sun side, then fit, then Two places; one pure function `assess`.
- **D13 — The user's choice of place is memory only, keyed by the used set (Req 6.7, 12.2).** `UserChoice = { usedIdsKey: string; placeIndex: 0 | 1 }`, `usedIdsKey` the sorted used ids joined by a newline. `assess` applies it only when the key equals the current one; any change to the used set, to the Index error or a reload clears it (the store drops it on every such action). Places are ordered by latitude, then longitude, and labelled A and B in that order.
- **D14 — Words from one formatter (Req 8, 9).** As Vigia D9: `lengthText95` rounds up (10 km below 1 000 km, 100 km from it), `positionText` prints with the decimals of Req 9.1, `calibrationText` prints the Calibration in use. No number reaches a sentence any other way. §8.
- **D15 — Geometry class and advice (Req 10).** The class is Vigia's function with Nonius's words. The simple advice scans the Sun's azimuth at the Fix (§7.6); no solve. The best time (task group 11) runs the candidate pipeline of §7.3 with one hypothetical Sight per grid time.
- **D16 — The map is a pure model (Req 9.4 to 9.6, 11.4).** `mapModel(assessment, comparison, params)` returns `{ fix: ShownFix | null; layers: AppLayer[] }`; the Map screen passes it to UI's `MapView`. Five layers at most (UI allows 8): `circles-used`, `circles-set-aside`, `places-area`, `places-point`, `gps`. Two places are drawn by renaming the `kind` of each feature of UI's `fixFeatures` (`fix` → `place-point`, `fix-ellipse-95` → `place-area`) with the geometry untouched, so the ellipse polygon is still UI's.
- **D17 — One module asks for a location (Req 1.4, 11.2, 15.2).** `components/ask-location.ts`: `askLocationOnce(createSource, limits)` makes a Sensor source, calls `startPosition` once, checks the fix with Sensors' `checkPositionFix` against `LOCATION_COARSE_LIMIT_M`, calls `stop()`, and returns the fix or the failure. The Comparison and the Index error screen are its only callers; Simulation mode never calls it (the scene's truth is used).
- **D18 — State: a pure reducer, effects as data, one store (Req 12; Vigia D3, D4).** `applyAction(state, action)` in `math/state/`; the store in `components/store.ts` runs it, saves after each action that changes saved data, and holds the memory-only parts (user choice, Comparison, the Index error session). Stored format §6.7.
- **D19 — Screens (Req 1.10, 4, 6.7, 9, 11, 15).** §9: three tabs (Fix, Sights, Map), three full screens (Sight, Index error, How it works), Vigia's patterns exactly.
- **D20 — Simulation: one UI scene per Sight time (Req 13; the lead's decision 6).** §10. The phone bar holds the Sight time.
- **D21 — Parameters: one record, one check (Req 14).** As Vigia D18: `defaults.ts` holds the named constants with their comments, `defaultParameters()` assembles `NoniusParameters`, `checkParameters` names the first bad field.
- **D22 — Statistical tests run in full in `test:deep` (Req 7.3, 8.5, 8.6, 10.7).** One harness (`test-support/run-harness.ts`) produces the runs of Req 7.3 and 8.5 together. In `test:deep` it runs `2 000` runs per band and applies the bounds; in `pnpm test` the same code runs `200` per band and reports the shares without applying them, because at 200 runs the 90 % bound is within the sampling noise of an honest 93 %. Estimated cost: about 10 Core solves per run at about `0.5 ms` each, about 40 s for the deep run; checkpoint 7 reports the measured time.
- **D23 — The sphere's radius (Req 5.8, 15.3, 9.4).** `math/sphere/earth.ts` exports `EARTH_RADIUS_M = 6 371 008.8` (`math-conventions.md`). Core does not export its radius; a test checks that Core's `greatCircleDistanceM` over one radian of the equator equals it within `1e-6 m`, so the two cannot drift apart.

## 4. Modules

Files under `apps/nonius/src/`. Each public function returns a `NoniusResult` (or a plain value where it cannot fail) and is in the hostile registry (Req 2.6). Every function that has limits takes `params: NoniusParameters`.

| Module                                                        | Public functions and types                                                                                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `result.ts`, `reasons.ts`                                     | `NoniusResult`, `NoniusFailure`, `NoniusReason`, `NONIUS_ONLY_REASONS`, `ok`, `err` (internal)                                                                                   |
| `defaults.ts`                                                 | the constants of Req 14.1; `defaultClock`, `defaultTimer` (the one module that reads time)                                                                                       |
| `math/degrees.ts`                                             | `fromDeg`, `toDeg`, `fromArcmin`, `HOURS_TO_DEG` (the one conversion module)                                                                                                     |
| `math/parameters.ts`                                          | `NoniusParameters`, `defaultParameters()`, `checkParameters(p)`                                                                                                                  |
| `math/messages.ts`                                            | `messageFor(failure): Message`                                                                                                                                                   |
| `math/civil-time.ts`                                          | `utcClockText(utcMs)`, `utcDateText(utcMs)`, `ageText(ms)`, `waitText(ms)` (integer arithmetic, no `Date`; Vigia's pattern)                                                      |
| `math/sphere/earth.ts`                                        | `EARTH_RADIUS_M` (D23)                                                                                                                                                           |
| `math/sphere/circle-crossings.ts`                             | `circleCrossings(centreA, radiusARad, centreB, radiusBRad): NoniusResult<readonly Position[]>` (0, 1 or 2)                                                                       |
| `math/sphere/circle-arc.ts`                                   | `circleArc(centre, radiusRad, near, halfLengthM, stepRad): NoniusResult<readonly (readonly Position[])[]>` (segments split at `±180°`)                                           |
| `math/sun/sun-wrapper.ts`                                     | `sunPosition(timeUtcMs, params)`, `subsolarPoint(timeUtcMs, params)`, `greenwichSiderealTimeRad(timeUtcMs, params)`                                                              |
| `math/sun/refraction.ts`                                      | `refractionRad(apparentRad)`, `apparentFromGeometricRad(geometricRad)`                                                                                                           |
| `math/sun/sun-at.ts`                                          | `sunAt(position, timeUtcMs, params): NoniusResult<{ trueAzimuthRad; geometricAltitudeRad; apparentAltitudeRad }>`                                                                |
| `math/sight/sight.ts`                                         | `Sight`, `SunSide`, `sightFromCapture(captured, sunSide, existingIds, simulated, params)`                                                                                        |
| `math/sight/sun-side.ts`                                      | `sunSideFromFrozen(frozen: FrozenSighting, params): SunSide \| null`                                                                                                             |
| `math/sight/index-error.ts`                                   | `IndexError`, `CalibrationInUse`, `calibrationInUse(indexError \| null)`, `indexErrorFromSights(calibrationSights, location: PositionFix, nowUtcMs, simulated, params)`          |
| `math/sight/prepare.ts`                                       | `PreparedSight`, `prepareSights(sights, calibration, params): { prepared; setAside }`                                                                                            |
| `math/fix/altitude-model.ts`                                  | `AltitudeObservation`, `observationsOf(prepared, sigmaKind, shiftRad)`, `createAltitudeModel(start, params): MeasurementModel<AltitudeObservation>`                              |
| `math/fix/candidates.ts`                                      | `candidates(prepared, params): NoniusResult<{ pairIds; places: readonly Position[]; angleOfCutRad }>`                                                                            |
| `math/fix/recentred-solve.ts`                                 | `recentredSolve(observations, start, options, params): NoniusResult<Fix>`                                                                                                        |
| `math/fix/shared-error.ts`                                    | `sharedErrorCovariance(base, fixPosition, shiftedFix, commonSigmaRad, stepRad)`, where `shiftedFix(sign)` returns the Fix solved with every altitude shifted by `sign · stepRad` |
| `math/fix/solve-candidate.ts`                                 | `checkSolve(prepared, candidate, params)`, `placeFix(prepared, check, calibration, params): NoniusResult<ShownFix>`                                                              |
| `math/fix/sun-side-check.ts`                                  | `contradicts(fixPosition, prepared, params): { usable: number; contradictedBy: SightId \| null; … }`                                                                             |
| `math/fix/assess.ts`                                          | `Assessment`, `assess(sights, indexError, userChoice, params)` (§7.5)                                                                                                            |
| `math/fix/statements.ts`                                      | `countStatement(n)`, `disagreementStatement(assessment)`                                                                                                                         |
| `math/fix/format.ts`                                          | `lengthText95`, `nauticalText`, `positionText`, `compassWord8`, `calibrationText`                                                                                                |
| `math/fix/fix-words.ts`                                       | `fixWords(assessment, nowUtcMs, params)`, `placeWords(place, label, params)`, `oneSightWords(prepared)`                                                                          |
| `math/fix/geometry-class.ts`                                  | `geometryClass(fix, params)`                                                                                                                                                     |
| `math/fix/advice.ts`                                          | `nextSightAdvice(fix, prepared, nowUtcMs, params)`, `ruleOfThumb(params)`                                                                                                        |
| `math/fix/best-time.ts`                                       | `bestTime(...)` (task group 11 only)                                                                                                                                             |
| `math/fix/comparison.ts`                                      | `compare(shownFix, gps: Position, params)`                                                                                                                                       |
| `math/fix/map-model.ts`                                       | `mapModel(assessment, comparison, params)`                                                                                                                                       |
| `math/state/state.ts`, `apply-action.ts`, `storage-format.ts` | `NoniusState`, `Action`, `applyAction`, `serialiseState`, `parseState`                                                                                                           |
| `math/scenes/sun-scenes.ts`                                   | `NoniusScene`, `sunScenes(params)`, `catalogueSceneAt(scene, sightIndex, params): NoniusResult<CatalogueScene>`                                                                  |
| `adapters/storage.ts`                                         | `createStorage(storageLike, key)`, `createMemoryStorage()` (Vigia's pattern)                                                                                                     |
| `components/`                                                 | `look.ts`, `PrimaryAction.tsx`, `TabBar.tsx`, `store.ts`, `ask-location.ts`, `environment.ts`, screens of §9, `simulation/` of §10                                               |
| `main.tsx`, `system.ts`, `App.tsx`                            | the composition root                                                                                                                                                             |

## 5. Data model

```ts
interface SunSide {
  readonly azimuthRad: number;
  readonly northReference: 'magnetic' | 'true';
}

interface Sight {
  readonly id: string; // `sight-<frozenAtUtcMs>`, `-2`, `-3` … if taken
  readonly timeUtcMs: number; // middle of the Frozen window (Req 4.5)
  readonly rawApparentAltitudeRad: number; // Sensors' mean, calibration { 0, 0 }
  readonly sampleStdDevRad: number;
  readonly markSigmaRad: number; // UI's ε, 0 without a Mark
  readonly sunSide: SunSide | null;
  readonly simulated: boolean;
}

interface IndexError {
  readonly valueRad: number; // mean of measured − computed apparent altitude
  readonly sigmaRad: number;
  readonly sightCount: number;
  readonly measuredUtcMs: number;
  readonly simulated: boolean;
}

type CalibrationInUse =
  | { readonly kind: 'index_error'; readonly indexError: IndexError }
  | { readonly kind: 'uncalibrated'; readonly sigmaRad: number }; // UNCALIBRATED_ALTITUDE.sigmaRad

interface PreparedSight {
  readonly sight: Sight;
  readonly correctedApparentAltitudeRad: number; // raw − IE (or raw)
  readonly observedGeometricAltitudeRad: number; // corrected − R(corrected)
  readonly independentSigmaRad: number; // hypot(sd, ε, AIM, 0.1 · R)
  readonly commonSigmaRad: number;
  readonly subsolar: Position;
  readonly sunDeclinationRad: number;
}

interface AltitudeObservation {
  readonly id: string;
  readonly timeUtcMs: number;
  readonly observedAltitudeRad: number; // geometric, plus the sensitivity shift
  readonly correctedApparentAltitudeRad: number; // for `validate`
  readonly sigmaRad: number; // σi (Fix solve) or hypot(σi, σc) (check solve)
  readonly subsolar: Position;
}

type ShownFix = Fix; // Core's type: the covariance and ellipse replaced (Req 7.1); see §7.3

interface Place {
  readonly label: 'A' | 'B';
  readonly fix: ShownFix;
  readonly check: Fix;
}

type Choice =
  | { readonly kind: 'single' } // the two converged together
  | {
      readonly kind: 'sun_side';
      readonly sightId: string;
      readonly measuredTrueAzimuthRad: number;
      readonly otherAzimuthRad: number;
      readonly otherDistanceM: number;
    }
  | {
      readonly kind: 'fit';
      readonly worstMissRad: number;
      readonly compassDisagreedWithBoth: boolean;
    }
  | { readonly kind: 'other_failed'; readonly compassDisagrees: boolean }
  | {
      readonly kind: 'user';
      readonly label: 'A' | 'B';
      readonly otherDistanceM: number;
      readonly otherAzimuthRad: number;
    };

type TwoPlacesWhy = 'two_sights' | 'no_sun_side' | 'sun_side_undecided' | 'equinox';

type Assessment =
  | { readonly kind: 'empty'; readonly calibration: CalibrationInUse }
  | {
      readonly kind: 'one';
      readonly calibration: CalibrationInUse;
      readonly sight: PreparedSight;
      readonly setAside: readonly SetAside[];
    }
  | {
      readonly kind: 'failed';
      readonly calibration: CalibrationInUse;
      readonly failure: NoniusFailure;
      readonly used: readonly PreparedSight[];
      readonly setAside: readonly SetAside[];
    }
  | {
      readonly kind: 'two_places';
      readonly calibration: CalibrationInUse;
      readonly places: readonly [Place, Place];
      readonly distanceM: number;
      readonly why: readonly TwoPlacesWhy[];
      readonly usedIdsKey: string;
      readonly used: readonly PreparedSight[];
      readonly setAside: readonly SetAside[];
    }
  | {
      readonly kind: 'fix';
      readonly calibration: CalibrationInUse;
      readonly fix: ShownFix;
      readonly check: Fix;
      readonly choice: Choice;
      readonly disagreement: boolean;
      readonly usedIdsKey: string;
      readonly used: readonly PreparedSight[];
      readonly setAside: readonly SetAside[];
    };

interface SetAside {
  readonly sight: Sight;
  readonly cause: 'outlier' | 'sun_too_low' | 'sun_too_high';
}
```

**Stored format** (`math/state/storage-format.ts`; Req 12): key `nonius.state` on a phone, `nonius.simulation.state` in Simulation mode, backup `<key>.backup`.

```json
{
  "format": "nonius-state",
  "version": 1,
  "sights": [
    {
      "id": "…",
      "timeUtcMs": 0,
      "rawApparentAltitudeRad": 0,
      "sampleStdDevRad": 0,
      "markSigmaRad": 0,
      "sunSide": null,
      "simulated": false
    }
  ],
  "indexError": null
}
```

Numbers are written as JSON numbers, which give back the same double. `parseState` follows Vigia D4: a corrupt or foreign value is copied once to the backup key and the app starts with what could be read (`storage_corrupt`); a higher `version` is left alone and the app runs in memory (`storage_version_unsupported`). A Sight with a non-finite field, a duplicate id or a time outside the wrapper's range is dropped with `storage_corrupt`. No field holds a Position (P-12.7 scans the parsed state for `latRad`).

## 6. The mathematics

### 6.1 The Sun wrapper (`math/sun/sun-wrapper.ts`, Req 3)

```
ut      = (timeUtcMs − 946 728 000 000) / 86 400 000          // J2000 = 2000-01-01T12:00Z
t       = new AstroTime(ut)
eqd     = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(t), GeoVector(Body.Sun, t, true)))
δ       = fromDeg(eqd.dec)
GHA     = wrapTwoPi(fromDeg(HOURS_TO_DEG · (SiderealTime(t) − eqd.ra)))
subsolar = { latRad: δ, lonRad: wrapPi(−GHA) }
```

The range check of Req 3.2 comes first. `greenwichSiderealTimeRad` is `fromDeg(HOURS_TO_DEG · SiderealTime(t))`, for Meeus 12.a and 12.b, which print both mean and apparent sidereal time; the fixture compares with the apparent value.

### 6.2 Refraction (`math/sun/refraction.ts`, Req 4.7)

`R(a) = fromArcmin(1 / tan(fromDeg(h + 7.31 / (h + 4.4))))` with `h = toDeg(a)`, for `a` in `[−1°, 90°]`; outside, `invalid_number`. Inverse: D4.

### 6.3 Sights (`math/sight/`, Req 4, 15)

- `sightFromCapture`: from UI's `CapturedResult` of kind `altitude`: `rawApparentAltitudeRad = capture.apparentAltitudeRad`, `sampleStdDevRad = capture.sampleStdDevRad`, `markSigmaRad = details.markSigmaRad ?? 0`, `timeUtcMs = window.endUtcMs − window.lengthMs / 2`. Refuses with `sight_time_unsupported`, `sights_full`, and `sun_too_low`/`sun_too_high` on the altitude corrected by the Calibration in use at capture time.
- `sunSideFromFrozen`: the samples of `selectWindow(frozen.history, frozen.window)`; for each, `rayDirection(sample.rotation, mark?.rayOffset)` and `directionAzimuthRad`; for a Relative frame, `applyYawReference` with `frozen.yawReference` (none, or a failure: `null`); `summariseAzimuths` gives the circular mean. North reference: the Yaw reference's, else `magnetic` for an Absolute frame.
- `prepareSights`: for each Sight, `corrected = raw − IE` (or `raw`), limits (D5), `geometric = corrected − R(corrected)`, `σi = hypot(sd, ε, AIM_SIGMA_RAD, REFRACTION_SIGMA_FRACTION · R(corrected))`, `σc` from the Calibration in use, `subsolar` from the wrapper.
- `indexErrorFromSights` (§7.4).

### 6.4 The altitude model (`math/fix/altitude-model.ts`, Req 5)

For an observation with Subsolar point `(δ, λs)` and a candidate `c` on the plane of origin `O`:

```
P            = unprojectToLocalPlane(O, c)                         // fails: returned
h(P)         = asin(clamp₁₀⁻¹²(sin φ · sin δ + cos φ · cos δ · cos(λ − λs)))   // LHA = GHA + λ = λ − λs
residual     = observedAltitudeRad − h(P)
∂h/∂E        = (h(unproject(c + 1 m·ê)) − h(unproject(c − 1 m·ê))) / 2 m      (and ∂h/∂N likewise)
σ            = observation.sigmaRad
evaluate     = out_of_range if hypot(c) > PLANE_LIMIT_M
```

`origin` returns `start`; `startEstimate` returns `(0, 0)`; `geometryCheck` takes `initialAzimuthRad(start, subsolarₖ)` for each observation and the largest Angle of cut over pairs (`< 0.5°`: `singular_geometry`; `< POOR_GEOMETRY_CROSSING_RAD`: `poor_geometry`); `postSolveCheck` returns no warning; `validate` per Req 5.7; `idOf` the id. The model reads nothing but its arguments.

Why the differences are good enough: `h` changes by about `1.6e-7` rad per metre; a double carries `h` to about `1e-16` rad, so the difference quotient is good to about `1e-9` relative, and the truncation error of a central difference of `1 m` on a function whose curvature scale is the Circle's radius (at least 1 110 km) is below `1e-12` relative.

## 7. Algorithms

### 7.1 Candidates (`math/fix/candidates.ts`, `math/sphere/circle-crossings.ts`, Req 6.2)

Unit vectors `a`, `b` of the two Subsolar points, radii `ρa`, `ρb` (`π/2 − observed geometric altitude`). With `γ = a·b` and `1 − γ² < 1e-12` treated as no crossing (the same Subsolar point):

```
x = α a + β b,   α = (cos ρa − γ cos ρb) / (1 − γ²),   β = (cos ρb − γ cos ρa) / (1 − γ²)
t² = (1 − |x|²) / (1 − γ²)        // |x|² = α² + β² + 2αβγ
t² < −1e-12: none;  |t²| ≤ 1e-12: one (x normalised);  otherwise two: x ± t (a × b)
```

Each crossing is converted to `{ latRad: asin(z), lonRad: atan2(y, x) }`, and dropped if not Supported. For every pair of used Sights (by id order), the Angle of cut at its first crossing from `initialAzimuthRad` to both Subsolar points; the pair with the largest wins, the first in order on a tie. `circles_do_not_meet` when no pair has a crossing.

### 7.2 The re-centred solve (`math/fix/recentred-solve.ts`, Req 7.8, 5.11)

```
start₀ = start; previous = none
for round in 1 … MAX_RECENTRE_ROUNDS:
  fix = solve(createAltitudeModel(startᵣ), observations, options)    // Core; failure returned
  if previous ≠ none and greatCircleDistanceM(fix.position, previous) < RECENTRE_TOLERANCE_M: return fix
  previous = fix.position; startᵣ₊₁ = fix.position
return not_converged
```

**The 1 000 km bound holds at every call.** Core evaluates the model at the start `(0, 0)`, at trial points of its step control and at accepted points; a trial point beyond `PLANE_LIMIT_M` fails to evaluate, and Core's step control counts a failed trial as a rise in cost and halves the step (Core `solver.ts`, the step-control loop); a point is accepted only after it has evaluated. Core's covariance and Studentised residuals are taken on the Fix's own plane at `(0, 0)`. So no projection or unprojection of Core's Local plane is made beyond its guaranteed `1 000 km`. A solution that lies beyond makes the smallest step fail too; Core returns that `out_of_range`, and so does the Nonius solve. Two other uses go farther and do not rely on the plane's round trip: UI's `fixFeatures` unprojects ellipse vertices up to 2 000 km through `destinationPosition` (Core Req 2.4, to 10 000 km), and the Comparison projects up to 3 000 km through the distance and initial azimuth (Core Req 2.4, 2.5).

### 7.3 One Candidate: check, place, shared error (`math/fix/solve-candidate.ts`, `shared-error.ts`, Req 7.1, 7.2)

```
check  = recentredSolve(observationsOf(used, 'full', 0), candidate, { outlierRejection: true })
kept   = used without check.excludedIds
fix    = recentredSolve(observationsOf(kept, 'independent', 0), check.position, { outlierRejection: false })
F±     = recentredSolve(observationsOf(kept, 'independent', ±SENSITIVITY_STEP_RAD), fix.position, { outlierRejection: false })
g      = (projectToLocalPlane(fix.position, F₊.position) − projectToLocalPlane(fix.position, F₋.position)) / (2 · SENSITIVITY_STEP_RAD)
C      = fix.covariance + σc² · g gᵀ
shown  = { ...fix, covariance: C, ellipse: ellipseFromCovariance(C),
           excludedIds: check.excludedIds, warnings: union(fix.warnings, check.warnings) }
```

`fix_too_uncertain` when `ellipse95(shown.ellipse).semiMajorM > MAX_FIX_SEMI_MAJOR_95_M`.

**Proof on the linear case (P-7.9).** Let the measurements be `y = Jx + 1·b + e`, with `e` independent of covariance `D = diag(σi²)`, `b` a shared error of variance `σc²`, and the weighted least-squares estimate `x̂ = A y`, `A = (JᵀWJ)⁻¹JᵀW`, `W = D⁻¹`. Then `Cov(x̂) = A (D + σc² 11ᵀ) Aᵀ = (JᵀWJ)⁻¹ + σc² (A1)(A1)ᵀ`, because `A D Aᵀ = (JᵀWJ)⁻¹JᵀW D W J (JᵀWJ)⁻¹ = (JᵀWJ)⁻¹`. Core's covariance of the Fix solve is `(JᵀWJ)⁻¹` with `W` from the Independent sigmas. Shifting every measurement by `±δ` gives `x̂ ± δ A1` exactly, so `g = (x̂₊ − x̂₋) / 2δ = A1`. Hence `C` is the covariance of the estimate the app shows. On the sphere the model is linear only locally; P-7.3 tests the whole.

### 7.4 The Index error (`math/sight/index-error.ts`, Req 15)

For calibration sights (each a raw `Sight`), a location `L` (a Sensors `PositionFix` with its 1-sigma `σpos`):

```
dₖ  = rawₖ − apparentFromGeometricRad(sunAt(L, tₖ).geometricAltitudeRad)
IE  = mean(dₖ)
s   = max(sampleStdDev(dₖ) if n ≥ 2, rms(σi,ₖ))      // σi,ₖ with the refraction term at rawₖ
σIE = sqrt(s² / n + (σpos / EARTH_RADIUS_M)² + SUN_ALTITUDE_SIGMA_RAD²)
```

Refusals: a calibration sight out of the limits (on the raw altitude), `n = 0` (`insufficient_samples`), `|IE| > MAX_INDEX_ERROR_RAD` (`index_error_implausible`). The result is `{ valueRad: IE, sigmaRad: σIE, sightCount: n, measuredUtcMs: t_last, simulated }`. `L` is an argument and is not in the result.

### 7.5 The assessment (`math/fix/assess.ts`, Req 6, 7, 8)

```
calibration = calibrationInUse(indexError)
{ prepared, setAside } = prepareSights(sights, calibration)
0 used → empty;  1 used → one
candidates → failure: failed
checks = check solve per Candidate (failed ones dropped); none → failed (the first failure in Candidate order)
if two and greatCircleDistanceM(checkA, checkB) < SAME_FIX_DISTANCE_M: keep the lower Cost → choice single
if one: choice other_failed (compassDisagrees = Sun side contradicts it)
if two:
  sunA, sunB = contradicts(checkA), contradicts(checkB)        // §7.5.1
  exactly one not contradicted (and the other contradicted) → choice sun_side
  else if used ≥ 3 and |CostA − CostB| ≥ CROSSING_COST_MARGIN → choice fit
  else if userChoice matches usedIdsKey → choice user
  else → two_places (each place through placeFix; why from §7.5.2)
fix   = placeFix(chosen)        // §7.3; failure → failed
disagreement = used = 3 and some |check.residuals[i].studentisedResidual| > OUTLIER_STUDENTISED_RESIDUAL
setAside += check.excludedIds as outlier
```

Cost is `Σ normalisedResidual²` of the check solve. Two places are placed in latitude, then longitude order.

**7.5.1 Sun side.** For a check Fix `F` and each used Sight with a Sun side: the measured true azimuth is the Sun side's azimuth if `true`, else `trueAzimuthFromMagnetic(az, declinationAt(F, t))` (a failure leaves the Sight out); the computed one is `initialAzimuthRad(F, subsolar)`. `F` is contradicted if any `|wrapPi(measured − computed)| > SUN_SIDE_TOLERANCE_RAD`. `usable` counts the Sights that could be judged.

**7.5.2 Why two places.** `two_sights` when two are used; `no_sun_side` when `usable = 0` for both; `sun_side_undecided` when readings were judged but did not decide; `equinox` when `|δ| < 2°` at every used Sight. The words list each that holds.

### 7.6 Advice (`math/fix/advice.ts`, Req 10.2, 10.7)

`nextSightAdvice`: `A₀ = sunAt(fix, newest used Sight's time).trueAzimuthRad`. For `k = 1, 2, …` while `k · ADVICE_SCAN_STEP_MS ≤ ADVICE_SCAN_HORIZON_MS`: `s = sunAt(fix, now + k · step)`; the first `k` with `s.apparentAltitudeRad` in the limits and `angleOfCut(s.trueAzimuthRad, A₀) ≥ ADVICE_TURN_RAD` gives `{ kind: 'wait', waitMs: k · step, atUtcMs }`; none gives `{ kind: 'not_today' }`. `ruleOfThumb` is a constant sentence built with `FIRST_WAIT_MS`. The best time (group 11): for each grid time with the Sun in the limits at the Fix, a hypothetical `PreparedSight` with the computed altitude and the least precise used Sight's sigmas is added to the kept Sights, and §7.3 is run from the chosen Fix; the smallest `semiMajor · semiMinor` wins.

### 7.7 Arcs (`math/sphere/circle-arc.ts`, Req 9.4, 9.9)

The arc's centre is `destinationPosition(centre, initialAzimuthRad(centre, fix), ρ · EARTH_RADIUS_M)`; vertices at angular steps of at most `CIRCLE_ARC_STEP_RAD` along the Circle, at `ρ` from the centre and at initial azimuths `θ₀ ± j · Δθ` from the Subsolar point, `Δθ = CIRCLE_ARC_STEP_RAD / sin ρ`, out to the half-length (`min(factor · semiMajor95, π · R sin ρ)` measured along the Circle, `R sin ρ` being its radius on the ground plane); segments split where consecutive longitudes differ by more than `π`. Vertices that are not Supported end a segment.

### 7.8 Comparison (`math/fix/comparison.ts`, Req 11.3, 11.6)

`x = projectToLocalPlane(fix.position, gps)`; `m² = xᵀ C⁻¹ x` with `C` the Shown Fix's covariance (closed form for 2×2); `inside = m² ≤ CONFIDENCE_95_SCALE²`; distance and initial azimuth from Core.

## 8. The words

### 8.1 Messages of Nonius's reasons and of Core's reasons for Sights

| Reason                        | What happened                                                                                                                            | What to do                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sun_too_low`                 | The Sun is less than 5° above the horizon, too low to measure: near the horizon the air bends its light by an amount nobody can predict. | Wait until the Sun is at least three fingers' width above the horizon at arm's length. At night there is nothing to sight; stars are not in this version. |
| `sun_too_high`                | The Sun is more than 80° up, too close to overhead to sight with the phone.                                                              | Wait until the Sun is lower.                                                                                                                              |
| `sight_time_unsupported`      | The phone's clock gives a date this app cannot use.                                                                                      | Set the phone's date and time to automatic, then take the sight again.                                                                                    |
| `sights_full`                 | This set already holds as many sights as it can.                                                                                         | Delete a sight you do not need, or start again.                                                                                                           |
| `circles_do_not_meet`         | The circles of these sights do not cross: the sights are too close in time for their error, or one of them is wrong.                     | Take another sight a couple of hours later, or delete a sight you doubt.                                                                                  |
| `fix_too_uncertain`           | The position would be uncertain by more than 2 000 km, so it is not shown.                                                               | Measure the index error, and take more sights hours apart.                                                                                                |
| `outlier`                     | This sight does not agree with the others, so it was set aside.                                                                          | Check that it was of the Sun and taken from the same place, and take it again if you can.                                                                 |
| `index_error_implausible`     | The difference from the Sun's true height is too large to be the phone's error.                                                          | Check that you sighted the Sun and that the phone's clock is right, then take the sights again.                                                           |
| `storage_unavailable`         | This phone will not keep your sights after you close the page.                                                                           | Keep the page open until you have your position.                                                                                                          |
| `storage_corrupt`             | Some saved sights could not be read and were left out.                                                                                   | Check the list, and take the missing sights again.                                                                                                        |
| `storage_version_unsupported` | The saved sights were written by a newer version of the app, so they were left alone.                                                    | Open the newest version of the app to see them.                                                                                                           |
| `insufficient_observations`   | One sight gives a circle, not a position.                                                                                                | Take another sight a couple of hours later.                                                                                                               |
| `singular_geometry`           | The Sun's direction has changed too little between the sights to give a position.                                                        | Wait until the Sun has moved across the sky, then take another sight.                                                                                     |
| `not_converged`               | The sights do not settle on one position.                                                                                                | Delete a sight you doubt, or take another one.                                                                                                            |
| `out_of_range`                | The sights lead more than 1 000 km from where their circles cross, so at least one is wrong.                                             | Delete a sight you doubt, or take the sights again.                                                                                                       |
| `unsupported_position`        | The position would be within 1° of a pole, where this app does not work.                                                                 | Nonius cannot give a position this close to a pole.                                                                                                       |
| `invalid_observation`         | A sight could not be used.                                                                                                               | Delete it and take it again.                                                                                                                              |

### 8.2 The Fix's words, in order

1. Without an Index error: "This phone's altitude was never calibrated. It may be off by 3.5°, about 390 km on the ground. Measure the index error at a place the phone knows to remove most of it." With one: "Index error −3.3° ± 0.2°, measured 20 Nov 2026" and, when old, "(9 days ago: an index error can change; measure it again)".
2. The disagreement (Req 8.2) or the Sun side's disagreement (Req 6.7), when either holds.
3. "Probably within about N km (M nautical miles) of 28° N, 41° W." (`positionText`, `lengthText95`), or for three that disagree "The best fit of sights that disagree is …".
4. The 95 % axes and the long axis's direction.
5. The choice (§5 `Choice`): the sentence of Req 6.5, 6.6 or 6.7.
6. The count statement (Req 8.1), with "two sights cannot check each other" at two.
7. The Geometry class and its reason; the advice.
8. The limits (Req 9.2): the assumptions, "1° of altitude is about 111 km (60 nautical miles) on the ground", the clock, "No GPS was used for this position", "Nonius is a backup and a teaching instrument, not navigation equipment".

## 9. The screens (Req 1.10, 4, 6.7, 9, 11, 15; Vigia §9)

Copied in pattern from Vigia, each as its file there: `look.ts` (UI's palette, the 16 px body, inline styles), `PrimaryAction.tsx` (the primary-action row, a portal), `TabBar.tsx` (each tab as wide as its label), the store (`useSyncExternalStore` over the reducer), `environment.ts` (the Adapters and the Sensor-source factories handed down as one object), UI's `FailureNotice`, `SimulationBanner`, the phone bar. Layout: in the page's flow, 320 to 430 px wide, portrait, no fixed layer.

| Screen                        | What it shows                                                                                                                                                                                                                                               | Controls                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fix** (tab 1, first screen) | the words of §8.2; Two places: both places' words, labelled A and B, and "Two places fit these sights. Choose the one you are near." with the reasons; one sight: the circle sentence (Req 9.7); none: how to start; the rule of thumb when there is no Fix | primary: **Sight the Sun**; **I am near A**, **I am near B** (Two places); **Undo my choice**; **Compare with this phone's GPS** (Shown Fix only) and its result; **Measure the index error**; **How it works** |
| **Sights** (tab 2)            | the count statement; the span of times and "all sights of a set from one place"; per sight: corrected altitude ± total sigma, time UTC and age, Sun side or none, used or set aside with its Message; the Calibration in use                                | per sight **Delete** (asks once); **Start again** (asks once); **Remove the index error** (asks once)                                                                                                           |
| **Map** (tab 3)               | UI's `MapView` with `mapModel`'s Fix and layers; legend: the arcs, the set-aside arcs, the places, the GPS marker; the tile source's name and terms                                                                                                         | none                                                                                                                                                                                                            |
| **Sight** (full screen)       | the guidance of Req 4.2; the Calibration in use; UI's `SightingScreen` through `DeviceSighting` with `kind: 'altitude'` on a phone, or the Simulator panel; after a capture, the Sight with its sigma and its Sun side; a failure as a `FailureNotice`      | UI's control bar; **Done**                                                                                                                                                                                      |
| **Index error** (full screen) | what it does (Req 15.1); step 1 "Use this phone's location" and its accuracy, and that it is used only for this and not kept; step 2 the sighting screen; each `dₖ`, the mean and sigma as they come; refusal Messages                                      | **Use this phone's location**; UI's control bar; **Save** (primary); **Cancel**                                                                                                                                 |
| **How it works**              | refraction, no dip, no semi-diameter, no parallax (Req 4.7); the sources of the Sun's position and of refraction; what is stored (Req 12.2)                                                                                                                 | **Back**                                                                                                                                                                                                        |

The Sight screen keeps the last `FrozenSighting` it saw through `onSession`, and on `captured` calls `sunSideFromFrozen` on it and `sightFromCapture`, then dispatches `captured`. The Comparison and the Index error location go through `askLocationOnce` (D17).

### 9.1 Mira (2026-11-28; Req 16)

The lead's design of the Fix screen, in Mira. `main.tsx` applies the skeleton's `mira` and imports its two fonts; `look.ts` holds Mira's sizes and shapes as Vigia's does (cards of `20` to `24`, tiles of `16`, pills, a yellow primary of `62`, outline secondaries of `46`, the body at `15`, headings at `19`, the page's title at `28`). New files: `Header.tsx` (the mark, the word, `headerCaption`), `CalibrationCard.tsx` (the Calibration in use, warning card or white card, shared by Fix and Sights), `art/SunDial.tsx` (the design's four rings of dashes, its own dash patterns, and the round button in the same grid cell, so nothing is absolute), `art/TurnDrawing.tsx`, `art/art-colours.ts`. `math/fix/fix-words.ts` exports `START` and `leadAndRest(text)`, the first sentence and the rest (total, in the hostile registry), so that the design's titles are the formatter's words, cut at their first full stop and never rewritten. The Fix screen no longer portals into the primary-action row (the dial is the primary action, in the flow); the row stays for Sight and Index error. *Rejected:* a separate title for each state (new words the specs do not have); keeping the row with a second "Sight the Sun" under the dial (two controls for one action).

## 10. Simulation and the reviewer's path (Req 13; D20)

**Scenes** (`math/scenes/sun-scenes.ts`). A `NoniusScene` is `{ id, name, truth: CATALOGUE_ORIGIN, sightTimesUtcMs, altitudeBiasRad: fromDeg(−3.3), addedErrorRad: Record<index, number>, indexError: IndexError | null, description }`. All dates are 2026-12-21 (Sun's declination about `−23.4°`; local noon at `40° W` about 14:40 UTC; Sun about 36.6° high at noon).

| Scene               | Sight times (UTC)                                                                                                 | Index error     | Expected end                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) `good-day`      | 11:40, 14:40, 17:40 (Sun about 21°, 37°, 21°; azimuths about 136°, 180°, 224°; Angles of cut about 44°, 44°, 88°) | `−3.2° ± 0.25°` | two sights: a Fix chosen by the Sun side; three: Geometry `good` or `fair`, the check of three, the advice                                               |
| (b) `too-close`     | 13:00, 13:40                                                                                                      | as (a)          | `poor` Fix and the advice; variant `too-close-10min` (13:00, 13:10): `fix_too_uncertain` or `singular_geometry` and the rule of thumb                    |
| (c) `one-disagrees` | as (a), the second with `+3°` added                                                                               | as (a)          | the disagreement of Req 8.2                                                                                                                              |
| (d) `uncalibrated`  | as (a)                                                                                                            | none            | the uncalibrated words before a Fix over 1 000 km wide, or `fix_too_uncertain`; after measuring the index error in the scene, the Fix of the same sights |

Task 10 computes each scene's numbers (the 95 % axes, the class, the Studentised residuals of (c)) and records them in this table. If (c) does not say the disagreement at its seed, the added error is raised by `1°` steps up to `8°` and the value recorded; if (b) is not `poor`, its second time moves by 10 minutes until it is.

**One UI scene per Sight time** (`catalogueSceneAt(scene, k)`): `sceneFromOffsets` with origin `truth`, `CATALOGUE_CALIBRATION`, one Station per Sight time, all at `(0, 0)` (named "Sight 2, 14:40 UTC"; UI asks for at least two), and the one Target `{ kind: 'sun', id: 'sun', label: 'Sun', azimuthRad, apparentAltitudeRad, angularRadiusRad: 16′ }` from `sunAt(truth, tₖ)` (the apparent altitude by D4). Scripts by `scriptForStation(sceneₖ, stationⱼ, 'sun', { startUtcMs: tⱼ − 500 ms, altitudeBiasRad: bias + addedⱼ, orientationNoiseSigmaRad: 0.05°, frame: { kind: 'absolute', northErrorRad: 0, resets: [] } })`, which sets the script's Declination from Sensors' `declinationAt`. The script starts `500 ms` before its Sight time, so that the first freeze UI allows (one window of samples later) has its middle at the Sight time. The result is a `CatalogueScene` with `kind: 'altitude'`.

**The shell** (`components/simulation/SimulationShell.tsx`): one store over a memory-or-`localStorage` adapter at `nonius.simulation.state`; the store's Index error is the scene's record when the scene is chosen. UI's `SimulatorPanel` in its compact presentation, given `catalogueSceneAt(scene, k)` and `selectedStationId` of Sight `k`. The phone bar under the banner: "Sight time 2 of 3: 14:40 UTC, 21 Dec 2026 (simulated)", a select of the Sight times and **Next sight time**; the note "The simulated Sun stands still: a sight taken a minute late is up to 15′ off." The Comparison and the Index error use the truth (Req 11.5, 15.7).

## 11. Correctness properties

### Generators (`test-support/generators.ts`; each states its domain)

- `truthArb(latDeg)`: latitude uniform in `[−latDeg, latDeg]`, longitude in `(−180°, 180°]`.
- `timeArb(fromYear, toYear)`: UTC milliseconds uniform in the years.
- `sightTimesArb(truth, n, spreadH, minCutDeg)`: a start uniform in 2026 to 2029, `n` times sorted in `[start, start + spreadH]` at 1-minute resolution; a set is discarded (counted) if a time has the Sun at `truth` outside `[5°, 80°]` or the largest Angle of cut is under `minCutDeg`.
- `noiseFreeSights(truth, times, biasRad, sunSide)`: raw altitude `apparentFromGeometricRad(geometric) + bias`; Sun side the true azimuth (`true`) or `null`.
- `noisySights(…, seed)`: adds a shared `N(0, σc)` and per-Sight `N(0, σi)` from `seeded-normal.ts` (seed an argument).
- `linearModelArb`: 2 to 8 rows in `[−1, 1]²` scaled by `1 / EARTH_RADIUS_M`, within 1 km of an origin at `(10° N, 20° E)`, `σi` in `[0.1°, 2°]`, `σc` in `[0, 3.5°]`.
- `hostile.ts`: Vigia's, with the limits of `NoniusParameters`.

### Properties (each a `*.property.test.ts`, at least 200 cases; named `P-<Req>`)

| Property      | Statement (the requirement's)                                           | Generator                                                                                   |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| P-2.6         | totality of every registered function                                   | hostile                                                                                     |
| P-3.6, P-3.7  | declination bound, GHA range, equation of time, rates                   | `timeArb(2000, 2049)`                                                                       |
| P-4.11        | refraction inverse within `1e-12`, `R` decreasing                       | geometric in `[4°, 80°]`                                                                    |
| P-4.12        | Sight from capture; corrected altitude and sigmas                       | captures and calibrations of Req 4.12                                                       |
| P-5.8         | partials: analytic at the centre, step-consistent elsewhere             | `truthArb(85)`, `timeArb(2026, 2029)`, origins within 1 000 km                              |
| P-5.9         | noise-free residual below `1e-9`                                        | as P-5.8                                                                                    |
| P-5.10        | noise-free Fix within `0.1 m`                                           | `sightTimesArb(…, 2 to 8, 24, 20)`, start within 100 km                                     |
| P-6.9, P-6.10 | never the mirror place alone; order-free                                | `sightTimesArb(…, 2 to 8, 24, 20)`, Sun side at random                                      |
| P-7.3, P-8.5  | coverage and false alarms, by band (statistical, seed an argument; D22) | `truthArb(70)`, `sightTimesArb(…, 2 to 6, 2 to 9, 0)`, `noisySights`                        |
| P-8.6         | one wrong Sight, shares reported                                        | as P-7.3 with one Sight off by `3°` to `20°`                                                |
| P-7.7         | `ellipse95` relation; symmetric positive definite                       | as P-7.3                                                                                    |
| P-7.9         | the method equals the linear closed form within `1e-6`                  | `linearModelArb`; _2026-11-20, checkpoint 7, lead's decision: rows shorter than 0.1 (before the `1 / R` scale) and normal matrices with `det / trace² < 1e-3` are discarded, rows drawn on a grid of `1e-5`: rows of `1e-75` are not the Jacobian of any sight, and Core refuses their overflow (seed `-706094599`, kept as an example)_ |
| P-9.8, P-9.9  | the words carry their numbers; arc vertices on their Circle             | as P-7.3; Circles from `sightTimesArb`                                                      |
| P-10.2        | the advised time meets both conditions, no earlier one does             | as P-7.3                                                                                    |
| P-10.6        | the best time is the smallest area (group 11)                           | as P-7.3, 50 cases (deep: 200)                                                              |
| P-10.7        | counter: share of first sights for which two hours give 20°             | latitudes `60° S` to `60° N` by 5°, one date a month (report)                               |
| P-11.6        | inside test agrees with `fixFeatures`'s polygon                         | covariances of Req 11.6                                                                     |
| P-12.7        | reducer and storage over action sequences                               | 0 to 200 actions on a fake Storage                                                          |
| P-15.8        | Index error equals the bias; sigma formula; the corrected Fix           | `truthArb(80)`, `timeArb(2026, 2029)`, `b` in `[−10°, 10°]` (`1e-6` inside), 1 to 10 sights |

*P-5.10 (2026-11-21): the start is within `100 km`, not `300 km`, as Requirement 5.10 now says: the solve is local, one noise-free set (a hunt found it, seed 716968603) ends in a second minimum 569 km from the truth when started 300 km due north, and the app starts from the Candidates of Requirement 6.2, which P-6.9 holds; the set is the example test `known-local-minimum.test.ts`.*

Example tests: the fixture rows of Req 3.4 and 4.10; each reason's Message; Req 6.11's three cases; the rule of thumb's sentence; D23's radius check; each scene's end (§10).

## 12. Purity, packaging and build

`purity.test.ts` (Vigia's, with a fixed file list) checks: imports by layer (D1); `astronomy-engine` only in `math/sun/sun-wrapper.ts`; no `Date`, `Math.random`, `performance` or browser name in `math/`; the names of Req 1.3 and 1.4 nowhere but where allowed; `startPosition` only in `components/ask-location.ts`; `localStorage` only in `adapters/storage.ts`; the literals `2.4477`, `3.5` and `0.3490658503988659` (20°) nowhere (Core's exports instead); no `DeviceOrientationEvent` but the one `typeof` in `main.tsx`; `package.json` pinned. The build: Vite, `base: './'`, `index.html` with `<meta name="referrer" content="strict-origin">`, `.env.example` with the four tile variables empty. The README (Req 13.8). One `build` in task 12, whose output size and the library's share are reported.

## 13. Copied in pattern from Vigia, and new

**Copied in pattern** (written again in `apps/nonius`, no import from Vigia): the three layers and Vitest projects; `result.ts`, `reasons.ts`, `messages.ts` with `Record<…>` tables; `parameters.ts` with `checkParameters`; `civil-time.ts`; `format.ts` (`lengthText95`, `positionText`, `compassWord8`); `geometry-class.ts`; the reducer, the store and the storage format with its backup and version rules; `look.ts`, `PrimaryAction.tsx`, `TabBar.tsx`, the banner and the phone bar; the Simulation shell around UI's compact panel; `purity.test.ts`; `hostile-totality.property.test.ts`; the test support (`fast-check-setup.ts`, `property-report.ts`, `seeded-normal.ts`, `fake-timer.ts`, `hostile.ts`, `fake-maplibre.ts`, `render-screen.tsx`).

**New**: the Sun wrapper; refraction and its inverse; Sights, the Sun side and the Index error; the altitude model; circle crossings and Candidates; the re-centred solve; the check and Fix solves and the shared-error covariance; the choice and Two places; the arcs; the Comparison's inside test; the simple advice; the per-time scenes; `ask-location.ts`; the Index error screen.

## 14. What I would watch

- P-7.3 in the band `3.5°` with two Sights: the ellipse's straight-line approximation over 1 000 km and more is where coverage may fall below 90 %; if it does, the cause is classified before anything changes (`testing.md`, rule 1), and `MAX_FIX_SEMI_MAJOR_95_M` is the requirement most likely to move.
- P-8.5 in the band `3.5°` with Sun azimuths spread over more than `180°` (high latitudes in summer): the one geometry where D10's argument does not make the test conservative.
- Scene (c): three Sights can hide a `3°` error in their one degree of freedom; §10's rule for raising it is there for that.
