import { describe, expect, it } from 'vitest';
import { sunFixture } from '../../test-support/sun-fixture';
import { ARCMIN_TO_RAD, DEG_TO_RAD } from '../degrees';
import { apparentFromGeometricRad, refractionRad } from './refraction';

const D = DEG_TO_RAD;
const fixture = sunFixture();

function value(r: { ok: true; value: number } | { ok: false; reason: string }): number {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

describe('Bennett\u2019s refraction (Req 4.7)', () => {
  it('gives the values of the formula at 5°, 10° and 45°', () => {
    // R = cot(h + 7.31 / (h + 4.4)) arc-minutes, evaluated outside the code (Python, double):
    // h = 45°: 45 + 7.31 / 49.4 = 45.14798° -> 0.9948480′.
    expect(value(refractionRad(45 * D)) / ARCMIN_TO_RAD).toBeCloseTo(0.994848, 5);
    // h = 10°: 10 + 7.31 / 14.4 = 10.50764° -> 5.3915055′.
    expect(value(refractionRad(10 * D)) / ARCMIN_TO_RAD).toBeCloseTo(5.391505, 5);
    // h = 5°: 5 + 7.31 / 9.4 = 5.77766° -> 9.8831442′.
    expect(value(refractionRad(5 * D)) / ARCMIN_TO_RAD).toBeCloseTo(9.883144, 5);
  });

  it('is under 0.01′ at the zenith and 34.48′ at the horizon (the textbook 34′)', () => {
    expect(Math.abs(value(refractionRad(90 * D))) / ARCMIN_TO_RAD).toBeLessThan(0.01);
    expect(value(refractionRad(0)) / ARCMIN_TO_RAD).toBeCloseTo(34.477534, 5);
  });

  it('refuses an altitude outside [−1°, 90°] with invalid_number, and accepts the limits', () => {
    expect(refractionRad(-1 * D).ok).toBe(true);
    expect(refractionRad(90 * D).ok).toBe(true);
    expect(refractionRad(-1 * D - 1e-9)).toMatchObject({ ok: false, reason: 'invalid_number' });
    expect(refractionRad(90 * D + 1e-9)).toMatchObject({ ok: false, reason: 'invalid_number' });
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(refractionRad(bad)).toMatchObject({ ok: false, reason: 'invalid_number' });
    }
  });
});

describe('refraction against the Naval Observatory (Req 4.10)', () => {
  // The service documents its Refr as the correction added to the apparent altitude ha to give
  // the observed altitude Ho = ha + (PA + Refr + SD), standard conditions, sea level; so Refr is
  // negative and a function of ha. The apparent altitude of the Sun's centre is Hc - PA - Refr
  // (Hc is geocentric and has no refraction), which is the argument used here.
  const TARGETS = [5, 10, 15, 30, 45, 80];

  for (const target of TARGETS) {
    const row = fixture.celnav.reduce((best, r) =>
      Math.abs(r.hcDeg - target) < Math.abs(best.hcDeg - target) ? r : best,
    );
    it(`${row.id} (Hc ${row.hcDeg.toFixed(2)}°, nearest ${target}°): within the larger of 0.1′ and 10 %`, () => {
      const apparentDeg = row.hcDeg - row.parallaxDeg - row.refractionDeg;
      const ours = value(refractionRad(apparentDeg * D)) / ARCMIN_TO_RAD;
      const published = -row.refractionDeg * 60;
      expect(published).toBeGreaterThan(0);
      const bound = Math.max(0.1, 0.1 * published);
      expect(
        Math.abs(ours - published),
        `ours ${ours}′, published ${published}′`,
      ).toBeLessThanOrEqual(bound);
    });
  }
});

describe('the inverse of the refraction (D4)', () => {
  it('gives back the geometric altitude: a − R(a) = g', () => {
    for (const g of [4, 5, 10, 30, 45, 80]) {
      const a = value(apparentFromGeometricRad(g * D));
      expect(Math.abs(a - value(refractionRad(a)) - g * D)).toBeLessThan(1e-12);
      expect(a).toBeGreaterThan(g * D);
    }
  });

  it('is deterministic', () => {
    expect(apparentFromGeometricRad(0.3)).toEqual(apparentFromGeometricRad(0.3));
  });

  it('refuses a geometric altitude whose apparent altitude is outside [−1°, 90°]', () => {
    expect(apparentFromGeometricRad(-2 * D)).toMatchObject({ ok: false, reason: 'invalid_number' });
    expect(apparentFromGeometricRad(91 * D)).toMatchObject({ ok: false, reason: 'invalid_number' });
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(apparentFromGeometricRad(bad)).toMatchObject({ ok: false, reason: 'invalid_number' });
    }
  });

  it('accepts the horizon, where the Sun at 0° geometric shows at about 0.57° apparent', () => {
    const a = value(apparentFromGeometricRad(0));
    expect(a / D).toBeGreaterThan(0.4);
    expect(a / D).toBeLessThan(0.7);
  });
});
