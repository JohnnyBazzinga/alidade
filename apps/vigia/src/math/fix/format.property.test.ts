// P-6.2 (Req 6.2, design §7.8, §11): the rounding rule of the words. The printed position never
// claims more than 4 decimals and is rounded by at most half a step that is not coarser than the
// semi-minor axis; an uncertainty is never rounded down, and exceeds its value by less than its
// step.

import fc from 'fast-check';
import { describe, it } from 'vitest';
import { cappedRuns } from '../../test-support/fast-check-setup';
import { closed } from '../../test-support/generators';
import { checkProperty, ErrorTracker } from '../../test-support/property-report';
import { lengthText95, METRES_PER_DEGREE, positionDecimals } from './format';

/** The step of `d` decimals in metres. */
const step = (d: number) => METRES_PER_DEGREE * 10 ** -d;
const STEPS = [0, 1, 2, 3, 4].map(step);

/** A length in metres, log-uniform in [0.1, 1e7], with the step values and their neighbours drawn. */
const semiMinor = fc.oneof(
  { weight: 6, arbitrary: closed(Math.log10(0.1), 7).map((e) => 10 ** e) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.constantFrom(...STEPS), fc.constantFrom(1 - 1e-12, 1, 1 + 1e-12))
      .map(([s, f]) => s * f),
  },
);

/** The number a text of `lengthText95` says, in metres (an independent reader). */
function readBack(text: string): number {
  const metres = /^(\d+) m$/.exec(text);
  if (metres) return Number(metres[1]);
  const km = /^(\d+\.\d) km$/.exec(text);
  if (km) return Number(km[1]) * 1000;
  throw new Error(`unreadable: ${text}`);
}

describe('P-6.2: the rounding of the words (Req 6.2)', () => {
  // Generator: the semi-minor axis `b` log-uniform in [0.1, 1e7] m with the five step values
  // (about 111 km to 11 m) and their neighbours drawn; a length `x` log-uniform in (0, 2e6] m
  // with 1e6 and its neighbours drawn. Excludes lengths that are not positive (examples).
  it('chooses the decimals by the semi-minor axis, and rounds an uncertainty up by less than its step', () => {
    const tracker = new ErrorTracker();
    const length = fc.oneof(
      { weight: 6, arbitrary: closed(-3, Math.log10(2e6)).map((e) => 10 ** e) },
      {
        weight: 1,
        arbitrary: fc.constantFrom(
          1e6,
          1e6 * (1 + 1e-15),
          1e6 * (1 - 1e-15),
          1000,
          999.999,
          1000.001,
        ),
      },
    );
    checkProperty(
      'P-6.2',
      fc.property(semiMinor, length, (b, x) => {
        const d = positionDecimals(b);
        if (!(Number.isInteger(d) && d >= 0 && d <= 4)) throw new Error(`decimals ${d}`);
        // The smallest d whose step is at most b, or 4 when there is none.
        const expected = [0, 1, 2, 3, 4].find((k) => step(k) <= b) ?? 4;
        if (d !== expected) throw new Error(`decimals ${d} for ${b} m, expected ${expected}`);
        const text = lengthText95(x);
        if (!text.ok) throw new Error('lengthText95 failed');
        if (x > 1e6) {
          if (text.value !== 'over 1000 km') throw new Error(`${x} m: ${text.value}`);
          return;
        }
        if (text.value === 'over 1000 km') throw new Error(`${x} m said to be over 1000 km`);
        const said = readBack(text.value);
        // At least x, and above it by less than its step: 10 m below 1 000 m, 100 m above, and at
        // most 10 m at the seam of 1 000 m.
        const stepM = x < 1000 ? 10 : 100;
        if (!(said >= x)) throw new Error(`${x} m rounded down to ${text.value}`);
        if (!(said - x < stepM)) throw new Error(`${x} m rounded up too far to ${text.value}`);
        tracker.record('rounded up (m)', said - x, stepM === 10 ? 'under 10 m' : 'under 100 m');
      }),
      tracker,
      { numRuns: cappedRuns(100_000) },
    );
  });
});
