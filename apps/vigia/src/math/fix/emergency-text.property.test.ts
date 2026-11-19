// P-14.8 (Req 14.1, 14.3, 14.6, 14.8), P-14.9 (Req 14.9) and P-16.4 (Req 16.4, 6.4): the Emergency
// text from Bearings through the assessment, against readers written here apart from the code.

import { destinationPosition, ellipse95, type Position } from '@alidade/core';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { entryOfBearing, incidentOfEntries } from '../../test-support/geometry-fixtures';
import {
  closed,
  consistentBearings,
  largestCrossingRad,
  uniformInteger,
} from '../../test-support/generators';
import { NOW_UTC_MS, PARAMETERS } from '../../test-support/incident-fixtures';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { assess, type Assessment } from '../assessment/assess';
import { emergencyText, WORST_EMERGENCY_TEXT_CHARS } from './emergency-text';
import { fixWords, fixWordsText } from './fix-words';
import { fromYouWords } from './from-you';

const DEG = Math.PI / 180;
const METRES_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;

interface Case {
  readonly assessment: Assessment;
  readonly mode: 'device' | 'simulation';
  readonly includeOwnPosition: boolean;
  readonly own: { readonly position: Position; readonly accuracyM: number };
}

/**
 * Assessments of `consistentBearings(1 to 12)` (one Sighting gives the direction-only text), the
 * mode each, the own-position switch each, and an own position 0 to 20 km from the target with an
 * accuracy of 0 to 100 m. Sets of two or more whose largest crossing angle is under 30° are
 * discarded (counted); a solve that fails is kept, and its text is the failure.
 */
const CASES: fc.Arbitrary<Case> = fc
  .tuple(
    uniformInteger(1, 12).chain((n) => consistentBearings(n)),
    fc.constantFrom('device' as const, 'simulation' as const),
    fc.boolean(),
    closed(0, 2 * Math.PI),
    closed(0, 20_000),
    closed(0, 100),
  )
  .filter(([set]) => set.bearings.length === 1 || largestCrossingRad(set.bearings) >= 30 * DEG)
  .map(([set, mode, includeOwnPosition, az, range, accuracyM]) => {
    const incident = incidentOfEntries(set.bearings.map((b, i) => entryOfBearing(i + 1, b)));
    const a = assess(incident, NOW_UTC_MS, PARAMETERS);
    if (!a.ok) throw new Error('assess');
    const p = destinationPosition(set.target, az, range);
    if (!p.ok) throw new Error('destination');
    return { assessment: a.value, mode, includeOwnPosition, own: { position: p.value, accuracyM } };
  });

function textOf(c: Case) {
  return emergencyText(
    {
      assessment: c.assessment,
      nowUtcMs: NOW_UTC_MS,
      mode: c.mode,
      ownPosition: c.own,
      includeOwnPosition: c.includeOwnPosition,
    },
    PARAMETERS,
  );
}

/** Every way a position can be printed: the forms of 2 to 4 decimals, latitude then longitude. */
function printedForms(p: Position): string[] {
  const forms: string[] = [];
  for (let d = 2; d <= 4; d += 1) {
    const lat = Math.abs(p.latRad / DEG).toFixed(d);
    const lon = Math.abs(p.lonRad / DEG).toFixed(d);
    forms.push(`${lat}° ${p.latRad < 0 ? 'S' : 'N'}, ${lon}° ${p.lonRad < 0 ? 'W' : 'E'}`);
  }
  return forms;
}

/** The rule of Req 6.2 for an uncertainty, written again. */
function upText(x: number): string {
  if (x > 1e6) return 'over 1000 km';
  const v = x < 1000 ? Math.ceil(x / 10) * 10 : Math.ceil(x / 100) * 100;
  return v < 1000 ? `${v} m` : `${(v / 1000).toFixed(1)} km`;
}

describe('P-14.8: the Emergency text (Req 14.1, 14.3, 14.6, 14.8)', () => {
  it('is short, holds the Fix with its uncertainty, and no observer position, id or code', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.8',
      fc.property(CASES, (c) => {
        const text = textOf(c);
        const { assessment } = c;
        if (!text.ok) {
          // A solve that failed with two or more used: its failure, which the screen shows.
          if (
            assessment.fix !== null &&
            !assessment.fix.ok &&
            text.reason === assessment.fix.reason
          )
            return;
          throw new Error(`emergencyText failed: ${text.reason}`);
        }
        const t = text.value;
        tracker.record('length (characters)', t.length, `≤ ${WORST_EMERGENCY_TEXT_CHARS}`);
        if (t.length > PARAMETERS.maxEmergencyTextChars || t.length > WORST_EMERGENCY_TEXT_CHARS)
          throw new Error(`length ${t.length}`);
        if (/NaN|Infinity|undefined|null/.test(t)) throw new Error('a value that is not a number');
        if (assessment.fix?.ok) {
          const fix = assessment.fix.value;
          const e95 = ellipse95(fix.ellipse);
          if (!e95.ok) throw new Error('ellipse95');
          if (
            !t.includes(
              `semi-axes ${upText(e95.value.semiMajorM)} and ${upText(e95.value.semiMinorM)}`,
            )
          ) {
            throw new Error('the semi-axes');
          }
          if (!t.includes(`Based on ${assessment.used.length} sightings`))
            throw new Error('the count');
          const words = fixWords(fix, assessment, NOW_UTC_MS, PARAMETERS);
          if (!words.ok || !t.includes(words.value.geometry))
            throw new Error('the geometry sentence of the Fix');
        }
        // Every sentence that holds a position holds metres of uncertainty.
        for (const sentence of t.split(/\n|(?<=\.) /)) {
          if (/° [NS], /.test(sentence) && !/\d+(\.\d)? (m|km)\b|over 1000 km/.test(sentence)) {
            throw new Error(`a position without metres: ${sentence}`);
          }
        }
        // No observer position; the own only when it is switched on; no id, no code. The own
        // position is judged by its line; an observer's by its printed forms, after the lines that
        // may print the same digits (the Fix's position and the own position) are taken out, since
        // a Fix near an observer, or an own position at the smoke, can print the same text.
        const ownLine = /^(My own position: |I stand at )/;
        const lines = t.split('\n');
        if (!c.includeOwnPosition && lines.some((line) => ownLine.test(line))) {
          throw new Error('the own position without the switch');
        }
        const others = lines
          .filter((line) => !ownLine.test(line) && !line.startsWith('Position: '))
          .join('\n');
        for (const e of [...assessment.used, ...assessment.setAside.map((s) => s.entry)]) {
          for (const form of printedForms(e.sighting.bearing.observer)) {
            if (others.includes(form)) throw new Error(`an observer's position: ${form}`);
          }
          if (
            t.includes(e.sighting.sightingId) ||
            t.includes(e.sighting.incidentId) ||
            t.includes(e.code)
          ) {
            throw new Error('an id or a code');
          }
        }
        if (c.includeOwnPosition && !lines.some((line) => ownLine.test(line))) {
          throw new Error('the own position is missing');
        }
        if ((c.mode === 'simulation') !== t.startsWith('SIMULATION: '))
          throw new Error('the simulation line');
      }),
      tracker,
      { numRuns: cappedRuns(5000) },
    );
  });
});

describe('P-14.9: the position read back from the text (Req 14.9)', () => {
  // The reading is per coordinate, at the decimals the text used: each within half a step of
  // those decimals (5e-5° at 4) plus 1e-9; and, by Core's great-circle distance, the printed point
  // within the bound of both together (the half-step of latitude and that of longitude at this
  // latitude), which is what "within the rounding" makes of a distance.
  it('prints the Fix within the rounding of its decimals', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-14.9',
      fc.property(CASES, (c) => {
        fc.pre(c.assessment.fix?.ok === true);
        const text = textOf(c);
        if (!text.ok) throw new Error('failed');
        const fix = c.assessment.fix?.ok ? c.assessment.fix.value : null;
        if (fix === null) throw new Error('no Fix');
        const m = /Position: (\d+(?:\.(\d+))?)° ([NS]), (\d+(?:\.\d+)?)° ([EW]),/.exec(text.value);
        if (m === null) throw new Error('no position');
        const d = (m[2] ?? '').length;
        const lat = Number(m[1]) * (m[3] === 'S' ? -1 : 1);
        const lon = Number(m[4]) * (m[5] === 'W' ? -1 : 1);
        const half = 0.5 * 10 ** -d;
        const dLat = Math.abs(lat - fix.position.latRad / DEG);
        let dLon = Math.abs(lon - fix.position.lonRad / DEG);
        dLon = Math.min(dLon, 360 - dLon);
        tracker.record('latitude (deg)', dLat, `0.5·10^-d + 1e-9 (d = ${d})`);
        tracker.record('longitude (deg)', dLon, `0.5·10^-d + 1e-9`);
        if (dLat > half + 1e-9 || dLon > half + 1e-9)
          throw new Error(`${m[0]}: off by ${dLat}, ${dLon}`);
        const boundM = Math.hypot(
          half * METRES_PER_DEGREE,
          half * METRES_PER_DEGREE * Math.cos(fix.position.latRad),
        );
        const apart = Math.hypot(
          dLat * METRES_PER_DEGREE,
          dLon * METRES_PER_DEGREE * Math.cos(fix.position.latRad),
        );
        tracker.record('distance / bound', apart / boundM, '≤ 1');
        if (apart > boundM * (1 + 1e-6) + 1e-6) throw new Error('beyond the printing bound');
      }),
      tracker,
      { numRuns: cappedRuns(5000) },
    );
  });
});

describe('P-16.4: no number of the smoke without its uncertainty in the same sentence (Req 16.4, 6.4)', () => {
  // The texts of fixWords, fromYouWords (from the own position) and emergencyText, split into
  // sentences at ". " and line feeds. A sentence that holds a decimal degree (° N, ° S, ° E, ° W)
  // or a distance (m or km) holds one of the phrases of the closed list. The direction-only
  // sentence states its uncertainty in degrees. The standing distance of the advice is not
  // among these texts (Req 16.4).
  const PHRASES = /within about|give or take|semi-axes|known to about/;
  it('holds the uncertainty in every sentence that holds a position or a distance', () => {
    checkProperty(
      'P-16.4',
      fc.property(CASES, (c) => {
        const texts: string[] = [];
        const emergency = textOf(c);
        if (emergency.ok) texts.push(emergency.value);
        if (c.assessment.fix?.ok) {
          const fix = c.assessment.fix.value;
          const words = fixWords(fix, c.assessment, NOW_UTC_MS, PARAMETERS);
          if (words.ok) texts.push(fixWordsText(words.value));
          const fromYou = fromYouWords(fix, c.own.position, PARAMETERS);
          if (fromYou.ok) texts.push(fromYou.value);
        }
        for (const text of texts) {
          for (const sentence of text.split(/\n|(?<=\.) /)) {
            const number = /° [NSEW]\b|\d(\.\d+)? (m|km)\b|over 1000 km/.test(sentence);
            if (number && !PHRASES.test(sentence))
              throw new Error(`no uncertainty in: ${sentence}`);
          }
        }
      }),
      new ErrorTracker(),
      { numRuns: cappedRuns(5000) },
    );
  });
});
