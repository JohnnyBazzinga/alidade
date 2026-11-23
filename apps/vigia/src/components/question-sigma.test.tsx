// One rule for a sigma (Req 3.6, 22.9; task 24.6): the same capture gives the same sigma in the
// saved line and in the question's card, rounded up to 0.1°, never to the nearest tenth.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { savedLineText, sigmaDegUp, sigmaHeadlineText } from '../math/fix/format';

const DEG = Math.PI / 180;

describe('the one rule for a sigma (Req 3.6)', () => {
  it('writes ±2.1° for 2.04°, where the nearest tenth would write ±2.0°', () => {
    expect(sigmaHeadlineText(2.04 * DEG)).toBe('±2.1°');
    expect(sigmaDegUp(2.04 * DEG)).toEqual({ ok: true, value: '2.1' });
    expect(sigmaHeadlineText(2.0 * DEG)).toBe('±2.0°');
  });

  it('agrees with the saved line for every sigma, and never writes less than the sigma', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 359.9, noNaN: true }),
        (sigmaDeg, azimuthDeg) => {
          const headline = sigmaHeadlineText(sigmaDeg * DEG);
          const saved = savedLineText(azimuthDeg * DEG, sigmaDeg * DEG);
          expect(saved.ok).toBe(true);
          if (!saved.ok) return;
          const inSaved = /± (\d+\.\d)°/.exec(saved.value)?.[1];
          expect(headline).toBe(`±${inSaved}°`);
          expect(Number(inSaved)).toBeGreaterThanOrEqual(Math.round(sigmaDeg * 1e6) / 1e6 - 1e-9);
        },
      ),
      { numRuns: 300 },
    );
  });
});
