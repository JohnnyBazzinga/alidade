import type { LocalPoint } from '../local-plane';
import type { MeasurementModel } from '../measurement-model';
import type { Position } from '../position';
import { wrappedDifferenceRad } from './angle-compare';
import { unwrapOk } from './result-helpers';

/**
 * Central finite differences of a model's predicted measurement with respect to East and North,
 * in radians per metre. The difference of two predictions is taken as a wrapped angle, so a
 * prediction that crosses the 0 / 2π boundary does not produce a jump.
 */
export function centralDifferencePartials<O>(
  model: MeasurementModel<O>,
  observation: O,
  candidate: LocalPoint,
  origin: Position,
  stepM: number,
): { readonly partialEastRadPerM: number; readonly partialNorthRadPerM: number } {
  const predictedAt = (eastM: number, northM: number): number =>
    unwrapOk(model.evaluate(observation, { eastM, northM }, origin)).predictedRad;
  return {
    partialEastRadPerM:
      wrappedDifferenceRad(
        predictedAt(candidate.eastM + stepM, candidate.northM),
        predictedAt(candidate.eastM - stepM, candidate.northM),
      ) /
      (2 * stepM),
    partialNorthRadPerM:
      wrappedDifferenceRad(
        predictedAt(candidate.eastM, candidate.northM + stepM),
        predictedAt(candidate.eastM, candidate.northM - stepM),
      ) /
      (2 * stepM),
  };
}
