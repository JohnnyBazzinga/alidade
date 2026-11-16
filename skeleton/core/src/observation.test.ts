import { describe, expect, it } from 'vitest';
import { TWO_PI_RAD } from './angle';
import {
  MAX_AZIMUTH_SIGMA_RAD,
  MAX_POSITION_ACCURACY_M,
  MIN_AZIMUTH_SIGMA_RAD,
  parseBearing,
  serialiseBearing,
  validateBearing,
  type Bearing,
  type BearingWire,
} from './observation';
import { err } from './result';
import { unwrapOk } from './test-support/result-helpers';

const rad = (angleDeg: number): number => (angleDeg * Math.PI) / 180;

/** A sighting towards the south-west, 2° 1-sigma, 5 m position accuracy. */
const known: Bearing = {
  id: 'obs-1',
  observer: { latRad: rad(30.0000), lonRad: rad(-40.0000) },
  positionAccuracyM: 5,
  timeUtcMs: 1_763_193_600_000,
  azimuthRad: rad(225),
  azimuthSigmaRad: rad(2),
};

const withChange = (change: Partial<Bearing>): Bearing => ({ ...known, ...change });
const withObserver = (change: Partial<Bearing['observer']>): Bearing =>
  withChange({ observer: { ...known.observer, ...change } });

/** The failure for `field`; `id` is the observation id it names, or null when none is named. */
const invalid = (field: string, id: string | null = 'obs-1') =>
  err('invalid_observation', id === null ? { field } : { field, id });

describe('validateBearing', () => {
  it('accepts a valid bearing', () => {
    expect(validateBearing(known)).toStrictEqual({ ok: true, value: undefined });
  });

  it('accepts every boundary value', () => {
    for (const change of [
      { azimuthRad: 0 },
      { azimuthRad: TWO_PI_RAD - 1e-12 },
      { azimuthSigmaRad: MIN_AZIMUTH_SIGMA_RAD },
      { azimuthSigmaRad: MAX_AZIMUTH_SIGMA_RAD },
      { positionAccuracyM: 0 },
      { positionAccuracyM: MAX_POSITION_ACCURACY_M },
    ]) {
      expect(validateBearing(withChange(change))).toStrictEqual({ ok: true, value: undefined });
    }
    expect(validateBearing(withObserver({ lonRad: Math.PI })).ok).toBe(true);
    expect(validateBearing(withObserver({ latRad: rad(89) - 1e-12 })).ok).toBe(true);
  });

  it('names the limits: 0.01°, 45° and 10 000 m', () => {
    expect(MIN_AZIMUTH_SIGMA_RAD).toBeCloseTo(rad(0.01), 15);
    expect(MAX_AZIMUTH_SIGMA_RAD).toBeCloseTo(rad(45), 15);
    expect(MAX_POSITION_ACCURACY_M).toBe(10_000);
  });

  it.each([
    ['an empty id', withChange({ id: '' }), invalid('id', null)],
    ['a NaN observer latitude', withObserver({ latRad: Number.NaN }), invalid('observer.latRad')],
    [
      'an infinite observer longitude',
      withObserver({ lonRad: Number.POSITIVE_INFINITY }),
      invalid('observer.lonRad'),
    ],
    [
      'a NaN position accuracy',
      withChange({ positionAccuracyM: Number.NaN }),
      invalid('positionAccuracyM'),
    ],
    ['an infinite time', withChange({ timeUtcMs: Number.POSITIVE_INFINITY }), invalid('timeUtcMs')],
    ['a NaN azimuth', withChange({ azimuthRad: Number.NaN }), invalid('azimuthRad')],
    [
      'an infinite azimuth sigma',
      withChange({ azimuthSigmaRad: Number.NEGATIVE_INFINITY }),
      invalid('azimuthSigmaRad'),
    ],
    [
      'an observer latitude beyond 89°',
      withObserver({ latRad: rad(89.5) }),
      invalid('observer.latRad'),
    ],
    [
      'an observer latitude below -89°',
      withObserver({ latRad: rad(-89.5) }),
      invalid('observer.latRad'),
    ],
    [
      'an observer longitude beyond π',
      withObserver({ lonRad: Math.PI + 0.1 }),
      invalid('observer.lonRad'),
    ],
    ['an observer longitude of -π', withObserver({ lonRad: -Math.PI }), invalid('observer.lonRad')],
    ['a negative azimuth', withChange({ azimuthRad: -0.1 }), invalid('azimuthRad')],
    ['an azimuth of 2π', withChange({ azimuthRad: TWO_PI_RAD }), invalid('azimuthRad')],
    ['an azimuth of 7 rad', withChange({ azimuthRad: 7 }), invalid('azimuthRad')],
    [
      'an azimuth sigma below 0.01°',
      withChange({ azimuthSigmaRad: rad(0.009) }),
      invalid('azimuthSigmaRad'),
    ],
    ['an azimuth sigma of 0', withChange({ azimuthSigmaRad: 0 }), invalid('azimuthSigmaRad')],
    [
      'an azimuth sigma above 45°',
      withChange({ azimuthSigmaRad: rad(45.001) }),
      invalid('azimuthSigmaRad'),
    ],
    [
      'a negative position accuracy',
      withChange({ positionAccuracyM: -1 }),
      invalid('positionAccuracyM'),
    ],
    [
      'a position accuracy above 10 000 m',
      withChange({ positionAccuracyM: 10_000.001 }),
      invalid('positionAccuracyM'),
    ],
  ])('rejects %s, naming the field and the id', (_description, bearing, expected) => {
    expect(validateBearing(bearing)).toStrictEqual(expected);
  });

  it('reports a non-finite number before an out-of-range one (the documented check order)', () => {
    const bearing = withChange({
      observer: { latRad: rad(89.5), lonRad: 0 },
      azimuthRad: Number.NaN,
    });
    expect(validateBearing(bearing)).toStrictEqual(invalid('azimuthRad'));
    expect(validateBearing(withChange({ azimuthRad: 7, azimuthSigmaRad: 0 }))).toStrictEqual(
      invalid('azimuthRad'),
    );
  });
});

describe('serialiseBearing', () => {
  it('produces the version 1 wire shape for a known bearing', () => {
    const wire = unwrapOk(serialiseBearing(known));
    expect(Object.keys(wire).sort()).toStrictEqual(
      [
        'azimuthDeg',
        'azimuthSigmaDeg',
        'id',
        'kind',
        'observer',
        'positionAccuracyM',
        'timeUtcMs',
        'v',
      ].sort(),
    );
    expect(Object.keys(wire.observer).sort()).toStrictEqual(['latDeg', 'lonDeg']);
    expect(wire.v).toBe(1);
    expect(wire.kind).toBe('bearing');
    expect(wire.id).toBe('obs-1');
    expect(wire.observer.latDeg).toBeCloseTo(30.0000, 12);
    expect(wire.observer.lonDeg).toBeCloseTo(-40.0000, 12);
    expect(wire.positionAccuracyM).toBe(5);
    expect(wire.timeUtcMs).toBe(1_763_193_600_000);
    expect(wire.azimuthDeg).toBeCloseTo(225, 12);
    expect(wire.azimuthSigmaDeg).toBeCloseTo(2, 12);
  });

  it('is JSON, and the text parses back to a bearing', () => {
    const text = JSON.stringify(unwrapOk(serialiseBearing(known)));
    const parsed = unwrapOk(parseBearing(JSON.parse(text)));
    expect(parsed.id).toBe('obs-1');
    expect(parsed.azimuthRad).toBeCloseTo(known.azimuthRad, 12);
  });

  it('fails with invalid_observation, not a wire object with a NaN in it, for a NaN azimuth', () => {
    expect(serialiseBearing(withChange({ azimuthRad: Number.NaN }))).toStrictEqual(
      invalid('azimuthRad'),
    );
  });

  it('fails like validateBearing for any invalid bearing', () => {
    expect(serialiseBearing(withChange({ id: '' }))).toStrictEqual(invalid('id', null));
    expect(serialiseBearing(withObserver({ latRad: rad(89.5) }))).toStrictEqual(
      invalid('observer.latRad'),
    );
  });
});

describe('parseBearing', () => {
  const wireOf = (): Record<string, unknown> & { observer: Record<string, unknown> } => {
    const wire: BearingWire = unwrapOk(serialiseBearing(known));
    return JSON.parse(JSON.stringify(wire)) as Record<string, unknown> & {
      observer: Record<string, unknown>;
    };
  };

  it('reads a wire object back into the bearing it came from', () => {
    const parsed = unwrapOk(parseBearing(wireOf()));
    expect(parsed.id).toBe(known.id);
    expect(parsed.positionAccuracyM).toBe(known.positionAccuracyM);
    expect(parsed.timeUtcMs).toBe(known.timeUtcMs);
    expect(parsed.observer.latRad).toBeCloseTo(known.observer.latRad, 12);
    expect(parsed.observer.lonRad).toBeCloseTo(known.observer.lonRad, 12);
    expect(parsed.azimuthRad).toBeCloseTo(known.azimuthRad, 12);
    expect(parsed.azimuthSigmaRad).toBeCloseTo(known.azimuthSigmaRad, 12);
  });

  it('reads a hand-written wire object in degrees', () => {
    const parsed = unwrapOk(
      parseBearing({
        v: 1,
        kind: 'bearing',
        id: 'x',
        observer: { latDeg: 10, lonDeg: -20 },
        positionAccuracyM: 3,
        timeUtcMs: 0,
        azimuthDeg: 90,
        azimuthSigmaDeg: 1,
      }),
    );
    expect(parsed.observer.latRad).toBeCloseTo(rad(10), 15);
    expect(parsed.observer.lonRad).toBeCloseTo(rad(-20), 15);
    expect(parsed.azimuthRad).toBeCloseTo(Math.PI / 2, 15);
    expect(parsed.azimuthSigmaRad).toBeCloseTo(rad(1), 15);
  });

  it('ignores unknown extra fields', () => {
    expect(parseBearing({ ...wireOf(), note: 'ignored' }).ok).toBe(true);
  });

  it('keeps a unicode id through JSON text', () => {
    const wire = wireOf();
    wire['id'] = 'observador-厦门-🔥';
    expect(unwrapOk(parseBearing(JSON.parse(JSON.stringify(wire)))).id).toBe('observador-厦门-🔥');
  });

  describe('unsupported_format', () => {
    it.each([
      ['v of 2', { v: 2 }, 'v'],
      ['v as the string "1"', { v: '1' }, 'v'],
      ['v missing', { v: undefined }, 'v'],
      ['kind of "distance"', { kind: 'distance' }, 'kind'],
      ['kind missing', { kind: undefined }, 'kind'],
    ])('is returned for %s', (_description, change, field) => {
      const wire = { ...wireOf(), ...change };
      expect(parseBearing(wire)).toStrictEqual(err('unsupported_format', { field }));
    });

    it('is returned for an empty object, which has no version', () => {
      expect(parseBearing({})).toStrictEqual(err('unsupported_format', { field: 'v' }));
    });
  });

  describe('invalid_observation', () => {
    it.each([
      ['null', null],
      ['a string', 'text'],
      ['a number', 42],
      ['true', true],
      ['an array', []],
      ['undefined', undefined],
    ])('is returned, without throwing, when the input is %s', (_description, input) => {
      expect(parseBearing(input)).toStrictEqual(err('invalid_observation'));
    });

    it.each([
      ['id', (wire: Record<string, unknown>) => delete wire['id'], null],
      ['observer', (wire: Record<string, unknown>) => delete wire['observer'], 'obs-1'],
      [
        'observer.latDeg',
        (wire: Record<string, unknown> & { observer: Record<string, unknown> }) =>
          delete wire.observer['latDeg'],
        'obs-1',
      ],
      [
        'observer.lonDeg',
        (wire: Record<string, unknown> & { observer: Record<string, unknown> }) =>
          delete wire.observer['lonDeg'],
        'obs-1',
      ],
      [
        'positionAccuracyM',
        (wire: Record<string, unknown>) => delete wire['positionAccuracyM'],
        'obs-1',
      ],
      ['timeUtcMs', (wire: Record<string, unknown>) => delete wire['timeUtcMs'], 'obs-1'],
      ['azimuthDeg', (wire: Record<string, unknown>) => delete wire['azimuthDeg'], 'obs-1'],
      [
        'azimuthSigmaDeg',
        (wire: Record<string, unknown>) => delete wire['azimuthSigmaDeg'],
        'obs-1',
      ],
    ])('names the missing field %s', (field, remove, id) => {
      const wire = wireOf();
      remove(wire);
      expect(parseBearing(wire)).toStrictEqual(invalid(field, id));
    });

    it('names a field of the wrong type', () => {
      expect(parseBearing({ ...wireOf(), azimuthDeg: '225' })).toStrictEqual(invalid('azimuthDeg'));
      expect(parseBearing({ ...wireOf(), observer: null })).toStrictEqual(invalid('observer'));
      expect(parseBearing({ ...wireOf(), id: 5 })).toStrictEqual(invalid('id', null));
    });

    it('validates after parsing and names the wire field', () => {
      const wire = wireOf();
      expect(parseBearing({ ...wire, azimuthDeg: 360 })).toStrictEqual(invalid('azimuthDeg'));
      expect(parseBearing({ ...wire, azimuthDeg: Number.NaN })).toStrictEqual(
        invalid('azimuthDeg'),
      );
      expect(parseBearing({ ...wire, azimuthSigmaDeg: 0.005 })).toStrictEqual(
        invalid('azimuthSigmaDeg'),
      );
      expect(parseBearing({ ...wire, azimuthSigmaDeg: 46 })).toStrictEqual(
        invalid('azimuthSigmaDeg'),
      );
      expect(parseBearing({ ...wire, observer: { latDeg: 89.5, lonDeg: 0 } })).toStrictEqual(
        invalid('observer.latDeg'),
      );
      expect(parseBearing({ ...wire, observer: { latDeg: 0, lonDeg: 200 } })).toStrictEqual(
        invalid('observer.lonDeg'),
      );
      expect(parseBearing({ ...wire, observer: { latDeg: 0, lonDeg: -180 } })).toStrictEqual(
        invalid('observer.lonDeg'),
      );
      expect(parseBearing({ ...wire, positionAccuracyM: -1 })).toStrictEqual(
        invalid('positionAccuracyM'),
      );
      expect(parseBearing({ ...wire, id: '' })).toStrictEqual(invalid('id', null));
    });
  });

  it('accepts the boundary values on the wire', () => {
    const wire = wireOf();
    for (const change of [
      { azimuthSigmaDeg: 0.01 },
      { azimuthSigmaDeg: 45 },
      { azimuthDeg: 0 },
      { azimuthDeg: 359.9999999 },
      { positionAccuracyM: 0 },
      { positionAccuracyM: 10_000 },
      { observer: { latDeg: 89, lonDeg: 180 } },
      { observer: { latDeg: -89, lonDeg: 0 } },
    ]) {
      expect(parseBearing({ ...wire, ...change }).ok).toBe(true);
    }
  });
});
