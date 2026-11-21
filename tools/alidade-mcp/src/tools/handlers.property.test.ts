import {
  degToRad,
  destinationPosition,
  greatCircleDistanceM,
  radToDeg,
  wrapTwoPi,
} from '@alidade/core';
import { declinationAt } from '@alidade/sensors';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../messages.ts';
import { findNonFinite, type Outcome } from '../outcome.ts';
import {
  bearingFrom,
  FIRE,
  placeOf,
  positionOf,
  unwrap,
  type Place,
  type Post,
} from '../synthetic.testkit.ts';
import { TOOLS } from '../tools.ts';
import { runFixFromBearings } from './fix-from-bearings.ts';
import { runLocalOffset } from './local-offset.ts';
import { runMagneticDeclination } from './magnetic-declination.ts';

const NUM_RUNS = 200;

/**
 * Hostile numbers: the values a client can send that a naive handler turns into NaN or Infinity.
 * `1e999` is what `JSON.parse` makes of a number too large for a double.
 */
const hostileNumberArb = fc.oneof(
  { weight: 4, arbitrary: fc.double({ noNaN: false }) },
  { weight: 2, arbitrary: fc.integer({ min: -1000, max: 1000 }) },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      NaN,
      Infinity,
      -Infinity,
      -0,
      0,
      1e308,
      -1e308,
      5e-324,
      Number.MAX_SAFE_INTEGER,
      360,
      -360,
      90,
      -90,
      180,
      89.9999,
    ),
  },
);

/** Hostile strings: empty, very long, and with control characters. */
const hostileStringArb = fc.oneof(
  fc.string(),
  fc.constant(''),
  fc.string({ minLength: 100, maxLength: 300 }),
  fc.string({ unit: 'binary', maxLength: 20 }),
);

/** A value of any JSON shape. */
const jsonArb = fc.jsonValue();

const hostilePlaceArb = fc.record({ latDeg: hostileNumberArb, lonDeg: hostileNumberArb });

/** A bearing with the right field names and hostile values. */
const hostileBearingArb = fc.record({
  id: hostileStringArb,
  observer: hostilePlaceArb,
  positionAccuracyM: hostileNumberArb,
  timeUtcMs: hostileNumberArb,
  azimuthDeg: hostileNumberArb,
  azimuthSigmaDeg: hostileNumberArb,
});

const hostileFixArgsArb = fc.record(
  {
    bearings: fc.array(hostileBearingArb, { maxLength: 6 }),
    outlierRejection: fc.oneof(fc.boolean(), jsonArb),
  },
  { requiredKeys: [] },
);

const hostileDeclinationArgsArb = fc.record(
  { latDeg: hostileNumberArb, lonDeg: hostileNumberArb, timeUtcMs: hostileNumberArb },
  { requiredKeys: [] },
);

const hostileOffsetArgsArb = fc.record(
  {
    direction: fc.oneof(fc.constantFrom('to_offset', 'to_position'), hostileStringArb),
    origin: hostilePlaceArb,
    position: hostilePlaceArb,
    eastM: hostileNumberArb,
    northM: hostileNumberArb,
  },
  { requiredKeys: [] },
);

function expectWellFormed(outcome: Outcome): void {
  expect(typeof outcome).toBe('object');
  expect(findNonFinite(outcome)).toBe(false);
  expect(JSON.parse(JSON.stringify(outcome))).toStrictEqual(outcome);
  if (!outcome.ok) {
    const failure = outcome as { reason: string; message: string };
    expect(Object.keys(MESSAGES)).toContain(failure.reason);
    expect(failure.message).toBe(MESSAGES[failure.reason as keyof typeof MESSAGES]);
  }
}

const HANDLERS: readonly [string, (args: unknown) => Outcome, fc.Arbitrary<unknown>][] = [
  ['fix_from_bearings', runFixFromBearings, hostileFixArgsArb],
  ['magnetic_declination', runMagneticDeclination, hostileDeclinationArgsArb],
  ['local_offset', runLocalOffset, hostileOffsetArgsArb],
];

describe('hostile input never produces a non-finite number or a crash (Req 6.6)', () => {
  // Property: for all hostile arguments (any JSON value; and the right shape with hostile numbers
  // and strings), each handler returns without throwing an outcome whose numbers are all finite,
  // and a failure carries a reason from the table with its words. Validates Req 6.5, 6.6.
  // Domain: nothing is excluded; the number generator includes NaN, ±Infinity, -0, ±1e308, 5e-324.
  it.each(HANDLERS)('%s', (_name, handler, shapedArb) => {
    fc.assert(
      fc.property(
        fc.oneof(jsonArb, shapedArb, fc.constantFrom(undefined, NaN, Infinity)),
        (args) => {
          expectWellFormed(handler(args));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('is also true through the registry’s handlers', () => {
    for (const tool of TOOLS) {
      fc.assert(
        fc.property(jsonArb, (args) => {
          expectWellFormed(tool.handler(args));
        }),
        { numRuns: NUM_RUNS },
      );
    }
  });
});

describe('fix_from_bearings finds a known target (Req 6.7)', () => {
  /**
   * Domain: a target between 60° S and 60° N and 179° W to 179° E; 2 to 4 posts 2 000 m to
   * 30 000 m from it; the first post at any azimuth, the second 40° to 140° away from it (so the
   * lines cross at no less than 40°), the others anywhere; sigma 0.5° to 3°; no noise.
   * Excluded: targets near the poles (unsupported by Core) and crossings under 40°, which are
   * example tests (poor geometry, parallel lines) in fix-from-bearings.test.ts.
   */
  const sceneArb = fc.record({
    target: fc.record({
      latDeg: fc.double({ min: -60, max: 60, noNaN: true }),
      lonDeg: fc.double({ min: -179, max: 179, noNaN: true }),
    }),
    first: fc.double({ min: 0, max: 360, noNaN: true, maxExcluded: true }),
    gap: fc.double({ min: 40, max: 140, noNaN: true }),
    others: fc.array(fc.double({ min: 0, max: 360, noNaN: true, maxExcluded: true }), {
      maxLength: 2,
    }),
    distances: fc.array(fc.double({ min: 2000, max: 30000, noNaN: true }), {
      minLength: 4,
      maxLength: 4,
    }),
    sigmaDeg: fc.double({ min: 0.5, max: 3, noNaN: true }),
  });

  // Property: the position returned is within 1 m of the target. Validates Req 6.1, 6.7.
  it('returns a position within 1 m of the target', () => {
    fc.assert(
      fc.property(sceneArb, (scene) => {
        const azimuths = [scene.first, scene.first + scene.gap, ...scene.others].map(
          (a) => a % 360,
        );
        const posts: Post[] = azimuths.map((fromFireDeg, i) => ({
          id: `p${i}`,
          fromFireDeg,
          distanceM: scene.distances[i] ?? 5000,
        }));
        const bearings = posts.map((post) => bearingFrom(scene.target, post, scene.sigmaDeg));
        const outcome = runFixFromBearings({ bearings });
        expect(outcome.ok).toBe(true);
        const place = (outcome as unknown as { position: Place }).position;
        expect(
          unwrap(greatCircleDistanceM(positionOf(place), positionOf(scene.target))),
        ).toBeLessThan(1);
        expectWellFormed(outcome);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is the fire of the README for the fixed scene', () => {
    expect(FIRE).toStrictEqual({ latDeg: 30, lonDeg: -40 });
  });
});

describe('magnetic_declination equals Sensors’ model (Req 6.7)', () => {
  // Property: for all positions within 75° of the equator and times from 2026 to 2029, the answer
  // is either the model’s declination in degrees or declination_unknown. Validates Req 6.2, 6.7.
  // Domain: |lat| ≤ 75°, any longitude, 2026-01-01 to 2029-12-31 UTC. Excluded: the poles and the
  // dates outside the model's validity, which are example tests.
  it('equals declinationAt converted to degrees', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -75, max: 75, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2029, 11, 31) }),
        (latDeg, lonDeg, timeUtcMs) => {
          const outcome = runMagneticDeclination({ latDeg, lonDeg, timeUtcMs });
          const expected = declinationAt(positionOf({ latDeg, lonDeg }), timeUtcMs);
          if (expected.ok) {
            expect(outcome).toStrictEqual({
              ok: true,
              declinationDeg: unwrap(radToDeg(expected.value.declinationRad)),
              sigmaDeg: unwrap(radToDeg(expected.value.sigmaRad)),
              positiveEast: true,
            });
          } else {
            expect(outcome).toMatchObject({ ok: false, reason: expected.reason });
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('local_offset round trip (Req 6.7)', () => {
  // Property: to_position then to_offset returns the offset within 1e-6 m. Validates Req 6.3, 6.7.
  // Domain: origin |lat| ≤ 80°, any longitude; east and north offsets within ±100 km. Excluded:
  // the poles and offsets over 100 km (the Local plane is for short distances).
  it('to_position then to_offset gives back the offset', () => {
    fc.assert(
      fc.property(
        fc.record({
          latDeg: fc.double({ min: -80, max: 80, noNaN: true }),
          lonDeg: fc.double({ min: -179, max: 179, noNaN: true }),
        }),
        fc.double({ min: -100_000, max: 100_000, noNaN: true }),
        fc.double({ min: -100_000, max: 100_000, noNaN: true }),
        (origin, eastM, northM) => {
          const there = runLocalOffset({ direction: 'to_position', origin, eastM, northM });
          expect(there.ok).toBe(true);
          const position = (there as unknown as { position: Place }).position;
          const back = runLocalOffset({ direction: 'to_offset', origin, position });
          expect(back.ok).toBe(true);
          const result = back as unknown as { eastM: number; northM: number };
          expect(Math.hypot(result.eastM - eastM, result.northM - northM)).toBeLessThan(1e-6);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('uses the Core functions it claims to (a sanity check of the destination formula)', () => {
    const origin = positionOf({ latDeg: 10, lonDeg: 20 });
    const moved = unwrap(
      destinationPosition(origin, unwrap(wrapTwoPi(unwrap(degToRad(90)))), 1000),
    );
    const outcome = runLocalOffset({
      direction: 'to_offset',
      origin: placeOf(origin),
      position: placeOf(moved),
    });
    expect((outcome as unknown as { eastM: number }).eastM).toBeCloseTo(1000, 3);
  });
});
