// Shared fast-check generators (design §11, "Generators"). Each documents the domain it draws
// from and what it excludes (testing.md rule 4). Test support, not exported. The helpers
// `uniform`, `closed` and `uniformInteger` are copies of UI's.

import type { Bearing } from '@alidade/core';
import fc from 'fast-check';
import type { Sighting } from '../math/incident/sighting';

const TWO_POW_53 = 2 ** 53;
const DEG = Math.PI / 180;

/**
 * A double drawn uniformly from [min, max). `fc.double` is not used for this: it draws evenly
 * over the representable doubles, so most of its draws are tiny in magnitude. 53 random bits
 * give a uniform fraction; `noBias` stops fast-check favouring small integers (and so `min`).
 */
export function uniform(min: number, max: number): fc.Arbitrary<number> {
  return fc.noBias(fc.integer({ min: 0, max: TWO_POW_53 - 1 })).map((n) => {
    const value = min + (max - min) * (n / TWO_POW_53);
    return value < max ? value : min; // rounding can reach max; keep the interval half-open
  });
}

/** A double uniform in [min, max], with both ends drawn on purpose (one draw in ten). */
export function closed(min: number, max: number): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(min, max) },
    { weight: 9, arbitrary: uniform(min, max) },
  );
}

/** An integer uniform in [min, max] (`noBias`, so that the ends are not favoured). */
export function uniformInteger(min: number, max: number): fc.Arbitrary<number> {
  return fc.noBias(fc.integer({ min, max }));
}

// ---------------------------------------------------------------------------------------------
// The sighting code's ranges (design §8.1), written out here as the domain of the generators.

/** The alphabet of design §7.2 (31 symbols: digits 2 to 9 and the letters but I, L, O). */
export const ALPHABET_FOR_TESTS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** The first instant a code holds: 2026-01-01T00:00:00Z. */
export const CODE_EPOCH_UTC_MS = 1_767_225_600_000;
/** The code holds 20 years from the epoch: 631 152 000 seconds, the end excluded. */
export const CODE_SPAN_MS = 631_152_000 * 1000;
/** Core's latitude limit of the Supported positions: 89°. */
export const MAX_LAT_RAD = (89 * Math.PI) / 180;
/** The smallest and the largest azimuth 1-sigma Core accepts: 0.01° and 45°. */
export const MIN_SIGMA_RAD = 0.01 * DEG;
export const MAX_SIGMA_RAD = 45 * DEG;
/** The largest position accuracy Core accepts. */
export const MAX_ACCURACY_M = 10_000;

/** The double just above `x`. */
function nextUp(x: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigInt64(0, view.getBigInt64(0) + (x < 0 ? -1n : 1n));
  return view.getFloat64(0);
}

/**
 * `byteSource`: a `Uint8Array` of 0 to 64 bytes in four shapes (uniform random, all `0x00`, all
 * `0xFF`, a repeated two-byte pattern), with at least 18 bytes in four draws of five (the
 * shorter ones are the examples of `invalid_number`). Excludes more than 64 bytes.
 */
export function byteSource(): fc.Arbitrary<Uint8Array> {
  const length = fc.oneof(
    { weight: 4, arbitrary: uniformInteger(18, 64) },
    { weight: 1, arbitrary: uniformInteger(0, 17) },
  );
  return fc
    .tuple(
      length,
      fc.constantFrom('random', 'zeros', 'ones', 'pattern'),
      fc.uint8Array({ minLength: 64, maxLength: 64 }),
    )
    .map(([count, shape, random]) => {
      const bytes = new Uint8Array(count);
      for (let i = 0; i < count; i += 1) {
        if (shape === 'random') bytes[i] = random[i] ?? 0;
        else if (shape === 'zeros') bytes[i] = 0x00;
        else if (shape === 'ones') bytes[i] = 0xff;
        else bytes[i] = random[i % 2] ?? 0;
      }
      return bytes;
    });
}

/** `symbols(n)`: `n` symbols uniform over the alphabet; the first and the last symbol of it are drawn often. */
export function symbols(count: number): fc.Arbitrary<string> {
  const symbol = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom('2', 'Z') },
    { weight: 6, arbitrary: uniformInteger(0, 30).map((i) => ALPHABET_FOR_TESTS.charAt(i)) },
  );
  return fc.array(symbol, { minLength: count, maxLength: count }).map((cs) => cs.join(''));
}

/**
 * `codeBearing`: a Core-valid Bearing inside the code's ranges. Observer latitude in [-89°, 89°]
 * and longitude in (-180°, 180°] (closed: both latitude limits, 180° and the double just above
 * -180° drawn), time in [epoch, epoch + 20 years) in whole milliseconds (the first and the last
 * millisecond drawn), azimuth in [0, 2π) (0 and 2π − 1e-12 drawn), 1-sigma in [0.01°, 45°] (both
 * limits drawn), position accuracy in [0, 10 000] m (both ends drawn), `id` a Sighting id of nine
 * symbols. Excludes positions within 1° of a pole, azimuths outside [0, 2π), times outside the
 * 20 years.
 */
export function codeBearing(): fc.Arbitrary<Bearing> {
  const latRad = closed(-MAX_LAT_RAD, MAX_LAT_RAD);
  const lonRad = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(Math.PI, nextUp(-Math.PI)) },
    { weight: 9, arbitrary: uniform(-Math.PI, Math.PI).filter((x) => x > -Math.PI) },
  );
  const timeUtcMs = fc.oneof(
    {
      weight: 1,
      arbitrary: fc.constantFrom(CODE_EPOCH_UTC_MS, CODE_EPOCH_UTC_MS + CODE_SPAN_MS - 1),
    },
    {
      weight: 9,
      arbitrary: uniformInteger(CODE_EPOCH_UTC_MS, CODE_EPOCH_UTC_MS + CODE_SPAN_MS - 1),
    },
  );
  const azimuthRad = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(0, 2 * Math.PI - 1e-12) },
    { weight: 9, arbitrary: uniform(0, 2 * Math.PI) },
  );
  return fc
    .record({
      id: symbols(9),
      latRad,
      lonRad,
      positionAccuracyM: closed(0, MAX_ACCURACY_M),
      timeUtcMs,
      azimuthRad,
      azimuthSigmaRad: closed(MIN_SIGMA_RAD, MAX_SIGMA_RAD),
    })
    .map(({ id, latRad: lat, lonRad: lon, ...rest }): Bearing => ({
      id,
      observer: { latRad: lat, lonRad: lon },
      ...rest,
    }));
}

/**
 * `sightingArb`: a Sighting on a `codeBearing`, `sightingId` equal to the Bearing's id, an
 * Incident id of ten symbols (the first symbol `Z`, a Simulation Incident, one draw in four),
 * `origin` each of the two, `receivedUtcMs` `null` for a local one and a finite time in the
 * code's 20 years for a received one.
 */
export function sightingArb(): fc.Arbitrary<Sighting> {
  const incidentId = fc.oneof(
    { weight: 1, arbitrary: symbols(9).map((rest) => `Z${rest}`) },
    {
      weight: 3,
      arbitrary: fc
        .tuple(uniformInteger(0, 29), symbols(9))
        .map(([first, rest]) => `${ALPHABET_FOR_TESTS.charAt(first)}${rest}`),
    },
  );
  const received = uniformInteger(CODE_EPOCH_UTC_MS, CODE_EPOCH_UTC_MS + CODE_SPAN_MS - 1);
  return fc
    .tuple(codeBearing(), incidentId, fc.boolean(), received)
    .map(([bearing, incident, isLocal, receivedUtcMs]): Sighting => ({
      sightingId: bearing.id,
      incidentId: incident,
      bearing,
      origin: isLocal ? 'local' : 'received',
      receivedUtcMs: isLocal ? null : receivedUtcMs,
    }));
}

/**
 * `pageAddress` (Req 10.9): the address of the page. Domain: three in four are `https://` with a
 * host of 1 to 5 labels of 1 to 12 characters of `[a-z0-9-]` (a label starts and ends with a
 * letter or a digit), 0 to 4 path segments of 1 to 8 characters of `[a-z0-9._~-]`, an optional
 * query of 1 to 3 `name=value` pairs and an optional fragment; one in four is the same on
 * `http://localhost` with an optional port. Excludes the other schemes, user information, upper
 * case, and whitespace. Addresses longer than 109 characters occur: they make the link too long.
 */
export function pageAddress(): fc.Arbitrary<string> {
  const alnum = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789');
  const label = fc
    .tuple(
      alnum,
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'), { maxLength: 10 }),
      alnum,
    )
    .map(([first, middle, last]) => `${first}${middle.join('')}${last}`);
  const host = fc.array(label, { minLength: 1, maxLength: 5 }).map((labels) => labels.join('.'));
  const segment = fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._~-'), {
      minLength: 1,
      maxLength: 8,
    })
    .map((cs) => cs.join(''));
  const path = fc.array(segment, { maxLength: 4 }).map((segments) => `/${segments.join('/')}`);
  const word = fc.array(alnum, { minLength: 1, maxLength: 6 }).map((cs) => cs.join(''));
  const query = fc
    .array(fc.tuple(word, word), { maxLength: 3 })
    .map((pairs) => (pairs.length === 0 ? '' : `?${pairs.map(([k, v]) => `${k}=${v}`).join('&')}`));
  const fragment = fc.oneof(
    fc.constant(''),
    word.map((w) => `#${w}`),
  );
  const port = fc.oneof(
    fc.constant(''),
    uniformInteger(1024, 65535).map((p) => `:${p}`),
  );
  return fc.oneof(
    {
      weight: 3,
      arbitrary: fc
        .tuple(host, path, query, fragment)
        .map(([h, p, q, f]) => `https://${h}${p}${q}${f}`),
    },
    {
      weight: 1,
      arbitrary: fc
        .tuple(port, path, query, fragment)
        .map(([pt, p, q, f]) => `http://localhost${pt}${p}${q}${f}`),
    },
  );
}
