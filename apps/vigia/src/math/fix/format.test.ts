import { describe, expect, it } from 'vitest';
import { fromDeg } from '../degrees';
import {
  accuracyText,
  axisWords,
  compassWord8,
  directionText,
  lengthText95,
  lengthTextNearest,
  METRES_PER_DEGREE,
  positionDecimals,
  positionText,
  savedLineText,
} from './format';

const rad = (deg: number): number => {
  const r = fromDeg(deg);
  if (!r.ok) throw new Error('fromDeg');
  return r.value;
};
const text = (r: { ok: boolean; value?: string }) => (r.ok ? r.value : null);

describe('METRES_PER_DEGREE (design §7.8)', () => {
  it('is Core\u2019s great-circle distance of one degree of latitude: R · π / 180 on the sphere of 6 371 008.8 m', () => {
    expect(Math.abs(METRES_PER_DEGREE - (6_371_008.8 * Math.PI) / 180)).toBeLessThan(1e-6);
  });
});

describe('lengthText95: an uncertainty, rounded up, never down (Req 6.2)', () => {
  const cases: readonly (readonly [number, string])[] = [
    [9.99, '10 m'],
    [10, '10 m'],
    [10.01, '20 m'],
    [994.9, '1.0 km'],
    [995, '1.0 km'],
    [999.99, '1.0 km'],
    [1000, '1.0 km'],
    [1000.01, '1.1 km'],
    [2041, '2.1 km'],
    [1e6, '1000.0 km'],
    [1e6 + 1, 'over 1000 km'],
    [0.001, '10 m'],
    // A length so small that dividing it by 10 underflows to 0: still at least the least step.
    [Number.MIN_VALUE, '10 m'],
    [1e-320, '10 m'],
    [990, '990 m'],
    [990.0001, '1.0 km'],
    [1100, '1.1 km'],
    [1100.0001, '1.2 km'],
  ];
  for (const [x, expected] of cases) {
    it(`writes ${x} m as ${expected}`, () => {
      expect(lengthText95(x)).toEqual({ ok: true, value: expected });
    });
  }

  it('fails with invalid_number for a length that is not finite or not above 0', () => {
    for (const bad of [0, -0, -1, Number.NaN, Infinity, -Infinity]) {
      expect(lengthText95(bad)).toEqual({ ok: false, reason: 'invalid_number', field: 'lengthM' });
    }
  });
});

describe('lengthTextNearest: a distance, to the nearest 10 m or 0.1 km (Req 6.4)', () => {
  const cases: readonly (readonly [number, string])[] = [
    [0, '0 m'],
    [4.9, '0 m'],
    [5, '10 m'],
    [994.9, '990 m'],
    [995, '1.0 km'],
    [1049.9, '1.0 km'],
    [1050, '1.1 km'],
    [3123, '3.1 km'],
    [1e6, '1000.0 km'],
    [1e6 + 1, 'over 1000 km'],
  ];
  for (const [x, expected] of cases) {
    it(`writes ${x} m as ${expected}`, () => {
      expect(lengthTextNearest(x)).toEqual({ ok: true, value: expected });
    });
  }

  it('fails with invalid_number for a distance that is not finite or below 0', () => {
    for (const bad of [-1, -Number.MIN_VALUE, Number.NaN, Infinity]) {
      expect(lengthTextNearest(bad)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'lengthM',
      });
    }
  });
});

describe('positionDecimals: no finer than 4, no coarser than the semi-minor axis (Req 6.2)', () => {
  const step = (d: number) => METRES_PER_DEGREE * 10 ** -d;

  it('is the smallest d whose step is at most the semi-minor axis, at each step and its neighbours', () => {
    for (let d = 0; d <= 4; d += 1) {
      const s = step(d);
      expect(positionDecimals(s), `at the step of ${d}`).toBe(d);
      expect(positionDecimals(s * (1 + 1e-12)), `just above the step of ${d}`).toBe(d);
      expect(positionDecimals(s * (1 - 1e-12)), `just below the step of ${d}`).toBe(
        Math.min(4, d + 1),
      );
    }
  });

  it('is 4 when no step is fine enough, and 0 for an axis of hundreds of kilometres', () => {
    expect(positionDecimals(0.1)).toBe(4);
    expect(positionDecimals(5)).toBe(4);
    expect(positionDecimals(11.2)).toBe(4);
    expect(positionDecimals(204)).toBe(3);
    expect(positionDecimals(1500)).toBe(2);
    expect(positionDecimals(1e7)).toBe(0);
  });

  it('is 4 for an axis that is not a positive finite number', () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) expect(positionDecimals(bad)).toBe(4);
  });
});

describe('positionText (Req 6.2, design §7.8)', () => {
  it('writes the position with hemisphere letters and the decimals of the semi-minor axis', () => {
    const position = { latRad: rad(30.123456), lonRad: rad(-40.056789) };
    expect(positionText(position, 204)).toMatchObject({
      ok: true,
      value: { text: '30.123° N, 40.057° W', decimals: 3 },
    });
    expect(positionText(position, 20)).toMatchObject({
      ok: true,
      value: { text: '30.1235° N, 40.0568° W' },
    });
    expect(positionText(position, 5000)).toMatchObject({
      ok: true,
      value: { text: '30.12° N, 40.06° W' },
    });
    expect(positionText(position, 2e5)).toMatchObject({
      ok: true,
      value: { text: '30° N, 40° W', decimals: 0 },
    });
  });

  it('writes the southern and eastern hemispheres, and zero as N and E, never with a minus sign', () => {
    expect(positionText({ latRad: rad(-12.5), lonRad: rad(140.25) }, 1500)).toMatchObject({
      ok: true,
      value: { text: '12.50° S, 140.25° E' },
    });
    expect(positionText({ latRad: rad(-0.00001), lonRad: rad(-0.00001) }, 1500)).toMatchObject({
      ok: true,
      value: { text: '0.00° N, 0.00° E' },
    });
    expect(positionText({ latRad: 0, lonRad: Math.PI }, 20)).toMatchObject({
      ok: true,
      value: { text: '0.0000° N, 180.0000° E' },
    });
  });

  it('gives the farthest the printed point can lie from the position: half a step on each axis', () => {
    const position = { latRad: rad(60), lonRad: rad(10) };
    const result = positionText(position, 204);
    if (!result.ok) throw new Error('failed');
    const step = METRES_PER_DEGREE * 1e-3;
    expect(result.value.printBoundM).toBeCloseTo(
      Math.hypot(0.5 * step, 0.5 * step * Math.cos(rad(60))),
      9,
    );
  });

  it('fails with unsupported_position for a position that is not Supported', () => {
    for (const p of [
      { latRad: rad(89.5), lonRad: 0 },
      { latRad: Number.NaN, lonRad: 0 },
      { latRad: 0, lonRad: -Math.PI },
    ]) {
      expect(positionText(p, 100)).toEqual({ ok: false, reason: 'unsupported_position' });
    }
  });
});

describe('compassWord8 (design §7.8)', () => {
  const word = (deg: number) => text(compassWord8(rad(deg)));
  it('turns at the boundaries of the eight sectors of 45°', () => {
    expect(word(22.4)).toBe('north');
    expect(word(22.5)).toBe('north-east');
    expect(word(337.4)).toBe('north-west');
    expect(word(337.5)).toBe('north');
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(word)).toEqual([
      'north',
      'north-east',
      'east',
      'south-east',
      'south',
      'south-west',
      'west',
      'north-west',
    ]);
  });

  it('wraps angles outside [0, 2π) and fails for an angle that is not finite', () => {
    expect(text(compassWord8(rad(-90)))).toBe('west');
    expect(text(compassWord8(rad(720 + 90)))).toBe('east');
    expect(compassWord8(Number.NaN)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'azimuthRad',
    });
  });
});

describe('axisWords: a line has no direction, so one axis reads one way (design §7.8)', () => {
  it('reduces the azimuth to [0°, 180°): 0°, 176°, 180° and 359° (the same axis, near north to south)', () => {
    expect(text(axisWords(0))).toBe('north to south (0°)');
    expect(text(axisWords(rad(176)))).toBe('north to south (176°)');
    expect(text(axisWords(rad(180)))).toBe('north to south (0°)');
    expect(text(axisWords(rad(359)))).toBe('north to south (179°)');
  });

  it('reads the same for an axis and its opposite end: x and x + 180°', () => {
    for (const deg of [0, 4, 30, 45, 60, 90, 100, 135, 170, 176]) {
      expect(text(axisWords(rad(deg + 180))), `${deg}`).toBe(text(axisWords(rad(deg))));
    }
  });

  it('names one of four axes, with the sector of 45° centred on each', () => {
    const word = (deg: number) => text(axisWords(rad(deg)));
    expect([0, 45, 90, 135].map(word)).toEqual([
      'north to south (0°)',
      'north-east to south-west (45°)',
      'east to west (90°)',
      'south-east to north-west (135°)',
    ]);
    expect([22, 23, 67, 68, 112, 113, 157, 158].map(word)).toEqual([
      'north to south (22°)',
      'north-east to south-west (23°)',
      'north-east to south-west (67°)',
      'east to west (68°)',
      'east to west (112°)',
      'south-east to north-west (113°)',
      'south-east to north-west (157°)',
      'north to south (158°)',
    ]);
    expect(word(225)).toBe('north-east to south-west (45°)');
    expect(word(315)).toBe('south-east to north-west (135°)');
  });

  it('writes the words of the angle that is printed: 179.6° rounds to 180°, which is the axis of 0°', () => {
    expect(text(axisWords(rad(179.6)))).toBe('north to south (0°)');
    expect(text(axisWords(rad(90.4)))).toBe('east to west (90°)');
  });

  it('wraps angles outside [0, 2π) and fails for an angle that is not finite', () => {
    expect(text(axisWords(rad(-4)))).toBe('north to south (176°)');
    expect(axisWords(Infinity)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'azimuthRad',
    });
  });
});

describe('directionText: a direction with its 1-sigma, the sigma rounded up (Req 3.6, 9.4)', () => {
  it('writes the azimuth to 0.1° and the sigma rounded up to 0.1°', () => {
    expect(text(directionText(rad(45.5), rad(2)))).toBe('45.5° ± 2.0°');
    expect(text(directionText(rad(45.5), rad(2.01)))).toBe('45.5° ± 2.1°');
    expect(text(directionText(rad(45.5), rad(1.95)))).toBe('45.5° ± 2.0°');
    expect(text(directionText(rad(359.96), rad(0.5)))).toBe('0.0° ± 0.5°');
    expect(text(directionText(rad(0.04), rad(0.01)))).toBe('0.0° ± 0.1°');
  });

  it('refuses an angle that is not finite, and a sigma that is not above 0', () => {
    expect(directionText(Number.NaN, rad(1))).toMatchObject({ ok: false, field: 'azimuthRad' });
    expect(directionText(1, 0)).toMatchObject({ ok: false, field: 'sigmaRad' });
    expect(directionText(1, Number.POSITIVE_INFINITY)).toMatchObject({
      ok: false,
      field: 'sigmaRad',
    });
  });

  // The shrunk counterexample of P-2.6 (task 13.3): a sigma this large was written in exponent
  // form. A sigma above half a turn says nothing about a direction and is refused.
  it('refuses a sigma above π: P-2.6 counterexample [-1800000, 17453292519943295000]', () => {
    expect(directionText(-1800000, 17453292519943295000)).toMatchObject({
      ok: false,
      field: 'sigmaRad',
    });
    expect(directionText(1, Math.PI).ok).toBe(true);
    expect(directionText(1, Math.PI * (1 + 1e-12))).toMatchObject({ ok: false, field: 'sigmaRad' });
  });
});

describe('accuracyText: a position accuracy, rounded up (Req 3.6, 9.4)', () => {
  it('writes whole metres rounded up below 1 000 m, and lengthText95 from there', () => {
    expect(text(accuracyText(8))).toBe('8 m');
    expect(text(accuracyText(7.2))).toBe('8 m');
    expect(text(accuracyText(0))).toBe('1 m');
    expect(text(accuracyText(999))).toBe('999 m');
    expect(text(accuracyText(999.5))).toBe('1.0 km');
    expect(text(accuracyText(2041))).toBe('2.1 km');
  });

  it('refuses an accuracy that is not finite or below 0', () => {
    expect(accuracyText(-1)).toMatchObject({ ok: false, field: 'accuracyM' });
    expect(accuracyText(Number.NaN)).toMatchObject({ ok: false, field: 'accuracyM' });
  });
});

// Task 23.5 (Req 4.11): "Sighting saved: <bearing> ± <sigma> (<North word>)".
describe('savedLineText (Req 4.11)', () => {
  it('writes the bearing, its sigma rounded up, and the North word', () => {
    expect(text(savedLineText(rad(45.5), rad(2)))).toBe('Sighting saved: 45.5° ± 2.0° (true)');
    expect(text(savedLineText(rad(359.96), rad(0.04)))).toBe('Sighting saved: 0.0° ± 0.1° (true)');
  });

  it('fails with invalid_number for an angle or a sigma that is not one', () => {
    for (const [a, sg] of [
      [Number.NaN, 0.1],
      [1, 0],
      [1, Number.POSITIVE_INFINITY],
    ] as const) {
      const r = savedLineText(a, sg);
      expect(r.ok).toBe(false);
    }
  });
});
