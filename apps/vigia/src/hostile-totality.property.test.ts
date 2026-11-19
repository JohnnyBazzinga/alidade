// P-2.6: the hostile totality, as a registry (Req 2.1, 2.6, 19.3; tasks 2.5).
//
// `HOSTILE_LIST` names every public function of the Math layer with a generator of its arguments.
// Each is run over hostile inputs (`NaN`, infinities, -0, empty and very long strings, the
// doubles either side of every limit): it must not throw, and every number in its result must be
// finite. A parameter that is not finite, not positive or inconsistent must be `invalid_number`
// naming it. Every later task that adds a public Math function adds it to this list in the same
// task; the completeness test below fails otherwise.

import { validateBearing } from '@alidade/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createClipboard } from './adapters/clipboard';
import { createNetworkGate } from './adapters/network-gate';
import { createPage } from './adapters/page-address';
import { createQrEncoder, type QrMatrix } from './adapters/qr-encoder';
import { createRandom, MAX_BYTES_PER_CALL } from './adapters/random';
import { createMemoryStorage, createStorage, type StorageLike } from './adapters/storage';
import { createManualTransport } from './adapters/transport/manual-transport';
import { createMemoryNetwork, DIRECT_DELIVERY } from './adapters/transport/memory-network';
import { assess } from './math/assessment/assess';
import {
  checkStatement,
  disagreementStatement,
  incidentStatement,
} from './math/assessment/statements';
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
import { applyAction } from './math/incident/apply-action';
import {
  compareIds,
  emptyState,
  hasOnlyFiniteNumbers,
  newestTimeUtcMs,
  sanitiseState,
  type VigiaState,
} from './math/incident/incident-state';
import { mergeSighting } from './math/incident/merge';
import { parseStoredState, serialiseState } from './math/incident/storage-format';
import { adviceWords, nextSightingAdvice, type Advice } from './math/fix/advice';
import { emergencyText } from './math/fix/emergency-text';
import { fixWords, fixWordsText, type FixWords } from './math/fix/fix-words';
import {
  accuracyText,
  axisWords,
  compassWord8,
  directionText,
  lengthText95,
  lengthTextNearest,
  positionDecimals,
  positionText,
} from './math/fix/format';
import { fromYouWords, halfIntervalM } from './math/fix/from-you';
import { geometryClass, geometrySentence } from './math/fix/geometry-class';
import { mapModel } from './math/fix/map-model';
import { messageFor } from './math/messages';
import { decideRequest } from './math/network/gate-decision';
import {
  buildHostList,
  HOST_LIST,
  WIND_ENTRY,
  type HostList,
  type TileProvider,
} from './math/network/host-list';
import { windPoint, windRequestUrl } from './math/network/request-boxes';
import { sightingGuidance } from './math/texts';
import { toDeg, fromDeg } from './math/degrees';
import { checkParameters, defaultParameters, type VigiaParameters } from './math/parameters';
import { VIGIA_REASONS, type VigiaReason } from './reasons';
import { closed, pageAddress, sightingArb, symbols } from './test-support/generators';
import { createFakeFetch, type FakeBehaviour } from './test-support/fake-fetch';
import { FakeTimer } from './test-support/fake-timer';
import { createFakeCrypto, createFakeNavigator, createFakePage } from './test-support/fake-browser';
import { cappedRuns } from './test-support/fast-check-setup';
import {
  hostileAction,
  hostileAssessment,
  hostileFix,
  hostileIncident,
  hostileState,
  hostileStoredText,
  reachedState,
} from './test-support/hostile-incident';
import { invariants } from './test-support/incident-invariants';
import { allFinite, hostileNumber, hostileString, isTotalResult } from './test-support/hostile';
import {
  canonicalise,
  captureToSighting,
  withSightingId,
  type Sighting,
} from './math/incident/sighting';
import { partsOf, problemsOf } from './test-support/message-rules';
import { checkProperty, checkPropertyAsync, ErrorTracker } from './test-support/property-report';
import { views } from './test-support/source-views';

interface HostileEntry {
  readonly name: string;
  /** Runs the property of this function: P-2.6 for one entry of the list. */
  readonly run: () => void | Promise<void>;
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

/**
 * `hostileEntry` for a function that returns a Promise (the Adapters': a gate that waits for a
 * response, a clipboard, a Transport). Same property: the Promise settles with a value (never a
 * rejection), the value is total, and the extra check holds.
 */
function hostileAsyncEntry<Args extends unknown[]>(
  name: string,
  args: fc.Arbitrary<Args>,
  fn: (...args: Args) => Promise<unknown>,
  extra: (args: Args, result: unknown) => void = () => undefined,
): HostileEntry {
  return {
    name,
    run: () =>
      checkPropertyAsync(
        `P-2.6 ${name}`,
        fc.asyncProperty(args, async (given) => {
          let result: unknown;
          try {
            result = await fn(...given);
          } catch (error) {
            throw new Error(`${name} rejected: ${String(error)}`, { cause: error });
          }
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

/**
 * An Advice. Domain: each of the three kinds; for a Fix, two hostile directions, a hostile
 * distance and areas, any class and a count of 0 to 40.
 */
const hostileAdvice: fc.Arbitrary<Advice> = fc.oneof(
  fc.constant<Advice>({ kind: 'none' }),
  fc.constant<Advice>({ kind: 'one_sighting' }),
  fc
    .record({
      d1: hostileNumber(),
      d2: hostileNumber(),
      distanceM: hostileNumber(),
      areaBeforeM2: hostileNumber(),
      areaAfterM2: fc.oneof(hostileNumber(), fc.constant(null)),
      geometry: fc.constantFrom('none' as const, 'poor' as const, 'fair' as const, 'good' as const),
      usedCount: fc.integer({ min: 0, max: 40 }),
    })
    .map((r): Advice => ({
      kind: 'fix',
      directionsRad: [r.d1, r.d2],
      distanceM: r.distanceM,
      areaBeforeM2: r.areaBeforeM2,
      areaAfterM2: r.areaAfterM2,
      geometry: r.geometry,
      usedCount: r.usedCount,
    })),
);

/** An Incident that was really built: the first of a reached state, or an empty one. */
const reachedIncident = reachedState().map(
  (state) =>
    state.incidents[0] ?? {
      incidentId: 'K7PQ3MWXA2',
      createdUtcMs: 1_790_000_000_000,
      creation: 'created' as const,
      entries: [],
      conflicts: [],
    },
);

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
    ['maxEmergencyTextChars', p.maxEmergencyTextChars < 896],
  ];
  return consistency.find(([, violated]) => violated)?.[0] ?? null;
}

// --- the list --------------------------------------------------------------------------------

/** A tile provider and templates for the Host list entries (synthetic; the owner lists the real one). */
const TILE_PROVIDER: TileProvider = {
  host: 'tiles.example-maps.test',
  sourceName: 'Example Maps (synthetic)',
  termsUrl: 'https://example-maps.test/terms',
  attribution: 'Map data by Example Maps',
};
const TILE_TEMPLATES = [
  'https://tiles.example-maps.test/{z}/{x}/{y}.png',
  'https://evil.test/{z}/{x}/{y}.png',
  'https://tiles.example-maps.test/{z}/{x}/{y}.png?style=plain',
] as const;

/**
 * A position for the wind request. Domain: a hostile double for each coordinate one draw in two;
 * otherwise a latitude in `[-1.55, 1.55]` rad and a longitude in `[-3.14, 3.14]` rad (both ends
 * drawn), which are Supported.
 */
const hostilePosition = fc.oneof(
  fc.record({ latRad: hostileNumber(), lonRad: hostileNumber() }),
  fc.record({ latRad: closed(-1.55, 1.55), lonRad: closed(-3.14, 3.14) }),
);

/** The URL of the wind builder for a Supported position, and nothing else (for the gate's entries). */
const windUrl = fc
  .record({ latRad: closed(-1.55, 1.55), lonRad: closed(-3.14, 3.14) })
  .map((position) => {
    const url = windRequestUrl(position, defaultParameters());
    return url.ok ? url.value : '';
  });

/**
 * A Storage object. Domain: it answers with a hostile string, or its calls throw an Error with a
 * hostile name, `null`, a number or an object with a non-string `name`.
 */
const hostileStorage: fc.Arbitrary<StorageLike> = fc
  .tuple(fc.constantFrom('ok', 'error', 'null', 'number', 'object'), hostileString())
  .map(([mode, text]): StorageLike => {
    const fail = (): never => {
      switch (mode) {
        case 'error': {
          const error = new Error(text);
          error.name = text;
          throw error;
        }
        case 'null':
          throw null;
        case 'number':
          throw 42;
        default:
          throw { name: 7 };
      }
    };
    return {
      getItem: () => (mode === 'ok' ? text : fail()),
      setItem: () => (mode === 'ok' ? undefined : fail()),
      removeItem: () => (mode === 'ok' ? undefined : fail()),
    };
  });

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
  // --- the Incident store (task 5.2) ---
  hostileEntry('emptyState', fc.tuple(), emptyState, (_args, result) => {
    expect(result).toEqual({ incidents: [], openIncidentId: null });
  }),
  hostileEntry(
    'compareIds',
    fc.tuple(hostileString(), hostileString()),
    compareIds,
    ([a, b], result) => {
      expect(result).toBe(a < b ? -1 : a > b ? 1 : 0);
    },
  ),
  hostileEntry('hasOnlyFiniteNumbers', fc.tuple(hostileState()), hasOnlyFiniteNumbers),
  hostileEntry('newestTimeUtcMs', fc.tuple(reachedIncident), newestTimeUtcMs),
  hostileEntry(
    'sanitiseState',
    fc.tuple(hostileState(), hostileParameters),
    sanitiseState,
    ([, p], result) => {
      const kept = (result as { state: VigiaState; dropped: number }).state;
      // Whatever came in, what comes out holds I1 to I7, and the count is a count.
      if (firstInvalidField(p) === null) expect(invariants(kept, p)).toEqual([]);
      expect(Number.isInteger((result as { dropped: number }).dropped)).toBe(true);
    },
  ),
  hostileEntry(
    'mergeSighting',
    fc.tuple(
      reachedIncident,
      anySighting,
      fc.oneof(hostileString(), symbols(50)),
      fc.oneof(hostileNumber(), fc.constant(null)),
      hostileParameters,
    ),
    mergeSighting,
    ([, , , , p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      }
    },
  ),
  hostileEntry(
    'applyAction',
    fc.tuple(fc.oneof(reachedState(), hostileState()), hostileAction(), hostileParameters),
    applyAction,
    ([state, , p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
        return;
      }
      // A state that held the invariants still holds them after any action that is accepted.
      if (typeof result === 'object' && result !== null && Reflect.get(result, 'ok') === true) {
        const next = (Reflect.get(result, 'value') as { state: VigiaState }).state;
        if (invariants(state, p).length === 0) expect(invariants(next, p)).toEqual([]);
      }
    },
  ),
  hostileEntry(
    'serialiseState',
    fc.tuple(hostileState(), hostileNumber()),
    serialiseState,
    (_args, result) => {
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result as string) as { savedUtcMs: unknown };
      expect(Number.isFinite(parsed.savedUtcMs)).toBe(true);
    },
  ),
  hostileEntry(
    'parseStoredState',
    fc.tuple(fc.oneof(hostileStoredText(), fc.constant(null)), hostileNumber(), hostileParameters),
    parseStoredState,
    ([, now, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      } else if (!Number.isFinite(now)) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: 'nowUtcMs' });
      } else if (
        typeof result === 'object' &&
        result !== null &&
        Reflect.get(result, 'ok') === true
      ) {
        const parse = Reflect.get(result, 'value') as {
          kind: string;
          state?: VigiaState;
          dropped?: number;
        };
        if (parse.kind === 'loaded' && parse.state !== undefined) {
          expect(invariants(parse.state, p)).toEqual([]);
          expect(Number.isInteger(parse.dropped)).toBe(true);
        }
      }
    },
  ),
  // --- the assessment (task 6.2) ---
  hostileEntry(
    'assess',
    fc.tuple(hostileIncident(), hostileNumber(), hostileParameters),
    assess,
    ([incident, now, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      } else if (!Number.isFinite(now)) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: 'nowUtcMs' });
      } else if (
        typeof result === 'object' &&
        result !== null &&
        Reflect.get(result, 'ok') === true
      ) {
        // A partition of the entries, whatever came in.
        const a = Reflect.get(result, 'value') as { used: unknown[]; setAside: unknown[] };
        expect(a.used.length + a.setAside.length).toBe(incident.entries.length);
      }
    },
  ),
  hostileEntry(
    'checkStatement',
    fc.tuple(
      fc.constantFrom(
        'none' as const,
        'one' as const,
        'two' as const,
        'three' as const,
        'four_or_more' as const,
      ),
    ),
    checkStatement,
  ),
  hostileEntry(
    'disagreementStatement',
    fc.tuple(
      fc.constantFrom('none' as const, 'three_disagree' as const, 'diverging' as const),
      fc.constantFrom(
        'none' as const,
        'one' as const,
        'two' as const,
        'three' as const,
        'four_or_more' as const,
      ),
    ),
    disagreementStatement,
  ),
  hostileEntry('incidentStatement', fc.tuple(), incidentStatement),
  // --- the words, the geometry, the advice and the map (task 7) ---
  hostileEntry('lengthText95', fc.tuple(hostileNumber()), lengthText95, ([x], result) => {
    expect(Reflect.get(result as object, 'ok')).toBe(Number.isFinite(x) && x > 0);
  }),
  hostileEntry('lengthTextNearest', fc.tuple(hostileNumber()), lengthTextNearest, ([x], result) => {
    expect(Reflect.get(result as object, 'ok')).toBe(Number.isFinite(x) && x >= 0);
  }),
  hostileEntry('positionDecimals', fc.tuple(hostileNumber()), positionDecimals, (_args, result) => {
    expect([0, 1, 2, 3, 4]).toContain(result);
  }),
  hostileEntry(
    'positionText',
    fc.tuple(fc.record({ latRad: hostileNumber(), lonRad: hostileNumber() }), hostileNumber()),
    positionText,
    (_args, result) => {
      if (Reflect.get(result as object, 'ok') === true) {
        expect((Reflect.get(result as object, 'value') as { text: string }).text).toMatch(
          /^\d+(\.\d+)?° [NS], \d+(\.\d+)?° [EW]$/,
        );
      }
    },
  ),
  hostileEntry('compassWord8', fc.tuple(hostileNumber()), compassWord8),
  // --- the formatters of the screens (task 13.3) ---
  hostileEntry(
    'directionText',
    fc.tuple(hostileNumber(), hostileNumber()),
    directionText,
    ([azimuthRad, sigmaRad], result) => {
      const valid = Number.isFinite(azimuthRad) && sigmaRad > 0 && sigmaRad <= Math.PI;
      expect(Reflect.get(result as object, 'ok')).toBe(valid);
      if (valid) {
        expect(Reflect.get(result as object, 'value')).toMatch(/^\d{1,3}\.\d° ± \d+\.\d°$/);
      }
    },
  ),
  hostileEntry('accuracyText', fc.tuple(hostileNumber()), accuracyText, ([accuracyM], result) => {
    expect(Reflect.get(result as object, 'ok')).toBe(Number.isFinite(accuracyM) && accuracyM >= 0);
  }),
  hostileEntry('axisWords', fc.tuple(hostileNumber()), axisWords),
  hostileEntry(
    'geometryClass',
    fc.tuple(fc.oneof(hostileFix(), fc.constant(null)), hostileParameters),
    geometryClass,
    ([, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null)
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
    },
  ),
  hostileEntry(
    'geometrySentence',
    fc.tuple(fc.constantFrom('none' as const, 'poor' as const, 'fair' as const, 'good' as const)),
    geometrySentence,
  ),
  hostileEntry(
    'halfIntervalM',
    fc.tuple(
      fc.record({
        semiMajorM: hostileNumber(),
        semiMinorM: hostileNumber(),
        azimuthRad: hostileNumber(),
      }),
      hostileNumber(),
    ),
    halfIntervalM,
  ),
  hostileEntry(
    'fromYouWords',
    fc.tuple(
      hostileFix(),
      fc.record({ latRad: hostileNumber(), lonRad: hostileNumber() }),
      hostileParameters,
    ),
    fromYouWords,
    ([, , p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null)
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      if (Reflect.get(result as object, 'ok') === true) {
        expect(Reflect.get(result as object, 'value')).not.toMatch(/NaN|Infinity|undefined|null/);
      }
    },
  ),
  hostileEntry(
    'fixWords',
    fc.tuple(hostileFix(), hostileAssessment(), hostileNumber(), hostileParameters),
    fixWords,
    ([, , , p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null)
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      if (Reflect.get(result as object, 'ok') === true) {
        expect(fixWordsText(Reflect.get(result as object, 'value') as FixWords)).not.toMatch(
          /NaN|Infinity|undefined|null/,
        );
      }
    },
  ),
  hostileEntry(
    'fixWordsText',
    fc.tuple(
      fc.record({
        disagreement: fc.option(hostileString()),
        headline: hostileString(),
        area: hostileString(),
        basis: hostileString(),
        geometry: hostileString(),
        warnings: fc.array(hostileString(), { maxLength: 3 }),
        limits: hostileString(),
      }),
    ),
    fixWordsText,
  ),
  hostileEntry(
    'nextSightingAdvice',
    fc.tuple(hostileAssessment(), hostileParameters),
    nextSightingAdvice,
    ([, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null)
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
    },
  ),
  hostileEntry('adviceWords', fc.tuple(hostileAdvice), adviceWords, (_args, result) => {
    if (Reflect.get(result as object, 'ok') === true) {
      expect(String(Reflect.get(result as object, 'value'))).not.toMatch(/NaN|Infinity|undefined/);
    }
  }),
  hostileEntry(
    'mapModel',
    fc.tuple(hostileAssessment(), hostileParameters),
    mapModel,
    ([, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null)
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
    },
  ),
  hostileEntry('sightingGuidance', fc.tuple(fc.boolean()), sightingGuidance),
  // --- the Emergency text (task 8.2) ---
  hostileEntry(
    'emergencyText',
    fc.tuple(
      fc.record({
        assessment: hostileAssessment(),
        nowUtcMs: fc.oneof(hostileNumber(), fc.constant(1_790_000_000_000)),
        mode: fc.constantFrom('device' as const, 'simulation' as const),
        ownPosition: fc.oneof(
          fc.constant(null),
          fc.record({
            position: fc.record({ latRad: hostileNumber(), lonRad: hostileNumber() }),
            accuracyM: hostileNumber(),
          }),
        ),
        includeOwnPosition: fc.boolean(),
      }),
      hostileParameters,
    ),
    emergencyText,
    ([, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null)
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      if (Reflect.get(result as object, 'ok') === true) {
        const text = Reflect.get(result as object, 'value') as string;
        expect(text).not.toMatch(/NaN|Infinity|undefined|null/);
        expect(text.length).toBeLessThanOrEqual(p.maxEmergencyTextChars);
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
  hostileEntry(
    'withSightingId',
    fc.tuple(
      anySighting.map((s) => s.bearing),
      fc.oneof(hostileString(), symbols(9)),
    ),
    withSightingId,
    ([bearing, id], result) => {
      // Core's own verdict on the Bearing with the new id, unchanged (design §7.3).
      const verdict = validateBearing({ ...bearing, id });
      if (verdict.ok) expect(result).toEqual({ ok: true, value: { ...bearing, id } });
      else expect(result).toEqual(verdict);
    },
  ),
  hostileEntry('isSightingId', fc.tuple(hostileString()), isSightingId),
  hostileEntry('isIncidentId', fc.tuple(hostileString()), isIncidentId),
  hostileEntry('incidentMode', fc.tuple(hostileString()), incidentMode, ([text], result) => {
    expect(result).toBe(text.startsWith('Z') ? 'simulation' : 'device');
  }),
  // --- the Network gate, the Host list and the wind request (task 10) ---
  hostileEntry(
    'decideRequest',
    fc.tuple(fc.oneof(hostileString(), windUrl), fc.constantFrom(HOST_LIST, [] as HostList)),
    decideRequest,
    ([, list], result) => {
      if (Reflect.get(result as object, 'ok') === true) {
        expect(list).toContain(Reflect.get(result as object, 'value'));
      } else {
        expect(result).toMatchObject({ ok: false, reason: 'host_not_allowed' });
        expect([
          'url',
          'canonical',
          'scheme',
          'userinfo',
          'port',
          'fragment',
          'host',
          'path',
          'query',
        ]).toContain(Reflect.get(result as object, 'field'));
      }
    },
  ),
  hostileEntry(
    'buildHostList',
    fc.tuple(
      fc.array(fc.oneof(hostileString(), fc.constantFrom(...TILE_TEMPLATES)), { maxLength: 3 }),
      fc.constantFrom([TILE_PROVIDER], [] as readonly TileProvider[]),
    ),
    buildHostList,
    ([templates], result) => {
      if (Reflect.get(result as object, 'ok') === true) {
        const list = Reflect.get(result as object, 'value') as HostList;
        expect(list).toHaveLength(1 + templates.length);
        expect(list[0]).toBe(WIND_ENTRY);
      } else {
        expect(result).toMatchObject({ ok: false, reason: 'host_not_allowed' });
      }
    },
  ),
  hostileEntry(
    'windPoint',
    fc.tuple(hostilePosition, hostileParameters),
    windPoint,
    ([position, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      } else if (Reflect.get(result as object, 'ok') === true) {
        const point = Reflect.get(result as object, 'value') as { latDeg: number; lonDeg: number };
        const lat = toDeg(position.latRad);
        const lon = toDeg(position.lonRad);
        expect(lat.ok && lon.ok).toBe(true);
        if (lat.ok && lon.ok) {
          expect(Math.abs(point.latDeg - lat.value)).toBeLessThanOrEqual(p.windGridDeg / 2 + 1e-9);
          expect(Math.abs(point.lonDeg - lon.value)).toBeLessThanOrEqual(p.windGridDeg / 2 + 1e-9);
        }
      }
    },
  ),
  hostileEntry(
    'windRequestUrl',
    fc.tuple(hostilePosition, hostileParameters),
    windRequestUrl,
    ([, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      } else if (Reflect.get(result as object, 'ok') === true) {
        // What the builder writes, the gate's decision accepts (P-11.9).
        const url = Reflect.get(result as object, 'value') as string;
        expect(decideRequest(url, HOST_LIST).ok).toBe(true);
      }
    },
  ),
  hostileAsyncEntry(
    'createNetworkGate',
    fc.tuple(
      fc.oneof(hostileString(), windUrl),
      hostileParameters,
      fc.constantFrom('reject', 'throw', 'hang', 'text', 'stream', 'status') as fc.Arbitrary<
        'reject' | 'throw' | 'hang' | 'text' | 'stream' | 'status'
      >,
      hostileString(),
    ),
    async (url, p, mode, body) => {
      const bytes = new TextEncoder().encode(body.slice(0, 2000));
      const fake = createFakeFetch((): FakeBehaviour => {
        switch (mode) {
          case 'reject':
            return { kind: 'reject', error: body };
          case 'throw':
            return { kind: 'throw', error: body };
          case 'hang':
            return { kind: 'hang' };
          case 'text':
            return { kind: 'text', status: 200, text: body };
          case 'stream':
            return { kind: 'stream', status: 200, chunks: [bytes, bytes] };
          case 'status':
            return { kind: 'text', status: 503, text: body };
        }
      });
      const timer = new FakeTimer();
      const made = createNetworkGate(fake.fetchLike, HOST_LIST, p, timer);
      if (!made.ok) return made;
      const pending = made.value.get(url);
      timer.advance(p.requestTimeoutMs);
      return pending;
    },
    ([, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      } else if (Reflect.get(result as object, 'ok') === false) {
        expect(['host_not_allowed', 'overlay_unavailable']).toContain(
          Reflect.get(result as object, 'reason'),
        );
      }
    },
  ),
  hostileEntry(
    'DIRECT_DELIVERY',
    fc.tuple(hostileString(), hostileString(), hostileString(), hostileNumber()),
    DIRECT_DELIVERY,
    (_args, result) => {
      expect(result).toEqual([{ copies: 1, delayMs: 0 }]);
    },
  ),
  // --- the Adapters (task 11) ---
  hostileEntry(
    'createStorage',
    fc.tuple(hostileStorage, hostileString()),
    (storage, text) => {
      const made = createStorage(storage);
      return [
        made.read(),
        made.write(text),
        made.remove(),
        made.readBackup(),
        made.writeBackup(text),
      ];
    },
    (_args, result) => {
      for (const one of result as unknown[]) expect(isTotalResult(one)).toBe(true);
    },
  ),
  hostileEntry(
    'createMemoryStorage',
    fc.tuple(hostileString()),
    (text) => {
      const made = createMemoryStorage();
      made.write(text);
      made.writeBackup(text);
      return [made.read(), made.readBackup()];
    },
    ([text], result) => {
      expect(result).toEqual([
        { ok: true, value: text },
        { ok: true, value: text },
      ]);
    },
  ),
  hostileAsyncEntry(
    'createClipboard',
    fc.tuple(
      fc.constantFrom('ok', 'absent', 'reject', 'throw') as fc.Arbitrary<
        'ok' | 'absent' | 'reject' | 'throw'
      >,
      fc.constantFrom('ok', 'absent', 'reject', 'throw') as fc.Arbitrary<
        'ok' | 'absent' | 'reject' | 'throw'
      >,
      hostileString(),
    ),
    async (clipboardMode, shareMode, text) => {
      const navigator = createFakeNavigator({ clipboard: clipboardMode, share: shareMode });
      const made = createClipboard(navigator);
      return [await made.copyText(text), await made.shareLink(text), made.canShare];
    },
    ([clipboardMode, shareMode, text], result) => {
      const [copied, shared, canShare] = result as [unknown, unknown, unknown];
      expect(isTotalResult(copied)).toBe(true);
      expect(isTotalResult(shared)).toBe(true);
      expect(canShare).toBe(shareMode !== 'absent');
      expect(Reflect.get(copied as object, 'ok')).toBe(clipboardMode === 'ok');
      expect(Reflect.get(shared as object, 'ok')).toBe(shareMode === 'ok');
      void text;
    },
  ),
  hostileEntry(
    'createRandom',
    fc.tuple(
      fc.constantFrom('ok', 'throws', 'missing') as fc.Arbitrary<'ok' | 'throws' | 'missing'>,
      hostileNumber(),
    ),
    (mode, count) => {
      const crypto = createFakeCrypto();
      crypto.failing = mode === 'throws';
      const made = createRandom(mode === 'missing' ? null : crypto);
      return made.ok ? made.value.bytes(count) : made;
    },
    ([mode, count], result) => {
      if (mode === 'missing') {
        expect(result).toEqual({ ok: false, reason: 'random_unavailable' });
      } else {
        const valid = Number.isInteger(count) && count >= 0 && count <= MAX_BYTES_PER_CALL;
        expect((result as Uint8Array).length).toBe(valid && mode === 'ok' ? count + 0 : 0); // `+ 0`: a count of -0 is 0 bytes
      }
    },
  ),
  hostileEntry(
    'createPage',
    fc.tuple(hostileString(), hostileString(), fc.boolean(), hostileString()),
    (href, hash, failing, address) => {
      const fake = createFakePage('https://app.example.test/');
      fake.location.setRaw(href, hash);
      fake.history.failing = failing;
      const page = createPage(fake.location, fake.history, fake.events);
      let heard = 0;
      const off = page.onFragmentChange(() => {
        heard += 1;
      });
      fake.events.dispatch();
      off();
      const before = { address: page.address(), fragment: page.fragment() };
      const gone = page.replaceAddress(address);
      return {
        ...before,
        gone,
        after: page.fragment(),
        heard,
        urls: fake.history.calls.map((c) => c.url ?? ''),
      };
    },
    ([href, hash], result) => {
      const r = result as {
        address: string;
        fragment: string;
        gone: boolean;
        after: string;
        heard: number;
        urls: string[];
      };
      expect(r.address).toBe(href);
      expect(r.fragment).toBe(hash.startsWith('#') ? hash.slice(1) : hash);
      expect(r.heard).toBe(1);
      expect(r.gone).toBe(r.after === '');
      for (const url of r.urls) expect(url).not.toContain('#');
    },
  ),
  hostileEntry(
    'createQrEncoder',
    fc.tuple(fc.oneof(hostileString(), pageAddress()), hostileParameters),
    (link, p) => {
      const made = createQrEncoder(p);
      return made.ok ? made.value.qrMatrix(link) : made;
    },
    ([link, p], result) => {
      const invalidField = firstInvalidField(p);
      if (invalidField !== null) {
        expect(result).toEqual({ ok: false, reason: 'invalid_number', field: invalidField });
      } else if (link.length > p.maxLinkLengthChars) {
        expect(result).toEqual({ ok: false, reason: 'link_too_long' });
      } else if (Reflect.get(result as object, 'ok') === true) {
        const matrix = Reflect.get(result as object, 'value') as QrMatrix;
        expect(matrix.size).toBe(4 * matrix.version + 17);
      }
    },
  ),
  hostileAsyncEntry(
    'createMemoryNetwork',
    fc.tuple(
      fc.array(fc.record({ copies: hostileNumber(), delayMs: hostileNumber() }), { maxLength: 3 }),
      hostileString(),
    ),
    async (steps, code) => {
      const timer = new FakeTimer();
      const network = createMemoryNetwork(() => steps, timer);
      const a = network.join('A');
      const b = network.join('B');
      const got: string[] = [];
      b.onReceive((text) => got.push(text));
      const sent = await a.send(code);
      // Past the longest finite delay of the plan, so that every valid delivery has been made.
      const finiteDelays = steps
        .map((step) => step.delayMs)
        .filter((d) => Number.isFinite(d) && d > 0);
      timer.advance(Math.max(0, ...finiteDelays) + 1);
      return { sent, got, running: timer.running() };
    },
    ([, code], result) => {
      const r = result as { sent: unknown; got: string[]; running: number };
      expect(isTotalResult(r.sent)).toBe(true);
      for (const text of r.got) expect(text).toBe(code);
      expect(r.running).toBe(0);
    },
  ),
  hostileAsyncEntry(
    'createManualTransport',
    fc.tuple(hostileString(), fc.boolean()),
    async (text, throws) => {
      const transport = createManualTransport({
        present: () => {
          if (throws) throw new Error(text);
        },
      });
      const got: string[] = [];
      transport.onReceive((t) => got.push(t));
      transport.receive(text);
      return { sent: await transport.send(text), got };
    },
    ([text, throws], result) => {
      const r = result as { sent: unknown; got: string[] };
      expect(r.got).toEqual([text]);
      expect(Reflect.get(r.sent as object, 'ok')).toBe(!throws);
      expect(isTotalResult(r.sent)).toBe(true);
    },
  ),
];

/**
 * Public functions of the Math layer that are not on the list, each with its reason. Empty: every
 * exported function is hostile-tested.
 */
export const NOT_HOSTILE_TESTED: Readonly<Record<string, string>> = {
  assessWith:
    'the test seam of `assess` (design §7.6 step 5): its `solve` argument is trusted, and `assess` is `assessWith` with Core\u2019s `solve`, which is on the list.',
};

describe('P-2.6: the hostile totality (Req 2.1, 2.6, 19.3)', () => {
  // The case count is the run's (200 in `pnpm test`, 10 000 in `test:deep`).
  for (const entry of HOSTILE_LIST) {
    it(`${entry.name} never throws and returns finite numbers or a failure`, () => entry.run());
  }
});

// --- completeness of the list ----------------------------------------------------------------

/** The names of the functions a source exports: `export function f` and `export const f = (…) =>`. */
export function exportedFunctionNames(code: string): string[] {
  const names = [...code.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)/g)].map(
    (m) => m[1] ?? '',
  );
  const arrows = code.matchAll(
    /\bexport\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?(?:\([^()]*\)|\w+)\s*(?::[^=()]+)?=>/g,
  );
  return [...names, ...[...arrows].map((m) => m[1] ?? '')];
}

/**
 * Every source of the Math layer and of the Adapters (a file under a `math/` or an `adapters/`
 * folder, tests excluded), read as text.
 */
const MATH_SOURCES: Readonly<Record<string, string>> = import.meta.glob<string>(
  ['./**/math/**/*.ts', './**/adapters/**/*.ts', '!./**/*.test.ts'],
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
        'export const computed: number = (() => {\n  return 1;\n})();',
        'export const table = { f: () => 1 };',
        'export type T = () => void;',
        'export interface I { f(): void }',
      ].join('\n'),
    ).code;
    expect(exportedFunctionNames(code).sort()).toEqual(['arrow', 'later', 'plain', 'single']);
  });
});
