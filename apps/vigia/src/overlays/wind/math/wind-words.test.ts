// windWords (design §7.16, Req 13.3, 13.4, 13.7): the wind as the direction it blows from, with the
// compass word, the speed, the time it is valid for and its age; a forecast or an old reading said
// as such exactly when the time is more than `maxWindAgeMs` from now; the model-value sentence.

import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../../../math/parameters';
import { WIND_MODEL_SENTENCE, WIND_TERMS_SENTENCE, windTiming, windWords } from './wind-words';
import type { WindReading } from './wind-parse';

const PARAMETERS = defaultParameters();
const MAX = PARAMETERS.maxWindAgeMs;
const VALID_UTC_MS = 1_790_000_000_000; // 14:13 UTC
const POINT = { latRad: 0.5, lonRad: -0.7 };

const reading = (over: Partial<WindReading> = {}): WindReading => ({
  point: POINT,
  directionFromRad: (225 * Math.PI) / 180,
  speedMs: 4.2,
  validUtcMs: VALID_UTC_MS,
  ...over,
});

function words(r: WindReading, nowUtcMs: number): readonly string[] {
  const w = windWords(r, nowUtcMs, PARAMETERS);
  if (!w.ok) throw new Error(`windWords failed: ${w.reason}`);
  return w.value;
}

describe('windWords (Req 13.3, 13.4, 13.7)', () => {
  it('says the direction it blows from with the word, the speed, the time and the age', () => {
    expect(words(reading(), VALID_UTC_MS + 5 * 60_000)).toEqual([
      'Wind from the south-west (225°) at 4.2 m/s, valid 14:13 UTC (5 min ago).',
      WIND_MODEL_SENTENCE,
      WIND_TERMS_SENTENCE,
    ]);
  });

  it('says that it is a model value at one point, that smoke may lean or rise differently, and that it predicts nothing', () => {
    expect(WIND_MODEL_SENTENCE).toBe(
      'It is a model value at one point and one time; smoke may lean or rise differently, and this app does not predict the spread of a fire.',
    );
  });

  it('says that free use is non-commercial (Req 13.7)', () => {
    expect(WIND_TERMS_SENTENCE).toContain('non-commercial');
  });

  it('writes the direction to a whole degree and the speed to 0.1 m/s, a calm as 0.0', () => {
    expect(words(reading({ speedMs: 0 }), VALID_UTC_MS)[0]).toContain('at 0.0 m/s');
    expect(words(reading({ speedMs: 12.34 }), VALID_UTC_MS)[0]).toContain('at 12.3 m/s');
    // 359.6 degrees is the north sector and prints as 0, never as 360.
    const north = words(reading({ directionFromRad: (359.6 * Math.PI) / 180 }), VALID_UTC_MS)[0];
    expect(north).toContain('Wind from the north (0°)');
  });

  it('names each of the eight words for the centre of its sector', () => {
    const names = [
      'north',
      'north-east',
      'east',
      'south-east',
      'south',
      'south-west',
      'west',
      'north-west',
    ];
    names.forEach((name, k) => {
      const r = reading({ directionFromRad: (k * 45 * Math.PI) / 180 });
      expect(words(r, VALID_UTC_MS)[0], name).toContain(`Wind from the ${name} (${k * 45}°)`);
    });
  });
});

describe('forecast and old readings, at and either side of the maximum age (Req 13.3)', () => {
  const now = VALID_UTC_MS;

  it('is current at exactly the maximum age before or after now', () => {
    for (const valid of [now - MAX, now + MAX, now, now - MAX + 1, now + MAX - 1]) {
      expect(windTiming(valid, now, PARAMETERS), String(valid - now)).toBe('current');
      const w = words(reading({ validUtcMs: valid }), now);
      expect(w.join(' ')).not.toContain('not the wind now');
    }
  });

  it('is old one millisecond past the maximum age before now, and says so', () => {
    const valid = now - MAX - 1;
    expect(windTiming(valid, now, PARAMETERS)).toBe('old');
    const w = words(reading({ validUtcMs: valid }), now);
    expect(w).toContain('This is an old reading, not the wind now.');
    expect(w.join(' ')).not.toContain('forecast');
  });

  it('is a forecast one millisecond past the maximum age after now, and names the time', () => {
    const valid = now + MAX + 1; // 17:13 UTC
    expect(windTiming(valid, now, PARAMETERS)).toBe('forecast');
    const w = words(reading({ validUtcMs: valid }), now);
    expect(w).toContain('This is a forecast for 17:13 UTC, not the wind now.');
    expect(w.join(' ')).not.toContain('old reading');
    expect(w[0]).toContain('valid 17:13 UTC (in 3 h)');
  });

  it('keeps the other sentences when it is old or a forecast', () => {
    const w = words(reading({ validUtcMs: now - 5 * MAX }), now);
    expect(w).toContain(WIND_MODEL_SENTENCE);
    expect(w).toContain(WIND_TERMS_SENTENCE);
  });
});

describe('windWords refuses what it cannot print (Req 2.1)', () => {
  it('a direction or a speed or a time that is not finite is invalid_number naming the field', () => {
    expect(windWords(reading({ directionFromRad: Number.NaN }), 0, PARAMETERS)).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'directionFromRad',
    });
    expect(windWords(reading({ speedMs: Number.POSITIVE_INFINITY }), 0, PARAMETERS)).toMatchObject({
      ok: false,
      field: 'speedMs',
    });
    expect(windWords(reading({ speedMs: -1 }), 0, PARAMETERS)).toMatchObject({
      ok: false,
      field: 'speedMs',
    });
    expect(windWords(reading({ validUtcMs: Number.NaN }), 0, PARAMETERS)).toMatchObject({
      ok: false,
      field: 'validUtcMs',
    });
    expect(windWords(reading(), Number.NaN, PARAMETERS)).toMatchObject({
      ok: false,
      field: 'nowUtcMs',
    });
  });

  it('a parameter that is not valid is invalid_number naming it', () => {
    expect(windWords(reading(), 0, { ...PARAMETERS, maxWindAgeMs: -1 })).toMatchObject({
      ok: false,
      reason: 'invalid_number',
      field: 'maxWindAgeMs',
    });
  });
});
