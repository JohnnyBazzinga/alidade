import { describe, expect, it } from 'vitest';
import { checkParameters, defaultParameters, type NoniusParameters } from './parameters';

const D = Math.PI / 180;

// Req 14.1: every constant with its value. Angles are written in degrees and converted here with
// the same factor; the factor is checked in degrees.test.ts.
const VALUES: Readonly<Record<keyof NoniusParameters, number>> = {
  sunModelStartUtcMs: 946_684_800_000,
  sunModelEndUtcMs: 2_524_608_000_000,
  minSightAltitudeRad: 5 * D,
  maxSightAltitudeRad: 80 * D,
  aimSigmaRad: 0.5 * D,
  refractionSigmaFraction: 0.1,
  sunSideToleranceRad: 30 * D,
  crossingCostMargin: 9,
  sameFixDistanceM: 1000,
  maxFixSemiMajor95M: 2_000_000,
  planeLimitM: 1_000_000,
  recentreToleranceM: 1,
  maxRecentreRounds: 4,
  sensitivityStepRad: 0.01 * D,
  maxIndexErrorRad: 10 * D,
  indexErrorOldMs: 604_800_000,
  sunAltitudeSigmaRad: (1.8 / 60) * D,
  maxSights: 24,
  firstWaitMs: 7_200_000,
  adviceTurnRad: 40 * D,
  adviceScanStepMs: 300_000,
  adviceScanHorizonMs: 43_200_000,
  bestTimeStepMs: 600_000,
  bestTimeHorizonMs: 86_400_000,
  fairEllipseRatio: 1.5,
  longEllipseRatio: 3,
  circleArcHalfLengthFactor: 2,
  circleArcStepRad: 0.25 * D,
  locationCoarseLimitM: 10_000,
  simulationTapSigmaPx: 3,
  simulationLocationAccuracyM: 5,
};

const FIELDS = Object.keys(VALUES) as (keyof NoniusParameters)[];

function withField(field: keyof NoniusParameters, value: number): NoniusParameters {
  return { ...defaultParameters(), [field]: value };
}

function expectBad(p: NoniusParameters, field: string): void {
  expect(checkParameters(p)).toEqual({ ok: false, reason: 'invalid_number', field });
}

describe('defaultParameters (Req 14.1)', () => {
  it('holds every constant of the requirement with its value', () => {
    const p = defaultParameters();
    expect(Object.keys(p).sort()).toEqual([...FIELDS].sort());
    for (const field of FIELDS) {
      expect(Math.abs(p[field] - VALUES[field]), field).toBeLessThanOrEqual(
        1e-12 * Math.abs(VALUES[field]),
      );
    }
  });

  it('is frozen and passes its own check', () => {
    expect(Object.isFrozen(defaultParameters())).toBe(true);
    expect(checkParameters(defaultParameters())).toEqual({ ok: true, value: defaultParameters() });
  });
});

describe('checkParameters (Req 14.3)', () => {
  it('names a field that is NaN or infinite, whatever it is', () => {
    for (const field of FIELDS) {
      for (const bad of [Number.NaN, Infinity, -Infinity]) expectBad(withField(field, bad), field);
    }
  });

  it('names a field that is zero or negative', () => {
    for (const field of FIELDS) {
      expectBad(withField(field, 0), field);
      expectBad(withField(field, -1), field);
    }
  });

  it('names the first bad field in the order of the record', () => {
    const p = { ...defaultParameters(), maxSights: Number.NaN, aimSigmaRad: Number.NaN };
    expectBad(p, 'aimSigmaRad');
  });

  it('refuses a start of the Sun wrapper that is not before its end, at the limit', () => {
    const d = defaultParameters();
    expectBad({ ...d, sunModelStartUtcMs: d.sunModelEndUtcMs }, 'sunModelStartUtcMs');
    expectBad({ ...d, sunModelStartUtcMs: d.sunModelEndUtcMs + 1 }, 'sunModelStartUtcMs');
    expect(checkParameters({ ...d, sunModelStartUtcMs: d.sunModelEndUtcMs - 1 }).ok).toBe(true);
  });

  it('keeps the altitude limits in (0°, 90°) with the minimum below the maximum', () => {
    const d = defaultParameters();
    expectBad({ ...d, minSightAltitudeRad: d.maxSightAltitudeRad }, 'minSightAltitudeRad');
    expectBad({ ...d, minSightAltitudeRad: d.maxSightAltitudeRad + 1e-3 }, 'minSightAltitudeRad');
    expect(checkParameters({ ...d, minSightAltitudeRad: d.maxSightAltitudeRad - 1e-9 }).ok).toBe(
      true,
    );
    expectBad({ ...d, maxSightAltitudeRad: Math.PI / 2 }, 'maxSightAltitudeRad');
    expect(checkParameters({ ...d, maxSightAltitudeRad: Math.PI / 2 - 1e-9 }).ok).toBe(true);
    expectBad({ ...d, maxSightAltitudeRad: Math.PI / 2 + 1e-9 }, 'maxSightAltitudeRad');
  });

  it('keeps a step below its horizon, at the limit', () => {
    const d = defaultParameters();
    expectBad({ ...d, adviceScanStepMs: d.adviceScanHorizonMs }, 'adviceScanStepMs');
    expect(checkParameters({ ...d, adviceScanStepMs: d.adviceScanHorizonMs - 1 }).ok).toBe(true);
    expectBad({ ...d, bestTimeStepMs: d.bestTimeHorizonMs }, 'bestTimeStepMs');
    expect(checkParameters({ ...d, bestTimeStepMs: d.bestTimeHorizonMs - 1 }).ok).toBe(true);
  });

  it('keeps the fair ratio above 1 and below the long ratio, at the limit', () => {
    const d = defaultParameters();
    expectBad({ ...d, fairEllipseRatio: 1 }, 'fairEllipseRatio');
    expect(checkParameters({ ...d, fairEllipseRatio: 1 + 1e-9 }).ok).toBe(true);
    expectBad({ ...d, fairEllipseRatio: d.longEllipseRatio }, 'longEllipseRatio');
    expectBad({ ...d, longEllipseRatio: d.fairEllipseRatio }, 'longEllipseRatio');
    expect(checkParameters({ ...d, longEllipseRatio: d.fairEllipseRatio + 1e-9 }).ok).toBe(true);
  });

  it('keeps the Sun side tolerance and the advice turn below 90°, at the limit', () => {
    const d = defaultParameters();
    for (const field of ['sunSideToleranceRad', 'adviceTurnRad'] as const) {
      expectBad({ ...d, [field]: Math.PI / 2 }, field);
      expectBad({ ...d, [field]: Math.PI / 2 + 1e-9 }, field);
      expect(checkParameters({ ...d, [field]: Math.PI / 2 - 1e-9 }).ok, field).toBe(true);
    }
  });

  it('keeps the largest index error below 45°, at the limit', () => {
    const d = defaultParameters();
    expectBad({ ...d, maxIndexErrorRad: Math.PI / 4 }, 'maxIndexErrorRad');
    expectBad({ ...d, maxIndexErrorRad: Math.PI / 4 + 1e-9 }, 'maxIndexErrorRad');
    expect(checkParameters({ ...d, maxIndexErrorRad: Math.PI / 4 - 1e-9 }).ok).toBe(true);
  });

  it('keeps MAX_SIGHTS an integer from 2 to 64', () => {
    for (const bad of [1, 65, 2.5, 24.0001]) expectBad(withField('maxSights', bad), 'maxSights');
    for (const good of [2, 3, 64])
      expect(checkParameters(withField('maxSights', good)).ok).toBe(true);
  });

  it('keeps MAX_RECENTRE_ROUNDS an integer from 2 to 10', () => {
    for (const bad of [1, 11, 3.5]) {
      expectBad(withField('maxRecentreRounds', bad), 'maxRecentreRounds');
    }
    for (const good of [2, 4, 10]) {
      expect(checkParameters(withField('maxRecentreRounds', good)).ok).toBe(true);
    }
  });
});
