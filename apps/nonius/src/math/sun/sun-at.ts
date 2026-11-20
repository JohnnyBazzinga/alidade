// The Sun as seen from a place at a time (design §4): its true azimuth and its geometric and
// apparent altitudes. Used by the simulation, the Index error and the advice.

import { initialAzimuthRad, isSupportedPosition, type Position } from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';
import { apparentFromGeometricRad } from './refraction';
import { subsolarPoint } from './sun-wrapper';

export interface SunAtPlace {
  /** Clockwise from true north, in [0, 2π). */
  readonly trueAzimuthRad: number;
  readonly geometricAltitudeRad: number;
  readonly apparentAltitudeRad: number;
}

/**
 * `sin h = sin φ · sin δ + cos φ · cos δ · cos LHA` with `LHA = GHA + lon = lon − lonSubsolar`
 * (math-conventions, Celestial); the argument of `asin` is clamped only for a rounding excess
 * below `1e-12`, a larger one being a bug that surfaces as `invalid_number`.
 */
export function sunAt(
  position: Position,
  timeUtcMs: number,
  params: NoniusParameters,
): NoniusResult<SunAtPlace> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (!isSupportedPosition(position)) return err('unsupported_position', { field: 'position' });
  const subsolar = subsolarPoint(timeUtcMs, params);
  if (!subsolar.ok) return subsolar;
  const azimuthRad = initialAzimuthRad(position, subsolar.value);
  if (!azimuthRad.ok) return azimuthRad;
  const sinAltitude =
    Math.sin(position.latRad) * Math.sin(subsolar.value.latRad) +
    Math.cos(position.latRad) *
      Math.cos(subsolar.value.latRad) *
      Math.cos(position.lonRad - subsolar.value.lonRad);
  if (!Number.isFinite(sinAltitude) || Math.abs(sinAltitude) > 1 + 1e-12) {
    return err('invalid_number', { field: 'position' });
  }
  const geometricAltitudeRad = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const apparent = apparentFromGeometricRad(geometricAltitudeRad);
  if (!apparent.ok) return apparent;
  return ok({
    trueAzimuthRad: azimuthRad.value,
    geometricAltitudeRad,
    apparentAltitudeRad: apparent.value,
  });
}
