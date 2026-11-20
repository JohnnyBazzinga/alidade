// The altitude Measurement model for Core's solver (Req 5, design D7, §6.4). Written in this
// package; nothing in `skeleton/core` is changed for it.

import {
  angularDifference,
  initialAzimuthRad,
  isSupportedPosition,
  POOR_GEOMETRY_CROSSING_RAD,
  unprojectToLocalPlane,
  type Evaluation,
  type Failure,
  type LocalPoint,
  type MeasurementModel,
  type Position,
  type Result,
  type Warning,
} from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { DEG_TO_RAD } from '../degrees';
import { checkParameters, type NoniusParameters } from '../parameters';
import type { PreparedSight } from '../sight/prepare';

/** One Sight as the solver sees it. */
export interface AltitudeObservation {
  readonly id: string;
  readonly timeUtcMs: number;
  /** The geometric altitude the Sight observed, plus the sensitivity shift. */
  readonly observedAltitudeRad: number;
  /** For `validate`: the corrected apparent altitude, which the limits apply to. */
  readonly correctedApparentAltitudeRad: number;
  /** The Effective sigma: Independent (Fix solve) or `hypot(Independent, Common)` (check solve). */
  readonly sigmaRad: number;
  readonly subsolar: Position;
}

/** The step of the central differences of the partial derivatives: 1 m (design D7). */
const PARTIAL_STEP_M = 1;
/** The least and greatest Effective sigma `validate` accepts (Req 5.7): 0.01° and 45°. */
const LEAST_SIGMA_RAD = 0.01 * DEG_TO_RAD;
const GREATEST_SIGMA_RAD = 45 * DEG_TO_RAD;
/** The largest Angle of cut below which the geometry is singular (Req 5.6): 0.5°. */
const SINGULAR_CUT_RAD = 0.5 * DEG_TO_RAD;
/** The excess of `|sin h|` over 1 that is rounding and not a bug (math-conventions). */
const CLAMP_EXCESS = 1e-12;

const failure = (reason: Failure['reason'], field?: string, id?: string): Failure => ({
  ok: false,
  reason,
  ...(field === undefined ? {} : { field }),
  ...(id === undefined ? {} : { id }),
});

/**
 * The observations of the prepared Sights for one solve: the observed geometric altitude plus
 * `shiftRad` (0 for the check and Fix solves, `±SENSITIVITY_STEP_RAD` for the shared-error
 * sensitivity), and the Effective sigma of `sigmaKind`: `independent`, or `full` (the `hypot` of
 * the Independent and Common sigmas).
 */
export function observationsOf(
  prepared: readonly PreparedSight[],
  sigmaKind: 'independent' | 'full',
  shiftRad: number,
): NoniusResult<readonly AltitudeObservation[]> {
  if (!Number.isFinite(shiftRad)) return err('invalid_number', { field: 'shiftRad' });
  const out: AltitudeObservation[] = [];
  for (const p of prepared) {
    const sigmaRad =
      sigmaKind === 'independent'
        ? p.independentSigmaRad
        : Math.hypot(p.independentSigmaRad, p.commonSigmaRad);
    const observedAltitudeRad = p.observedGeometricAltitudeRad + shiftRad;
    const numbers: readonly [string, number][] = [
      ['sigmaRad', sigmaRad],
      ['observedAltitudeRad', observedAltitudeRad],
      ['correctedApparentAltitudeRad', p.correctedApparentAltitudeRad],
      ['timeUtcMs', p.sight.timeUtcMs],
      ['subsolar.latRad', p.subsolar.latRad],
      ['subsolar.lonRad', p.subsolar.lonRad],
    ];
    for (const [field, number] of numbers) {
      if (!Number.isFinite(number))
        return err('invalid_observation', { id: String(p.sight.id), field });
    }
    out.push({
      id: p.sight.id,
      timeUtcMs: p.sight.timeUtcMs,
      observedAltitudeRad,
      correctedApparentAltitudeRad: p.correctedApparentAltitudeRad,
      sigmaRad,
      subsolar: p.subsolar,
    });
  }
  return ok(out);
}

/**
 * The model `sin h = sin φ sin δ + cos φ cos δ cos(λ − λs)` of a Sun sight at a candidate, with
 * `δ` and `λs` the Subsolar point of the Sight (so `LHA = GHA + λ = λ − λs`).
 *
 * `origin` is the `start` and `startEstimate` is `(0, 0)`. The partial derivatives are central
 * differences of 1 m on the plane of the call's origin, because they are then the exact
 * derivatives of the function Core minimises on that plane at any distance from the origin; at the
 * Fix, where Core takes the covariance, the plane is the Fix's own and they equal
 * `(sin A, cos A) / R`. `evaluate` refuses a candidate farther than `planeLimitM` from its origin
 * with `out_of_range`, so that Core's solver, which takes a trial point that fails to evaluate as
 * a rise in cost, never evaluates beyond the plane Core guarantees. The model never returns the
 * reasons of bearings (`diverging_bearings`, `colocated_observers`).
 */
export function createAltitudeModel(
  start: Position,
  params: NoniusParameters,
): NoniusResult<MeasurementModel<AltitudeObservation>> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!isSupportedPosition(start)) return err('unsupported_position', { field: 'start' });
  const { planeLimitM } = params;

  const altitudeAt = (
    origin: Position,
    eastM: number,
    northM: number,
    subsolar: Position,
  ): Result<number> => {
    const place = unprojectToLocalPlane(origin, { eastM, northM });
    if (!place.ok) return place;
    const sinAltitude =
      Math.sin(place.value.latRad) * Math.sin(subsolar.latRad) +
      Math.cos(place.value.latRad) *
        Math.cos(subsolar.latRad) *
        Math.cos(place.value.lonRad - subsolar.lonRad);
    if (!Number.isFinite(sinAltitude) || Math.abs(sinAltitude) > 1 + CLAMP_EXCESS) {
      return failure('invalid_number', 'sinAltitude');
    }
    return { ok: true, value: Math.asin(Math.max(-1, Math.min(1, sinAltitude))) };
  };

  const model: MeasurementModel<AltitudeObservation> = {
    validate(o: AltitudeObservation): Result<void> {
      const bad = (field: string) => failure('invalid_observation', field, String(o.id));
      if (typeof o.id !== 'string' || o.id === '') return bad('id');
      if (
        !Number.isFinite(o.timeUtcMs) ||
        o.timeUtcMs < params.sunModelStartUtcMs ||
        o.timeUtcMs >= params.sunModelEndUtcMs
      ) {
        return bad('timeUtcMs');
      }
      if (
        !Number.isFinite(o.correctedApparentAltitudeRad) ||
        o.correctedApparentAltitudeRad < params.minSightAltitudeRad ||
        o.correctedApparentAltitudeRad > params.maxSightAltitudeRad
      ) {
        return bad('correctedApparentAltitudeRad');
      }
      if (
        !Number.isFinite(o.sigmaRad) ||
        o.sigmaRad < LEAST_SIGMA_RAD ||
        o.sigmaRad > GREATEST_SIGMA_RAD
      ) {
        return bad('sigmaRad');
      }
      if (!Number.isFinite(o.observedAltitudeRad)) return bad('observedAltitudeRad');
      if (!isSupportedPosition(o.subsolar)) return bad('subsolar');
      return { ok: true, value: undefined };
    },

    idOf: (o) => o.id,

    origin: () => ({ ok: true, value: start }),

    startEstimate: (): Result<LocalPoint> => ({ ok: true, value: { eastM: 0, northM: 0 } }),

    geometryCheck(
      observations: readonly AltitudeObservation[],
    ): Result<{ readonly warnings: readonly Warning[] }> {
      const azimuths: number[] = [];
      for (const o of observations) {
        const azimuth = initialAzimuthRad(start, o.subsolar);
        if (!azimuth.ok) return azimuth;
        azimuths.push(azimuth.value);
      }
      let largest = 0;
      for (let i = 0; i < azimuths.length; i += 1) {
        for (let j = i + 1; j < azimuths.length; j += 1) {
          const difference = angularDifference(azimuths[i] ?? 0, azimuths[j] ?? 0);
          if (!difference.ok) return difference;
          const delta = Math.abs(difference.value);
          largest = Math.max(largest, Math.min(delta, Math.PI - delta));
        }
      }
      if (largest < SINGULAR_CUT_RAD) return failure('singular_geometry');
      return {
        ok: true,
        value: { warnings: largest < POOR_GEOMETRY_CROSSING_RAD ? ['poor_geometry'] : [] },
      };
    },

    evaluate(o: AltitudeObservation, candidate: LocalPoint, origin: Position): Result<Evaluation> {
      if (!Number.isFinite(candidate.eastM) || !Number.isFinite(candidate.northM)) {
        return failure('invalid_number', 'candidate');
      }
      if (Math.hypot(candidate.eastM, candidate.northM) > planeLimitM) {
        return failure('out_of_range', 'candidate', String(o.id));
      }
      const here = altitudeAt(origin, candidate.eastM, candidate.northM, o.subsolar);
      if (!here.ok) return here;
      const eastPlus = altitudeAt(
        origin,
        candidate.eastM + PARTIAL_STEP_M,
        candidate.northM,
        o.subsolar,
      );
      if (!eastPlus.ok) return eastPlus;
      const eastMinus = altitudeAt(
        origin,
        candidate.eastM - PARTIAL_STEP_M,
        candidate.northM,
        o.subsolar,
      );
      if (!eastMinus.ok) return eastMinus;
      const northPlus = altitudeAt(
        origin,
        candidate.eastM,
        candidate.northM + PARTIAL_STEP_M,
        o.subsolar,
      );
      if (!northPlus.ok) return northPlus;
      const northMinus = altitudeAt(
        origin,
        candidate.eastM,
        candidate.northM - PARTIAL_STEP_M,
        o.subsolar,
      );
      if (!northMinus.ok) return northMinus;
      const evaluation: Evaluation = {
        predictedRad: here.value,
        residualRad: o.observedAltitudeRad - here.value,
        effectiveSigmaRad: o.sigmaRad,
        partialEastRadPerM: (eastPlus.value - eastMinus.value) / (2 * PARTIAL_STEP_M),
        partialNorthRadPerM: (northPlus.value - northMinus.value) / (2 * PARTIAL_STEP_M),
      };
      const finite = Object.values(evaluation).every((v) => Number.isFinite(v));
      return finite ? { ok: true, value: evaluation } : failure('invalid_number', 'evaluation');
    },

    postSolveCheck: () => ({ ok: true, value: { warnings: [] } }),
  };
  return ok(model);
}
