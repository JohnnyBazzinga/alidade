// P-6.8 (Req 6.2, 6.3, 6.8) and P-6.10 (Req 6.10): the words of a Fix from Bearings through the
// assessment, against a formatter written here apart from the code.

import { ellipse95, type Bearing } from '@alidade/core';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { entryOfBearing, incidentOfEntries } from '../../test-support/geometry-fixtures';
import {
  consistentBearings,
  largestCrossingRad,
  uniformInteger,
} from '../../test-support/generators';
import { NOW_UTC_MS, PARAMETERS } from '../../test-support/incident-fixtures';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { assess } from '../assessment/assess';
import { fixWords, fixWordsText } from './fix-words';

/** math-conventions.md: the 1-sigma axes times 2.4477 give the 95 % ellipse. */
const SCALE_95 = 2.4477;
const METRES_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;

/** The rule of Req 6.2 for an uncertainty, written again: up to 10 m below 1 km, to 0.1 km above. */
function upText(x: number): string {
  if (x > 1e6) return 'over 1000 km';
  const v = x < 1000 ? Math.ceil(x / 10) * 10 : Math.ceil(x / 100) * 100;
  return v < 1000 ? `${v} m` : `${(v / 1000).toFixed(1)} km`;
}
function decimalsFor(b: number): number {
  for (let d = 0; d < 4; d += 1) if (METRES_PER_DEGREE * 10 ** -d <= b) return d;
  return 4;
}

/** Fixes of `consistentBearings(2 … 12)` through `assess` (sets whose solve fails are discarded). */
const DOMAIN = uniformInteger(2, 12).chain((n) => consistentBearings(n));
function assessed(bearings: readonly Bearing[]) {
  const incident = incidentOfEntries(bearings.map((b, i) => entryOfBearing(i + 1, b)));
  const a = assess(incident, NOW_UTC_MS, PARAMETERS);
  if (!a.ok) throw new Error('assess failed');
  return a.value;
}

describe('P-6.8: the words of the Fix (Req 6.2, 6.3, 6.8)', () => {
  // Generator: `consistentBearings(2 to 12)` (observers 500 m to 15 km from one target within 20
  // km of the origin, sigmas 0.5° to 3°), sets whose largest crossing angle is under 30° discarded,
  // and those whose solve fails discarded (both counted).
  it('holds both semi-axes rounded up, the count, the decimals of P-6.2, and none of the forbidden words', () => {
    checkProperty(
      'P-6.8',
      fc.property(DOMAIN, (set) => {
        fc.pre(largestCrossingRad(set.bearings) >= (30 * Math.PI) / 180);
        const a = assessed(set.bearings);
        fc.pre(a.fix?.ok === true);
        const fix = a.fix?.ok ? a.fix.value : null;
        if (fix === null) throw new Error('no Fix');
        const words = fixWords(fix, a, NOW_UTC_MS, PARAMETERS);
        if (!words.ok) throw new Error(`fixWords failed: ${words.reason}`);
        const text = fixWordsText(words.value);
        const A = fix.ellipse.semiMajorM * SCALE_95;
        const B = fix.ellipse.semiMinorM * SCALE_95;
        if (!words.value.area.includes(`semi-axes ${upText(A)} and ${upText(B)}`)) {
          throw new Error(`axes ${upText(A)}, ${upText(B)} not in: ${words.value.area}`);
        }
        if (!words.value.basis.startsWith(`Based on ${a.used.length} sightings`))
          throw new Error('count');
        const position = /: (\d+(?:\.(\d+))?)° [NS], (\d+(?:\.(\d+))?)° [EW],/.exec(
          words.value.headline,
        );
        if (position === null) throw new Error(`no position in: ${words.value.headline}`);
        const d = decimalsFor(B);
        if ((position[2] ?? '').length !== d || (position[4] ?? '').length !== d) {
          throw new Error(`decimals ${position[0]}, expected ${d}`);
        }
        if (!/Probably/.test(text) || !/within about/.test(text))
          throw new Error('probably / within about');
        if (/exact|located at|confirmed|precisely/i.test(text))
          throw new Error('a word of certainty');
        if (/NaN|Infinity|undefined|null/.test(text))
          throw new Error('a value that is not a number');
      }),
      new ErrorTracker(),
      { numRuns: cappedRuns(5000) },
    );
  });
});

describe('P-6.10: the 95 % scale (Req 6.10)', () => {
  // Generator: as P-6.8.
  it('scales the Ellipse by 2.4477 within 1e-9, and the words quote the 95 % axes of the Fix\u2019s own Ellipse', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-6.10',
      fc.property(DOMAIN, (set) => {
        fc.pre(largestCrossingRad(set.bearings) >= (30 * Math.PI) / 180);
        const a = assessed(set.bearings);
        fc.pre(a.fix?.ok === true);
        const fix = a.fix?.ok ? a.fix.value : null;
        if (fix === null) throw new Error('no Fix');
        const e95 = ellipse95(fix.ellipse);
        if (!e95.ok) throw new Error('ellipse95');
        const major = e95.value.semiMajorM / fix.ellipse.semiMajorM;
        const minor = e95.value.semiMinorM / fix.ellipse.semiMinorM;
        tracker.record(
          '|ratio − 2.4477|',
          Math.max(Math.abs(major - SCALE_95), Math.abs(minor - SCALE_95)),
          '1e-9',
        );
        if (Math.abs(major - SCALE_95) > 1e-9 || Math.abs(minor - SCALE_95) > 1e-9)
          throw new Error('scale');
        const words = fixWords(fix, a, NOW_UTC_MS, PARAMETERS);
        if (!words.ok) throw new Error('fixWords failed');
        const expected = `semi-axes ${upText(fix.ellipse.semiMajorM * SCALE_95)} and ${upText(fix.ellipse.semiMinorM * SCALE_95)}`;
        if (!words.value.area.includes(expected))
          throw new Error(`${expected} not in ${words.value.area}`);
      }),
      tracker,
      { numRuns: cappedRuns(5000) },
    );
  });
});
