// Generators of the map properties (design §8; test support, not exported).

import type { Bearing, Ellipse, Fix, Position } from '@alidade/core';
import fc from 'fast-check';
import { closed, uniform, uniformInteger } from './generators';

const DEG = Math.PI / 180;

/** Latitude in [-84°, 84°] (ends drawn), longitude in (-π, π] (π drawn, -π mapped to π). */
export function mapPosition(): fc.Arbitrary<Position> {
  return fc.record({
    latRad: closed(-84 * DEG, 84 * DEG),
    lonRad: fc.oneof(
      { weight: 1, arbitrary: fc.constant(Math.PI) },
      {
        weight: 9,
        arbitrary: uniform(-Math.PI, Math.PI).map((x) => (x === -Math.PI ? Math.PI : x)),
      },
    ),
  });
}

/** A Fix around an Ellipse; only the Ellipse and the Position are read by the map. */
export function fixAround(position: Position, ellipse: Ellipse): Fix {
  const a = ellipse.semiMajorM;
  const b = ellipse.semiMinorM;
  const s = Math.sin(ellipse.azimuthRad);
  const c = Math.cos(ellipse.azimuthRad);
  return {
    position,
    covariance: {
      varEastM2: a * a * s * s + b * b * c * c,
      varNorthM2: a * a * c * c + b * b * s * s,
      covEastNorthM2: (a * a - b * b) * s * c,
    },
    ellipse,
    residuals: [],
    iterations: 1,
    warnings: [],
    excludedIds: [],
  };
}

export interface FixCase {
  readonly fix: Fix;
  readonly vertexCount: number;
}

/**
 * `fixCase`: a Position as `mapPosition`, `semiMajorM` in [1, 100 000] m (log-uniform, ends drawn),
 * `semiMinorM` in [1, semiMajorM] (circular one draw in six), `azimuthRad` in [0, π) (0 drawn),
 * `vertexCount` in [16, 360] (ends drawn). Excludes broken Ellipses (`brokenFixCase`).
 */
export function fixCase(): fc.Arbitrary<FixCase> {
  return fc
    .record({
      position: mapPosition(),
      majorLog: closed(0, 5),
      minorShare: fc.oneof(
        { weight: 1, arbitrary: fc.constant(1) },
        { weight: 5, arbitrary: closed(0, 1) },
      ),
      azimuthRad: fc.oneof(
        { weight: 1, arbitrary: fc.constant(0) },
        { weight: 9, arbitrary: uniform(0, Math.PI) },
      ),
      vertexCount: fc.oneof(
        { weight: 1, arbitrary: fc.constantFrom(16, 360) },
        { weight: 9, arbitrary: uniformInteger(16, 360) },
      ),
    })
    .map(({ position, majorLog, minorShare, azimuthRad, vertexCount }) => {
      const semiMajorM = 10 ** majorLog;
      // [1, semiMajorM], log-uniform on the share.
      const semiMinorM = Math.max(1, semiMajorM ** minorShare);
      return {
        fix: fixAround(position, {
          semiMajorM,
          semiMinorM: Math.min(semiMinorM, semiMajorM),
          azimuthRad,
        }),
        vertexCount,
      };
    });
}

/**
 * `brokenFixCase`: a Fix whose Ellipse `ellipse95` refuses or is not an ellipse: a semi-axis 0,
 * negative, NaN or infinite, or `semiMinorM > semiMajorM`; any `vertexCount` in [16, 360].
 */
export function brokenFixCase(): fc.Arbitrary<FixCase> {
  const bad = fc.constantFrom(0, -0, -1, -1e5, Number.NaN, Infinity, -Infinity);
  return fc
    .record({
      position: mapPosition(),
      kind: uniformInteger(0, 2),
      bad,
      good: closed(1, 1e5),
      azimuthRad: uniform(0, Math.PI),
      vertexCount: uniformInteger(16, 360),
    })
    .map(({ position, kind, bad: badValue, good, azimuthRad, vertexCount }) => {
      const ellipse =
        kind === 0
          ? { semiMajorM: badValue, semiMinorM: good, azimuthRad }
          : kind === 1
            ? { semiMajorM: good, semiMinorM: badValue, azimuthRad }
            : { semiMajorM: good, semiMinorM: good * 1.5 + 1, azimuthRad };
      return { fix: fixAround(position, ellipse), vertexCount };
    });
}

export interface BearingCase {
  readonly bearing: Bearing;
  readonly lineLengthM: number;
  readonly arcStepRad: number;
}

/**
 * `bearingCase`: an observer as `mapPosition`, azimuth in [0, 2π), sigma in [0.01°, 45°] (ends
 * drawn), length in [100, 500 000] m (log-uniform on half the draws), arc step in [0.1°, 5°].
 * Excludes lengths under 100 m (an example of their own).
 */
export function bearingCase(id = 'b'): fc.Arbitrary<BearingCase> {
  return fc
    .record({
      observer: mapPosition(),
      azimuthRad: uniform(0, 2 * Math.PI),
      azimuthSigmaRad: closed(0.01 * DEG, 45 * DEG),
      lineLengthM: fc.oneof(
        closed(100, 500_000),
        closed(2, Math.log10(500_000)).map((k) => Math.min(500_000, 10 ** k)),
      ),
      arcStepRad: closed(0.1 * DEG, 5 * DEG),
    })
    .map(({ observer, azimuthRad, azimuthSigmaRad, lineLengthM, arcStepRad }) => ({
      bearing: {
        id,
        observer,
        positionAccuracyM: 5,
        timeUtcMs: 1_790_000_000_000,
        azimuthRad,
        azimuthSigmaRad,
      },
      lineLengthM,
      arcStepRad,
    }));
}
