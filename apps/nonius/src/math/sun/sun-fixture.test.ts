// The published Sun fixture (Req 3.4, 4.10): its shape, its coverage and its checksum. The file
// `fixtures/sun-published.json` is made by `src/test-support/build-sun-fixture.mjs` from the
// U.S. Naval Observatory's raw responses and is read-only: a change to it fails the checksum.

import { describe, expect, it } from 'vitest';
import { FIXTURE_TEXT, sunFixture, type CelnavRow } from '../../test-support/sun-fixture';

/** SHA-256 of the fixture file as committed (task 3.1). */
const FIXTURE_SHA256 = '912bd55edab472c0ce2b7c45eff9f5004fbc96f9629c7f8802bc11ced3f03f47';

describe('fixtures/sun-published.json (Req 3.4)', () => {
  it('exists', () => {
    expect(FIXTURE_TEXT).toBeTypeOf('string');
  });

  it('has the checksum it was committed with', async () => {
    const bytes = new TextEncoder().encode(FIXTURE_TEXT ?? '');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(FIXTURE_SHA256);
  });

  const fixture = sunFixture();

  it('names its source and keeps each row\u2019s address and retrieval time', () => {
    expect(fixture.source).toContain('U.S. Naval Observatory');
    for (const row of [...fixture.celnav, ...fixture.sidereal]) {
      expect(row.url, row.id).toMatch(
        /^https:\/\/aa\.usno\.navy\.mil\/api\/(?:celnav|siderealtime)\?/,
      );
      expect(row.retrievedUtc, row.id).toMatch(/^2026-11-20T\d\d:\d\d:\d\dZ$/);
    }
  });

  it('has the rows of Req 3.4: a row in each month of 2026, rows in 2000, 2027, 2028, 2029, 2049', () => {
    const at = (row: CelnavRow) => new Date(row.timeUtcMs);
    const months2026 = new Set(
      fixture.celnav.filter((r) => at(r).getUTCFullYear() === 2026).map((r) => at(r).getUTCMonth()),
    );
    expect([...months2026].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const years = new Set(fixture.celnav.map((r) => at(r).getUTCFullYear()));
    for (const y of [2000, 2026, 2027, 2028, 2029, 2049])
      expect(years.has(y), String(y)).toBe(true);
    expect(fixture.celnav.length).toBeGreaterThanOrEqual(12);
  });

  it('has the Sun from about 4° to 80° of altitude, and a row near each altitude of Req 4.10', () => {
    const altitudes = fixture.celnav.map((r) => r.hcDeg);
    expect(Math.min(...altitudes)).toBeLessThan(4.6);
    expect(Math.max(...altitudes)).toBeGreaterThan(79.9);
    for (const target of [5, 10, 15, 30, 45, 80]) {
      const nearest = Math.min(...altitudes.map((h) => Math.abs(h - target)));
      expect(nearest, `near ${target}°`).toBeLessThan(1);
    }
  });

  it('has five sidereal times from 2000 to 2049', () => {
    expect(fixture.sidereal).toHaveLength(5);
    const years = fixture.sidereal.map((r) => new Date(r.timeUtcMs).getUTCFullYear());
    expect(Math.min(...years)).toBe(2000);
    expect(Math.max(...years)).toBe(2049);
  });

  it('keeps the time of each row consistent with its date and time text', () => {
    for (const row of [...fixture.celnav, ...fixture.sidereal]) {
      const time = row.timeUt1.length === 5 ? `${row.timeUt1}:00` : row.timeUt1;
      expect(row.timeUtcMs, row.id).toBe(Date.parse(`${row.dateUt1}T${time}Z`));
    }
  });

  it('keeps the sidereal seconds consistent with their text', () => {
    for (const row of fixture.sidereal) {
      const seconds = (text: string) => {
        const [h, m, s] = text.split(':').map(Number);
        return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
      };
      expect(row.gmstTimeSeconds, row.id).toBeCloseTo(seconds(row.gmstText), 9);
      expect(row.gastTimeSeconds, row.id).toBeCloseTo(seconds(row.gastText), 9);
      // GAST = GMST + the equation of the equinoxes, to the rounding of the printed digits.
      const diff = row.gastTimeSeconds - row.gmstTimeSeconds;
      const wrapped = ((diff + 43_200) % 86_400) - 43_200;
      expect(Math.abs(wrapped - row.eqOfEquinoxesTimeSeconds), row.id).toBeLessThan(2e-4);
    }
  });
});
