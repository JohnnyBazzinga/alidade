import type { Fix } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../parameters';
import { geometryClass, geometrySentence } from './geometry-class';

const params = defaultParameters();

function fixWith(semiMajorM: number, semiMinorM: number, warnings: Fix['warnings'] = []): Fix {
  return {
    position: { latRad: 0.1, lonRad: 0.1 },
    covariance: { varEastM2: 1, varNorthM2: 1, covEastNorthM2: 0 },
    ellipse: { semiMajorM, semiMinorM, azimuthRad: 0 },
    residuals: [],
    iterations: 1,
    warnings,
    excludedIds: [],
  };
}

describe('geometryClass (Req 10.1)', () => {
  it('is none with no Fix', () => {
    expect(geometryClass(null, params)).toEqual({ ok: true, value: 'none' });
  });

  it('is good below the fair ratio, fair from it up to the long ratio, poor from the long ratio', () => {
    const at = (ratio: number) => geometryClass(fixWith(ratio * 1000, 1000), params);
    expect(at(params.fairEllipseRatio - 1e-9)).toEqual({ ok: true, value: 'good' });
    expect(at(params.fairEllipseRatio)).toEqual({ ok: true, value: 'fair' });
    expect(at(params.longEllipseRatio - 1e-9)).toEqual({ ok: true, value: 'fair' });
    expect(at(params.longEllipseRatio)).toEqual({ ok: true, value: 'poor' });
    expect(at(1)).toEqual({ ok: true, value: 'good' });
  });

  it('is poor with Core\u2019s poor_geometry warning whatever the ratio, and never good with it', () => {
    expect(geometryClass(fixWith(1000, 1000, ['poor_geometry']), params)).toEqual({
      ok: true,
      value: 'poor',
    });
    expect(geometryClass(fixWith(1000, 1000, ['outliers_excluded']), params)).toEqual({
      ok: true,
      value: 'good',
    });
  });

  it('fails for an ellipse that cannot be classed and for bad parameters', () => {
    expect(geometryClass(fixWith(1000, 0), params)).toMatchObject({
      ok: false,
      reason: 'invalid_number',
    });
    expect(geometryClass(fixWith(Number.NaN, 1), params)).toMatchObject({ ok: false });
    expect(geometryClass(fixWith(1, 1), { ...params, fairEllipseRatio: 1 })).toMatchObject({
      ok: false,
      field: 'fairEllipseRatio',
    });
  });
});

describe('geometrySentence (Req 10.1)', () => {
  it('says for poor that the Sun\u2019s direction changed too little or turned back, and that the position could be far along the long axis', () => {
    const text = geometrySentence('poor');
    expect(text).toMatch(/changed too little between the sights, or turned back on itself/);
    expect(text).toMatch(
      /due east in the morning and due west in the afternoon gives parallel circles/,
    );
    expect(text).toMatch(/far along the long axis/);
  });

  it('has a distinct, non-empty sentence for each class and none for none', () => {
    const texts = (['good', 'fair', 'poor'] as const).map(geometrySentence);
    expect(new Set(texts).size).toBe(3);
    for (const t of texts) expect(t.length).toBeGreaterThan(10);
    expect(geometrySentence('none')).toBe('');
  });
});
