// P-2.6: the hostile totality, as a registry (Req 2.1, 2.6, 19.3; tasks 2.5).
//
// `HOSTILE_LIST` names every public function of the Math layer with a generator of its arguments.
// Each is run over hostile inputs (`NaN`, infinities, -0, empty and very long strings, the
// doubles either side of every limit): it must not throw, and every number in its result must be
// finite. A parameter that is not finite, not positive or inconsistent must be `invalid_number`
// naming it. Every later task that adds a public Math function adds it to this list in the same
// task; the completeness test below fails otherwise.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ageText, clockTextUtc } from './math/civil-time';
import {
  ALPHABET,
  groupCode,
  isAlphabetString,
  stripCode,
  symbolAt,
  symbolValue,
} from './math/code/alphabet';
import { buildSightingLink, extractSightingCode } from './math/code/code-link';
import { checkSymbols } from './math/code/gf31-check';
import { decodeSighting, encodeSighting } from './math/code/sighting-code';
import {
  idFromBytes,
  incidentIdFromBytes,
  incidentMode,
  isIncidentId,
  isSightingId,
  sightingIdFromBytes,
} from './math/incident/ids';
import { messageFor } from './math/messages';
import { toDeg, fromDeg } from './math/degrees';
import { checkParameters, defaultParameters, type VigiaParameters } from './math/parameters';
import { VIGIA_REASONS, type VigiaReason } from './reasons';
import { pageAddress, sightingArb, symbols } from './test-support/generators';
import { cappedRuns } from './test-support/fast-check-setup';
import { allFinite, hostileNumber, hostileString, isTotalResult } from './test-support/hostile';
import { canonicalise, captureToSighting, type Sighting } from './math/incident/sighting';
import { partsOf, problemsOf } from './test-support/message-rules';
import { checkProperty, ErrorTracker } from './test-support/property-report';
import { views } from './test-support/source-views';

interface HostileEntry {
  readonly name: string;
  /** Runs the property of this function: P-2.6 for one entry of the list. */
  readonly run: () => void;
}

/** A value is total when its numbers are finite and, if it is a Result, it is a total one. */
function isTotal(value: unknown): boolean {
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'ok') === 'boolean'
  ) {
    return isTotalResult(value);
  }
  return allFinite(value);
}

/**
 * One entry: the function, a generator of its arguments (its domain is stated where it is
 * built), and an optional extra check on the arguments and the result. The property is that the
 * call does not throw and that the result is total.
 */
function hostileEntry<Args extends unknown[]>(
  name: string,
  args: fc.Arbitrary<Args>,
  fn: (...args: Args) => unknown,
  extra: (args: Args, result: unknown) => void = () => undefined,
): HostileEntry {
  return {
    name,
    run: () =>
      checkProperty(
        `P-2.6 ${name}`,
        fc.property(args, (given) => {
          let result: unknown;
          expect(() => {
            result = fn(...given);
          }, `${name} threw`).not.toThrow();
          expect(isTotal(result), `${name} returned a value with NaN or infinity`).toBe(true);
          extra(given, result);
        }),
        new ErrorTracker(),
        { numRuns: cappedRuns(10_000) },
      ),
  };
}

// --- the arguments ---------------------------------------------------------------------------

/**
 * A failure as `messageFor` takes it. Domain: any reason of the closed set (69), and each detail
 * absent or hostile: `field`, `id` and `errorName` strings of 0 to 10 000 characters of the full
 * BMP, `reportedAccuracyM` any hostile double.
 */
const hostileFailure = fc.record(
  {
    ok: fc.constant(false as const),
    reason: fc.constantFrom<VigiaReason[]>(...VIGIA_REASONS),
    field: hostileString(),
    id: hostileString(),
    errorName: hostileString(),
    reportedAccuracyM: hostileNumber(),
  },
  { requiredKeys: ['ok', 'reason'] },
);

/**
 * A Sighting as `encodeSighting` takes it. Domain: every number of the Bearing a hostile double
 * (so a position outside the Supported ones, a NaN azimuth, a time outside the 20 years), the
 * ids hostile strings or a valid id one draw in three, `origin` each of the two, `receivedUtcMs`
 * `null` or a hostile double.
 */
const hostileSighting: fc.Arbitrary<Sighting> = fc
  .tuple(
    fc.record({
      id: fc.oneof(hostileString(), symbols(9)),
      latRad: hostileNumber(),
      lonRad: hostileNumber(),
      positionAccuracyM: hostileNumber(),
      timeUtcMs: hostileNumber(),
      azimuthRad: hostileNumber(),
      azimuthSigmaRad: hostileNumber(),
    }),
    fc.oneof(hostileString(), symbols(10)),
    fc.oneof(fc.constant(null), hostileNumber()),
    fc.boolean(),
    fc.boolean(),
  )
  .map(([b, incidentId, receivedUtcMs, local, sameId]): Sighting => {
    const bearing = {
      id: b.id,
      observer: { latRad: b.latRad, lonRad: b.lonRad },
      positionAccuracyM: b.positionAccuracyM,
      timeUtcMs: b.timeUtcMs,
      azimuthRad: b.azimuthRad,
      azimuthSigmaRad: b.azimuthSigmaRad,
    };
    return {
      sightingId: sameId ? b.id : 'ZZZZZZZZZ',
      incidentId,
      bearing,
      origin: local ? 'local' : 'received',
      receivedUtcMs,
    };
  });

/** Any Sighting: a hostile one, or (one in two) a valid one so that the successes are reached. */
const anySighting: fc.Arbitrary<Sighting> = fc.oneof(hostileSighting, sightingArb());

const FIELDS = Object.keys(defaultParameters()) as (keyof VigiaParameters)[];

/**
 * A parameters record. Domain: each of the 17 fields is the default three times in four and a
 * hostile double the fourth time (so about four fields are hostile in a draw, and a draw with
 * none is the default, which is valid): the doubles are `NaN`, infinities, -0, subnormals, huge
 * values, small integers and the doubles either side of every limit.
 */
const hostileParameters: fc.Arbitrary<VigiaParameters> = fc
  .tuple(
    ...FIELDS.map(() =>
      fc.oneof(
        { weight: 3, arbitrary: fc.constant(null) },
        { weight: 1, arbitrary: hostileNumber() },
      ),
    ),
  )
  .map((overrides) => {
    const base = defaultParameters();
    const record: Record<string, number> = { ...base };
    FIELDS.forEach((field, index) => {
      const override = overrides[index];
      if (typeof override === 'number') record[field] = override;
    });
    return record as unknown as VigiaParameters;
  });

/** The counts of design §7.20: an integer of at least 1. */
const COUNTS: ReadonlySet<string> = new Set([
  'maxSightingsPerIncident',
  'maxCodeLengthChars',
  'maxLinkLengthChars',
  'maxEmergencyTextChars',
  'maxResponseBytes',
]);

/**
 * The oracle of `checkParameters`: the first invalid field by Req 19.3 and design §7.20, written
 * as a table so that it shares no code with the function. `null` when the record is valid.
 */
function firstInvalidField(p: VigiaParameters): string | null {
  for (const field of FIELDS) {
    const x = p[field];
    const bad = COUNTS.has(field)
      ? !(Number.isInteger(x) && x >= 1)
      : !(Number.isFinite(x) && x > 0);
    if (bad) return field;
  }
  const consistency: readonly (readonly [string, boolean])[] = [
    ['incidentRetentionMs', p.incidentRetentionMs <= p.maxIncidentAgeMs],
    ['fairEllipseRatio', p.fairEllipseRatio <= 1],
    ['longEllipseRatio', p.longEllipseRatio <= p.fairEllipseRatio],
    ['maxLinkLengthChars', p.maxLinkLengthChars < 50 + 13],
    ['maxEmergencyTextChars', p.maxEmergencyTextChars < 740],
  ];
  return consistency.find(([, violated]) => violated)?.[0] ?? null;
}

// --- the list --------------------------------------------------------------------------------

export const HOSTILE_LIST: readonly HostileEntry[] = [
  hostileEntry('messageFor', fc.tuple(hostileFailure), messageFor, ([failure], result) => {
    // Req 2.3: whatever the failure carries, the Message stays clean and says nothing of it.
    const message = messageFor(failure);
    expect(message).toEqual(result);
    for (const part of partsOf(message)) {
      expect(problemsOf(part, failure.reason)).toEqual([]);
      for (const detail of [failure.field, failure.id, failure.errorName]) {
        if (detail !== undefined && detail.length >= 3) expect(part).not.toContain(detail);
      }
    }
  }),
  hostileEntry('toDeg', fc.tuple(hostileNumber()), toDeg),
  hostileEntry('fromDeg', fc.tuple(hostileNumber()), fromDeg),
  hostileEntry('defaultParameters', fc.tuple(), defaultParameters),
  hostileEntry('checkParameters', fc.tuple(hostileParameters), checkParameters, ([p], result) => {
    const expected = firstInvalidField(p);
    if (expected === null) expect(result).toEqual({ ok: true, value: p });
    else expect(result).toEqual({ ok: false, reason: 'invalid_number', field: expected });
  }),
  // --- time (task 3.2) ---
  hostileEntry('clockTextUtc', fc.tuple(hostileNumber()), clockTextUtc, ([timeUtcMs], result) => {
    expect(result).toMatch(
      Number.isFinite(timeUtcMs) ? /^(?:[01]\d|2[0-3]):[0-5]\d UTC$/ : /^--:-- UTC$/,
    );
  }),
  hostileEntry('ageText', fc.tuple(hostileNumber()), ageText, (_args, result) => {
    expect(result).not.toMatch(/NaN|Infinity|undefined|null/);
  }),
  // --- the alphabet and the check (task 3.6) ---
  hostileEntry('symbolValue', fc.tuple(hostileString()), symbolValue, ([text], result) => {
    const expected = text.length === 1 ? ALPHABET.indexOf(text) : -1;
    expect(result).toBe(expected < 0 ? null : expected);
  }),
  hostileEntry('symbolAt', fc.tuple(hostileNumber()), symbolAt, ([value], result) => {
    const valid = Number.isInteger(value) && value >= 0 && value <= 30;
    expect(result).toBe(valid ? ALPHABET.charAt(value) : null);
  }),
  hostileEntry(
    'isAlphabetString',
    fc.tuple(hostileString()),
    isAlphabetString,
    ([text], result) => {
      expect(result).toBe([...text].every((c) => ALPHABET.includes(c)));
    },
  ),
  hostileEntry('groupCode', fc.tuple(hostileString()), groupCode, ([text], result) => {
    expect(typeof result === 'string' && result.replaceAll('-', '').length).toBe(
      text.replaceAll('-', '').length,
    );
  }),
  hostileEntry('stripCode', fc.tuple(hostileString()), stripCode, ([text], result) => {
    expect(typeof result === 'string' && !/[\s-]/.test(result)).toBe(true);
    expect(typeof result === 'string' && result.length <= text.length).toBe(true);
  }),
  hostileEntry('checkSymbols', fc.tuple(hostileString()), checkSymbols, ([text], result) => {
    if ([...text].every((c) => ALPHABET.includes(c))) {
      expect(result).toMatchObject({ ok: true });
      expect(Reflect.get(result as object, 'value')).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
    } else expect(result).toEqual({ ok: false, reason: 'invalid_number', field: 'message' });
  }),
  // --- the sighting code (task 3.8) ---
  hostileEntry('encodeSighting', fc.tuple(anySighting), encodeSighting, (_args, result) => {
    // A code, when there is one, is 50 symbols of the alphabet that decode again.
    if (typeof result === 'object' && result !== null && Reflect.get(result, 'ok') === true) {
      const code = Reflect.get(result, 'value') as string;
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{50}$/);
      expect(decodeSighting(code, defaultParameters()).ok).toBe(true);
    }
  }),
  hostileEntry(
    'decodeSighting',
    fc.tuple(hostileString(), hostileParameters),
    decodeSighting,
    ([, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      }
    },
  ),
  hostileEntry(
    'canonicalise',
    fc.tuple(anySighting, hostileParameters),
    canonicalise,
    ([, p], result) => {
      // A success needs valid parameters: decoding checks them.
      if (typeof result === 'object' && result !== null && Reflect.get(result, 'ok') === true) {
        expect(firstInvalidField(p)).toBeNull();
      }
    },
  ),
  hostileEntry(
    'captureToSighting',
    fc.tuple(
      anySighting.map((s) => s.bearing),
      fc.uint8Array({ maxLength: 64 }),
      fc.oneof(hostileString(), symbols(10)),
      hostileParameters,
    ),
    captureToSighting,
    ([, bytes, , p], result) => {
      if (typeof result === 'object' && result !== null && Reflect.get(result, 'ok') === true) {
        expect(firstInvalidField(p)).toBeNull();
        expect(bytes.length).toBeGreaterThanOrEqual(18);
      }
    },
  ),
  hostileEntry(
    'buildSightingLink',
    fc.tuple(
      fc.oneof(hostileString(), pageAddress()),
      fc.oneof(hostileString(), symbols(50)),
      hostileParameters,
    ),
    buildSightingLink,
    ([, , p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      } else if (
        typeof result === 'object' &&
        result !== null &&
        Reflect.get(result, 'ok') === true
      ) {
        expect((Reflect.get(result, 'value') as string).length).toBeLessThanOrEqual(
          p.maxLinkLengthChars,
        );
      }
    },
  ),
  hostileEntry(
    'extractSightingCode',
    fc.tuple(hostileString(), hostileParameters),
    extractSightingCode,
    ([, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      } else if (
        typeof result === 'object' &&
        result !== null &&
        Reflect.get(result, 'ok') === true
      ) {
        const code = Reflect.get(result, 'value') as string;
        expect(code.length).toBeGreaterThan(0);
        expect([...code].every((c) => ALPHABET.includes(c))).toBe(true);
      }
    },
  ),
  // --- identifiers (task 3.4) ---
  hostileEntry(
    'idFromBytes',
    fc.tuple(
      fc.uint8Array({ maxLength: 140 }),
      fc.oneof(hostileNumber(), fc.integer({ min: -2, max: 70 })),
      fc.oneof(hostileNumber(), fc.integer({ min: -2, max: 34 })),
    ),
    idFromBytes,
    ([bytes, length, modulus], result) => {
      let field: string | null = null;
      if (!(Number.isInteger(length) && length >= 0 && length <= 64)) field = 'length';
      else if (!(Number.isInteger(modulus) && modulus >= 1 && modulus <= 31))
        field = 'firstSymbolModulus';
      else if (bytes.length < 2 * length) field = 'bytes';
      if (field === null) {
        expect(result).toMatchObject({ ok: true });
        const id = Reflect.get(result as object, 'value') as string;
        expect(id).toHaveLength(length);
        expect([...id].every((c) => ALPHABET.includes(c))).toBe(true);
      } else expect(result).toEqual({ ok: false, reason: 'invalid_number', field });
    },
  ),
  hostileEntry(
    'sightingIdFromBytes',
    fc.tuple(fc.uint8Array({ maxLength: 64 })),
    sightingIdFromBytes,
    ([bytes], result) => {
      expect(result).toMatchObject({ ok: bytes.length >= 18 });
    },
  ),
  hostileEntry(
    'incidentIdFromBytes',
    fc.tuple(
      fc.uint8Array({ maxLength: 64 }),
      fc.constantFrom('device' as const, 'simulation' as const),
    ),
    incidentIdFromBytes,
    ([bytes, mode], result) => {
      expect(result).toMatchObject({ ok: bytes.length >= 20 });
      if (bytes.length >= 20) {
        const id = Reflect.get(result as object, 'value') as string;
        expect(id[0] === 'Z').toBe(mode === 'simulation');
      }
    },
  ),
  hostileEntry('isSightingId', fc.tuple(hostileString()), isSightingId),
  hostileEntry('isIncidentId', fc.tuple(hostileString()), isIncidentId),
  hostileEntry('incidentMode', fc.tuple(hostileString()), incidentMode, ([text], result) => {
    expect(result).toBe(text.startsWith('Z') ? 'simulation' : 'device');
  }),
];

/**
 * Public functions of the Math layer that are not on the list, each with its reason. Empty: every
 * exported function is hostile-tested.
 */
export const NOT_HOSTILE_TESTED: Readonly<Record<string, string>> = {
  withSightingId:
    'a copy of the Bearing it is given with a new id (design §7.3, P-3.9): a Bearing that carries a NaN is returned with it. Callers pass Bearings that Sensors validated; flagged to the lead (Req 2.6 against §7.3).',
};

describe('P-2.6: the hostile totality (Req 2.1, 2.6, 19.3)', () => {
  // The case count is the run's (200 in `pnpm test`, 10 000 in `test:deep`).
  for (const entry of HOSTILE_LIST) {
    it(`${entry.name} never throws and returns finite numbers or a failure`, () => {
      entry.run();
    });
  }
});

// --- completeness of the list ----------------------------------------------------------------

/** The names of the functions a source exports: `export function f` and `export const f = (…) =>`. */
export function exportedFunctionNames(code: string): string[] {
  const names = [...code.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)/g)].map(
    (m) => m[1] ?? '',
  );
  const arrows = code.matchAll(
    /\bexport\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>/g,
  );
  return [...names, ...[...arrows].map((m) => m[1] ?? '')];
}

/** Every Math-layer source (a file under a `math/` folder, tests excluded), read as text. */
const MATH_SOURCES: Readonly<Record<string, string>> = import.meta.glob<string>(
  ['./**/math/**/*.ts', '!./**/*.test.ts'],
  { query: '?raw', import: 'default', eager: true },
);

describe('the hostile list is complete (tasks 2.5)', () => {
  const found = Object.entries(MATH_SOURCES).flatMap(([path, text]) =>
    exportedFunctionNames(views(text).code).map((name) => ({ name, path })),
  );
  const listed = new Set(HOSTILE_LIST.map((entry) => entry.name));

  it('scans the Math files that exist and finds their functions', () => {
    expect(Object.keys(MATH_SOURCES).length).toBeGreaterThanOrEqual(4);
    expect(found.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        'messageFor',
        'toDeg',
        'fromDeg',
        'defaultParameters',
        'checkParameters',
      ]),
    );
  });

  it('has an entry, or a stated reason, for every exported function of the Math layer', () => {
    const missing = found.filter(({ name }) => !listed.has(name) && !(name in NOT_HOSTILE_TESTED));
    expect(missing).toEqual([]);
  });

  it('names no function that does not exist, and no name twice', () => {
    const existing = new Set(found.map((f) => f.name));
    expect(HOSTILE_LIST.filter((e) => !existing.has(e.name)).map((e) => e.name)).toEqual([]);
    expect(Object.keys(NOT_HOSTILE_TESTED).filter((name) => !existing.has(name))).toEqual([]);
    expect(listed.size).toBe(HOSTILE_LIST.length);
    expect(found.length).toBe(new Set(found.map((f) => f.name)).size);
  });

  it('reads both forms of export, and nothing in a comment or a type', () => {
    const code = views(
      [
        '// export function inComment() {}',
        'export function plain(a: number) { return a; }',
        'export async function later() {}',
        'export const arrow = (x: number): number => x;',
        'export const single = x => x;',
        'export const constant = 3;',
        'export const table = { f: () => 1 };',
        'export type T = () => void;',
        'export interface I { f(): void }',
      ].join('\n'),
    ).code;
    expect(exportedFunctionNames(code).sort()).toEqual(['arrow', 'later', 'plain', 'single']);
  });
});
