import fc from 'fast-check';
import { ellipse95 } from '@alidade/core';
import { describe, expect, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { rawTimesArb, truthArb, usableTimes } from '../../test-support/generators';
import { noisySights } from '../../test-support/noisy-sights';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { DEG_TO_RAD } from '../degrees';
import { defaultParameters } from '../parameters';
import { assess } from './assess';
import { nauticalText, lengthText95, positionDecimals } from './format';
import { fixWords } from './fix-words';

const D = DEG_TO_RAD;
const params = defaultParameters();

describe('P-9.8: the words carry their numbers (Req 9.8)', () => {
  // Generator: as P-7.3 (truth latitude in [-70°, 70°], 2 to 6 sights over 2 to 9 hours from a
  // start in 2026 to 2029, the Sun within the limits at each; discards counted), a seed uniform in
  // [0, 2^31), the Common sigma one of 0, 0.25°, 1°, 3.5°, a true Sun side with 5° of noise.
  it('the text of a shown Fix has the rounded radius in km and nautical miles, the semi-axes, the used count and the decimals, and no NaN, Infinity, undefined or null', () => {
    const tracker = new ErrorTracker();
    let shown = 0;
    checkProperty(
      'P-9.8',
      fc.property(
        truthArb(70),
        rawTimesArb(2, 6, 2, 9),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.constantFrom(0, 0.25 * D, D, 3.5 * D),
        (truth, times, seed, commonSigmaRad) => {
          fc.pre(usableTimes(truth, times, 0, params));
          const noisy = noisySights(
            truth,
            times,
            seed,
            { commonSigmaRad, independentSigmaRad: 0.5 * D, sunSideSigmaRad: 5 * D },
            params,
          );
          const a = assess(noisy.sights, null, null, params);
          if (!a.ok) throw new Error(a.reason);
          const w = fixWords(a.value, Math.max(...times) + 600_000, params);
          if (!w.ok) throw new Error(w.reason);
          const text = w.value.map((l) => l.text).join('\n');
          for (const bad of ['NaN', 'Infinity', 'undefined', 'null'])
            expect(text).not.toContain(bad);
          if (a.value.kind !== 'fix') return;
          shown += 1;
          const e95 = ellipse95(a.value.fix.ellipse);
          if (!e95.ok) throw new Error(e95.reason);
          const major = lengthText95(e95.value.semiMajorM);
          const minor = lengthText95(e95.value.semiMinorM);
          const nm = nauticalText(e95.value.semiMajorM);
          if (!major.ok || !minor.ok || !nm.ok) {
            expect(text).toContain('over 1000 km');
            return;
          }
          expect(text).toContain(major.value);
          expect(text).toContain(minor.value);
          expect(text).toContain(nm.value);
          expect(text).toContain(`${a.value.used.length} sights used`);
          const decimals = positionDecimals(e95.value.semiMinorM);
          const position = w.value.find((l) => l.kind === 'position')?.text ?? '';
          const digits = /(\d+)(?:\.(\d+))?° [NS]/.exec(position);
          expect((digits?.[2] ?? '').length).toBe(decimals);
        },
      ),
      tracker,
      { numRuns: cappedRuns(300) },
    );
    expect(shown).toBeGreaterThan(0);
  });
});
