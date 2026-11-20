// parseWindResponse (design §7.16, Req 13.6): Open-Meteo's `current` block as untrusted data, read
// against `fixtures/open-meteo-sample.json` (synthetic, read-only, written by hand from the
// documented field names). Each needed field is refused naming it when it is missing; nothing is
// defaulted.

import { degToRad, type Position } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../../../math/parameters';
import FIXTURE_TEXT from '../../../../fixtures/open-meteo-sample.json?raw';
import { parseWindResponse, windPointPosition } from './wind-parse';

const PARAMETERS = defaultParameters();

function at(latDeg: number, lonDeg: number): Position {
  const lat = degToRad(latDeg);
  const lon = degToRad(lonDeg);
  if (!lat.ok || !lon.ok) throw new Error('bad test position');
  return { latRad: lat.value, lonRad: lon.value };
}

const POINT = at(30, -40);

type Json = Record<string, unknown>;
const fixture = (): Json => JSON.parse(FIXTURE_TEXT) as Json;
const current = (j: Json): Json => j['current'] as Json;
const units = (j: Json): Json => j['current_units'] as Json;
const parse = (j: Json | string) =>
  parseWindResponse(typeof j === 'string' ? j : JSON.stringify(j), POINT, PARAMETERS);

describe('parseWindResponse on the fixture (Req 13.6)', () => {
  it('reads the direction the wind blows from, the speed and the time, and keeps the point', () => {
    const r = parseWindResponse(FIXTURE_TEXT, POINT, PARAMETERS);
    expect(r).toEqual({
      ok: true,
      value: {
        point: POINT,
        directionFromRad: (225 * Math.PI) / 180,
        speedMs: 4.2,
        validUtcMs: 1_790_000_000_000,
      },
    });
  });

  it('is the fixture the lead can read: unix seconds, m/s, a direction of 225 degrees', () => {
    const j = fixture();
    expect(units(j)['wind_speed_10m']).toBe('m/s');
    expect(units(j)['time']).toBe('unixtime');
    expect(current(j)['wind_direction_10m']).toBe(225);
  });

  it('ignores fields it does not need', () => {
    const j = fixture();
    current(j)['interval'] = 'whatever';
    j['extra'] = { nested: [1, 2, 3] };
    expect(parse(j).ok).toBe(true);
  });
});

describe('each needed field missing in turn is refused, naming it (Req 13.6)', () => {
  const cases: readonly (readonly [string, (j: Json) => void])[] = [
    ['current', (j) => delete j['current']],
    ['current.time', (j) => delete current(j)['time']],
    ['current.wind_speed_10m', (j) => delete current(j)['wind_speed_10m']],
    ['current.wind_direction_10m', (j) => delete current(j)['wind_direction_10m']],
    ['current_units.wind_speed_10m', (j) => delete units(j)['wind_speed_10m']],
    ['current_units', (j) => delete j['current_units']],
  ];
  for (const [field, remove] of cases) {
    it(`without ${field}`, () => {
      const j = fixture();
      remove(j);
      expect(parse(j)).toEqual({ ok: false, reason: 'overlay_unavailable', field });
    });
  }

  it('a current block that is not an object, or is an array, or null', () => {
    for (const bad of [1, 'x', null, [1, 2], true]) {
      const j = fixture();
      j['current'] = bad;
      expect(parse(j), JSON.stringify(bad)).toMatchObject({ ok: false, field: 'current' });
    }
  });
});

describe('what is not a reading (Req 13.6)', () => {
  it('a unit other than m/s is refused, never converted', () => {
    for (const unit of ['km/h', 'mph', 'kn', 'M/S', 'm/s ', '', 5, null]) {
      const j = fixture();
      units(j)['wind_speed_10m'] = unit;
      expect(parse(j), JSON.stringify(unit)).toEqual({
        ok: false,
        reason: 'overlay_unavailable',
        field: 'current_units.wind_speed_10m',
      });
    }
  });

  it('a direction of 360 or below 0 is refused, 0 and 359.99 are read', () => {
    for (const dir of [360, -1, -0.000001, 720, Number.POSITIVE_INFINITY]) {
      const j = fixture();
      current(j)['wind_direction_10m'] = dir;
      expect(parse(j), String(dir)).toMatchObject({
        ok: false,
        field: 'current.wind_direction_10m',
      });
    }
    for (const dir of [0, 359.99, 359.99999999999994]) {
      const j = fixture();
      current(j)['wind_direction_10m'] = dir;
      const r = parse(j);
      expect(r.ok, String(dir)).toBe(true);
      if (r.ok) {
        expect(r.value.directionFromRad).toBeGreaterThanOrEqual(0);
        expect(r.value.directionFromRad).toBeLessThan(2 * Math.PI);
      }
    }
  });

  it('a negative or infinite speed is refused, 0 and -0 are a speed of 0', () => {
    for (const speed of [-0.1, -1e-12, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const j = fixture();
      current(j)['wind_speed_10m'] = speed;
      expect(parse(j), String(speed)).toMatchObject({ ok: false, field: 'current.wind_speed_10m' });
    }
    for (const text of ['0', '-0', '0.0']) {
      const r = parse(FIXTURE_TEXT.replace('4.2', text));
      expect(r.ok, text).toBe(true);
      if (r.ok) expect(Object.is(r.value.speedMs, 0)).toBe(true);
    }
  });

  it('a number too large to be one (JSON allows 1e999, which reads as infinity) is refused', () => {
    expect(parse(FIXTURE_TEXT.replace('4.2', '1e999'))).toMatchObject({
      ok: false,
      field: 'current.wind_speed_10m',
    });
    expect(parse(FIXTURE_TEXT.replace('225', '1e999'))).toMatchObject({
      ok: false,
      field: 'current.wind_direction_10m',
    });
    expect(parse(FIXTURE_TEXT.replace('1790000000', '1e999'))).toMatchObject({
      ok: false,
      field: 'current.time',
    });
  });

  it('a number written as a string is refused, in each of the three fields', () => {
    for (const field of ['time', 'wind_speed_10m', 'wind_direction_10m'] as const) {
      const j = fixture();
      current(j)[field] = String(current(j)[field]);
      expect(parse(j), field).toMatchObject({ ok: false, field: `current.${field}` });
    }
  });

  it('a time that is not a whole number of seconds since the epoch is refused', () => {
    for (const time of [1_790_000_000.5, -1, 1e300, 2 ** 53 + 2, null, true]) {
      const j = fixture();
      current(j)['time'] = time;
      expect(parse(j), String(time)).toMatchObject({ ok: false, field: 'current.time' });
    }
  });

  it('text that is not a JSON object is refused as json', () => {
    for (const text of ['', 'not json', '[]', 'null', '42', '"x"', '{"current":', '\u0000']) {
      expect(parse(text), JSON.stringify(text)).toEqual({
        ok: false,
        reason: 'overlay_unavailable',
        field: 'json',
      });
    }
  });

  it('refuses a position that is not Supported and a parameter that is not valid', () => {
    const pole = { latRad: Math.PI / 2, lonRad: 0 };
    expect(parseWindResponse(FIXTURE_TEXT, pole, PARAMETERS)).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
    expect(
      parseWindResponse(FIXTURE_TEXT, POINT, { ...PARAMETERS, maxWindAgeMs: Number.NaN }),
    ).toMatchObject({ ok: false, reason: 'invalid_number', field: 'maxWindAgeMs' });
  });
});

describe('windPointPosition: the request point as a position (Req 13.2)', () => {
  it('is the position rounded to the wind grid, as the request writes it', () => {
    const p = windPointPosition(at(30.123, -40.168), PARAMETERS);
    expect(p).toEqual({ ok: true, value: at(30.1, -40.2) });
  });

  it('fails for a position that is not Supported', () => {
    expect(windPointPosition({ latRad: Math.PI / 2, lonRad: 0 }, PARAMETERS)).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
    });
  });
});
