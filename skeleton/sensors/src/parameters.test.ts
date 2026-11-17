import { describe, expect, it } from 'vitest';
import {
  checkDurationMs,
  checkLimitM,
  checkSampleCount,
  checkScale,
  checkSigma,
  checkTimeUtcMs,
  checkWindowLengthMs,
} from './parameters';
import type { SensorResult } from './sensor-result';

type Check = (value: number, field: string) => SensorResult<number>;

const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

function expectRejected(check: Check, values: readonly number[]): void {
  for (const value of values) {
    expect(check(value, 'theField')).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'theField',
    });
  }
}

function expectAccepted(check: Check, values: readonly number[]): void {
  for (const value of values) expect(check(value, 'theField')).toEqual({ ok: true, value });
}

// Req 10.3: each invalid parameter is `invalid_number` naming the parameter.
describe('parameter validation (Req 10.3)', () => {
  it('durations: not negative, finite', () => {
    expectRejected(checkDurationMs, [...NON_FINITE, -1, -Number.MIN_VALUE]);
    expectAccepted(checkDurationMs, [0, 1, 500, Number.MAX_VALUE]);
  });

  it('a Sighting window length: positive', () => {
    expectRejected(checkWindowLengthMs, [...NON_FINITE, -1, 0]);
    expectAccepted(checkWindowLengthMs, [Number.MIN_VALUE, 1, 1000]);
  });

  it('sample counts: integers of at least 1', () => {
    expectRejected(checkSampleCount, [...NON_FINITE, 0, -1, 2.5, 0.999]);
    expectAccepted(checkSampleCount, [1, 10, 2 ** 40]);
  });

  it('1-sigmas: not negative, finite', () => {
    expectRejected(checkSigma, [...NON_FINITE, -1e-300]);
    expectAccepted(checkSigma, [0, 1e-300, 0.5]);
  });

  it('confidence scales and limits in metres: positive, finite', () => {
    for (const check of [checkScale, checkLimitM]) {
      expectRejected(check, [...NON_FINITE, 0, -1]);
      expectAccepted(check, [Number.MIN_VALUE, 1, 100]);
    }
  });

  it('time instants: finite', () => {
    expectRejected(checkTimeUtcMs, NON_FINITE);
    expectAccepted(checkTimeUtcMs, [-1, 0, 1.79e12]);
  });
});
