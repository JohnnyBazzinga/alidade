import { describe, expect, it } from 'vitest';
import {
  TWO_PI_RAD,
  angularDifference,
  circularMean,
  degToRad,
  radToDeg,
  wrapPi,
  wrapTwoPi,
} from './angle';
import { err } from './result';
import { wrappedDifferenceRad } from './test-support/angle-compare';
import { unwrapOk } from './test-support/result-helpers';

const deg = (angleDeg: number): number => unwrapOk(degToRad(angleDeg));

describe('wrapTwoPi', () => {
  it('keeps 0 and maps -0 to +0', () => {
    expect(wrapTwoPi(0)).toStrictEqual({ ok: true, value: 0 });
    expect(Object.is(unwrapOk(wrapTwoPi(-0)), 0)).toBe(true);
  });

  it('maps 2π and -2π to 0, so the result is never 2π', () => {
    expect(unwrapOk(wrapTwoPi(TWO_PI_RAD))).toBe(0);
    expect(unwrapOk(wrapTwoPi(-TWO_PI_RAD))).toBe(0);
  });

  it('maps π and -π to π', () => {
    expect(unwrapOk(wrapTwoPi(Math.PI))).toBe(Math.PI);
    expect(unwrapOk(wrapTwoPi(-Math.PI))).toBe(Math.PI);
  });

  it('maps 3π to π and -π/2 to 3π/2', () => {
    expect(wrappedDifferenceRad(unwrapOk(wrapTwoPi(3 * Math.PI)), Math.PI)).toBeCloseTo(0, 12);
    expect(unwrapOk(wrapTwoPi(-Math.PI / 2))).toBeCloseTo((3 * Math.PI) / 2, 12);
  });

  it('keeps a tiny negative angle inside [0, 2π)', () => {
    const wrappedRad = unwrapOk(wrapTwoPi(-1e-20));
    expect(wrappedRad).toBeGreaterThanOrEqual(0);
    expect(wrappedRad).toBeLessThan(TWO_PI_RAD);
    expect(Math.abs(wrappedDifferenceRad(wrappedRad, 0))).toBeLessThan(1e-12);
  });

  it('wraps large multiples of 2π back to 0', () => {
    for (const periods of [1000, -1000, 159154]) {
      const wrappedRad = unwrapOk(wrapTwoPi(periods * TWO_PI_RAD));
      expect(wrappedRad).toBeGreaterThanOrEqual(0);
      expect(wrappedRad).toBeLessThan(TWO_PI_RAD);
      expect(Math.abs(wrappedDifferenceRad(wrappedRad, 0))).toBeLessThan(1e-9);
    }
  });
});

// Regression for a precision bug found by P-6.5 (task 10): wrapping by `(x % 2π + 2π) % 2π`
// adds 2π first, so a small result was rounded to a multiple of ulp(2π) ≈ 8.9e-16 rad. That
// quantised longitudes near 0 in destinationPosition to about 5.7e-9 m, enough to break the
// finite-difference check of Req 6.5 at a 50 m range.
describe('wrapping keeps full precision for small angles', () => {
  it.each([1e-17, 3e-16, -3e-16, 1e-300, -2.5e-12])(
    'wrapPi(%s) is the angle itself',
    (angleRad) => {
      expect(Math.abs(unwrapOk(wrapPi(angleRad)) - angleRad)).toBeLessThanOrEqual(
        Math.abs(angleRad) * Number.EPSILON,
      );
    },
  );

  it.each([1e-17, 3e-16, 1e-300])('wrapTwoPi(%s) is the angle itself', (angleRad) => {
    expect(Math.abs(unwrapOk(wrapTwoPi(angleRad)) - angleRad)).toBeLessThanOrEqual(
      angleRad * Number.EPSILON,
    );
  });

  it('wrapPi of 2π plus a small angle keeps the small angle to the precision of 2π', () => {
    const wrappedRad = unwrapOk(wrapPi(TWO_PI_RAD + 1e-10));
    expect(Math.abs(wrappedRad - 1e-10)).toBeLessThan(1e-15);
  });

  it('angularDifference of two small angles is their exact difference', () => {
    expect(unwrapOk(angularDifference(3e-16, 1e-16))).toBeCloseTo(2e-16, 30);
    expect(unwrapOk(angularDifference(-1e-17, 0))).toBeCloseTo(-1e-17, 32);
  });
});

describe('wrapPi', () => {
  it('maps π to π and -π to π, so the interval is (-π, π]', () => {
    expect(unwrapOk(wrapPi(Math.PI))).toBe(Math.PI);
    expect(unwrapOk(wrapPi(-Math.PI))).toBe(Math.PI);
  });

  it('maps 2π to 0', () => {
    expect(unwrapOk(wrapPi(TWO_PI_RAD))).toBe(0);
  });

  it('maps 3π/2 to -π/2 and -3π/2 to π/2', () => {
    expect(unwrapOk(wrapPi((3 * Math.PI) / 2))).toBeCloseTo(-Math.PI / 2, 12);
    expect(unwrapOk(wrapPi((-3 * Math.PI) / 2))).toBeCloseTo(Math.PI / 2, 12);
  });

  it('maps an angle just above π to just above -π, never to -π', () => {
    const wrappedRad = unwrapOk(wrapPi(Math.PI + 1e-9));
    expect(wrappedRad).toBeGreaterThan(-Math.PI);
    expect(wrappedRad).toBeCloseTo(-Math.PI + 1e-9, 12);
  });
});

describe('angularDifference', () => {
  it('is the signed shortest rotation from b to a', () => {
    expect(unwrapOk(angularDifference(deg(10), deg(350)))).toBeCloseTo(deg(20), 12);
    expect(unwrapOk(angularDifference(deg(350), deg(10)))).toBeCloseTo(deg(-20), 12);
    expect(unwrapOk(angularDifference(deg(90), deg(45)))).toBeCloseTo(deg(45), 12);
  });

  it('returns π, not -π, for opposite directions in both orders', () => {
    expect(unwrapOk(angularDifference(Math.PI, 0))).toBe(Math.PI);
    expect(unwrapOk(angularDifference(0, Math.PI))).toBe(Math.PI);
  });

  it('is 0 for angles a full turn apart', () => {
    expect(Math.abs(unwrapOk(angularDifference(TWO_PI_RAD + 0.3, 0.3)))).toBeLessThan(1e-12);
  });

  it('does not overflow for finite angles at the limit of the double range', () => {
    const result = angularDifference(Number.MAX_VALUE, -Number.MAX_VALUE);
    expect(result.ok).toBe(true);
    const differenceRad = unwrapOk(result);
    expect(Number.isFinite(differenceRad)).toBe(true);
    expect(differenceRad).toBeGreaterThan(-Math.PI);
    expect(differenceRad).toBeLessThanOrEqual(Math.PI);
  });

  // Req 1.4 excludes differences within 1e-9 rad of π, because there the negative of the
  // difference lies outside (-π, π] and wraps to +π as well.
  it('is not antisymmetric at exactly π, which is why Req 1.4 excludes that neighbourhood', () => {
    const forward = unwrapOk(angularDifference(Math.PI, 0));
    const backward = unwrapOk(angularDifference(0, Math.PI));
    expect(forward + backward).toBeCloseTo(TWO_PI_RAD, 12);
  });

  it('is antisymmetric just outside the excluded neighbourhood', () => {
    const aRad = Math.PI - 2e-9;
    const forward = unwrapOk(angularDifference(aRad, 0));
    const backward = unwrapOk(angularDifference(0, aRad));
    expect(Math.abs(forward + backward)).toBeLessThan(1e-9);
    expect(forward).toBeCloseTo(aRad, 12);
  });
});

describe('degToRad and radToDeg', () => {
  it('converts known values', () => {
    expect(unwrapOk(degToRad(180))).toBeCloseTo(Math.PI, 14);
    expect(unwrapOk(degToRad(90))).toBeCloseTo(Math.PI / 2, 14);
    expect(unwrapOk(degToRad(-45))).toBeCloseTo(-Math.PI / 4, 14);
    expect(unwrapOk(radToDeg(Math.PI))).toBeCloseTo(180, 12);
    expect(unwrapOk(radToDeg(Math.PI / 6))).toBeCloseTo(30, 12);
  });

  it('fails with invalid_number instead of returning an infinity on overflow', () => {
    // 1e307 rad is finite, but 1e307 * 180/π is not.
    expect(radToDeg(1e307)).toStrictEqual(err('invalid_number'));
    expect(degToRad(Number.MAX_VALUE).ok).toBe(true);
  });
});

describe('circularMean', () => {
  it('returns the mean direction of angles on one side of 0', () => {
    expect(unwrapOk(circularMean([deg(10), deg(20)]))).toBeCloseTo(deg(15), 12);
  });

  it('returns a value in [0, 2π)', () => {
    const meanRad = unwrapOk(circularMean([deg(350), deg(355)]));
    expect(meanRad).toBeGreaterThanOrEqual(0);
    expect(meanRad).toBeLessThan(TWO_PI_RAD);
    expect(meanRad).toBeCloseTo(deg(352.5), 12);
  });

  it('gives 0 for 350° and 10°, not the arithmetic mean of 180°', () => {
    const meanRad = unwrapOk(circularMean([deg(350), deg(10)]));
    expect(Math.abs(wrappedDifferenceRad(meanRad, 0))).toBeLessThan(1e-12);
    expect(Math.abs(wrappedDifferenceRad(meanRad, Math.PI))).toBeGreaterThan(3);
  });

  it('wraps the mean of a single angle', () => {
    expect(unwrapOk(circularMean([-Math.PI / 2]))).toBeCloseTo((3 * Math.PI) / 2, 12);
  });

  it('fails with undefined_mean for opposite angles', () => {
    expect(circularMean([0, Math.PI])).toStrictEqual(err('undefined_mean'));
  });

  it('fails with undefined_mean for angles spread evenly around the circle', () => {
    const evenlySpacedRad = [0, TWO_PI_RAD / 3, (2 * TWO_PI_RAD) / 3];
    expect(circularMean(evenlySpacedRad)).toStrictEqual(err('undefined_mean'));
  });

  it('fails with undefined_mean for an empty list', () => {
    expect(circularMean([])).toStrictEqual(err('undefined_mean'));
  });

  // Two unit vectors π - δ apart have mean resultant length sin(δ/2) ≈ δ/2.
  it('fails just below a mean resultant length of 1e-9 and succeeds just above it', () => {
    expect(circularMean([0, Math.PI - 1e-9])).toStrictEqual(err('undefined_mean'));
    expect(circularMean([0, Math.PI - 4e-9]).ok).toBe(true);
  });
});

describe('invalid_number', () => {
  const invalidValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const failure = { ok: false, reason: 'invalid_number' } as const;

  it.each(invalidValues)('is returned by every angle function for %s', (invalidValue) => {
    expect(wrapTwoPi(invalidValue)).toStrictEqual(failure);
    expect(wrapPi(invalidValue)).toStrictEqual(failure);
    expect(angularDifference(invalidValue, 0)).toStrictEqual(failure);
    expect(angularDifference(0, invalidValue)).toStrictEqual(failure);
    expect(degToRad(invalidValue)).toStrictEqual(failure);
    expect(radToDeg(invalidValue)).toStrictEqual(failure);
    expect(circularMean([invalidValue])).toStrictEqual(failure);
    expect(circularMean([0, 1, invalidValue])).toStrictEqual(failure);
  });
});
