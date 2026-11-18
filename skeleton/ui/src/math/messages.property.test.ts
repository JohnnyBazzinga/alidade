import fc from 'fast-check';
import { describe, it } from 'vitest';
import { UI_REASONS } from '../reasons';
import { propertyRuns } from '../test-support/fast-check-setup';
import { hostileNumber } from '../test-support/hostile';
import { partsOf, problemsOf } from '../test-support/message-rules';
import { checkProperty, ErrorTracker } from '../test-support/property-report';
import { messageFor } from './messages';

/**
 * Domain: every UiReason; `field`, `id` and `errorName` strings of 0 to 40 characters from the
 * full Basic Multilingual Plane (any UTF-16 code unit, surrogates included), or the reason's own
 * code, `NaN` or `undefined` as text; `reportedAccuracyM` any double (NaN, the infinities, -0
 * and the doubles around the rounding limits included). The three strings are each present or
 * absent. Excludes nothing type-correct.
 */
/** Stands for "the reason's own code" in a drawn string; replaced by the code of the case. */
const REASON_CODE = '\u0000reason';
const text = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 40 }),
  fc.constantFrom(REASON_CODE, 'NaN', 'undefined'),
);
const failureCase = fc.record({
  reason: fc.constantFrom(...UI_REASONS),
  field: fc.option(text, { nil: undefined }),
  id: fc.option(text, { nil: undefined }),
  errorName: fc.option(text, { nil: undefined }),
  reportedAccuracyM: hostileNumber(),
});

// P-3.11 (Req 3.3, 3.11): every part of every Message is one sentence of at most 160 characters
// ending in a full stop, containing none of the reason's code, an underscore, NaN, Infinity,
// undefined, null or [object; and the Message of a failure equals the Message of the same
// failure without its field, id and errorName.
describe('P-3.11 messageFor', () => {
  it('satisfies Req 3.3 and does not depend on field, id or errorName', () => {
    const tracker = new ErrorTracker();
    checkProperty(
      'P-3.11',
      fc.property(failureCase, (c) => {
        const { reason, reportedAccuracyM } = c;
        const named = (value: string | undefined): string | undefined =>
          value === REASON_CODE ? reason : value;
        const field = named(c.field);
        const id = named(c.id);
        const errorName = named(c.errorName);
        const detailed = messageFor({
          ok: false,
          reason,
          reportedAccuracyM,
          ...(field === undefined ? {} : { field }),
          ...(id === undefined ? {} : { id }),
          ...(errorName === undefined ? {} : { errorName }),
        });
        const plain = messageFor({ ok: false, reason, reportedAccuracyM });
        const dependent = JSON.stringify(detailed) === JSON.stringify(plain) ? 0 : 1;
        tracker.record(
          'Messages that depend on field, id or errorName (must be 0)',
          dependent,
          '0',
        );
        let problemCount = 0;
        for (const part of partsOf(detailed)) problemCount += problemsOf(part, reason).length;
        tracker.record('problems found (must be 0)', problemCount, '0');
        return dependent === 0 && problemCount === 0;
      }),
      tracker,
      { numRuns: propertyRuns() },
    );
  });
});
