import { degToRad, projectToLocalPlane } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../messages.ts';
import type { Outcome } from '../outcome.ts';
import { positionOf, unwrap } from '../synthetic.testkit.ts';
import { runLocalOffset } from './local-offset.ts';

function field(outcome: Outcome, ...path: string[]): unknown {
  let current: unknown = outcome;
  for (const key of path) current = (current as Record<string, unknown> | undefined)?.[key];
  return current;
}

const ORIGIN = { latDeg: 30, lonDeg: -40 };

describe('local_offset to_offset (Req 6.3)', () => {
  it('gives east and north metres equal to Core’s Local plane', () => {
    const position = { latDeg: 30.01, lonDeg: -39.98 };
    const outcome = runLocalOffset({ direction: 'to_offset', origin: ORIGIN, position });
    const expected = unwrap(projectToLocalPlane(positionOf(ORIGIN), positionOf(position)));
    expect(outcome).toStrictEqual({ ok: true, eastM: expected.eastM, northM: expected.northM });
  });

  it('is 1 111.95 m per hundredth of a degree of latitude, due north', () => {
    const outcome = runLocalOffset({
      direction: 'to_offset',
      origin: { latDeg: 0, lonDeg: 0 },
      position: { latDeg: 0.01, lonDeg: 0 },
    });
    const metresPerDegree = 6_371_008.8 * unwrap(degToRad(1));
    expect(field(outcome, 'northM') as number).toBeCloseTo(0.01 * metresPerDegree, 6);
    expect(Math.abs(field(outcome, 'eastM') as number)).toBeLessThan(1e-6);
  });

  it('is due east for a position on the same parallel at the equator', () => {
    const outcome = runLocalOffset({
      direction: 'to_offset',
      origin: { latDeg: 0, lonDeg: 0 },
      position: { latDeg: 0, lonDeg: 0.01 },
    });
    expect(field(outcome, 'eastM') as number).toBeCloseTo(1111.95, 1);
    expect(Math.abs(field(outcome, 'northM') as number)).toBeLessThan(1e-6);
  });
});

describe('local_offset to_position (Req 6.3)', () => {
  it('is the inverse of to_offset within 1e-6 m', () => {
    const back = runLocalOffset({
      direction: 'to_position',
      origin: ORIGIN,
      eastM: 1234.5,
      northM: -2345.6,
    });
    expect(back.ok).toBe(true);
    const again = runLocalOffset({
      direction: 'to_offset',
      origin: ORIGIN,
      position: field(back, 'position'),
    });
    expect(field(again, 'eastM') as number).toBeCloseTo(1234.5, 6);
    expect(field(again, 'northM') as number).toBeCloseTo(-2345.6, 6);
  });

  it('gives the origin for a zero offset', () => {
    const outcome = runLocalOffset({
      direction: 'to_position',
      origin: ORIGIN,
      eastM: 0,
      northM: 0,
    });
    const place = field(outcome, 'position') as { latDeg: number; lonDeg: number };
    // Degrees to radians and back is not bit-exact for every value: compare to 1e-10 degrees.
    expect(place.latDeg).toBeCloseTo(ORIGIN.latDeg, 10);
    expect(place.lonDeg).toBeCloseTo(ORIGIN.lonDeg, 10);
  });
});

describe('local_offset: arguments and failures (Req 6.5)', () => {
  const toOffset = {
    direction: 'to_offset',
    origin: ORIGIN,
    position: { latDeg: 30.1, lonDeg: -40 },
  };
  const toPosition = { direction: 'to_position', origin: ORIGIN, eastM: 10, northM: 20 };

  it.each([
    ['not an object', null, ''],
    ['a wrong direction', { ...toOffset, direction: 'sideways' }, 'direction'],
    ['no direction', { origin: ORIGIN }, 'direction'],
    ['no origin', { direction: 'to_offset' }, 'origin'],
    ['to_offset without a position', { direction: 'to_offset', origin: ORIGIN }, 'position'],
    ['to_offset with an offset', { ...toOffset, eastM: 1 }, 'eastM'],
    ['to_position with a position', { ...toPosition, position: ORIGIN }, 'position'],
    ['to_position without eastM', { direction: 'to_position', origin: ORIGIN, northM: 1 }, 'eastM'],
    [
      'to_position without northM',
      { direction: 'to_position', origin: ORIGIN, eastM: 1 },
      'northM',
    ],
    ['a string offset', { ...toPosition, eastM: '10' }, 'eastM'],
    ['a NaN offset', { ...toPosition, northM: NaN }, 'northM'],
    ['an unknown field', { ...toOffset, extra: 1 }, 'extra'],
    [
      'an unknown field of the origin',
      { ...toOffset, origin: { ...ORIGIN, alt: 1 } },
      'origin.alt',
    ],
  ])('refuses %s, naming the field', (_name, args, expectedField) => {
    const outcome = runLocalOffset(args);
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid_arguments' });
    expect(field(outcome, 'field') ?? '').toBe(expectedField);
  });

  it('passes on the skeleton’s reason and words for an origin within 1° of a pole', () => {
    const outcome = runLocalOffset({ ...toOffset, origin: { latDeg: 89.5, lonDeg: 0 } });
    expect(outcome).toMatchObject({ ok: false, reason: 'unsupported_position' });
    expect(field(outcome, 'message')).toBe(MESSAGES.unsupported_position);
  });

  it('refuses an offset beyond half the circumference of the sphere, which Core would wrap around', () => {
    for (const bad of [20_015_088, 1e300, -1e12]) {
      expect(runLocalOffset({ ...toPosition, eastM: bad })).toMatchObject({
        ok: false,
        reason: 'invalid_arguments',
        field: 'eastM',
      });
      expect(runLocalOffset({ ...toPosition, northM: bad })).toMatchObject({
        ok: false,
        reason: 'invalid_arguments',
        field: 'northM',
      });
    }
  });

  it('accepts an offset of exactly the limit, 20 015 087 m', () => {
    const outcome = runLocalOffset({ ...toPosition, eastM: 0, northM: 20_015_087 });
    expect(outcome).not.toMatchObject({ reason: 'invalid_arguments' });
    expect(JSON.stringify(outcome)).not.toMatch(/NaN|Infinity/);
  });
});
