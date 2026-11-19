import { greatCircleDistanceM } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../parameters';
import {
  CODE_EPOCH_UTC_MS,
  CODE_SPAN_MS,
  MAX_ACCURACY_M,
  MAX_LAT_RAD,
} from '../../test-support/generators';
import {
  deg,
  exampleA,
  FIXTURE,
  rad,
  sightingOf,
  withBearing,
} from '../../test-support/sighting-fixture';
import type { Sighting } from '../incident/sighting';
import { ALPHABET, groupCode } from './alphabet';
import { checkSymbols } from './gf31-check';
import { CODE_LENGTH, decodeSighting, encodeSighting } from './sighting-code';

const PARAMETERS = defaultParameters();

const decodeOk = (text: string): Sighting => {
  const result = decodeSighting(text, PARAMETERS);
  if (!result.ok) throw new Error(`decode failed: ${result.reason}`);
  return result.value;
};
const reasonOf = (text: string): string | null => {
  const result = decodeSighting(text, PARAMETERS);
  return result.ok ? null : result.reason;
};
const encodeOk = (sighting: Sighting): string => {
  const result = encodeSighting(sighting);
  if (!result.ok) throw new Error(`encode failed: ${result.reason} ${result.field ?? ''}`);
  return result.value;
};

/** `code` with the symbol at 0-based `index` replaced. */
const replaceAt = (code: string, index: number, symbol: string) =>
  code.slice(0, index) + symbol + code.slice(index + 1);

/** The same word with its four check symbols recomputed (for a frame of another version or kind). */
function withValidCheck(first46: string): string {
  const check = checkSymbols(first46);
  if (!check.ok) throw new Error('check');
  return first46 + check.value;
}

describe('the fixture of design §8.7', () => {
  it('has the three examples, each of 50 symbols that begin 32 and are payload then check', () => {
    expect(FIXTURE.examples.map((e) => e.name)).toEqual(['A', 'B', 'C']);
    expect(CODE_LENGTH).toBe(50);
    for (const e of FIXTURE.examples) {
      expect(e.code).toHaveLength(50);
      expect(e.code).toBe(`32${e.payload}${e.check}`);
      expect(groupCode(e.code)).toBe(e.codeGrouped);
    }
  });
});

describe('encodeSighting and decodeSighting: the three worked examples (Req 8.4, 8.11)', () => {
  for (const example of FIXTURE.examples) {
    it(`example ${example.name} encodes to exactly its code, byte for byte`, () => {
      expect(encodeSighting(sightingOf(example.input))).toEqual({ ok: true, value: example.code });
    });

    it(`example ${example.name} decodes to exactly its values`, () => {
      const sighting = decodeOk(example.code);
      expect(sighting.incidentId).toBe(example.input.incidentId);
      expect(sighting.sightingId).toBe(example.input.sightingId);
      expect(sighting.bearing.id).toBe(example.input.sightingId);
      expect(sighting.origin).toBe('received');
      expect(sighting.receivedUtcMs).toBeNull();
      const b = sighting.bearing;
      expect(Math.abs(deg(b.observer.latRad) - example.decoded.latDeg)).toBeLessThan(1e-9);
      expect(Math.abs(deg(b.observer.lonRad) - example.decoded.lonDeg)).toBeLessThan(1e-9);
      expect(b.timeUtcMs).toBe(example.decoded.timeUtcMs);
      expect(Math.abs(deg(b.azimuthRad) - example.decoded.azimuthDeg)).toBeLessThan(1e-9);
      expect(b.azimuthSigmaRad).toBe(rad(example.decoded.azimuthSigmaDeg));
      expect(b.positionAccuracyM).toBe(example.decoded.positionAccuracyM);
    });

    it(`example ${example.name} is a fixed point: encode(decode(code)) is the code`, () => {
      expect(encodeSighting(decodeOk(example.code))).toEqual({ ok: true, value: example.code });
    });

    it(`example ${example.name} decodes alike in groups, broken across lines and with spaces`, () => {
      const expected = decodeOk(example.code);
      expect(decodeOk(example.codeGrouped)).toEqual(expected);
      expect(decodeOk(groupCode(example.code).replaceAll('-', '\n'))).toEqual(expected);
      expect(decodeOk(`  ${example.code.slice(0, 7)} \t ${example.code.slice(7)}\r\n`)).toEqual(
        expected,
      );
    });
  }

  it('says Simulation in the first symbol of example B\u2019s Incident id and not in the others', () => {
    expect(FIXTURE.examples.map((e) => e.input.incidentId[0])).toEqual(['K', 'Z', 'C']);
  });
});

describe('decodeSighting: the damage examples of design §8.7 (Req 8.5, 8.6)', () => {
  const code = (): string => exampleA().code;

  it('refuses the 8th symbol replaced by another', () => {
    expect(code()[7]).toBe('7');
    expect(decodeSighting(replaceAt(code(), 7, 'G'), PARAMETERS)).toEqual({
      ok: false,
      reason: 'code_damaged',
    });
  });

  it('refuses the 20th and 21st symbols swapped', () => {
    const c = code();
    expect([c[19], c[20]]).toEqual(['T', '3']);
    expect(reasonOf(c.slice(0, 19) + '3T' + c.slice(21))).toBe('code_damaged');
  });

  it('refuses the code cut to 49 symbols', () => {
    expect(reasonOf(code().slice(0, 49))).toBe('code_damaged');
  });

  it('refuses a lower-case symbol: no case folding (the 5th symbol G written g)', () => {
    expect(code()[4]).toBe('G');
    expect(reasonOf(replaceAt(code(), 4, 'g'))).toBe('code_damaged');
    expect(reasonOf(code().toLowerCase())).toBe('code_damaged');
  });

  it('refuses each of 0, 1, I, L and O in the place of a symbol: no look-alike mapping', () => {
    for (const lookAlike of ['0', '1', 'I', 'L', 'O']) {
      expect(reasonOf(replaceAt(code(), 9, lookAlike)), lookAlike).toBe('code_damaged');
    }
    // The look-alike of a real symbol is damage, not the symbol: 'O' is not '0' and not 'Q'.
    expect(reasonOf(code().replace('3', 'I'))).toBe('code_damaged');
  });

  it('refuses a character that is neither a symbol, a space nor a hyphen', () => {
    for (const other of ['_', '.', ',', '+', '/', '=', '%', '#', '\u0662', '\u00e9', '\ud800']) {
      expect(reasonOf(replaceAt(code(), 20, other)), other).toBe('code_damaged');
    }
  });
});

describe('decodeSighting: version, kind, empty text and length (Req 8.5, 8.7)', () => {
  const body = (): string => exampleA().code.slice(0, 46);

  it('says version unsupported for a version-2 frame with a valid check', () => {
    const frame = withValidCheck(`4${body().slice(1)}`);
    expect(reasonOf(frame)).toBe('code_version_unsupported');
    expect(decodeSighting(frame, PARAMETERS)).toEqual({
      ok: false,
      reason: 'code_version_unsupported',
    });
  });

  it('says unsupported, as for an unknown version, for a kind other than sighting', () => {
    expect(reasonOf(withValidCheck(`3${'3'}${body().slice(2)}`))).toBe('code_version_unsupported');
    expect(reasonOf(withValidCheck(`2${'2'}${body().slice(2)}`))).toBe('code_version_unsupported');
  });

  it('never says unsupported for a frame whose check is wrong: the check comes before the version', () => {
    const frame = withValidCheck(`4${body().slice(1)}`);
    // Every single-symbol change of the check or of the version symbol is damage.
    for (const symbol of ALPHABET) {
      if (symbol === frame[49]) continue;
      expect(reasonOf(replaceAt(frame, 49, symbol)), symbol).toBe('code_damaged');
    }
    for (const symbol of ALPHABET) {
      if (symbol === frame[0]) continue;
      expect(reasonOf(replaceAt(frame, 0, symbol)), symbol).toBe('code_damaged');
    }
  });

  it('reads the version before the length: a valid frame of version 2 and any length is unsupported', () => {
    expect(reasonOf(withValidCheck(`4${body().slice(1)}${'2'}`))).toBe('code_version_unsupported');
    expect(reasonOf(withValidCheck('42'))).toBe('code_version_unsupported');
  });

  it('reads the length after the version: version 1 with a valid check and a length other than 50 is damage', () => {
    expect(reasonOf(withValidCheck(`${body()}2`))).toBe('code_damaged');
    expect(reasonOf(withValidCheck(body().slice(0, 45)))).toBe('code_damaged');
    expect(reasonOf(withValidCheck('32'))).toBe('code_damaged');
  });

  it('says not a sighting for empty text and for text that is nothing but spaces and hyphens', () => {
    for (const empty of ['', ' ', '\n\t', '-', ' - -\n']) {
      expect(decodeSighting(empty, PARAMETERS), JSON.stringify(empty)).toEqual({
        ok: false,
        reason: 'code_not_a_sighting',
      });
    }
  });

  it('says damaged, not too short, for fewer than 6 symbols and for symbols that are not of the alphabet', () => {
    for (const short of ['2', '23456', 'abc', 'hello world']) {
      expect(reasonOf(short), short).toBe('code_damaged');
    }
    expect(reasonOf('234567')).toBe('code_damaged'); // six symbols with a wrong check
  });

  it('refuses text over MAX_CODE_LENGTH_CHARS before it reads anything, at and either side of 2 048', () => {
    expect(PARAMETERS.maxCodeLengthChars).toBe(2048);
    const junk = (n: number) => 'a'.repeat(n);
    expect(reasonOf(junk(2049))).toBe('code_too_long');
    expect(reasonOf(junk(2048))).toBe('code_damaged');
    expect(reasonOf(junk(2047))).toBe('code_damaged');
    // A valid code padded with spaces to 2 049 characters is too long, to 2 048 it is read.
    expect(reasonOf(`${exampleA().code}${' '.repeat(2049 - 50)}`)).toBe('code_too_long');
    expect(reasonOf(`${exampleA().code}${' '.repeat(2048 - 50)}`)).toBeNull();
    expect(reasonOf('')).toBe('code_not_a_sighting'); // the empty text is not too long
  });

  it('takes the limit from the parameters it is given', () => {
    const small = { ...PARAMETERS, maxCodeLengthChars: 100 };
    expect(decodeSighting('a'.repeat(101), small)).toEqual({ ok: false, reason: 'code_too_long' });
    expect(decodeSighting(exampleA().code, small).ok).toBe(true);
    expect(decodeSighting(groupCode(exampleA().code).repeat(2), small)).toEqual({
      ok: false,
      reason: 'code_too_long',
    });
  });

  it('names the parameter and fails with invalid_number for parameters that are not valid', () => {
    expect(
      decodeSighting(exampleA().code, { ...PARAMETERS, maxCodeLengthChars: Number.NaN }),
    ).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'maxCodeLengthChars',
    });
    expect(decodeSighting(exampleA().code, { ...PARAMETERS, requestTimeoutMs: -1 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'requestTimeoutMs',
    });
  });
});

describe('decodeSighting: a payload past the product of the radices (Req 8.5, design §8.1)', () => {
  /** The radices of design §8.1, in order: incident, sighting, latitude, longitude, time, azimuth, sigma, accuracy. */
  const RADICES = [
    31n ** 10n,
    31n ** 9n,
    17_800_000n,
    36_000_000n,
    631_152_000n,
    360_000n,
    4500n,
    10_001n,
  ];
  const PRODUCT = RADICES.reduce((a, b) => a * b, 1n);

  /** `n` as 44 base-31 digits, most significant first (an independent conversion). */
  function payloadOf(n: bigint): string {
    let rest = n;
    let digits = '';
    for (let i = 0; i < 44; i += 1) {
      digits = ALPHABET.charAt(Number(rest % 31n)) + digits;
      rest /= 31n;
    }
    if (rest !== 0n) throw new Error('does not fit 44 digits');
    return digits;
  }
  const frameOf = (n: bigint) => withValidCheck(`32${payloadOf(n)}`);

  it('has a product of 2^216.43 that fits 44 digits of base 31 with 1.55 bits to spare', () => {
    expect(PRODUCT).toBeLessThan(31n ** 44n);
    expect(PRODUCT).toBeGreaterThan(31n ** 43n);
  });

  it('refuses N equal to the product, and N above it, with a valid check and the right version', () => {
    expect(reasonOf(frameOf(PRODUCT))).toBe('code_damaged');
    expect(reasonOf(frameOf(PRODUCT + 1n))).toBe('code_damaged');
    expect(reasonOf(frameOf(31n ** 44n - 1n))).toBe('code_damaged');
  });

  it('accepts N one below the product: every field at its largest', () => {
    const sighting = decodeOk(frameOf(PRODUCT - 1n));
    expect(sighting.incidentId).toBe('ZZZZZZZZZZ');
    expect(sighting.sightingId).toBe('ZZZZZZZZZ');
    expect(sighting.bearing.timeUtcMs).toBe(2_398_377_599_500);
    expect(Math.abs(deg(sighting.bearing.observer.latRad) - 88.999995)).toBeLessThan(1e-9);
    expect(Math.abs(deg(sighting.bearing.observer.lonRad) - 179.999995)).toBeLessThan(1e-9);
    expect(Math.abs(deg(sighting.bearing.azimuthRad) - 359.9995)).toBeLessThan(1e-9);
    expect(sighting.bearing.azimuthSigmaRad).toBe(rad(45));
    expect(sighting.bearing.positionAccuracyM).toBe(10_000);
  });

  it('accepts N = 0: every field at its smallest', () => {
    const sighting = decodeOk(frameOf(0n));
    expect(sighting.incidentId).toBe('2222222222');
    expect(sighting.bearing.timeUtcMs).toBe(CODE_EPOCH_UTC_MS + 500);
    expect(Math.abs(deg(sighting.bearing.observer.latRad) + 88.999995)).toBeLessThan(1e-9);
    expect(Math.abs(deg(sighting.bearing.observer.lonRad) + 179.999995)).toBeLessThan(1e-9);
    expect(Math.abs(deg(sighting.bearing.azimuthRad) - 0.0005)).toBeLessThan(1e-9);
    expect(sighting.bearing.azimuthSigmaRad).toBe(rad(0.01));
    expect(sighting.bearing.positionAccuracyM).toBe(0);
  });
});

describe('encodeSighting: the boundaries of every field, by exact arithmetic (design §8.1)', () => {
  const lonOf = (sighting: Sighting) => deg(decodeOk(encodeOk(sighting)).bearing.observer.lonRad);
  const latOf = (sighting: Sighting) => deg(decodeOk(encodeOk(sighting)).bearing.observer.latRad);

  it('latitude: ±89° are the first and last cells, decoded at the cell centre, 0.556 m from the edge', () => {
    const north = withBearing({ observer: { latRad: MAX_LAT_RAD, lonRad: 0 } });
    const south = withBearing({ observer: { latRad: -MAX_LAT_RAD, lonRad: 0 } });
    expect(Math.abs(latOf(north) - 88.999995)).toBeLessThan(1e-9);
    expect(Math.abs(latOf(south) + 88.999995)).toBeLessThan(1e-9);
  });

  it('longitude: 180° is the last cell and the double just above -180° is the first', () => {
    expect(
      Math.abs(lonOf(withBearing({ observer: { latRad: 0.1, lonRad: Math.PI } })) - 179.999995),
    ).toBeLessThan(1e-9);
    const justAbove = -Math.PI + Number.EPSILON * 2;
    expect(justAbove).toBeGreaterThan(-Math.PI);
    expect(
      Math.abs(lonOf(withBearing({ observer: { latRad: 0.1, lonRad: justAbove } })) + 179.999995),
    ).toBeLessThan(1e-9);
  });

  it('time: the first millisecond of 2026 and the last of 2045 are in, one before and the end itself are out', () => {
    const at = (timeUtcMs: number) => encodeSighting(withBearing({ timeUtcMs }));
    expect(at(CODE_EPOCH_UTC_MS).ok).toBe(true);
    expect(at(CODE_EPOCH_UTC_MS + CODE_SPAN_MS - 1).ok).toBe(true);
    const before = at(CODE_EPOCH_UTC_MS - 1);
    expect(before).toMatchObject({ ok: false, reason: 'invalid_observation', field: 'timeUtcMs' });
    const end = at(CODE_EPOCH_UTC_MS + CODE_SPAN_MS);
    expect(end).toMatchObject({ ok: false, reason: 'invalid_observation', field: 'timeUtcMs' });
    expect(
      decodeOk(encodeOk(withBearing({ timeUtcMs: CODE_EPOCH_UTC_MS }))).bearing.timeUtcMs,
    ).toBe(CODE_EPOCH_UTC_MS + 500);
    expect(
      decodeOk(encodeOk(withBearing({ timeUtcMs: CODE_EPOCH_UTC_MS + 999 }))).bearing.timeUtcMs,
    ).toBe(CODE_EPOCH_UTC_MS + 500);
    expect(
      decodeOk(encodeOk(withBearing({ timeUtcMs: CODE_EPOCH_UTC_MS + 1000 }))).bearing.timeUtcMs,
    ).toBe(CODE_EPOCH_UTC_MS + 1500);
  });

  it('azimuth: 0 and the largest double below 2π are in the first and the last cell', () => {
    const first = decodeOk(encodeOk(withBearing({ azimuthRad: 0 })));
    expect(Math.abs(deg(first.bearing.azimuthRad) - 0.0005)).toBeLessThan(1e-9);
    const last = decodeOk(encodeOk(withBearing({ azimuthRad: 2 * Math.PI - 1e-12 })));
    expect(Math.abs(deg(last.bearing.azimuthRad) - 359.9995)).toBeLessThan(1e-9);
    const next = 2 * Math.PI - Number.EPSILON * 4;
    expect(
      Math.abs(
        deg(decodeOk(encodeOk(withBearing({ azimuthRad: next }))).bearing.azimuthRad) - 359.9995,
      ),
    ).toBeLessThan(1e-9);
  });

  it('sigma and accuracy are rounded up and never down, and a decoded value is a fixed point', () => {
    for (const sigmaDeg of [0.01, 0.0100001, 0.011, 1.999999, 2, 2.0000001, 44.99, 45]) {
      const sigmaRad = rad(sigmaDeg);
      const decoded = decodeOk(encodeOk(withBearing({ azimuthSigmaRad: sigmaRad })));
      expect(decoded.bearing.azimuthSigmaRad, `${sigmaDeg}`).toBeGreaterThanOrEqual(sigmaRad);
      expect(decoded.bearing.azimuthSigmaRad - sigmaRad).toBeLessThan(rad(0.01));
      expect(encodeOk(decoded)).toBe(encodeOk(withBearing({ azimuthSigmaRad: sigmaRad })));
    }
    for (const accuracyM of [0, 0.000001, 0.5, 1, 1.0000001, 7.999999, 8, 9999.5, MAX_ACCURACY_M]) {
      const decoded = decodeOk(encodeOk(withBearing({ positionAccuracyM: accuracyM })));
      expect(decoded.bearing.positionAccuracyM, `${accuracyM}`).toBe(Math.ceil(accuracyM));
    }
  });

  it('turns -0 into 0 in every field and never writes a minus sign into a code', () => {
    const decoded = decodeOk(encodeOk(withBearing({ positionAccuracyM: -0, azimuthRad: -0 })));
    expect(Object.is(decoded.bearing.positionAccuracyM, 0)).toBe(true);
    expect(Math.abs(deg(decoded.bearing.azimuthRad) - 0.0005)).toBeLessThan(1e-9);
  });

  it('does not move the position by more than a metre', () => {
    const original = withBearing({});
    const decoded = decodeOk(encodeOk(original));
    const moved = greatCircleDistanceM(original.bearing.observer, decoded.bearing.observer);
    expect(moved.ok && moved.value).toBeLessThan(1);
    expect(moved.ok && moved.value).toBeGreaterThan(0);
  });
});

describe('encodeSighting: what it refuses (Req 8.1, design §8.2)', () => {
  it('fails with Core\u2019s failure, unchanged, for a Bearing Core does not accept', () => {
    const result = encodeSighting(withBearing({ azimuthRad: Number.NaN }));
    expect(result).toEqual({
      ok: false,
      reason: 'invalid_observation',
      field: 'azimuthRad',
      id: 'H4TN9RV6C',
    });
    expect(encodeSighting(withBearing({ azimuthSigmaRad: rad(46) }))).toMatchObject({
      ok: false,
      reason: 'invalid_observation',
      field: 'azimuthSigmaRad',
    });
  });

  it('fails with invalid_number naming sightingId when it differs from the Bearing\u2019s id', () => {
    const sighting = { ...withBearing({}), sightingId: 'ZZZZZZZZZ' };
    expect(encodeSighting(sighting)).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'sightingId',
    });
  });

  it('fails with invalid_number naming sightingId for an id that is not nine symbols of the alphabet', () => {
    for (const id of [
      'bearing-1790000000000',
      'H4TN9RV6',
      'H4TN9RV6CC',
      'h4tn9rv6c',
      'H4TN9RV60',
    ]) {
      const sighting = { ...withBearing({ id }), sightingId: id };
      expect(encodeSighting(sighting), id).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'sightingId',
      });
    }
  });

  it('fails with Core\u2019s failure naming id for an empty id, which Core refuses first', () => {
    const sighting = { ...withBearing({ id: '' }), sightingId: '' };
    expect(encodeSighting(sighting)).toMatchObject({
      ok: false,
      reason: 'invalid_observation',
      field: 'id',
    });
  });

  it('fails with invalid_number naming incidentId for an id that is not ten symbols of the alphabet', () => {
    for (const incidentId of ['', 'K7PQ3MWXA', 'K7PQ3MWXA22', 'k7pq3mwxa2', 'K7PQ3MWXA0']) {
      expect(encodeSighting(withBearing({}, incidentId)), incidentId).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'incidentId',
      });
    }
  });

  it('codes nothing of the origin and the receive time: they do not change the code', () => {
    const local = withBearing({});
    const received: Sighting = { ...local, origin: 'received', receivedUtcMs: 1_790_000_999_000 };
    expect(encodeSighting(received)).toEqual(encodeSighting(local));
  });
});
