import { CONFIDENCE_95_SCALE, degToRad, greatCircleDistanceM } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../messages.ts';
import { findNonFinite, type Outcome } from '../outcome.ts';
import { bearingFrom, FIRE, fixArgs, positionOf, unwrap, type Post } from '../synthetic.testkit.ts';
import { runFixFromBearings } from './fix-from-bearings.ts';

function field(outcome: Outcome, ...path: string[]): unknown {
  let current: unknown = outcome;
  for (const key of path) current = (current as Record<string, unknown> | undefined)?.[key];
  return current;
}

function distanceToFireM(outcome: Outcome): number {
  const place = field(outcome, 'position') as { latDeg: number; lonDeg: number };
  return unwrap(greatCircleDistanceM(positionOf(place), positionOf(FIRE)));
}

describe('fix_from_bearings: a synthetic fire seen from two posts (Req 6.1, 6.7)', () => {
  const outcome = runFixFromBearings(fixArgs());

  it('finds the fire within 1 m', () => {
    expect(outcome.ok).toBe(true);
    expect(distanceToFireM(outcome)).toBeLessThan(1);
  });

  it('never returns a fix without its covariance and both ellipses', () => {
    expect(field(outcome, 'covarianceEnM2')).toMatchObject({
      varEastM2: expect.any(Number),
      varNorthM2: expect.any(Number),
      covEastNorthM2: expect.any(Number),
    });
    for (const name of ['ellipse1Sigma', 'ellipse95']) {
      expect(field(outcome, name)).toMatchObject({
        semiMajorM: expect.any(Number),
        semiMinorM: expect.any(Number),
        azimuthDeg: expect.any(Number),
      });
    }
  });

  it('computes the 95 % ellipse with Core’s scale, never a copy', () => {
    expect(field(outcome, 'ellipse95Scale')).toBe(CONFIDENCE_95_SCALE);
    const one = field(outcome, 'ellipse1Sigma', 'semiMajorM') as number;
    const ninetyFive = field(outcome, 'ellipse95', 'semiMajorM') as number;
    expect(ninetyFive / one).toBeCloseTo(CONFIDENCE_95_SCALE, 10);
    expect(field(outcome, 'ellipse95', 'semiMinorM') as number).toBeGreaterThan(0);
  });

  it('reports the residuals of the used bearings, the warnings, the exclusions and the iterations', () => {
    const residuals = field(outcome, 'residuals') as { id: string }[];
    expect(residuals.map((r) => r.id).sort()).toStrictEqual(['post-south', 'post-west']);
    expect(residuals[0]).toMatchObject({
      residualDeg: expect.any(Number),
      normalisedResidual: expect.any(Number),
      studentisedResidual: expect.any(Number),
    });
    expect(field(outcome, 'warnings')).toStrictEqual([]);
    expect(field(outcome, 'excludedIds')).toStrictEqual([]);
    expect(field(outcome, 'iterations') as number).toBeGreaterThanOrEqual(1);
  });

  it('answers in plain JSON with every number finite', () => {
    expect(findNonFinite(outcome)).toBe(false);
    expect(JSON.parse(JSON.stringify(outcome))).toStrictEqual(outcome);
  });
});

describe('fix_from_bearings: warnings and outliers', () => {
  const SIX: readonly Post[] = [0, 60, 120, 180, 240, 300].map((azimuth) => ({
    id: `post-${azimuth}`,
    fromFireDeg: azimuth,
    distanceM: 4000,
  }));

  it('excludes a bearing that is 25° wrong when outlier rejection is asked for', () => {
    const bearings = SIX.map((post, index) => bearingFrom(FIRE, post, 1, index === 2 ? 25 : 0));
    const outcome = runFixFromBearings({ bearings, outlierRejection: true });
    expect(outcome.ok).toBe(true);
    expect(field(outcome, 'excludedIds')).toStrictEqual(['post-120']);
    expect(field(outcome, 'warnings')).toContain('outliers_excluded');
    expect(distanceToFireM(outcome)).toBeLessThan(1);
  });

  it('keeps every bearing when outlier rejection is not asked for', () => {
    const bearings = SIX.map((post, index) => bearingFrom(FIRE, post, 1, index === 2 ? 25 : 0));
    const outcome = runFixFromBearings({ bearings });
    expect(field(outcome, 'excludedIds')).toStrictEqual([]);
  });

  it('warns of poor geometry when two posts see the fire at a small angle', () => {
    const posts: Post[] = [
      { id: 'a', fromFireDeg: 270, distanceM: 5000 },
      { id: 'b', fromFireDeg: 280, distanceM: 6000 },
    ];
    const outcome = runFixFromBearings(fixArgs(posts));
    expect(outcome.ok).toBe(true);
    expect(field(outcome, 'warnings')).toContain('poor_geometry');
  });
});

describe('fix_from_bearings: arguments are checked first (Req 6.5)', () => {
  const good = fixArgs();
  const withBearing = (change: (b: Record<string, unknown>) => void, count = 2) => {
    const bearings = fixArgs().bearings.map((b) => ({ ...b, observer: { ...b.observer } }));
    change(bearings[0] as unknown as Record<string, unknown>);
    return { bearings: bearings.slice(0, count) };
  };

  it.each([
    ['not an object', 5, ''],
    ['no bearings', {}, 'bearings'],
    ['bearings not an array', { bearings: 'x' }, 'bearings'],
    ['one bearing', { bearings: good.bearings.slice(0, 1) }, 'bearings'],
    ['an unknown top-level field', { ...good, extra: 1 }, 'extra'],
    ['outlierRejection not a boolean', { ...good, outlierRejection: 'yes' }, 'outlierRejection'],
    ['an unknown field of a bearing', withBearing((b) => (b['extra'] = 1)), 'bearings[0].extra'],
    [
      'an azimuth as a string',
      withBearing((b) => (b['azimuthDeg'] = '90')),
      'bearings[0].azimuthDeg',
    ],
    ['an empty id', withBearing((b) => (b['id'] = '')), 'bearings[0].id'],
    ['an id of 129 characters', withBearing((b) => (b['id'] = 'x'.repeat(129))), 'bearings[0].id'],
    ['a missing observer', withBearing((b) => delete b['observer']), 'bearings[0].observer'],
    [
      'an observer field missing',
      withBearing((b) => delete (b['observer'] as Record<string, unknown>)['lonDeg']),
      'bearings[0].observer.lonDeg',
    ],
    ['an infinite time', withBearing((b) => (b['timeUtcMs'] = Infinity)), 'bearings[0].timeUtcMs'],
    [
      'a NaN accuracy',
      withBearing((b) => (b['positionAccuracyM'] = NaN)),
      'bearings[0].positionAccuracyM',
    ],
  ])('refuses %s, naming the field', (_name, args, expectedField) => {
    const outcome = runFixFromBearings(args);
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid_arguments' });
    expect(field(outcome, 'field') ?? '').toBe(expectedField);
    expect(field(outcome, 'message')).toBe(MESSAGES.invalid_arguments);
  });

  it('accepts 2 and 64 bearings and refuses 65', () => {
    const many = (count: number) => ({
      bearings: Array.from({ length: count }, (_, i) => ({
        ...good.bearings[i % 2],
        id: `b${i}`,
      })),
    });
    expect(field(runFixFromBearings(many(65)), 'field')).toBe('bearings');
    expect(field(runFixFromBearings(many(64)), 'reason')).not.toBe('invalid_arguments');
    expect(field(runFixFromBearings(many(2)), 'reason')).not.toBe('invalid_arguments');
  });
});

describe('fix_from_bearings: failures of the skeleton come back with their reason and words', () => {
  function failure(args: unknown): {
    reason: string;
    message: string;
    field?: string;
    id?: string;
  } {
    const outcome = runFixFromBearings(args);
    expect(outcome.ok).toBe(false);
    const reason = String(field(outcome, 'reason'));
    expect(field(outcome, 'message')).toBe(MESSAGES[reason as keyof typeof MESSAGES]);
    return outcome as unknown as { reason: string; message: string; field?: string; id?: string };
  }

  it('names the bearing whose sigma is out of range', () => {
    const args = fixArgs();
    const second = { ...args.bearings[1], azimuthSigmaDeg: 0 };
    const result = failure({ bearings: [args.bearings[0], second] });
    expect(result.reason).toBe('invalid_observation');
    expect(result.id).toBe('post-south');
  });

  it('refuses an observer within 1° of a pole', () => {
    const args = fixArgs();
    const near = { ...args.bearings[0], observer: { latDeg: 89.5, lonDeg: 0 } };
    expect(['unsupported_position', 'invalid_observation']).toContain(
      failure({ bearings: [near, args.bearings[1]] }).reason,
    );
  });

  it('refuses an azimuth of 400°', () => {
    const args = fixArgs();
    failure({ bearings: [{ ...args.bearings[0], azimuthDeg: 400 }, args.bearings[1]] });
  });

  it('refuses two bearings with the same id', () => {
    const args = fixArgs();
    failure({ bearings: [args.bearings[0], { ...args.bearings[1], id: 'post-west' }] });
  });

  it('refuses two observers at the same place', () => {
    const args = fixArgs();
    const same = { ...args.bearings[1], observer: args.bearings[0]?.observer };
    expect(['colocated_observers', 'singular_geometry', 'diverging_bearings']).toContain(
      failure({ bearings: [args.bearings[0], same] }).reason,
    );
  });

  it('refuses two parallel lines of sight', () => {
    const a = bearingFrom(FIRE, { id: 'a', fromFireDeg: 270, distanceM: 5000 }, 1);
    const b = {
      ...a,
      id: 'b',
      observer: { latDeg: a.observer.latDeg + 0.01, lonDeg: a.observer.lonDeg },
    };
    failure({ bearings: [a, b] });
    expect(unwrap(degToRad(a.azimuthDeg))).toBeGreaterThan(0);
  });
});
