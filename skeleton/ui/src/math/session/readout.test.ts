import type { FrameResetEvent, OrientationSample, YawReference } from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { fromDeg } from '../degrees';
import {
  FIXTURE_DECLINATION,
  PARAMETERS,
  T0,
  eventsOfHistory,
  fixtureScript,
  fixtureSession,
  liveSession,
  run,
} from '../../test-support/session-fixtures';
import { buildHistoryFromRun } from '../../test-support/history-from-script';
import { liveReadout, steadiness, withStaleness } from './readout';
import { step } from './step';

const RELATIVE_SCRIPT = fixtureScript({
  frame: { kind: 'relative', zeroRad: 2, resets: [] },
  heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
  pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.1, rollRad: 0 }],
});

function historyOf(script = fixtureScript(), durationMs = 1500) {
  const built = buildHistoryFromRun({
    script,
    seed: 1,
    steps: [{ aim: null, advanceToUtcMs: script.startUtcMs + durationMs }],
  });
  return { history: built.history, endUtcMs: built.endUtcMs };
}

function yaw(over: Partial<YawReference>): YawReference {
  return {
    offsetRad: 0.4,
    sigmaRad: 0.03,
    northReference: 'magnetic',
    frame: 'relative',
    establishedUtcMs: T0 + 1400,
    ...over,
  };
}

function azimuthOf(readout: ReturnType<typeof liveReadout>) {
  if (readout === null || !readout.azimuth.ok) throw new Error('no azimuth');
  return readout.azimuth.value;
}

describe('the North reference of the Live readout (Req 9.2)', () => {
  it('Absolute frame, no Yaw reference: magnetic without a Declination, true with one', () => {
    const { history, endUtcMs } = historyOf();
    const magnetic = azimuthOf(liveReadout(history, null, null, PARAMETERS, endUtcMs));
    expect(magnetic.northReference).toBe('magnetic');
    // The script's azimuth is 1 rad true; the phone reports it less the declination.
    expect(Math.abs(magnetic.azimuthRad - (1 - FIXTURE_DECLINATION.declinationRad))).toBeLessThan(
      1e-9,
    );
    const trueAz = azimuthOf(liveReadout(history, null, FIXTURE_DECLINATION, PARAMETERS, endUtcMs));
    expect(trueAz.northReference).toBe('true');
    expect(Math.abs(trueAz.azimuthRad - 1)).toBeLessThan(1e-9);
  });

  it('Relative frame, no valid Yaw reference: relative, even with a Declination', () => {
    const { history, endUtcMs } = historyOf(RELATIVE_SCRIPT);
    for (const declination of [null, FIXTURE_DECLINATION]) {
      const azimuth = azimuthOf(liveReadout(history, null, declination, PARAMETERS, endUtcMs));
      expect(azimuth.northReference).toBe('relative');
    }
  });

  it('Relative frame with a valid magnetic Yaw reference: magnetic, true with a Declination', () => {
    const { history, endUtcMs } = historyOf(RELATIVE_SCRIPT);
    const y = yaw({ establishedUtcMs: endUtcMs - 500 });
    const magnetic = azimuthOf(liveReadout(history, y, null, PARAMETERS, endUtcMs));
    expect(magnetic.northReference).toBe('magnetic');
    const trueAz = azimuthOf(liveReadout(history, y, FIXTURE_DECLINATION, PARAMETERS, endUtcMs));
    expect(trueAz.northReference).toBe('true');
    expect(
      Math.abs(trueAz.azimuthRad - magnetic.azimuthRad - FIXTURE_DECLINATION.declinationRad),
    ).toBeLessThan(1e-9);
  });

  it('a valid Yaw reference of north reference true gives true without a Declination', () => {
    const { history, endUtcMs } = historyOf(RELATIVE_SCRIPT);
    const y = yaw({ northReference: 'true', offsetRad: 0.2, establishedUtcMs: endUtcMs - 100 });
    const azimuth = azimuthOf(liveReadout(history, y, null, PARAMETERS, endUtcMs));
    expect(azimuth.northReference).toBe('true');
  });

  it('a stale or invalidated Yaw reference does not count', () => {
    const { history, endUtcMs } = historyOf(RELATIVE_SCRIPT);
    const stale = yaw({ establishedUtcMs: endUtcMs - PARAMETERS.yawReferenceMaxAgeMs - 1 });
    expect(
      azimuthOf(liveReadout(history, stale, FIXTURE_DECLINATION, PARAMETERS, endUtcMs))
        .northReference,
    ).toBe('relative');
    // A reset between the reference and the window start (not in the window): the reference is
    // invalidated, the window itself holds no reset.
    const resets: FrameResetEvent[] = [{ timeUtcMs: endUtcMs - 1500, cause: 'hidden' }];
    const withReset = { ...history, frameResets: resets };
    const invalidated = yaw({ establishedUtcMs: endUtcMs - 1800 });
    expect(
      azimuthOf(liveReadout(withReset, invalidated, null, PARAMETERS, endUtcMs)).northReference,
    ).toBe('relative');
  });

  it('a Yaw reference of the other frame does not count (Absolute window, Relative reference)', () => {
    const { history, endUtcMs } = historyOf();
    const azimuth = azimuthOf(
      liveReadout(history, yaw({ frame: 'relative' }), null, PARAMETERS, endUtcMs),
    );
    expect(azimuth.northReference).toBe('magnetic');
  });
});

describe('failures inside the readout are values (Req 9.2, 9.6)', () => {
  it('is null for an empty window', () => {
    const { history, endUtcMs } = historyOf();
    expect(liveReadout(history, null, null, PARAMETERS, endUtcMs + 5000)).toBeNull();
    expect(liveReadout(history, null, null, PARAMETERS, T0 - 5000)).toBeNull();
    expect(liveReadout(fixtureSession('bearing').history, null, null, PARAMETERS, T0)).toBeNull();
  });

  it('a Relative window with a reset in it is frame_reset', () => {
    const { history, endUtcMs } = historyOf(RELATIVE_SCRIPT);
    const resets: FrameResetEvent[] = [{ timeUtcMs: endUtcMs - 400, cause: 'blur' }];
    const readout = liveReadout(
      { ...history, frameResets: resets },
      null,
      null,
      PARAMETERS,
      endUtcMs,
    );
    expect(readout?.azimuth).toEqual({ ok: false, reason: 'frame_reset' });
    expect(readout?.apparentAltitudeRad.ok).toBe(true);
    expect(readout?.steadiness).toBe('unsteady');
  });

  it('an Absolute window is not changed by a page reset', () => {
    const { history, endUtcMs } = historyOf();
    const resets: FrameResetEvent[] = [{ timeUtcMs: endUtcMs - 400, cause: 'blur' }];
    const readout = liveReadout(
      { ...history, frameResets: resets },
      null,
      null,
      PARAMETERS,
      endUtcMs,
    );
    expect(readout?.azimuth.ok).toBe(true);
  });

  it('mixed frames in the window are frame_reset', () => {
    const absolute = historyOf(fixtureScript(), 1500);
    const relative = historyOf(RELATIVE_SCRIPT, 1500);
    const mixed: OrientationSample[] = [
      ...absolute.history.samples.slice(-10, -5),
      ...relative.history.samples.slice(-5),
    ];
    const readout = liveReadout(
      { ...absolute.history, samples: mixed },
      null,
      null,
      PARAMETERS,
      absolute.endUtcMs,
    );
    expect(readout?.azimuth).toEqual({ ok: false, reason: 'frame_reset' });
  });

  it('a camera pointing straight down has no azimuth: axis_vertical', () => {
    const { history, endUtcMs } = historyOf();
    const flat = history.samples.map((s) => ({
      ...s,
      rotation: { alphaRad: 0, betaRad: 0, gammaRad: 0 },
    }));
    const readout = liveReadout({ ...history, samples: flat }, null, null, PARAMETERS, endUtcMs);
    expect(readout?.azimuth).toEqual({ ok: false, reason: 'axis_vertical' });
    expect(
      readout?.apparentAltitudeRad.ok &&
        Math.abs(readout.apparentAltitudeRad.value + Math.PI / 2) < 1e-9,
    ).toBe(true);
  });

  it('shows the apparent altitude with the offset of the altitude calibration (Req 9.3)', () => {
    const { history, endUtcMs } = historyOf();
    const calibrated = {
      ...PARAMETERS,
      altitudeCalibration: { offsetRad: fromDeg(-3.3), sigmaRad: 0.01 },
    };
    const plain = liveReadout(history, null, null, PARAMETERS, endUtcMs);
    const shifted = liveReadout(history, null, null, calibrated, endUtcMs);
    if (!plain?.apparentAltitudeRad.ok || !shifted?.apparentAltitudeRad.ok)
      throw new Error('altitude');
    expect(Math.abs(plain.apparentAltitudeRad.value - 0.2)).toBeLessThan(1e-9);
    expect(
      Math.abs(shifted.apparentAltitudeRad.value - plain.apparentAltitudeRad.value - fromDeg(-3.3)),
    ).toBeLessThan(1e-12);
  });

  it('reports the samples, the newest time and staleness', () => {
    const { history, endUtcMs } = historyOf();
    const fresh = liveReadout(history, null, null, PARAMETERS, endUtcMs);
    expect(fresh?.sampleCount).toBe(21);
    expect(fresh?.newestSampleUtcMs).toBe(endUtcMs);
    expect(fresh?.stale).toBe(false);
    const stale = liveReadout(history, null, null, PARAMETERS, endUtcMs + 600);
    expect(stale?.stale).toBe(true);
    expect(stale?.sampleCount).toBe(fresh === null ? 0 : stale?.sampleCount);
  });
});

describe('steadiness (Req 9.4)', () => {
  const thresholds = { steadyBelowRad: fromDeg(0.5), unsteadyAboveRad: fromDeg(2) };
  it('is steady at or below the lower threshold, unsteady above the upper, settling between', () => {
    expect(steadiness(0, thresholds)).toBe('steady');
    expect(steadiness(thresholds.steadyBelowRad, thresholds)).toBe('steady');
    expect(steadiness(thresholds.steadyBelowRad * 1.0001, thresholds)).toBe('settling');
    expect(steadiness(thresholds.unsteadyAboveRad, thresholds)).toBe('settling');
    expect(steadiness(thresholds.unsteadyAboveRad * 1.0001, thresholds)).toBe('unsteady');
  });
  it('is unsteady with no Spread', () => {
    expect(steadiness(null, thresholds)).toBe('unsteady');
    expect(steadiness(Number.NaN, thresholds)).toBe('unsteady');
  });
});

describe('publication through step (Req 9.5, 9.6)', () => {
  it('publishes at the Readout interval, keeps the previous readout between, and decays to null on tick', () => {
    const { session, endUtcMs } = liveSession('bearing');
    expect(session.readout).not.toBeNull();
    const published = session.lastReadoutUtcMs;
    expect(published).not.toBeNull();
    // A tick less than the interval after the last publication keeps the readout (only `stale`).
    const early = step(
      session,
      { kind: 'tick', timeUtcMs: (published ?? 0) + 50 },
      PARAMETERS,
    ).session;
    expect(early.readout?.timeUtcMs).toBe(published);
    // A tick after the interval republishes at its time.
    const later = step(session, { kind: 'tick', timeUtcMs: endUtcMs + 300 }, PARAMETERS).session;
    expect(later.readout?.timeUtcMs).toBe(endUtcMs + 300);
    // Long after the last sample, the window is empty: the readout is null, not zeros.
    const decayed = step(later, { kind: 'tick', timeUtcMs: endUtcMs + 5000 }, PARAMETERS).session;
    expect(decayed.readout).toBeNull();
    expect(decayed.lastReadoutUtcMs).toBe(endUtcMs + 5000);
  });

  it('updates `stale` on a tick that is not due: not stale at the staleness limit, stale beyond it', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const readout = session.readout;
    if (readout === null) throw new Error('readout');
    expect(readout.stale).toBe(false);
    const limitMs = PARAMETERS.sampleStalenessMs;
    expect(withStaleness(readout, readout.newestSampleUtcMs + limitMs, PARAMETERS).stale).toBe(
      false,
    );
    expect(withStaleness(readout, readout.newestSampleUtcMs + limitMs + 1, PARAMETERS).stale).toBe(
      true,
    );
    // Through `step`: a tick 100 ms after the publication is not due and keeps the readout.
    const tick = step(
      session,
      { kind: 'tick', timeUtcMs: (session.lastReadoutUtcMs ?? endUtcMs) + 100 },
      PARAMETERS,
    ).session;
    expect(tick.readout?.timeUtcMs).toBe(session.readout?.timeUtcMs);
  });

  it('a time that steps back neither republishes nor throws', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const result = step(
      session,
      { kind: 'tick', timeUtcMs: endUtcMs - 10_000 },
      PARAMETERS,
    ).session;
    expect(result.readout).toBe(session.readout);
    expect(result.nowUtcMs).toBe(session.nowUtcMs);
  });

  it('adds every sample to the history whether or not a readout is published', () => {
    const built = buildHistoryFromRun({
      script: fixtureScript(),
      seed: 1,
      steps: [{ aim: null, advanceToUtcMs: T0 + 1000 }],
    });
    const { session, sessions } = run(fixtureSession('altitude'), [
      { kind: 'permissionResult', timeUtcMs: T0, result: { ok: true, value: 'granted' } },
      { kind: 'orientationStarted', timeUtcMs: T0, result: { ok: true, value: 'absolute' } },
      ...eventsOfHistory(built),
    ]);
    expect(session.history.samples).toHaveLength(built.samples.length);
    const published = new Set(sessions.map((s) => s.lastReadoutUtcMs));
    expect(published.size).toBeLessThan(built.samples.length);
  });

  it('does not publish outside live', () => {
    const { session } = liveSession('bearing');
    const frozen = run(session, [{ kind: 'freeze', timeUtcMs: session.nowUtcMs ?? 0 }]).session;
    const after = step(
      frozen,
      { kind: 'tick', timeUtcMs: (frozen.nowUtcMs ?? 0) + 1000 },
      PARAMETERS,
    ).session;
    expect(after.readout).toBe(frozen.readout);
  });
});
