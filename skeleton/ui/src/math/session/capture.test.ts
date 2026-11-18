import {
  captureAltitude,
  captureBearing,
  directionApparentAltitudeRad,
  rayDirection,
} from '@alidade/sensors';
import { describe, expect, it } from 'vitest';
import { pointToRayOffset } from '../image-geometry';
import { imageAngularSigmaRad } from '../ray-uncertainty';
import {
  FIXTURE_CALIBRATION,
  FIXTURE_DECLINATION,
  FIXTURE_LAYOUT,
  PARAMETERS,
  T0,
  fixtureScript,
  liveSession,
  run,
} from '../../test-support/session-fixtures';
import { captureFrozen } from './capture';
import { establishYaw } from './establish-yaw';
import { freeze } from './freeze';
import { makeMark } from './mark';
import { step } from './step';
import type { Session } from './session';

const RELATIVE_SCRIPT = fixtureScript({
  frame: { kind: 'relative', zeroRad: 2, resets: [] },
  heading: { biasRad: 0, noiseSigmaRad: 0, jumps: [], reportedAccuracyDeg: 10 },
  pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.1, rollRad: 0 }],
});

function frozenOf(session: Session, atUtcMs: number): Session {
  const result = step(session, { kind: 'freeze', timeUtcMs: atUtcMs }, PARAMETERS).session;
  if (result.state !== 'frozen') throw new Error(`not frozen: ${result.notice?.reason}`);
  return result;
}

const POINT = { xPx: 260, yPx: 330 };

describe('freeze (Req 10.1, 10.2, 10.3)', () => {
  it('fails with insufficient_samples when the window holds too few, staying live', () => {
    const { session } = liveSession('bearing', fixtureScript(), 300);
    const result = step(
      session,
      { kind: 'freeze', timeUtcMs: session.nowUtcMs ?? 0 },
      PARAMETERS,
    ).session;
    expect(result.state).toBe('live');
    expect(result.notice?.reason).toBe('insufficient_samples');
  });

  it('fails with stale_samples when the newest sample is too old', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const at = endUtcMs + PARAMETERS.sampleStalenessMs + 1;
    expect(freeze(session, PARAMETERS, at)).toEqual({ ok: false, reason: 'stale_samples' });
  });

  it('checks the samples before the Screen angle', () => {
    const { session, endUtcMs } = liveSession(
      'bearing',
      fixtureScript({ screenAngleDeg: 90 }),
      300,
    );
    expect(freeze(session, PARAMETERS, endUtcMs)).toEqual({
      ok: false,
      reason: 'insufficient_samples',
    });
  });

  it('fails with portrait_required at a Screen angle of 90° or null', () => {
    for (const screenAngleDeg of [90, null]) {
      const { session, endUtcMs } = liveSession('bearing', fixtureScript({ screenAngleDeg }));
      expect(freeze(session, PARAMETERS, endUtcMs)).toEqual({
        ok: false,
        reason: 'portrait_required',
      });
    }
  });

  it('keeps the very history, the window, the Yaw reference and the Declination of the moment', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const result = freeze(session, PARAMETERS, endUtcMs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.history).toBe(session.history);
    expect(result.value.window).toEqual({
      endUtcMs,
      windowLengthMs: PARAMETERS.windowLengthMs,
      minSampleCount: PARAMETERS.minSampleCount,
      sampleStalenessMs: PARAMETERS.sampleStalenessMs,
    });
    expect(result.value.declination).toEqual(FIXTURE_DECLINATION);
    expect(result.value.mark).toBeNull();
    expect(result.value.frozenAtUtcMs).toBe(endUtcMs);
  });
});

describe('mark (Req 10.5, 10.6)', () => {
  it('keeps the Mark as the offset and the sigma of the tapped point', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const frozen = frozenOf(session, endUtcMs);
    const marked = step(
      frozen,
      {
        kind: 'mark',
        timeUtcMs: endUtcMs,
        point: POINT,
        layout: FIXTURE_LAYOUT,
        calibration: FIXTURE_CALIBRATION,
        tapSigmaPx: 4,
      },
      PARAMETERS,
    ).session;
    const offset = pointToRayOffset(FIXTURE_LAYOUT, FIXTURE_CALIBRATION, POINT);
    const sigma = imageAngularSigmaRad(FIXTURE_LAYOUT, FIXTURE_CALIBRATION, POINT, 4);
    if (!offset.ok || !sigma.ok) throw new Error('fixture');
    expect(marked.frozen?.mark).toEqual({
      offset: offset.value,
      imageSigmaRad: sigma.value,
      calibration: FIXTURE_CALIBRATION,
    });
    expect(marked.notice).toBeNull();
    // A second mark replaces it; clearMark removes it.
    const second = step(
      marked,
      {
        kind: 'mark',
        timeUtcMs: endUtcMs,
        point: { xPx: 195, yPx: 422 },
        layout: FIXTURE_LAYOUT,
        calibration: FIXTURE_CALIBRATION,
        tapSigmaPx: 4,
      },
      PARAMETERS,
    ).session;
    expect(second.frozen?.mark?.offset).toEqual({ rightRad: 0, upRad: 0 });
    const cleared = step(second, { kind: 'clearMark', timeUtcMs: endUtcMs }, PARAMETERS).session;
    expect(cleared.frozen?.mark).toBeNull();
  });

  it('keeps the earlier Mark on each failure of Req 10.5, with the failure as the Notice', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const marked = step(
      frozenOf(session, endUtcMs),
      {
        kind: 'mark',
        timeUtcMs: endUtcMs,
        point: POINT,
        layout: FIXTURE_LAYOUT,
        calibration: FIXTURE_CALIBRATION,
        tapSigmaPx: 4,
      },
      PARAMETERS,
    ).session;
    const failing: [string, Parameters<typeof makeMark>][] = [
      ['outside_image', [{ xPx: -10, yPx: 10 }, FIXTURE_LAYOUT, FIXTURE_CALIBRATION, 4]],
      ['calibration_missing', [POINT, FIXTURE_LAYOUT, null, 4]],
      [
        'calibration_mismatch',
        [
          POINT,
          FIXTURE_LAYOUT,
          { ...FIXTURE_CALIBRATION, imageWidthSourcePx: 1280, imageHeightSourcePx: 720 },
          4,
        ],
      ],
      ['invalid_number', [{ xPx: Number.NaN, yPx: 1 }, FIXTURE_LAYOUT, FIXTURE_CALIBRATION, 4]],
      ['invalid_number', [POINT, FIXTURE_LAYOUT, FIXTURE_CALIBRATION, -1]],
    ];
    for (const [reason, [point, layout, calibration, tapSigmaPx]] of failing) {
      const result = step(
        marked,
        { kind: 'mark', timeUtcMs: endUtcMs, point, layout, calibration, tapSigmaPx },
        PARAMETERS,
      ).session;
      expect(result.frozen?.mark, reason).toEqual(marked.frozen?.mark);
      expect(result.notice?.reason).toBe(reason);
    }
  });

  it('refuses a point beyond 80° with outside_field_of_view', () => {
    const wide = { ...FIXTURE_CALIBRATION, fovRad: (170 * Math.PI) / 180 };
    expect(makeMark({ xPx: 0, yPx: 0 }, FIXTURE_LAYOUT, wide, 1)).toEqual({
      ok: false,
      reason: 'outside_field_of_view',
    });
  });

  it('leaving frozen drops the Frozen history and the Mark (Req 10.7)', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const marked = step(
      frozenOf(session, endUtcMs),
      {
        kind: 'mark',
        timeUtcMs: endUtcMs,
        point: POINT,
        layout: FIXTURE_LAYOUT,
        calibration: FIXTURE_CALIBRATION,
        tapSigmaPx: 4,
      },
      PARAMETERS,
    ).session;
    for (const leave of [
      { kind: 'unfreeze', timeUtcMs: endUtcMs },
      { kind: 'camera', timeUtcMs: endUtcMs, result: { ok: false, reason: 'camera_busy' } },
      { kind: 'capture', timeUtcMs: endUtcMs },
    ] as const) {
      const result = step(marked, leave, PARAMETERS).session;
      expect(result.state).not.toBe('frozen');
      expect(result.frozen, leave.kind).toBeNull();
    }
  });
});

describe('capture (Req 12)', () => {
  it('equals Sensors deeply with no Mark (Req 12.5), for a bearing and an altitude', () => {
    for (const kind of ['bearing', 'altitude'] as const) {
      const { session, endUtcMs } = liveSession(kind);
      const frozen = frozenOf(session, endUtcMs).frozen;
      if (frozen === null) throw new Error('frozen');
      const ours = captureFrozen(kind, frozen, PARAMETERS);
      if (!ours.ok) throw new Error(ours.reason);
      const fix = frozen.history.positionFix;
      if (kind === 'bearing') {
        if (fix === null || ours.value.kind !== 'bearing') throw new Error('fix');
        const sensors = captureBearing({
          id: `bearing-${endUtcMs}`,
          timeUtcMs: endUtcMs,
          samples: frozen.history.samples,
          frameResets: frozen.history.frameResets,
          window: frozen.window,
          yawReferenceMaxAgeMs: PARAMETERS.yawReferenceMaxAgeMs,
          headingSigmaRad: PARAMETERS.headingSigmaRad,
          declination: FIXTURE_DECLINATION,
          positionFix: fix,
          positionStalenessMs: PARAMETERS.positionStalenessMs,
          coarseLocationLimitM: PARAMETERS.coarseLocationLimitM,
        });
        expect(sensors).toEqual({ ok: true, value: ours.value.bearing });
        // The script's true azimuth is 1 rad; the declination is that of the script.
        expect(Math.abs(ours.value.bearing.azimuthRad - 1)).toBeLessThan(1e-9);
      } else {
        if (ours.value.kind !== 'altitude') throw new Error('kind');
        const sensors = captureAltitude({
          samples: frozen.history.samples,
          window: frozen.window,
          calibration: PARAMETERS.altitudeCalibration,
        });
        expect(sensors).toEqual({ ok: true, value: ours.value.altitude });
      }
      expect(ours.value.mark).toBeNull();
      expect(ours.value.calibration).toBeNull();
      expect(ours.value.sampleCount).toBe(21);
      expect(ours.value.window).toBe(frozen.window);
    }
  });

  it('adds the Mark sigma as hypot(σ, ε / cos h) for a bearing and hypot(σ, ε) for an altitude, by hand', () => {
    for (const kind of ['bearing', 'altitude'] as const) {
      const { session, endUtcMs } = liveSession(kind);
      const marked = step(
        frozenOf(session, endUtcMs),
        {
          kind: 'mark',
          timeUtcMs: endUtcMs,
          point: POINT,
          layout: FIXTURE_LAYOUT,
          calibration: FIXTURE_CALIBRATION,
          tapSigmaPx: 4,
        },
        PARAMETERS,
      ).session;
      const frozen = marked.frozen;
      const mark = frozen?.mark;
      if (frozen == null || mark == null) throw new Error('mark');
      const withMark = captureFrozen(kind, frozen, PARAMETERS);
      const without = captureFrozen(kind, { ...frozen, mark: null }, PARAMETERS);
      if (!withMark.ok || !without.ok) throw new Error('capture');
      const newest = frozen.history.samples[frozen.history.samples.length - 1];
      if (newest === undefined) throw new Error('sample');
      const ray = rayDirection(newest.rotation, mark.offset);
      if (!ray.ok) throw new Error('ray');
      const h = directionApparentAltitudeRad(ray.value);
      if (!h.ok) throw new Error('h');
      if (withMark.value.kind === 'bearing' && without.value.kind === 'bearing') {
        // σ of Sensors with the Mark's offset (the sample spread is 0, so it is the north sigma).
        const sensors = captureBearing({
          id: 'x',
          timeUtcMs: endUtcMs,
          samples: frozen.history.samples,
          frameResets: frozen.history.frameResets,
          window: frozen.window,
          rayOffset: mark.offset,
          yawReferenceMaxAgeMs: PARAMETERS.yawReferenceMaxAgeMs,
          headingSigmaRad: PARAMETERS.headingSigmaRad,
          declination: FIXTURE_DECLINATION,
          positionFix:
            frozen.history.positionFix ??
            (() => {
              throw new Error('fix');
            })(),
          positionStalenessMs: PARAMETERS.positionStalenessMs,
          coarseLocationLimitM: PARAMETERS.coarseLocationLimitM,
        });
        if (!sensors.ok) throw new Error('sensors');
        const expected = Math.hypot(
          sensors.value.azimuthSigmaRad,
          mark.imageSigmaRad / Math.cos(h.value),
        );
        expect(Math.abs(withMark.value.bearing.azimuthSigmaRad - expected)).toBeLessThanOrEqual(
          1e-15,
        );
        expect(withMark.value.bearing.azimuthRad).toBe(sensors.value.azimuthRad);
        expect(withMark.value.mark).toBe(mark);
        expect(withMark.value.calibration).toBe(FIXTURE_CALIBRATION);
      }
      if (withMark.value.kind === 'altitude' && without.value.kind === 'altitude') {
        const sensors = captureAltitude({
          samples: frozen.history.samples,
          window: frozen.window,
          calibration: PARAMETERS.altitudeCalibration,
          rayOffset: mark.offset,
        });
        if (!sensors.ok) throw new Error('sensors');
        expect(withMark.value.altitude.sigmaRad).toBe(
          Math.hypot(sensors.value.sigmaRad, mark.imageSigmaRad),
        );
        expect(withMark.value.altitude.apparentAltitudeRad).toBe(sensors.value.apparentAltitudeRad);
      }
    }
  });

  it('fails with position_unavailable without a fix, and stays frozen', () => {
    const script = fixtureScript({ position: null });
    const { session, endUtcMs } = liveSession('bearing', script);
    const frozen = frozenOf(session, endUtcMs);
    const result = step(frozen, { kind: 'capture', timeUtcMs: endUtcMs }, PARAMETERS).session;
    expect(result.state).toBe('frozen');
    expect(result.notice?.reason).toBe('position_unavailable');
  });

  it("fails with axis_vertical when the Mark's ray is steeper than 80°", () => {
    const script = fixtureScript({
      pose: [{ timeUtcMs: T0, azimuthRad: 1, apparentAltitudeRad: 0.95, rollRad: 0 }],
    });
    const { session, endUtcMs } = liveSession('bearing', script);
    const top = { xPx: 195, yPx: 5 };
    const marked = step(
      frozenOf(session, endUtcMs),
      {
        kind: 'mark',
        timeUtcMs: endUtcMs,
        point: top,
        layout: FIXTURE_LAYOUT,
        calibration: FIXTURE_CALIBRATION,
        tapSigmaPx: 1,
      },
      PARAMETERS,
    ).session;
    expect(marked.frozen?.mark).not.toBeNull();
    const result = step(marked, { kind: 'capture', timeUtcMs: endUtcMs }, PARAMETERS).session;
    expect(result.state).toBe('frozen');
    expect(result.notice?.reason).toBe('axis_vertical');
  });

  it('fails with too_unsteady when the Mark sigma takes the bearing beyond 45°', () => {
    const { session, endUtcMs } = liveSession('bearing');
    const frozen = frozenOf(session, endUtcMs).frozen;
    if (frozen === null) throw new Error('frozen');
    const offset = { rightRad: 0, upRad: 0 };
    const huge = { offset, imageSigmaRad: 1, calibration: FIXTURE_CALIBRATION };
    expect(captureFrozen('bearing', { ...frozen, mark: huge }, PARAMETERS)).toEqual({
      ok: false,
      reason: 'too_unsteady',
    });
  });

  it('passes a failure of Sensors through as a Notice, staying frozen', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const frozen = frozenOf(session, endUtcMs);
    const result = step(frozen, { kind: 'capture', timeUtcMs: endUtcMs }, PARAMETERS).session;
    expect(result.state).toBe('frozen');
    expect(result.notice?.reason).toBe('no_yaw_reference');
  });
});

describe('establishYaw (Req 11.1, 11.5, 11.6, D24)', () => {
  it('from the compass in live; refused in frozen', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const live = step(
      session,
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      PARAMETERS,
    ).session;
    expect(live.yawReference?.frame).toBe('relative');
    expect(live.yawReference?.northReference).toBe('magnetic');
    expect(live.notice).toBeNull();
    const frozen = frozenOf(session, endUtcMs);
    const refused = step(
      frozen,
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      PARAMETERS,
    ).session;
    expect(refused.notice?.reason).toBe('action_not_available');
  });

  it('then captures a bearing with the true azimuth of the script', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const steps = run(session, [
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      { kind: 'freeze', timeUtcMs: endUtcMs },
      { kind: 'capture', timeUtcMs: endUtcMs },
    ]).session;
    expect(steps.state).toBe('captured');
    if (steps.captured?.kind !== 'bearing') throw new Error('bearing');
    expect(Math.abs(steps.captured.bearing.azimuthRad - 1)).toBeLessThan(1e-9);
  });

  it('a Sensors failure is a Notice and the held reference stays', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const established = step(
      session,
      { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
      PARAMETERS,
    ).session;
    const failed = step(
      established,
      { kind: 'establishYaw', timeUtcMs: endUtcMs + 5000, from: { kind: 'compass' } },
      PARAMETERS,
    ).session;
    expect(failed.notice?.reason).toBe('insufficient_samples');
    expect(failed.yawReference).toBe(established.yawReference);
  });

  it('compass_unreliable at a Screen angle of 90° or null (Req 11.6)', () => {
    for (const screenAngleDeg of [90, null]) {
      const { session, endUtcMs } = liveSession('bearing', { ...RELATIVE_SCRIPT, screenAngleDeg });
      const result = step(
        session,
        { kind: 'establishYaw', timeUtcMs: endUtcMs, from: { kind: 'compass' } },
        PARAMETERS,
      ).session;
      expect(result.notice?.reason).toBe('compass_unreliable');
      expect(result.yawReference).toBeNull();
    }
  });

  it('from a known azimuth in live, on the Camera axis', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const result = step(
      session,
      {
        kind: 'establishYaw',
        timeUtcMs: endUtcMs,
        from: { kind: 'knownAzimuth', azimuthRad: 1, sigmaRad: 0.002, northReference: 'true' },
      },
      PARAMETERS,
    ).session;
    expect(result.yawReference?.northReference).toBe('true');
    expect(Math.abs((result.yawReference?.sigmaRad ?? 0) - 0.002)).toBeLessThan(1e-12);
  });

  it('from a known azimuth in frozen, with the Mark: hypot(σ, ε / cos h), replacing only the Yaw reference', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const marked = step(
      frozenOf(session, endUtcMs),
      {
        kind: 'mark',
        timeUtcMs: endUtcMs,
        point: POINT,
        layout: FIXTURE_LAYOUT,
        calibration: FIXTURE_CALIBRATION,
        tapSigmaPx: 4,
      },
      PARAMETERS,
    ).session;
    const frozen = marked.frozen;
    const mark = frozen?.mark;
    if (frozen == null || mark == null) throw new Error('mark');
    const result = step(
      marked,
      {
        kind: 'establishYaw',
        timeUtcMs: endUtcMs + 100,
        from: { kind: 'knownAzimuth', azimuthRad: 2, sigmaRad: 0.002, northReference: 'true' },
      },
      PARAMETERS,
    ).session;
    const newest = frozen.history.samples[frozen.history.samples.length - 1];
    if (newest === undefined) throw new Error('sample');
    const ray = rayDirection(newest.rotation, mark.offset);
    const h = ray.ok ? directionApparentAltitudeRad(ray.value) : ray;
    if (!h.ok) throw new Error('h');
    const expected = Math.hypot(0.002, mark.imageSigmaRad / Math.cos(h.value));
    // Sensors adds the window's Spread (0 here) to the given sigma.
    expect(Math.abs((result.yawReference?.sigmaRad ?? 0) - expected)).toBeLessThan(1e-15);
    expect(result.frozen?.yawReference).toBe(result.yawReference);
    expect(result.frozen?.history).toBe(frozen.history);
    expect(result.frozen?.window).toBe(frozen.window);
    expect(result.frozen?.mark).toBe(mark);
    // The established time is the Frozen window's end, not the event's.
    expect(result.yawReference?.establishedUtcMs).toBe(endUtcMs);
    // And the capture of this very sighting uses it: the marked point's azimuth is now 2.
    const captured = step(
      result,
      { kind: 'capture', timeUtcMs: endUtcMs + 200 },
      PARAMETERS,
    ).session;
    if (captured.captured?.kind !== 'bearing') throw new Error(captured.notice?.reason);
    expect(Math.abs(captured.captured.bearing.azimuthRad - 2)).toBeLessThan(1e-9);
  });

  it('establishYaw in frozen through the function itself refuses the compass', () => {
    const { session, endUtcMs } = liveSession('bearing', RELATIVE_SCRIPT);
    const frozen = frozenOf(session, endUtcMs);
    expect(establishYaw(frozen, frozen.frozen, { kind: 'compass' }, PARAMETERS, endUtcMs)).toEqual({
      ok: false,
      reason: 'action_not_available',
    });
  });
});
