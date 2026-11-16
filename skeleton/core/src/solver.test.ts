import { describe, expect, it } from 'vitest';
import { BearingModel } from './bearing-model';
import { projectToLocalPlane, unprojectToLocalPlane, type LocalPoint } from './local-plane';
import type { Fix, MeasurementModel } from './measurement-model';
import type { Bearing } from './observation';
import {
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  type Position,
} from './position';
import { err, ok } from './result';
import { MAX_ITERATIONS, solve } from './solver';
import { makeBearing } from './test-support/bearings';
import { unwrapOk } from './test-support/result-helpers';
import { createStubModel, stubObservation, type StubObservation } from './test-support/stub-model';

const rad = (angleDeg: number): number => (angleDeg * Math.PI) / 180;
const position = (latDeg: number, lonDeg: number): Position => ({
  latRad: rad(latDeg),
  lonRad: rad(lonDeg),
});
const failure = (reason: string) => ({ ok: false, reason });
const distanceM = (a: Position, b: Position): number => unwrapOk(greatCircleDistanceM(a, b));

// ---------------------------------------------------------------------------------------------
// Generic behaviour, against the stub model. Its observations are linear in East and North, so
// the true answer is known. Partials of 1e-3 rad/m with sigma 0.01 rad are typical numbers.
// ---------------------------------------------------------------------------------------------

const truth: LocalPoint = { eastM: 100, northM: -40 };
/** Two linear observations, one per axis, that read exactly what they predict at `truth`. */
const twoAxes = (target: LocalPoint = truth): StubObservation[] => [
  stubObservation('east', 1e-3, 0, target),
  stubObservation('north', 0, 1e-3, target),
];
const stubOrigin = position(0, 0);
/** The stub's origin itself, where the stub's axes are East and North at the Fix. */
const atStubOrigin: LocalPoint = { eastM: 0, northM: 0 };
const at = (origin: Position, point: LocalPoint): Position =>
  unwrapOk(unprojectToLocalPlane(origin, point));

describe('solve: options (step 0)', () => {
  it.each([
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['0', 0],
    ['a negative', -5],
    ['a fraction', 2.5],
    ['51', 51],
  ])('rejects a maxIterations of %s with invalid_number naming the field', (_name, value) => {
    const model = createStubModel();
    expect(solve(model, twoAxes(), { maxIterations: value })).toStrictEqual(
      err('invalid_number', { field: 'maxIterations' }),
    );
    // Rejected before anything else: the model is not consulted.
    expect(model.calls.idOf + model.calls.validate + model.calls.evaluate).toBe(0);
  });

  it('accepts maxIterations of 1 and 50, and defaults to 50 with outlier rejection off', () => {
    expect(MAX_ITERATIONS).toBe(50);
    // A linear model converges on its second iteration, so 1 is too few and 2 is enough.
    expect(solve(createStubModel(), twoAxes(), { maxIterations: 1 })).toStrictEqual(
      failure('not_converged'),
    );
    expect(solve(createStubModel(), twoAxes(), { maxIterations: 50 }).ok).toBe(true);
    expect(solve(createStubModel(), twoAxes()).ok).toBe(true);
  });
});

describe('solve: canonical order, validation and count (steps 1 to 3)', () => {
  it('returns invalid_observation with field id, naming the smallest duplicated id', () => {
    const observations = [
      stubObservation('b', 1e-3, 0, truth),
      stubObservation('c', 0, 1e-3, truth),
      stubObservation('b', 1e-3, 1e-3, truth),
      stubObservation('a', 1e-3, 0, truth),
      stubObservation('a', 0, 1e-3, truth),
    ];
    expect(solve(createStubModel(), observations)).toStrictEqual(
      err('invalid_observation', { field: 'id', id: 'a' }),
    );
  });

  it('checks duplicate ids before validating', () => {
    const model = createStubModel({ invalidFields: { a: 'azimuthRad' } });
    const observations = [
      stubObservation('a', 1e-3, 0, truth),
      stubObservation('a', 0, 1e-3, truth),
    ];
    expect(solve(model, observations)).toStrictEqual(
      err('invalid_observation', { field: 'id', id: 'a' }),
    );
    expect(model.calls.validate).toBe(0);
  });

  it('returns the first validation failure in canonical order, naming id and field (Req 9.9)', () => {
    const model = createStubModel({ invalidFields: { c: 'sigmaRad', b: 'measuredRad' } });
    const observations = [
      stubObservation('c', 1e-3, 0, truth),
      stubObservation('a', 0, 1e-3, truth),
      stubObservation('b', 1e-3, 1e-3, truth),
    ];
    expect(solve(model, observations)).toStrictEqual(
      err('invalid_observation', { field: 'measuredRad', id: 'b' }),
    );
  });

  it('never drops an invalid observation to solve with the rest (Req 9.9)', () => {
    const model = createStubModel({ invalidFields: { z: 'sigmaRad' } });
    const observations = [...twoAxes(), stubObservation('z', 1e-3, 1e-3, truth)];
    expect(solve(model, observations).ok).toBe(false);
    expect(model.calls.evaluate).toBe(0);
  });

  it.each([
    ['no observations', []],
    ['one observation', [stubObservation('only', 1e-3, 0, truth)]],
  ])('returns insufficient_observations for %s', (_name, observations) => {
    const model = createStubModel();
    expect(solve(model, observations)).toStrictEqual(failure('insufficient_observations'));
    expect(model.calls.geometryCheck).toBe(0);
  });

  it('gives the model its observations in id order, whatever the input order', () => {
    const observations = [
      stubObservation('m', 1e-3, 0, truth),
      stubObservation('a', 0, 1e-3, truth),
      stubObservation('z', 1e-3, 1e-3, truth),
    ];
    const forward = createStubModel();
    const reversed = createStubModel();
    const forwardFix = unwrapOk(solve(forward, observations));
    const reversedFix = unwrapOk(solve(reversed, [...observations].reverse()));
    expect(forward.calls.postSolveArguments[0]?.observationIds).toStrictEqual(['a', 'm', 'z']);
    expect(reversedFix).toStrictEqual(forwardFix);
  });
});

describe('solve: geometry, origin and start (steps 4 and 5)', () => {
  it('returns a pre-solve geometry failure without computing the origin or the start', () => {
    const model = createStubModel({ geometryCheck: () => err('singular_geometry') });
    expect(solve(model, twoAxes())).toStrictEqual(failure('singular_geometry'));
    expect(model.calls.origin).toBe(0);
    expect(model.calls.startEstimate).toBe(0);
  });

  it('returns a failure of origin or of startEstimate', () => {
    expect(
      solve(createStubModel({ origin: err('unsupported_position') }), twoAxes()),
    ).toStrictEqual(failure('unsupported_position'));
    expect(solve(createStubModel({ start: err('singular_geometry') }), twoAxes())).toStrictEqual(
      failure('singular_geometry'),
    );
  });

  it('does not keep the poor_geometry warning of the pre-solve run', () => {
    const model = createStubModel({
      geometryCheck: (_observations, call) => ok({ warnings: call === 1 ? ['poor_geometry'] : [] }),
    });
    expect(unwrapOk(solve(model, twoAxes())).warnings).toStrictEqual([]);
  });
});

describe('solve: the Fix (steps 9 to 11)', () => {
  it('solves a linear set exactly, with zero residuals, in two iterations', () => {
    const model = createStubModel();
    const fix = unwrapOk(solve(model, twoAxes()));
    expect(distanceM(fix.position, at(stubOrigin, truth))).toBeLessThan(1e-6);
    expect(fix.iterations).toBe(2);
    expect(fix.residuals.map((entry) => entry.id)).toStrictEqual(['east', 'north']);
    for (const entry of fix.residuals) {
      expect(Math.abs(entry.residualRad)).toBeLessThan(1e-12);
      expect(Math.abs(entry.normalisedResidual)).toBeLessThan(1e-10);
    }
    expect(fix.warnings).toStrictEqual([]);
    expect(fix.excludedIds).toStrictEqual([]);
  });

  it('reports each residual and its normalised residual at the Fix', () => {
    // Three observations of one axis that disagree: the least-squares east is their mean.
    const observations: StubObservation[] = [
      {
        id: 'a',
        partialEastRadPerM: 1e-3,
        partialNorthRadPerM: 0,
        measuredRad: 0.1,
        sigmaRad: 0.01,
      },
      {
        id: 'b',
        partialEastRadPerM: 1e-3,
        partialNorthRadPerM: 0,
        measuredRad: 0.13,
        sigmaRad: 0.01,
      },
      { id: 'c', partialEastRadPerM: 0, partialNorthRadPerM: 1e-3, measuredRad: 0, sigmaRad: 0.01 },
    ];
    const fix = unwrapOk(solve(createStubModel(), observations));
    const byId = new Map(fix.residuals.map((entry) => [entry.id, entry]));
    expect(byId.get('a')?.residualRad).toBeCloseTo(-0.015, 12);
    expect(byId.get('b')?.residualRad).toBeCloseTo(0.015, 12);
    expect(byId.get('a')?.normalisedResidual).toBeCloseTo(-1.5, 9);
    expect(byId.get('b')?.normalisedResidual).toBeCloseTo(1.5, 9);
    expect(Math.abs(byId.get('c')?.residualRad ?? 1)).toBeLessThan(1e-12);
  });

  it('returns the covariance as the inverse of JᵀWJ, off-diagonal sign included', () => {
    // JᵀWJ = Σ J Jᵀ / σ² with J = (1e-3, 0), (0, 1e-3) at σ = 0.01, 0.02 and (1e-3, 1e-3) at 0.01:
    // [[0.02, 0.01], [0.01, 0.0125]] in 1/m². Its inverse has a negative off-diagonal. The truth
    // is the stub's origin, so East and North at the Fix (design D19) are the stub's own axes;
    // 100 m away they would differ by about 1e-10, the effect D19 exists for.
    const observations = [
      stubObservation('a', 1e-3, 0, atStubOrigin, 0.01),
      stubObservation('b', 0, 1e-3, atStubOrigin, 0.02),
      stubObservation('c', 1e-3, 1e-3, atStubOrigin, 0.01),
    ];
    const { covariance } = unwrapOk(solve(createStubModel(), observations));
    const normal = [
      [0.02, 0.01],
      [0.01, 0.0125],
    ] as const;
    const product = [
      [
        covariance.varEastM2 * normal[0][0] + covariance.covEastNorthM2 * normal[1][0],
        covariance.varEastM2 * normal[0][1] + covariance.covEastNorthM2 * normal[1][1],
      ],
      [
        covariance.covEastNorthM2 * normal[0][0] + covariance.varNorthM2 * normal[1][0],
        covariance.covEastNorthM2 * normal[0][1] + covariance.varNorthM2 * normal[1][1],
      ],
    ];
    expect(product[0]?.[0]).toBeCloseTo(1, 10);
    expect(product[0]?.[1]).toBeCloseTo(0, 10);
    expect(product[1]?.[0]).toBeCloseTo(0, 10);
    expect(product[1]?.[1]).toBeCloseTo(1, 10);
    expect(covariance.covEastNorthM2).toBeLessThan(0);
  });

  it('derives the ellipse from the covariance: σ 10 m east and 20 m north', () => {
    // The truth is the stub's origin, as in the test above.
    const observations = [
      stubObservation('a', 1e-3, 0, atStubOrigin, 0.01),
      stubObservation('b', 0, 1e-3, atStubOrigin, 0.02),
    ];
    const fix = unwrapOk(solve(createStubModel(), observations));
    expect(fix.covariance.varEastM2).toBeCloseTo(100, 8);
    expect(fix.covariance.varNorthM2).toBeCloseTo(400, 8);
    expect(fix.ellipse.semiMajorM).toBeCloseTo(20, 8);
    expect(fix.ellipse.semiMinorM).toBeCloseTo(10, 8);
    expect(fix.ellipse.azimuthRad).toBeCloseTo(0, 10);
  });

  it('calls postSolveCheck with the assembled Fix, the solve origin and the remaining ids', () => {
    const origin = position(12, 34);
    const model = createStubModel({ origin: ok(origin) });
    const fix = unwrapOk(solve(model, twoAxes()));
    expect(model.calls.postSolveCheck).toBe(1);
    const [call] = model.calls.postSolveArguments;
    expect(call?.origin).toBe(origin);
    expect(call?.observationIds).toStrictEqual(['east', 'north']);
    expect(call?.fix.covariance).toStrictEqual(fix.covariance);
    expect(call?.fix.ellipse).toStrictEqual(fix.ellipse);
    expect(call?.fix.position).toStrictEqual(fix.position);
  });

  it('returns a post-solve failure, and appends post-solve warnings after its own', () => {
    expect(
      solve(createStubModel({ postSolveCheck: () => err('out_of_range') }), twoAxes()),
    ).toStrictEqual(failure('out_of_range'));
    const model = createStubModel({
      geometryCheck: (_observations, call) => ok({ warnings: call === 2 ? ['poor_geometry'] : [] }),
      postSolveCheck: () => ok({ warnings: ['outliers_excluded'] }),
    });
    expect(unwrapOk(solve(model, twoAxes())).warnings).toStrictEqual([
      'poor_geometry',
      'outliers_excluded',
    ]);
  });

  it('returns singular_geometry when JᵀWJ at the Fix is not positive definite', () => {
    // The gate in the loop sees good partials; at the Fix the stub reports parallel ones. Step 9
    // applies the same eigenvalue gate as step 6, so this is singular_geometry, not a failure of
    // the ellipse.
    let fixEvaluations = false;
    const model = createStubModel({
      postSolveCheck: () => ok({ warnings: [] }),
      overrideEvaluation: (_observation, _candidate, normal) =>
        fixEvaluations
          ? { ...normal, partialEastRadPerM: 1e-3, partialNorthRadPerM: 1e-3 }
          : normal,
      geometryCheck: (_observations, call) => {
        if (call === 2) fixEvaluations = true;
        return ok({ warnings: [] });
      },
    });
    expect(solve(model, twoAxes())).toStrictEqual(failure('singular_geometry'));
  });
});

describe('solve: the eigenvalue gate at the Fix (step 9)', () => {
  it('returns singular_geometry above a condition number of 1e12 at the Fix', () => {
    // As above, but at the Fix the north partial drops so that the condition number is 1.1e12.
    let fixEvaluations = false;
    const model = createStubModel({
      overrideEvaluation: (observation, _candidate, normal) =>
        fixEvaluations && observation.id === 'north'
          ? { ...normal, partialNorthRadPerM: 1e-3 / Math.sqrt(1.1e12) }
          : normal,
      geometryCheck: (_observations, call) => {
        if (call === 2) fixEvaluations = true;
        return ok({ warnings: [] });
      },
    });
    expect(solve(model, twoAxes())).toStrictEqual(failure('singular_geometry'));
  });
});

describe('solve: the solve loop (step 6)', () => {
  // A linear model whose reported partials are 0.4 times the true ones makes every Gauss-Newton
  // step 2.5 times too long. From an error e the full step lands at -1.5e, a higher cost, so it
  // is halved once to 1.25e, which lands at -0.25e and is accepted. Starting 200 m from the
  // truth, iteration k moves 250 · 0.25^(k-1) m, which first drops below 1e-4 m at k = 12; the
  // error left is 200 · 0.25^12 ≈ 1.19e-5 m. The 200 m start is chosen so that the full step of
  // iteration 12, 500 · 0.25^11 ≈ 1.19e-4 m, is still above 1e-4 m: the convergence test must
  // use the accepted step, not the full one, to stop at 12.
  const overshooting = () => createStubModel({ reportedPartialScale: 0.4 });
  const farTruth: LocalPoint = { eastM: 200, northM: 0 };
  const oneAxis = [
    stubObservation('east', 1e-3, 0, farTruth),
    stubObservation('north', 0, 1e-3, farTruth),
  ];

  it('halves a step that raises the cost, and converges after exactly 12 iterations', () => {
    const fix = unwrapOk(solve(overshooting(), oneAxis));
    expect(fix.iterations).toBe(12);
    const errorM = distanceM(fix.position, at(stubOrigin, farTruth));
    expect(Math.abs(errorM - 200 * 0.25 ** 12)).toBeLessThan(1e-9);
  });

  it('returns not_converged when maxIterations is below the iterations needed', () => {
    expect(solve(overshooting(), oneAxis, { maxIterations: 11 })).toStrictEqual(
      failure('not_converged'),
    );
    expect(unwrapOk(solve(overshooting(), oneAxis, { maxIterations: 12 })).iterations).toBe(12);
  });

  it('accepts a step whose cost equals the current cost (the cost must not exceed it)', () => {
    // Reported partials half the true ones: the full step lands at -e, the mirror image, with
    // exactly the same cost. It is accepted, so the estimate swings between 0 and 400 m and never
    // converges. A rule that demanded a strict decrease would halve to the truth instead.
    const mirrored = createStubModel({ reportedPartialScale: 0.5 });
    expect(solve(mirrored, oneAxis)).toStrictEqual(failure('not_converged'));
  });

  it('treats a trial point that fails to evaluate as a cost increase, halves, and succeeds', () => {
    // Reported partials half the true ones send the full step to 400 m east, where the stub
    // fails. The half step lands on the truth at 200 m.
    const model = createStubModel({
      reportedPartialScale: 0.5,
      failAt: (candidate) => (candidate.eastM > 300 ? err('unsupported_position') : undefined),
    });
    const fix = unwrapOk(solve(model, oneAxis));
    expect(distanceM(fix.position, at(stubOrigin, farTruth))).toBeLessThan(1e-6);
    expect(model.calls.evaluatedCandidates.some((candidate) => candidate.eastM > 300)).toBe(true);
  });

  it('takes the smallest step when every trial point raises the cost', () => {
    // Reported partials with the wrong sign point every step away from the truth, so every trial
    // costs more. The smallest, 1/256 of the full step, is taken: from 0 m the full step is
    // -200 m, so the second iteration starts at -200 / 256 = -0.78125 m.
    const model = createStubModel({ reportedPartialScale: -1 });
    expect(solve(model, oneAxis, { maxIterations: 2 })).toStrictEqual(failure('not_converged'));
    // Two observations at the start, two at each of the 9 trial points, then the second start.
    const secondStart = model.calls.evaluatedCandidates[2 + 2 * 9];
    expect(secondStart?.eastM).toBe(-200 / 256);
    expect(secondStart?.northM).toBe(0);
  });

  it('returns the failure when even the smallest step fails to evaluate', () => {
    const model = createStubModel({
      failAt: (candidate) =>
        candidate.eastM !== 0 || candidate.northM !== 0 ? err('coincident_positions') : undefined,
    });
    expect(solve(model, twoAxes())).toStrictEqual(failure('coincident_positions'));
    // One evaluation per observation at the start, then at each of the 9 trial points: the full
    // step and 8 halvings. The first failing observation ends each trial.
    expect(model.calls.evaluate).toBe(2 + 9);
  });

  it('returns a failure at the current candidate at once', () => {
    const model = createStubModel({ failAt: () => err('unsupported_position') });
    expect(solve(model, twoAxes())).toStrictEqual(failure('unsupported_position'));
    expect(model.calls.evaluate).toBe(1);
  });

  describe('the eigenvalue gate', () => {
    it('returns singular_geometry for finite, parallel partials (λ2 = 0)', () => {
      const observations = [
        stubObservation('a', 1e-3, 2e-3, truth),
        stubObservation('b', 2e-3, 4e-3, truth),
        stubObservation('c', -1e-3, -2e-3, truth),
      ];
      expect(solve(createStubModel(), observations)).toStrictEqual(failure('singular_geometry'));
    });

    it('returns singular_geometry when every partial is zero (λ1 = 0)', () => {
      const observations = [stubObservation('a', 0, 0, truth), stubObservation('b', 0, 0, truth)];
      expect(solve(createStubModel(), observations)).toStrictEqual(failure('singular_geometry'));
    });

    it('returns singular_geometry when finite partials of 1e200 overflow JᵀWJ to NaN eigenvalues', () => {
      const observations = [
        stubObservation('a', 1e200, 1e200, truth),
        stubObservation('b', 1e200, -1e200, truth),
      ];
      expect(solve(createStubModel(), observations)).toStrictEqual(failure('singular_geometry'));
    });

    it('returns singular_geometry above a condition number of 1e12 and solves below it', () => {
      // JᵀWJ is diagonal: (1e-3/σ)² east and (p/σ)² north, so the condition number is (1e-3/p)².
      const withConditionNumber = (conditionNumber: number) => [
        stubObservation('a', 1e-3, 0, truth),
        stubObservation('b', 0, 1e-3 / Math.sqrt(conditionNumber), truth),
      ];
      expect(solve(createStubModel(), withConditionNumber(1.1e12))).toStrictEqual(
        failure('singular_geometry'),
      );
      expect(solve(createStubModel(), withConditionNumber(0.9e12)).ok).toBe(true);
    });
  });

  describe('a faulty model (design D17)', () => {
    it.each([
      ['a NaN residual', { residualRad: Number.NaN }],
      ['an infinite partial', { partialEastRadPerM: Number.POSITIVE_INFINITY }],
      ['an Effective sigma of 0', { effectiveSigmaRad: 0 }],
      ['a negative Effective sigma', { effectiveSigmaRad: -0.01 }],
      ['a NaN prediction', { predictedRad: Number.NaN }],
    ])('returns invalid_number for %s', (_name, change) => {
      const model = createStubModel({
        overrideEvaluation: (_observation, _candidate, normal) => ({ ...normal, ...change }),
      });
      expect(solve(model, twoAxes())).toStrictEqual(failure('invalid_number'));
    });
  });
});

describe('solve: Effective sigmas are re-evaluated at every iteration (Req 7.1)', () => {
  // Two east readings that disagree: 'a' says 100 m and 'b' says 200 m, both with partial
  // 1e-3 rad/m. b's sigma is a fixed 0.01 rad; a's grows with the candidate's east coordinate,
  // 0.01 + 1e-4 · east rad. At the start (east 0) both weigh the same, so sigmas frozen at their
  // first-iteration values would give the plain mean, 150 m. Re-evaluated at every iteration,
  // the weights follow the estimate, and the fix is the point e where
  // e = (w_a(e) · 100 + w_b · 200) / (w_a(e) + w_b), with w = 1/σ², about 189 m.
  const sigmaOfA = (eastM: number): number => 0.01 + 1e-4 * Math.abs(eastM);
  const observations = [
    stubObservation('a', 1e-3, 0, { eastM: 100, northM: 0 }),
    stubObservation('b', 1e-3, 0, { eastM: 200, northM: 0 }),
    stubObservation('n', 0, 1e-3, { eastM: 0, northM: 0 }),
  ];

  /** The fixed point, found here by bisection, independently of the solver. */
  function fixedPointEastM(): number {
    const excess = (eastM: number): number => {
      const weightA = 1 / sigmaOfA(eastM) ** 2;
      const weightB = 1 / 0.01 ** 2;
      return (weightA * 100 + weightB * 200) / (weightA + weightB) - eastM;
    };
    let low = 100;
    let high = 200;
    for (let step = 0; step < 200; step += 1) {
      const middle = (low + high) / 2;
      if (excess(middle) > 0) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }

  it('fixes the point where the weights at the fix balance, not the start-weighted mean', () => {
    const model = createStubModel({
      overrideEvaluation: (observation, _candidate, normal, point) =>
        observation.id === 'a' ? { ...normal, effectiveSigmaRad: sigmaOfA(point.eastM) } : normal,
    });
    const expectedEastM = fixedPointEastM();
    expect(expectedEastM).toBeGreaterThan(185);
    expect(expectedEastM).toBeLessThan(195);

    const fix = unwrapOk(solve(model, observations));
    const fixEastM = unwrapOk(projectToLocalPlane(stubOrigin, fix.position)).eastM;
    expect(Math.abs(fixEastM - expectedEastM)).toBeLessThan(0.01);
    // Far from the 150 m that sigmas frozen at the start would give.
    expect(Math.abs(fixEastM - 150)).toBeGreaterThan(30);
  });
});

describe('solve: outlier rejection (step 7) and the post-exclusion geometry (step 8)', () => {
  // Five observations of the east axis read 100 m; the sixth, 'x', reads 300 m. With every sigma
  // 0.01 rad the least-squares east is 133.3 m, where x's normalised residual is -16.7 and the
  // others' are 3.3: x is excluded, and the rest then agree exactly.
  const withOutlier = (): StubObservation[] => [
    ...['a', 'b', 'c', 'd', 'e'].map((id) =>
      stubObservation(id, 1e-3, 0, { eastM: 100, northM: 0 }),
    ),
    stubObservation('x', 1e-3, 0, { eastM: 300, northM: 0 }),
    stubObservation('n', 0, 1e-3, { eastM: 0, northM: 0 }),
  ];

  it('excludes the observation with the largest |normalised residual| above 3.5 and solves again', () => {
    const model = createStubModel();
    const fix = unwrapOk(solve(model, withOutlier(), { outlierRejection: true }));
    expect(fix.excludedIds).toStrictEqual(['x']);
    expect(fix.warnings).toStrictEqual(['outliers_excluded']);
    expect(fix.residuals.map((entry) => entry.id)).toStrictEqual(['a', 'b', 'c', 'd', 'e', 'n']);
    expect(distanceM(fix.position, at(stubOrigin, { eastM: 100, northM: 0 }))).toBeLessThan(1e-6);
    // The post-solve check runs once, after exclusion, on the observations that remain.
    expect(model.calls.postSolveArguments[0]?.observationIds).not.toContain('x');
  });

  it('excludes none when outlier rejection is disabled, which is the default', () => {
    const fix = unwrapOk(solve(createStubModel(), withOutlier()));
    expect(fix.excludedIds).toStrictEqual([]);
    expect(fix.warnings).toStrictEqual([]);
    expect(fix.residuals).toHaveLength(7);
    expect(distanceM(fix.position, at(stubOrigin, { eastM: 100, northM: 0 }))).toBeGreaterThan(30);
  });

  it('does not exclude when fewer than four observations are given', () => {
    const three = [
      stubObservation('a', 1e-3, 0, { eastM: 100, northM: 0 }),
      stubObservation('x', 1e-3, 0, { eastM: 300, northM: 0 }),
      stubObservation('n', 0, 1e-3, { eastM: 0, northM: 0 }),
    ];
    expect(
      unwrapOk(solve(createStubModel(), three, { outlierRejection: true })).excludedIds,
    ).toStrictEqual([]);
  });

  it('stops excluding when three observations remain', () => {
    // Four disagreeing east readings: exclusion would go on, but stops at three.
    const four = [
      stubObservation('a', 1e-3, 0, { eastM: 0, northM: 0 }),
      stubObservation('b', 1e-3, 0, { eastM: 1000, northM: 0 }),
      stubObservation('c', 1e-3, 0, { eastM: 5000, northM: 0 }),
      stubObservation('n', 0, 1e-3, { eastM: 0, northM: 0 }),
    ];
    const fix = unwrapOk(solve(createStubModel(), four, { outlierRejection: true }));
    expect(fix.excludedIds).toHaveLength(1);
    expect(fix.residuals).toHaveLength(3);
  });

  it('breaks a tie between equal |normalised residuals| by the smallest id', () => {
    // p and q both say 300 m east, but q's partial has the opposite sign, so at every candidate
    // q's residual is exactly the negative of p's: their magnitudes tie in floating point, not
    // just nearly. Three good readings say 100 m, so p and q have the largest magnitude (12 at
    // 180 m). The tie goes to p, the smaller id.
    const tied = [
      stubObservation('q', -1e-3, 0, { eastM: 300, northM: 0 }),
      stubObservation('p', 1e-3, 0, { eastM: 300, northM: 0 }),
      ...['a', 'b', 'c'].map((id) => stubObservation(id, 1e-3, 0, { eastM: 100, northM: 0 })),
      stubObservation('n', 0, 1e-3, { eastM: 0, northM: 0 }),
    ];
    const fix = unwrapOk(solve(createStubModel(), tied, { outlierRejection: true }));
    expect(fix.excludedIds).toStrictEqual(['p', 'q']);
  });

  // Five east readings, one of them 'x' off by δ, all with sigma 0.01 rad and partial 1e-3
  // rad/m: the least-squares east moves δ/5, so x's normalised residual is 0.1 · δ · 4/5.
  const withOffset = (offsetM: number): StubObservation[] => [
    ...['a', 'b', 'c', 'd'].map((id) => stubObservation(id, 1e-3, 0, { eastM: 100, northM: 0 })),
    stubObservation('x', 1e-3, 0, { eastM: 100 + offsetM, northM: 0 }),
    stubObservation('n', 0, 1e-3, { eastM: 0, northM: 0 }),
  ];

  it('excludes a normalised residual of 3.75, just above the 3.5 limit', () => {
    const fix = unwrapOk(solve(createStubModel(), withOffset(46.875), { outlierRejection: true }));
    expect(fix.excludedIds).toStrictEqual(['x']);
  });

  it('keeps a normalised residual of 3.44, just below the 3.5 limit', () => {
    const fix = unwrapOk(solve(createStubModel(), withOffset(43), { outlierRejection: true }));
    expect(fix.excludedIds).toStrictEqual([]);
    const largest = Math.max(...fix.residuals.map((entry) => Math.abs(entry.normalisedResidual)));
    expect(largest).toBeCloseTo(3.44, 6);
  });

  it('takes poor_geometry from the post-exclusion run: poor before exclusion, good after', () => {
    const model = createStubModel({
      geometryCheck: (observations) =>
        ok({
          warnings: observations.some((observation) => observation.id === 'x')
            ? ['poor_geometry']
            : [],
        }),
    });
    const fix = unwrapOk(solve(model, withOutlier(), { outlierRejection: true }));
    expect(fix.warnings).toStrictEqual(['outliers_excluded']);
  });

  it('takes poor_geometry from the post-exclusion run: good before exclusion, poor after', () => {
    const model = createStubModel({
      geometryCheck: (observations) =>
        ok({
          warnings: observations.some((observation) => observation.id === 'x')
            ? []
            : ['poor_geometry'],
        }),
    });
    const fix = unwrapOk(solve(model, withOutlier(), { outlierRejection: true }));
    expect(fix.warnings).toStrictEqual(['poor_geometry', 'outliers_excluded']);
  });

  it('returns a failure of the post-exclusion geometry check', () => {
    const model = createStubModel({
      geometryCheck: (_observations, call) =>
        call === 2 ? err('colocated_observers') : ok({ warnings: [] }),
    });
    expect(solve(model, withOutlier(), { outlierRejection: true })).toStrictEqual(
      failure('colocated_observers'),
    );
  });

  it('reports the iterations of the final solve, after exclusion', () => {
    const fix = unwrapOk(solve(createStubModel(), withOutlier(), { outlierRejection: true }));
    // The re-solve starts from 133.3 m east, one linear step from the truth, then converges.
    expect(fix.iterations).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Bearing-specific behaviour, against BearingModel.
// ---------------------------------------------------------------------------------------------

const bearingModel = new BearingModel();
/** The position `rangeM` from `target` along `fromTargetDeg`. */
const placed = (target: Position, fromTargetDeg: number, rangeM: number): Position =>
  unwrapOk(destinationPosition(target, rad(fromTargetDeg), rangeM));
/** A noise-free bearing of `target` from `observer`, optionally with an error added. */
const sighting = (
  id: string,
  observer: Position,
  target: Position,
  changes: Partial<Bearing> & { errorDeg?: number } = {},
): Bearing => {
  const { errorDeg = 0, ...rest } = changes;
  const trueRad = unwrapOk(initialAzimuthRad(observer, target));
  const azimuthRad = (((trueRad + rad(errorDeg)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return makeBearing({ id, observer, azimuthRad, ...rest });
};

describe('solve with BearingModel: noise-free fixes', () => {
  it('fixes the centroid of three observers 5 km away and 120° apart within 0.01 m', () => {
    const target = position(30, 100);
    const observations = [0, 120, 240].map((fromDeg, index) =>
      sighting(`o${index}`, placed(target, fromDeg, 5000), target),
    );
    const fix = unwrapOk(solve(bearingModel, observations));
    expect(distanceM(fix.position, target)).toBeLessThan(0.01);
    expect(distanceM(unwrapOk(bearingModel.origin(observations)), target)).toBeLessThan(1e-6);
    expect(fix.warnings).toStrictEqual([]);
  });

  it('warns poor_geometry when the largest crossing angle is between 0.5° and 20°', () => {
    // Two observers 10 km apart, the target 50 km north of their midpoint: they cross at 11.4°.
    const midpoint = position(-20, 40);
    const target = placed(midpoint, 0, 50_000);
    const observations = [
      sighting('w', placed(midpoint, 270, 5000), target),
      sighting('e', placed(midpoint, 90, 5000), target),
    ];
    const fix = unwrapOk(solve(bearingModel, observations));
    expect(fix.warnings).toStrictEqual(['poor_geometry']);
    expect(distanceM(fix.position, target)).toBeLessThan(0.01);
  });

  it('returns invalid_observation naming the bearing id and field', () => {
    const target = position(10, 10);
    const observations = [
      sighting('a', placed(target, 0, 5000), target),
      sighting('b', placed(target, 90, 5000), target, { azimuthSigmaRad: rad(50) }),
    ];
    expect(solve(bearingModel, observations)).toStrictEqual(
      err('invalid_observation', { field: 'azimuthSigmaRad', id: 'b' }),
    );
  });
});

describe('solve with BearingModel: the start estimate follows meridian convergence (design D18)', () => {
  // Regression from 140 000 generated scenarios: two observers at 57.6°S, 49 km apart, nearly
  // east-west. Drawn on the plane with their raw azimuths, the bearing lines ignore the
  // convergence of the meridians between the observers and the origin, and they met so far
  // from the target that the solve failed with singular_geometry. Each line's direction now
  // comes from two projected points.
  const target: Position = { latRad: -1.0050832956953741, lonRad: 1.0946470648736772 };
  const observations = [
    makeBearing({
      id: 'a',
      observer: { latRad: -1.0051221063611917, lonRad: 1.0947977555076247 },
      azimuthRad: 5.160256514817649,
      azimuthSigmaRad: 0.0036312973522640104,
      positionAccuracyM: 0,
    }),
    makeBearing({
      id: 'b',
      observer: { latRad: -1.004243940417662, lonRad: 1.0804206074613882 },
      azimuthRad: 1.6863550176079036,
      azimuthSigmaRad: 0.7011019052854864,
      positionAccuracyM: 0,
    }),
  ];

  it('starts within 10 m of the target', () => {
    const origin = unwrapOk(bearingModel.origin(observations));
    const start = unwrapOk(bearingModel.startEstimate(observations, origin));
    expect(distanceM(at(origin, start), target)).toBeLessThan(10);
  });

  it('solves to within 0.01 m of the target', () => {
    const fix = unwrapOk(solve(bearingModel, observations));
    expect(distanceM(fix.position, target)).toBeLessThan(0.01);
  });
});

describe('solve with BearingModel: geometry failures', () => {
  /** BearingModel with counted calls to origin and startEstimate. */
  function countingBearingModel(): MeasurementModel<Bearing> & {
    calls: { origin: number; startEstimate: number };
  } {
    const calls = { origin: 0, startEstimate: 0 };
    return {
      calls,
      validate: (observation) => bearingModel.validate(observation),
      idOf: (observation) => bearingModel.idOf(observation),
      origin: (observations) => {
        calls.origin += 1;
        return bearingModel.origin(observations);
      },
      startEstimate: (observations, origin) => {
        calls.startEstimate += 1;
        return bearingModel.startEstimate(observations, origin);
      },
      geometryCheck: (observations) => bearingModel.geometryCheck(observations),
      evaluate: (observation, candidate, origin) =>
        bearingModel.evaluate(observation, candidate, origin),
      postSolveCheck: (fix: Fix, origin, observations) =>
        bearingModel.postSolveCheck(fix, origin, observations),
    };
  }

  it('returns singular_geometry for parallel bearings without calling startEstimate', () => {
    const base = position(5, 5);
    const observations = [
      makeBearing({ id: 'a', observer: base, azimuthRad: rad(30) }),
      makeBearing({ id: 'b', observer: placed(base, 120, 3000), azimuthRad: rad(30) }),
    ];
    const model = countingBearingModel();
    expect(solve(model, observations)).toStrictEqual(failure('singular_geometry'));
    expect(model.calls.startEstimate).toBe(0);
    expect(model.calls.origin).toBe(0);
  });

  it('returns colocated_observers when every pair of observers is under 1 m apart', () => {
    const base = position(5, 5);
    const observations = [
      makeBearing({ id: 'a', observer: base, azimuthRad: rad(0) }),
      makeBearing({ id: 'b', observer: placed(base, 90, 0.4), azimuthRad: rad(90) }),
    ];
    expect(solve(bearingModel, observations)).toStrictEqual(failure('colocated_observers'));
  });
});

describe('solve with BearingModel: post-solve failures', () => {
  it('returns diverging_bearings when the best fit lies behind an observer', () => {
    // a and b cross at 90° on the target. c, 5 km north of it with a loose 45° sigma, sights
    // 30° instead of the true 180°: at the fix its residual is about -150°, behind it.
    const target = position(10, 20);
    const observations = [
      sighting('a', placed(target, 270, 5000), target),
      sighting('b', placed(target, 180, 5000), target),
      sighting('c', placed(target, 0, 5000), target, { azimuthSigmaRad: rad(45), errorDeg: -150 }),
    ];
    expect(solve(bearingModel, observations)).toStrictEqual(failure('diverging_bearings'));
  });

  it('returns out_of_range for a fix more than 500 km from the observers’ centroid', () => {
    // Observers 20 km apart, the target 600 km north of their midpoint: they cross at about
    // 1.9°, enough to solve, and the fix is 600 km from the origin.
    const midpoint = position(0, 0);
    const target = placed(midpoint, 0, 600_000);
    const observations = [
      sighting('w', placed(midpoint, 270, 10_000), target),
      sighting('e', placed(midpoint, 90, 10_000), target),
    ];
    expect(solve(bearingModel, observations)).toStrictEqual(failure('out_of_range'));
  });
});

describe('solve with BearingModel: evaluation failures (design D15)', () => {
  it('returns coincident_positions when the start estimate lands on an observer', () => {
    // a and b on the same meridian, b 5 km south of a, sighting a (azimuth 0); a sights 45°. The
    // origin is their centroid, on the same meridian, so b's line on the plane is the line
    // east = 0 through a, and the two lines meet at a.
    const a = position(10.05, 20);
    const b = placed(a, 180, 5000);
    const observations = [
      makeBearing({ id: 'a', observer: a, azimuthRad: rad(45) }),
      sighting('b', b, a),
    ];
    expect(unwrapOk(initialAzimuthRad(b, a))).toBe(0);
    const origin = unwrapOk(bearingModel.origin(observations));
    const start = unwrapOk(bearingModel.startEstimate(observations, origin));
    expect(distanceM(at(origin, start), a)).toBeLessThan(1e-3);
    expect(solve(bearingModel, observations)).toStrictEqual(failure('coincident_positions'));
  });

  it('returns unsupported_position when the bearings cross beyond 89°', () => {
    // Two observers at 88.5°N, 3° of longitude apart, sighting 1° and 359°: their lines meet
    // past 89°N, outside the Supported region, so the start estimate cannot be evaluated.
    const observations = [
      makeBearing({ id: 'a', observer: position(88.5, 0), azimuthRad: rad(1) }),
      makeBearing({ id: 'b', observer: position(88.5, 3), azimuthRad: rad(359) }),
    ];
    const origin = unwrapOk(bearingModel.origin(observations));
    const start = unwrapOk(bearingModel.startEstimate(observations, origin));
    expect(unprojectToLocalPlane(origin, start)).toStrictEqual(failure('unsupported_position'));
    expect(solve(bearingModel, observations)).toStrictEqual(failure('unsupported_position'));
  });
});

describe('solve with BearingModel: outliers', () => {
  // Eight observers 5 to 6 km from the target, 45° apart, with a 2° sigma, and one more, 'bad',
  // 5.5 km away at 22.5° whose azimuth is 50° wrong (Req 10.5).
  const target = position(-33, 151);
  const ring = [0, 45, 90, 135, 180, 225, 270, 315].map((fromDeg, index) =>
    sighting(`o${index}`, placed(target, fromDeg, 5000 + 125 * index), target, {
      positionAccuracyM: 0,
    }),
  );
  const bad = sighting('bad', placed(target, 22.5, 5500), target, {
    positionAccuracyM: 0,
    errorDeg: 50,
  });

  it('excludes the wrong observation, warns outliers_excluded, and fixes within 1 m', () => {
    const fix = unwrapOk(solve(bearingModel, [...ring, bad], { outlierRejection: true }));
    expect(fix.excludedIds).toStrictEqual(['bad']);
    expect(fix.warnings).toStrictEqual(['outliers_excluded']);
    expect(distanceM(fix.position, target)).toBeLessThan(1);
  });

  it('keeps every observation when outlier rejection is disabled, and the fix is pulled away', () => {
    const fix = unwrapOk(solve(bearingModel, [...ring, bad]));
    expect(fix.excludedIds).toStrictEqual([]);
    expect(fix.warnings).toStrictEqual([]);
    expect(fix.residuals).toHaveLength(9);
    expect(distanceM(fix.position, target)).toBeGreaterThan(1);
  });

  it('warns poor_geometry when only the excluded observation gave good geometry (Req 9.11)', () => {
    // Two fans of three observers, 5 km south and 5 km north of the target, each 12° wide: the
    // largest crossing angle among them is 12°, poor geometry on their own, but the two fans pin
    // the target's range. The seventh observer, 5 km east, sights 40° wrong, crossing the fans at
    // about 50°, so the full set has good geometry. At the plain least-squares fix its normalised
    // residual is 5.3, the largest, so it is excluded and the geometry left is poor.
    // (With BearingModel the opposite case cannot happen: removing observations can only lower
    // the largest crossing angle. The stub tests above cover it. A fan on one side only does not
    // work here: its range is so weakly fixed that least squares absorbs the wrong bearing.)
    const fanTarget = position(45, 7);
    const fans = [174, 180, 186, 354, 0, 6].map((fromDeg, index) =>
      sighting(`f${index}`, placed(fanTarget, fromDeg, 5000), fanTarget, { positionAccuracyM: 0 }),
    );
    const wrong = sighting('wrong', placed(fanTarget, 90, 5000), fanTarget, {
      positionAccuracyM: 0,
      errorDeg: 40,
    });
    expect(unwrapOk(bearingModel.geometryCheck(fans)).warnings).toStrictEqual(['poor_geometry']);
    expect(unwrapOk(bearingModel.geometryCheck([...fans, wrong])).warnings).toStrictEqual([]);
    const fix = unwrapOk(solve(bearingModel, [...fans, wrong], { outlierRejection: true }));
    expect(fix.excludedIds).toStrictEqual(['wrong']);
    expect(fix.warnings).toStrictEqual(['poor_geometry', 'outliers_excluded']);
    expect(distanceM(fix.position, fanTarget)).toBeLessThan(0.01);
  });
});

// Cases the solver properties no longer cover, since Req 7.4 and 10.5 now stop at 75° and 88°
// of latitude and at outliers of 15° to 45°.
describe('solve with BearingModel: outside the property domains', () => {
  it('solves at 86° of latitude, within 0.01 m', () => {
    // Req 7.4 covers targets up to 75°. Near the pole the solve still works: three observers
    // 5 km away and 120° apart around a target at 86°N.
    const target = position(86, -40);
    const observations = [0, 120, 240].map((fromDeg, index) =>
      sighting(`o${index}`, placed(target, fromDeg, 5000), target),
    );
    const fix = unwrapOk(solve(bearingModel, observations));
    expect(distanceM(fix.position, target)).toBeLessThan(0.01);
  });

  it('returns unsupported_position when the observers’ centroid lies beyond 89°', () => {
    // Two Supported observers at 88.95°N on opposite meridians: their centroid is at the pole,
    // so there is no Supported Local plane origin. This is one reason Req 7.4 stops at 75°.
    const observations = [
      makeBearing({ id: 'a', observer: position(88.95, 0), azimuthRad: rad(0) }),
      makeBearing({ id: 'b', observer: position(88.95, 180), azimuthRad: rad(90) }),
    ];
    expect(unwrapOk(bearingModel.geometryCheck(observations)).warnings).toStrictEqual([]);
    expect(solve(bearingModel, observations)).toStrictEqual(failure('unsupported_position'));
  });

  it('known limit: a 79° outlier is not rejected, and good observations are excluded instead', () => {
    // Req 10.5 covers outliers of 15° to 45°. Here eight good observers 5 to 7 km around the
    // target, with no gap over 58° between their directions, and one observer 5 km away at 32°
    // whose azimuth is 79° wrong. The least-squares minimum with every observation lies 4.9 km
    // from the target, where a good observation (g4, -29.0) has the largest normalised residual
    // rather than the bad one. Rejection then removes good observations one by one and ends
    // 5 km from the target. This documents current behaviour, not a requirement: outlier
    // rejection by largest residual cannot recover from an error this large.
    const target = position(4, 160);
    const directionsDeg = [149, 218, 261, 335, 91, 33, 292, 193];
    const rangesM = [5300, 6600, 5600, 6700, 5300, 6300, 6100, 5200];
    const good = directionsDeg.map((fromDeg, index) =>
      sighting(`g${index}`, placed(target, fromDeg, rangesM[index] as number), target, {
        positionAccuracyM: 0,
      }),
    );
    const bad = sighting('bad', placed(target, 32, 5000), target, {
      positionAccuracyM: 0,
      errorDeg: -79,
    });
    const plain = unwrapOk(solve(bearingModel, [...good, bad]));
    expect(distanceM(plain.position, target)).toBeGreaterThan(4000);
    const largest = [...plain.residuals].sort(
      (left, right) => Math.abs(right.normalisedResidual) - Math.abs(left.normalisedResidual),
    )[0];
    expect(largest?.id).not.toBe('bad');

    const rejected = unwrapOk(solve(bearingModel, [...good, bad], { outlierRejection: true }));
    expect(rejected.excludedIds).not.toContain('bad');
    expect(rejected.excludedIds.length).toBeGreaterThan(1);
    expect(distanceM(rejected.position, target)).toBeGreaterThan(4000);
  });
});

describe('solve with BearingModel: the ellipse is in East and North at the Fix (design D19)', () => {
  it('points the major axis due east, to 1e-9 rad, for a configuration symmetric about east', () => {
    // A target at 70°N and two observers 100 km from it, at 60° and 120°, with equal sigmas. The
    // configuration is its own mirror image across the great circle that leaves the target due
    // east, so at the Fix the covariance has no East-North term and its axes point exactly
    // north and east. The lines cross at 60°, so range (east-west) is the weak direction: the
    // major axis is due east, 90° true. Their centroid, the solve origin, is 87 km east of the
    // target, where the Local plane's north is turned 2.1° from north at the target by meridian
    // convergence: measured in that plane, the azimuth would read 92.14°.
    const target = position(70, 20);
    const observations = [60, 120].map((fromDeg, index) =>
      sighting(`o${index}`, placed(target, fromDeg, 100_000), target, { positionAccuracyM: 0 }),
    );
    expect(distanceM(unwrapOk(bearingModel.origin(observations)), target)).toBeGreaterThan(80_000);
    const fix = unwrapOk(solve(bearingModel, observations));
    expect(distanceM(fix.position, target)).toBeLessThan(0.01);
    expect(fix.ellipse.semiMajorM).toBeGreaterThan(1.5 * fix.ellipse.semiMinorM);
    expect(Math.abs(fix.ellipse.azimuthRad - Math.PI / 2)).toBeLessThan(1e-9);
  });
});

describe('solve with BearingModel: the covariance frame (P-8.6 counterexample)', () => {
  // Shrunk counterexample of P-8.6 (task 12.15), kept as an example (testing.md rule 5). Nine
  // observers 500 m to 1.2 km due north of the target and one crossing them at about 30°; the
  // extra observation is 29 km due north, on the same meridian, with an 87 m accuracy. It adds
  // a little east-west information, so the covariance determinant must fall, by about 1.4e-7.
  // But adding an observer moves the centroid, so the Local plane origin moves from 2.3 km to
  // 4.8 km from the fix, and the covariance is expressed on that plane, whose tangential scale at
  // distance d is about 1 + d²/(6R²). That changes the determinant by about +1.4e-7 and the net
  // is +1.0e-9, over the tolerance of Req 8.6. This fails until the covariance frame is decided:
  // see the task 12 report.
  const lat = -0.08556910753561014;
  const lon = -0.004045604839908901;
  const near = (id: string, latRad = lat): Bearing =>
    makeBearing({
      id,
      observer: { latRad, lonRad: lon },
      azimuthRad: Math.PI,
      azimuthSigmaRad: 0.00017453292519943296,
      positionAccuracyM: 0,
    });
  const observations: Bearing[] = [
    ...[' ', '!', 'O', '"', '#', '$', ' !'].map((id) => near(id)),
    near('%', -0.08533749585476154),
    near('  ', -0.0846388654515735),
    makeBearing({
      id: '&',
      observer: { latRad: -0.0839093126131721, lonRad: -0.003021655131884776 },
      azimuthRad: 3.6723143557166713,
      azimuthSigmaRad: 0.000174532925199433,
      positionAccuracyM: 0,
    }),
  ];
  const extra = makeBearing({
    id: "'",
    observer: { latRad: -0.08102827184146354, lonRad: lon },
    azimuthRad: Math.PI,
    azimuthSigmaRad: 0.00017453292519943296,
    positionAccuracyM: 87.11516708720474,
  });
  const determinant = (fix: Fix): number =>
    fix.covariance.varEastM2 * fix.covariance.varNorthM2 - fix.covariance.covEastNorthM2 ** 2;

  it('does not raise det(covariance) by more than 1e-9 when a noise-free observation is added', () => {
    const before = determinant(unwrapOk(solve(bearingModel, observations)));
    const after = determinant(unwrapOk(solve(bearingModel, [...observations, extra])));
    expect(after).toBeLessThanOrEqual(before * (1 + 1e-9));
  });
});

describe('solve: the projection stays on the stub origin', () => {
  it('projects the truth back exactly (sanity check of the test helpers)', () => {
    const point = unwrapOk(projectToLocalPlane(stubOrigin, at(stubOrigin, truth)));
    expect(point.eastM).toBeCloseTo(truth.eastM, 6);
    expect(point.northM).toBeCloseTo(truth.northM, 6);
  });
});
