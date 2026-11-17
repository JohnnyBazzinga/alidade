import { describe, expect, it } from 'vitest';
import { declinationAt, trueAzimuthFromMagnetic, wmmDeclinationSigmaRad } from './declination';
import { angleErrorRad, rad } from './test-support/angle-compare';
import { wmmTestPoints, type WmmTestPoint } from './test-support/fixtures';
import { expectOk } from './test-support/result-helpers';
import { expectedSigmaDeg, positionOf, utcMsFromDecimalYear } from './test-support/wmm-points';
import { WMM_VALID_FROM_UTC_MS, WMM_VALID_UNTIL_UTC_MS } from './wmm';

/** The seven published points at height 0: six in the short file, one in the long one. */
const SEA_LEVEL_POINTS: WmmTestPoint[] = [
  ...wmmTestPoints('WMM2025_TEST_VALUES.txt'),
  ...wmmTestPoints('WMM2025_TestValues.txt'),
].filter((point) => point.heightKm === 0);

const EQUATOR_120E = { latRad: 0, lonRad: rad(120) };

describe('declinationAt at the published points (Req 6.6, 6.10)', () => {
  it('uses the seven points at height 0', () => {
    expect(SEA_LEVEL_POINTS).toHaveLength(7);
  });

  it('gives the published declination within 0.01°', () => {
    for (const point of SEA_LEVEL_POINTS) {
      const declination = expectOk(
        declinationAt(positionOf(point), utcMsFromDecimalYear(point.decimalYear)),
      );
      expect(Math.abs(declination.declinationRad - rad(point.declinationDeg))).toBeLessThanOrEqual(
        rad(0.01),
      );
    }
  });

  // The 1-sigma lies between σ(H + 0.1 nT) and σ(H − 0.1 nT), with σ computed from the published
  // H: the interval covers the 0.1 nT to which magvar rounds `h`. Expected values at the published
  // H, from design §9: 0.870172°, 0.293665°, 0.412752°, 0.872084°, 0.293626°, 0.412602°, 0.355069°.
  it('gives the WMM error-model 1-sigma from the published horizontal intensity', () => {
    const expectedDeg = [0.870172, 0.293665, 0.412752, 0.872084, 0.293626, 0.412602, 0.355069];
    SEA_LEVEL_POINTS.forEach((point, index) => {
      const declination = expectOk(
        declinationAt(positionOf(point), utcMsFromDecimalYear(point.decimalYear)),
      );
      const lowRad = rad(expectedSigmaDeg(point.horizontalIntensityNt + 0.1));
      const highRad = rad(expectedSigmaDeg(point.horizontalIntensityNt - 0.1));
      expect(declination.sigmaRad).toBeGreaterThanOrEqual(lowRad);
      expect(declination.sigmaRad).toBeLessThanOrEqual(highRad);
      expect(
        Math.abs(
          expectedSigmaDeg(point.horizontalIntensityNt) - (expectedDeg[index] ?? Number.NaN),
        ),
      ).toBeLessThan(5e-7);
    });
  });

  it('refuses the published point in the blackout zone (Req 6.8)', () => {
    // 89°N 121°W in 2025.0: the published H is 1504 nT at 28 km, and lower at sea level.
    const blackout = { latRad: rad(89), lonRad: rad(-121) };
    expect(declinationAt(blackout, Date.UTC(2025, 0, 1))).toEqual({
      ok: false,
      reason: 'declination_unknown',
    });
  });

  it('refuses times outside WMM2025 and accepts its edges (Req 6.7)', () => {
    expect(declinationAt(EQUATOR_120E, WMM_VALID_FROM_UTC_MS - 1)).toEqual({
      ok: false,
      reason: 'declination_unknown',
    });
    expect(declinationAt(EQUATOR_120E, WMM_VALID_UNTIL_UTC_MS)).toEqual({
      ok: false,
      reason: 'declination_unknown',
    });
    expect(declinationAt(EQUATOR_120E, WMM_VALID_FROM_UTC_MS).ok).toBe(true);
    expect(declinationAt(EQUATOR_120E, WMM_VALID_UNTIL_UTC_MS - 1).ok).toBe(true);
  });

  it('refuses unsupported positions and non-finite times (Req 6.9)', () => {
    const t = Date.UTC(2026, 5, 1);
    expect(declinationAt({ latRad: rad(89.5), lonRad: 0 }, t)).toEqual({
      ok: false,
      reason: 'unsupported_position',
    });
    expect(declinationAt({ latRad: 0, lonRad: -Math.PI }, t)).toEqual({
      ok: false,
      reason: 'unsupported_position',
    });
    expect(declinationAt(EQUATOR_120E, Number.NaN)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'timeUtcMs',
    });
  });
});

describe('wmmDeclinationSigmaRad (Req 6.6)', () => {
  it('is 2.7210° at the blackout limit and falls as the field grows', () => {
    const atLimit = wmmDeclinationSigmaRad(2000);
    expect(Math.abs(atLimit - rad(Math.hypot(0.26, 2.7085)))).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(atLimit - rad(2.721))).toBeLessThan(rad(5e-5));
    let previous = atLimit;
    for (const h of [2001, 5000, 10_000, 40_000, 60_000]) {
      const sigma = wmmDeclinationSigmaRad(h);
      expect(sigma).toBeLessThan(previous);
      expect(sigma).toBeGreaterThan(rad(0.26));
      previous = sigma;
    }
  });
});

describe('trueAzimuthFromMagnetic (Req 6.1, 6.4, 6.5)', () => {
  const declination = { declinationRad: rad(-4), sigmaRad: rad(0.3) };

  it('adds the declination, positive east, and wraps', () => {
    expect(
      angleErrorRad(expectOk(trueAzimuthFromMagnetic(rad(2), declination)), rad(358)),
    ).toBeLessThanOrEqual(1e-12);
    expect(expectOk(trueAzimuthFromMagnetic(rad(2), declination))).toBeGreaterThanOrEqual(0);
  });

  it('never assumes a declination of zero', () => {
    expect(trueAzimuthFromMagnetic(1, undefined)).toEqual({
      ok: false,
      reason: 'declination_unknown',
    });
  });

  it('refuses invalid declinations and azimuths', () => {
    expect(
      trueAzimuthFromMagnetic(1, { declinationRad: Math.PI / 2 + 1e-12, sigmaRad: 0 }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'declinationRad',
    });
    expect(trueAzimuthFromMagnetic(1, { declinationRad: Number.NaN, sigmaRad: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'declinationRad',
    });
    expect(trueAzimuthFromMagnetic(1, { declinationRad: 0, sigmaRad: -1 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'declinationSigmaRad',
    });
    expect(trueAzimuthFromMagnetic(Number.NaN, declination)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'magneticAzimuthRad',
    });
    expect(trueAzimuthFromMagnetic(1, { declinationRad: Math.PI / 2, sigmaRad: 0 }).ok).toBe(true);
  });
});
