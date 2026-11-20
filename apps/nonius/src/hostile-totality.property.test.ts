// P-2.6: the hostile totality, as a registry (Req 2.1, 2.6, 14.3).
//
// `HOSTILE_LIST` names every public function of the Math layer and of the Adapter with a
// generator of its arguments. Each is run over hostile inputs (`NaN`, infinities, -0, empty and
// very long strings, the doubles either side of every limit): it must not throw, and every
// number in its result must be finite. A parameter that is not finite, not positive or
// inconsistent must be `invalid_number` naming it, in every function that takes parameters, before
// anything else is looked at. Every task that adds a public function adds it to this list in the
// same task, with its entry written when the function is written; the completeness test below
// fails otherwise.

import type { Fix } from '@alidade/core';
import { CATALOGUE_CALIBRATION, type CapturedResult, type FrozenSighting } from '@alidade/ui';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ageText, utcClockText, utcDateText, waitText } from './math/civil-time';
import { fromArcmin, fromDeg, toDeg } from './math/degrees';
import {
  indexErrorFromSights,
  type CalibrationInUse,
  type IndexError,
} from './math/sight/index-error';
import { prepareSights, type PreparedSight } from './math/sight/prepare';
import { checkSight, independentSigmaRad, sightFromCapture, type Sight } from './math/sight/sight';
import { sunSideFromFrozen } from './math/sight/sun-side';
import { messageFor } from './math/messages';
import {
  createAltitudeModel,
  observationsOf,
  type AltitudeObservation,
} from './math/fix/altitude-model';
import { adviceWords, nextSightAdvice, ruleOfThumb } from './math/fix/advice';
import { assess, type Assessment } from './math/fix/assess';
import { candidates } from './math/fix/candidates';
import { geometryClass, geometrySentence } from './math/fix/geometry-class';
import { countStatement, disagreementStatement } from './math/fix/statements';
import { contradicts } from './math/fix/sun-side-check';
import { recentredSolve } from './math/fix/recentred-solve';
import { sharedErrorCovariance } from './math/fix/shared-error';
import { checkSolve, placeFix } from './math/fix/solve-candidate';
import { circleCrossings } from './math/sphere/circle-crossings';
import { apparentFromGeometricRad, refractionRad } from './math/sun/refraction';
import { sunAt } from './math/sun/sun-at';
import {
  greenwichMeanSiderealTimeRad,
  greenwichSiderealTimeRad,
  subsolarPoint,
  sunPosition,
} from './math/sun/sun-wrapper';
import { checkParameters, defaultParameters, type NoniusParameters } from './math/parameters';
import { NONIUS_REASONS } from './reasons';
import { altitudeCapture } from './test-support/captures';
import { cappedRuns } from './test-support/fast-check-setup';
import { allFinite, hostileNumber, hostileString, isTotalResult } from './test-support/hostile';
import { checkProperty, ErrorTracker } from './test-support/property-report';
import { views } from './test-support/source-views';

interface HostileEntry {
  readonly name: string;
  /** Runs the property of this function: P-2.6 for one entry of the list. */
  readonly run: () => void | Promise<void>;
}

/** A value is total when its numbers are finite and, if it is a Result, it is a total one. */
function isTotal(value: unknown): boolean {
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'ok') === 'boolean'
  ) {
    return isTotalResult(value);
  }
  return allFinite(value);
}

/**
 * One entry: the function, a generator of its arguments (its domain is stated where it is
 * built), and an optional extra check on the arguments and the result. The property is that the
 * call does not throw and that the result is total.
 */
export function hostileEntry<Args extends unknown[]>(
  name: string,
  args: fc.Arbitrary<Args>,
  fn: (...args: Args) => unknown,
  extra: (args: Args, result: unknown) => void = () => undefined,
): HostileEntry {
  return {
    name,
    run: () =>
      checkProperty(
        `P-2.6 ${name}`,
        fc.property(args, (given) => {
          let result: unknown;
          expect(() => {
            result = fn(...given);
          }, `${name} threw`).not.toThrow();
          expect(isTotal(result), `${name} returned a value with NaN or infinity`).toBe(true);
          extra(given, result);
        }),
        new ErrorTracker(),
        { numRuns: cappedRuns(10_000) },
      ),
  };
}

// --- the arguments ---------------------------------------------------------------------------

/**
 * Parameters as the functions take them. Domain: the defaults, with each field independently one
 * time in four replaced by a hostile double (so a NaN, an infinity, a negative, a zero, a
 * neighbour of a limit, a huge value), and one in three of the records has no field replaced.
 */
export function hostileParameters(): fc.Arbitrary<NoniusParameters> {
  const defaults = defaultParameters();
  const keys = Object.keys(defaults) as (keyof NoniusParameters)[];
  return fc
    .tuple(
      fc.boolean(),
      fc.array(fc.tuple(fc.integer({ min: 0, max: 3 }), hostileNumber()), {
        minLength: keys.length,
        maxLength: keys.length,
      }),
    )
    .map(([clean, draws]): NoniusParameters => {
      if (clean) return defaults;
      const out: Record<string, number> = { ...defaults };
      keys.forEach((key, i) => {
        const draw = draws[i];
        if (draw !== undefined && draw[0] === 0) out[key] = draw[1];
      });
      return out as unknown as NoniusParameters;
    });
}

/**
 * A failure as `messageFor` takes it. Domain: any reason of the closed set, and each detail
 * absent or hostile: `field`, `id` and `errorName` strings of 0 to 10 000 characters of the full
 * BMP, `reportedAccuracyM` any hostile double.
 */
const hostileFailure = fc.record(
  {
    ok: fc.constant(false as const),
    reason: fc.constantFrom(...NONIUS_REASONS),
    field: hostileString(),
    id: hostileString(),
    errorName: hostileString(),
    reportedAccuracyM: hostileNumber(),
  },
  { requiredKeys: ['ok', 'reason'] },
);

/**
 * A UTC time. Domain: any hostile double, and one draw in two a finite time inside, at, or just
 * outside the Sun wrapper's range (2000 to 2050, in whole milliseconds).
 */
export function hostileTime(): fc.Arbitrary<number> {
  const p = defaultParameters();
  return fc.oneof(
    hostileNumber(),
    fc.integer({ min: p.sunModelStartUtcMs - 5, max: p.sunModelStartUtcMs + 5 }),
    fc.integer({ min: p.sunModelEndUtcMs - 5, max: p.sunModelEndUtcMs + 5 }),
    fc.integer({ min: p.sunModelStartUtcMs, max: p.sunModelEndUtcMs }),
  );
}

/**
 * A position as `{ latRad, lonRad }`. Domain: each coordinate a hostile double, or one draw in
 * two a latitude in [-π/2, π/2] and a longitude in [-π, π] (poles included).
 */
export function hostilePosition(): fc.Arbitrary<{ latRad: number; lonRad: number }> {
  return fc.oneof(
    fc.record({ latRad: hostileNumber(), lonRad: hostileNumber() }),
    fc.record({
      latRad: fc.double({ min: -Math.PI / 2, max: Math.PI / 2, noNaN: true }),
      lonRad: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    }),
  );
}

/** Parameters first: a record with a bad field gives `invalid_number` naming it, whatever else. */
export function expectParametersFirst(p: NoniusParameters, result: unknown): void {
  const bad = firstBadField(p);
  if (bad !== null) {
    expect(result).toEqual({ ok: false, reason: 'invalid_number', field: bad });
    return;
  }
  const checked = checkParameters(p);
  if (!checked.ok) expect(result).toEqual(checked);
}

/** A Sight with every number hostile (ids strings of the full BMP). */
export function hostileSight(): fc.Arbitrary<Sight> {
  return fc.record({
    id: hostileString(),
    timeUtcMs: hostileTime(),
    rawApparentAltitudeRad: hostileNumber(),
    sampleStdDevRad: hostileNumber(),
    markSigmaRad: hostileNumber(),
    sunSide: fc.oneof(
      fc.constant(null),
      fc.record({
        azimuthRad: hostileNumber(),
        northReference: fc.constantFrom('magnetic' as const, 'true' as const),
      }),
    ),
    simulated: fc.boolean(),
  });
}

/** An Index error with every number hostile. */
export function hostileIndexError(): fc.Arbitrary<IndexError> {
  return fc.record({
    valueRad: hostileNumber(),
    sigmaRad: hostileNumber(),
    sightCount: hostileNumber(),
    measuredUtcMs: hostileNumber(),
    simulated: fc.boolean(),
  });
}

/** A Calibration in use: none, or an Index error with hostile numbers. */
export function hostileCalibration(): fc.Arbitrary<CalibrationInUse> {
  return fc.oneof(
    fc.record({ kind: fc.constant('uncalibrated' as const), sigmaRad: hostileNumber() }),
    fc.record({
      kind: fc.constant('index_error' as const),
      indexError: fc.record({
        valueRad: hostileNumber(),
        sigmaRad: hostileNumber(),
        sightCount: hostileNumber(),
        measuredUtcMs: hostileNumber(),
        simulated: fc.boolean(),
      }),
    }),
  );
}

/** An altitude capture with hostile numbers; one draw in five is of the other kind. */
export function hostileCapture(): fc.Arbitrary<CapturedResult> {
  return fc
    .tuple(
      hostileNumber(),
      hostileNumber(),
      fc.oneof(fc.constant(null), hostileNumber()),
      hostileTime(),
      hostileNumber(),
      fc.integer({ min: 0, max: 4 }),
    )
    .map(([altitude, sd, mark, end, length, kindDraw]) => {
      const base = altitudeCapture({
        apparentAltitudeRad: altitude,
        sampleStdDevRad: sd,
        markSigmaRad: mark,
        frozenAtUtcMs: end,
        windowLengthMs: length,
      });
      return kindDraw === 0 ? ({ ...base, kind: 'bearing' } as unknown as CapturedResult) : base;
    });
}

/**
 * A Frozen sighting with hostile numbers in its window and few or no samples: the history holds
 * 0 to 8 samples with hostile times and rotations.
 */
export function hostileFrozen(): fc.Arbitrary<FrozenSighting> {
  const sample = fc.record({
    timeUtcMs: hostileTime(),
    frame: fc.constantFrom('absolute' as const, 'relative' as const),
    rotation: fc.record({
      alphaRad: hostileNumber(),
      betaRad: hostileNumber(),
      gammaRad: hostileNumber(),
    }),
    screenAngleRad: fc.constant(null),
    magneticHeadingRad: fc.constant(null),
    compassAccuracyRad: fc.constant(null),
  });
  return fc
    .tuple(
      fc.array(sample, { maxLength: 8 }),
      fc.record({
        endUtcMs: hostileTime(),
        windowLengthMs: hostileNumber(),
        minSampleCount: fc.integer({ min: 0, max: 5 }),
        sampleStalenessMs: hostileNumber(),
      }),
      fc.oneof(
        fc.constant(null),
        fc.record({
          offset: fc.record({ rightRad: hostileNumber(), upRad: hostileNumber() }),
          imageSigmaRad: hostileNumber(),
          calibration: fc.constant(CATALOGUE_CALIBRATION),
        }),
      ),
      fc.oneof(
        fc.constant(null),
        fc.record({
          offsetRad: hostileNumber(),
          sigmaRad: hostileNumber(),
          northReference: fc.constantFrom('magnetic' as const, 'true' as const),
          frame: fc.constantFrom('absolute' as const, 'relative' as const),
          establishedUtcMs: hostileNumber(),
        }),
      ),
    )
    .map(
      ([samples, window, mark, yawReference]) =>
        ({
          history: { samples, frameResets: [], positionFix: null },
          window,
          yawReference,
          yawReferenceSource: yawReference === null ? null : 'known-azimuth',
          declination: null,
          mark,
          frozenAtUtcMs: window.endUtcMs,
        }) as unknown as FrozenSighting,
    );
}

/** A Fix with every number hostile (Core's type; only what the functions read matters). */
export function fixAtPosition(position: { latRad: number; lonRad: number }): Fix {
  return {
    position,
    covariance: { varEastM2: 1, varNorthM2: 1, covEastNorthM2: 0 },
    ellipse: { semiMajorM: 1, semiMinorM: 1, azimuthRad: 0 },
    residuals: [],
    iterations: 1,
    warnings: [],
    excludedIds: [],
  };
}

export function hostileFix(): fc.Arbitrary<Fix> {
  return fc
    .tuple(
      hostilePosition(),
      fc.record({
        varEastM2: hostileNumber(),
        varNorthM2: hostileNumber(),
        covEastNorthM2: hostileNumber(),
      }),
      fc.record({
        semiMajorM: hostileNumber(),
        semiMinorM: hostileNumber(),
        azimuthRad: hostileNumber(),
      }),
      fc.array(hostileString(), { maxLength: 3 }),
    )
    .map(([position, covariance, ellipse, excludedIds]) => ({
      ...fixAtPosition(position),
      covariance,
      ellipse,
      excludedIds,
    }));
}

/** A prepared Sight with every number hostile. */
export function hostilePrepared(): fc.Arbitrary<PreparedSight> {
  return fc
    .tuple(
      hostileSight(),
      hostileNumber(),
      hostileNumber(),
      hostileNumber(),
      hostileNumber(),
      hostilePosition(),
    )
    .map(([sight, corrected, observed, independent, common, subsolar]) => ({
      sight,
      correctedApparentAltitudeRad: corrected,
      observedGeometricAltitudeRad: observed,
      independentSigmaRad: independent,
      commonSigmaRad: common,
      subsolar,
      sunDeclinationRad: subsolar.latRad,
    }));
}

/** An observation of the altitude model with every number hostile. */
export function hostileObservation(): fc.Arbitrary<AltitudeObservation> {
  return fc
    .tuple(
      hostileString(),
      hostileTime(),
      hostileNumber(),
      hostileNumber(),
      hostileNumber(),
      hostilePosition(),
    )
    .map(
      ([id, timeUtcMs, observedAltitudeRad, correctedApparentAltitudeRad, sigmaRad, subsolar]) => ({
        id,
        timeUtcMs,
        observedAltitudeRad,
        correctedApparentAltitudeRad,
        sigmaRad,
        subsolar,
      }),
    );
}

/** The first field of a record, in the order of its keys, that is not a finite positive number. */
function firstBadField(p: NoniusParameters): string | null {
  for (const [key, value] of Object.entries(p)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return key;
  }
  return null;
}

// --- the list --------------------------------------------------------------------------------

export const HOSTILE_LIST: readonly HostileEntry[] = [
  hostileEntry(
    'messageFor',
    fc.tuple(hostileFailure),
    (failure) => messageFor(failure),
    (_a, r) => {
      expect(typeof Reflect.get(r as object, 'whatHappened')).toBe('string');
      expect(typeof Reflect.get(r as object, 'whatToDo')).toBe('string');
    },
  ),
  hostileEntry('fromDeg', fc.tuple(hostileNumber()), fromDeg),
  hostileEntry('toDeg', fc.tuple(hostileNumber()), toDeg),
  hostileEntry('fromArcmin', fc.tuple(hostileNumber()), fromArcmin),
  hostileEntry('utcClockText', fc.tuple(hostileNumber()), utcClockText, (_a, r) => {
    expect(r).toMatch(/^(?:\d\d:\d\d|--:--) UTC$/);
  }),
  hostileEntry('utcDateText', fc.tuple(hostileNumber()), utcDateText, (_a, r) => {
    expect(r).toMatch(/^(?:\d{1,2} [A-Z][a-z]{2} -?\d+|date unknown)$/);
  }),
  hostileEntry('ageText', fc.tuple(hostileNumber()), ageText, (_a, r) => {
    expect(String(r)).not.toMatch(/NaN|Infinity|undefined/);
  }),
  hostileEntry('waitText', fc.tuple(hostileNumber(), hostileNumber()), waitText, (_a, r) => {
    expect(String(r)).not.toMatch(/NaN|Infinity|undefined/);
  }),
  // Task group 3: parameters first, then the time, then the library.
  ...(
    [
      ['sunPosition', sunPosition],
      ['subsolarPoint', subsolarPoint],
      ['greenwichSiderealTimeRad', greenwichSiderealTimeRad],
      ['greenwichMeanSiderealTimeRad', greenwichMeanSiderealTimeRad],
    ] as const
  ).map(([name, fn]) =>
    hostileEntry(
      name,
      fc.tuple(hostileTime(), hostileParameters()),
      (t, p) => fn(t, p),
      ([, p], r) => expectParametersFirst(p, r),
    ),
  ),
  hostileEntry('refractionRad', fc.tuple(hostileNumber()), refractionRad),
  hostileEntry('apparentFromGeometricRad', fc.tuple(hostileNumber()), apparentFromGeometricRad),
  hostileEntry(
    'sunAt',
    fc.tuple(hostilePosition(), hostileTime(), hostileParameters()),
    (position, t, p) => sunAt(position, t, p),
    ([, , p], r) => expectParametersFirst(p, r),
  ),
  // Task group 4.
  hostileEntry(
    'independentSigmaRad',
    fc.tuple(hostileNumber(), hostileNumber(), hostileNumber(), hostileParameters()),
    (sd, mark, altitude, p) => independentSigmaRad(sd, mark, altitude, p),
    ([, , , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry('checkSight', fc.tuple(hostileSight()), checkSight, (_a, r) => {
    expect(r === null || (r as { reason: string }).reason === 'invalid_observation').toBe(true);
  }),
  hostileEntry(
    'sightFromCapture',
    fc.tuple(
      hostileCapture(),
      hostileCalibration(),
      fc.array(hostileString(), { maxLength: 30 }),
      hostileParameters(),
    ),
    (capture, calibration, ids, p) => sightFromCapture(capture, null, ids, calibration, false, p),
    ([, , , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'prepareSights',
    fc.tuple(fc.array(hostileSight(), { maxLength: 6 }), hostileCalibration(), hostileParameters()),
    (sights, calibration, p) => prepareSights(sights, calibration, p),
    ([, , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'indexErrorFromSights',
    fc.tuple(
      fc.array(hostileSight(), { maxLength: 6 }),
      hostilePosition(),
      hostileNumber(),
      hostileParameters(),
    ),
    (sights, position, sigmaM, p) =>
      indexErrorFromSights(
        sights,
        { position, reportedAccuracyM: sigmaM, sigmaM, timeUtcMs: 0 },
        false,
        p,
      ),
    ([, , , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry('sunSideFromFrozen', fc.tuple(hostileFrozen(), hostileParameters()), (frozen, p) =>
    sunSideFromFrozen(frozen, p),
  ),
  // Task group 5.
  hostileEntry(
    'circleCrossings',
    fc.tuple(hostilePosition(), hostileNumber(), hostilePosition(), hostileNumber()),
    circleCrossings,
  ),
  hostileEntry(
    'observationsOf',
    fc.tuple(
      fc.array(hostilePrepared(), { maxLength: 4 }),
      fc.constantFrom('independent' as const, 'full' as const),
      hostileNumber(),
    ),
    observationsOf,
  ),
  hostileEntry(
    'createAltitudeModel',
    fc.tuple(hostilePosition(), hostileParameters()),
    (start, p) => createAltitudeModel(start, p),
    ([, p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'candidates',
    fc.tuple(fc.array(hostilePrepared(), { maxLength: 4 }), hostileParameters()),
    candidates,
    ([, p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'recentredSolve',
    fc.tuple(
      fc.array(hostileObservation(), { maxLength: 4 }),
      hostilePosition(),
      hostileParameters(),
    ),
    (observations, start, p) => recentredSolve(observations, start, {}, p),
    ([, , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'sharedErrorCovariance',
    fc.tuple(
      fc.record({
        varEastM2: hostileNumber(),
        varNorthM2: hostileNumber(),
        covEastNorthM2: hostileNumber(),
      }),
      hostilePosition(),
      hostilePosition(),
      hostileNumber(),
      hostileNumber(),
    ),
    (base, fixPosition, shiftedPosition, sigma, step) =>
      sharedErrorCovariance(
        base,
        fixPosition,
        () => ({ ok: true, value: fixAtPosition(shiftedPosition) }),
        sigma,
        step,
      ),
  ),
  hostileEntry(
    'checkSolve',
    fc.tuple(fc.array(hostilePrepared(), { maxLength: 4 }), hostilePosition(), hostileParameters()),
    checkSolve,
    ([, , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'placeFix',
    fc.tuple(fc.array(hostilePrepared(), { maxLength: 4 }), hostileFix(), hostileParameters()),
    placeFix,
    ([, , p], r) => expectParametersFirst(p, r),
  ),
  // Task group 6.
  hostileEntry(
    'contradicts',
    fc.tuple(hostilePosition(), fc.array(hostilePrepared(), { maxLength: 4 }), hostileParameters()),
    contradicts,
    ([, , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'assess',
    fc.tuple(
      fc.array(hostileSight(), { maxLength: 5 }),
      fc.oneof(fc.constant(null), hostileIndexError()),
      fc.oneof(
        fc.constant(null),
        fc.record({
          usedIdsKey: hostileString(),
          placeIndex: fc.constantFrom(0 as const, 1 as const),
        }),
      ),
      hostileParameters(),
    ),
    assess,
    ([, , , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'geometryClass',
    fc.tuple(fc.oneof(fc.constant(null), hostileFix()), hostileParameters()),
    geometryClass,
    ([, p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'disagreementStatement',
    fc.tuple(
      fc.oneof(
        fc.record({
          kind: fc.constantFrom('empty', 'one', 'failed', 'two_places'),
          disagreement: fc.boolean(),
        }),
        fc.record({ kind: fc.constant('fix'), disagreement: fc.boolean() }),
      ),
    ),
    (assessment) => disagreementStatement(assessment as unknown as Assessment),
    (_a, r) => expect(r === null || typeof r === 'string').toBe(true),
  ),
  hostileEntry(
    'geometrySentence',
    fc.tuple(fc.constantFrom('none', 'poor', 'fair', 'good')),
    geometrySentence,
  ),
  hostileEntry('countStatement', fc.tuple(hostileNumber()), countStatement, (_a, r) => {
    expect(String(r)).not.toMatch(/NaN|Infinity|undefined|null/);
  }),
  hostileEntry(
    'nextSightAdvice',
    fc.tuple(
      hostilePosition(),
      fc.array(hostilePrepared(), { maxLength: 3 }),
      hostileTime(),
      hostileParameters(),
    ),
    nextSightAdvice,
    ([, , , p], r) => expectParametersFirst(p, r),
  ),
  hostileEntry(
    'adviceWords',
    fc.tuple(
      fc.oneof(
        fc.constant({ kind: 'not_today' as const }),
        fc.record({
          kind: fc.constant('wait' as const),
          waitMs: hostileNumber(),
          atUtcMs: hostileNumber(),
        }),
      ),
      hostileNumber(),
      hostileParameters(),
    ),
    adviceWords,
    (_a, r) => expect(String(r)).not.toMatch(/NaN|Infinity|undefined|null/),
  ),
  hostileEntry('ruleOfThumb', fc.tuple(hostileParameters()), ruleOfThumb, (_a, r) => {
    expect(String(r)).not.toMatch(/NaN|Infinity|undefined|null/);
  }),
  hostileEntry('defaultParameters', fc.constant<[]>([]), defaultParameters),
  hostileEntry(
    'checkParameters',
    fc.tuple(hostileParameters()),
    (p) => checkParameters(p),
    ([p], r) => {
      const bad = firstBadField(p);
      if (bad !== null) {
        expect(r).toEqual({ ok: false, reason: 'invalid_number', field: bad });
      }
      if ((r as { ok: boolean }).ok) expect(bad).toBeNull();
    },
  ),
];

/** A function exported by a Math or Adapter file that the list does not run, and why. */
export const NOT_HOSTILE_TESTED: Readonly<Record<string, string>> = {
  calibrationInUse:
    'wraps an Index error that indexErrorFromSights made or parseState validated; every consumer (prepareSights) refuses a non-finite value, so none leaves',
};

describe('P-2.6: the hostile totality (Req 2.1, 2.6)', () => {
  for (const entry of HOSTILE_LIST) {
    it(`${entry.name} does not throw and returns only finite numbers`, async () => {
      await entry.run();
    });
  }
});

// --- completeness of the list ----------------------------------------------------------------

/** The names of the functions a source exports: `export function f` and `export const f = (…) =>`. */
export function exportedFunctionNames(code: string): string[] {
  const names = [...code.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)/g)].map(
    (m) => m[1] ?? '',
  );
  const arrows = code.matchAll(
    /\bexport\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?(?:\([^()]*\)|\w+)\s*(?::[^=()]+)?=>/g,
  );
  return [...names, ...[...arrows].map((m) => m[1] ?? '')];
}

/**
 * Every source of the Math layer and of the Adapters (a file under a `math/` or an `adapters/`
 * folder, tests excluded), read as text. `defaults.ts` is outside the layers: its only functions
 * are the Clock and the Timer, which take no hostile input.
 */
const MATH_SOURCES: Readonly<Record<string, string>> = import.meta.glob<string>(
  ['./**/math/**/*.ts', './**/adapters/**/*.ts', '!./**/*.test.ts'],
  { query: '?raw', import: 'default', eager: true },
);

describe('the hostile list is complete', () => {
  const found = Object.entries(MATH_SOURCES).flatMap(([path, text]) =>
    exportedFunctionNames(views(text).code).map((name) => ({ name, path })),
  );
  const listed = new Set(HOSTILE_LIST.map((entry) => entry.name));

  it('scans the Math files that exist and finds their functions', () => {
    expect(Object.keys(MATH_SOURCES).length).toBeGreaterThanOrEqual(4);
    expect(found.map((f) => f.name)).toEqual(
      expect.arrayContaining(['messageFor', 'toDeg', 'fromDeg', 'checkParameters']),
    );
  });

  it('has an entry, or a stated reason, for every exported function of the Math layer', () => {
    const missing = found.filter(({ name }) => !listed.has(name) && !(name in NOT_HOSTILE_TESTED));
    expect(missing).toEqual([]);
  });

  it('names no function that does not exist, and no name twice', () => {
    const existing = new Set(found.map((f) => f.name));
    expect(HOSTILE_LIST.filter((e) => !existing.has(e.name)).map((e) => e.name)).toEqual([]);
    expect(Object.keys(NOT_HOSTILE_TESTED).filter((name) => !existing.has(name))).toEqual([]);
    expect(listed.size).toBe(HOSTILE_LIST.length);
    expect(found.length).toBe(new Set(found.map((f) => f.name)).size);
  });

  it('reads both forms of export, and nothing in a comment or a type', () => {
    const code = views(
      [
        '// export function inComment() {}',
        'export function plain(a: number) { return a; }',
        'export async function later() {}',
        'export const arrow = (x: number): number => x;',
        'export const single = x => x;',
        'export const constant = 3;',
        'export const computed: number = (() => {\n  return 1;\n})();',
        'export const table = { f: () => 1 };',
        'export type T = () => void;',
        'export interface I { f(): void }',
      ].join('\n'),
    ).code;
    expect(exportedFunctionNames(code).sort()).toEqual(['arrow', 'later', 'plain', 'single']);
  });
});
