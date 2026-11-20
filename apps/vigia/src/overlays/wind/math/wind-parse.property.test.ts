// P-13.6: the wind response as untrusted data, the compass word and the words about time
// (Req 13.3, 13.6, design §11).
//
// Generator `windResponse`: a response in Open-Meteo's documented shape built from parts, so that
// its verdict is known by construction (never decided by the parser): the time a whole number of
// seconds in [0, 4e9], the speed in [0, 100] m/s (both ends drawn), the direction in [0, 360)
// degrees (0 drawn, and 359.999999 as the largest), the unit `m/s`; and then, in one case in two,
// one flaw chosen from: a missing `current`, `current.time`, `current.wind_speed_10m`,
// `current.wind_direction_10m` or `current_units.wind_speed_10m`; a `current` that is not an object;
// a number written as a string (each of the three); a number that is `null` (what `JSON.stringify`
// makes of `NaN`); a negative speed; a direction of 360 or of -1 or below zero; a time that is not a
// whole number; a unit that is not `m/s`; a number too large to be finite (`1e999`, written into
// the text). Excluded: duplicate keys and text that is not JSON (the examples of wind-parse.test.ts
// cover them), and speeds above 100 m/s (the parser sets no upper bound).
//
// The standing rule for limits (tasks.md): the compass word is checked at least 1e-6 degrees away
// from a sector boundary, because a direction crosses the radian round trip by rounding exactly at
// one; the exact boundaries have an example test of their own below, and the word is checked
// to be one of the eight words over the whole closed range.

import { angularDifference, degToRad, type Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compassWord8 } from '../../../math/fix/format';
import { defaultParameters } from '../../../math/parameters';
import { isDeepRun } from '../../../test-support/fast-check-setup';
import { closed, uniform, uniformInteger } from '../../../test-support/generators';
import { hostileString } from '../../../test-support/hostile';
import { checkProperty, ErrorTracker } from '../../../test-support/property-report';
import { parseWindResponse } from './wind-parse';
import { windTiming, windWords } from './wind-words';

const PARAMETERS = defaultParameters();
const MAX = PARAMETERS.maxWindAgeMs;
const POINT: Position = { latRad: 0.5, lonRad: -0.7 };
const WORDS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

const FLAWS = [
  'missing current',
  'missing time',
  'missing speed',
  'missing direction',
  'missing unit',
  'current not an object',
  'time as string',
  'speed as string',
  'direction as string',
  'time null',
  'speed null',
  'direction null',
  'negative speed',
  'direction 360',
  'direction negative',
  'time fractional',
  'unit not m/s',
  'speed infinite',
  'direction infinite',
  'time infinite',
] as const;
type Flaw = (typeof FLAWS)[number];

interface WindCase {
  readonly text: string;
  readonly flaw: Flaw | null;
  readonly timeS: number;
  readonly speedMs: number;
  readonly directionDeg: number;
  /** now minus the valid time, milliseconds. */
  readonly ageMs: number;
}

const OFFSETS_MS = [-MAX - 1, -MAX, -MAX + 1, 0, MAX - 1, MAX, MAX + 1] as const;

const windResponse: fc.Arbitrary<WindCase> = fc
  .tuple(
    uniformInteger(0, 4_000_000_000),
    closed(0, 100),
    fc.oneof(
      { weight: 1, arbitrary: fc.constant(0) },
      { weight: 1, arbitrary: fc.constant(359.999999) },
      { weight: 8, arbitrary: uniform(0, 360) },
    ),
    fc.option(fc.constantFrom(...FLAWS), { nil: null, freq: 2 }),
    fc.oneof(
      { weight: 1, arbitrary: fc.constantFrom(...OFFSETS_MS) },
      { weight: 1, arbitrary: uniform(-3 * MAX, 3 * MAX).map(Math.round) },
    ),
  )
  .map(([timeS, speedMs, directionDeg, flaw, ageMs]): WindCase => {
    const current: Record<string, unknown> = {
      time: timeS,
      interval: 900,
      wind_speed_10m: speedMs,
      wind_direction_10m: directionDeg,
    };
    const units: Record<string, unknown> = {
      time: 'unixtime',
      wind_speed_10m: 'm/s',
      wind_direction_10m: '°',
    };
    const root: Record<string, unknown> = {
      latitude: 30,
      longitude: -40,
      current_units: units,
      current,
    };
    let text: string | null = null;
    switch (flaw) {
      case 'missing current':
        delete root['current'];
        break;
      case 'missing time':
        delete current['time'];
        break;
      case 'missing speed':
        delete current['wind_speed_10m'];
        break;
      case 'missing direction':
        delete current['wind_direction_10m'];
        break;
      case 'missing unit':
        delete units['wind_speed_10m'];
        break;
      case 'current not an object':
        root['current'] = [timeS, speedMs];
        break;
      case 'time as string':
        current['time'] = String(timeS);
        break;
      case 'speed as string':
        current['wind_speed_10m'] = String(speedMs);
        break;
      case 'direction as string':
        current['wind_direction_10m'] = String(directionDeg);
        break;
      case 'time null':
        current['time'] = null;
        break;
      case 'speed null':
        current['wind_speed_10m'] = null;
        break;
      case 'direction null':
        current['wind_direction_10m'] = null;
        break;
      case 'negative speed':
        current['wind_speed_10m'] = -(speedMs + 1e-9);
        break;
      case 'direction 360':
        current['wind_direction_10m'] = 360;
        break;
      case 'direction negative':
        current['wind_direction_10m'] = -(directionDeg + 1e-9);
        break;
      case 'time fractional':
        current['time'] = timeS + 0.5;
        break;
      case 'unit not m/s':
        units['wind_speed_10m'] = ['km/h', 'mph', 'kn', ''][timeS % 4];
        break;
      case 'speed infinite':
        current['wind_speed_10m'] = '@@';
        text = JSON.stringify(root).replace('"@@"', '1e999');
        break;
      case 'direction infinite':
        current['wind_direction_10m'] = '@@';
        text = JSON.stringify(root).replace('"@@"', '1e999');
        break;
      case 'time infinite':
        current['time'] = '@@';
        text = JSON.stringify(root).replace('"@@"', '1e999');
        break;
      case null:
        break;
    }
    return { text: text ?? JSON.stringify(root), flaw, timeS, speedMs, directionDeg, ageMs };
  });

/** The word of the 45 degree sector centred on the direction: the compass point at the least circular distance. */
function oracleWord(directionDeg: number): string {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 8; k += 1) {
    const raw = Math.abs(directionDeg - 45 * k);
    const distance = Math.min(raw, 360 - raw);
    if (distance < bestDistance) {
      best = k;
      bestDistance = distance;
    }
  }
  return WORDS[best] ?? 'north';
}

/** Distance in degrees from the nearest sector boundary (22.5, 67.5, ... 337.5). */
function boundaryDistanceDeg(directionDeg: number): number {
  const shifted = (directionDeg + 22.5) % 45;
  return Math.min(shifted, 45 - shifted);
}

// P-13.6 (Req 13.3, 13.6): parsed reading valid or a failure, finite numbers, direction in
// [0, 2π), speed not negative, compass word of the sector, forecast or old exactly past the age.
describe('P-13.6: the wind response, the compass word and the age (Req 13.3, 13.6)', () => {
  it('a valid response is read exactly and a flawed one is refused naming a field; the word and the age are right', () => {
    const tracker = new ErrorTracker();
    let valid = 0;
    let refused = 0;
    const flawsSeen = new Set<string>();
    let old = 0;
    let forecast = 0;
    checkProperty(
      'P-13.6',
      fc.property(windResponse, (c) => {
        const parsed = parseWindResponse(c.text, POINT, PARAMETERS);
        if (c.flaw !== null) {
          refused += 1;
          flawsSeen.add(c.flaw);
          expect(parsed.ok, `${c.flaw} was read: ${c.text}`).toBe(false);
          if (!parsed.ok) {
            expect(parsed.reason).toBe('overlay_unavailable');
            expect(typeof parsed.field === 'string' && parsed.field !== '').toBe(true);
          }
          return;
        }
        valid += 1;
        expect(parsed.ok, c.text).toBe(true);
        if (!parsed.ok) return;
        const r = parsed.value;
        for (const n of [r.directionFromRad, r.speedMs, r.validUtcMs]) {
          expect(Number.isFinite(n)).toBe(true);
        }
        expect(r.directionFromRad).toBeGreaterThanOrEqual(0);
        expect(r.directionFromRad).toBeLessThan(2 * Math.PI);
        expect(r.speedMs).toBeGreaterThanOrEqual(0);
        expect(Object.is(r.speedMs, c.speedMs + 0)).toBe(true);
        expect(r.validUtcMs).toBe(c.timeS * 1000);
        const wanted = degToRad(c.directionDeg);
        if (!wanted.ok) throw new Error('degToRad');
        const difference = angularDifference(r.directionFromRad, wanted.value);
        if (!difference.ok) throw new Error('angularDifference');
        const errorRad = Math.abs(difference.value);
        tracker.record('direction round trip (rad)', errorRad, '1e-12', `${c.directionDeg}°`);
        expect(errorRad).toBeLessThan(1e-12);

        // The compass word: the sector of the direction, away from a boundary (standing rule).
        if (boundaryDistanceDeg(c.directionDeg) >= 1e-6) {
          const word = compassWord8(r.directionFromRad);
          expect(word, `${c.directionDeg}°`).toEqual({
            ok: true,
            value: oracleWord(c.directionDeg),
          });
        } else {
          const word = compassWord8(r.directionFromRad);
          expect(word.ok && WORDS.includes(word.value)).toBe(true);
        }

        // The age: forecast or old exactly when the time is more than the maximum from now.
        const nowUtcMs = r.validUtcMs + c.ageMs;
        const words = windWords(r, nowUtcMs, PARAMETERS);
        expect(words.ok).toBe(true);
        if (!words.ok) return;
        const text = words.value.join(' ');
        const isOld = c.ageMs > MAX;
        const isForecast = -c.ageMs > MAX;
        if (isOld) old += 1;
        if (isForecast) forecast += 1;
        expect(text.includes('This is an old reading, not the wind now.')).toBe(isOld);
        expect(text.includes('This is a forecast for')).toBe(isForecast);
        expect(windTiming(r.validUtcMs, nowUtcMs, PARAMETERS)).toBe(
          isOld ? 'old' : isForecast ? 'forecast' : 'current',
        );
        expect(/NaN|Infinity|undefined|null/.test(text)).toBe(false);
      }),
      tracker,
    );
    // The generator is not vacuous: both verdicts, and the three timings, are drawn.
    expect(valid).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
    expect(flawsSeen.size).toBeGreaterThanOrEqual(isDeepRun() ? FLAWS.length : 12);
    expect(old).toBeGreaterThan(0);
    expect(forecast).toBeGreaterThan(0);
    if (isDeepRun()) {
      console.log(
        `[deep] P-13.6: ${valid} valid, ${refused} refused over ${flawsSeen.size} flaws; ${old} old, ${forecast} forecast`,
      );
    }
  });

  it('is total over text of 0 to 10 000 characters of any kind: never throws, never returns a number that is not finite', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-13.6 hostile text',
      fc.property(hostileString(), (text) => {
        const parsed = parseWindResponse(text, POINT, PARAMETERS);
        if (parsed.ok) {
          for (const n of Object.values(parsed.value).filter((v) => typeof v === 'number')) {
            expect(Number.isFinite(n)).toBe(true);
          }
        }
      }),
      tracker,
    );
  });
});

describe('the compass word at its boundaries and over the closed range (Req 13.6)', () => {
  const wordAt = (directionDeg: number): string | null => {
    const rad = degToRad(directionDeg);
    if (!rad.ok) return null;
    const w = compassWord8(rad.value);
    return w.ok ? w.value : null;
  };

  it('is the next sector at exactly each boundary (22.5 is north-east, 337.5 is north)', () => {
    expect(wordAt(22.5)).toBe('north-east');
    expect(wordAt(337.5)).toBe('north');
    for (let k = 0; k < 8; k += 1) {
      const boundary = 22.5 + 45 * k;
      expect(wordAt(boundary), `${boundary}`).toBe(WORDS[(k + 1) % 8]);
    }
  });

  it('is the sector below at the largest double under each boundary', () => {
    for (let k = 0; k < 8; k += 1) {
      const boundary = 22.5 + 45 * k;
      expect(wordAt(boundary - 1e-6), `${boundary}`).toBe(WORDS[k]);
    }
  });

  it('is one of the eight words for every whole degree and for 0 and 359.999999', () => {
    for (let d = 0; d < 360; d += 1) expect(WORDS).toContain(wordAt(d));
    expect(WORDS).toContain(wordAt(359.999999));
  });
});
