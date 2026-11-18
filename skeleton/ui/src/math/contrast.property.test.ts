import fc from 'fast-check';
import { describe, it } from 'vitest';
import { propertyRuns } from '../test-support/fast-check-setup';
import { uniformInteger } from '../test-support/generators';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { contrastRatio, type Rgb } from './contrast';

/** A colour of 8-bit sRGB: each channel an integer in [0, 255], the ends included. */
const colour: fc.Arbitrary<Rgb> = fc.record({
  r: uniformInteger(0, 255),
  g: uniformInteger(0, 255),
  b: uniformInteger(0, 255),
});

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * Domain: pairs of 8-bit sRGB colours. Three draws in six are plain random pairs, one in six an
 * equal pair, one in six black and white in either order, one in six a pair with one extreme.
 * Excludes: channels that are not integers in [0, 255] (examples of their own).
 */
const pair: fc.Arbitrary<{ a: Rgb; b: Rgb; kind: 'any' | 'equal' | 'blackWhite' }> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ a: colour, b: colour, kind: fc.constant('any' as const) }) },
  {
    weight: 1,
    arbitrary: colour.map((c) => ({ a: c, b: { ...c }, kind: 'equal' as const })),
  },
  {
    weight: 1,
    arbitrary: fc.boolean().map((flip) => ({
      a: flip ? BLACK : WHITE,
      b: flip ? WHITE : BLACK,
      kind: 'blackWhite' as const,
    })),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      a: fc.constantFrom(BLACK, WHITE),
      b: colour,
      kind: fc.constant('any' as const),
    }),
  },
);

function value(a: Rgb, b: Rgb): number {
  const result = contrastRatio(a, b);
  return result.ok ? result.value : Number.NaN;
}

// P-13.10 (Req 13.10): the contrast ratio is symmetric, lies in [1, 21], is 1 for equal colours
// within 1e-12 and 21 for black and white within 1e-9.
describe('P-13.10 contrastRatio', () => {
  it('is symmetric, in [1, 21], 1 for equal colours and 21 for black on white', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-13.10',
      fc.property(pair, ({ a, b, kind }) => {
        const ab = value(a, b);
        const ba = value(b, a);
        tracker.record('asymmetry |ab - ba|', Math.abs(ab - ba), '0 (exact)');
        let good = ab === ba && ab >= 1 && ab <= 21;
        if (kind === 'equal') {
          tracker.record('equal colours |ratio - 1|', Math.abs(ab - 1), '1e-12');
          good &&= Math.abs(ab - 1) <= 1e-12;
        }
        if (kind === 'blackWhite') {
          tracker.record('black/white |ratio - 21|', Math.abs(ab - 21), '1e-9');
          good &&= Math.abs(ab - 21) <= 1e-9;
        }
        return good;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});
