// The quality of a Fix's geometry in one word (Req 7.1, 7.8, design D10, §7.9): a pure function
// of Core's warnings and the Fix's Ellipse, with its two ratios from the parameters.

import type { Ellipse, Fix } from '@alidade/core';
import { err, ok, type VigiaResult } from '../../result';
import { checkParameters, type VigiaParameters } from '../parameters';

export type GeometryClass = 'none' | 'poor' | 'fair' | 'good';

/** The ratio of the semi-major to the semi-minor axis (for a valid Ellipse: at least 1). */
function elongation(ellipse: Ellipse): number {
  return ellipse.semiMajorM / ellipse.semiMinorM;
}

function validEllipse(ellipse: Ellipse): boolean {
  const { semiMajorM, semiMinorM, azimuthRad } = ellipse;
  return (
    Number.isFinite(semiMajorM) &&
    Number.isFinite(semiMinorM) &&
    Number.isFinite(azimuthRad) &&
    semiMinorM > 0 &&
    semiMinorM <= semiMajorM
  );
}

/**
 * `none` with no Fix; `poor` with Core's `poor_geometry` warning or an elongation of at least
 * `longEllipseRatio`; `fair` from `fairEllipseRatio`; `good` below it. Fails with
 * `invalid_number` naming a parameter, or `ellipse` for an Ellipse that is not one.
 */
export function geometryClass(
  fix: Fix | null,
  parameters: VigiaParameters,
): VigiaResult<GeometryClass> {
  const checked = checkParameters(parameters);
  if (!checked.ok) return checked;
  if (fix === null) return ok('none');
  if (!validEllipse(fix.ellipse)) return err('invalid_number', { field: 'ellipse' });
  const ratio = elongation(fix.ellipse);
  if (fix.warnings.includes('poor_geometry') || ratio >= parameters.longEllipseRatio)
    return ok('poor');
  return ok(ratio >= parameters.fairEllipseRatio ? 'fair' : 'good');
}

const GEOMETRY_SENTENCES: Readonly<Record<GeometryClass, string>> = {
  none: 'Geometry: no position yet.',
  poor: 'Geometry: poor. Both of you look along nearly the same line; the smoke could be much nearer or farther than it shows.',
  fair: 'Geometry: fair. The lines cross at a moderate angle.',
  good: 'Geometry: good. The lines cross at a good angle.',
};

/** The sentence of the class (design §7.8), the same in the words of the Fix and in the Emergency text. */
export function geometrySentence(geometry: GeometryClass): string {
  return GEOMETRY_SENTENCES[geometry];
}
