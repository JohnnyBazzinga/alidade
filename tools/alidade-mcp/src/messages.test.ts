import type { Reason } from '@alidade/core';
import { SENSOR_REASONS } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { MESSAGES, messageFor } from './messages.ts';

/** Core's closed set of reasons. The type of MESSAGES fails to compile when Core adds one. */
const CORE_REASONS: readonly Reason[] = [
  'invalid_number',
  'undefined_mean',
  'coincident_positions',
  'unsupported_position',
  'invalid_observation',
  'unsupported_format',
  'not_converged',
  'singular_geometry',
  'insufficient_observations',
  'colocated_observers',
  'diverging_bearings',
  'out_of_range',
];

describe('MESSAGES (Req 6.5)', () => {
  const required = [...CORE_REASONS, ...SENSOR_REASONS, 'invalid_arguments', 'non_finite_result'];

  it.each(required)('has words for %s', (reason) => {
    expect(Object.keys(MESSAGES)).toContain(reason);
  });

  it('has no message for a reason that does not exist', () => {
    expect(Object.keys(MESSAGES).sort()).toStrictEqual([...new Set(required)].sort());
  });

  it.each(Object.entries(MESSAGES))('the message for %s is plain words', (_reason, message) => {
    expect(message.length).toBeGreaterThan(20);
    expect(message).not.toMatch(/_|NaN|Infinity|undefined|null|\[object/);
  });

  it('messageFor reads the table', () => {
    expect(messageFor('invalid_arguments')).toBe(MESSAGES.invalid_arguments);
  });
});
