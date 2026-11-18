import { captureBearing, type FrameResetEvent, type YawReference } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { buildHistoryFromRun } from '../../test-support/history-from-script';
import { FIXTURE_DECLINATION, fixtureScript } from '../../test-support/session-fixtures';
import { yawStatus } from './yaw-status';

const T = 1_790_000_000_000;

function reference(over: Partial<YawReference> = {}): YawReference {
  return {
    offsetRad: 0.3,
    sigmaRad: 0.03,
    northReference: 'magnetic',
    frame: 'relative',
    establishedUtcMs: T,
    ...over,
  };
}

const MAX_AGE = 60_000;

describe('yawStatus (Req 11.3)', () => {
  it('is none, with age 0, when there is no reference', () => {
    expect(yawStatus(null, [], T, MAX_AGE)).toEqual({ status: 'none', ageMs: 0 });
  });

  it('is valid within the maximum age, with the age', () => {
    expect(yawStatus(reference(), [], T + 42_000, MAX_AGE)).toEqual({
      status: 'valid',
      ageMs: 42_000,
    });
    expect(yawStatus(reference(), [], T + MAX_AGE, MAX_AGE)).toEqual({
      status: 'valid',
      ageMs: MAX_AGE,
    });
  });

  it('is stale beyond the maximum age', () => {
    expect(yawStatus(reference(), [], T + MAX_AGE + 1, MAX_AGE)).toEqual({
      status: 'stale',
      ageMs: MAX_AGE + 1,
    });
  });

  it('is invalidated by a reset in the closed interval, exactly at the established time and at now', () => {
    const at = (timeUtcMs: number): FrameResetEvent[] => [{ timeUtcMs, cause: 'hidden' }];
    expect(yawStatus(reference(), at(T), T + 1000, MAX_AGE).status).toBe('invalidated');
    expect(yawStatus(reference(), at(T + 1000), T + 1000, MAX_AGE).status).toBe('invalidated');
    expect(yawStatus(reference(), at(T + 500), T + 1000, MAX_AGE).status).toBe('invalidated');
    expect(yawStatus(reference(), at(T - 1), T + 1000, MAX_AGE).status).toBe('valid');
    expect(yawStatus(reference(), at(T + 1001), T + 1000, MAX_AGE).status).toBe('valid');
  });

  it('takes invalidated over stale', () => {
    const resets: FrameResetEvent[] = [{ timeUtcMs: T + 10, cause: 'blur' }];
    expect(yawStatus(reference(), resets, T + MAX_AGE * 3, MAX_AGE)).toEqual({
      status: 'invalidated',
      ageMs: MAX_AGE * 3,
    });
  });

  it('is invalidated in the Relative frame by every cause, in the Absolute frame only by frame_change (Sensors 5.17)', () => {
    for (const cause of ['hidden', 'blur', 'pagehide', 'restart', 'frame_change'] as const) {
      const resets: FrameResetEvent[] = [{ timeUtcMs: T + 5, cause }];
      expect(yawStatus(reference({ frame: 'relative' }), resets, T + 10, MAX_AGE).status).toBe(
        'invalidated',
      );
      expect(yawStatus(reference({ frame: 'absolute' }), resets, T + 10, MAX_AGE).status).toBe(
        cause === 'frame_change' ? 'invalidated' : 'valid',
      );
    }
  });

  it('never gives a negative age when now is before the reference was established', () => {
    expect(yawStatus(reference(), [], T - 5000, MAX_AGE)).toEqual({ status: 'valid', ageMs: 0 });
  });

  it('gives none with age 0 for a non-finite argument, never NaN', () => {
    expect(yawStatus(reference(), [], Number.NaN, MAX_AGE)).toEqual({ status: 'none', ageMs: 0 });
    expect(yawStatus(reference(), [], Infinity, MAX_AGE)).toEqual({ status: 'none', ageMs: 0 });
    expect(yawStatus(reference(), [], T, Number.NaN)).toEqual({ status: 'none', ageMs: 0 });
    expect(yawStatus(reference({ establishedUtcMs: Number.NaN }), [], T, MAX_AGE).status).toBe(
      'none',
    );
  });

  // The other case of Req 11.7: a reference established inside the window. A Session cannot
  // produce it (establishing north over a window that holds such a reset fails), and the two
  // functions disagree on it: Sensors reads the closed interval from the earlier of the
  // reference and the window start, while the Yaw status reads it from the reference.
  it('differs from Sensors for a reference established inside the window, after a reset (Req 11.7)', () => {
    const script = fixtureScript({
      frame: { kind: 'relative', zeroRad: 1, resets: [] },
      heading: null,
    });
    const built = buildHistoryFromRun({
      script,
      seed: 1,
      steps: [{ aim: null, advanceToUtcMs: script.startUtcMs + 3000 }],
    });
    const endUtcMs = built.endUtcMs;
    const window = { endUtcMs, windowLengthMs: 1000, minSampleCount: 10, sampleStalenessMs: 500 };
    const resets: FrameResetEvent[] = [{ timeUtcMs: endUtcMs - 800, cause: 'hidden' }];
    const inside = reference({ establishedUtcMs: endUtcMs - 400, frame: 'relative' });
    const fix = built.history.positionFix;
    if (fix === null) throw new Error('fixture');
    const capture = captureBearing({
      id: 'x',
      timeUtcMs: endUtcMs,
      samples: built.history.samples,
      frameResets: resets,
      window,
      yawReference: inside,
      yawReferenceMaxAgeMs: MAX_AGE,
      headingSigmaRad: 0.035,
      declination: FIXTURE_DECLINATION,
      positionFix: fix,
      positionStalenessMs: 30_000,
      coarseLocationLimitM: 100,
    });
    expect(capture).toEqual({ ok: false, reason: 'frame_reset' });
    expect(yawStatus(inside, resets, endUtcMs, MAX_AGE).status).toBe('valid');
  });
});
