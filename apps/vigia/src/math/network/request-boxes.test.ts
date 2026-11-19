// `windPoint` and the wind request URL (Req 13.2, design §7.15): one point, rounded to the wind
// grid, and nothing else in the request.

import { describe, expect, it } from 'vitest';
import { fromDeg } from '../degrees';
import { defaultParameters } from '../parameters';
import { windPoint, windRequestUrl } from './request-boxes';

function at(latDeg: number, lonDeg: number) {
  const lat = fromDeg(latDeg);
  const lon = fromDeg(lonDeg);
  if (!lat.ok || !lon.ok) throw new Error('fromDeg failed');
  return { latRad: lat.value, lonRad: lon.value };
}

const P = defaultParameters();

describe('windPoint (Req 13.2)', () => {
  it('rounds 30.123, -40.168 to the 0.1 grid: 30.1, -40.2', () => {
    expect(windPoint(at(30.123, -40.168), P)).toEqual({
      ok: true,
      value: { latDeg: 30.1, lonDeg: -40.2 },
    });
  });

  it('is within half a grid step of the position on each axis, at the cell edges', () => {
    for (const [lat, lon] of [
      [30.049, -40.049],
      [30.051, -40.051],
      [-0.049, 0.049],
      [89, 180],
      [-89, -179.99],
    ] as const) {
      const result = windPoint(at(lat, lon), P);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Math.abs(result.value.latDeg - lat)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(result.value.lonDeg - lon)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });

  it('gives a point that is a multiple of the grid, in 10 000 positions of a ramp', () => {
    for (let i = 0; i < 10_000; i += 1) {
      const result = windPoint(at(-88 + i * 0.0176, -179 + i * 0.0358), P);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(
        Math.abs(result.value.latDeg * 10 - Math.round(result.value.latDeg * 10)),
      ).toBeLessThan(1e-9);
      expect(
        Math.abs(result.value.lonDeg * 10 - Math.round(result.value.lonDeg * 10)),
      ).toBeLessThan(1e-9);
    }
  });

  it('refuses a position that is not Supported with unsupported_position', () => {
    for (const position of [
      at(89.5, 0),
      at(-89.5, 0),
      { latRad: Number.NaN, lonRad: 0 },
      { latRad: 0, lonRad: Number.POSITIVE_INFINITY },
      { latRad: 0, lonRad: -Math.PI },
      { latRad: 0, lonRad: Math.PI + 1e-9 },
    ]) {
      expect(windPoint(position, P)).toEqual({ ok: false, reason: 'unsupported_position' });
    }
  });

  // The shrunk counterexamples of P-2.6 in `test:deep` (seeds -592330118 and 1385392416): a grid
  // of 5e-324 is positive, so `checkParameters` accepts it, but the position divided by it
  // overflows, and the rounded point was infinite. No infinity leaves a public function (Req 2.1).
  it('a grid so fine that the rounding overflows is invalid_number naming windGridDeg, not an infinite point', () => {
    const position = { latRad: -1.55, lonRad: -3.14 };
    const grid = { ...P, windGridDeg: 5e-324 };
    expect(windPoint(position, grid)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'windGridDeg',
    });
    expect(windRequestUrl(position, grid)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'windGridDeg',
    });
  });

  it('refuses invalid parameters, naming the field', () => {
    expect(windPoint(at(30, -40), { ...P, windGridDeg: 0 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'windGridDeg',
    });
  });
});

describe('windRequestUrl (Req 13.2, 12.3)', () => {
  it('is the request of design §7.16 for the rounded point, and nothing else', () => {
    expect(windRequestUrl(at(30.123, -40.168), P)).toEqual({
      ok: true,
      value:
        'https://api.open-meteo.com/v1/forecast?latitude=30.1&longitude=-40.2' +
        '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timeformat=unixtime',
    });
  });

  it('writes one decimal, never a negative zero, and keeps the rounded point whole', () => {
    const url = windRequestUrl(at(-0.04, 0.04), P);
    expect(url.ok && url.value).toContain('latitude=0.0&longitude=0.0&');
    const north = windRequestUrl(at(89, 180), P);
    expect(north.ok && north.value).toContain('latitude=89.0&longitude=180.0&');
  });

  it('carries no part of the position finer than the grid: two nearby positions in one cell give one URL', () => {
    const a = windRequestUrl(at(30.101, -40.201), P);
    const b = windRequestUrl(at(30.149, -40.249), P);
    expect(a).toEqual(b);
  });

  it('refuses a grid finer than the one decimal the Host list entry allows', () => {
    expect(windRequestUrl(at(30, -40), { ...P, windGridDeg: 0.05 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'windGridDeg',
    });
    const coarse = windRequestUrl(at(30.26, -40.26), { ...P, windGridDeg: 0.5 });
    expect(coarse.ok && coarse.value).toContain('latitude=30.5&longitude=-40.5&');
  });

  it('refuses an unsupported position', () => {
    expect(windRequestUrl(at(89.9, 0), P)).toEqual({ ok: false, reason: 'unsupported_position' });
  });
});
