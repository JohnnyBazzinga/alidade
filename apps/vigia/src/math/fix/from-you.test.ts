import { destinationPosition, ellipse95 } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { fixOf } from '../../test-support/generators';
import { ORIGIN, PARAMETERS } from '../../test-support/incident-fixtures';
import { fromYouWords, halfIntervalM } from './from-you';

const E95 = { semiMajorM: 500, semiMinorM: 200, azimuthRad: 0.4 };
const half = (direction: number) => {
  const r = halfIntervalM(E95, direction);
  if (!r.ok) throw new Error('failed');
  return r.value;
};

describe('halfIntervalM (Req 6.4, 6.9, design §7.11)', () => {
  it('is the semi-major axis along it, the semi-minor across it, and the formula between', () => {
    expect(Math.abs(half(0.4) - 500)).toBeLessThan(1e-9 * 500);
    expect(Math.abs(half(0.4 + Math.PI) - 500)).toBeLessThan(1e-9 * 500);
    expect(Math.abs(half(0.4 + Math.PI / 2) - 200)).toBeLessThan(1e-9 * 500);
    const quarter = Math.sqrt(
      500 ** 2 * Math.cos(Math.PI / 4) ** 2 + 200 ** 2 * Math.sin(Math.PI / 4) ** 2,
    );
    expect(Math.abs(half(0.4 + Math.PI / 4) - quarter)).toBeLessThan(1e-9);
  });

  it('fails with invalid_number for an Ellipse or a direction that is not finite', () => {
    expect(halfIntervalM(E95, Number.NaN)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'directionRad',
    });
    expect(halfIntervalM({ ...E95, semiMajorM: Infinity }, 0)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'ellipse',
    });
  });
});

describe('fromYouWords (Req 6.4)', () => {
  const fix = fixOf(ORIGIN, { semiMajorM: 312.5, semiMinorM: 83.3, azimuthRad: 0 });
  const at = (azimuthRad: number, distanceM: number) => {
    const p = destinationPosition(ORIGIN, azimuthRad, distanceM);
    if (!p.ok) throw new Error('destination');
    return p.value;
  };

  it('gives the distance, the direction and the interval in one sentence', () => {
    // You stand 3 000 m south of the Fix: the Fix is north of you, along its long axis (0°).
    const words = fromYouWords(fix, at(Math.PI, 3000), PARAMETERS);
    const e95 = ellipse95(fix.ellipse);
    if (!e95.ok) throw new Error('ellipse95');
    expect(words).toEqual({
      ok: true,
      value:
        'About 3.0 km north of where you took your last sighting, give or take 770 m (at least 95 %).',
    });
    expect(Math.ceil(e95.value.semiMajorM / 10) * 10).toBe(770);
  });

  it('uses the semi-minor axis when you look across the long axis', () => {
    // You stand 2 000 m west: the Fix is east of you, across its long axis.
    expect(fromYouWords(fix, at((3 * Math.PI) / 2, 2000), PARAMETERS)).toEqual({
      ok: true,
      value:
        'About 2.0 km east of where you took your last sighting, give or take 210 m (at least 95 %).',
    });
  });

  it('says the distance cannot be given when the phone is at the estimated position', () => {
    expect(fromYouWords(fix, ORIGIN, PARAMETERS)).toEqual({
      ok: true,
      value:
        'Your last sighting was taken at the estimated position, so the distance cannot be given.',
    });
  });

  it('never gives the distance without its interval', () => {
    for (const distanceM of [10, 300, 4000, 90_000]) {
      for (const azimuthRad of [0, 1, 2, 3, 4, 5, 6]) {
        const words = fromYouWords(fix, at(azimuthRad, distanceM), PARAMETERS);
        expect(words.ok && words.value).toMatch(
          /^About .+ of where you took your last sighting, give or take .+ \(at least 95 %\)\.$/,
        );
      }
    }
  });

  it('fails with unsupported_position for your position when it is not Supported', () => {
    expect(fromYouWords(fix, { latRad: 1.56, lonRad: 0 }, PARAMETERS)).toEqual({
      ok: false,
      reason: 'unsupported_position',
    });
  });

  it('names the parameter that is not valid', () => {
    expect(fromYouWords(fix, ORIGIN, { ...PARAMETERS, fairEllipseRatio: 0.5 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'fairEllipseRatio',
    });
  });
});
