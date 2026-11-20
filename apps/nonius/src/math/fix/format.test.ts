// The formatter of the words (Req 9.1, 9.3; design D14, §8.2): every length, position and
// calibration that reaches a sentence goes through here.

import { describe, expect, it } from 'vitest';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { calibrationInUse, type IndexError } from '../sight/index-error';
import {
  axisWords,
  calibrationText,
  compassWord8,
  distanceText,
  lengthText95,
  METRES_PER_DEGREE,
  nauticalText,
  positionDecimals,
  positionText,
} from './format';

const params = defaultParameters();
const D = DEG_TO_RAD;

function text(result: { ok: boolean; value?: unknown; reason?: string }): string {
  if (!result.ok) throw new Error(String(result.reason));
  return String(result.value);
}

describe('lengthText95 rounds an uncertainty up (Req 9.1)', () => {
  it.each([
    [1, '10 km'],
    [9_999, '10 km'],
    [10_000, '10 km'],
    [10_001, '20 km'],
    [123_400, '130 km'],
    [999_000, '1000 km'],
    [990_000, '990 km'],
    [1_000_000, '1000 km'],
    [1_000_001, '1100 km'],
    [1_234_500, '1300 km'],
  ])('%f m is %s', (lengthM, expected) => {
    expect(text(lengthText95(lengthM))).toBe(expected);
  });

  it('refuses a length that is not a positive finite number, naming the field', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = lengthText95(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r).toMatchObject({ reason: 'invalid_number', field: 'lengthM' });
    }
  });
});

describe('nauticalText rounds the same length up in nautical miles', () => {
  it.each([
    [1, '10 nautical miles'],
    [18_520, '10 nautical miles'],
    [18_521, '20 nautical miles'],
    [100_000, '60 nautical miles'],
    [1_852_000, '1000 nautical miles'],
    [1_852_001, '1100 nautical miles'],
  ])('%f m is %s', (lengthM, expected) => {
    expect(text(nauticalText(lengthM))).toBe(expected);
  });

  it('refuses non-finite and non-positive lengths', () => {
    for (const bad of [0, -5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(nauticalText(bad).ok).toBe(false);
    }
  });
});

describe('distanceText rounds a distance to the nearest step (Req 11.3)', () => {
  it.each([
    [0, '0 km (0 nautical miles)'],
    [14_000, '10 km (10 nautical miles)'],
    [16_000, '20 km (10 nautical miles)'],
    [1_234_000, '1200 km (700 nautical miles)'],
    [1_250_000, '1300 km (700 nautical miles)'],
  ])('%f m is %s', (lengthM, expected) => {
    expect(text(distanceText(lengthM))).toBe(expected);
  });

  it('refuses a negative or non-finite distance', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(distanceText(bad).ok).toBe(false);
    }
  });
});

describe('positionDecimals and positionText (Req 9.1)', () => {
  it('takes the smallest decimals whose step is no coarser than the semi-minor axis', () => {
    expect(positionDecimals(METRES_PER_DEGREE)).toBe(0);
    expect(positionDecimals(METRES_PER_DEGREE * 0.999)).toBe(1);
    expect(positionDecimals(METRES_PER_DEGREE / 10)).toBe(1);
    expect(positionDecimals(50_000)).toBe(1);
    expect(positionDecimals(5_000)).toBe(2);
    expect(positionDecimals(1)).toBe(4);
    expect(positionDecimals(Number.NaN)).toBe(4);
  });

  it('writes degrees with hemisphere letters, zero as N and E, and never a minus sign', () => {
    const p = positionText({ latRad: -28.123 * D, lonRad: -41.45 * D }, 200_000);
    if (!p.ok) throw new Error(p.reason);
    expect(p.value.decimals).toBe(0);
    expect(p.value.text).toBe('28° S, 41° W');
    const zero = positionText({ latRad: 0, lonRad: 0 }, 200_000);
    if (!zero.ok) throw new Error(zero.reason);
    expect(zero.value.text).toBe('0° N, 0° E');
    expect(zero.value.text).not.toContain('-');
  });

  it('gives the printing bound of half a step on each axis', () => {
    const p = positionText({ latRad: 10 * D, lonRad: 20 * D }, 5_000);
    if (!p.ok) throw new Error(p.reason);
    const half = 0.5 * METRES_PER_DEGREE * 0.01;
    expect(p.value.printBoundM).toBeCloseTo(Math.hypot(half, half * Math.cos(10 * D)), 6);
  });

  it('refuses a position within 1 degree of a pole', () => {
    const r = positionText({ latRad: 89.5 * D, lonRad: 0 }, 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported_position');
  });
});

describe('compass words', () => {
  it.each([
    [0, 'north'],
    [44 * D, 'north-east'],
    [90 * D, 'east'],
    [200 * D, 'south'],
    [-90 * D, 'west'],
    [350 * D, 'north'],
    [315 * D, 'north-west'],
  ])('%f rad is %s', (azimuthRad, word) => {
    expect(text(compassWord8(azimuthRad))).toBe(word);
  });

  it('names the axis of an ellipse, the same line from either end', () => {
    expect(text(axisWords(176 * D))).toBe('north to south (176°)');
    expect(text(axisWords(4 * D))).toBe('north to south (4°)');
    expect(text(axisWords(135 * D))).toBe('south-east to north-west (135°)');
    expect(text(axisWords(315 * D))).toBe('south-east to north-west (135°)');
  });

  it('refuses angles that are not finite', () => {
    expect(compassWord8(Number.NaN).ok).toBe(false);
    expect(axisWords(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});

describe('calibrationText (Req 9.3, 15.6)', () => {
  const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
  const indexError = (over: Partial<IndexError> = {}): IndexError => ({
    valueRad: -3.31 * D,
    sigmaRad: 0.21 * D,
    sightCount: 5,
    measuredUtcMs: NOW - 3_600_000,
    simulated: false,
    ...over,
  });

  it('prints the Index error to 0.1° with the sigma rounded up and the date', () => {
    const t = text(calibrationText(calibrationInUse(indexError()), NOW, params));
    expect(t).toBe('Index error −3.3° ± 0.3°, measured 20 Nov 2026.');
  });

  it('adds the age and the words that it should be measured again when it is old', () => {
    const t = text(
      calibrationText(
        calibrationInUse(indexError({ measuredUtcMs: NOW - 9 * 86_400_000 })),
        NOW,
        params,
      ),
    );
    expect(t).toContain('Index error −3.3° ± 0.3°, measured 11 Nov 2026');
    expect(t).toContain('9 days ago');
    expect(t).toContain('an index error can change; measure it again');
  });

  it('does not add the age at exactly the old limit', () => {
    const t = text(
      calibrationText(
        calibrationInUse(indexError({ measuredUtcMs: NOW - params.indexErrorOldMs })),
        NOW,
        params,
      ),
    );
    expect(t).not.toContain('measure it again');
  });

  it('marks a simulated Index error', () => {
    const t = text(calibrationText(calibrationInUse(indexError({ simulated: true })), NOW, params));
    expect(t).toContain('(simulated)');
  });

  it('never writes -0 for a value that rounds to zero', () => {
    const t = text(
      calibrationText(calibrationInUse(indexError({ valueRad: -0.01 * D })), NOW, params),
    );
    expect(t).toContain('Index error 0.0°');
    expect(t).not.toContain('−0.0');
  });

  it('says without an Index error that the phone was never calibrated, with 3.5° and about 390 km', () => {
    const t = text(calibrationText(calibrationInUse(null), NOW, params));
    expect(t).toBe(
      "This phone's altitude was never calibrated. It may be off by 3.5°, about 390 km on the ground. Measure the index error at a place the phone knows to remove most of it.",
    );
  });

  it('refuses a time that is not finite', () => {
    expect(calibrationText(calibrationInUse(null), Number.NaN, params).ok).toBe(false);
  });
});
