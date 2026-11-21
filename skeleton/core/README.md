# @alidade/core

The pure math of a sighting: angles, spherical geodesy, observations, the solver that turns
observations into a position fix, and the uncertainty ellipse. It has no runtime dependency and no
access to the DOM, the network, the clock or randomness; time and seeds are passed in. Every
function that can fail returns a `Result`, never a `NaN` or an exception.

Import everything from the package root; there are no deep imports.

```ts
import { BearingModel, solve, ellipse95 } from '@alidade/core';
```

Conventions (radians inside, azimuth clockwise from true north, a sphere of radius 6 371 008.8 m,
every number carrying its unit in its name) are in `.kiro/steering/math-conventions.md`.

## What it exports

- `Result`, `Success`, `Failure`, `Reason`, `Warning`: the result type and the closed sets of failure reasons and warnings.
- `wrapPi`, `wrapTwoPi`, `angularDifference`, `circularMean`, `degToRad`, `radToDeg`: angles.
- `Position`, `greatCircleDistanceM`, `initialAzimuthRad`, `destinationPosition`, `isSupportedPosition`: positions on the sphere.
- `LocalPoint`, `projectToLocalPlane`, `unprojectToLocalPlane`: the East-North plane tangent at an origin.
- `Bearing`, `BearingWire`, `validateBearing`, `parseBearing`, `serialiseBearing`: one sighting of a target from a known place, and its wire form.
- `solve`, `SolverOptions`, `Fix`, `ObservationResidual`, `OUTLIER_STUDENTISED_RESIDUAL`: the solver and what it returns.
- `CovarianceEnM2`, `Ellipse`, `ellipseFromCovariance`, `ellipse95`, `CONFIDENCE_95_SCALE`: the uncertainty of a fix and its 95 % ellipse.
- `MeasurementModel`, `Evaluation`: the interface a kind of observation implements.
- `BearingModel`, `POOR_GEOMETRY_CROSSING_RAD`: the one model Core ships.

## Your own measurement model

The solver knows nothing about what is measured. It sees observations as an opaque type `O` and
reaches them through a `MeasurementModel<O>`: how to validate one, where to start, what an
observation should read at a candidate position and its partial derivatives, and a check of the
geometry before and after the solve. Core ships the bearing model (many observers at known places,
one unknown target). Nonius, in `apps/nonius`, adds its own altitude model (the Sun at a known
place, one unknown observer) without changing a line of Core.

The two real models to copy from:

- [`src/bearing-model.ts`](src/bearing-model.ts), Core's own.
- [`apps/nonius/src/math/fix/altitude-model.ts`](../../apps/nonius/src/math/fix/altitude-model.ts), written in an app.

The interface itself is in [`src/measurement-model.ts`](src/measurement-model.ts). A sketch:

```ts
import { solve, type MeasurementModel, type Position } from '@alidade/core';

interface Reading {
  id: string;
  place: Position;
  valueRad: number;
  sigmaRad: number;
}

const model: MeasurementModel<Reading> = {
  validate: (r) =>
    Number.isFinite(r.valueRad)
      ? { ok: true, value: undefined }
      : { ok: false, reason: 'invalid_observation', id: r.id },
  idOf: (r) => r.id,
  origin: (rs) => ({ ok: true, value: rs[0]?.place ?? { latRad: 0, lonRad: 0 } }), // the plane's origin
  startEstimate: () => ({ ok: true, value: { eastM: 0, northM: 0 } }),
  geometryCheck: () => ({ ok: true, value: { warnings: [] } }),
  postSolveCheck: () => ({ ok: true, value: { warnings: [] } }),
  evaluate: (r, candidate, origin) => {
    /* predictedRad, residualRad, effectiveSigmaRad, partials */
  },
};
const fix = solve(model, readings, { outlierRejection: true }); // a Result<Fix>
```

Every method returns a result or a plain value, never throws and never returns a `NaN`. A model
must describe the same position whatever the plane's origin; the comments of `MeasurementModel`
say why.

## Tests

| Command                                 | What it runs                              |
| --------------------------------------- | ----------------------------------------- |
| `pnpm --filter @alidade/core test`      | every test once, properties at 200 cases  |
| `pnpm --filter @alidade/core test:perf` | the timing test of the solver, on its own |
