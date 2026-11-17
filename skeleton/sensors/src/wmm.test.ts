import { describe, expect, it } from 'vitest';
import { allWmmTestPoints } from './test-support/fixtures';
import { expectOk } from './test-support/result-helpers';
import {
  decimalYearFromUtcMs,
  wmmField,
  WMM_VALID_FROM_UTC_MS,
  WMM_VALID_UNTIL_UTC_MS,
} from './wmm';

describe('decimalYearFromUtcMs (D12)', () => {
  it('gives the published decimal years', () => {
    expect(expectOk(decimalYearFromUtcMs(Date.UTC(2025, 0, 1)))).toBe(2025);
    // 2027 has 365 days: noon on 2 July is day 182.5.
    expect(
      Math.abs(expectOk(decimalYearFromUtcMs(Date.UTC(2027, 6, 2, 12))) - 2027.5),
    ).toBeLessThanOrEqual(1e-12);
    // 2028 is a leap year: 2 July is day 183 of 366.
    expect(
      Math.abs(expectOk(decimalYearFromUtcMs(Date.UTC(2028, 6, 2))) - (2028 + 183 / 366)),
    ).toBeLessThanOrEqual(1e-12);
  });

  it('covers exactly [2025-01-01, 2030-01-01) (Req 6.7)', () => {
    expect(WMM_VALID_FROM_UTC_MS).toBe(Date.UTC(2025, 0, 1));
    expect(WMM_VALID_UNTIL_UTC_MS).toBe(Date.UTC(2030, 0, 1));
    expect(decimalYearFromUtcMs(WMM_VALID_FROM_UTC_MS - 1)).toEqual({
      ok: false,
      reason: 'declination_unknown',
    });
    expect(decimalYearFromUtcMs(WMM_VALID_UNTIL_UTC_MS)).toEqual({
      ok: false,
      reason: 'declination_unknown',
    });
    expect(expectOk(decimalYearFromUtcMs(WMM_VALID_UNTIL_UTC_MS - 1))).toBeLessThan(2030);
    expect(decimalYearFromUtcMs(Number.NaN)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'timeUtcMs',
    });
  });
});

// Req 6.10: at each official WMM2025 test point, at its own height, the published declination
// within 0.01°, the precision to which it is published.
describe('wmmField against the official test values (Req 6.10, 13.4)', () => {
  it('matches all 112 published declinations within 0.01°', () => {
    const points = allWmmTestPoints();
    expect(points).toHaveLength(112);
    let worstDeg = 0;
    const misses: string[] = [];
    for (const point of points) {
      const field = expectOk(
        wmmField(point.decimalYear, point.latitudeDeg, point.longitudeDeg, point.heightKm),
      );
      const errorDeg = Math.abs(field.declinationDeg - point.declinationDeg);
      worstDeg = Math.max(worstDeg, errorDeg);
      if (errorDeg > 0.01)
        misses.push(
          `${point.file} ${point.decimalYear} ${point.latitudeDeg} ${point.longitudeDeg}`,
        );
    }
    expect(misses).toEqual([]);
    expect(worstDeg).toBeLessThanOrEqual(0.01);
  });

  it('refuses decimal years outside WMM2025 and non-finite coordinates', () => {
    expect(wmmField(2024.999, 0, 0, 0)).toEqual({ ok: false, reason: 'declination_unknown' });
    expect(wmmField(2030, 0, 0, 0)).toEqual({ ok: false, reason: 'declination_unknown' });
    expect(wmmField(Number.NaN, 0, 0, 0)).toEqual({ ok: false, reason: 'declination_unknown' });
    expect(wmmField(2026, Number.NaN, 0, 0)).toEqual({ ok: false, reason: 'invalid_number' });
  });
});
