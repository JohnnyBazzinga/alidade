import { describe, expect, it } from 'vitest';
import { fixOf } from '../../test-support/generators';
import { ORIGIN, PARAMETERS } from '../../test-support/incident-fixtures';
import { geometryClass, geometrySentence } from './geometry-class';

const withRatio = (
  ratio: number,
  warnings: readonly ('poor_geometry' | 'outliers_excluded')[] = [],
) => fixOf(ORIGIN, { semiMajorM: 100 * ratio, semiMinorM: 100, azimuthRad: 0.3 }, warnings);
const classOf = (fix: Parameters<typeof geometryClass>[0], parameters = PARAMETERS) => {
  const result = geometryClass(fix, parameters);
  if (!result.ok) throw new Error('failed');
  return result.value;
};

describe('geometryClass (Req 7.1, design §7.9)', () => {
  it('is none with no Fix', () => {
    expect(classOf(null)).toBe('none');
  });

  it('is good below the fair ratio, fair from it, poor from the long ratio: at and either side of each', () => {
    const fair = PARAMETERS.fairEllipseRatio;
    const long = PARAMETERS.longEllipseRatio;
    expect(classOf(withRatio(1))).toBe('good');
    expect(classOf(withRatio(fair * (1 - 1e-9)))).toBe('good');
    expect(classOf(withRatio(fair))).toBe('fair');
    expect(classOf(withRatio(fair * (1 + 1e-9)))).toBe('fair');
    expect(classOf(withRatio(long * (1 - 1e-9)))).toBe('fair');
    expect(classOf(withRatio(long))).toBe('poor');
    expect(classOf(withRatio(long * (1 + 1e-9)))).toBe('poor');
    expect(classOf(withRatio(1000))).toBe('poor');
  });

  it('is poor with Core\u2019s poor_geometry warning, whatever the ellipse', () => {
    expect(classOf(withRatio(1, ['poor_geometry']))).toBe('poor');
    expect(classOf(withRatio(1.2, ['outliers_excluded', 'poor_geometry']))).toBe('poor');
    expect(classOf(withRatio(1, ['outliers_excluded']))).toBe('good');
  });

  it('takes its two ratios from the parameters', () => {
    const p = { ...PARAMETERS, fairEllipseRatio: 1.1, longEllipseRatio: 1.2 };
    expect(classOf(withRatio(1.15), p)).toBe('fair');
    expect(classOf(withRatio(1.25), p)).toBe('poor');
  });

  it('names the parameter that is not valid', () => {
    expect(geometryClass(withRatio(2), { ...PARAMETERS, longEllipseRatio: 1 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'longEllipseRatio',
    });
  });

  it('fails with invalid_number naming ellipse for an Ellipse that is not one', () => {
    for (const ellipse of [
      { semiMajorM: Number.NaN, semiMinorM: 1, azimuthRad: 0 },
      { semiMajorM: 1, semiMinorM: 0, azimuthRad: 0 },
      { semiMajorM: 1, semiMinorM: 2, azimuthRad: 0 },
    ]) {
      expect(geometryClass(fixOf(ORIGIN, ellipse), PARAMETERS)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'ellipse',
      });
    }
  });
});

describe('geometrySentence (Req 7.1, design §7.8)', () => {
  it('says the class in words, with the reason the user can act on', () => {
    expect(geometrySentence('poor')).toBe(
      'Geometry: poor. Both of you look along nearly the same line; the smoke could be much nearer or farther than it shows.',
    );
    expect(geometrySentence('fair')).toBe('Geometry: fair. The lines cross at a moderate angle.');
    expect(geometrySentence('good')).toBe('Geometry: good. The lines cross at a good angle.');
    expect(geometrySentence('none')).toBe('Geometry: no position yet.');
  });
});
