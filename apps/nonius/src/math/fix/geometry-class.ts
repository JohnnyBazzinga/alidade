// The Geometry class of a Shown Fix (Req 10.1): a pure function of Core's warnings and the
// ellipse alone, with Vigia's thresholds so that the two apps' words mean the same.

import type { Fix } from '@alidade/core';
import { err, ok, type NoniusResult } from '../../result';
import { checkParameters, type NoniusParameters } from '../parameters';

export type GeometryClass = 'none' | 'poor' | 'fair' | 'good';

/**
 * `poor` with Core's `poor_geometry` warning or an Elongation (semi-major over semi-minor) of at
 * least `LONG_ELLIPSE_RATIO`; `fair` with no warning and an Elongation from `FAIR_ELLIPSE_RATIO`
 * up to the long ratio; `good` below the fair ratio; `none` with no Fix.
 */
export function geometryClass(
  fix: Pick<Fix, 'ellipse' | 'warnings'> | null,
  params: NoniusParameters,
): NoniusResult<GeometryClass> {
  const checked = checkParameters(params);
  if (!checked.ok) return checked;
  if (fix === null) return ok('none');
  const { semiMajorM, semiMinorM } = fix.ellipse;
  if (
    !Number.isFinite(semiMajorM) ||
    !Number.isFinite(semiMinorM) ||
    semiMinorM <= 0 ||
    semiMajorM <= 0
  ) {
    return err('invalid_number', { field: 'ellipse' });
  }
  const elongation = semiMajorM / semiMinorM;
  if (!Number.isFinite(elongation)) return err('invalid_number', { field: 'ellipse' });
  if (fix.warnings.includes('poor_geometry') || elongation >= params.longEllipseRatio)
    return ok('poor');
  if (elongation >= params.fairEllipseRatio) return ok('fair');
  return ok('good');
}

/** The sentence about the class (Req 10.1); empty for `none`. */
export function geometrySentence(geometry: GeometryClass): string {
  switch (geometry) {
    case 'poor':
      return 'The geometry is poor: the Sun\u2019s direction changed too little between the sights, or turned back on itself (a Sun due east in the morning and due west in the afternoon gives parallel circles), so the position could be far along the long axis.';
    case 'fair':
      return 'The geometry is fair: the circles of the sights cross at a modest angle, so the area is longer than it is wide.';
    case 'good':
      return 'The geometry is good: the circles of the sights cross at a good angle, so the area is close to round.';
    case 'none':
      return '';
  }
}
