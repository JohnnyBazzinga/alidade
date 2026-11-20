// Where two small circles of the sphere cross (Req 6.2, design §7.1): in closed form, as vectors.

import { wrapPi, type Position } from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';

type Vector = readonly [number, number, number];

/** The unit vector of a position: `(cos φ cos λ, cos φ sin λ, sin φ)`. */
function unitVector(position: Position): Vector {
  const c = Math.cos(position.latRad);
  return [c * Math.cos(position.lonRad), c * Math.sin(position.lonRad), Math.sin(position.latRad)];
}

const dot = (a: Vector, b: Vector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function toPosition(v: Vector): Position {
  const length = Math.hypot(v[0], v[1], v[2]);
  const z = Math.max(-1, Math.min(1, v[2] / length));
  // `atan2` returns −π for a point on the antimeridian reached from the west; Core's longitudes
  // are in (−π, π], so that point is +π (the counterexample of P-6.9, seed -249211460).
  const lon = wrapPi(Math.atan2(v[1], v[0]));
  return { latRad: Math.asin(z), lonRad: lon.ok ? lon.value : Math.atan2(v[1], v[0]) };
}

/** `1 − γ²` below this is the same centre (or its antipode): no crossing. */
const SAME_CENTRE = 1e-12;
/** `t²` within this of zero is a touch: one crossing. */
const TOUCH = 1e-12;

/**
 * The places at angular distance `radiusARad` from `centreA` and `radiusBRad` from `centreB`:
 * none, one where the circles touch, or two. With unit vectors `a`, `b`, `γ = a·b`:
 *
 * ```
 * x = α a + β b,   α = (cos ρa − γ cos ρb) / (1 − γ²),   β = (cos ρb − γ cos ρa) / (1 − γ²)
 * t² = (1 − |x|²) / (1 − γ²)
 * ```
 *
 * `t² < −1e-12`: none; `|t²| ≤ 1e-12`: one, `x` normalised; otherwise two, `x ± t (a × b)`.
 * The same centre (`1 − γ² < 1e-12`) is no crossing. Fails with `invalid_number` for a radius not
 * in `(0, π)` or a number that is not finite. The two crossings are returned in a fixed order
 * (the `+` crossing first), which depends only on the arguments in their order.
 */
export function circleCrossings(
  centreA: Position,
  radiusARad: number,
  centreB: Position,
  radiusBRad: number,
): NoniusResult<readonly Position[]> {
  const numbers: readonly [string, number][] = [
    ['centreA.latRad', centreA.latRad],
    ['centreA.lonRad', centreA.lonRad],
    ['centreB.latRad', centreB.latRad],
    ['centreB.lonRad', centreB.lonRad],
  ];
  for (const [field, value] of numbers) {
    if (!Number.isFinite(value)) return err('invalid_number', { field });
  }
  for (const [field, radius] of [
    ['radiusARad', radiusARad],
    ['radiusBRad', radiusBRad],
  ] as const) {
    if (!Number.isFinite(radius) || radius <= 0 || radius >= Math.PI) {
      return err('invalid_number', { field });
    }
  }
  const a = unitVector(centreA);
  const b = unitVector(centreB);
  const gamma = dot(a, b);
  const denominator = 1 - gamma * gamma;
  if (denominator < SAME_CENTRE) return ok([]);
  const cosA = Math.cos(radiusARad);
  const cosB = Math.cos(radiusBRad);
  const alpha = (cosA - gamma * cosB) / denominator;
  const beta = (cosB - gamma * cosA) / denominator;
  const x: Vector = [
    alpha * a[0] + beta * b[0],
    alpha * a[1] + beta * b[1],
    alpha * a[2] + beta * b[2],
  ];
  const tSquared = (1 - dot(x, x)) / denominator;
  if (!Number.isFinite(tSquared)) return err('invalid_number', { field: 'crossing' });
  if (tSquared < -TOUCH) return ok([]);
  if (tSquared <= TOUCH) return ok([toPosition(x)]);
  const t = Math.sqrt(tSquared);
  const axis = cross(a, b);
  const plus: Vector = [x[0] + t * axis[0], x[1] + t * axis[1], x[2] + t * axis[2]];
  const minus: Vector = [x[0] - t * axis[0], x[1] - t * axis[1], x[2] - t * axis[2]];
  return ok([toPosition(plus), toPosition(minus)]);
}
