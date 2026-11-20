import { describe, expect, it } from 'vitest';
import { wrapPiN, wrapTwoPiN } from '../../test-support/angles';
import { sunFixture } from '../../test-support/sun-fixture';
import { ARCMIN_TO_RAD, DEG_TO_RAD, HOURS_TO_DEG } from '../degrees';
import { defaultParameters } from '../parameters';
import {
  greenwichMeanSiderealTimeRad,
  greenwichSiderealTimeRad,
  subsolarPoint,
  sunPosition,
} from './sun-wrapper';

const params = defaultParameters();
const fixture = sunFixture();

/** Seconds of time in one radian of sidereal rotation: 86 400 s / 2π. */
const SECONDS_PER_RAD = 86_400 / (2 * Math.PI);

function value<T>(r: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`failed: ${r.reason}`);
  return r.value;
}

describe('the Sun wrapper against the Naval Observatory (Req 3.5)', () => {
  it('has rows to test', () => {
    expect(fixture.celnav.length).toBe(27);
    expect(fixture.sidereal.length).toBe(5);
  });

  for (const row of fixture.celnav) {
    it(`${row.id}: declination within 1.0′ and GHA within 1.5′`, () => {
      const sun = value(sunPosition(row.timeUtcMs, params));
      const decErrRad = Math.abs(sun.sunDeclinationRad - row.sunDeclinationDeg * DEG_TO_RAD);
      const ghaErrRad = Math.abs(wrapPiN(sun.ghaRad - row.ghaDeg * DEG_TO_RAD));
      expect(decErrRad / ARCMIN_TO_RAD, 'declination, arc-minutes').toBeLessThanOrEqual(1.0);
      expect(ghaErrRad / ARCMIN_TO_RAD, 'GHA, arc-minutes').toBeLessThanOrEqual(1.5);
    });
  }

  for (const row of fixture.sidereal) {
    it(`${row.id}: apparent and mean sidereal time within 0.1 s`, () => {
      const apparentRad = value(greenwichSiderealTimeRad(row.timeUtcMs, params));
      const meanRad = value(greenwichMeanSiderealTimeRad(row.timeUtcMs, params));
      const apparentErrS =
        Math.abs(wrapPiN(apparentRad - row.gastTimeSeconds / SECONDS_PER_RAD)) * SECONDS_PER_RAD;
      const meanErrS =
        Math.abs(wrapPiN(meanRad - row.gmstTimeSeconds / SECONDS_PER_RAD)) * SECONDS_PER_RAD;
      expect(apparentErrS, 'apparent').toBeLessThanOrEqual(0.1);
      expect(meanErrS, 'mean').toBeLessThanOrEqual(0.1);
    });
  }
});

describe('the Sun wrapper (Req 3.1)', () => {
  it('gives the Subsolar point as declination and minus the GHA', () => {
    const t = fixture.celnav[0]?.timeUtcMs ?? 0;
    const sun = value(sunPosition(t, params));
    const point = value(subsolarPoint(t, params));
    expect(point.latRad).toBe(sun.sunDeclinationRad);
    expect(point.lonRad).toBeCloseTo(wrapPiN(-sun.ghaRad), 15);
    expect(point.lonRad).toBeGreaterThan(-Math.PI);
    expect(point.lonRad).toBeLessThanOrEqual(Math.PI);
  });

  it('gives a GHA in [0, 2π) that equals GAST minus right ascension, mod 2π', () => {
    // At the March equinox the Sun's right ascension is near zero, so GHA is near GAST.
    const equinox = Date.UTC(2026, 2, 20, 14, 46);
    const sun = value(sunPosition(equinox, params));
    const gast = value(greenwichSiderealTimeRad(equinox, params));
    expect(Math.abs(sun.sunDeclinationRad)).toBeLessThan(0.1 * DEG_TO_RAD);
    expect(Math.abs(wrapPiN(sun.ghaRad - wrapTwoPiN(gast)))).toBeLessThan(0.1 * DEG_TO_RAD);
  });

  it('uses 15° per hour: an hour later the GHA is 15° larger within 0.006°', () => {
    const t = Date.UTC(2026, 5, 15, 9, 0);
    const a = value(sunPosition(t, params)).ghaRad;
    const b = value(sunPosition(t + 3_600_000, params)).ghaRad;
    expect(Math.abs(wrapPiN(b - a - HOURS_TO_DEG * DEG_TO_RAD))).toBeLessThan(0.006 * DEG_TO_RAD);
  });

  it('is a pure function of its argument', () => {
    const t = Date.UTC(2027, 8, 1, 3, 4, 5);
    expect(sunPosition(t, params)).toEqual(sunPosition(t, params));
  });
});

describe('the range of the Sun wrapper (Req 3.2)', () => {
  const START = params.sunModelStartUtcMs;
  const END = params.sunModelEndUtcMs;

  for (const [name, call] of [
    ['sunPosition', (t: number) => sunPosition(t, params)],
    ['subsolarPoint', (t: number) => subsolarPoint(t, params)],
    ['greenwichSiderealTimeRad', (t: number) => greenwichSiderealTimeRad(t, params)],
    ['greenwichMeanSiderealTimeRad', (t: number) => greenwichMeanSiderealTimeRad(t, params)],
  ] as const) {
    it(`${name} accepts the first and last millisecond, and refuses either side`, () => {
      expect(call(START).ok, 'start').toBe(true);
      expect(call(END - 1).ok, 'end - 1').toBe(true);
      expect(call(START - 1)).toMatchObject({
        ok: false,
        reason: 'sight_time_unsupported',
        field: 'timeUtcMs',
      });
      expect(call(END)).toMatchObject({ ok: false, reason: 'sight_time_unsupported' });
      expect(call(0)).toMatchObject({ ok: false, reason: 'sight_time_unsupported' });
      expect(call(Number.NaN)).toMatchObject({ ok: false, reason: 'sight_time_unsupported' });
      expect(call(Infinity)).toMatchObject({ ok: false, reason: 'sight_time_unsupported' });
    });
  }

  it('refuses invalid parameters first, naming the field', () => {
    const bad = { ...params, sunModelEndUtcMs: Number.NaN };
    expect(sunPosition(START, bad)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'sunModelEndUtcMs',
    });
  });

  it('refuses 1980, the GPS epoch, which a phone with a reset clock may show', () => {
    expect(sunPosition(Date.UTC(1980, 0, 6), params)).toMatchObject({
      reason: 'sight_time_unsupported',
    });
  });
});
