import { describe, expect, it } from 'vitest';
import { checkPositionFix, positionFixFromReading, type PositionFix } from './position-fix';
import { rad } from './test-support/angle-compare';
import { expectOk } from './test-support/result-helpers';

const T = 1_790_000_000_000;
const READING = { latitudeDeg: 24.5, longitudeDeg: 118.1, accuracyM: 12 };
const LIMITS = { atUtcMs: T, positionStalenessMs: 30_000, coarseLocationLimitM: 100 };

describe('positionFixFromReading (Req 7.2, 7.3, 7.5)', () => {
  it('converts to radians, keeps the reported accuracy and divides it by the scale', () => {
    const fix = expectOk(positionFixFromReading(READING, T, 2));
    expect(Math.abs(fix.position.latRad - rad(24.5))).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(fix.position.lonRad - rad(118.1))).toBeLessThanOrEqual(1e-15);
    expect(fix.reportedAccuracyM).toBe(12);
    expect(fix.sigmaM).toBe(6);
    expect(fix.timeUtcMs).toBe(T);
    expect(expectOk(positionFixFromReading(READING, T, 1)).sigmaM).toBe(12);
  });

  it('refuses invalid readings as invalid_position', () => {
    const bad = [
      { ...READING, latitudeDeg: Number.NaN },
      { ...READING, longitudeDeg: Number.POSITIVE_INFINITY },
      { ...READING, accuracyM: -1 },
      { ...READING, accuracyM: Number.NaN },
      { ...READING, latitudeDeg: 89.5 },
      { ...READING, longitudeDeg: -180 },
    ];
    for (const reading of bad) {
      const result = positionFixFromReading(reading, T, 1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid_position');
    }
    expect(
      positionFixFromReading({ ...READING, latitudeDeg: 89, longitudeDeg: 180 }, T, 1).ok,
    ).toBe(true);
  });

  it('refuses a bad scale or time as invalid_number (Req 10.3)', () => {
    expect(positionFixFromReading(READING, T, 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'confidenceScale',
    });
    expect(positionFixFromReading(READING, Number.NaN, 1)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'timeUtcMs',
    });
  });
});

describe('checkPositionFix (Req 7.4, 7.7, 7.8)', () => {
  const fix = expectOk(positionFixFromReading(READING, T, 1));

  it('accepts a fix 30 000 ms old and refuses one 30 001 ms old', () => {
    expect(checkPositionFix(fix, { ...LIMITS, atUtcMs: T + 30_000 })).toEqual({
      ok: true,
      value: fix,
    });
    expect(checkPositionFix(fix, { ...LIMITS, atUtcMs: T + 30_001 })).toEqual({
      ok: false,
      reason: 'stale_position',
    });
  });

  it('refuses the 2000 m coarse reading at the 100 m limit, carrying its accuracy', () => {
    const coarse = expectOk(positionFixFromReading({ ...READING, accuracyM: 2000 }, T, 1));
    expect(checkPositionFix(coarse, LIMITS)).toEqual({
      ok: false,
      reason: 'coarse_location',
      reportedAccuracyM: 2000,
    });
    const atLimit = expectOk(positionFixFromReading({ ...READING, accuracyM: 100 }, T, 1));
    expect(checkPositionFix(atLimit, LIMITS).ok).toBe(true);
  });

  it('judges coarseness on the reported accuracy, not the 1-sigma', () => {
    // With a scale of 20, a 2000 m reading has a 1-sigma of 100 m; it is still a Coarse location.
    const scaled = expectOk(positionFixFromReading({ ...READING, accuracyM: 2000 }, T, 20));
    expect(scaled.sigmaM).toBe(100);
    expect(checkPositionFix(scaled, LIMITS)).toEqual({
      ok: false,
      reason: 'coarse_location',
      reportedAccuracyM: 2000,
    });
  });

  it('checks staleness before coarseness', () => {
    const coarse = expectOk(positionFixFromReading({ ...READING, accuracyM: 2000 }, T, 1));
    expect(checkPositionFix(coarse, { ...LIMITS, atUtcMs: T + 30_001 })).toEqual({
      ok: false,
      reason: 'stale_position',
    });
  });

  it('refuses a fix that is not valid, whoever built it', () => {
    const broken: PositionFix = { ...fix, sigmaM: Number.NaN };
    expect(checkPositionFix(broken, LIMITS)).toEqual({ ok: false, reason: 'invalid_position' });
    expect(checkPositionFix({ ...fix, position: { latRad: 2, lonRad: 0 } }, LIMITS)).toEqual({
      ok: false,
      reason: 'invalid_position',
    });
  });

  it('refuses invalid limits (Req 10.3)', () => {
    expect(checkPositionFix(fix, { ...LIMITS, coarseLocationLimitM: -1 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'coarseLocationLimitM',
    });
    expect(checkPositionFix(fix, { ...LIMITS, positionStalenessMs: Number.NaN })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'positionStalenessMs',
    });
  });
});
