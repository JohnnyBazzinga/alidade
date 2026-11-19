// Shared fast-check generators (design §11, "Generators"). Each documents the domain it draws
// from and what it excludes (testing.md rule 4). Test support, not exported. The helpers
// `uniform`, `closed` and `uniformInteger` are copies of UI's.

import {
  destinationPosition,
  greatCircleDistanceM,
  initialAzimuthRad,
  type Bearing,
  type Fix,
  type Position,
} from '@alidade/core';
import fc from 'fast-check';
import type { Incident } from '../math/incident/incident-state';
import type { Sighting } from '../math/incident/sighting';
import { entryOfBearing, incidentOfEntries } from './geometry-fixtures';
import { NOW_UTC_MS, ORIGIN, sightingIdOf } from './incident-fixtures';

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

// ---------------------------------------------------------------------------------------------
// Sets of Bearings for the assessment and the advice (design §11).

export interface BearingSet {
  readonly target: Position;
  readonly bearings: readonly Bearing[];
}

/** The angle at which the lines of two Bearings cross, in `[0, π/2]` (a line has no direction). */
export function crossingRad(a: Bearing, b: Bearing): number {
  const difference = Math.abs(wrapPiOf(a.azimuthRad - b.azimuthRad));
  return Math.min(difference, Math.PI - difference);
}

function wrapPiOf(angleRad: number): number {
  const twoPi = 2 * Math.PI;
  const wrapped = ((angleRad % twoPi) + twoPi) % twoPi;
  return wrapped > Math.PI ? wrapped - twoPi : wrapped;
}

/** The largest crossing angle over every pair (0 for fewer than two Bearings). */
export function largestCrossingRad(bearings: readonly Bearing[]): number {
  let largest = 0;
  for (let i = 0; i < bearings.length; i += 1) {
    for (let j = i + 1; j < bearings.length; j += 1) {
      largest = Math.max(largest, crossingRad(bearings[i] as Bearing, bearings[j] as Bearing));
    }
  }
  return largest;
}

/** The smallest crossing angle over every pair (π/2 for fewer than two Bearings). */
export function smallestCrossingRad(bearings: readonly Bearing[]): number {
  let smallest = Math.PI / 2;
  for (let i = 0; i < bearings.length; i += 1) {
    for (let j = i + 1; j < bearings.length; j += 1) {
      smallest = Math.min(smallest, crossingRad(bearings[i] as Bearing, bearings[j] as Bearing));
    }
  }
  return smallest;
}

function destination(from: Position, azimuthRad: number, distanceM: number): Position {
  const result = destinationPosition(from, azimuthRad, distanceM);
  if (!result.ok) throw new Error('destinationPosition failed');
  return result.value;
}

function azimuthTo(from: Position, to: Position): number {
  const result = initialAzimuthRad(from, to);
  if (!result.ok) throw new Error('initialAzimuthRad failed');
  return result.value;
}

/**
 * `consistentBearings(count)` (Req 5.12, 5.13, 7.7): a target within 20 km of the synthetic origin
 * (`30° N, 40° W`); `count` observers each 500 m to 15 km from it at a uniform azimuth; every
 * Bearing points exactly at the target with a 1-sigma in `[0.5°, 3°]` and a position accuracy in
 * `[1, 20]` m, taken at the same time, with ids from `sightingIdOf`. It does not discard
 * anything itself: the property rejects the sets whose largest crossing angle is under 30° (or
 * whose every pair is not at least 30°) with `fc.pre`, so that the discards are counted; an
 * example covers a set of 2°.
 */
export function consistentBearings(
  count: number,
  sigmaRangeDeg: readonly [number, number] = [0.5, 3],
): fc.Arbitrary<BearingSet> {
  const observer = fc.tuple(
    closed(0, 2 * Math.PI),
    closed(500, 15_000),
    closed(sigmaRangeDeg[0], sigmaRangeDeg[1]),
    closed(1, 20),
  );
  return fc
    .tuple(
      closed(0, 2 * Math.PI),
      closed(0, 20_000),
      fc.array(observer, { minLength: count, maxLength: count }),
    )
    .map(([targetAzimuthRad, targetRangeM, observers]) => {
      const target = destination(ORIGIN, targetAzimuthRad, targetRangeM);
      const bearings = observers.map(
        ([azimuthRad, rangeM, sigmaDeg, accuracyM], index): Bearing => {
          const from = destination(target, azimuthRad, rangeM);
          return {
            id: sightingIdOf(index + 1),
            observer: from,
            positionAccuracyM: accuracyM,
            timeUtcMs: NOW_UTC_MS - 60_000,
            azimuthRad: azimuthTo(from, target),
            azimuthSigmaRad: sigmaDeg * DEG,
          };
        },
      );
      return { target, bearings };
    });
}

export interface SightingSet {
  readonly incident: Incident;
  readonly nowUtcMs: number;
}

/**
 * `sightingSet` (Req 5.10, 5.11): an Incident of 2 to 12 Sightings from observers within 20 km of
 * the origin, pointing at a target within 20 km of it with an error that is 0 in two draws of
 * three, uniform in ±30° in most of the rest, and a uniform azimuth one draw in twelve (so that
 * disagreements and divergence occur); 1-sigma in `[0.5°, 3°]`; times from `now − 4 h` to `now +
 * 10 min` (so some are older than `maxIncidentAgeMs` and some later than `now +
 * clockSkewToleranceMs`); `hidden` one draw in six; the Incident created between `now − 4 h` and
 * `now`. `now` is `NOW_UTC_MS`. Excludes fewer than two or more than twelve Sightings, and an
 * observer within 1 m of the target (it cannot sight it; `assess.test.ts` has its example).
 */
export function sightingSet(): fc.Arbitrary<SightingSet> {
  const hours = 3_600_000;
  const entry = fc.tuple(
    closed(0, 2 * Math.PI),
    closed(0, 20_000),
    fc.oneof(
      { weight: 8, arbitrary: fc.constant(0) },
      { weight: 3, arbitrary: closed(-30 * DEG, 30 * DEG) },
      { weight: 1, arbitrary: closed(0, 2 * Math.PI) },
    ),
    closed(0.5, 3),
    uniformInteger(NOW_UTC_MS - 4 * hours, NOW_UTC_MS + 600_000),
    fc.integer({ min: 0, max: 5 }).map((x) => x === 0),
  );
  return fc
    .tuple(
      closed(0, 2 * Math.PI),
      closed(0, 20_000),
      fc.array(entry, { minLength: 2, maxLength: 12 }),
      uniformInteger(NOW_UTC_MS - 4 * hours, NOW_UTC_MS),
    )
    .filter(([targetAzimuthRad, targetRangeM, entries]) => {
      const target = destination(ORIGIN, targetAzimuthRad, targetRangeM);
      return entries.every(([azimuthRad, rangeM]) => {
        const apart = greatCircleDistanceM(destination(ORIGIN, azimuthRad, rangeM), target);
        return apart.ok && apart.value >= 1;
      });
    })
    .map(([targetAzimuthRad, targetRangeM, entries, createdUtcMs]) => {
      const target = destination(ORIGIN, targetAzimuthRad, targetRangeM);
      const built = entries.map(
        ([azimuthRad, rangeM, errorRad, sigmaDeg, timeUtcMs, hidden], index) => {
          const from = destination(ORIGIN, azimuthRad, rangeM);
          const pointing = azimuthTo(from, target) + errorRad;
          const bearing: Bearing = {
            id: sightingIdOf(index + 1),
            observer: from,
            positionAccuracyM: 8,
            timeUtcMs,
            azimuthRad: wrapTwoPiOf(pointing),
            azimuthSigmaRad: sigmaDeg * DEG,
          };
          return entryOfBearing(index + 1, bearing, hidden);
        },
      );
      return { incident: incidentOfEntries(built, createdUtcMs), nowUtcMs: NOW_UTC_MS };
    });
}

function wrapTwoPiOf(angleRad: number): number {
  const twoPi = 2 * Math.PI;
  return ((angleRad % twoPi) + twoPi) % twoPi;
}

/**
 * A Fix built directly from a Position and an Ellipse (as UI's `fixAround`), with the covariance
 * that the Ellipse describes, no residuals and the given warnings.
 */
export function fixOf(
  position: Position,
  ellipse: {
    readonly semiMajorM: number;
    readonly semiMinorM: number;
    readonly azimuthRad: number;
  },
  warnings: readonly ('poor_geometry' | 'outliers_excluded')[] = [],
): Fix {
  const { semiMajorM: a, semiMinorM: b, azimuthRad: mu } = ellipse;
  // The major axis is the unit vector (sin μ, cos μ) in (east, north); the minor one is at right angles.
  const ue = Math.sin(mu);
  const un = Math.cos(mu);
  return {
    position,
    covariance: {
      varEastM2: a * a * ue * ue + b * b * un * un,
      varNorthM2: a * a * un * un + b * b * ue * ue,
      covEastNorthM2: (a * a - b * b) * ue * un,
    },
    ellipse: { semiMajorM: a, semiMinorM: b, azimuthRad: mu },
    residuals: [],
    iterations: 3,
    warnings,
    excludedIds: [],
  };
}

/**
 * `fixCase` (design §11): a Fix built directly. Domain: the position's latitude in [-84°, 84°]
 * and longitude in (-180°, 180°) (as UI's `mapPosition`), the 1-sigma semi-major axis
 * log-uniform in [1, 100 000] m with both ends drawn, the semi-minor axis in [1, semi-major]
 * (equal to it, a circle, one draw in six), the azimuth of the major axis in [0, π), and the
 * warnings `[]` or `['poor_geometry']`. Only the Ellipse, the Position and the warnings are read by
 * the functions it feeds.
 */
export function fixCase(): fc.Arbitrary<Fix> {
  return fc
    .tuple(
      closed(-84 * DEG, 84 * DEG),
      uniform(-Math.PI, Math.PI).filter((x) => x > -Math.PI),
      fc.oneof(
        { weight: 1, arbitrary: fc.constantFrom(1, 100_000) },
        { weight: 9, arbitrary: uniform(0, 5).map((e) => 10 ** e) },
      ),
      fc.oneof({ weight: 1, arbitrary: fc.constant(1) }, { weight: 5, arbitrary: closed(0, 1) }),
      uniform(0, Math.PI),
      fc.oneof(
        { weight: 3, arbitrary: fc.constant([] as const) },
        { weight: 1, arbitrary: fc.constant(['poor_geometry'] as const) },
      ),
    )
    .map(([latRad, lonRad, a, fraction, mu, warnings]) =>
      fixOf(
        { latRad, lonRad },
        { semiMajorM: a, semiMinorM: Math.max(1, 1 + fraction * (a - 1)), azimuthRad: mu },
        warnings,
      ),
    );
}
