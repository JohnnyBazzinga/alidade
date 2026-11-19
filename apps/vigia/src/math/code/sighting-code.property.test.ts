// P-8.8, P-8.9 and P-8.10 (Req 8.6, 8.8, 8.9, 8.10, design §11). The tolerances are the
// requirements' own: 1 m, 1 s, 0.001 degrees, and 0.01 degrees and 1 m for the two uncertainties.

import { angularDifference, degToRad, greatCircleDistanceM, radToDeg } from '@alidade/core';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import {
  ALPHABET_FOR_TESTS,
  sightingArb,
  symbols,
  uniformInteger,
} from '../../test-support/generators';
import { hostileString } from '../../test-support/hostile';
import { cappedRuns, isDeepRun } from '../../test-support/fast-check-setup';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { canonicalise } from '../incident/sighting';
import { defaultParameters } from '../parameters';
import { stripCode } from './alphabet';
import { CODE_LENGTH, decodeSighting, encodeSighting } from './sighting-code';

const PARAMETERS = defaultParameters();
const DEG = Math.PI / 180;
/** 0.01 degrees in radians, by Core's own conversion. */
const SIGMA_STEP_RAD = (() => {
  const step = degToRad(0.01);
  if (!step.ok) throw new Error('degToRad failed');
  return step.value;
})();

/** The code of a Sighting that the generator made: always encodable, or the test fails. */
function codeOf(sighting: Parameters<typeof encodeSighting>[0]): string {
  const result = encodeSighting(sighting);
  if (!result.ok) throw new Error(`encode failed: ${result.reason} ${result.field ?? ''}`);
  return result.value;
}

describe('P-8.8: the round trip (Req 8.4, 8.8)', () => {
  // Generator: `sightingArb` (valid Sightings: observers within the Supported positions, azimuths
  // in [0, 2π), sigmas in [0.01°, 45°], accuracies in [0, 10 000] m, times in the code's 20
  // years, any valid ids; every limit drawn). Excludes everything else: the examples of
  // sighting-code.test.ts cover the refusals.
  it('decodes to a valid Bearing within 1 m, 1 s and 0.001 degrees, with uncertainties that are never lower', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-8.8',
      fc.property(sightingArb(), (s) => {
        const decoded = decodeSighting(codeOf(s), PARAMETERS);
        if (!decoded.ok) throw new Error(`decode failed: ${decoded.reason}`);
        const d = decoded.value;
        const b = s.bearing;
        const e = d.bearing;
        const move = greatCircleDistanceM(b.observer, e.observer);
        if (!move.ok) throw new Error('greatCircleDistanceM failed');
        const moveM = move.value;
        tracker.record('position (m)', moveM, '1 m');
        tracker.record('time (s)', Math.abs(e.timeUtcMs - b.timeUtcMs) / 1000, '1 s');
        // The difference of two angles is wrapPi(a - b), never a direct subtraction.
        const azimuthShift = angularDifference(e.azimuthRad, b.azimuthRad);
        if (!azimuthShift.ok) throw new Error('angularDifference failed');
        const azimuthDeg = radToDeg(Math.abs(azimuthShift.value));
        if (!azimuthDeg.ok) throw new Error('radToDeg');
        tracker.record('azimuth (deg)', azimuthDeg.value, '0.001°');
        if (!(moveM <= 1)) throw new Error(`moved ${moveM} m`);
        if (!(Math.abs(e.timeUtcMs - b.timeUtcMs) <= 1000))
          throw new Error('time moved more than 1 s');
        if (!(azimuthDeg.value <= 0.001)) throw new Error(`azimuth moved ${azimuthDeg.value}°`);
        // The uncertainties never go down, and go up by less than 0.01° and 1 m.
        if (!(e.azimuthSigmaRad >= b.azimuthSigmaRad)) throw new Error('sigma lowered');
        if (!(e.azimuthSigmaRad - b.azimuthSigmaRad < SIGMA_STEP_RAD))
          throw new Error('sigma raised too much');
        if (!(e.positionAccuracyM >= b.positionAccuracyM)) throw new Error('accuracy lowered');
        if (!(e.positionAccuracyM - b.positionAccuracyM < 1))
          throw new Error('accuracy raised too much');
        tracker.record(
          'sigma raised (deg)',
          (e.azimuthSigmaRad - b.azimuthSigmaRad) / DEG,
          '0.01°',
        );
        tracker.record('accuracy raised (m)', e.positionAccuracyM - b.positionAccuracyM, '1 m');
        if (d.sightingId !== s.sightingId || d.incidentId !== s.incidentId || e.id !== b.id) {
          throw new Error('an id changed');
        }
      }),
      tracker,
    );
  });
});

describe('P-8.9: the canonical form is a fixed point (Req 8.9)', () => {
  // Generator: `sightingArb`. Excludes invalid Sightings. The link is the page address, `#` and
  // the code: the longest page address that keeps it at most 160 characters is 109 characters,
  // checked here by length (the link builder is task 3.9's).
  it('encode(decode(encode(s))) is encode(s); the code has 50 symbols; a link on 109 characters is at most 160', () => {
    checkProperty(
      'P-8.9',
      fc.property(sightingArb(), (s) => {
        const code = codeOf(s);
        const decoded = decodeSighting(code, PARAMETERS);
        if (!decoded.ok) throw new Error('decode failed');
        const again = codeOf(decoded.value);
        if (again !== code) throw new Error(`not a fixed point: ${code} ${again}`);
        if (code.length !== CODE_LENGTH || CODE_LENGTH !== 50) throw new Error('not 50 symbols');
        if (![...code].every((c) => ALPHABET_FOR_TESTS.includes(c)))
          throw new Error('a character outside the alphabet');
        if (!code.startsWith('32')) throw new Error('version and kind');
        // canonicalise is idempotent and a fixed point (design §7.3), and agrees with the code.
        const once = canonicalise(s, PARAMETERS);
        if (!once.ok || once.value.code !== code)
          throw new Error('canonicalise does not give the code');
        const twice = canonicalise(once.value.sighting, PARAMETERS);
        if (!twice.ok || JSON.stringify(twice.value) !== JSON.stringify(once.value)) {
          throw new Error('canonicalise is not idempotent');
        }
        if (
          once.value.sighting.origin !== s.origin ||
          once.value.sighting.receivedUtcMs !== s.receivedUtcMs
        ) {
          throw new Error('canonicalise changed the origin or the receive time');
        }
        const address = `https://${'a'.repeat(101)}`;
        if (address.length !== 109) throw new Error('the address is not 109 characters');
        if (`${address}#${code}`.length > PARAMETERS.maxLinkLengthChars)
          throw new Error('link too long');
      }),
      new ErrorTracker(),
    );
  });
});

describe('P-8.10 (a): every damage of a valid code is detected (Req 8.6, 8.10)', () => {
  // Generator: `sightingArb`; for each code, every single-symbol substitution by each of the 30
  // other symbols and by an outside character (`O` and `g`), every swap of two unequal
  // neighbours, 40 changes of two adjacent symbols at random places with random symbols (both
  // changed), every cut to 1 to 49 symbols and extensions by 1 to 3 symbols: about 1 700 decodes
  // a case. Every one is `code_damaged`: by the proof of design §8.4 for changes confined to
  // four adjacent symbols, and by the length check for a cut or an extension (the version and
  // the kind are intact). The place and the symbols of the random changes come from the case.
  it('is code_damaged for every substitution, swap, two-symbol change, cut and extension', () => {
    const ALL = [...ALPHABET_FOR_TESTS];
    let decodes = 0;
    checkProperty(
      'P-8.10 (a)',
      fc.property(
        sightingArb(),
        fc.array(fc.tuple(uniformInteger(0, 48), uniformInteger(0, 30), uniformInteger(0, 30)), {
          minLength: 40,
          maxLength: 40,
        }),
        (s, twoSymbolChanges) => {
          const code = codeOf(s);
          const damaged = (text: string, what: string) => {
            decodes += 1;
            const result = decodeSighting(text, PARAMETERS);
            if (result.ok || result.reason !== 'code_damaged') {
              throw new Error(
                `${what}: ${result.ok ? 'accepted' : result.reason}\n  code ${code}\n  text ${text}`,
              );
            }
          };
          for (let at = 0; at < code.length; at += 1) {
            for (const other of [...ALL, 'O', 'g']) {
              if (other === code[at]) continue;
              damaged(code.slice(0, at) + other + code.slice(at + 1), `symbol ${at} to ${other}`);
            }
          }
          for (let at = 0; at < code.length - 1; at += 1) {
            if (code[at] === code[at + 1]) continue;
            damaged(
              code.slice(0, at) + (code[at + 1] ?? '') + (code[at] ?? '') + code.slice(at + 2),
              `swap at ${at}`,
            );
          }
          for (const [at, first, second] of twoSymbolChanges) {
            const a = ALL[first] ?? '2';
            const b = ALL[second] ?? '2';
            if (a === code[at] || b === code[at + 1]) continue;
            damaged(
              code.slice(0, at) + a + b + code.slice(at + 2),
              `two symbols at ${at}: ${a}${b}`,
            );
          }
          for (let length = 1; length < code.length; length += 1) {
            damaged(code.slice(0, length), `cut to ${length}`);
          }
          for (const extra of ['2', 'ZZ', '2Z3']) damaged(code + extra, `extended by ${extra}`);
        },
      ),
      new ErrorTracker(),
      { numRuns: cappedRuns(2000) },
    );
    if (isDeepRun()) console.log(`[deep] P-8.10 (a): ${decodes} decodes`);
  });
});

describe('P-8.10 (b): any text of 0 to 10 000 characters is read without throwing (Req 8.10)', () => {
  // Generator: three families. `hostileString` (0 to 10 000 characters of the full BMP, lone
  // surrogates included); `symbols(n)` with n from 40 to 60 (strings of the alphabet that are
  // not codes); and the code of a `sightingArb` with 1 to 6 symbols replaced at random places.
  // The property: it never throws, and it succeeds exactly when the text is a valid code, that
  // is, when it is the canonical code of the Sighting it decodes to. The share of successes of
  // each family is reported.
  const counters = { text: [0, 0], symbols: [0, 0], replaced: [0, 0] };
  const family = fc.oneof(
    fc.tuple(fc.constant('text' as const), hostileString()),
    fc.tuple(fc.constant('symbols' as const), uniformInteger(40, 60).chain(symbols)),
    fc.tuple(
      fc.constant('replaced' as const),
      fc
        .tuple(
          sightingArb(),
          fc.array(fc.tuple(uniformInteger(0, 49), uniformInteger(0, 30)), {
            minLength: 1,
            maxLength: 6,
          }),
        )
        .map(([s, changes]) => {
          let code = codeOf(s);
          for (const [at, symbol] of changes) {
            code = code.slice(0, at) + (ALPHABET_FOR_TESTS[symbol] ?? '2') + code.slice(at + 1);
          }
          return code;
        }),
    ),
  );
  it('never throws, and succeeds exactly for a valid code', () => {
    checkProperty(
      'P-8.10 (b)',
      fc.property(family, ([kind, text]) => {
        const result = decodeSighting(text, PARAMETERS);
        const tally = counters[kind];
        tally[0] = (tally[0] ?? 0) + 1;
        if (!result.ok) return;
        tally[1] = (tally[1] ?? 0) + 1;
        // A success is a valid code: the canonical code of what it decodes to is the text.
        const canonical = codeOf(result.value);
        if (canonical !== stripCode(text))
          throw new Error(`accepted a text that is not canonical: ${text}`);
      }),
      new ErrorTracker(),
      { numRuns: cappedRuns(10_000) },
    );
    if (isDeepRun()) {
      for (const [kind, [total, accepted]] of Object.entries(counters)) {
        console.log(`[deep] P-8.10 (b) ${kind}: ${accepted} of ${total} accepted`);
      }
    }
  });
});
