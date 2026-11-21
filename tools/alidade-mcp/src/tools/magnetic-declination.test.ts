import { declinationAt } from '@alidade/sensors';
import { radToDeg } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../messages.ts';
import type { Outcome } from '../outcome.ts';
import { positionOf, unwrap } from '../synthetic.testkit.ts';
import { runMagneticDeclination } from './magnetic-declination.ts';

function field(outcome: Outcome, key: string): unknown {
  return (outcome as Record<string, unknown>)[key];
}

const ATLANTIC = { latDeg: 30, lonDeg: -40 };
const JUNE_2026 = Date.UTC(2026, 5, 1);

describe('magnetic_declination (Req 6.2, 6.7)', () => {
  it('equals Sensors’ declinationAt converted to degrees', () => {
    const outcome = runMagneticDeclination({ ...ATLANTIC, timeUtcMs: JUNE_2026 });
    const expected = unwrap(declinationAt(positionOf(ATLANTIC), JUNE_2026));
    expect(outcome).toStrictEqual({
      ok: true,
      declinationDeg: unwrap(radToDeg(expected.declinationRad)),
      sigmaDeg: unwrap(radToDeg(expected.sigmaRad)),
      positiveEast: true,
    });
  });

  it('has the sign of the model at synthetic points in the open ocean: west is negative, east is positive', () => {
    // The sign convention is the tool's job (positive east, true = magnetic + declination). The
    // expected value at each point is Sensors' own declinationAt, and the sign is stated here.
    const points = [
      { place: ATLANTIC, sign: -1 },
      { place: { latDeg: 40, lonDeg: -150 }, sign: 1 },
    ];
    for (const { place, sign } of points) {
      const outcome = runMagneticDeclination({ ...place, timeUtcMs: JUNE_2026 });
      const expected = unwrap(declinationAt(positionOf(place), JUNE_2026));
      expect(outcome.ok).toBe(true);
      const declinationDeg = field(outcome, 'declinationDeg') as number;
      expect(declinationDeg).toBe(unwrap(radToDeg(expected.declinationRad)));
      expect(Math.sign(declinationDeg)).toBe(sign);
      expect(Math.abs(declinationDeg)).toBeGreaterThan(5);
      expect(Math.abs(declinationDeg)).toBeLessThan(25);
    }
  });
});

describe('magnetic_declination: arguments and failures (Req 6.5)', () => {
  const good = { ...ATLANTIC, timeUtcMs: JUNE_2026 };

  it.each([
    ['not an object', [], ''],
    ['no latitude', { lonDeg: 1, timeUtcMs: JUNE_2026 }, 'latDeg'],
    ['a string longitude', { ...good, lonDeg: '1' }, 'lonDeg'],
    ['an infinite time', { ...good, timeUtcMs: Infinity }, 'timeUtcMs'],
    ['an unknown field', { ...good, heightM: 0 }, 'heightM'],
  ])('refuses %s, naming the field', (_name, args, expectedField) => {
    const outcome = runMagneticDeclination(args);
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid_arguments' });
    expect(field(outcome, 'field') ?? '').toBe(expectedField);
  });

  it('passes on the skeleton’s reason for a position within 1° of a pole', () => {
    expect(runMagneticDeclination({ ...good, latDeg: 89.5 })).toMatchObject({
      ok: false,
      reason: 'unsupported_position',
      message: MESSAGES.unsupported_position,
    });
  });

  it('says the declination is unknown outside the model’s dates', () => {
    expect(runMagneticDeclination({ ...good, timeUtcMs: Date.UTC(1900, 0, 1) })).toMatchObject({
      ok: false,
      reason: 'declination_unknown',
      message: MESSAGES.declination_unknown,
    });
  });

  it('fails with a reason for a latitude of 1000°', () => {
    const outcome = runMagneticDeclination({ ...good, latDeg: 1000 });
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).not.toMatch(/NaN|Infinity/);
  });
});
