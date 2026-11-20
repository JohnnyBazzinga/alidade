import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../degrees';
import { propertyRuns } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { apparentFromGeometricRad, refractionRad } from './refraction';

const D = DEG_TO_RAD;

describe('P-4.11: the inverse of Bennett\u2019s formula (Req 4.11)', () => {
  // Generator: geometric altitude uniform in [4°, 80°] (the whole range of Sights, with a degree
  // below the lower limit); no value is excluded.
  it('returns the geometric altitude within 1e-12 rad when the refraction is taken off', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-4.11 inverse',
      fc.property(fc.double({ min: 4 * D, max: 80 * D, noNaN: true }), (g) => {
        const a = apparentFromGeometricRad(g);
        if (!a.ok) throw new Error(`inverse failed at ${g}`);
        const r = refractionRad(a.value);
        if (!r.ok) throw new Error(`refraction failed at ${a.value}`);
        const error = Math.abs(a.value - r.value - g);
        tracker.record('geometric altitude, rad', error, '1e-12', `g = ${g}`);
        expect(error).toBeLessThanOrEqual(1e-12);
        expect(a.value).toBeGreaterThan(g);
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });

  // Generator: two apparent altitudes uniform in [5°, 80°], at least 1e-6 rad apart.
  it('is positive and decreasing on [5°, 80°]', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-4.11 monotone',
      fc.property(
        fc.double({ min: 5 * D, max: 80 * D, noNaN: true }),
        fc.double({ min: 5 * D, max: 80 * D, noNaN: true }),
        (x, y) => {
          fc.pre(Math.abs(x - y) > 1e-6);
          const [low, high] = x < y ? [x, y] : [y, x];
          const rLow = refractionRad(low);
          const rHigh = refractionRad(high);
          if (!rLow.ok || !rHigh.ok) throw new Error('refraction failed');
          expect(rLow.value).toBeGreaterThan(0);
          expect(rHigh.value).toBeGreaterThan(0);
          expect(rLow.value).toBeGreaterThan(rHigh.value);
        },
      ),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});
