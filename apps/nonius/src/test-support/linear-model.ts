// A test-only Measurement model whose predictions are linear in East and North (Req 7.9; design
// §7.3), so that the covariance of the shared-error method has a closed form to be compared with
// (test support, not exported).

import type { Evaluation, MeasurementModel, Position } from '@alidade/core';

export interface LinearObservation {
  readonly id: string;
  /** Radians of prediction per metre East and North. */
  readonly eastRadPerM: number;
  readonly northRadPerM: number;
  readonly observedRad: number;
  readonly sigmaRad: number;
}

/** The linear model on the Local plane of `origin`. It never fails a valid observation. */
export function createLinearModel(origin: Position): MeasurementModel<LinearObservation> {
  return {
    validate: () => ({ ok: true, value: undefined }),
    idOf: (o) => o.id,
    origin: () => ({ ok: true, value: origin }),
    startEstimate: () => ({ ok: true, value: { eastM: 0, northM: 0 } }),
    geometryCheck: () => ({ ok: true, value: { warnings: [] } }),
    evaluate: (o, candidate): { ok: true; value: Evaluation } => {
      const predictedRad = o.eastRadPerM * candidate.eastM + o.northRadPerM * candidate.northM;
      return {
        ok: true,
        value: {
          predictedRad,
          residualRad: o.observedRad - predictedRad,
          effectiveSigmaRad: o.sigmaRad,
          partialEastRadPerM: o.eastRadPerM,
          partialNorthRadPerM: o.northRadPerM,
        },
      };
    },
    postSolveCheck: () => ({ ok: true, value: { warnings: [] } }),
  };
}

export interface ClosedForm {
  /** `(JᵀWJ)⁻¹ + σc² (A·1)(A·1)ᵀ` as `[varEast, varNorth, covEastNorth]`. */
  readonly varEastM2: number;
  readonly varNorthM2: number;
  readonly covEastNorthM2: number;
  /** `A·1` in metres per radian of a shared shift: East and North. */
  readonly sensitivityEastMPerRad: number;
  readonly sensitivityNorthMPerRad: number;
  /** `det(JᵀWJ)` relative to `trace²`: 0 for parallel rows, 0.25 at best. */
  readonly conditioning: number;
}

/** The closed form of Req 7.9, for observations with the given rows and Independent sigmas. */
export function closedForm(
  observations: readonly LinearObservation[],
  commonSigmaRad: number,
): ClosedForm {
  let a = 0;
  let b = 0;
  let c = 0;
  let sa = 0;
  let sb = 0;
  for (const o of observations) {
    const w = 1 / (o.sigmaRad * o.sigmaRad);
    a += w * o.eastRadPerM * o.eastRadPerM;
    b += w * o.eastRadPerM * o.northRadPerM;
    c += w * o.northRadPerM * o.northRadPerM;
    sa += w * o.eastRadPerM;
    sb += w * o.northRadPerM;
  }
  const det = a * c - b * b;
  const invA = c / det;
  const invB = -b / det;
  const invC = a / det;
  // A·1 = (JᵀWJ)⁻¹ · Σ wᵢ (aᵢ, bᵢ)
  const gEast = invA * sa + invB * sb;
  const gNorth = invB * sa + invC * sb;
  const s2 = commonSigmaRad * commonSigmaRad;
  return {
    varEastM2: invA + s2 * gEast * gEast,
    varNorthM2: invC + s2 * gNorth * gNorth,
    covEastNorthM2: invB + s2 * gEast * gNorth,
    sensitivityEastMPerRad: gEast,
    sensitivityNorthMPerRad: gNorth,
    conditioning: det / ((a + c) * (a + c)),
  };
}
