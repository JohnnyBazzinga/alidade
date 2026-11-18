import { describe, expect, it } from 'vitest';
import { captureBearing, type BearingCaptureInput } from './capture';
import type { FrameResetEvent } from './frame-reset';
import type { OrientationSample } from './orientation-sample';
import { positionFixFromReading, type PositionFix } from './position-fix';
import {
  addFrameReset,
  addOrientationSample,
  addPositionFix,
  createSampleHistory,
  type SampleHistory,
} from './sample-history';
import type { SensorResult } from './sensor-result';
import { rad } from './test-support/angle-compare';
import { expectOk } from './test-support/result-helpers';
import { pointing, sampleAt } from './test-support/samples';

const T = 1_790_000_000_000;
const RETENTION = { sampleRetentionMs: 5000, frameResetRetentionMs: 120_000 };

function empty(): SampleHistory {
  return expectOk(createSampleHistory(RETENTION));
}

function sample(timeUtcMs: number, azimuthDeg = 70): OrientationSample {
  return sampleAt(timeUtcMs, pointing(rad(azimuthDeg)));
}

function apply(
  history: SampleHistory,
  steps: ((h: SampleHistory) => SensorResult<SampleHistory>)[],
): SampleHistory {
  return steps.reduce((h, step) => expectOk(step(h)), history);
}

describe('Sample history (Req 14)', () => {
  it('refuses non-finite times and leaves the history as it was (Req 14.4)', () => {
    const history = apply(empty(), [(h) => addOrientationSample(h, sample(T))]);
    const before = structuredClone(history);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(addOrientationSample(history, sample(bad))).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'timeUtcMs',
      });
      expect(addFrameReset(history, { timeUtcMs: bad, cause: 'blur' })).toEqual({
        ok: false,
        reason: 'invalid_number',
        field: 'timeUtcMs',
      });
    }
    expect(history).toEqual(before);
  });

  it('keeps a sample exactly at the retention and drops one 1 ms older (Req 14.2)', () => {
    const atLimit = sample(T - 5000);
    const beyond = sample(T - 5001);
    const history = apply(empty(), [
      (h) => addOrientationSample(h, beyond),
      (h) => addOrientationSample(h, atLimit),
      (h) => addOrientationSample(h, sample(T)),
    ]);
    expect(history.samples).toEqual([atLimit, sample(T)]);
    expect(history.samples[0]).toBe(atLimit);
  });

  it('keeps a Frame reset exactly at its retention and drops one 1 ms older', () => {
    const atLimit: FrameResetEvent = { timeUtcMs: T - 120_000, cause: 'hidden' };
    const beyond: FrameResetEvent = { timeUtcMs: T - 120_001, cause: 'blur' };
    const history = apply(empty(), [
      (h) => addFrameReset(h, beyond),
      (h) => addFrameReset(h, atLimit),
      (h) => addOrientationSample(h, sample(T)),
    ]);
    expect(history.frameResets).toEqual([atLimit]);
  });

  it('accepts a sample older than the newest when the clock steps back (Req 14.4)', () => {
    const back = sample(T - 200);
    const history = apply(empty(), [
      (h) => addOrientationSample(h, sample(T)),
      (h) => addOrientationSample(h, back),
    ]);
    expect(history.samples).toEqual([sample(T), back]);
    expect(history.newestUtcMs).toBe(T);
  });

  it('lets a Position fix advance the newest time and keeps the most recent fix (D23)', () => {
    const first = expectOk(
      positionFixFromReading({ latitudeDeg: 1, longitudeDeg: 2, accuracyM: 5 }, T + 6000, 1),
    );
    const second = expectOk(
      positionFixFromReading({ latitudeDeg: 3, longitudeDeg: 4, accuracyM: 5 }, T + 5000, 1),
    );
    const history = apply(empty(), [
      (h) => addOrientationSample(h, sample(T)),
      (h) => addPositionFix(h, first),
      (h) => addPositionFix(h, second),
    ]);
    expect(history.samples).toEqual([]); // T is 6000 ms before the newest time
    expect(history.newestUtcMs).toBe(T + 6000);
    expect(history.positionFix).toBe(second);
  });

  it('never changes a history it has handed out (Req 14.1)', () => {
    const kept = apply(empty(), [
      (h) => addOrientationSample(h, sample(T)),
      (h) => addFrameReset(h, { timeUtcMs: T, cause: 'blur' }),
    ]);
    const copy = structuredClone(kept);
    let later = kept;
    for (let i = 1; i <= 10; i += 1)
      later = expectOk(addOrientationSample(later, sample(T + i * 1000)));
    expect(kept).toEqual(copy);
    expect(later.samples).not.toContain(kept.samples[0]);
    expect(() => {
      (kept.samples as OrientationSample[]).push(sample(T));
    }).toThrow(TypeError);
    expect(() => {
      (kept as { newestUtcMs: number | null }).newestUtcMs = 0;
    }).toThrow(TypeError);
  });

  it('captures the moment an image was frozen, whatever happens afterwards (Req 14.1, 14.5)', () => {
    let history = empty();
    for (let i = 0; i < 10; i += 1)
      history = expectOk(addOrientationSample(history, sample(T - 900 + i * 100, 70)));
    const frozen = history;
    // Six more seconds pointing elsewhere, and the window loses focus.
    for (let i = 1; i <= 60; i += 1)
      history = expectOk(addOrientationSample(history, sample(T + i * 100, 250)));
    history = expectOk(addFrameReset(history, { timeUtcMs: T + 1500, cause: 'blur' }));

    const fix = expectOk(
      positionFixFromReading({ latitudeDeg: 24.5, longitudeDeg: 118.1, accuracyM: 12 }, T, 1),
    );
    const input = (h: SampleHistory): BearingCaptureInput => ({
      id: 'frozen',
      timeUtcMs: T,
      samples: h.samples,
      frameResets: h.frameResets,
      window: { endUtcMs: T, windowLengthMs: 1000, minSampleCount: 10, sampleStalenessMs: 500 },
      yawReference: {
        offsetRad: 0,
        sigmaRad: rad(1),
        northReference: 'true',
        frame: 'relative',
        establishedUtcMs: T - 2000,
      },
      yawReferenceMaxAgeMs: 60_000,
      headingSigmaRad: rad(2),
      positionFix: fix,
      positionStalenessMs: 30_000,
      coarseLocationLimitM: 100,
    });
    const fromFrozen = expectOk(captureBearing(input(frozen)));
    expect(Math.abs(fromFrozen.azimuthRad - rad(70))).toBeLessThanOrEqual(1e-12);
    // The live history has since dropped the samples of that moment (5000 ms retention).
    expect(captureBearing(input(history))).toEqual({ ok: false, reason: 'insufficient_samples' });
  });

  it('refuses the shrunk P-11.8 counterexample, a fix with a NaN accuracy, unchanged (Req 14.4, 11.8)', () => {
    const history = apply(empty(), [(h) => addOrientationSample(h, sample(T))]);
    const before = structuredClone(history);
    const fix: PositionFix = {
      position: { latRad: 0, lonRad: 0 },
      reportedAccuracyM: Number.NaN,
      sigmaM: 1789999900000,
      timeUtcMs: -0.5235987755982989,
    };
    expect(addPositionFix(history, fix)).toEqual({ ok: false, reason: 'invalid_position' });
    expect(history).toEqual(before);
  });

  it('refuses a sample with an invalid field, naming it, and leaves the history unchanged (Req 14.4)', () => {
    const history = apply(empty(), [(h) => addOrientationSample(h, sample(T))]);
    const before = structuredClone(history);
    const good = sample(T + 100);
    const cases: [OrientationSample, string][] = [
      [{ ...good, rotation: { ...good.rotation, alphaRad: Number.NaN } }, 'alphaRad'],
      [{ ...good, rotation: { ...good.rotation, betaRad: Number.POSITIVE_INFINITY } }, 'betaRad'],
      [{ ...good, rotation: { ...good.rotation, gammaRad: Number.NEGATIVE_INFINITY } }, 'gammaRad'],
      [{ ...good, screenAngleRad: Number.POSITIVE_INFINITY }, 'screenAngleRad'],
      [{ ...good, magneticHeadingRad: Number.NaN }, 'magneticHeadingRad'],
      [{ ...good, compassAccuracyRad: Number.NaN }, 'compassAccuracyRad'],
      [
        { ...good, timeUtcMs: Number.NaN, rotation: { ...good.rotation, alphaRad: Number.NaN } },
        'timeUtcMs',
      ],
    ];
    for (const [bad, field] of cases) {
      expect(addOrientationSample(history, bad)).toEqual({
        ok: false,
        reason: 'invalid_number',
        field,
      });
    }
    expect(history).toEqual(before);
    // Null optional fields, a negative compass accuracy and angles outside their usual ranges are valid.
    const accepted = {
      ...good,
      screenAngleRad: null,
      magneticHeadingRad: null,
      compassAccuracyRad: -1,
      rotation: { alphaRad: 20, betaRad: -9, gammaRad: 4 },
    };
    expect(expectOk(addOrientationSample(history, accepted)).samples).toContain(accepted);
  });

  it('refuses an invalid fix, and does not judge Stale or Coarse location (Req 14.4)', () => {
    const history = apply(empty(), [(h) => addOrientationSample(h, sample(T))]);
    const before = structuredClone(history);
    const good = expectOk(
      positionFixFromReading({ latitudeDeg: 24.5, longitudeDeg: 118.1, accuracyM: 12 }, T, 1),
    );
    const invalid: PositionFix[] = [
      { ...good, position: { latRad: rad(89.5), lonRad: 0 } },
      { ...good, position: { latRad: 0, lonRad: -Math.PI } },
      { ...good, reportedAccuracyM: -1 },
      { ...good, reportedAccuracyM: Number.POSITIVE_INFINITY },
      { ...good, sigmaM: Number.NaN },
      { ...good, sigmaM: Number.POSITIVE_INFINITY },
      { ...good, sigmaM: -1 },
    ];
    for (const fix of invalid)
      expect(addPositionFix(history, fix)).toEqual({ ok: false, reason: 'invalid_position' });
    expect(addPositionFix(history, { ...good, timeUtcMs: Number.NaN })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'timeUtcMs',
    });
    expect(history).toEqual(before);
    // A coarse fix and a fix far older than any staleness limit are kept: the history does not judge them.
    const coarse = { ...good, reportedAccuracyM: 2000, sigmaM: 2000 };
    expect(expectOk(addPositionFix(history, coarse)).positionFix).toBe(coarse);
    const old = { ...good, timeUtcMs: T - 3_600_000 };
    expect(expectOk(addPositionFix(history, old)).positionFix).toBe(old);
  });

  it('refuses invalid retentions, naming them (Req 10.3)', () => {
    expect(createSampleHistory({ ...RETENTION, sampleRetentionMs: -1 })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'sampleRetentionMs',
    });
    expect(createSampleHistory({ ...RETENTION, frameResetRetentionMs: Number.NaN })).toEqual({
      ok: false,
      reason: 'invalid_number',
      field: 'frameResetRetentionMs',
    });
  });
});
